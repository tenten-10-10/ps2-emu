# Security policy

## Supported releases

No public release exists yet. Version 0.1.0 has four unsigned local verification
candidates:

| Candidate | Launcher | Separate Play! process |
| --- | --- | --- |
| macOS Apple Silicon | arm64, macOS 14 or later | arm64 |
| macOS Intel | x86_64, macOS 14 or later | x86_64 |
| Windows x64 | x64, Windows 11 test target | x64 |
| Windows ARM64 | native ARM64 launcher, Windows 11 on Arm | x64 through Windows compatibility emulation |

These candidates are not trusted public downloads and must not be published or
shared with end users. When releases begin, only the newest signed release will
be supported. Download it from the official release page and verify the
published SHA-256 checksum and exact platform name.

### Signing warnings

- A valid public macOS build must identify the expected Developer ID publisher,
  pass Gatekeeper, and use a notarized and stapled DMG. Do not bypass a
  Gatekeeper warning for a file obtained from an unknown source.
- A valid public Windows build must have the expected Authenticode publisher
  and timestamp and must pass the documented Defender, SmartScreen, and Smart
  App Control checks. Do not select **Run anyway**, disable those protections,
  or add an exclusion for an unsigned local candidate.

Warnings are expected for the current unsigned local artifacts; that is why
they are blocked from public distribution. A warning alone does not establish
that a file is malicious, but bypassing it is not an approved installation or
test procedure.

## Reporting a vulnerability

Email `cless@planter.jp` with the subject `PS2 Emu security report`.
Include, where relevant:

- the PS2 Emu version and exact artifact filename;
- the launcher target: macOS arm64, macOS x86_64, Windows x64, or Windows ARM64;
- the exact OS version/build and physical device architecture;
- the downloaded artifact's SHA-256 and the displayed signing or security
  warning;
- whether the standard or a custom Play! core was selected;
- the Play! version, architecture, path, SHA-256, and publisher status if known;
- minimal reproduction steps, observed behavior, expected behavior, and impact;
  and
- a redacted launcher log or screenshot if it is needed to reproduce the issue.

Do not attach copyrighted games, BIOS files, keys, credentials, payment data,
or personal data. Remove usernames and local paths from logs and screenshots
unless a specific value is essential to the report. Please avoid filing a
public issue for an unpatched vulnerability.

Receipt will normally be acknowledged within seven days. A remediation or
status update will normally follow within 30 days, depending on severity and
whether the issue is in this launcher or the independent Play! engine. These
times are targets, not a service-level agreement or bounty promise.

## Trust boundaries

- Every planned public package is an external-core launcher. It contains no
  `Play.app`, `Play.exe`, Qt, MoltenVK, `states.db`, game, BIOS, encryption key,
  or copyrighted game artwork. The bundled Play! lane is for local development
  only and is not a public release candidate.
- The macOS launcher validates a separately installed official Play! app's
  version, Bundle ID, Developer ID team, code directory hash, nested code
  signatures, and CPU architecture before launching it.
- The standard Windows core must be the fixed official-CI x64 build at
  `%ProgramFiles%\Play\Play.exe`. Immediately before every launch, the runtime
  requires exact SHA-256, size and x64 PE-machine matches for Play.exe and six
  required Qt files, exact Play.exe and registry version signals, and an
  Authenticode result of `NotSigned` with no signer. A second identity check is
  performed after user consent and before process creation.
- This Windows hash-only policy proves equality with reviewed bytes; it does
  not prove their publisher. The launcher displays that limitation and binds
  consent to the exact approved identity. Any approved-file, version,
  registry, signature, or manifest change blocks the standard-core path until
  it is deliberately reviewed.
- A custom macOS core requires both documented expert environment variables and
  is visibly marked as not security verified. A custom Windows core requires
  explicit user selection and approval bound to its exact absolute path and
  SHA-256; its publisher and version remain unverified.
- The Windows ARM64 package contains a native ARM64 Electron launcher, not a
  native ARM64 Play! core. It asks for explicit consent before Windows 11 runs
  the separate x64 core through its compatibility layer. Windows 10 on Arm is
  not supported for this lane.
- Disc images and ELF programs are untrusted input. Only open files you created
  or obtained lawfully from a source you trust. A supported extension does not
  mean a file is safe or compatible.
- Play! runs as a separate, non-sandboxed process and may use JIT capabilities.
  Engine vulnerabilities should also be reported to the Play! project when
  appropriate.
- The launcher has no updater, analytics SDK, account, or payment code. It does
  not silently download or update Play!. The separately installed Play!
  application owns its runtime behavior and may use network or local-data
  features independently.
- The project never requests game files, BIOS files, encryption keys, Apple or
  Microsoft credentials, payment card data, or payment-provider secrets in a
  bug report.

## Local data

Launcher data may contain local paths and play history:

| Platform | Library data | Launcher logs |
| --- | --- | --- |
| macOS arm64 / x86_64 | `~/Library/Application Support/PS2 Emulator/library.json` | `~/Library/Logs/PS2 Emulator/` |
| Windows x64 / ARM64 | `%APPDATA%\PS2 Emulator\library.json` | normally `%APPDATA%\PS2 Emulator\logs\PS2 Emulator\` |

The legacy `PS2 Emulator` directory component is intentionally preserved as a
stable local-data identifier after the public product name changed to PS2 Emu.

Windows or an administrator may redirect `%APPDATA%`; **Show logs** opens the
actual Windows log directory. Play! owns its settings, memory cards, save
states, and game saves separately. Quit both applications before deleting
local data, and keep backups of saves you care about.

## Release integrity

The wrapper is now licensed under MIT. All four public binaries remain blocked
until a reviewed source revision is present, each package is external-core and
contains no Play! binary, and matching real-hardware plus clean-machine
evidence exists.

The two macOS artifacts additionally require Developer ID signing, Hardened
Runtime, signed DMGs, notarization, stapling, Gatekeeper checks, and native
Apple Silicon/Intel verification. The two Windows artifacts additionally
require an owner-approved Authenticode identity and timestamp for the PS2 Emu
launcher, the reviewed hash-only manifest for the external x64 Play!
installation, native-Windows verification of its evidence collector,
post-signing ZIP verification, and clean Windows 11
Defender/SmartScreen/Smart App Control evidence. Windows ARM64 release material
must always say that only the launcher is ARM64 native and that the Play! core
is x64 under Windows 11 emulation.
