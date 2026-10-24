#!/usr/bin/env bash
# Push changes after the first setup.
#   bash update.sh site   -> re-upload the website files
#   bash update.sh api    -> redeploy the Lambda code
#   bash update.sh        -> both
set -euo pipefail
source ./aws-outputs.txt

what="${1:-all}"

if [ "$what" = "site" ] || [ "$what" = "all" ]; then
  aws s3 sync site/ "s3://$BUCKET/" --delete --exclude ".*"
  if [ -n "${DISTRIBUTION_ID:-}" ]; then
    aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" >/dev/null
    echo "CloudFront cache cleared."
  fi
  echo "Site updated: $SITE_URL"
fi

if [ "$what" = "api" ] || [ "$what" = "all" ]; then
  (cd backend && rm -f function.zip && zip -q function.zip index.mjs)
  aws lambda update-function-code --region "$REGION" --function-name "$FUNCTION" \
    --zip-file fileb://backend/function.zip >/dev/null
  echo "API updated: $API_URL"
fi
