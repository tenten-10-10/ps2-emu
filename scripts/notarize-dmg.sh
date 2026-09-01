#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
app_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$project_root/Resources/Info.plist")"
bundle_play="${PS2_BUNDLE_PLAY:-}"
target_arch="${PS2_TARGET_ARCH:-arm64}"

case "$target_arch" in
  arm64 | x86_64) ;;
  *)
    print -u2 "PS2_TARGET_ARCH must be arm64 or x86_64."
    exit 64
    ;;
esac

case "$bundle_play" in
  0)
    default_dmg="$project_root/dist/PS2-Emu-${app_version}-launcher-macOS-${target_arch}.dmg"
    ;;
  *)
    print -u2 "Notarization requires explicit PS2_BUNDLE_PLAY=0. The bundled-core lane is local-only."
    exit 64
    ;;
esac
dmg_path="${1:-$default_dmg}"
profile="${NOTARYTOOL_PROFILE:-}"
evidence_dir="${NOTARY_EVIDENCE_DIR:-${dmg_path:h}/notary-evidence/$app_version/$target_arch}"
submission_json="$evidence_dir/notary-submit.json"
notary_log="$evidence_dir/notary-log.json"

if [[ -z "$profile" ]]; then
  print -u2 "Set NOTARYTOOL_PROFILE to an existing notarytool keychain profile."
  exit 64
fi

if [[ -z "${EXPECTED_OUTER_TEAM_ID:-}" ]]; then
  print -u2 "Set EXPECTED_OUTER_TEAM_ID to the exact owner-approved Developer ID team."
  exit 64
fi

source_commit="$($script_dir/verify-release-source.sh)"
export SOURCE_REVISION="$source_commit"

if [[ ! -f "$dmg_path" ]]; then
  print -u2 "DMG not found: $dmg_path"
  exit 66
fi

PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH="$target_arch" REQUIRE_NOTARIZED=0 \
  "$script_dir/verify-release-dmg.sh" "$dmg_path"
mkdir -p "$evidence_dir"

# Authentication material must already be stored in the named keychain profile.
# This script never accepts or prints an Apple ID password, API private key, or
# app-specific password.
/usr/bin/xcrun notarytool submit "$dmg_path" \
  --keychain-profile "$profile" \
  --wait \
  --timeout "${NOTARY_WAIT_TIMEOUT:-60m}" \
  --output-format json > "$submission_json"

/usr/bin/plutil -lint "$submission_json" >/dev/null
submission_id="$(/usr/bin/plutil -extract id raw -o - "$submission_json")"
submission_status="$(/usr/bin/plutil -extract status raw -o - "$submission_json")"

/usr/bin/xcrun notarytool log "$submission_id" "$notary_log" \
  --keychain-profile "$profile"

if [[ "$submission_status" != "Accepted" ]]; then
  print -u2 "Notarization was not accepted. Status: $submission_status"
  print -u2 "Submission: $submission_id"
  print -u2 "Log: $notary_log"
  exit 77
fi

/usr/bin/xcrun stapler staple "$dmg_path"
PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH="$target_arch" REQUIRE_NOTARIZED=1 \
  "$script_dir/verify-release-dmg.sh" "$dmg_path"
/usr/bin/shasum -a 256 "$dmg_path" > "$evidence_dir/dmg.sha256"

print "Notarized and stapled: $dmg_path"
print "Submission: $submission_id"
print "Evidence: $evidence_dir"
print "Target architecture: $target_arch"
