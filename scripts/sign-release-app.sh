#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
app_path="${1:-$project_root/dist/PS2 Emu.app}"
identity="${DEVELOPER_ID_APPLICATION:-}"
bundle_play="${PS2_BUNDLE_PLAY:-1}"
target_arch="${PS2_TARGET_ARCH:-arm64}"

case "$bundle_play" in
  0 | 1) ;;
  *)
    print -u2 "PS2_BUNDLE_PLAY must be 0 (external core) or 1 (bundled local MVP)."
    exit 64
    ;;
esac

case "$target_arch" in
  arm64 | x86_64) ;;
  *)
    print -u2 "PS2_TARGET_ARCH must be arm64 or x86_64."
    exit 64
    ;;
esac

if [[ "$bundle_play" != "0" ]]; then
  print -u2 "Release signing is restricted to PS2_BUNDLE_PLAY=0. The bundled-core lane is local-only."
  exit 78
fi

if [[ -z "$identity" ]]; then
  print -u2 "Set DEVELOPER_ID_APPLICATION to the exact Developer ID Application identity."
  exit 64
fi

if [[ -z "${EXPECTED_OUTER_TEAM_ID:-}" ]]; then
  print -u2 "Set EXPECTED_OUTER_TEAM_ID to the exact owner-approved Developer ID team."
  exit 64
fi

source_commit="$($script_dir/verify-release-source.sh)"
export SOURCE_REVISION="$source_commit"

if [[ ! -d "$app_path" || ! -x "$app_path/Contents/MacOS/PS2Emulator" ]]; then
  print -u2 "App bundle not found or incomplete: $app_path"
  exit 66
fi

mode_marker="$(/usr/libexec/PlistBuddy -c 'Print :PS2BundledPlayCore' "$app_path/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$mode_marker" != "false" ]]; then
  print -u2 "App distribution marker is not external-core: $mode_marker"
  exit 74
fi
PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH="$target_arch" \
  "$script_dir/verify-app.sh" "$app_path" >/dev/null
embedded_revision="$(/usr/libexec/PlistBuddy -c 'Print :PS2SourceRevision' "$app_path/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$embedded_revision" != "$source_commit" ]]; then
  print -u2 "Unsigned app is not bound to the reviewed source commit: expected $source_commit, found ${embedded_revision:-missing}"
  exit 74
fi

# Sign only the outer bundle. Do not use --deep: the upstream Play! bundle must
# retain its own Developer ID signature and exact code directory hash.
/usr/bin/codesign \
  --force \
  --sign "$identity" \
  --timestamp \
  --options runtime \
  "$app_path"

PS2_BUNDLE_PLAY=0 \
PS2_TARGET_ARCH="$target_arch" \
REQUIRE_RELEASE_SIGNATURE=1 \
EXPECTED_OUTER_TEAM_ID="$EXPECTED_OUTER_TEAM_ID" \
"$script_dir/verify-app.sh" "$app_path" >/dev/null

outer_signature="$(/usr/bin/codesign -d --verbose=4 "$app_path" 2>&1)"
outer_team="$(print -r -- "$outer_signature" | /usr/bin/awk -F= '/^TeamIdentifier=/{print $2; exit}')"

print "Developer ID signed outer app: $app_path"
print "Outer TeamIdentifier: $outer_team"
print "Distribution mode preserved: external Play! core (Play.app absent)"
print "Target architecture preserved: $target_arch"
