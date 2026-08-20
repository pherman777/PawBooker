#!/usr/bin/env bash
# Deploys the marketing site (public/) to a throwaway Vercel preview URL,
# NOT to paw-booker.com. Same project ("pawbooker") as
# deploy-marketing-site.sh, just without --prod, so the live domain is
# never touched. Use this to test changes before running the real deploy
# script.
set -euo pipefail

cd "$(dirname "$0")/../public"

npx vercel deploy --yes --project pawbooker
