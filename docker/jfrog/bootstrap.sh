#!/bin/sh
set -eu

ARTIF_URL="${ARTIFACTORY_URL:-http://localhost:8082}"
ARTIF_USER="${ARTIFACTORY_USER:-admin}"
ARTIF_PASS="${ARTIFACTORY_PASSWORD:-password}"
REPO_KEY="skills-registry"

echo "==> Waiting for Artifactory API..."
until curl -sf -u "$ARTIF_USER:$ARTIF_PASS" \
    "$ARTIF_URL/artifactory/api/system/ping" > /dev/null 2>&1; do
  echo "    ...not ready yet, retrying in 5s"
  sleep 5
done
echo "==> Artifactory is ready."

# Create the skills-registry repository if it doesn't exist.
# Note: the per-repo REST API (PUT /api/repositories/{key}) requires Artifactory Pro.
# The system config PATCH endpoint works in OSS and is idempotent.
REPOS=$(curl -s -u "$ARTIF_USER:$ARTIF_PASS" "$ARTIF_URL/artifactory/api/repositories")
if echo "$REPOS" | grep -q "\"$REPO_KEY\""; then
  echo "==> Repository $REPO_KEY already exists, skipping."
else
  echo "==> Creating repository: $REPO_KEY"
  curl -sf -X PATCH \
    -u "$ARTIF_USER:$ARTIF_PASS" \
    -H "Content-Type: application/yaml" \
    --data-binary "localRepositories:
  $REPO_KEY:
    type: localRepoConfig
    repoLayoutRef: simple-default
    description: Enterprise AI Skills Registry" \
    "$ARTIF_URL/artifactory/api/system/configuration" > /dev/null
  echo "==> Repository created."
fi

# Upload text-summarizer skill if not already present
SKILL_PATH="skills/text-summarizer/1.0.0/skill.md"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -u "$ARTIF_USER:$ARTIF_PASS" \
  "$ARTIF_URL/artifactory/api/storage/$REPO_KEY/$SKILL_PATH")

if [ "$HTTP_CODE" = "404" ]; then
  echo "==> Uploading text-summarizer v1.0.0..."
  curl -sf -X PUT \
    -u "$ARTIF_USER:$ARTIF_PASS" \
    -H "Content-Type: text/markdown" \
    -T /skills/text-summarizer/SKILL.md \
    "$ARTIF_URL/artifactory/$REPO_KEY/$SKILL_PATH"
  echo ""
  echo "==> text-summarizer uploaded."
else
  echo "==> text-summarizer already present, skipping."
fi

echo "==> Bootstrap complete."
