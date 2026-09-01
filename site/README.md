# PS2 Emu teaser site

A dependency-free, multilingual static teaser for the four PS2 Emu launcher targets: macOS Apple Silicon, macOS Intel, Windows x64, and a native Windows ARM64 launcher that runs the separate x64 Play! process through Windows 11 emulation. It uses the current macOS interface and a separately labelled Windows development preview; it does not present the macOS image as Windows runtime evidence. The site includes no Sony/PlayStation logos, game art, ROMs or BIOS files.

## Routes and languages

English is served at `/`. Localized routes are generated for:

- Japanese: `/ja/`
- Spanish: `/es/`
- French: `/fr/`
- German: `/de/`
- Brazilian Portuguese: `/pt-BR/`
- Korean: `/ko/`
- Simplified Chinese: `/zh-CN/`

Each locale also has `/privacy/`, `/terms/`, `/support/`, `/refund-policy/` and `/commercial-disclosure/` beneath its locale prefix. English legal routes live at the root. Every generated page has a matching `lang`, Open Graph metadata and a Twitter summary card. With a real production origin, the build also emits canonical, all locale `hreflang` entries, `x-default` and a sitemap.

## Build and preview

Requires Node.js 24 and Python 3 only for the convenience preview server. No npm dependencies are installed.

```sh
cd '/path/to/ps2-emulator/site'
npm run build
npm test
npm run preview
```

Then open `http://localhost:4173/`. The deployable directory is `dist/`. Stop the preview server with `Ctrl-C` when finished.

Before a real deployment, replace `https://ps2-emu.example` in `site.config.mjs` with the final HTTPS origin and rebuild. A `.example` build deliberately emits `noindex,nofollow`, a blocking `robots.txt`, no sitemap, no canonical and no placeholder `hreflang` URLs. This makes a temporary preview non-crawlable and prevents it from pretending to be production-ready.

## Four-platform download gate

All four download buttons are disabled. `public/download-config.js` keeps two independent global gates off and leaves every URL, SHA-256, publisher and host binding empty. Windows ARM64 is labelled precisely as a native ARM64 launcher that runs the separate x64 Play! process through Windows 11 emulation; it is not described as an ARM64-native emulator core.

Do not enable a target until its exact artifact has passed the platform release checklist. Enabling later requires:

- `downloadsEnabled: true` and `releaseVerificationComplete: true`;
- an HTTPS artifact URL on an explicitly owner-approved host;
- the exact SHA-256, publisher identity and architecture in both artifact maps;
- a `.dmg` for macOS or `.zip` for Windows; and
- signing, clean-machine, real-hardware and compatibility evidence for that architecture.

The browser never chooses a download from the user agent. The visitor always makes an explicit platform choice. There is no download API, updater or remote configuration fetch.

## Voluntary tip configuration

The free app download and voluntary tip must remain separate. The copy describes a tip only after the user has used the already-provided free app/content. A tip does not buy a future feature, license, access, priority support or reward; it is not a charitable donation and no tax deduction is promised.

All payment UI is currently disabled. Keep `paymentsEnabled: false` in `public/support-config.js` until all of the following are complete:

- provider identity/KYC and permitted-use review;
- operator/business and Japanese commercial-disclosure review;
- tax, accounting, currency and recordkeeping review;
- final privacy and refund language;
- real support contact and response process;
- a notarized public app actually available free of charge.

The public configuration accepts only a hosted Ko-fi profile link matching `https://ko-fi.com/...`. Stripe, GitHub Sponsors, PayPal.Me, Amazon Pay and Discord coin are not implemented as support choices. The client performs an exact HTTPS host/path allowlist check and ignores every other URL. It uses no iframe, Ko-fi SDK, API call, access token or secret. Never place a secret key in this repository.

After the legal/payment review, configure the Ko-fi profile according to Ko-fi's current terms, paste its public URL into `links.kofi`, and verify the visible recipient and payout destination with the owner. Copy that exact verified URL into `ownerApprovedLinks.kofi`, then set `recipientVerificationComplete: true`. The client requires an exact URL match between both maps. Run `npm test` and only then set `paymentsEnabled: true`. When payments are disabled, both URLs must remain empty. Available minimums, base/display currency, conversion and fees may vary by region; the site deliberately does not promise “any USD amount.”

## Privacy and legal boundaries

- No analytics, advertising tracker, account, web form or first-party cookie is included.
- The privacy pages disclose possible hosting request logs, support email handling, Ko-fi processing, and the planned local app data (absolute file paths, library metadata/history and diagnostics).
- The current launcher interfaces support English and Japanese; the teaser and four-platform compatibility disclosures are available in eight languages.
- The first public launcher will not redistribute the independent Play! engine; users will install it separately from the official source. The teaser does not promise a bundled engine.
- Launcher source is published under the MIT License at `https://github.com/tenten-10-10/ps2-emu`; this does not imply that signed launcher binaries already ship.
- The site repeatedly identifies the project as independent and unofficial, with no Sony Interactive Entertainment, PlayStation or Play! affiliation or endorsement.
- The site never promises complete compatibility. Users are told to use only legally owned/authorized dumps or homebrew.
- Operator identity/address/phone are not invented. The commercial-disclosure page says they must be reviewed and published before live payment.

The legal pages are implementation scaffolding, not a substitute for advice from a qualified professional in each launch jurisdiction.

## Content Security Policy

Every page includes a restrictive fallback CSP meta tag. For production, set this stricter HTTP response header at the static host (headers override/extend the meta policy and can enforce `frame-ancestors`):

```text
Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

The hosted Ko-fi page opens by top-level navigation after its allowlisted URL passes validation. No payment page is embedded.

## Static deployment

Deploy only the contents of `dist/` to a static host. The checked-in `vercel.json` pins Vercel to the reviewed build command and `dist/` output, preserves directory-style routes, and applies the production HTTP security headers described above. `.vercelignore` is an explicit upload allowlist: Vercel receives only the static-site build inputs, not local captures, test output, generated `dist/`, or Playwright work files. Example settings for other hosts:

- build command: `npm run build && npm test`
- output directory: `dist`
- Node.js: 24.x
- redirects/rewrites: none required; preserve directory-style `index.html` routes

For a production Vercel deployment, replace the placeholder origin and pass `npm test` first. Use a preview deployment before promotion, and do not promote it until the final domain, legal copy, download gates and tip gates have been reviewed. A temporary anonymous preview intentionally keeps the placeholder origin, so it remains `noindex` and cannot be treated as production.

No persistent production deployment, DNS change, payment activation or analytics setup has been performed by this project.
