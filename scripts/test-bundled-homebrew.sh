#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
verifier="$script_dir/verify-bundled-homebrew.sh"
checks=0

temp_root=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/ps2-emu-homebrew-tests.XXXXXX")
test_repo="$temp_root/repo"
cleanup() {
  case "$temp_root" in
    "${TMPDIR:-/tmp}"/ps2-emu-homebrew-tests.*) /bin/rm -R "$temp_root" ;;
    *) printf '%s\n' "Refusing to clean an unexpected test path: $temp_root" >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

pass() {
  checks=$((checks + 1))
  printf 'ok %s - %s\n' "$checks" "$1"
}

expect_failure() {
  description=$1
  shift
  if "$@" >"$temp_root/failure.log" 2>&1; then
    printf 'Expected failure but command succeeded: %s\n' "$description" >&2
    exit 1
  fi
  pass "$description"
}

/bin/sh "$verifier" >/dev/null
pass 'reviewed working tree is accepted'

/bin/mkdir -p "$test_repo/scripts"
/bin/cp -R "$project_root/Resources" "$test_repo/Resources"
/bin/cp "$verifier" "$test_repo/scripts/verify-bundled-homebrew.sh"
/bin/cp "$project_root/scripts/check-public-source-paths.sh" \
  "$test_repo/scripts/check-public-source-paths.sh"
/usr/bin/git -C "$test_repo" init -q
/usr/bin/git -C "$test_repo" add \
  Resources \
  scripts/check-public-source-paths.sh \
  scripts/verify-bundled-homebrew.sh
/usr/bin/git -C "$test_repo" \
  -c user.name='Fixture Test' \
  -c user.email='fixture-test@example.invalid' \
  commit -q -m 'Exact fixture'

/bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh" >/dev/null
pass 'clean copied working tree is accepted'
/bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh" HEAD >/dev/null
pass 'exact committed Git blobs are accepted'
/bin/sh "$test_repo/scripts/check-public-source-paths.sh" HEAD >/dev/null
pass 'public-source boundary accepts the exact fixture commit'

printf 'tamper' >> "$test_repo/Resources/Fixtures/ps2sdk-cube.elf"
expect_failure 'ELF byte tampering is rejected' \
  /bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh"
/bin/cp "$project_root/Resources/Fixtures/ps2sdk-cube.elf" \
  "$test_repo/Resources/Fixtures/ps2sdk-cube.elf"

printf 'not an allowed ELF\n' > "$test_repo/Resources/Fixtures/another-demo.elf"
expect_failure 'a second bundled ELF is rejected' \
  /bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh"
/bin/rm "$test_repo/Resources/Fixtures/another-demo.elf"

/bin/mkdir -p "$test_repo/docs"
printf 'not an allowed disc image\n' > "$test_repo/docs/demo.iso"
expect_failure 'a payload outside Resources is rejected' \
  /bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh"
/bin/rm "$test_repo/docs/demo.iso"

/bin/cp "$test_repo/Resources/Fixtures/PS2SDK-AFL-2.0.txt" "$temp_root/afl.backup"
/bin/rm "$test_repo/Resources/Fixtures/PS2SDK-AFL-2.0.txt"
/bin/ln -s "$temp_root/afl.backup" "$test_repo/Resources/Fixtures/PS2SDK-AFL-2.0.txt"
expect_failure 'a symlinked license is rejected' \
  /bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh"
/bin/rm "$test_repo/Resources/Fixtures/PS2SDK-AFL-2.0.txt"
/bin/cp "$project_root/Resources/Fixtures/PS2SDK-AFL-2.0.txt" \
  "$test_repo/Resources/Fixtures/PS2SDK-AFL-2.0.txt"

printf 'tampered license\n' >> "$test_repo/Resources/Fixtures/NEWLIB-COPYING.txt"
/usr/bin/git -C "$test_repo" add Resources/Fixtures/NEWLIB-COPYING.txt
/usr/bin/git -C "$test_repo" \
  -c user.name='Fixture Test' \
  -c user.email='fixture-test@example.invalid' \
  commit -q -m 'Tamper fixture'
expect_failure 'a committed license hash mismatch is rejected' \
  /bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh" HEAD

/bin/cp "$project_root/Resources/Fixtures/NEWLIB-COPYING.txt" \
  "$test_repo/Resources/Fixtures/NEWLIB-COPYING.txt"
/usr/bin/git -C "$test_repo" add Resources/Fixtures/NEWLIB-COPYING.txt
/usr/bin/git -C "$test_repo" \
  -c user.name='Fixture Test' \
  -c user.email='fixture-test@example.invalid' \
  commit -q -m 'Restore license'

printf 'historical tamper' >> "$test_repo/Resources/Fixtures/ps2sdk-cube.elf"
/usr/bin/git -C "$test_repo" add Resources/Fixtures/ps2sdk-cube.elf
/usr/bin/git -C "$test_repo" \
  -c user.name='Fixture Test' \
  -c user.email='fixture-test@example.invalid' \
  commit -q -m 'Historical fixture tamper'
/bin/cp "$project_root/Resources/Fixtures/ps2sdk-cube.elf" \
  "$test_repo/Resources/Fixtures/ps2sdk-cube.elf"
/usr/bin/git -C "$test_repo" add Resources/Fixtures/ps2sdk-cube.elf
/usr/bin/git -C "$test_repo" \
  -c user.name='Fixture Test' \
  -c user.email='fixture-test@example.invalid' \
  commit -q -m 'Restore fixture'
/bin/sh "$test_repo/scripts/verify-bundled-homebrew.sh" HEAD >/dev/null
expect_failure 'public-source boundary rejects a historical non-approved ELF byte version' \
  /bin/sh "$test_repo/scripts/check-public-source-paths.sh" HEAD

printf '1..%s\n' "$checks"
