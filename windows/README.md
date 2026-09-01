# PS2 Emu for Windows

This folder contains the Windows x64 and Windows ARM64 launcher. It does not
contain or download Play!, games, BIOS files, keys, Qt, or compatibility data.

## Architecture

- `win32-x64`: native x64 Electron launcher; external Play! x64 process.
- `win32-arm64`: native ARM64 Electron launcher; external Play! x64 process
  under Windows 11 Arm emulation.

The official installer uses `%ProgramFiles%\Play\Play.exe`. A standard core is
launchable only after runtime collection and fail-closed comparison of:

- Play.exe plus six required Qt DLL/plugin files: canonical path, byte size,
  SHA-256, and x64 PE machine;
- Play.exe ProductName, ProductVersion, FileVersion, and OriginalFilename;
- the installed registry DisplayVersion; and
- Authenticode status and signer fields.

The approved release is `play-0.77-7-g04bde0df-windows-x64-hash-only`, upstream
commit `04bde0df87ee7c0e2f0151b51bb2cc22c88541da`. It is unsigned: Authenticode
must report `NotSigned`, and no signer certificate or subject may be present.
The exact hash match proves byte identity with the reviewed build, not publisher
identity. PS2 Emu displays that limitation persistently and requires main-process
consent for the exact identity on first use and after any approved identity
change. Any file, size, machine, version, registry, or signature change blocks
standard-core launch.

A custom core remains a separate explicit trust exception. It must be a regular
x64 PE selected by the user; consent is bound to its normalized absolute path
and Play.exe SHA-256. It is never described as official or publisher verified.

## Fixed evidence

The source installer is the public CI object produced for the exact upstream
commit:

`https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play-x86-64.exe`

| Object | Bytes | SHA-256 |
|---|---:|---|
| installer | 10,876,483 | `8792b79b66118eacc99fb318545b766f1451396cb355adb0044a64fb8d6080b3` |
| Play.exe | 5,047,296 | `eeb14b7a3a407cc45ba2d85052b015a54995abae36251b78172f00de45a769fa` |
| Qt5Core.dll | 6,023,664 | `8d2ff4ce9096ddccc4f4cd62c2e41fc854cfd1b0d6e8d296645a7f5fd4ae565a` |
| Qt5Gui.dll | 7,008,240 | `5e7d2d41b8b92a880e83b8cc0ca173f5da61218604186196787ee1600956be1e` |
| Qt5Widgets.dll | 5,498,352 | `3788c669d4b645e5a576de9fc77fca776bf516d43c89143dc2ca28291ba14358` |
| platforms/qwindows.dll | 1,477,104 | `3333ba244c97264e3bd19db5953efa80a6e47aaced9d337ac3287ec718162b85` |
| styles/qwindowsvistastyle.dll | 144,368 | `d9b21182952682fe7ba63af1df24e23ace592c35b3f31eceef9f0eabeb5881b9` |
| imageformats/qjpeg.dll | 421,360 | `fb4e980cb5fafa8a4cd4239329aed93f7c32ed939c94b61fb2df657f3c6ad158` |

All seven runtime identity files must report PE machine `0x8664` (`x64`). The
version signals pinned in the manifest are:

- ProductName: `Play! - PlayStation2 Emulator`
- ProductVersion: `0.77-7-g04bde0df`
- FileVersion: `0.77-7-g04bde0df`
- OriginalFilename: `Play.exe`
- registry DisplayVersion: `0.77-7-g04bde0df`

The installer itself is an unsigned x86 NSIS bootstrap containing the x64
payload; its installer SHA-256 and byte size are provenance evidence and are not
rechecked at application runtime after installation.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm test
npm run capture
npm run package:windows
```

On Windows with Play! installed in Program Files:

```sh
npm run inspect:play-core
npm run verify:play-core
```

`inspect:play-core` emits observed Authenticode, version, registry, PE machine,
size, and SHA-256 evidence without approving it. `verify:play-core` applies the
same manifest verifier used immediately before runtime launch.

Cross-packaging produces:

- `PS2-Emu-0.1.0-Windows-x64-UNSIGNED-DO-NOT-DISTRIBUTE.zip`
- `PS2-Emu-0.1.0-Windows-ARM64-UNSIGNED-DO-NOT-DISTRIBUTE.zip`

Their package roots and executables are named `PS2 Emu-win32-*` and
`PS2 Emu.exe`. The internal npm package slug remains
`ps2-emulator-windows`. To preserve existing libraries after the product rename,
runtime user data remains in the previous `PS2 Emulator` user-data directory.

## Public-release boundary

The Windows wrapper source and package notice are MIT licensed under
`Copyright (c) 2026 ten:ten`. Hash-only approval of an external Play! core does not approve the PS2 Emu ZIPs
for public distribution. Do not publish a Windows ZIP until all of the following
are complete:

- exact clean source revision and MIT license inventory;
- Authenticode signing and final signature verification for PS2 Emu itself;
- Windows x64 and Windows 11 ARM64 real-hardware evidence;
- external Play! launch, controller, audio, save, stop and relaunch tests;
- clean-machine browser-download/SmartScreen evidence; and
- final privacy, terms, support and non-affiliation review.
