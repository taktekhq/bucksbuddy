#!/usr/bin/env bash
# Tunnelled Expo dev server for phone review.
#   MODE=prod (default): production JS (--no-dev --minify) — what the app will
#                        actually feel like. No Fast Refresh; reload to see edits.
#   MODE=dev:            dev JS with Fast Refresh, for debugging red screens.
#   CLEAR=1:             also wipe Metro's cache (needed after changing
#                        tailwind.config.js, global.css, babel or metro config).
# EXPO_NO_METRO_LAZY=1 bundles everything up front instead of fetching each
# screen over the tunnel the first time it is opened (the "takes ages" lag).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .expo
export EXPO_NO_TELEMETRY=1 EXPO_NO_METRO_LAZY=1
MODE="${MODE:-prod}"
# `set -e` would abort on a `[ … ] && …` line that tests false, so these are
# written as full ifs.
FLAGS=()
if [ "$MODE" = "prod" ]; then FLAGS+=(--no-dev --minify); fi
if [ -n "${CLEAR:-}" ]; then FLAGS+=(--clear); fi
exec npx expo start --tunnel --port 8081 "${FLAGS[@]}" < /dev/null > .expo/tunnel.log 2>&1
