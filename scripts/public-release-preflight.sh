#!/bin/zsh

set -u
set -o pipefail
caller_path="${PATH:-}"
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
evidence_validator="$project_root/docs/release-evidence/validate-evidence.mjs"
failures=()
passes=()
inspection_root=""
inspection_mount=""
inspection_attached=0
source_commit=""

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

if [[ "$bundle_play" == "0" ]]; then
  configured_evidence_root="${RELEASE_EVIDENCE_BUNDLE_ROOT:-}"
  evidence_node="${RELEASE_EVIDENCE_NODE:-}"
  windows_signer_certificate_sha256="${EXPECTED_WINDOWS_SIGNER_CERT_SHA256:-}"
  source_binding_openssl="${PS2_OPENSSL_PATH:-/usr/bin/openssl}"
  if [[ -z "$evidence_node" ]]; then
    evidence_node="$(PATH="$caller_path" command -v node 2>/dev/null || true)"
  fi

  if [[ -z "$configured_evidence_root" ]]; then
    fail "RELEASE_EVIDENCE_BUNDLE_ROOT is required for external immutable release evidence"
  elif [[ "$configured_evidence_root" != /* ]]; then
    fail "RELEASE_EVIDENCE_BUNDLE_ROOT must be an absolute external directory"
  else
    evidence_bundle_root="${configured_evidence_root:a}"
    evidence_bundle_canonical="${configured_evidence_root:A}"
    project_root_canonical="${project_root:A}"
    if [[ ! -d "$evidence_bundle_root" || -L "$evidence_bundle_root" ]]; then
      fail "RELEASE_EVIDENCE_BUNDLE_ROOT is missing, is not a directory, or is a symlink"
    elif [[ "$evidence_bundle_canonical" == "$project_root_canonical" || "$evidence_bundle_canonical" == "$project_root_canonical"/* ]]; then
      fail "RELEASE_EVIDENCE_BUNDLE_ROOT must remain outside the Git source repository"
    elif [[ "$evidence_node" != /* || ! -f "$evidence_node" || ! -x "$evidence_node" || -L "$evidence_node" ]]; then
      fail "A trusted absolute Node.js executable is required to validate external release evidence"
    elif ! /usr/bin/grep -Eq '^[0-9a-f]{64}$' <<<"$windows_signer_certificate_sha256"; then
      fail "EXPECTED_WINDOWS_SIGNER_CERT_SHA256 must pin exactly 64 lowercase hexadecimal characters"
    elif [[ "$source_binding_openssl" != /* || ! -f "$source_binding_openssl" || ! -x "$source_binding_openssl" || -L "$source_binding_openssl" ]]; then
      fail "PS2_OPENSSL_PATH must name a trusted absolute regular OpenSSL executable"
    elif [[ ! -f "$evidence_validator" || -L "$evidence_validator" ]]; then
      fail "The reviewed release evidence validator is missing or unsafe"
    else
      evidence_directory="$evidence_bundle_root/evidence"
      evidence_files=()
      if [[ -d "$evidence_directory" && ! -L "$evidence_directory" ]]; then
        evidence_files=("$evidence_directory"/*.json(N))
      fi
      if (( ${#evidence_files} == 0 )); then
        fail "External release evidence bundle must contain platform JSON records below evidence/"
      else
        unsafe_evidence=0
        for evidence_file in "${evidence_files[@]}"; do
          if [[ ! -f "$evidence_file" || -L "$evidence_file" ]]; then
            unsafe_evidence=1
          fi
        done
        if (( unsafe_evidence == 1 )); then
          fail "External release evidence JSON records must be regular non-symlink files"
        elif RELEASE_EVIDENCE_BUNDLE_ROOT="$evidence_bundle_root" \
          EXPECTED_WINDOWS_SIGNER_CERT_SHA256="$windows_signer_certificate_sha256" \
          PS2_OPENSSL_PATH="$source_binding_openssl" \
          "$evidence_node" "$evidence_validator" --require-pass "${evidence_files[@]}" >/dev/null 2>&1; then
          evidence_revision_mismatch=0
          target_evidence_found=0
          for evidence_file in "${evidence_files[@]}"; do
            record_revision="$(/usr/bin/plutil -extract source.revision raw -o - "$evidence_file" 2>/dev/null || true)"
            record_version="$(/usr/bin/plutil -extract product.version raw -o - "$evidence_file" 2>/dev/null || true)"
            record_platform="$(/usr/bin/plutil -extract target.platformID raw -o - "$evidence_file" 2>/dev/null || true)"
            if [[ -z "$source_commit" || "$record_revision" != "$source_commit" || "$record_version" != "$version" ]]; then
              evidence_revision_mismatch=1
            fi
            if [[ "$record_platform" == "macos-$target_arch" ]]; then
              target_evidence_found=1
            fi
          done
          if (( evidence_revision_mismatch == 1 )); then
            fail "External release evidence is not bound to this clean source revision and version"
          elif (( target_evidence_found == 0 )); then
            fail "External release evidence does not contain the selected macOS architecture"
          else
            pass "External immutable four-platform evidence, attachments, artifact bytes, and source binding pass"
          fi
        else
          fail "External immutable release evidence failed validate-evidence --require-pass"
        fi
      fi
    fi
  fi
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
