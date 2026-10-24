#!/usr/bin/env bash
# One-time setup: S3 website + DynamoDB + Lambda Function URL.
# Run from the mentor-match folder:   bash setup-aws.sh
# Needs: AWS CLI v2, configured with `aws configure` (or `aws configure sso`).
set -euo pipefail

# ---------- EDIT THESE ----------
REGION="us-west-2"
BUCKET="sjsu-mentor-match-$(whoami | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')-$RANDOM"   # must be globally unique, lowercase
TABLE="MentorMatch"
FUNCTION="mentor-match-api"
ROLE="mentor-match-lambda-role"
# --------------------------------

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ADMIN_KEY=$(openssl rand -hex 24)
echo "Account: $ACCOUNT_ID   Region: $REGION   Bucket: $BUCKET"

echo "== 1/6 S3 bucket + static website hosting =="
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
fi
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3 website "s3://$BUCKET/" --index-document index.html --error-document error.html
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadForWebsite",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*"
  }]
}
EOF
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/bucket-policy.json

echo "== 2/6 DynamoDB table =="
aws dynamodb create-table --region "$REGION" --table-name "$TABLE" \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST >/dev/null
aws dynamodb wait table-exists --region "$REGION" --table-name "$TABLE"

echo "== 3/6 IAM role for Lambda =="
cat > /tmp/trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF
aws iam create-role --role-name "$ROLE" --assume-role-policy-document file:///tmp/trust.json >/dev/null
aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
cat > /tmp/ddb-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:PutItem", "dynamodb:Query"],
    "Resource": "arn:aws:dynamodb:$REGION:$ACCOUNT_ID:table/$TABLE"
  }]
}
EOF
aws iam put-role-policy --role-name "$ROLE" --policy-name MentorMatchTableAccess \
  --policy-document file:///tmp/ddb-policy.json
echo "Waiting 15s for the new role to propagate..."
sleep 15

echo "== 4/6 Lambda function =="
(cd backend && rm -f function.zip && zip -q function.zip index.mjs)
aws lambda create-function --region "$REGION" --function-name "$FUNCTION" \
  --runtime nodejs22.x --handler index.handler \
  --role "arn:aws:iam::$ACCOUNT_ID:role/$ROLE" \
  --zip-file fileb://backend/function.zip \
  --timeout 10 --memory-size 256 \
  --environment "Variables={TABLE_NAME=$TABLE,ADMIN_KEY=$ADMIN_KEY}" >/dev/null
aws lambda wait function-active-v2 --region "$REGION" --function-name "$FUNCTION"
# Cap concurrency so a flood of requests can't run up a bill
aws lambda put-function-concurrency --region "$REGION" --function-name "$FUNCTION" \
  --reserved-concurrent-executions 5 >/dev/null || echo "(skipped concurrency cap - account limit too low; fine for a demo)"

echo "== 5/6 Function URL + CORS =="
SITE_ORIGIN="http://$BUCKET.s3-website-$REGION.amazonaws.com"
aws lambda create-function-url-config --region "$REGION" --function-name "$FUNCTION" \
  --auth-type NONE \
  --cors "{\"AllowOrigins\":[\"$SITE_ORIGIN\"],\"AllowMethods\":[\"GET\",\"POST\"],\"AllowHeaders\":[\"content-type\",\"x-admin-key\"],\"MaxAge\":300}" >/dev/null
aws lambda add-permission --region "$REGION" --function-name "$FUNCTION" \
  --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl \
  --principal "*" --function-url-auth-type NONE >/dev/null
aws lambda add-permission --region "$REGION" --function-name "$FUNCTION" \
  --statement-id FunctionURLInvokeAllowPublicAccess --action lambda:InvokeFunction \
  --principal "*" --invoked-via-function-url >/dev/null
API_URL=$(aws lambda get-function-url-config --region "$REGION" --function-name "$FUNCTION" \
  --query FunctionUrl --output text | sed 's:/*$::')

echo "== 6/6 Upload site =="
sed -i.bak "s#API_URL: \".*\"#API_URL: \"$API_URL\"#" site/config.js && rm -f site/config.js.bak
aws s3 sync site/ "s3://$BUCKET/" --delete --exclude ".*"

cat > aws-outputs.txt <<EOF
REGION=$REGION
BUCKET=$BUCKET
TABLE=$TABLE
FUNCTION=$FUNCTION
API_URL=$API_URL
SITE_URL=$SITE_ORIGIN
ADMIN_URL=$SITE_ORIGIN/admin.html
ADMIN_KEY=$ADMIN_KEY
EOF

echo "== Private data bucket for submission files =="
bash ./add-s3-storage.sh

echo
echo "Done."
echo "Site:       $SITE_ORIGIN"
echo "Admin page: $SITE_ORIGIN/admin.html"
echo "API:        $API_URL"
echo "Admin key:  $ADMIN_KEY"
echo "(All saved to aws-outputs.txt - keep it private, never commit it.)"
