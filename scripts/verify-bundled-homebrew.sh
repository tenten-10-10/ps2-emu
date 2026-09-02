#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
selected_revision=${1:-}

fixture_path='Resources/Fixtures/ps2sdk-cube.elf'
fixture_sha='1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584'

expected_files='Resources/Fixtures/GCC-COPYING.RUNTIME.txt|9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74|3324
Resources/Fixtures/GCC-COPYING3.txt|8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903|35147
Resources/Fixtures/NEWLIB-COPYING.txt|f3afe48e4bc6ed8466a42e9dacb6be1d8f9cbf5aac15cb8e474a5ccde8b40ef6|78388
Resources/Fixtures/PS2SDK-AFL-2.0.txt|1ecee940922a6886baccddd9133d17f1ce677d32c5a954fac8e48224f2766fe8|9005
Resources/Fixtures/PS2SDK-CUBE-NOTICE.md|74e4ebb0e2f098bd02dc68afb3d48c22cfd1d9ae045986786ddd54fa77b0ba94|7280
Resources/Fixtures/ps2sdk-cube.elf|1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584|174772
Resources/Fixtures/source/Makefile|7ecc7e683798fe29a0627ade45f10a0aa022e060cf342b413ac4c88a641d925b|718
Resources/Fixtures/source/cube.c|fb5cc5955ffe346ede5f31d73743545d001fd144fff7ab186cf6b5654ba1b824|6298
Resources/Fixtures/source/mesh_data.c|ff6ab49e9aa12250aa1b4d8b9a63a018b954a5d49b4e89ca2ed6abe60ed2cd43|2456'

fail() {
  printf '%s\n' "$*" >&2
  exit 74
}

sha256_file() {
  target_file=$1
  if [ -x /usr/bin/shasum ]; then
    /usr/bin/shasum -a 256 "$target_file" | /usr/bin/awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$target_file" | awk '{print $1}'
  else
    printf '%s\n' 'No SHA-256 implementation is available.' >&2
    exit 69
  fi
}

temp_root=''
cleanup() {
  if [ -n "$temp_root" ] && [ -d "$temp_root" ]; then
    case "$temp_root" in
      "${TMPDIR:-/tmp}"/ps2-emu-homebrew.*) /bin/rm -R "$temp_root" ;;
      *) printf '%s\n' "Refusing to clean an unexpected temporary path: $temp_root" >&2 ;;
    esac
  fi
}
trap cleanup EXIT HUP INT TERM

if [ -n "$selected_revision" ]; then
  if ! /usr/bin/git -C "$project_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail 'Revision verification requires a Git worktree.'
  fi
  resolved_revision=$(/usr/bin/git -C "$project_root" rev-parse --verify "$selected_revision^{commit}" 2>/dev/null || true)
  printf '%s\n' "$resolved_revision" | /usr/bin/grep -Eq '^[0-9a-f]{40}$' \
    || fail "The bundled-homebrew revision does not resolve to a commit: $selected_revision"
  temp_root=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/ps2-emu-homebrew.XXXXXX")
  content_root=$temp_root
  public_paths=$(/usr/bin/git -C "$project_root" ls-tree -r --name-only "$resolved_revision")
  fixture_paths=$(printf '%s\n' "$public_paths" | /usr/bin/grep '^Resources/Fixtures/' || true)
else
  resolved_revision='working-tree'
  content_root=$project_root
  fixture_paths=$(/usr/bin/find "$project_root/Resources/Fixtures" \( -type f -o -type l \) -print 2>/dev/null \
    | /usr/bin/sed "s#^$project_root/##" \
    | LC_ALL=C /usr/bin/sort)
  if /usr/bin/git -C "$project_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    public_paths=$(/usr/bin/git -C "$project_root" ls-files --cached --others --exclude-standard)
  else
    public_paths=$fixture_paths
  fi
fi

expected_paths=$(printf '%s\n' "$expected_files" | /usr/bin/awk -F '|' '{print $1}' | LC_ALL=C /usr/bin/sort)
actual_fixture_paths=$(printf '%s\n' "$fixture_paths" | /usr/bin/sed '/^$/d' | LC_ALL=C /usr/bin/sort)
if [ "$actual_fixture_paths" != "$expected_paths" ]; then
  printf '%s\n' 'Bundled-homebrew allowlist mismatch.' >&2
  printf '%s\n%s\n' 'Expected exactly:' "$expected_paths" >&2
  printf '%s\n%s\n' 'Found:' "$actual_fixture_paths" >&2
  exit 74
fi

payload_paths=$(printf '%s\n' "$public_paths" | /usr/bin/grep -Ei '\.(iso|mds|isz|cso|cue|chd|elf)$' || true)
unexpected_payloads=$(printf '%s\n' "$payload_paths" | /usr/bin/grep -Fvx "$fixture_path" || true)
if [ -n "$unexpected_payloads" ]; then
  printf '%s\n' 'A game, disc, or homebrew payload outside the exact Cube Demo allowlist was found:' >&2
  printf '%s\n' "$unexpected_payloads" >&2
  exit 74
fi
if [ "$payload_paths" != "$fixture_path" ]; then
  fail "The only allowed payload must be exactly $fixture_path"
fi

printf '%s\n' "$expected_files" | while IFS='|' read -r relative_file expected_sha expected_size; do
  [ -n "$relative_file" ] || continue
  inspected_file="$content_root/$relative_file"

  if [ -n "$selected_revision" ]; then
    tree_record=$(/usr/bin/git -C "$project_root" ls-tree "$resolved_revision" -- "$relative_file")
    tree_mode=$(printf '%s\n' "$tree_record" | /usr/bin/awk '{print $1}')
    tree_type=$(printf '%s\n' "$tree_record" | /usr/bin/awk '{print $2}')
    [ "$tree_mode" = '100644' ] && [ "$tree_type" = 'blob' ] \
      || fail "Fixture entries must be ordinary non-executable Git blobs: $relative_file"
    /bin/mkdir -p "$(dirname -- "$inspected_file")"
    /usr/bin/git -C "$project_root" show "$resolved_revision:$relative_file" > "$inspected_file"
  fi

  [ -f "$inspected_file" ] && [ ! -L "$inspected_file" ] \
    || fail "Fixture entry is missing, not regular, or is a symlink: $relative_file"
  actual_size=$(/usr/bin/wc -c < "$inspected_file" | /usr/bin/tr -d '[:space:]')
  [ "$actual_size" = "$expected_size" ] \
    || fail "Fixture size mismatch for $relative_file: expected $expected_size, got $actual_size"
  actual_sha=$(sha256_file "$inspected_file")
  [ "$actual_sha" = "$expected_sha" ] \
    || fail "Fixture SHA-256 mismatch for $relative_file: expected $expected_sha, got $actual_sha"
done

elf_file="$content_root/$fixture_path"
elf_magic=$(/usr/bin/od -An -tx1 -N6 "$elf_file" | /usr/bin/tr -d '[:space:]')
[ "$elf_magic" = '7f454c460101' ] \
  || fail 'The authorized Cube Demo is not a 32-bit little-endian ELF.'

notice_file="$content_root/Resources/Fixtures/PS2SDK-CUBE-NOTICE.md"
for required_notice in \
  "$fixture_sha" \
  '39a89923ce59152fa855250cfacaccf8e581a1eb' \
  'b2d3c6e46a9d6348da2442b9ad76a4486d1522d2c802bc885f3afdbffa1a61f2' \
  'e15fcc76f5ae2f450a8359f7541ae806535992099f5df39dd180698b3ef52508' \
  '58fb6406408a541e0c826f47487315b485d4db56' \
  'df77d03bc1bd5765b40de554918a5ff541202548' \
  'not a commercial game' \
  'download or replace this fixture at runtime' \
  'a human must complete a final'
do
  /usr/bin/grep -F "$required_notice" "$notice_file" >/dev/null \
    || fail "Cube Demo notice is missing required provenance or release-gate text: $required_notice"
done

printf '%s\n' "Verified exact bundled PS2SDK Cube Demo, source, and license allowlist ($resolved_revision)."
