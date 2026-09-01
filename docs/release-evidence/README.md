# Release evidence

Create one directory per release version. Evidence files are human-completed
records; scripts must never generate a passing record without the named test
actually being performed.

For version `0.1.0`, record independent evidence for both macOS target
architectures:

```text
docs/release-evidence/0.1.0/arm64/REAL_HARDWARE_TEST.md
docs/release-evidence/0.1.0/arm64/CLEAN_MAC_GATEKEEPER_TEST.md
docs/release-evidence/0.1.0/x86_64/REAL_HARDWARE_TEST.md
docs/release-evidence/0.1.0/x86_64/CLEAN_MAC_GATEKEEPER_TEST.md
```

`public-release-preflight.sh` selects the matching directory through
`PS2_TARGET_ARCH`. Evidence from one architecture never satisfies the other.

Do not mark a test passed based only on a build, Simulator, self-test, mount, or
local machine that already trusted an earlier copy.

## Real hardware template

Record the tester, date/time/timezone, Mac model, chip, macOS build, app version,
DMG SHA-256, input device, legal test fixture, and results for rendering, audio,
controller, memory card, save state, stop, relaunch, app quit, and save recovery.
Record every failure and link it to an issue or release blocker.

The recorded chip must match the evidence directory: Apple Silicon for
`arm64`, and a supported Intel Mac for `x86_64`. Running the x86_64 binary under
Rosetta is useful supplementary coverage but is not Intel release evidence.

## Clean Mac Gatekeeper template

Record the tester, date/time/timezone, clean Mac model, macOS build, browser,
download URL, downloaded SHA-256, Developer ID identity shown, Gatekeeper result,
first launch result, notarization/stapling checks, and whether any security
bypass was requested. A passing record requires no bypass.
