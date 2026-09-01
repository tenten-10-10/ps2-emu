#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
fixture_root="$project_root/.build/fixtures/ps2sdk-samples"
cube_elf="$fixture_root/draw/cube/cube.elf"
expected_sha="1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584"
run_id="33232694254"
artifact_name="ps2sdk-samples-all-39a89923"
core_app="${PLAY_CORE_APP:-$project_root/Vendor/Play.app}"

if [[ ! -f "$cube_elf" ]]; then
  gh_path="${GH_PATH:-$(command -v gh || true)}"
  if [[ -z "$gh_path" || ! -x "$gh_path" ]]; then
    print -u2 "GitHub CLI is required to fetch the official ps2sdk sample artifact."
    exit 69
  fi
  mkdir -p "$fixture_root"
  "$gh_path" run download "$run_id" \
    -R ps2dev/ps2sdk \
    -n "$artifact_name" \
    -D "$fixture_root"
fi

actual_sha="$(/usr/bin/shasum -a 256 "$cube_elf" | /usr/bin/awk '{print $1}')"
if [[ "$actual_sha" != "$expected_sha" ]]; then
  print -u2 "Smoke-test ELF checksum mismatch. Expected $expected_sha, got $actual_sha"
  exit 74
fi

print "Verified ps2sdk rotating-cube ELF: $cube_elf"
print "Source: https://github.com/ps2dev/ps2sdk/tree/39a89923ce59152fa855250cfacaccf8e581a1eb/ee/draw/samples/cube"
print "License: Academic Free License 2.0"

if [[ "${1:-}" == "--fetch-only" ]]; then
  exit 0
fi

if [[ ! -x "$core_app/Contents/MacOS/Play" ]]; then
  if [[ -n "${PLAY_CORE_APP:-}" ]]; then
    print -u2 "Configured PLAY_CORE_APP is missing or not executable: $core_app"
    exit 66
  fi
  "$script_dir/fetch-play-core.sh"
fi

# The visual smoke test executes native code. Always revalidate the exact
# pinned official core immediately before execution; this path never accepts a
# reduced-validation or user-modified core.
"$script_dir/validate-play-core.sh" "$core_app"

print "Launching the visual EE/GS/DMA smoke test. Close the Play! window to finish."
exec "$core_app/Contents/MacOS/Play" --elf "$cube_elf"
