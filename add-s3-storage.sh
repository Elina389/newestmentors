#!/usr/bin/env bash
# Upgrade an EXISTING Mentor Match deployment so every submission is also
# saved as a JSON file in a new PRIVATE S3 bucket.
#
# Run once from the mentor-match folder:   bash add-s3-storage.sh
# Safe to re-run: it skips anything already done.
#
# Needs aws-outputs.txt from setup-aws.sh (REGION, BUCKET, TABLE, FUNCTION).
set -euo pipefail

[ -f aws-outputs.txt ] || { echo "aws-outputs.txt not found. Run this from the folder where you ran setup-aws.sh."; exit 1; }
source ./aws-outputs.txt
ROLE="mentor-match-lambda-role"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Private bucket name: unique per account + region, never the website bucket
DATA_BUCKET="${DATA_BUCKET:-mentor-match-data-$ACCOUNT_ID-$REGION}"
if [ "$DATA_BUCKET" = "$BUCKET" ]; then
  echo "DATA_BUCKET must not be the public website bucket. Stopping."; exit 1
fi
echo "Website bucket (public):  $BUCKET"
echo "Data bucket (private):    $DATA_BUCKET"

echo "== 1/6 Private data bucket =="
if aws s3api head-bucket --bucket "$DATA_BUCKET" 2>/dev/null; then
  echo "Bucket already exists, keeping it."
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$DATA_BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$DATA_BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
fi
# Lock it down explicitly (new buckets already default to this)
aws s3api put-public-access-block --bucket "$DATA_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$DATA_BUCKET" \
  --versioning-configuration Status=Enabled
echo "Private, versioned, encrypted by default."

echo "== 2/6 Let the Lambda write to it (PutObject only, submissions/ only) =="
aws iam put-role-policy --role-name "$ROLE" --policy-name MentorMatchS3Write \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:PutObject\",\"Resource\":\"arn:aws:s3:::$DATA_BUCKET/submissions/*\"}]}"

echo "== 3/6 Deploy the new Lambda code =="
(cd backend && rm -f function.zip && zip -q function.zip index.mjs)
aws lambda update-function-code --region "$REGION" --function-name "$FUNCTION" \
  --zip-file fileb://backend/function.zip >/dev/null
aws lambda wait function-updated-v2 --region "$REGION" --function-name "$FUNCTION"

echo "== 4/6 Add DATA_BUCKET, keeping the existing variables =="
# --environment REPLACES all variables, so read the current ones first
CUR_TABLE=$(aws lambda get-function-configuration --region "$REGION" --function-name "$FUNCTION" \
  --query 'Environment.Variables.TABLE_NAME' --output text)
CUR_KEY=$(aws lambda get-function-configuration --region "$REGION" --function-name "$FUNCTION" \
  --query 'Environment.Variables.ADMIN_KEY' --output text)
if [ -z "$CUR_TABLE" ] || [ "$CUR_TABLE" = "None" ] || [ -z "$CUR_KEY" ] || [ "$CUR_KEY" = "None" ]; then
  echo "Couldn't read TABLE_NAME / ADMIN_KEY from the function. Add DATA_BUCKET=$DATA_BUCKET in the console instead."; exit 1
fi
aws lambda update-function-configuration --region "$REGION" --function-name "$FUNCTION" \
  --environment "Variables={TABLE_NAME=$CUR_TABLE,ADMIN_KEY=$CUR_KEY,DATA_BUCKET=$DATA_BUCKET}" >/dev/null
aws lambda wait function-updated-v2 --region "$REGION" --function-name "$FUNCTION"

echo "== 5/6 DynamoDB point-in-time recovery (35-day undo) =="
aws dynamodb update-continuous-backups --region "$REGION" --table-name "$TABLE" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null

echo "== 6/6 Snapshot of everything submitted so far =="
SNAP="snapshot-$(date +%Y-%m-%d-%H%M).json"
aws dynamodb scan --region "$REGION" --table-name "$TABLE" --output json > "/tmp/$SNAP"
aws s3 cp "/tmp/$SNAP" "s3://$DATA_BUCKET/snapshots/$SNAP" >/dev/null
rm -f "/tmp/$SNAP"
echo "Saved s3://$DATA_BUCKET/snapshots/$SNAP"

grep -q '^DATA_BUCKET=' aws-outputs.txt || echo "DATA_BUCKET=$DATA_BUCKET" >> aws-outputs.txt

echo
echo "Done. New submissions now also land in:"
echo "  s3://$DATA_BUCKET/submissions/students/dt=YYYY-MM-DD/<id>.json"
echo "  s3://$DATA_BUCKET/submissions/mentors/dt=YYYY-MM-DD/<id>.json"
echo
echo "Test: submit a survey on your site, then run"
echo "  aws s3 ls s3://$DATA_BUCKET/submissions/ --recursive"
