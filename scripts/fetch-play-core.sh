#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
vendor_dir="$project_root/Vendor"
core_app="$vendor_dir/Play.app"
# Official upstream Build macOS run 31526392870, commit 04bde0df87ee7c0e2f0151b51bb2cc22c88541da.
# The public S3 object was verified byte-identical to the Play_MacOS_dmg artifact payload.
expected_dmg_sha="14afd05a9da78071bbe99be54c9def818f976c583f612479a75bc5c39fd02aaa"
download_url="https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg"

if [[ -x "$core_app/Contents/MacOS/Play" ]]; then
  "$script_dir/validate-play-core.sh" "$core_app"
  exit 0
fi
if [[ -e "$core_app" ]]; then
  print -u2 "Refusing to overwrite an incomplete existing Play.app: $core_app"
  exit 73
fi

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/ps2-play-core.XXXXXX")"
mount_path="$temp_root/mount"
staged_core="$temp_root/Play.app"
mounted=0
cleanup() {
  if (( mounted )); then
    /usr/bin/hdiutil detach "$mount_path" >/dev/null 2>&1 || true
  fi
  if [[ -d "$temp_root" && "$temp_root" == *ps2-play-core.* ]]; then
    /bin/rm -R "$temp_root"
  fi
}
trap cleanup EXIT

mkdir -p "$mount_path"
dmg="$temp_root/Play.dmg"
/usr/bin/curl \
  --fail \
  --show-error \
  --silent \
  --location \
  --proto '=https' \
  --proto-redir '=https' \
  --tlsv1.2 \
  --max-redirs 3 \
  --output "$dmg" \
  "$download_url"

actual_sha="$(/usr/bin/shasum -a 256 "$dmg" | /usr/bin/awk '{print $1}')"
if [[ "$actual_sha" != "$expected_dmg_sha" ]]; then
  print -u2 "Play! DMG checksum mismatch. Expected $expected_dmg_sha, got $actual_sha"
  exit 74
fi

/usr/bin/hdiutil verify "$dmg" >/dev/null
/usr/bin/hdiutil attach -readonly -nobrowse -mountpoint "$mount_path" "$dmg" >/dev/null
mounted=1
/usr/bin/ditto "$mount_path/Play.app" "$staged_core"
/usr/bin/hdiutil detach "$mount_path" >/dev/null
mounted=0

"$script_dir/validate-play-core.sh" "$staged_core"
mkdir -p "$vendor_dir"
/usr/bin/ditto "$staged_core" "$core_app"
"$script_dir/validate-play-core.sh" "$core_app"

print "Fetched and verified: $core_app"
