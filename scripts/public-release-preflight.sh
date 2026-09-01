#!/bin/zsh

set -u
set -o pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
default_output="$project_root/dist"
output_root="${1:-$default_output}"
bundle_play="${PS2_BUNDLE_PLAY:-1}"
target_arch="${PS2_TARGET_ARCH:-arm64}"
app_path="$output_root/PS2 Emu.app"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$project_root/Resources/Info.plist" 2>/dev/null || true)"
evidence_root="$project_root/docs/release-evidence/$version/$target_arch"
failures=()
passes=()
inspection_root=""
inspection_mount=""
inspection_attached=0

cleanup() {
  if (( inspection_attached == 1 )) && [[ -n "$inspection_mount" ]]; then
    if /usr/bin/hdiutil detach "$inspection_mount" >/dev/null 2>&1; then
      inspection_attached=0
    fi
  fi
  if (( inspection_attached == 0 )) && \
      [[ -n "$inspection_root" && -d "$inspection_root" && "$inspection_root" == *ps2-emulator-preflight.* ]]; then
    /bin/rm -R "$inspection_root"
  fi
}
trap cleanup EXIT

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

if [[ "$bundle_play" == "0" ]]; then
  dmg_path="$output_root/PS2-Emu-${version}-launcher-macOS-${target_arch}.dmg"
else
  dmg_path="$output_root/PS2-Emu-${version}-LOCAL-DO-NOT-DISTRIBUTE-macOS-${target_arch}.dmg"
fi

if [[ "$bundle_play" == "0" && -z "${EXPECTED_OUTER_TEAM_ID:-}" ]]; then
  failures+=("EXPECTED_OUTER_TEAM_ID is not set for fail-closed release verification")
fi
if [[ "$bundle_play" == "0" ]]; then
  if source_commit="$($script_dir/verify-release-source.sh 2>/dev/null)"; then
    export SOURCE_REVISION="$source_commit"
    passes+=("Clean reviewed source revision is bound to release: $source_commit")
  else
    failures+=("Clean Git source revision, wrapper LICENSE, and explicit SOURCE_REVISION are required")
  fi
fi

pass() {
  passes+=("$1")
}

fail() {
  failures+=("$1")
}

if [[ -n "$version" ]]; then
  pass "Release version is readable: $version"
else
  fail "CFBundleShortVersionString is missing"
fi

if [[ -f "$project_root/LICENSE" ]]; then
  pass "Wrapper LICENSE exists"
else
  fail "Wrapper LICENSE has not been selected"
fi

notices="$project_root/Resources/THIRD-PARTY-NOTICES.md"
if [[ "$bundle_play" == "0" ]]; then
  pass "External-core mode selected explicitly; Play!, Qt, and MoltenVK are not redistributed in the candidate"
else
  for component in "Play!" "Qt" "MoltenVK"; do
    if [[ -f "$notices" ]] && /usr/bin/grep -qi "$component" "$notices"; then
      pass "Third-party notice mentions $component"
    else
      fail "Third-party notice is incomplete: $component is missing"
    fi
  done
  fail "Bundled-core public distribution remains blocked by unresolved Play!/Qt/MoltenVK/dependency redistribution obligations; use PS2_BUNDLE_PLAY=0 or complete a reviewed license package"
fi

if [[ -x "$app_path/Contents/MacOS/PS2Emulator" ]]; then
  verify_environment=(PS2_BUNDLE_PLAY="$bundle_play" PS2_TARGET_ARCH="$target_arch")
  if [[ "$bundle_play" == "0" && -n "${EXPECTED_OUTER_TEAM_ID:-}" ]]; then
    verify_environment+=(REQUIRE_RELEASE_SIGNATURE=1 EXPECTED_OUTER_TEAM_ID="$EXPECTED_OUTER_TEAM_ID")
  fi
  if /usr/bin/env "${verify_environment[@]}" "$script_dir/verify-app.sh" "$app_path" >/dev/null 2>&1; then
    if [[ "$bundle_play" == "0" ]]; then
      pass "Application structure passes and bundled Play.app/notices are absent"
    else
      pass "Application structure and pinned core validation pass"
    fi
  else
    fail "Application verification failed"
  fi

  signature="$(/usr/bin/codesign -d --verbose=4 "$app_path" 2>&1 || true)"
  team="$(print -r -- "$signature" | /usr/bin/awk -F= '/^TeamIdentifier=/{print $2; exit}')"
  flags="$(print -r -- "$signature" | /usr/bin/sed -n 's/.*flags=\([^ ]*\).*/\1/p' | /usr/bin/head -n 1)"
  if [[ -n "$team" && "$team" != "not set" && "$flags" == *runtime* ]]; then
    pass "Outer app has a team signature and Hardened Runtime"
  else
    fail "Outer app is not Developer ID signed with Hardened Runtime"
  fi
else
  fail "Built application is missing"
fi

if [[ -f "$dmg_path" ]]; then
  if [[ "$bundle_play" == "0" && -n "${EXPECTED_OUTER_TEAM_ID:-}" ]]; then
    if PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH="$target_arch" REQUIRE_NOTARIZED=1 \
      "$script_dir/verify-release-dmg.sh" "$dmg_path" >/dev/null 2>&1; then
      pass "Public DMG identity, contents, Developer ID signature, notarization, and Gatekeeper checks pass"
    else
      fail "Public DMG release verification failed"
    fi
  else
    if /usr/bin/hdiutil verify "$dmg_path" >/dev/null 2>&1; then
      pass "DMG filesystem verifies"
    else
      fail "DMG filesystem verification failed"
    fi
    if /usr/bin/xcrun stapler validate "$dmg_path" >/dev/null 2>&1; then
      pass "DMG has a valid stapled notarization ticket"
    else
      fail "DMG does not have a valid stapled notarization ticket"
    fi
    if /usr/sbin/spctl -a -t open --context context:primary-signature "$dmg_path" >/dev/null 2>&1; then
      pass "Gatekeeper accepts the DMG"
    else
      fail "Gatekeeper does not accept the DMG"
    fi
  fi

  inspection_root="$(mktemp -d "${TMPDIR:-/tmp}/ps2-emulator-preflight.XXXXXX" 2>/dev/null || true)"
  inspection_mount="$inspection_root/mount"
  if [[ -n "$inspection_root" ]] && mkdir -p "$inspection_mount" && \
      /usr/bin/hdiutil attach -readonly -nobrowse -mountpoint "$inspection_mount" "$dmg_path" >/dev/null 2>&1; then
    inspection_attached=1
    if PS2_BUNDLE_PLAY="$bundle_play" PS2_TARGET_ARCH="$target_arch" \
      "$script_dir/verify-app.sh" "$inspection_mount/PS2 Emu.app" >/dev/null 2>&1; then
      pass "DMG application contents match the selected distribution mode"
    else
      fail "DMG application contents do not match the selected distribution mode"
    fi

    if [[ "$bundle_play" == "0" ]]; then
      dmg_contains_play_notice=0
      for play_notice in \
        "$inspection_mount/Licenses and Notices/Play-License.txt" \
        "$inspection_mount/Licenses and Notices/THIRD-PARTY-NOTICES.md"; do
        if [[ -e "$play_notice" ]]; then
          dmg_contains_play_notice=1
        fi
      done
      if (( dmg_contains_play_notice == 0 )); then
        pass "DMG omits Play!-only notices in external-core mode"
      else
        fail "DMG contains Play!-only notices in external-core mode"
      fi
    fi

    if /usr/bin/hdiutil detach "$inspection_mount" >/dev/null 2>&1; then
      inspection_attached=0
    else
      fail "DMG inspection volume could not be detached cleanly"
    fi
  else
    fail "DMG contents could not be mounted for distribution-mode inspection"
  fi
else
  fail "Versioned DMG is missing: $dmg_path"
fi

if [[ -f "$evidence_root/REAL_HARDWARE_TEST.md" ]]; then
  pass "Real-hardware test evidence exists"
else
  fail "Real-hardware controller/audio/save/stop/relaunch evidence is missing"
fi

if [[ -f "$evidence_root/CLEAN_MAC_GATEKEEPER_TEST.md" ]]; then
  pass "Clean-Mac Gatekeeper evidence exists"
else
  fail "Clean-Mac browser-download Gatekeeper evidence is missing"
fi

if [[ -f "$project_root/site/dist/index.html" ]]; then
  pass "Teaser site build exists"
else
  fail "Teaser site has not been built"
fi

print "Public release preflight — PS2 Emu $version"
print "Target architecture: $target_arch"
if [[ "$bundle_play" == "0" ]]; then
  print "Distribution mode: external Play! core (public-unbundled candidate)"
else
  print "Distribution mode: bundled Play! core (local MVP; public redistribution blocked)"
fi
print ""
print "PASS (${#passes})"
for item in "${passes[@]}"; do
  print "  + $item"
done

print ""
if (( ${#failures} > 0 )); then
  print "NO-GO (${#failures} blocking gates)"
  for item in "${failures[@]}"; do
    print "  - $item"
  done
  exit 1
fi

print "GO — automated gates pass. Complete the human legal and release-owner review before publication."
