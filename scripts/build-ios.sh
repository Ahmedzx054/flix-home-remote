#!/usr/bin/env bash
set -euo pipefail
# Run on a local or hosted Mac. Never uploads to App Store Connect.
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then echo 'iOS compilation requires macOS and Xcode.' >&2; exit 1; fi
mode="${1:-simulator}"
if [[ "$mode" != simulator && "$mode" != unsigned && "$mode" != archive ]]; then echo 'Usage: bash scripts/build-ios.sh [simulator|unsigned|archive]' >&2; exit 1; fi
swift_version="$(xcrun swift --version)"
if [[ ! "$swift_version" =~ version\ ([0-9]+)\.([0-9]+) ]] || (( BASH_REMATCH[1] < 6 || BASH_REMATCH[1] == 6 && BASH_REMATCH[2] < 4 )); then
  echo 'The pinned ADBCore package requires Xcode with Swift 6.4 or newer.' >&2; exit 1
fi
command -v go >/dev/null
npm ci
npm run build
npx cap sync ios
mkdir -p releases
if [[ "$mode" == simulator ]]; then
  xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' -derivedDataPath releases/ios-derived CODE_SIGNING_ALLOWED=NO build
  printf '%s\n' '{"compiledWithXcode":true,"simulator":true,"signedIPA":false,"physicalPhone":false}' > releases/ios-build.json
elif [[ "$mode" == unsigned ]]; then
  # No Apple identity is used here. The IPA still requires user signing before installation.
  # No restricted multicast entitlement is requested in this path; Bonjour/manual IPv4 remain available.
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -derivedDataPath releases/ios-unsigned CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= CODE_SIGN_ENTITLEMENTS= build
  python3 scripts/package-ios-unsigned.py releases/ios-unsigned/Build/Products/Release-iphoneos/App.app releases/HomeRemote-unsigned.ipa
else
  : "${FLIX_APPLE_TEAM:?Set FLIX_APPLE_TEAM to your Apple development team identifier}"
  # The matching signing identity and provisioning profile must already be installed.
  xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS' -archivePath releases/HomeRemote.xcarchive "DEVELOPMENT_TEAM=$FLIX_APPLE_TEAM" archive
  codesign --verify --deep --strict releases/HomeRemote.xcarchive/Products/Applications/App.app
  printf '%s\n' '{"compiledWithXcode":true,"signedArchive":true,"signedIPA":false,"physicalPhone":false}' > releases/ios-build.json
  if [[ -n "${FLIX_IOS_EXPORT_OPTIONS:-}" ]]; then
    xcodebuild -exportArchive -archivePath releases/HomeRemote.xcarchive -exportOptionsPlist "$FLIX_IOS_EXPORT_OPTIONS" -exportPath releases/ios-export
    test -n "$(find releases/ios-export -maxdepth 1 -name '*.ipa' -print -quit)"
    printf '%s\n' '{"compiledWithXcode":true,"signedArchive":true,"signedIPA":true,"physicalPhone":false}' > releases/ios-build.json
  fi
fi
