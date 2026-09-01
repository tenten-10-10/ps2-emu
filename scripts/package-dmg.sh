#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
default_output="$project_root/dist"
output_root="${1:-$default_output}"
bundle_play="${PS2_BUNDLE_PLAY:-}"
target_arch="${PS2_TARGET_ARCH:-arm64}"
app_path="$output_root/PS2 Emu.app"
app_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$project_root/Resources/Info.plist")"

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

if [[ "$bundle_play" == "1" && "${PS2_ALLOW_LOCAL_BUNDLED_DMG:-}" != "1" ]]; then
  print -u2 "Bundled local DMG creation requires PS2_ALLOW_LOCAL_BUNDLED_DMG=1. It must never be distributed."
  exit 78
fi

if [[ -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  source_commit="$($script_dir/verify-release-source.sh)"
  export SOURCE_REVISION="$source_commit"
fi

if [[ "$bundle_play" == "0" && -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  dmg_filename="PS2-Emu-${app_version}-launcher-macOS-${target_arch}.dmg"
elif [[ "$bundle_play" == "0" ]]; then
  dmg_filename="PS2-Emu-${app_version}-macOS-${target_arch}-UNSIGNED-DO-NOT-DISTRIBUTE.dmg"
else
  dmg_filename="PS2-Emu-${app_version}-LOCAL-DO-NOT-DISTRIBUTE-macOS-${target_arch}.dmg"
fi
dmg_path="$output_root/$dmg_filename"

PS2_BUNDLE_PLAY="$bundle_play" PS2_TARGET_ARCH="$target_arch" \
  "$script_dir/build-app.sh" "$output_root"
if [[ -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  PS2_BUNDLE_PLAY="$bundle_play" PS2_TARGET_ARCH="$target_arch" \
    "$script_dir/sign-release-app.sh" "$app_path"
fi
if [[ -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  PS2_BUNDLE_PLAY="$bundle_play" PS2_TARGET_ARCH="$target_arch" REQUIRE_RELEASE_SIGNATURE=1 \
    "$script_dir/verify-app.sh" "$app_path"
else
  PS2_BUNDLE_PLAY="$bundle_play" PS2_TARGET_ARCH="$target_arch" \
    "$script_dir/verify-app.sh" "$app_path"
fi

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/ps2-emulator-dmg.XXXXXX")"
staging="$temp_root/staging"
temp_dmg="$temp_root/$dmg_filename"
mkdir -p "$staging/Licenses and Notices"
cleanup() {
  if [[ -d "$temp_root" && "$temp_root" == *ps2-emulator-dmg.* ]]; then
    /bin/rm -R "$temp_root"
  fi
}
trap cleanup EXIT

/usr/bin/ditto "$app_path" "$staging/PS2 Emu.app"
/bin/ln -s /Applications "$staging/Applications"
if [[ "$bundle_play" == "1" ]]; then
  /usr/bin/ditto "$project_root/Resources/Play-License.txt" "$staging/Licenses and Notices/Play-License.txt"
  /usr/bin/ditto "$project_root/Resources/THIRD-PARTY-NOTICES.md" "$staging/Licenses and Notices/THIRD-PARTY-NOTICES.md"
fi
/usr/bin/ditto "$project_root/PRIVACY.md" "$staging/Licenses and Notices/PRIVACY.md"
/usr/bin/ditto "$project_root/SECURITY.md" "$staging/Licenses and Notices/SECURITY.md"
/usr/bin/ditto \
  "$project_root/Resources/Fixtures/PS2SDK-AFL-2.0.txt" \
  "$staging/Licenses and Notices/PS2SDK-AFL-2.0.txt"
/usr/bin/ditto \
  "$project_root/Resources/Fixtures/PS2SDK-CUBE-NOTICE.md" \
  "$staging/Licenses and Notices/PS2SDK-CUBE-NOTICE.md"
/usr/bin/ditto \
  "$project_root/Resources/Fixtures/NEWLIB-COPYING.txt" \
  "$staging/Licenses and Notices/NEWLIB-COPYING.txt"
/usr/bin/ditto \
  "$project_root/Resources/Fixtures/GCC-COPYING.RUNTIME.txt" \
  "$staging/Licenses and Notices/GCC-COPYING.RUNTIME.txt"
/usr/bin/ditto \
  "$project_root/Resources/Fixtures/GCC-COPYING3.txt" \
  "$staging/Licenses and Notices/GCC-COPYING3.txt"
/usr/bin/ditto \
  "$project_root/Resources/Fixtures/source" \
  "$staging/Licenses and Notices/PS2SDK-Cube-Source"
if [[ -f "$project_root/LICENSE" ]]; then
  /usr/bin/ditto "$project_root/LICENSE" "$staging/Licenses and Notices/PS2-Emu-License.txt"
elif [[ -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  print -u2 "A public Developer ID package requires a top-level wrapper LICENSE."
  exit 66
fi

if [[ "$bundle_play" == "0" ]]; then
  if [[ -e "$staging/PS2 Emu.app/Contents/Helpers/Play.app" ]]; then
    print -u2 "Unbundled package unexpectedly contains Play.app."
    exit 74
  fi
  for play_notice in \
    "$staging/PS2 Emu.app/Contents/Resources/Play-License.txt" \
    "$staging/PS2 Emu.app/Contents/Resources/THIRD-PARTY-NOTICES.md" \
    "$staging/Licenses and Notices/Play-License.txt" \
    "$staging/Licenses and Notices/THIRD-PARTY-NOTICES.md"; do
    if [[ -e "$play_notice" ]]; then
      print -u2 "Unbundled package unexpectedly contains a Play!-only notice: $play_notice"
      exit 74
    fi
  done
fi

if [[ -e "$dmg_path" ]]; then
  backup_root="${PS2_DMG_BACKUP_DIR:-$project_root/.build/previous-dmgs}"
  mkdir -p "$backup_root"
  backup="$backup_root/${dmg_filename}.previous-$(date +%Y%m%d-%H%M%S)"
  /bin/mv "$dmg_path" "$backup"
  print "Previous DMG preserved at: $backup"
fi

/usr/bin/hdiutil create \
  -volname "PS2 Emu" \
  -srcfolder "$staging" \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$temp_dmg"

/usr/bin/hdiutil verify "$temp_dmg"
if [[ -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  /usr/bin/codesign \
    --force \
    --sign "$DEVELOPER_ID_APPLICATION" \
    --timestamp \
    "$temp_dmg"
  /usr/bin/codesign --verify --strict --verbose=2 "$temp_dmg"
  /usr/bin/hdiutil verify "$temp_dmg"
  PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH="$target_arch" \
    "$script_dir/verify-release-dmg.sh" "$temp_dmg"
fi
/bin/mv "$temp_dmg" "$dmg_path"
print "Packaged: $dmg_path"
if [[ "$bundle_play" == "1" ]]; then
  print "Distribution mode: bundled Play! core (local MVP)"
else
  print "Distribution mode: external Play! core (public-unbundled candidate)"
fi
print "Target architecture: $target_arch"
