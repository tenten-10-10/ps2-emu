# ADR-0002: Do not redistribute the Play! binary in the first public release

- **Status:** Accepted for release engineering; public publication remains gated
- **Date:** 2026-09-01
- **Scope:** First free worldwide macOS release

## Context

The local MVP contains an unmodified official Play! macOS application. That is
useful for development and establishes a working end-to-end launcher. A binary
redistributor, however, must independently satisfy every applicable license and
provenance obligation for everything in that application bundle.

The audited Play! bundle contains dynamically linked Qt 6.10.3 frameworks and
plugins, MoltenVK and embedded dependencies, and statically linked Play!
dependencies. The current distribution does not yet include the complete
notices, corresponding Qt source under distributor control, or modified-library
installation instructions required for the chosen Qt open-source license path.

Two additional provenance questions cannot be resolved from the published
upstream material alone:

1. `Play--Framework/src/idct/IEEE1180.cpp` attributes code to the MPEG Software
   Simulation Group and says “All Rights Reserved,” but a component-specific
   redistribution grant was not found.
2. The generated `states.db` derives from issue data in `Play-Compatibility`,
   whose repository did not contain an explicit data license during the audit.

Free-of-charge distribution does not remove these obligations.

## Decision

The first public PS2 Emu package will **not contain `Play.app`**. It will:

- provide the native library/launcher only;
- discover an independently installed official Play! application in standard
  macOS application locations;
- link to the exact commit-addressed Play! object published by the official
  upstream CI, while retaining the matching Actions run as provenance, rather
  than mirror or bundle its binary;
- clearly disclose that Play! is a separate, independent project;
- keep strict identity/fingerprint validation for the known tested upstream
  build when that exact build is selected;
- allow an explicitly opted-in external user-modified core mode with a prominent
  security warning, so compatible modified Qt libraries are not technically
  prohibited by this launcher; and
- never download a core silently or accept an unknown core without explicit
  user action.

The current bundled build remains a local development artifact and is marked
**not for redistribution**.

## Exact-version acquisition evidence

The strict launcher policy accepts only the reviewed Play! build
`0.77-7-g04bde0df`, including its architecture-specific code directory hashes:

- arm64: `3c5b7d6d748717f218ef7be0e6b83109728463bd`
- x86_64: `ff080b2d4cd99ed6faf0eb5d2ace7f41d28980da`

The general upstream download page still presents stable Play! `0.70`, which
does not pass this policy. The official upstream workflow for commit
`04bde0df87ee7c0e2f0151b51bb2cc22c88541da`, however, also publishes its build
to a public, commit-addressed S3 object:

- macOS DMG: <https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg>
- SHA-256: `14afd05a9da78071bbe99be54c9def818f976c583f612479a75bc5c39fd02aaa`
- provenance: [official Build macOS run 31526392870](https://github.com/jpd002/Play-/actions/runs/31526392870), artifact `Play_MacOS_dmg`

The public S3 DMG was downloaded without authentication on 2026-09-01 and was
byte-identical to the DMG inside that official Actions artifact. Its embedded
`Play.app` reports `0.77-7-g04bde0df`, contains both arm64 and x86_64 slices,
and passes the pinned Developer ID, Team ID, signature, Gatekeeper, and
architecture-specific CDHash checks above. The exact-version acquisition
mismatch is therefore resolved for this reviewed build; the S3 object's
availability and SHA-256 must still be rechecked immediately before release.

This evidence is not a reason to accept the floating stable page, `0.70`, a
version range, any binary signed by the same Team ID, or only one matching
architecture as an automatic fallback. The explicit user-modified-core opt-in
remains available for experts but is visibly unverified and does not satisfy
strict official-core validation.

## Consequences

The public setup has one additional step: users obtain Play! from its official
publisher. The launcher cannot claim to be a self-contained emulator package,
and the teaser must not say that the engine is bundled.

This decision removes Play!, Qt, MoltenVK, `states.db`, and the unresolved MSSG
object from the bytes conveyed by the first public package. It does not remove
the need to:

- choose a license for this Swift launcher;
- Developer ID sign and notarize the launcher DMG;
- publish accurate trademark/non-affiliation and lawful-use notices;
- test the exact supported external Play! build on real hardware;
- explain Play!'s separate privacy, storage, network, and support boundary; or
- obtain professional advice before representing this as globally cleared.

## Future bundled edition

A bundled edition may be reconsidered only after all of the following are
documented and reproducible:

- explicit permission or a clearly licensed replacement for the MSSG-derived
  IDCT implementation;
- an explicit license for `states.db`, or a build that excludes it;
- exact notices for Play! and all static/dynamic dependencies;
- LGPLv3/GPLv3 texts, Qt 6.10.3 attributions, corresponding source controlled
  by this distributor, and tested relinking/installation instructions;
- an exact binary-to-source manifest and repeatable build;
- successful code-signing/notarization without removing the user's ability to
  install and execute an interface-compatible modified Qt build; and
- a fresh legal and release-readiness review of the final bytes.
