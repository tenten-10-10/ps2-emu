#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$project_root/Resources/Info.plist")"
target_arch="${PS2_TARGET_ARCH:-arm64}"
expected_name="PS2-Emu-${version}-launcher-macOS-${target_arch}.dmg"
dmg_path="${1:-$project_root/dist/$expected_name}"
bundle_play="${PS2_BUNDLE_PLAY:-}"
require_notarized="${REQUIRE_NOTARIZED:-0}"

if [[ "$bundle_play" != "0" ]]; then
  print -u2 "Release-DMG verification requires explicit PS2_BUNDLE_PLAY=0."
  exit 64
fi
case "$target_arch" in
  arm64 | x86_64) ;;
  *)
    print -u2 "PS2_TARGET_ARCH must be arm64 or x86_64."
    exit 64
    ;;
esac
if [[ -z "${EXPECTED_OUTER_TEAM_ID:-}" ]]; then
  print -u2 "EXPECTED_OUTER_TEAM_ID is required for release-DMG verification."
  exit 64
fi
case "$require_notarized" in
  0 | 1) ;;
  *)
    print -u2 "REQUIRE_NOTARIZED must be 0 or 1."
    exit 64
    ;;
esac
if [[ ! -f "$dmg_path" ]]; then
  print -u2 "DMG not found: $dmg_path"
  exit 66
fi
if [[ "${dmg_path:t}" != "$expected_name" ]]; then
  print -u2 "Unexpected public DMG filename: ${dmg_path:t}; expected $expected_name"
  exit 74
fi

/usr/bin/hdiutil verify "$dmg_path" >/dev/null
/usr/bin/codesign --verify --strict --verbose=2 "$dmg_path"
dmg_signature="$(/usr/bin/codesign -d --verbose=4 "$dmg_path" 2>&1)"
dmg_team="$(print -r -- "$dmg_signature" | /usr/bin/awk -F= '/^TeamIdentifier=/{print $2; exit}')"
if [[ "$dmg_team" != "$EXPECTED_OUTER_TEAM_ID" ]]; then
  print -u2 "Unexpected DMG signing team: ${dmg_team:-missing}"
  exit 77
fi

inspection_root="$(mktemp -d "${TMPDIR:-/tmp}/ps2-emulator-release-dmg.XXXXXX")"
mount_point="$inspection_root/mount"
attached=0
cleanup() {
  if (( attached == 1 )); then
    if /usr/bin/hdiutil detach "$mount_point" >/dev/null 2>&1; then
      attached=0
    fi
  fi
  if (( attached == 0 )) && \
      [[ -d "$inspection_root" && "$inspection_root" == *ps2-emulator-release-dmg.* ]]; then
    /bin/rm -R "$inspection_root"
  fi
}
trap cleanup EXIT
mkdir -p "$mount_point"
/usr/bin/hdiutil attach -readonly -nobrowse -mountpoint "$mount_point" "$dmg_path" >/dev/null
attached=1

app_path="$mount_point/PS2 Emu.app"
if [[ ! -d "$app_path" ]]; then
  print -u2 "Expected app is missing from the DMG."
  exit 74
fi
app_count="$(/usr/bin/find "$mount_point" -type d -name '*.app' -print | /usr/bin/wc -l | /usr/bin/tr -d ' ')"
if [[ "$app_count" != "1" ]]; then
  print -u2 "Public DMG must contain exactly one app bundle; found $app_count."
  exit 74
fi
if [[ ! -L "$mount_point/Applications" || "$(/usr/bin/readlink "$mount_point/Applications")" != "/Applications" ]]; then
  print -u2 "Applications link is missing or unexpected."
  exit 74
fi
for required_document in \
  "$mount_point/Licenses and Notices/PRIVACY.md" \
  "$mount_point/Licenses and Notices/SECURITY.md" \
  "$mount_point/Licenses and Notices/PS2SDK-AFL-2.0.txt" \
  "$mount_point/Licenses and Notices/PS2SDK-CUBE-NOTICE.md" \
  "$mount_point/Licenses and Notices/NEWLIB-COPYING.txt" \
  "$mount_point/Licenses and Notices/GCC-COPYING.RUNTIME.txt" \
  "$mount_point/Licenses and Notices/GCC-COPYING3.txt" \
  "$mount_point/Licenses and Notices/PS2SDK-Cube-Source/cube.c" \
  "$mount_point/Licenses and Notices/PS2SDK-Cube-Source/mesh_data.c" \
  "$mount_point/Licenses and Notices/PS2SDK-Cube-Source/Makefile" \
  "$mount_point/Licenses and Notices/PS2-Emu-License.txt"; do
  if [[ ! -f "$required_document" ]]; then
    print -u2 "Required public document is missing: $required_document"
    exit 74
  fi
done
for license_name in \
  PS2SDK-AFL-2.0.txt \
  PS2SDK-CUBE-NOTICE.md \
  NEWLIB-COPYING.txt \
  GCC-COPYING.RUNTIME.txt \
  GCC-COPYING3.txt; do
  if ! /usr/bin/cmp -s \
    "$project_root/Resources/Fixtures/$license_name" \
    "$mount_point/Licenses and Notices/$license_name"; then
    print -u2 "Bundled homebrew notice differs from the reviewed source: $license_name"
    exit 74
  fi
done
for source_name in cube.c mesh_data.c Makefile; do
  if ! /usr/bin/cmp -s \
    "$project_root/Resources/Fixtures/source/$source_name" \
    "$mount_point/Licenses and Notices/PS2SDK-Cube-Source/$source_name"; then
    print -u2 "Bundled Cube Demo source differs from the reviewed source: $source_name"
    exit 74
  fi
done
PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH="$target_arch" REQUIRE_RELEASE_SIGNATURE=1 \
  EXPECTED_OUTER_TEAM_ID="$EXPECTED_OUTER_TEAM_ID" \
  "$script_dir/verify-app.sh" "$app_path" >/dev/null

if (( require_notarized == 1 )); then
  /usr/bin/xcrun stapler validate "$dmg_path" >/dev/null
  /usr/sbin/spctl -a -t open --context context:primary-signature -vv "$dmg_path" >/dev/null
fi

/usr/bin/hdiutil detach "$mount_point" >/dev/null
attached=0
print "Verified public external-core DMG: $dmg_path"
print "Developer ID TeamIdentifier: $dmg_team"
print "Target architecture: $target_arch"
if (( require_notarized == 1 )); then
  print "Notarization and Gatekeeper: accepted"
fi
