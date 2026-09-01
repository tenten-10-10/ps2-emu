# macOS external-core public-release candidate lane

**Scope:** macOS arm64 and x86_64 only. Windows x64 and Windows ARM64 are
covered by [ADR-0003](ADR-0003-four-platform-distribution.md) and the
[Windows README](../windows/README.md).

**Status:** Both macOS artifacts are unsigned local candidates. Neither is
published or approved for distribution.

## Purpose

This macOS candidate lane packages only the PS2 Emu SwiftUI wrapper.
It does **not** put `Play.app`, Qt frameworks or plugins, MoltenVK, Play!'s
`states.db`, or the Play!-only notices into the app or DMG.

This avoids redistributing those third-party binaries. It does not remove the
wrapper's own licensing, signing, notarization, privacy, trademark, testing,
support, tax, or payment obligations. This document is an engineering control,
not legal advice.

## Two explicit distribution modes

| Setting | Intended use | Play.app in output | Default |
| --- | --- | --- | --- |
| `PS2_BUNDLE_PLAY=1` | Local MVP and internal testing | Yes | Yes |
| `PS2_BUNDLE_PLAY=0` | Public-unbundled candidate | No | No |

Omitting the variable always selects the existing bundled local-MVP behavior.
The verifier only permits an absent core when `PS2_BUNDLE_PLAY=0` is provided
explicitly. Invalid values stop the build.

`PLAY_CORE_APP` and `PS2_BUNDLE_PLAY=0` are mutually exclusive. The first
selects a core to copy into a bundled build; the second forbids copying a core.

## macOS architectures

`PS2_TARGET_ARCH` selects a thin outer launcher executable:

| Setting | Host class | Public artifact suffix | Default |
| --- | --- | --- | --- |
| `PS2_TARGET_ARCH=arm64` | Apple Silicon | `macOS-arm64.dmg` | Yes |
| `PS2_TARGET_ARCH=x86_64` | Intel Mac | `macOS-x86_64.dmg` | No |

Omitting the variable preserves the existing arm64 behavior. Any other value
fails closed. The build writes `PS2TargetArchitecture` into `Info.plist`, and
verification requires the outer Mach-O to contain exactly the selected
architecture. Use separate output directories because both builds contain an
app named `PS2 Emu.app`.

## Build and verify

Use a dedicated output directory so bundled and unbundled candidates cannot be
confused:

```sh
PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=arm64 \
./scripts/build-app.sh '/absolute/path/to/unbundled-arm64-output'

PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=arm64 \
./scripts/verify-app.sh '/absolute/path/to/unbundled-arm64-output/PS2 Emu.app'

PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=x86_64 \
./scripts/build-app.sh '/absolute/path/to/unbundled-x86_64-output'

PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=x86_64 \
./scripts/verify-app.sh '/absolute/path/to/unbundled-x86_64-output/PS2 Emu.app'
```

The unbundled verifier requires all of the following:

- the outer executable and bundle signature are valid;
- the architecture marker and thin outer Mach-O match `PS2_TARGET_ARCH`;
- the build marker says the distribution is external-core;
- `Contents/Helpers/Play.app` is absent;
- `Play-License.txt` and the current Play!-only
  `THIRD-PARTY-NOTICES.md` are absent from the app.

The binary's existing `--self-test` validates the pinned bundled core, so it is
intentionally not invoked for an unbundled candidate. Public release evidence
must instead cover installation/selection of an external Play.app and the real
hardware tests listed below.

## Package, sign, and notarize

An unsigned local package can be exercised without release credentials:

```sh
PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=arm64 \
./scripts/package-dmg.sh '/absolute/path/to/unbundled-arm64-output'

PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=x86_64 \
./scripts/package-dmg.sh '/absolute/path/to/unbundled-x86_64-output'
```

Unsigned local candidates are named:

```text
PS2-Emu-0.1.0-macOS-arm64-UNSIGNED-DO-NOT-DISTRIBUTE.dmg
PS2-Emu-0.1.0-macOS-x86_64-UNSIGNED-DO-NOT-DISTRIBUTE.dmg
```

Only a Developer ID-signed external-core package receives the final candidate
name `PS2-Emu-0.1.0-launcher-macOS-<arch>.dmg`. Bundled local-MVP artifacts
use `LOCAL-DO-NOT-DISTRIBUTE`; unsigned external-core artifacts use
`UNSIGNED-DO-NOT-DISTRIBUTE`.

For an owner-authorized release, provide only the exact Developer ID identity
already present on the machine. The script signs the outer wrapper and DMG; it
does not access or modify certificates itself.

```sh
PS2_BUNDLE_PLAY=0 \
PS2_TARGET_ARCH=arm64 \
DEVELOPER_ID_APPLICATION='Developer ID Application: Legal Name (TEAMID)' \
EXPECTED_OUTER_TEAM_ID='TEAMID' \
SOURCE_REVISION='40-character-reviewed-commit' \
./scripts/package-dmg.sh '/absolute/path/to/unbundled-output'
```

Notarization remains a separate, owner-authorized step using an existing
keychain profile:

```sh
NOTARYTOOL_PROFILE='ps2-emulator-notary' \
EXPECTED_OUTER_TEAM_ID='TEAMID' \
SOURCE_REVISION='the-same-40-character-reviewed-commit' \
PS2_BUNDLE_PLAY=0 \
PS2_TARGET_ARCH=arm64 \
./scripts/notarize-dmg.sh \
  '/absolute/path/to/unbundled-arm64-output/PS2-Emu-0.1.0-launcher-macOS-arm64.dmg'
```

Repeat signing, verification, notarization, and evidence collection separately
with `PS2_TARGET_ARCH=x86_64`; never reuse one architecture's notary or hardware
evidence for the other. Default notary evidence paths include the architecture.

Release signing and notarization are intentionally refused for the bundled
local-MVP lane. `verify-release-dmg.sh` binds the public artifact to the exact
launcher filename, bundle ID, version/build, owner-approved Team ID,
external-core marker, required wrapper documents, and absence of Play.app.
The app also embeds the exact reviewed Git commit. Release operations require a
clean worktree, a top-level wrapper LICENSE at that commit, and
`SOURCE_REVISION` resolving to the current HEAD.

Do not put certificate names, Apple credentials, notary passwords, API private
keys, or local machine paths into committed files.

## Runtime integration requirement

An unbundled wrapper needs an independently installed Play.app. Without an
environment override, the current runtime resolves the first existing
candidate in this order:

1. the bundled `Contents/Helpers/Play.app` location;
2. `/Applications/Play.app`;
3. `~/Applications/Play.app`.

The unbundled build has no first candidate, so a separately installed official
build in either Applications folder is discovered automatically and still goes
through the pinned strict publisher, signature, identity, version, CDHash, and
architecture validation.

Strict validation currently requires Play! `0.77-7-g04bde0df` and selects the
matching code directory hash for the launcher's execution architecture:

- arm64: `3c5b7d6d748717f218ef7be0e6b83109728463bd`
- x86_64: `ff080b2d4cd99ed6faf0eb5d2ace7f41d28980da`

The floating official download page still supplies `0.70`, but the official
upstream CI also publishes the exact reviewed build at the commit-addressed URL
below:

```text
https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg
SHA-256: 14afd05a9da78071bbe99be54c9def818f976c583f612479a75bc5c39fd02aaa
```

On 2026-09-01 this public object was byte-identical to the DMG inside official
Build macOS run `31526392870`, artifact `Play_MacOS_dmg`. This closes the
ordinary-user acquisition mismatch for the pinned build, subject to a fresh
availability and hash check at release time. Do not weaken the check to accept
`0.70`, a version range, Team-ID-only trust, or either CDHash on the wrong
execution architecture.

Developers can explicitly opt into a user-modified external build only when
both of these process variables are present:

```text
PS2_EMULATOR_CORE_APP=/absolute/path/to/Play.app
PS2_EMULATOR_ALLOW_MODIFIED_CORE=1
```

That environment-variable interface is suitable for development, not ordinary
consumer onboarding, and it intentionally uses the reduced `userModified`
validation mode. Before publication, the automatic Applications-folder flow,
missing-core guidance, official download instructions, compatibility checks,
and recovery when Play.app is moved or removed must all be tested on real and
clean Macs. The wrapper must not silently download, copy, modify, or re-sign
Play.app.

## Public preflight

Run the public preflight with the same explicit mode:

```sh
PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=arm64 \
./scripts/public-release-preflight.sh '/absolute/path/to/unbundled-arm64-output'

PS2_BUNDLE_PLAY=0 PS2_TARGET_ARCH=x86_64 \
./scripts/public-release-preflight.sh '/absolute/path/to/unbundled-x86_64-output'
```

External-core mode removes the bundled Play!/Qt/MoltenVK redistribution gates,
but the preflight still requires:

- a reviewed top-level wrapper `LICENSE`;
- Developer ID signing with Hardened Runtime;
- a signed, notarized, stapled, Gatekeeper-accepted DMG;
- real-Mac evidence for external-core selection, graphics, audio, controller,
  memory card, save state, stop, and relaunch on each target architecture;
- a clean-Mac browser-download and Gatekeeper test;
- the reviewed teaser-site build and human legal/release-owner review.

Bundled mode remains available for local MVP testing, but the automated public
preflight intentionally reports it as blocked until a complete reviewed
redistribution package exists for every included component.

Cross-compilation proves that the x86_64 launcher builds; it does not replace
execution on a supported Intel Mac. Likewise, arm64 evidence must come from an
Apple Silicon Mac. Both independently installed Play.app flows must be tested.
