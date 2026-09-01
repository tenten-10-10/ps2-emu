import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import vm from "node:vm";
import config from "../site.config.mjs";
import { accessibilityLabels, localeOrder, locales } from "../src/locales.mjs";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const vercelConfig = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
const vercelIgnore = await readFile(join(root, ".vercelignore"), "utf8");
const sitePackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const sitePackageLock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
const configuredOrigin = new URL(config.siteUrl);
const isPreviewOrigin = configuredOrigin.hostname === "example" || configuredOrigin.hostname.endsWith(".example");
const basePath = config.basePath === "/" ? "" : String(config.basePath ?? "").replace(/\/$/, "");
const pages = {
  home: "",
  privacy: "privacy",
  terms: "terms",
  support: "support",
  refund: "refund-policy",
  commerce: "commercial-disclosure",
};
const requiredKeys = [
  "metaTitle", "metaDescription", "heroLead", "heroBody", "proofTitle",
  "provenanceTitle", "legalCallout", "supportTitle", "supportBody", "supportFine",
  "sourceLink",
  "platformsEyebrow", "platformsTitle", "platformsBody", "nativeMode",
  "windowsArmMode", "candidateStatus", "downloadLocked", "downloadReady",
  "windowsVisualAlt", "windowsVisualCaption", "downloadsGateNote",
  "privacyTitle", "privacySections", "termsTitle", "termsSections",
  "supportPageTitle", "supportSections", "refundTitle", "refundSections",
  "commerceTitle", "commerceSections",
];

function relativeRouteFor(localeKey, page) {
  const segments = [locales[localeKey].path, pages[page]].filter(Boolean);
  return `/${segments.join("/")}${segments.length ? "/" : ""}`;
}

function routeFor(localeKey, page) {
  return `${basePath}${relativeRouteFor(localeKey, page)}`;
}

function pathForRoute(route) {
  const localRoute = basePath && (route === basePath || route.startsWith(`${basePath}/`))
    ? route.slice(basePath.length) || "/"
    : route;
  if (localRoute === "/") return join(dist, "index.html");
  if (localRoute.endsWith("/")) return join(dist, localRoute.slice(1), "index.html");
  return join(dist, localRoute.slice(1));
}

function kofiUrlIsAllowed(candidate) {
  let url;
  try { url = new URL(candidate); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
  return url.hostname === "ko-fi.com" && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
}

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

check(vercelConfig.$schema === "https://openapi.vercel.sh/vercel.json", "Vercel schema binding changed unexpectedly");
check(sitePackage.engines?.node === "24.x", "site build must pin the Vercel Node.js major");
check(sitePackageLock.packages?.[""]?.engines?.node === sitePackage.engines.node, "site lockfile Node.js engine drift");
check(config.productName === "PS2 Emu", "official product name drift");
check(config.copyrightHolder === "ten:ten", "copyright holder drift");
check(config.sourceRepositoryUrl === "https://github.com/tenten-10-10/ps2-emu", "public source repository drift");
check(basePath === "" || /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(basePath), "site basePath is unsafe");
if (isPreviewOrigin) {
  check(basePath === "", "preview builds must run at the host root");
} else {
  check(config.siteUrl === "https://tenten-10-10.github.io/ps2-emu", "production GitHub Pages URL drift");
  check(basePath === "/ps2-emu", "production GitHub Pages basePath drift");
  check(configuredOrigin.pathname.replace(/\/$/, "") === basePath, "production siteUrl pathname must match basePath");
}
check(kofiUrlIsAllowed("https://ko-fi.com/tenten"), "valid Ko-fi profile rejected");
for (const unsafeUrl of [
  "http://ko-fi.com/tenten",
  "https://www.ko-fi.com/tenten",
  "https://ko-fi.com/tenten/shop",
  "https://ko-fi.com/tenten?ref=other",
  "https://ko-fi.com/tenten#support",
  "https://ko-fi.com@malicious.example/tenten",
]) {
  check(!kofiUrlIsAllowed(unsafeUrl), `unsafe Ko-fi URL accepted: ${unsafeUrl}`);
}
check(vercelConfig.buildCommand === "npm run test:preview", "Vercel must publish only a reviewed noindex preview build");
check(vercelConfig.outputDirectory === "dist", "Vercel must publish only dist/");
check(vercelConfig.cleanUrls === false, "Vercel cleanUrls must remain disabled for directory routes");
check(vercelConfig.trailingSlash === true, "Vercel must canonicalize generated directory routes with trailing slashes");
const globalHeaderRule = vercelConfig.headers?.find((entry) => entry.source === "/(.*)");
check(Boolean(globalHeaderRule), "Vercel global security-header rule is missing");
const vercelHeaders = Object.fromEntries((globalHeaderRule?.headers || []).map(({ key, value }) => [key, value]));
const requiredVercelHeaders = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};
for (const [key, value] of Object.entries(requiredVercelHeaders)) {
  check(vercelHeaders[key] === value, `Vercel ${key} header is missing or unsafe`);
}
for (const requiredUploadRule of [
  "/*",
  "!.vercelignore",
  "!package.json",
  "!package-lock.json",
  "!public",
  "!scripts",
  "!site.config.mjs",
  "!src",
  "!vercel.json",
]) {
  check(vercelIgnore.split(/\r?\n/).includes(requiredUploadRule), `Vercel upload allowlist lacks ${requiredUploadRule}`);
}
for (const excludedPath of ["artifacts", "assets", "dist", "output", ".playwright-cli"]) {
  check(!vercelIgnore.split(/\r?\n/).includes(`!${excludedPath}`), `Vercel upload allowlist exposes ${excludedPath}`);
}

for (const localeKey of localeOrder) {
  const locale = locales[localeKey];
  const labels = accessibilityLabels[localeKey];
  check(Boolean(labels), `${localeKey} is missing localized accessibility labels`);
  check(Object.values(labels).every((value) => typeof value === "string" && value.length > 0), `${localeKey} has an empty accessibility label`);
  for (const key of requiredKeys) {
    check(locale[key] !== undefined && locale[key] !== "", `${localeKey} is missing ${key}`);
  }
  check(locale.productName === config.productName, `${localeKey} product name drift`);
  check(locale.metaTitle.startsWith(`${config.productName} — `), `${localeKey} metadata lacks the official product name`);
  check(locale.visualAlt.includes(config.productName), `${localeKey} visual alt lacks the official product name`);
  check(locale.supportBody.includes("Ko-fi"), `${localeKey} support copy must identify Ko-fi`);
  check(locale.supportButton.includes("Ko-fi"), `${localeKey} support action must identify Ko-fi`);
  check(!/any USD|任意のUSD|任意の米ドル|cualquier importe en USD|montant USD|beliebigen USD|qualquer valor em USD|원하는 USD|任意美元/i.test(`${locale.supportBody} ${locale.supportFine}`), `${localeKey} overpromises a USD amount`);
}
check(new Set(localeOrder.map((key) => locales[key].supportFine)).size === localeOrder.length, "support disclosure must be localized");

for (const localeKey of localeOrder) {
  const locale = locales[localeKey];
  const labels = accessibilityLabels[localeKey];
  for (const page of Object.keys(pages)) {
    const route = routeFor(localeKey, page);
    const file = pathForRoute(route);
    await access(file);
    const html = await readFile(file, "utf8");
    check(html.includes(`<html lang="${locales[localeKey].htmlLang}">`), `${route} has wrong lang`);
    if (isPreviewOrigin) {
      check(html.includes('name="robots" content="noindex,nofollow,noarchive"'), `${route} preview must be noindex`);
      check(!html.includes('rel="canonical"'), `${route} preview must not canonicalize to a placeholder`);
      check(!html.includes('rel="alternate" hreflang='), `${route} preview must not emit placeholder hreflang URLs`);
      check(!html.includes(config.siteUrl), `${route} preview leaks a placeholder origin`);
    } else {
      check(html.includes(`<link rel="canonical" href="${config.siteUrl}${relativeRouteFor(localeKey, page)}">`), `${route} has wrong canonical`);
      check((html.match(/rel="alternate" hreflang=/g) || []).length === localeOrder.length + 1, `${route} has incomplete hreflang links`);
      check(html.includes('hreflang="x-default"'), `${route} lacks x-default`);
      check(html.includes(`<link rel="sitemap" type="application/xml" href="${config.siteUrl}/sitemap.xml">`), `${route} lacks the project sitemap link`);
    }
    check(html.includes('property="og:image"'), `${route} lacks OG image`);
    check(html.includes('name="twitter:card" content="summary_large_image"'), `${route} lacks Twitter card`);
    check(html.includes(`property="og:site_name" content="${config.productName}"`), `${route} has stale OG site branding`);
    check(html.includes("connect-src 'none'"), `${route} CSP must disable connections`);
    check(html.includes("frame-src 'none'"), `${route} CSP must disable frames`);
    check(html.includes('name="referrer" content="strict-origin-when-cross-origin"'), `${route} lacks referrer policy`);
    check(!/<iframe\b/i.test(html), `${route} must not contain an iframe`);
    check((html.match(/<h1\b/g) || []).length === 1, `${route} must have exactly one h1`);
    check(html.includes(`class="skip-link" href="#main">${labels.skip}</a>`), `${route} skip link is not localized`);
    check(html.includes(`aria-label="${config.productName} — ${labels.home}"`), `${route} home label is not localized`);
    check(html.includes(`aria-label="${labels.primary}"`), `${route} primary navigation label is not localized`);
    check(html.includes(`aria-label="${labels.legal}"`), `${route} legal navigation label is not localized`);
    check(html.includes("Sony Interactive Entertainment Inc."), `${route} lacks independent trademark disclosure`);
    check(html.includes(`© 2026 ${config.copyrightHolder} · ${config.productName}`), `${route} copyright footer drift`);
    check(!html.includes("PS2 Emulator"), `${route} contains the retired product name`);
    check(!/Stripe|GitHub Sponsors|PayPal(?:\.Me)?|Amazon Pay|Discord coin|buy\.stripe\.com|paypal\.me|github\.com\/sponsors/i.test(html), `${route} contains an unsupported support provider`);
    const structuredDataMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    check(Boolean(structuredDataMatch), `${route} lacks JSON-LD`);
    const structuredData = JSON.parse(structuredDataMatch[1]);
    check(structuredData.isPartOf?.name === config.productName, `${route} JSON-LD site branding drift`);
    check(structuredData.copyrightHolder === config.copyrightHolder, `${route} JSON-LD copyright holder drift`);
    check(structuredData.inLanguage === locale.htmlLang, `${route} JSON-LD language drift`);
    check(!JSON.stringify(structuredData).includes("PS2 Emulator"), `${route} JSON-LD contains the retired product name`);
    if (page === "home") {
      check(structuredData.name === config.productName, `${route} software JSON-LD name drift`);
      check(structuredData.isAccessibleForFree === true, `${route} must describe the app as free`);
      check(structuredData.codeRepository === config.sourceRepositoryUrl, `${route} software JSON-LD source repository drift`);
      check(html.includes(`href="${config.sourceRepositoryUrl}"`), `${route} lacks the public source repository link`);
      check(html.includes('<h1 id="hero-title" class="hero-title hero-stage hero-stage--2"><span>PS2</span><span>Emu</span></h1>'), `${route} hero must keep the official name at the top of the hierarchy`);
      check(html.includes("Ko-fi"), `${route} home page must identify the sole support service`);
      for (const target of ["macArm64", "macX64", "windowsX64", "windowsArm64"]) {
        check(html.includes(`data-download-target="${target}"`), `${route} lacks ${target} download gate`);
      }
      check(html.includes(locale.windowsArmMode.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;")), `${route} lacks localized Windows ARM compatibility disclosure`);
      check(html.includes(locale.platformValue), `${route} lacks the four-platform value`);
      check((html.match(/data-download-target=/g) || []).length === 4, `${route} must expose exactly four manual platform choices`);
    }

    const resourcePattern = /(?:href|src)="(\/[^"#?]*)/g;
    for (const match of html.matchAll(resourcePattern)) {
      const target = match[1];
      check(basePath === "" || target === basePath || target.startsWith(`${basePath}/`) || target.startsWith("/#"), `${route} resource escapes the production basePath: ${target}`);
      await access(pathForRoute(target));
      checks += 1;
    }
  }
}

const homeHtml = await readFile(join(dist, "index.html"), "utf8");
check(homeHtml.includes("data-support-primary disabled"), "support button must render disabled by default");
check(!/href="https:\/\/ko-fi\.com/.test(homeHtml), "generated HTML must not contain a live Ko-fi link");
check(!homeHtml.includes("data-support-alternates"), "single-provider support UI must not render alternate choices");
check(homeHtml.includes("already provided"), "English disclosure must describe an already-provided free app");
check(homeHtml.includes("does not buy features"), "English disclosure must separate tips from future features");
check(!/bundled Play!|source ships with/i.test(homeHtml), "teaser must not promise a bundled engine or shipped source");
check(homeHtml.includes("wrapper source is available under the MIT License"), "teaser must describe the public MIT source accurately");
check(homeHtml.includes("MIT License"), "teaser must identify the selected public source license");
check(!homeHtml.includes("Coming soon to Apple silicon."), "English teaser still claims an Apple-silicon-only release");
check(homeHtml.includes("Windows launcher interface · rendered development preview · Windows runtime test pending"), "Windows preview must disclose that runtime testing is pending");
check((homeHtml.match(/data-download-target=/g) || []).length === 4, "English teaser must render four download targets");

if (isPreviewOrigin) {
  const robots = await readFile(join(dist, "robots.txt"), "utf8");
  check(robots === "User-agent: *\nDisallow: /\n", "preview robots.txt must block all crawlers");
  let sitemapExists = true;
  try { await access(join(dist, "sitemap.xml")); } catch { sitemapExists = false; }
  check(!sitemapExists, "preview build must not publish a sitemap");
} else {
  await access(join(dist, "sitemap.xml"));
  checks += 1;
}

const supportConfigSource = await readFile(join(root, "public", "support-config.js"), "utf8");
check(!/(sk|rk)_(live|test)_[A-Za-z0-9]+|api[_-]?key\s*[:=]/i.test(supportConfigSource), "support config appears to contain a secret");
const sandbox = { window: {} };
vm.runInNewContext(supportConfigSource, sandbox, { filename: "support-config.js" });
const supportConfig = sandbox.window.PS2_SUPPORT_CONFIG;
check(supportConfig.paymentsEnabled === false, "paymentsEnabled must remain false before launch review");
check(supportConfig.recipientVerificationComplete === false, "recipient verification must remain false before owner review");
check(supportConfig.primaryProvider === undefined, "single-provider config must not expose a provider selector");
check(Object.keys(supportConfig.links).join(",") === "kofi", "Ko-fi must be the only support provider");
check(Object.keys(supportConfig.ownerApprovedLinks).join(",") === "kofi", "Ko-fi must be the only owner-approved provider");
check(supportConfig.links.kofi === "" || kofiUrlIsAllowed(supportConfig.links.kofi), "Ko-fi has an unsafe payment URL");
check(supportConfig.ownerApprovedLinks.kofi === "" || kofiUrlIsAllowed(supportConfig.ownerApprovedLinks.kofi), "Ko-fi has an unsafe owner-approved URL");
if (supportConfig.paymentsEnabled === true && (supportConfig.links.kofi !== "" || supportConfig.ownerApprovedLinks.kofi !== "")) {
  check(supportConfig.links.kofi !== "" && supportConfig.links.kofi === supportConfig.ownerApprovedLinks.kofi, "Ko-fi live URL is not bound to the owner-approved recipient");
}
if (supportConfig.paymentsEnabled === true) {
  check(supportConfig.links.kofi !== "", "enabled payment config needs a live Ko-fi profile");
}
if (supportConfig.paymentsEnabled === false) {
  check(Object.values(supportConfig.links).every((url) => url === ""), "disabled payment config must not contain prefilled recipient URLs");
  check(Object.values(supportConfig.ownerApprovedLinks).every((url) => url === ""), "disabled payment config must not contain owner-approved URLs");
}

const downloadConfigSource = await readFile(join(root, "public", "download-config.js"), "utf8");
check(!/(sk|rk)_(live|test)_[A-Za-z0-9]+|api[_-]?key\s*[:=]/i.test(downloadConfigSource), "download config appears to contain a secret");
const downloadSandbox = { window: {} };
vm.runInNewContext(downloadConfigSource, downloadSandbox, { filename: "download-config.js" });
const downloadConfig = downloadSandbox.window.PS2_DOWNLOAD_CONFIG;
check(downloadConfig.downloadsEnabled === false, "downloadsEnabled must remain false before release approval");
check(downloadConfig.releaseVerificationComplete === false, "release verification must remain incomplete");
check(downloadConfig.approvedDownloadHosts.length === 0, "disabled downloads must not prefill a host allowlist");
check(downloadConfig.ownerApprovedDownloadHosts.length === 0, "disabled downloads must not prefill owner-approved hosts");
const expectedDownloadArchitectures = {
  macArm64: "macos-arm64",
  macX64: "macos-x86_64",
  windowsX64: "windows-x64",
  windowsArm64: "windows-arm64-launcher-x64-core",
};
check(Object.keys(downloadConfig.artifacts).sort().join(",") === Object.keys(expectedDownloadArchitectures).sort().join(","), "download target set changed unexpectedly");
check(Object.keys(downloadConfig.ownerApprovedArtifacts).sort().join(",") === Object.keys(expectedDownloadArchitectures).sort().join(","), "owner-approved download target set changed unexpectedly");
for (const [target, architecture] of Object.entries(expectedDownloadArchitectures)) {
  const candidate = downloadConfig.artifacts[target];
  const approved = downloadConfig.ownerApprovedArtifacts[target];
  check(candidate.architecture === architecture, `${target} has the wrong architecture binding`);
  check(approved.architecture === architecture, `${target} owner binding has the wrong architecture`);
  for (const field of ["url", "sha256", "publisher"]) {
    check(candidate[field] === "", `${target} must not prefill ${field}`);
    check(approved[field] === "", `${target} must not prefill owner-approved ${field}`);
  }
}

const mainScript = await readFile(join(root, "public", "assets", "main.js"), "utf8");
check(!/fetch\s*\(|XMLHttpRequest|<iframe/i.test(mainScript), "client script must not send data or embed checkout");
check(mainScript.includes('.protocol !== "https:"'), "client payment policy must require HTTPS");
check(mainScript.includes("recipientVerificationComplete === true"), "client must require explicit recipient verification before enabling support");
check(mainScript.includes("candidate === approved"), "client must bind the live Ko-fi link to the exact owner-approved recipient URL");
check(mainScript.includes("releaseVerificationComplete === true"), "client must require completed release verification before downloads");
check(mainScript.includes("candidate.sha256 !== approved.sha256"), "client must bind download SHA-256 exactly");
check(mainScript.includes("candidate.publisher !== approved.publisher"), "client must bind download publisher exactly");
check(mainScript.includes("candidate.architecture !== approved.architecture"), "client must bind download architecture exactly");
check(mainScript.includes("allowedHosts.join"), "client must bind the download host allowlist exactly");
check(!/navigator\.userAgent|userAgentData/.test(mainScript), "client must not choose a download from the user agent");
check(mainScript.includes("ko-fi.com"), "client allowlist lacks Ko-fi");
check(!/buy\.stripe\.com|github\.com\/sponsors|paypal\.me|githubSponsors|primaryProvider/.test(`${mainScript}\n${supportConfigSource}`), "retired support provider code remains");

for (const name of ["ps2-emu-preview.png", "windows-preview.png", "og-preview.png", "favicon.svg", "styles.css", "main.js"]) {
  const details = await stat(join(dist, "assets", name));
  check(details.isFile() && details.size > 100, `${name} is missing or empty`);
}

const approvedVisuals = {
  "ps2-emu-preview.png": { width: 940, height: 620, sha256: "4ab6cc6cd780da5e94097b25702b3e0eb9f2367557a3e8cf694e5458a0f6339c" },
  "windows-preview.png": { width: 2640, height: 1616, sha256: "4011bda6bd03d376c23195fcc1d16439aa591c7499144822857fdbdf9a9e553f" },
  "og-preview.png": { width: 1200, height: 630, sha256: "955e535b05c7979aafde571fdfbc532254b565a9b681333b172bef251c737242" },
};
for (const [name, expected] of Object.entries(approvedVisuals)) {
  const bytes = await readFile(join(root, "public", "assets", name));
  check(bytes.subarray(1, 4).toString("ascii") === "PNG", `${name} is not a PNG`);
  check(bytes.readUInt32BE(16) === expected.width, `${name} width drift`);
  check(bytes.readUInt32BE(20) === expected.height, `${name} height drift`);
  check(createHash("sha256").update(bytes).digest("hex") === expected.sha256, `${name} approved visual hash drift`);
}
check(
  (await readFile(join(root, "assets", "ps2-emu-preview.png"))).equals(
    await readFile(join(root, "public", "assets", "ps2-emu-preview.png")),
  ),
  "source preview duplicate must remain byte-identical",
);

const allText = [homeHtml, mainScript, supportConfigSource].join("\n");
check(!/fonts\.(googleapis|gstatic)|googletagmanager|google-analytics|plausible\.io|segment\.com/i.test(allText), "external font or analytics dependency detected");

const webManifest = JSON.parse(await readFile(join(dist, "site.webmanifest"), "utf8"));
check(webManifest.name === config.productName, "web manifest product name drift");
check(webManifest.short_name === config.productName, "web manifest short name drift");

console.log(`Passed ${checks} static-site checks across ${localeOrder.length * Object.keys(pages).length} routes.`);
