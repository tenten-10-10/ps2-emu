# Wrapper license decision

**Status:** decided by the owner on 2026-09-01.

## Decision

- Public product name: **PS2 Emu**
- Wrapper license: **MIT License**
- Copyright notice: `Copyright (c) 2026 ten:ten`
- Source-publication intent: publish the wrapper source as open source
- Bundle identifier: keep `jp.planter.ps2emulator`

The complete license text is the top-level [`LICENSE`](../LICENSE). Public
source archives and repository releases must include it unchanged. The release
manifest and source verifier fail if the license identifier, copyright holder,
year, or top-level text drifts from this decision.

The MIT decision applies only to the PS2 Emu wrapper source owned by its
copyright holder. It does not relicense Play!, Qt, MoltenVK, Electron,
Chromium, Sony or PlayStation software, games, artwork, BIOS files, keys, or
other third-party material. Each independently distributed component keeps its
own license and provenance requirements.

The bundled `PS2SDK Cube Demo` is therefore not MIT-licensed by `ten:ten`.
It retains the ps2sdk Academic Free License 2.0 terms and the package also
reproduces the newlib and GCC runtime notices required by its statically linked
code. The exact fixture source, build provenance and hashes are recorded in its
bundled notice.

The formal product-name decision does not itself constitute trademark or legal
clearance. Non-affiliation wording and an owner/legal review remain publication
gates for worldwide promotion.
