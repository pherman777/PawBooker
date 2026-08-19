#!/usr/bin/env bash
# Builds and deploys the new plain-React groomer dashboard (dashboard/) to
# its own Vercel project, separate from both the paw-booker.com marketing
# site and the older Expo-web groomer dashboard (deploy-groomer-web.sh),
# which stays live and untouched during this transition.
#
# Unlike the Expo case, there's no static export/asset-path dance here -
# Vercel's own build step runs `next build` itself once it sees the
# dashboard/ directory, so we just deploy the source directory directly.
# The local `npm run build` below is only to fail fast on errors before
# spending a deploy.
set -euo pipefail

cd "$(dirname "$0")/../dashboard"

npm run build

npx vercel deploy --prod --yes --project pawbooker-dashboard
