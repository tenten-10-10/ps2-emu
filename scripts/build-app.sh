#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
default_output="$project_root/dist"
output_root="${1:-$default_output}"
core_app="${PLAY_CORE_APP:-$project_root/Vendor/Play.app}"
bundle_play="${PS2_BUNDLE_PLAY:-1}"
target_arch="${PS2_TARGET_ARCH:-arm64}"
app_name="PS2 Emu.app"
output_app="$output_root/$app_name"

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

if [[ "$bundle_play" == "0" && -n "${PLAY_CORE_APP:-}" ]]; then
  print -u2 "PLAY_CORE_APP cannot be used when PS2_BUNDLE_PLAY=0."
  exit 64
fi

if [[ "$bundle_play" == "1" ]]; then
  if [[ ! -x "$core_app/Contents/MacOS/Play" ]]; then
    if [[ -n "${PLAY_CORE_APP:-}" ]]; then
      print -u2 "Play! core not found at: $core_app"
      exit 66
    fi
    "$script_dir/fetch-play-core.sh"
  fi
  "$script_dir/validate-play-core.sh" "$core_app"
fi

"$script_dir/verify-bundled-homebrew.sh"

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/ps2-emulator-build.XXXXXX")"
cleanup() {
  if [[ -d "$temp_root" && "$temp_root" == *ps2-emulator-build.* ]]; then
    /bin/rm -R "$temp_root"
  fi
}
trap cleanup EXIT

swift_path="$(/usr/bin/xcrun --find swift 2>/dev/null || true)"
if [[ -z "$swift_path" || ! -x "$swift_path" ]]; then
  print -u2 "Apple Swift toolchain could not be resolved through /usr/bin/xcrun."
  exit 69
fi
swift_owner="$(/usr/bin/stat -f '%Su' "$swift_path" 2>/dev/null || true)"
github_hosted_toolchain=0
if [[ "$swift_owner" == "runner" \
  && "${GITHUB_ACTIONS:-}" == "true" \
  && "${RUNNER_ENVIRONMENT:-}" == "github-hosted" \
  && "${PS2_ALLOW_GITHUB_HOSTED_TOOLCHAIN:-}" == "1" \
  && "$swift_path" == /Applications/Xcode_*.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swift ]]; then
  github_hosted_toolchain=1
fi
if [[ "$swift_owner" != "root" && "$github_hosted_toolchain" != "1" ]]; then
  print -u2 "Refusing a non-root-owned Swift toolchain: $swift_path (owner: ${swift_owner:-unknown})"
  exit 77
fi
if ! /usr/bin/codesign --verify --strict --requirement '=anchor apple' "$swift_path" 2>/dev/null; then
  print -u2 "Refusing a Swift toolchain that does not satisfy the Apple code-signing requirement: $swift_path"
  exit 77
fi
scratch_path="$temp_root/swift-build"
print "Using Apple Swift toolchain: $swift_path"
"$swift_path" --version

temp_app="$temp_root/$app_name"
mkdir -p \
  "$temp_app/Contents/MacOS" \
  "$temp_app/Contents/Resources/Fixtures"

if [[ "$bundle_play" == "1" ]]; then
  mkdir -p "$temp_app/Contents/Helpers"
fi

"$swift_path" test --package-path "$project_root" --scratch-path "$scratch_path"
"$swift_path" build --package-path "$project_root" --scratch-path "$scratch_path" -c release --arch "$target_arch"
bin_path="$("$swift_path" build --package-path "$project_root" --scratch-path "$scratch_path" -c release --arch "$target_arch" --show-bin-path)"

/usr/bin/ditto "$bin_path/PS2Emulator" "$temp_app/Contents/MacOS/PS2Emulator"
/usr/bin/ditto "$project_root/Resources/Info.plist" "$temp_app/Contents/Info.plist"
/usr/bin/ditto \
  "$project_root/Resources/Fixtures" \
  "$temp_app/Contents/Resources/Fixtures"
if [[ "$bundle_play" == "1" ]]; then
  /usr/libexec/PlistBuddy -c "Add :PS2BundledPlayCore bool true" "$temp_app/Contents/Info.plist"
  /usr/bin/ditto "$project_root/Resources/Play-License.txt" "$temp_app/Contents/Resources/Play-License.txt"
  /usr/bin/ditto "$project_root/Resources/THIRD-PARTY-NOTICES.md" "$temp_app/Contents/Resources/THIRD-PARTY-NOTICES.md"
  /usr/bin/ditto "$core_app" "$temp_app/Contents/Helpers/Play.app"
  "$script_dir/validate-play-core.sh" "$temp_app/Contents/Helpers/Play.app"
else
  /usr/libexec/PlistBuddy -c "Add :PS2BundledPlayCore bool false" "$temp_app/Contents/Info.plist"
fi
/usr/libexec/PlistBuddy -c "Add :PS2TargetArchitecture string $target_arch" "$temp_app/Contents/Info.plist"
if [[ -n "${SOURCE_REVISION:-}" ]]; then
  if [[ ! "$SOURCE_REVISION" =~ '^[0-9a-f]{40}$' ]]; then
    print -u2 "SOURCE_REVISION embedded in a build must be an exact 40-character commit hash."
    exit 65
  fi
  /usr/libexec/PlistBuddy -c "Add :PS2SourceRevision string $SOURCE_REVISION" "$temp_app/Contents/Info.plist"
fi

iconset="$temp_root/AppIcon.iconset"
"$swift_path" "$project_root/scripts/generate-icon.swift" "$iconset"
/usr/bin/iconutil -c icns "$iconset" -o "$temp_app/Contents/Resources/AppIcon.icns"

/usr/bin/plutil -lint "$temp_app/Contents/Info.plist"
outer_archs="$(/usr/bin/lipo -archs "$temp_app/Contents/MacOS/PS2Emulator" 2>/dev/null || true)"
if [[ "$outer_archs" != "$target_arch" ]]; then
  print -u2 "Unexpected outer executable architectures: expected $target_arch, found ${outer_archs:-unknown}"
  exit 74
fi
/usr/bin/codesign --force --sign - --timestamp=none "$temp_app"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$temp_app"

mkdir -p "$output_root"
if [[ -e "$output_app" ]]; then
  backup_root="${PS2_BUILD_BACKUP_DIR:-$project_root/.build/previous-apps}"
  mkdir -p "$backup_root"
  backup="$backup_root/PS2 Emu.app.previous-$(date +%Y%m%d-%H%M%S)"
  /bin/mv "$output_app" "$backup"
  print "Previous build preserved at: $backup"
fi
/usr/bin/ditto "$temp_app" "$output_app"

print "Built: $output_app"
if [[ "$bundle_play" == "1" ]]; then
  print "Distribution mode: bundled Play! core (local MVP)"
else
  print "Distribution mode: external Play! core (public-unbundled candidate)"
fi
print "Target architecture: $target_arch"
