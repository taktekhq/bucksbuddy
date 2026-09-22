#!/bin/bash
# Build BucksBuddy and upload it to TestFlight with an App Store Connect API
# key: no Apple Account sign-in. Xcode creates the certificate, profile and
# bundle id on first run (-allowProvisioningUpdates). Same recipe as
# taktekhq/closet.
#
#   ASC_TEAM_ID=XXXXXXXXXX ./ios/testflight.sh
#   XCODE_APP=/Applications/Xcode.app ./ios/testflight.sh   # pick an Xcode
#
# App Store Connect only accepts builds from released Xcodes (or release
# candidates), not betas: with a beta installed next to the release, point
# XCODE_APP at the released one.
#
# Needs: Xcode; the key at ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8
# (role Admin, or App Manager with access to Certificates, Identifiers &
# Profiles); the app record for io.taktek.bucksbuddy in App Store Connect;
# the Supabase anon key in ios/Config/Secrets.xcconfig, or SUPABASE_ANON_KEY
# in the environment (the script writes the file from it).
# ASC_KEY_ID / ASC_ISSUER_ID / ASC_TEAM_ID can also live in the repo's .env.
set -euo pipefail
cd "$(dirname "$0")"
[ -f ../.env ] && set -a && . ../.env && set +a

: "${ASC_KEY_ID:?set ASC_KEY_ID}" "${ASC_ISSUER_ID:?set ASC_ISSUER_ID}"
: "${ASC_TEAM_ID:?set ASC_TEAM_ID (10 characters: developer.apple.com > Account > Membership details)}"
KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
[ -n "${XCODE_APP:-}" ] && export DEVELOPER_DIR="$XCODE_APP/Contents/Developer"
echo "Building with $(xcode-select -p 2>/dev/null | sed 's|/Contents/Developer||')${DEVELOPER_DIR:+ (XCODE_APP: $XCODE_APP)}:"
xcodebuild -version
case "$(xcodebuild -version | head -1)$(dirname "${DEVELOPER_DIR:-$(xcode-select -p)}")" in
  *[Bb]eta*) echo "This looks like a beta Xcode: App Store Connect will refuse the upload. Set XCODE_APP to the released Xcode."; exit 1 ;;
esac
[ -f "$KEY" ] || { echo "missing $KEY"; exit 1; }

# A build without the anon key launches straight into "no Supabase key":
# refuse to ship one.
if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  printf 'SUPABASE_ANON_KEY = %s\n' "$SUPABASE_ANON_KEY" > Config/Secrets.xcconfig
fi
grep -qE '^SUPABASE_ANON_KEY *= *[^ ]' Config/Secrets.xcconfig 2>/dev/null \
  || { echo "missing the Supabase anon key: set SUPABASE_ANON_KEY or fill ios/Config/Secrets.xcconfig"; exit 1; }

AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY"
      -authenticationKeyID "$ASC_KEY_ID"
      -authenticationKeyIssuerID "$ASC_ISSUER_ID")

rm -rf build
xcodebuild -project BucksBuddy.xcodeproj -scheme BucksBuddy -configuration Release \
  -destination "generic/platform=iOS" -archivePath build/BucksBuddy.xcarchive \
  -skipMacroValidation -skipPackagePluginValidation \
  DEVELOPMENT_TEAM="$ASC_TEAM_ID" BB_BUNDLE_ID=io.taktek.bucksbuddy "${AUTH[@]}" archive

cp ExportOptions.plist build/ExportOptions.plist
/usr/libexec/PlistBuddy -c "Add :teamID string $ASC_TEAM_ID" build/ExportOptions.plist

xcodebuild -exportArchive -archivePath build/BucksBuddy.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export "${AUTH[@]}"

echo "Uploaded. It shows in App Store Connect > TestFlight once Apple finishes processing (5-30 min)."
