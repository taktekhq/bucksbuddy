#!/usr/bin/env bash
# Tunnelled Expo dev server for phone review.
#   MODE=prod (default): production JS (--no-dev --minify) — what the app will
#                        actually feel like. No Fast Refresh; reload to see edits.
#   MODE=dev:            dev JS with Fast Refresh, for debugging red screens.
# EXPO_NO_METRO_LAZY=1 bundles everything up front instead of fetching each
# screen over the tunnel the first time it's opened (the "ages to open" lag).
cd /home/nizar/work/taktekhq/bucksbuddy/mobile
export EXPO_NO_TELEMETRY=1 EXPO_NO_METRO_LAZY=1
MODE="${MODE:-prod}"
if [ "$MODE" = "prod" ]; then FLAGS="--no-dev --minify"; else FLAGS=""; fi
exec npx expo start --tunnel --port 8081 ${CLEAR:+--clear} $FLAGS < /dev/null > /home/nizar/work/taktekhq/bucksbuddy/mobile/.expo/tunnel.log 2>&1
