#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir="${0:A:h}"
project_root="${script_dir:h}"
revision="${SOURCE_REVISION:-}"

if [[ -z "$revision" ]]; then
  print -u2 "SOURCE_REVISION is required for a public release operation."
  exit 64
fi
if ! /usr/bin/git -C "$project_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  print -u2 "Public release operations require a reviewed Git repository."
  exit 69
fi
resolved_revision="$(/usr/bin/git -C "$project_root" rev-parse --verify "$revision^{commit}" 2>/dev/null || true)"
if [[ ! "$resolved_revision" =~ '^[0-9a-f]{40}$' ]]; then
  print -u2 "SOURCE_REVISION does not resolve to a commit: $revision"
  exit 65
fi
head_revision="$(/usr/bin/git -C "$project_root" rev-parse HEAD)"
if [[ "$resolved_revision" != "$head_revision" ]]; then
  print -u2 "SOURCE_REVISION does not match HEAD: source=$resolved_revision head=$head_revision"
  exit 74
fi
if [[ -n "$(/usr/bin/git -C "$project_root" status --porcelain)" ]]; then
  print -u2 "Public release operations require a clean working tree, including no untracked files."
  exit 74
fi
if ! /usr/bin/git -C "$project_root" cat-file -e "${resolved_revision}:LICENSE" 2>/dev/null; then
  print -u2 "The release revision does not contain a wrapper LICENSE."
  exit 66
fi
revision_version="$(/usr/bin/git -C "$project_root" show "${resolved_revision}:Resources/Info.plist" | /usr/bin/plutil -extract CFBundleShortVersionString raw -o - - 2>/dev/null || true)"
working_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$project_root/Resources/Info.plist")"
if [[ -z "$revision_version" || "$revision_version" != "$working_version" ]]; then
  print -u2 "Release version does not match SOURCE_REVISION: source=${revision_version:-missing} working=$working_version"
  exit 74
fi

checked_revision="$(/bin/sh "$script_dir/check-public-source-paths.sh" "$resolved_revision")"
if [[ "$checked_revision" != "$resolved_revision" ]]; then
  print -u2 "Public-source path verification returned an unexpected revision."
  exit 74
fi

print -r -- "$resolved_revision"
