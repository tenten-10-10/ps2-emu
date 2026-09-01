# Privacy notice

**Effective date:** Not yet effective — draft for the first public release
**Last updated:** 2026-09-01

PS2 Emu is a local desktop library and launcher. The planned release has
four launcher targets: macOS 14 or later on Apple Silicon and Intel, Windows 11
x64, and a native Windows ARM64 launcher that runs a separate x64 Play! process
through Windows 11's compatibility layer. The launcher does not require an
account and does not include analytics, advertising, or an automatic
crash-reporting service.

No public release exists yet. Version 0.1.0 artifacts are unsigned local
verification candidates and must not be distributed as trusted downloads. All
four planned public packages are external-core launchers: they do not include
`Play.app`, `Play.exe`, Qt, MoltenVK, `states.db`, commercial games, BIOS files,
encryption keys, or copyrighted game artwork. They include only the separately
licensed, hash-pinned PS2SDK Cube Demo as an open-source validation fixture.
Play! must be installed separately.

## Data stored on your device

The launcher stores the game titles you add, absolute game-file paths,
favorites, custom titles where supported, recent play history, and settings on
your device. The macOS launcher also stores paths for folders selected for later
rescanning; the Windows launcher scans a selected folder once and does not save
it as a watched folder. The launcher also writes diagnostic logs that may
contain game names, local paths, process state, and error messages. Game files
are referenced in place; they are not uploaded or copied into the launcher
library.

### macOS Apple Silicon and Intel

Both macOS builds use the same per-user locations:

```text
~/Library/Application Support/PS2 Emulator/library.json
~/Library/Logs/PS2 Emulator/
```

General macOS preferences are stored through `UserDefaults` under the
`jp.planter.ps2emulator` domain. Launcher logs are created with owner-only file
permissions where macOS permits, capped at 10 MiB per file, and rotated to the
newest 20 regular `.log` files.

### Windows x64 and Windows ARM64

Both Windows builds use Electron's per-user data and log locations. With the
default Windows configuration these are:

```text
%APPDATA%\PS2 Emulator\library.json
%APPDATA%\PS2 Emulator\logs\PS2 Emulator\
```

Windows or an administrator may redirect `%APPDATA%`; the in-app **Show logs**
button opens the actual log directory in use. Windows preferences, including a
custom-core path and the consent values bound to an exact path and SHA-256, are
stored in `library.json`. Logs are capped at 10 MiB per file and rotated to the
newest 20 regular `.log` files. The launcher requests restrictive file modes,
but effective access on Windows is controlled by the account's inherited NTFS
permissions and local policy.

`PS2 Emulator` in these paths is the stable internal directory name retained
from builds made before the public name became PS2 Emu. Version 0.1.0 keeps it
so an upgrade does not silently create a second empty library or strand logs.
It is not a second product or a network identifier.

The Windows ARM64 launcher stores the same categories of data as the Windows
x64 launcher. The separate Play! process remains x64 and is run by Windows 11's
x64 compatibility layer; this does not create a native ARM64 emulator core.

## Data handled by Play!

The launcher does not transmit its library or logs. Opening an official Play!
download link hands an allowlisted HTTPS page to your default browser; it does
not download or update Play! silently.

The separately installed Play! application controls its own settings, saves,
memory cards, save states, logs, caches, and any engine-level network activity.
Those locations and behaviors are governed by the Play! build you install and
are separate from PS2 Emu's launcher data.

## Deleting local launcher data

Quit PS2 Emu and Play! before deleting data. On macOS, remove the two
macOS locations listed above. On Windows, remove `library.json` and the log
directory shown above, or use **Show logs** first to confirm the active log
location.

Deleting launcher data does not delete the game files it references and does
not remove every item owned by Play!. Do not delete Play! data unless you
understand its save and memory-card locations and have made any needed backups.

## Teaser and support website

The static teaser is designed without first-party analytics, advertising
trackers, accounts, or first-party cookies. Its hosting provider may process
ordinary request information such as IP address, user agent, requested path,
and timestamp for delivery, abuse prevention, and reliability.

Voluntary support is currently disabled. If it is enabled after review, the
site will open an external hosted page from the named payment provider. That
provider processes the payment and applies its own privacy terms. The teaser
does not receive or store full card details or payment-provider secret keys.

## Support email

If you email `cless@planter.jp`, the message, email address, and information you
choose to provide are used to respond and maintain relevant support and
security records. Review diagnostic logs before sharing them because they may
contain game names and local paths. Do not send games, BIOS files, keys,
credentials, payment card details, or payment-provider secrets.

## Changes and contact

This draft will be reviewed before the first public release and updated when
data handling materially changes. Privacy questions can be sent to
`cless@planter.jp`.
