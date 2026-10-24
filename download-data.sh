#!/usr/bin/env bash
# Download every saved submission (and snapshots) from the private data bucket
# into ./data on your computer. Re-run any time; it only fetches new files.
set -euo pipefail
source ./aws-outputs.txt
[ -n "${DATA_BUCKET:-}" ] || { echo "No DATA_BUCKET in aws-outputs.txt. Run add-s3-storage.sh first."; exit 1; }

aws s3 sync "s3://$DATA_BUCKET/submissions" ./data/submissions
aws s3 sync "s3://$DATA_BUCKET/snapshots" ./data/snapshots

echo
echo "Students: $(find ./data/submissions/students -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
echo "Mentors:  $(find ./data/submissions/mentors -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
echo "Files are in ./data (contains personal info, keep it private)."
