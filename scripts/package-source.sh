#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
output_root="${1:-$project_root/dist}"
revision="${SOURCE_REVISION:-HEAD}"

if ! /usr/bin/git -C "$project_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print -u2 "Source archives must be produced from a reviewed Git repository."
  exit 69
fi

if [[ -n "$(/usr/bin/git -C "$project_root" status --porcelain)" ]]; then
  print -u2 "Refusing to archive a dirty working tree. Commit or intentionally discard changes first."
  exit 65
fi

resolved_revision="$(/usr/bin/git -C "$project_root" rev-parse --verify "$revision^{commit}" 2>/dev/null || true)"
if [[ ! "$resolved_revision" =~ '^[0-9a-f]{40}$' ]]; then
  print -u2 "The selected SOURCE_REVISION does not resolve to a commit: $revision"
  exit 65
fi
version="$(/usr/bin/git -C "$project_root" show "${resolved_revision}:Resources/Info.plist" | /usr/bin/plutil -extract CFBundleShortVersionString raw -o - - 2>/dev/null || true)"
if [[ -z "$version" ]]; then
  print -u2 "The selected revision does not contain a readable release version."
  exit 66
fi
filename="PS2-Emu-${version}-source.zip"
output_zip="$output_root/$filename"

if ! /usr/bin/git -C "$project_root" cat-file -e "${resolved_revision}:LICENSE" 2>/dev/null; then
  print -u2 "The selected revision does not contain a wrapper LICENSE."
  exit 66
fi

checked_revision="$(/bin/sh "$script_dir/check-public-source-paths.sh" "$resolved_revision")"
if [[ "$checked_revision" != "$resolved_revision" ]]; then
  print -u2 "Public-source path verification returned an unexpected revision."
  exit 74
fi

allowlist_source="$(/usr/bin/git -C "$project_root" show "${resolved_revision}:scripts/public-source-paths.txt" 2>/dev/null || true)"
if [[ -z "$allowlist_source" ]]; then
  print -u2 "The selected revision does not contain scripts/public-source-paths.txt."
  exit 66
fi
source_paths=()
while IFS= read -r source_path; do
  [[ -z "$source_path" || "$source_path" == \#* ]] && continue
  if [[ "$source_path" == /* || "$source_path" == *".."* || "$source_path" == *" "* ]]; then
    print -u2 "Unsafe public-source allowlist entry: $source_path"
    exit 74
  fi
  if ! /usr/bin/git -C "$project_root" cat-file -e "${resolved_revision}:${source_path}" 2>/dev/null; then
    print -u2 "Public-source allowlist entry is missing from the selected revision: $source_path"
    exit 66
  fi
  source_paths+=("$source_path")
done <<< "$allowlist_source"
if (( ${#source_paths} == 0 )); then
  print -u2 "Public-source allowlist is empty."
  exit 66
fi

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/ps2-emulator-source.XXXXXX")"
temp_zip="$temp_root/$filename"
cleanup() {
  if [[ -d "$temp_root" && "$temp_root" == *ps2-emulator-source.* ]]; then
    /bin/rm -R "$temp_root"
  fi
}
trap cleanup EXIT

/usr/bin/git -C "$project_root" archive \
  --format=zip \
  --prefix="PS2-Emu-${version}-source/" \
  --output="$temp_zip" \
  "$resolved_revision" \
  -- "${source_paths[@]}"

archive_entries="$(/usr/bin/unzip -Z1 "$temp_zip")"
if print -r -- "$archive_entries" | /usr/bin/grep -Eqi '(^|/)(AGENTS\.md|Vendor|\.build|\.swiftpm|dist|node_modules|artifacts|output|\.playwright-cli|\.vercel)(/|$)|(^|/)(\.DS_Store|\.env($|\.)|id_(rsa|dsa|ecdsa|ed25519)|\.git-credentials|\.netrc|\.npmrc|auth\.json|credentials\.json|secrets?\.json)$|\.(app|dmg|zip|exe|dll|dylib|so|a|lib|asar|node|p8|p12|pfx|key|pem|mobileprovision|provisionprofile)($|/)'; then
  print -u2 "Source archive contains an internal, generated, credential, or signing-material path."
  exit 74
fi

users_prefix="/Users"
volumes_prefix="/Volumes"
codex_fragment=".codex"
archive_strings="$temp_root/archive.strings"
/usr/bin/unzip -p "$temp_zip" | /usr/bin/strings > "$archive_strings"
if /usr/bin/grep -F "$users_prefix/" "$archive_strings" >/dev/null \
  || /usr/bin/grep -F "$volumes_prefix/" "$archive_strings" >/dev/null \
  || /usr/bin/grep -F "$codex_fragment/" "$archive_strings" >/dev/null \
  || /usr/bin/grep -Eqi -- '-----BEGIN (OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----|(^|[^A-Z0-9])(AKIA|ASIA)[A-Z0-9]{16}([^A-Z0-9]|$)|(^|[^A-Za-z0-9])(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(live|test)_[A-Za-z0-9]{16,})([^A-Za-z0-9]|$)|xox[baprs]-[A-Za-z0-9-]{10,}' "$archive_strings"; then
  print -u2 "Source archive contains a local absolute path or possible credential/private-key material."
  exit 74
fi

mkdir -p "$output_root"
if [[ -e "$output_zip" ]]; then
  backup_root="$project_root/.build/previous-source-archives"
  mkdir -p "$backup_root"
  backup="$backup_root/${filename}.previous-$(date +%Y%m%d-%H%M%S)"
  /bin/mv "$output_zip" "$backup"
  print "Previous source archive preserved at: $backup"
fi

/bin/mv "$temp_zip" "$output_zip"
print "Packaged source: $output_zip"
/usr/bin/shasum -a 256 "$output_zip"
