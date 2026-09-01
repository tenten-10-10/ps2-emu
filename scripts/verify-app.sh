#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
app_path="${1:-$project_root/dist/PS2 Emu.app}"
bundle_play="${PS2_BUNDLE_PLAY:-1}"
target_arch="${PS2_TARGET_ARCH:-arm64}"
require_release_signature="${REQUIRE_RELEASE_SIGNATURE:-0}"
core_app="$app_path/Contents/Helpers/Play.app"

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

case "$require_release_signature" in
  0 | 1) ;;
  *)
    print -u2 "REQUIRE_RELEASE_SIGNATURE must be 0 or 1."
    exit 64
    ;;
esac

if [[ ! -x "$app_path/Contents/MacOS/PS2Emulator" ]]; then
  print -u2 "App bundle not found or incomplete: $app_path"
  exit 66
fi

/usr/bin/plutil -lint "$app_path/Contents/Info.plist"
for key in CFBundleIdentifier CFBundleShortVersionString CFBundleVersion; do
  expected_value="$(/usr/libexec/PlistBuddy -c "Print :$key" "$project_root/Resources/Info.plist")"
  actual_value="$(/usr/libexec/PlistBuddy -c "Print :$key" "$app_path/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "$actual_value" != "$expected_value" ]]; then
    print -u2 "Unexpected $key: expected $expected_value, found ${actual_value:-missing}"
    exit 74
  fi
done
arch_marker="$(/usr/libexec/PlistBuddy -c 'Print :PS2TargetArchitecture' "$app_path/Contents/Info.plist" 2>/dev/null || true)"
if [[ -n "$arch_marker" && "$arch_marker" != "$target_arch" ]]; then
  print -u2 "App architecture marker mismatch: expected $target_arch, found $arch_marker"
  exit 74
fi
outer_archs="$(/usr/bin/lipo -archs "$app_path/Contents/MacOS/PS2Emulator" 2>/dev/null || true)"
if [[ "$outer_archs" != "$target_arch" ]]; then
  print -u2 "Unexpected outer executable architectures: expected $target_arch, found ${outer_archs:-unknown}"
  exit 74
fi
mode_marker="$(/usr/libexec/PlistBuddy -c 'Print :PS2BundledPlayCore' "$app_path/Contents/Info.plist" 2>/dev/null || true)"
if [[ "$bundle_play" == "1" ]]; then
  # Bundled artifacts made before the distribution marker existed are still
  # accepted when the core and its notices are present. An explicit `false`
  # marker can never be verified as bundled.
  if [[ -n "$mode_marker" && "$mode_marker" != "true" ]]; then
    print -u2 "App distribution marker is not bundled: $mode_marker"
    exit 74
  fi
  if [[ ! -x "$core_app/Contents/MacOS/Play" ]]; then
    print -u2 "Bundled Play! core is missing: $core_app"
    exit 66
  fi
  for required_notice in \
    "$app_path/Contents/Resources/Play-License.txt" \
    "$app_path/Contents/Resources/THIRD-PARTY-NOTICES.md"; do
    if [[ ! -f "$required_notice" ]]; then
      print -u2 "Bundled Play! notice is missing: $required_notice"
      exit 66
    fi
  done
  /usr/bin/codesign --verify --deep --strict --verbose=2 "$app_path"
  "$script_dir/validate-play-core.sh" "$core_app"
else
  if [[ "$mode_marker" != "false" ]]; then
    print -u2 "App distribution marker is not external-core: $mode_marker"
    exit 74
  fi
  if [[ -e "$core_app" ]]; then
    print -u2 "PS2_BUNDLE_PLAY=0 requires Play.app to be absent: $core_app"
    exit 74
  fi
  for forbidden_notice in \
    "$app_path/Contents/Resources/Play-License.txt" \
    "$app_path/Contents/Resources/THIRD-PARTY-NOTICES.md"; do
    if [[ -e "$forbidden_notice" ]]; then
      print -u2 "PS2_BUNDLE_PLAY=0 requires the Play!-only notice to be absent: $forbidden_notice"
      exit 74
    fi
  done
  /usr/bin/codesign --verify --strict --verbose=2 "$app_path"
fi

if [[ "$require_release_signature" == "1" ]]; then
  if [[ -z "${EXPECTED_OUTER_TEAM_ID:-}" ]]; then
    print -u2 "EXPECTED_OUTER_TEAM_ID is required for release-signature verification."
    exit 64
  fi
  if [[ ! "${SOURCE_REVISION:-}" =~ '^[0-9a-f]{40}$' ]]; then
    print -u2 "An exact 40-character SOURCE_REVISION is required for release verification."
    exit 64
  fi
  embedded_revision="$(/usr/libexec/PlistBuddy -c 'Print :PS2SourceRevision' "$app_path/Contents/Info.plist" 2>/dev/null || true)"
  if [[ "$embedded_revision" != "$SOURCE_REVISION" ]]; then
    print -u2 "Embedded source revision mismatch: expected $SOURCE_REVISION, found ${embedded_revision:-missing}"
    exit 74
  fi
  outer_signature="$(/usr/bin/codesign -d --verbose=4 "$app_path" 2>&1)"
  outer_identifier="$(print -r -- "$outer_signature" | /usr/bin/awk -F= '/^Identifier=/{print $2; exit}')"
  outer_team="$(print -r -- "$outer_signature" | /usr/bin/awk -F= '/^TeamIdentifier=/{print $2; exit}')"
  outer_flags="$(print -r -- "$outer_signature" | /usr/bin/sed -n 's/.*flags=\([^ ]*\).*/\1/p' | /usr/bin/head -n 1)"
  if [[ "$outer_identifier" != "jp.planter.ps2emulator" ]]; then
    print -u2 "Unexpected outer signing identifier: ${outer_identifier:-missing}"
    exit 77
  fi
  if [[ "$outer_team" != "$EXPECTED_OUTER_TEAM_ID" ]]; then
    print -u2 "Unexpected outer signing team: ${outer_team:-missing}"
    exit 77
  fi
  if [[ "$outer_flags" != *"runtime"* ]]; then
    print -u2 "Hardened Runtime is not enabled on the outer app."
    exit 77
  fi
  outer_entitlements="$(/usr/bin/codesign -d --entitlements :- "$app_path" 2>/dev/null || true)"
  if print -r -- "$outer_entitlements" | /usr/bin/grep -q "com.apple.security.get-task-allow"; then
    print -u2 "Release signature unexpectedly contains get-task-allow."
    exit 77
  fi
fi

/usr/bin/file "$app_path/Contents/MacOS/PS2Emulator"
if [[ "$bundle_play" == "1" ]]; then
  /usr/bin/file "$core_app/Contents/MacOS/Play"
  host_arch="$(/usr/bin/uname -m)"
  if [[ "$host_arch" == "$target_arch" ]]; then
    "$app_path/Contents/MacOS/PS2Emulator" --self-test
  elif [[ "$host_arch" == "arm64" && "$target_arch" == "x86_64" ]] && \
      /usr/bin/arch -x86_64 /usr/bin/true 2>/dev/null; then
    /usr/bin/arch -x86_64 "$app_path/Contents/MacOS/PS2Emulator" --self-test
    print "Bundled-core self-test: passed under Rosetta ($host_arch -> $target_arch)"
  else
    print "Bundled-core self-test: skipped on cross-architecture host ($host_arch -> $target_arch)"
  fi
else
  print "Bundled-core self-test: not applicable (external-core distribution)"
fi

if /usr/sbin/spctl -a -vv "$app_path"; then
  print "Outer app Gatekeeper assessment: accepted"
elif [[ "${REQUIRE_NOTARIZED:-0}" == "1" ]]; then
  print -u2 "Outer app is not Developer ID signed/notarized."
  exit 77
else
  print "Outer app Gatekeeper assessment: rejected (expected for local ad-hoc build)"
fi

if [[ "$bundle_play" == "1" ]]; then
  print "Distribution mode verified: bundled Play! core (local MVP)"
else
  print "Distribution mode verified: external Play! core (Play.app absent)"
fi
print "Target architecture verified: $target_arch"
print "Verification complete: $app_path"
