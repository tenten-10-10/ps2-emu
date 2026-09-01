# PS2 Emu 0.1.0

PS2 Emu is a free, open-source local game library and launcher for macOS and
Windows. It organizes files you are legally allowed to use and starts the
independent Play! emulator as a separate process.

## Choose the matching launcher

- **macOS Apple silicon:** macOS 14 or later, `arm64` launcher, separately
  installed official Play! for Apple silicon.
- **macOS Intel:** macOS 14 or later, `x86_64` launcher, separately installed
  official Play! for Intel.
- **Windows x64:** Windows 11 x64 launcher and separately installed approved
  x64 Play! build.
- **Windows on Arm:** native ARM64 launcher on Windows 11 on Arm. Play! remains
  an x64 process and runs through Windows 11 x64 emulation; this is not an
  ARM64-native Play! core.

The four public packages contain the PS2 Emu launcher, its required launcher
runtime, and one separately licensed open-source validation fixture: the
hash-pinned PS2SDK Cube Demo. They do not contain Play!, a PlayStation 2 BIOS,
commercial games, encryption keys, or copyrighted game artwork, and PS2 Emu
does not download those items. The Cube Demo package includes its exact source
provenance and the required ps2sdk, newlib, and GCC license notices.

## Verify the download

Compare the downloaded file with `CHECKSUMS.txt` and the machine-readable
`release-record.json` attached to this release. Use only the exact signed file
for your operating system and architecture. The release record binds all four
artifact hashes and their platform evidence to one reviewed public source
revision.

## Important limitations

- Use only disc images you legally own and are permitted to copy, or homebrew
  ELF files you are permitted to run.
- A recognized file extension does not guarantee compatibility with a
  particular title.
- The game window, graphics, audio, controller handling, memory cards, and save
  states are provided by the separate Play! application.
- Windows uses an explicitly disclosed hash-only identity policy for one fixed,
  unsigned upstream Play! build. Exact reviewed bytes are verified before each
  standard-core launch, but this does not prove the upstream publisher's
  identity.

PS2 Emu is an independent, unofficial project. It is not affiliated with or
endorsed by Sony Interactive Entertainment, PlayStation, or the Play! project.
The PS2 Emu wrapper source is licensed under the MIT License, Copyright (c) 2026
ten:ten. Play! is a separate project under its own license.

Documentation and multilingual legal pages are available at
https://tenten-10-10.github.io/ps2-emu/.
