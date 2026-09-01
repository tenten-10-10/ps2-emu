# ADR-0003: Ship four launcher architectures without redistributing Play!

**Status:** Accepted for implementation; public release remains gated
**Date:** 2026-09-01
**Deciders:** Project owner before publication

## Context

The first MVP is a macOS SwiftUI launcher that delegates emulation to an
independently installed Play! application. The requested release matrix is:

1. Windows 11 x64
2. Windows ARM64 launcher with a separate x64 Play! process under Windows 11 Arm emulation
3. macOS Apple Silicon (`arm64`)
4. macOS Intel (`x86_64`)

Play!'s official macOS workflow produces a Universal binary containing arm64
and x86_64. Its official Windows workflow currently produces x64 and Win32,
but not Windows ARM64. Windows 11 on Arm can run x64 user-mode applications
through the operating system's emulation layer.

The current host is macOS arm64. It has an Apple Swift toolchain but no Windows
VM that can build and launch WinUI, no `winget`, no Visual Studio, and no .NET
SDK. An invalid Parallels Windows 11 registration exists but is not a usable
test environment.

## Decision

Keep the native SwiftUI implementation for macOS and build it separately for
arm64 and x86_64. Build the Windows launcher as a dependency-minimal Electron
desktop application, packaged from the Mac using official Electron win32 x64
and arm64 binaries.

Every public candidate remains an **external-core launcher**:

- no package contains `Play.app`, `Play.exe`, Qt, MoltenVK, `states.db`, a
  commercial game, BIOS, encryption key, or copyrighted game artwork; the
  exact separately licensed PS2SDK Cube Demo is the sole homebrew fixture;
- Play! is launched with an executable path and argument array, never through a
  shell command;
- the launcher accepts only supported local game extensions;
- the standard Windows core must be a regular x64 PE executable in the official
  installer's protected `%ProgramFiles%\Play\Play.exe` location with the
  expected adjacent Qt runtime layout;
- a custom Windows core requires an explicit user selection and a persistent
  modified-core warning;
- logs are drained, capped, private where the platform permits, and rotated;
- the app never silently downloads or updates Play!;
- official download buttons open an exact allowlisted HTTPS page in the user's
  default browser; and
- the standard Windows path accepts only the fixed official-CI x64 build whose
  Play.exe and required Qt files, version signals, registry DisplayVersion and
  unsigned Authenticode state exactly match the reviewed hash-only manifest;
- hash-only byte identity is never described as verified publisher identity,
  and the user must explicitly accept that limitation for the exact manifest
  identity before launch; and
- first-run lawful-use, non-affiliation, privacy, compatibility, and
  untrusted-input disclosures block library/core/launch actions until accepted.

The Windows ARM64 package contains a native ARM64 Electron launcher. It starts
the official x64 Play! process separately under Windows 11 Arm emulation. It is
not represented as a native ARM64 emulator core, and it is not supported on
Windows 10 on Arm.

Windows packages are unpackaged portable application folders inside ZIP files.
This avoids inventing an installer or package identity before Windows signing,
SmartScreen, clean-machine and uninstall behavior are tested.

## Options considered

### WinUI 3 packaged app

| Dimension | Assessment |
| --- | --- |
| Native Windows UX | Best |
| Current-host buildability | Blocked |
| x64 and ARM64 output | Supported on a configured Windows machine |
| Verification | Requires real Windows 11 x64 and Windows 11 ARM64 environments |

It remains a possible future replacement. It was not selected for this pass
because the required Windows toolchain and launch-verification environment do
not exist on the current host, and an unbuilt hand-written WinUI scaffold must
not be called a completed application.

### Electron launcher

| Dimension | Assessment |
| --- | --- |
| Current-host buildability | Supported for win32 x64 and arm64 |
| Cross-architecture packaging | Supported by official Electron binaries |
| Runtime size | High |
| Native fidelity | Lower than WinUI, but uses standard Windows controls and input behavior |

Selected because the exact Windows executables can be generated and
structurally verified now while preserving the same external-core boundary.

### Redistribute or rebuild Play! for every architecture

Rejected for the first release. The prior license audit blocks redistribution,
and upstream does not currently publish a Windows ARM64 core.

## Consequences

- Four launcher artifacts can be produced from the current Mac.
- macOS behavior stays native and existing user data remains compatible.
- Windows packages are larger because they include Electron/Chromium.
- Windows runtime and UI launch remain unverified until tested on actual Windows
  11 x64 and Windows 11 ARM64 systems.
- Windows ARM64 emulates the x64 core, so performance and compatibility may be
  lower than a future upstream-native ARM64 core.
- The owner selected the name PS2 Emu and MIT License with copyright holder
  `ten:ten`. Code signing, notarization, Windows Authenticode/SmartScreen,
  independent name review, real-hardware gameplay, and clean-machine evidence
  remain publication gates.
- The owner explicitly accepted hash-only verification for the fixed unsigned
  Windows Play! build. Any upstream update requires a new evidence review and
  manifest change before the standard-core path can accept it.

## Action items

1. **Completed 2026-09-01:** build and structurally verify all four unsigned local candidates.
2. Run the Windows packages on real Windows 11 x64 and Windows 11 ARM64 machines.
3. Verify Play! launch, controller, audio, saves, stop and relaunch on each OS.
4. **Completed 2026-09-01:** select PS2 Emu, MIT License, and `ten:ten` as the
   copyright holder.
5. Sign macOS artifacts with Developer ID and Windows artifacts with an
   Authenticode certificate, then run clean-machine reputation checks.
6. Enable website downloads only after every architecture-specific release gate
   passes.
