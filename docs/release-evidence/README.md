# Release evidence

This directory contains only the **schema, blank templates, and validator** for
PS2 Emu release evidence. It must never contain a completed hardware test,
notarization record, Authenticode record, screenshot, log, final artifact, or
tester identity.

Completed evidence is created only after the final source revision and final
signed artifact exist. Store it in a release work directory outside the Git
repository, then freeze that directory as an immutable evidence bundle.

## Why completed evidence stays outside Git

A release artifact is bound to an exact source commit. If a completed evidence
record containing that artifact's SHA-256 were committed back into the source
tree, the commit would change, invalidating the source revision embedded in the
artifact. Rebuilding for the new commit would produce a new artifact and a new
SHA-256, creating a self-reference loop.

The boundary is therefore:

- Git contains `release-evidence.schema.json`, four `*.template.json` files,
  `validate-evidence.mjs`, and this README.
- The final app/ZIP/DMG is built from one reviewed clean commit.
- Human tests record that commit and the final artifact bytes in an external
  release work directory.
- Completed records and their attachments are never copied into this repo.
- Corrections create a new evidence bundle revision. Do not overwrite a frozen
  bundle or rewrite a truthful failure as a pass.

## Files in this directory

```text
docs/release-evidence/
├── README.md
├── release-evidence.schema.json
├── validate-evidence.mjs
└── templates/
    ├── 0.1.0-macos-arm64.template.json
    ├── 0.1.0-macos-x86_64.template.json
    ├── 0.1.0-windows-x64.template.json
    └── 0.1.0-windows-arm64.template.json
```

Each record includes:

- product version, exact Git source revision, source archive name/size/SHA-256;
- final artifact name/size/SHA-256 and browser-download URL/SHA-256;
- the source revision reported by the final artifact and a hashed raw binding
  check showing that it exactly matches the source revision;
- platform, launcher/core architecture, observed OS/build and physical hardware;
- Developer ID/notarization/stapling/Gatekeeper results on macOS, or
  Authenticode/timestamp/Defender/SmartScreen/Smart App Control on Windows;
- independently installed Play! acquisition and strict identity evidence;
- external-core discovery, launch, graphics, audio, controller, save, stop and
  relaunch observations;
- standard-user, removal and wrapper-network observations;
- tester alias/role/timezone/timestamps, attestation, failures and hashed
  bundle-relative attachments.

Do not record a password, API key, certificate private key, token, phone number,
home address, personal email address, `/Users/...`, `C:\Users\...`, or another
personal local path. Use a stable non-email tester alias. A hardware model and
OS build are required; a serial number is not.

## External release work directory

Create the work directory outside the repository. This example layout is the
contract used by `--require-pass`:

```text
PS2-Emu-0.1.0-release-work/
├── source/
│   └── PS2-Emu-0.1.0-source.zip
├── artifacts/
│   ├── <final macOS arm64 DMG>
│   ├── <final macOS x86_64 DMG>
│   ├── <final Windows x64 ZIP>
│   └── <final Windows ARM64 ZIP>
├── evidence/
│   ├── macos-arm64.json
│   ├── macos-x86_64.json
│   ├── windows-x64.json
│   └── windows-arm64.json
├── attachments/
│   └── <logs, screenshots, command output, and raw identity evidence>
└── CHECKSUMS.txt
```

Copy the four templates into `evidence/`, rename them, and edit only those
external copies. Change `recordState` from `template` to `completed` only after
every required observation has actually been performed.
`attachments[].relativePath` is relative to the release work directory, such as
`attachments/macos-arm64/notary-log.json`, and must start with `attachments/`.
Every `sourceBinding.rawEvidenceSha256`, `externalPlay.rawEvidenceSha256`, macOS
`notaryLogSha256`, and Windows `requiredFileSetEvidenceSha256` value must match
the SHA-256 of a listed attachment.

The record must describe the final browser-downloaded bytes, not an earlier
local build. `download.downloadedSha256` must equal `finalArtifact.sha256`.
Source and final artifacts are re-read from `source/` and `artifacts/` during the
passing validation command.

## Validation commands

From the public repository root, first validate the committed blank templates:

```sh
node docs/release-evidence/validate-evidence.mjs \
  --template docs/release-evidence/templates/*.template.json
```

Validate structurally complete, truthful observations even when a test failed
or was blocked:

```sh
node docs/release-evidence/validate-evidence.mjs \
  --completed /absolute/path/outside/repo/PS2-Emu-0.1.0-release-work/evidence/*.json
```

Run the final fail-closed gate only against the external release work directory:

```sh
RELEASE_EVIDENCE_BUNDLE_ROOT='/absolute/path/outside/repo/PS2-Emu-0.1.0-release-work' \
node docs/release-evidence/validate-evidence.mjs \
  --require-pass \
  /absolute/path/outside/repo/PS2-Emu-0.1.0-release-work/evidence/*.json
```

For all four records, the observed `functionalTests.fixture` must identify the
included validation sample rather than a commercial game image:

- `name`: `PS2SDK Cube Demo`
- `kind`: `homebrew-elf`
- `sha256`: `1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584`
- `sourceURL`: the exact ps2sdk `39a89923ce59152fa855250cfacaccf8e581a1eb`
  `ee/draw/samples/cube` tree
- `legalBasis`: a truthful note that the unmodified sample is AFL-2.0
  homebrew and that the final package contains the reviewed ps2sdk, newlib,
  GCC GPLv3, and GCC Runtime Library Exception notices

Do not prefill these observation fields in the committed templates. The tester
must copy the values only after hashing and launching the exact sample from the
final artifact.

`--require-pass` checks that:

- all four platform records are supplied together, exactly once, and agree on
  version, source revision, and source archive bytes;
- every required result is `pass` and no failure is recorded;
- platform-specific signature/security fields have the expected passing state;
- the observed external Play! version and identity lane match the pinned policy;
- the downloaded artifact SHA-256 equals the final artifact SHA-256;
- the source revision reported from inside the final artifact exactly equals
  the record's Git source revision;
- source archive, final artifact, and attachment files exist below the named
  bundle root, are regular non-symlink files, and match recorded size/SHA-256;
- the test was performed on named physical hardware without a security bypass;
- the tester explicitly attested that the values were observed, matched the
  final artifact, and were not fabricated.

The passing command also rejects an evidence bundle inside this Git repository,
an evidence JSON outside the bundle's `evidence/` directory, symlinked evidence
or attachment files, a partial platform set, and duplicate final artifacts.

After validation, generate `CHECKSUMS.txt` over the completed records,
attachments, source archive and final artifacts. Freeze the bundle in
write-protected or versioned storage. The checksum file itself belongs to the
external bundle, not to this source directory.

## Human-observation boundary

The JSON Schema and validator can check shape, consistency, hashes, file bytes,
and declared gate results. They **cannot** see or prove graphics, hear audio,
press a controller, verify that a tester actually used a standard account,
confirm removal behavior, establish legal ownership of a game image, establish
publisher identity, or turn a typed `"pass"` into a real observation.

Neither the schema nor the validator generates a completed record, fills a
result, signs an attestation, takes a screenshot, or changes `recordState`.
Passing validation is necessary but is not, by itself, release approval. The
release owner must review the named hardware, raw logs/screenshots, truthful
failures, signature/notary output and final artifact hashes before authorizing a
GitHub Release.

In particular, anyone or any process able to edit a JSON file can type
`"result": "pass"` and `true` attestations. Hash checks prevent silent byte
substitution after recording, but they do not prove that a screenshot is
authentic or that a human performed the described action. Do not configure a
GitHub Release workflow to treat validator exit status as the sole approval.
Require release-owner review of the immutable external bundle as the final
human gate.

## Platform-specific evidence

For macOS, use independent records for Apple Silicon and native Intel hardware.
An x86_64 run under Rosetta is supplementary and cannot satisfy the Intel
template. Record the final DMG's Developer ID identity, Team ID, hardened
runtime, secure timestamp, absence of `get-task-allow`, notary submission/log,
stapled ticket, Gatekeeper result and whether any bypass was used.

For Windows, use independent physical Windows 11 x64 and Windows 11 Arm records.
Record `signtool verify /pa /all /v`, trusted timestamp, Defender, SmartScreen,
Smart App Control, standard-user and removal behavior. The ARM64 template always
records an ARM64-native launcher with an external x64 Play! process under
Windows 11 x64 emulation.

The approved Windows Play! lane is hash-only: exact file bytes can match while
the publisher remains unverified. Preserve the raw output from
`npm run inspect:play-core` and `npm run verify:play-core` as hashed external
attachments. On macOS, preserve the corresponding strict Developer ID,
architecture, version and CDHash validation output. Never copy Play!, games,
BIOS files, keys or signing credentials into the evidence bundle.
