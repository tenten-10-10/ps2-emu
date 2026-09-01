#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
revision=${1:-HEAD}

if ! /usr/bin/git -C "$project_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Public source checks require a reviewed Git repository." >&2
  exit 69
fi

resolved_revision=$(/usr/bin/git -C "$project_root" rev-parse --verify "$revision^{commit}" 2>/dev/null || true)
if ! printf '%s\n' "$resolved_revision" | /usr/bin/grep -Eq '^[0-9a-f]{40}$'; then
  echo "The selected source revision is not a 40-character commit: $revision" >&2
  exit 65
fi

restricted_path_pattern='(^|/)(AGENTS\.md|Vendor|\.build|\.swiftpm|dist|node_modules|artifacts|output|\.playwright-cli|\.vercel)(/|$)|(^|/)(\.DS_Store|\.env($|\.)|\.git-credentials|\.netrc|\.npmrc|id_(rsa|dsa|ecdsa|ed25519)|auth\.json|credentials\.json|secrets?\.json)$|\.(app|dmg|zip|exe|dll|dylib|so|a|lib|asar|node|p8|p12|pfx|key|pem|mobileprovision|provisionprofile)($|/)'

tracked_paths=$(/usr/bin/git -C "$project_root" ls-tree -r --name-only "$resolved_revision")
restricted_tracked=$(printf '%s\n' "$tracked_paths" | /usr/bin/grep -Ei "$restricted_path_pattern" || true)
if [ -n "$restricted_tracked" ]; then
  echo "Release revision tracks prohibited public-source paths:" >&2
  printf '%s\n' "$restricted_tracked" >&2
  exit 74
fi

unexpected_paths=""
while IFS= read -r tracked_path; do
  [ -n "$tracked_path" ] || continue
  case "$tracked_path" in
    .gitattributes|.github/*|.gitignore|LICENSE|Package.swift|PRIVACY.md|README.md|SECURITY.md|Resources/*|release/*|Sources/*|Tests/*|docs/*|scripts/*|site/*|windows/*) ;;
    *) unexpected_paths="${unexpected_paths}${tracked_path}\n" ;;
  esac
done <<EOF
$tracked_paths
EOF
if [ -n "$unexpected_paths" ]; then
  echo "Release revision contains paths outside the explicit public-source allowlist:" >&2
  printf '%b' "$unexpected_paths" >&2
  exit 74
fi

history_paths=$(/usr/bin/git -C "$project_root" rev-list --objects --all | /usr/bin/awk 'index($0, " ") { sub(/^[^ ]+ /, ""); print }')
restricted_history=$(printf '%s\n' "$history_paths" | /usr/bin/grep -Ei "$restricted_path_pattern" || true)
if [ -n "$restricted_history" ]; then
  echo "Git history contains prohibited public-source paths. Start a new clean public repository instead of rewriting this history:" >&2
  printf '%s\n' "$restricted_history" >&2
  exit 74
fi

echo "$resolved_revision"
