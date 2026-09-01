# Public Release Checklist: PS2 Emu 0.1.0

**Date:** 2026-09-01
**Intended distribution:** Free worldwide direct download
**Planned primary channel:** GitHub Releases (draft until every gate is complete)

## Current decision

**NO-GO for public download.** The owner selected the public name **PS2 Emu**, MIT License (`Copyright (c) 2026 ten:ten`), a source-publication intent, Ko-fi as the only first-release support provider, and an explicitly labelled hash-only Windows Play! policy. Four external-core launcher candidates exist for macOS arm64, macOS x86_64, Windows x64 and Windows ARM64, but none has a public-distribution signature and matching real-hardware plus clean-machine evidence is missing. The bundled-core lane remains local-only and is not a public candidate.

The teaser site may be published as “coming soon” before the binary. Its payment buttons must remain disabled until the chosen provider account, public wording, required disclosures, and live hosted payment page have been reviewed.

## Pre-release

- [x] Target app confirmed: PS2 Emu / macOS + Windows / `0.1.0`; macOS bundle ID `jp.planter.ps2emulator`
- [x] Target matrix fixed: macOS arm64, macOS x86_64, Windows x64, Windows ARM64 launcher with external x64 Play! compatibility core
- [x] macOS deployment target confirmed: macOS 14 or later
- [x] Unit and static rendering/DOM checks pass; legal ps2sdk graphical smoke and native Windows runtime tests remain pending
- [x] Release arm64 build succeeds
- [x] Release x86_64 cross-build succeeds; native Intel execution remains a separate gate
- [x] Build resolves a root-owned Apple-signed Swift toolchain through `xcrun` and uses a fresh isolated scratch path
- [x] External-core build omits Play.app, Qt, MoltenVK, states.db, and Play!-only notices
- [x] arm64 and x86_64 public-candidate DMGs have architecture-specific names and thin matching outer executables
- [x] Runtime strict-validation tests cover Bundle ID, version, Team ID, CDHash, signature, and architecture
- [x] Runtime pins distinct official Play! CDHashes for arm64 and x86_64 execution
- [x] No BIOS, commercial game image, encryption key, copyrighted game artwork, payment secret, or signing secret is included; the exact authorized PS2SDK Cube Demo is the only homebrew exception
- [x] Windows unit/static-security tests pass
- [x] Windows x64 and ARM64 packages have distinct exact filenames and PE Machine values (`0x8664` / `0xAA64`)
- [x] Windows packages contain a single launcher EXE, ASAR app, Electron/Chromium licenses and explicit unsigned warning
- [x] Windows package verifier rejects Play.exe, Qt DLLs, states.db, commercial games, every non-approved homebrew ELF, BIOS, keys, unsafe ZIP paths and unexpected executables
- [x] Canonical four-target release manifest exists and keeps all unsigned artifacts, hashes, publishers, downloads and payments blocked
- [x] Public-source allowlist, tracked/history denylist, source-archive checks and secret-free four-platform CI workflow are implemented
- [x] Windows hash-only identity schema, fixed upstream evidence and runtime collector fail closed around the single approved `0.77-7-g04bde0df` x64 build; publisher remains explicitly unverified
- [x] Public product name selected by the owner: `PS2 Emu`; independent trademark/legal review remains pending
- [x] MIT License added at top level with `Copyright (c) 2026 ten:ten`
- [ ] Public source is in a clean Git repository; explicit `SOURCE_REVISION` equals reviewed HEAD and is embedded in the app
- [ ] Support, privacy, security, refund, and commercial-disclosure pages reviewed
- [ ] Real graphical smoke test completed with the legal ps2sdk fixture
- [ ] Human final license review confirms the exact statically linked Cube Demo ELF, AFL 2.0, newlib and GCC notice/source obligations are satisfied
- [ ] AFL 2.0 text remains readable and the version-bound affirmative-assent gate is observed on all four final packages
- [x] Exact reviewed Play! `0.77-7-g04bde0df` has an authentication-free official CI acquisition path; fixed S3 DMG SHA-256 and byte identity with Actions run `31526392870` verified on 2026-09-01
- [ ] Separately installed official Play.app discovery and pinned strict validation completed on Apple Silicon and Intel Macs
- [ ] Controller, audio, memory-card, save-state, stop, and relaunch flows tested on both target architectures
- [ ] Clean-Mac first-launch test completed from each architecture-specific browser-downloaded artifact
- [ ] Windows 11 x64 and Windows 11 ARM64 first-launch completed from browser-downloaded artifacts on clean machines
- [x] Windows policy decision completed: labelled hash-only exception explicitly approved for the fixed upstream build; publisher remains unverified
- [x] Windows approved manifest populated from the fixed official-CI installer evidence and revalidated twice on every standard-core launch path
- [ ] Windows evidence collector and approved manifest reproduced on a real Windows installation
- [ ] Windows launch, controller, audio, saves, stop, relaunch and zero-wrapper-network behavior verified on both targets

## Signing and notarization

- [ ] Active Apple Developer Program membership confirmed
- [ ] Exact `Developer ID Application` identity confirmed without changing or deleting certificates
- [ ] Notary authentication profile explicitly authorized and configured
- [ ] Outer app signed with Developer ID, secure timestamp, and Hardened Runtime
- [ ] `get-task-allow` absent from the outer app
- [ ] Signed public app still has `PS2BundledPlayCore=false` and contains no Play.app or Play!-only notices
- [ ] Each signed public app has the matching `PS2TargetArchitecture` marker and thin Mach-O architecture
- [ ] DMG signed with Developer ID and secure timestamp
- [ ] Notary submission status is `Accepted`
- [ ] Notary log reviewed with no unresolved warnings
- [ ] Ticket stapled to and validated on the DMG
- [ ] `codesign`, `spctl`, `stapler`, and `hdiutil verify` all succeed

## Windows signing and clean-machine verification

- [ ] Owner-approved Authenticode publisher identity and timestamping process confirmed without placing signing material in source or artifacts
- [ ] Windows x64 and ARM64 launcher EXEs signed; no Play! binary is copied or re-signed
- [ ] `signtool verify /pa /all /v` succeeds for each final launcher
- [ ] Final ZIP verifier passes after signing and final archive creation
- [ ] Defender, SmartScreen and Smart App Control behavior recorded on clean Windows 11 x64 and ARM64 machines
- [ ] Standard-user extraction, launch, update-free operation and removal behavior recorded
- [ ] Windows ARM64 UI and release notes state that only the launcher is ARM64 native and the external Play! process is x64 under Windows 11 emulation
- [ ] Windows 10 Arm is rejected for the x64 compatibility-core lane

## Teaser site and voluntary support

- [x] English-first multilingual routes pass static accessibility and responsive checks
- [x] No analytics, advertising tracker, secret, or payment key is embedded
- [x] Four manual platform choices are shown in all eight languages; user-agent auto-download is absent
- [x] `downloadsEnabled=false`, `releaseVerificationComplete=false`, and all artifact URL/hash/publisher maps are empty
- [x] Vercel build/output boundary, upload allowlist and HTTP security headers are tested; a temporary anonymous `noindex` preview reached `READY`, is not production or persistent, and is scheduled to auto-expire at 2026-09-01 12:51:37 JST unless claimed
- [x] Ko-fi selected as the only first-release provider; no provider account URL or live recipient is approved
- [ ] Provider account country, legal entity, identity verification, payout account, and public business details confirmed
- [ ] Japanese Commercial Disclosure page reviewed and published if legally or contractually required
- [ ] Owner/legal review confirms support is described as a voluntary tip for already-provided free content, not a charitable donation or peer-to-peer transfer
- [ ] Owner/legal review confirms no reward, feature priority, support priority, ownership, or tax-deduction promise is attached
- [ ] Live HTTPS hosted support link and provider-controlled amount, minimum, currency, conversion and fee behavior reviewed
- [ ] Payment success, cancellation, receipt, refund-contact, and disabled-link behavior tested
- [ ] Tax treatment and bookkeeping confirmed with a qualified professional

## GitHub draft release

- [ ] Exact public `OWNER/REPO` confirmed
- [ ] Public repository initialized from the reviewed source tree
- [ ] Tag `v0.1.0` points to the reviewed release commit
- [ ] Draft release contains the notarized arm64 and x86_64 DMGs, Authenticode-signed Windows x64 and ARM64 ZIPs, per-architecture checksums, notices, SBOM/license materials, and required source assets
- [ ] Draft assets downloaded again and SHA-256 compared locally
- [ ] Each downloaded DMG passes Gatekeeper on a clean matching-architecture Mac; each ZIP passes the Windows clean-machine gates
- [ ] Release notes distinguish all four downloads and state OS/architecture requirements, Windows ARM64 x64-core emulation, compatibility limits, legal-use boundary, and non-affiliation
- [ ] Teaser site download URL points to the final GitHub asset
- [ ] Draft is published only after every preceding box is complete

## Bundled local-MVP lane — not a public candidate

These unresolved items block any future attempt to redistribute the bundled
lane, but they do not apply to the external-core launcher because those bytes
are absent:

- [ ] Complete third-party notices and corresponding-source/relinking materials for every redistributed component
- [ ] Qt LGPLv3/GPLv3 texts, exact Qt 6.10.3 source under distributor control, and tested modified-library installation instructions
- [ ] Play! transitive dependency notices, including MoltenVK and embedded dependencies
- [ ] Provenance/redistribution permission for `Play--Framework/src/idct/IEEE1180.cpp` and `states.db`
- [ ] Inner Play! fingerprint preserved across any authorized outer signing operation

## Post-release

- [ ] Confirm the public download, checksum, and first-launch flow from another network/device
- [ ] Monitor support email and GitHub issues for signing failures and crashes
- [ ] Confirm every enabled support link points to the intended account and currency
- [ ] Record the release URL, tag, all four SHA-256 values, macOS notarization submission IDs, Windows signer identity, and publication time
- [ ] Keep the previous notarized build available until the new build is verified

## Rollback triggers

- Gatekeeper rejects the browser-downloaded DMG or app.
- Authenticode, Defender, SmartScreen or Smart App Control rejects a browser-downloaded Windows candidate outside the reviewed expected behavior.
- The public artifact contains Play.app, Qt, MoltenVK, states.db, or Play!-only notices.
- A separately installed official Play! no longer matches the reviewed strict-validation values without a deliberate version review.
- A redistributed launcher component lacks a valid license notice.
- Windows ARM64 is presented as containing a native ARM64 Play! core, or silently runs the x64 core on an unsupported host.
- The app unexpectedly accesses the network, deletes user data, or leaves Play! orphaned.
- The support payment routes to the wrong account/currency, is described as a charitable donation, or creates an unreviewed tax/refund obligation.
- A crash blocks launch, file import, game start, or clean termination for a material share of users.

If any trigger fires, stop promotion and new downloads, preserve the affected artifact and evidence, and return the teaser site to “coming soon” until a corrected notarized build is ready.
