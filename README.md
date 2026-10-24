# SJSU Mentor Match — AWS deployment package (v2: submissions also saved to S3)

site/              static website -> public S3 bucket (unchanged from v1)
backend/index.mjs  Lambda: saves to DynamoDB AND a JSON file per submission in a PRIVATE S3 bucket

Already deployed v1?   bash add-s3-storage.sh     (one time; upgrades in place)
Fresh install?         bash setup-aws.sh          (does everything, including the data bucket)
Push changes later:    bash update.sh site | api
Download all data:     bash download-data.sh      (into ./data)
Delete everything:     bash teardown.sh           (keeps the data bucket unless you empty it)

Files land at:
  s3://<data-bucket>/submissions/students/dt=YYYY-MM-DD/<id>.json
  s3://<data-bucket>/submissions/mentors/dt=YYYY-MM-DD/<id>.json
  s3://<data-bucket>/snapshots/snapshot-<date>.json   (full table copy, made by add-s3-storage.sh)

Never commit aws-outputs.txt (admin key) or data/ (personal info).
