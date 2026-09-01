#!/bin/zsh

set -euo pipefail
PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
repository="tenten-10-10/ps2-emu"
bundle_root="${RELEASE_EVIDENCE_BUNDLE_ROOT:-}"
source_revision="${SOURCE_REVISION:-}"

if [[ "${PS2_DRAFT_UPLOAD_APPROVED:-}" != "1" ]]; then
  print -u2 "Set PS2_DRAFT_UPLOAD_APPROVED=1 only when the owner has approved creating or updating the private GitHub draft."
  exit 78
fi
if [[ -z "$bundle_root" || "$bundle_root" != /* ]]; then
  print -u2 "RELEASE_EVIDENCE_BUNDLE_ROOT must be an absolute external directory."
  exit 64
fi
if [[ ! "$source_revision" =~ '^[0-9a-f]{40}$' ]]; then
  print -u2 "SOURCE_REVISION must be the exact 40-character reviewed commit."
  exit 64
fi
if ! command -v gh >/dev/null 2>&1; then
  print -u2 "GitHub CLI is required."
  exit 69
fi
if ! gh auth status >/dev/null 2>&1; then
  print -u2 "GitHub CLI is not authenticated for the release owner."
  exit 77
fi

verified_revision="$(SOURCE_REVISION="$source_revision" "$script_dir/verify-release-source.sh")"
if [[ "$verified_revision" != "$source_revision" ]]; then
  print -u2 "Reviewed source verification returned an unexpected revision."
  exit 74
fi

origin_url="$(/usr/bin/git -C "$project_root" remote get-url origin 2>/dev/null || true)"
case "$origin_url" in
  git@github.com:tenten-10-10/ps2-emu.git | https://github.com/tenten-10-10/ps2-emu.git) ;;
  *)
    print -u2 "Refusing a GitHub draft upload from an unexpected origin: ${origin_url:-missing}"
    exit 74
    ;;
esac

SOURCE_REVISION="$source_revision" \
RELEASE_EVIDENCE_BUNDLE_ROOT="$bundle_root" \
  /usr/bin/env node "$script_dir/prepare-release-bundle.mjs"

version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$project_root/Resources/Info.plist")"
tag="v$version"
title="PS2 Emu $version"
draft_notes="$project_root/release/DRAFT_RELEASE_NOTES_${version}.md"
final_notes="$project_root/release/RELEASE_NOTES_${version}.md"
for notes_path in "$draft_notes" "$final_notes"; do
  if [[ ! -f "$notes_path" ]]; then
    print -u2 "Release notes are missing: $notes_path"
    exit 66
  fi
done

remote_tag="$(/usr/bin/git -C "$project_root" ls-remote origin "refs/tags/$tag" | /usr/bin/awk '{print $1}')"
if [[ -n "$remote_tag" && "$remote_tag" != "$source_revision" ]]; then
  print -u2 "Existing remote tag does not match SOURCE_REVISION: tag=$remote_tag source=$source_revision"
  exit 74
fi

release_rows="$(gh api "repos/$repository/releases?per_page=100" \
  --jq ".[] | select(.tag_name == \"$tag\") | [.id, .draft, .target_commitish, .html_url] | @tsv")"
release_count="$(print -r -- "$release_rows" | /usr/bin/awk 'NF { count += 1 } END { print count + 0 }')"
if (( release_count > 1 )); then
  print -u2 "Multiple GitHub releases unexpectedly use tag $tag."
  exit 74
fi
if (( release_count == 0 )); then
  gh release create "$tag" \
    --repo "$repository" \
    --draft \
    --target "$source_revision" \
    --title "$title" \
    --notes-file "$draft_notes" >/dev/null
  release_rows="$(gh api "repos/$repository/releases?per_page=100" \
    --jq ".[] | select(.tag_name == \"$tag\") | [.id, .draft, .target_commitish, .html_url] | @tsv")"
fi

release_id="$(print -r -- "$release_rows" | /usr/bin/awk -F '\t' 'NF { print $1 }')"
release_draft="$(print -r -- "$release_rows" | /usr/bin/awk -F '\t' 'NF { print $2 }')"
release_target="$(print -r -- "$release_rows" | /usr/bin/awk -F '\t' 'NF { print $3 }')"
release_url="$(print -r -- "$release_rows" | /usr/bin/awk -F '\t' 'NF { print $4 }')"
if [[ "$release_draft" != "true" ]]; then
  print -u2 "Refusing to alter a published release for $tag."
  exit 78
fi
if [[ "$release_target" != "$source_revision" ]]; then
  print -u2 "Draft target does not match SOURCE_REVISION: draft=$release_target source=$source_revision"
  exit 74
fi

asset_paths=(
  "$bundle_root/source/PS2-Emu-${version}-source.zip"
  "$bundle_root/artifacts/PS2-Emu-${version}-launcher-macOS-arm64.dmg"
  "$bundle_root/artifacts/PS2-Emu-${version}-launcher-macOS-x86_64.dmg"
  "$bundle_root/artifacts/PS2-Emu-${version}-launcher-Windows-x64.zip"
  "$bundle_root/artifacts/PS2-Emu-${version}-launcher-Windows-ARM64.zip"
  "$bundle_root/evidence/${version}-macos-arm64.json"
  "$bundle_root/evidence/${version}-macos-x86_64.json"
  "$bundle_root/evidence/${version}-windows-x64.json"
  "$bundle_root/evidence/${version}-windows-arm64.json"
  "$bundle_root/release-record.json"
  "$bundle_root/CHECKSUMS.txt"
)
for asset_path in "${asset_paths[@]}"; do
  if [[ ! -f "$asset_path" || -L "$asset_path" ]]; then
    print -u2 "Required draft asset is missing or unsafe: $asset_path"
    exit 66
  fi
done

remote_assets="$(gh api "repos/$repository/releases/$release_id/assets?per_page=100" --paginate --jq '.[].name')"
remote_asset_count="$(print -r -- "$remote_assets" | /usr/bin/awk 'NF { count += 1 } END { print count + 0 }')"
if (( remote_asset_count == 0 )); then
  gh release upload "$tag" "${asset_paths[@]}" --repo "$repository"
else
  expected_names="$(for asset_path in "${asset_paths[@]}"; do print -r -- "${asset_path:t}"; done | /usr/bin/sort)"
  actual_names="$(print -r -- "$remote_assets" | /usr/bin/sort)"
  if [[ "$actual_names" != "$expected_names" ]]; then
    print -u2 "Existing draft assets are partial or unexpected; refusing to replace them."
    print -u2 "Expected:\n$expected_names"
    print -u2 "Found:\n$actual_names"
    exit 74
  fi
fi

download_root="$(mktemp -d "${TMPDIR:-/tmp}/ps2-emu-draft-verify.XXXXXX")"
cleanup() {
  if [[ -d "$download_root" && "$download_root" == *ps2-emu-draft-verify.* ]]; then
    /bin/rm -R "$download_root"
  fi
}
trap cleanup EXIT
gh release download "$tag" --repo "$repository" --dir "$download_root"
for local_asset in "${asset_paths[@]}"; do
  downloaded_asset="$download_root/${local_asset:t}"
  if [[ ! -f "$downloaded_asset" || -L "$downloaded_asset" ]]; then
    print -u2 "Draft asset could not be downloaded safely: ${local_asset:t}"
    exit 74
  fi
  local_sha="$(/usr/bin/shasum -a 256 "$local_asset" | /usr/bin/awk '{print $1}')"
  downloaded_sha="$(/usr/bin/shasum -a 256 "$downloaded_asset" | /usr/bin/awk '{print $1}')"
  if [[ "$local_sha" != "$downloaded_sha" ]]; then
    print -u2 "Downloaded draft asset hash mismatch: ${local_asset:t}"
    exit 74
  fi
done

gh release edit "$tag" \
  --repo "$repository" \
  --draft \
  --target "$source_revision" \
  --title "$title" \
  --notes-file "$final_notes" >/dev/null
final_state="$(gh api "repos/$repository/releases/$release_id" --jq '[.draft, .target_commitish, (.assets | length)] | @tsv')"
if [[ "$final_state" != $'true\t'"$source_revision"$'\t'"${#asset_paths}" ]]; then
  print -u2 "Draft release state changed unexpectedly after verification: $final_state"
  exit 74
fi

print "Verified private GitHub draft: $release_url"
print "Target source revision: $source_revision"
print "Verified assets: ${#asset_paths}"
print "Publication: not performed; draft remains private and unpublished."
