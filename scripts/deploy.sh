#!/usr/bin/env bash
# Deploys the app to Cloud Run. Cloud Build builds the Dockerfile remotely,
# so local Docker is not required. Run from the repo root: npm run deploy
set -euo pipefail

PROJECT=chidush-builder
REGION=us-central1
SERVICE=chidush
SERVICE_ACCOUNT="chidush-run@${PROJECT}.iam.gserviceaccount.com"

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$SERVICE_ACCOUNT" \
  --set-secrets "ANTHROPIC_API_KEY=anthropic-api-key:latest" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT},FIRESTORE_DATABASE_ID=chidush-builder-db" \
  --allow-unauthenticated \
  --max-instances 3 \
  --timeout 600 \
  --concurrency 20 \
  --quiet

echo
echo "Deployed. URL:"
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)'
