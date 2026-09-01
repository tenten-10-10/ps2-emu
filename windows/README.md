# PS2 Emu for Windows

This folder contains the Windows x64 and Windows ARM64 launcher. It packages
one exact, unmodified official `ps2dev/ps2sdk` Cube Demo homebrew fixture under
AFL 2.0 for first-run validation. It does not contain or download Play!,
commercial games, any other homebrew, BIOS files, keys, Qt, or compatibility
data.

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
The Cube Demo ELF, AFL 2.0 text, provenance notice, newlib license collection,
and GCC license/runtime-exception texts are copied outside `app.asar` under
`resources/PS2SDK-Cube-Demo/`. The ELF is accepted only at that exact path with
SHA-256 `1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584`.
It is added only to a genuinely new library, keeps the deterministic ID
`ps2sdk-cube-demo`, refreshes its installation path after an app update, is not
silently restored after removal, and is re-hashed immediately before launch.

## Owner-authorized signed release lane

The cross-packaging command above remains the unsigned internal lane. It never
loads a certificate or produces a public filename. After an owner has reviewed
one exact unsigned ZIP, prepared a code-signing certificate in the Windows
`CurrentUser\\My` certificate store, and confirmed a trusted RFC3161 timestamp
service, run the separate release signer on Windows:

```powershell
powershell.exe -NoLogo -NoProfile -File scripts/sign-windows-release.ps1 `
  -UnsignedZipPath 'C:\reviewed\PS2-Emu-0.1.0-Windows-x64-UNSIGNED-DO-NOT-DISTRIBUTE.zip' `
  -ReviewedUnsignedZipSha256 '64-character-reviewed-sha256' `
  -SourceRevision '40-character-reviewed-public-source-commit' `
  -CertificateThumbprint '40-character-current-user-certificate-thumbprint' `
  -TimestampUrl 'https://owner-approved-rfc3161-service.example'
```

Repeat with the separately reviewed ARM64 ZIP. The script derives and enforces
the architecture from the unsigned filename and package root. It then:

- verifies the reviewed input SHA-256 before extraction;
- requires the ZIP filename version and product identity to match the clean
  public checkout;
- rejects unsafe ZIP paths, reparse points, extra executables, Play.exe, Qt,
  commercial games, every other homebrew/ROM, BIOS material, credentials,
  private keys, and missing package files;
- verifies the exact `app.asar` allowlist and every packaged application source
  byte against the clean public checkout selected by `SourceRevision`;
- checks the exact x64 or ARM64 PE Machine value;
- requires one unexpired certificate with a private key and Code Signing EKU in
  `CurrentUser\\My`;
- signs only `PS2 Emu.exe` with SHA-256 and an RFC3161 timestamp;
- runs `signtool verify /pa /all /v /tw` and checks the signer and timestamp
  again with PowerShell;
- replaces the internal unsigned warning with the signed public README and adds
  `SOURCE-REVISION.txt`; and
- writes a distinct public-name candidate ZIP, `.sha256` file, and
  release-evidence JSON under `windows/dist/signed-candidates/` by default. The
  README and evidence keep public approval false until the human gates pass.

The script does not import, export, download, or print a certificate private
key, PFX password, token, or signing-service credential. Run `npm ci` and
`npm test` in `windows/` first so the pinned ASAR verifier is available.
Certificate enrollment,
private-key provisioning, publisher approval, and timestamp-service approval are
human responsibilities. Existing output files are never overwritten.

This lane does not publish a GitHub Release and does not replace Windows 11 x64
and ARM64 real-hardware, browser-download, Defender, SmartScreen, Smart App
Control, standard-user, external Play!, controller, audio, save, stop, and
relaunch evidence. Only the exact signed ZIP recorded by those tests may later
be promoted; do not rebuild it after hardware evidence is collected.

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
- final privacy, terms, support and non-affiliation review; and
- final human review of the Cube Demo AFL 2.0, newlib, and GCC runtime notice
  obligations, recorded in release evidence.
