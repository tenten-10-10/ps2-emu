#!/bin/zsh

set -euo pipefail
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

core_app="${1:-}"
expected_bundle_id="com.virtualapplications.Play"
expected_team_id="YXKF5365BY"
expected_version="0.77-7-g04bde0df"
expected_arm64_cdhash="3c5b7d6d748717f218ef7be0e6b83109728463bd"
expected_x86_64_cdhash="ff080b2d4cd99ed6faf0eb5d2ace7f41d28980da"

if [[ -z "$core_app" || ! -d "$core_app" ]]; then
  print -u2 "usage: validate-play-core.sh /absolute/path/to/Play.app"
  exit 64
fi

executable="$core_app/Contents/MacOS/Play"
plist="$core_app/Contents/Info.plist"
[[ -x "$executable" ]] || { print -u2 "Play executable is missing"; exit 66; }
[[ -f "$plist" ]] || { print -u2 "Play Info.plist is missing"; exit 66; }

bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
[[ "$bundle_id" == "$expected_bundle_id" ]] || { print -u2 "Unexpected Play Bundle ID: $bundle_id"; exit 65; }
[[ "$version" == "$expected_version" ]] || { print -u2 "Unexpected Play version: $version"; exit 65; }

/usr/bin/codesign --verify --deep --strict --all-architectures "$core_app"
for architecture expected_cdhash in \
  arm64 "$expected_arm64_cdhash" \
  x86_64 "$expected_x86_64_cdhash"; do
  details="$(/usr/bin/codesign -dv --verbose=4 --arch "$architecture" "$core_app" 2>&1)"
  team_id="$(print -r -- "$details" | /usr/bin/awk -F= '/^TeamIdentifier=/{print $2; exit}')"
  cdhash="$(print -r -- "$details" | /usr/bin/awk -F= '/^CDHash=/{print $2; exit}')"
  identifier="$(print -r -- "$details" | /usr/bin/awk -F= '/^Identifier=/{print $2; exit}')"

  [[ "$identifier" == "$expected_bundle_id" ]] || { print -u2 "Unexpected $architecture signed identifier: $identifier"; exit 65; }
  [[ "$team_id" == "$expected_team_id" ]] || { print -u2 "Unexpected $architecture Play Team ID: $team_id"; exit 65; }
  [[ "$cdhash" == "$expected_cdhash" ]] || { print -u2 "Unexpected $architecture Play CDHash: $cdhash"; exit 65; }
done

/usr/sbin/spctl -a -vv "$core_app"
cli_version="$($executable --version)"
[[ "$cli_version" == "Play! Version: $expected_version" ]] || { print -u2 "Unexpected Play CLI version: $cli_version"; exit 65; }

print "Verified Play! core: bundle=$bundle_id team=$expected_team_id arm64_cdhash=$expected_arm64_cdhash x86_64_cdhash=$expected_x86_64_cdhash version=$version"
