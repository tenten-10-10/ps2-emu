import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import config from "../site.config.mjs";
import { accessibilityLabels, localeOrder, locales } from "../src/locales.mjs";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "dist");
const siteOrigin = new URL(config.siteUrl);
const isPreviewOrigin = siteOrigin.hostname === "example" || siteOrigin.hostname.endsWith(".example");
const basePath = config.basePath === "/" ? "" : String(config.basePath ?? "").replace(/\/$/, "");
if (basePath && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(basePath)) {
  throw new Error(`Invalid site basePath: ${config.basePath}`);
}
if (!isPreviewOrigin && new URL(config.siteUrl).pathname.replace(/\/$/, "") !== basePath) {
  throw new Error("Production siteUrl pathname must match basePath.");
}
const pages = ["home", "privacy", "terms", "support", "refund", "commerce"];
const pageSlugs = Object.freeze({
  home: "",
  privacy: "privacy",
  terms: "terms",
  support: "support",
  refund: "refund-policy",
  commerce: "commercial-disclosure",
});
const platformTargets = Object.freeze([
  Object.freeze({ key: "macArm64", os: "macOS", architecture: "Apple Silicon · macOS 14+", compatibility: "native" }),
  Object.freeze({ key: "macX64", os: "macOS", architecture: "Intel x86_64 · macOS 14+", compatibility: "native" }),
  Object.freeze({ key: "windowsX64", os: "Windows", architecture: "x64 · Windows 11 test target", compatibility: "native" }),
  Object.freeze({ key: "windowsArm64", os: "Windows", architecture: "ARM64 launcher / x64 core · Windows 11", compatibility: "emulated-core" }),
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function relativeRouteFor(localeKey, page = "home") {
  const locale = locales[localeKey];
  const segments = [locale.path, pageSlugs[page]].filter(Boolean);
  return `/${segments.join("/")}${segments.length ? "/" : ""}`;
}

function routeFor(localeKey, page = "home") {
  return `${basePath}${relativeRouteFor(localeKey, page)}`;
}

function assetPath(relativePath) {
  return `${basePath}/${relativePath.replace(/^\/+/, "")}`;
}

function outputFor(localeKey, page) {
  const route = relativeRouteFor(localeKey, page);
  return route === "/" ? join(output, "index.html") : join(output, route.slice(1), "index.html");
}

function alternates(page) {
  const links = localeOrder.map((key) => {
    const locale = locales[key];
    return `<link rel="alternate" hreflang="${escapeHtml(locale.htmlLang)}" href="${config.siteUrl}${relativeRouteFor(key, page)}">`;
  });
  links.push(`<link rel="alternate" hreflang="x-default" href="${config.siteUrl}${relativeRouteFor("en", page)}">`);
  return links.join("\n    ");
}

function languageMenu(currentKey, page) {
  const current = locales[currentKey];
  const links = localeOrder.map((key) => {
    const locale = locales[key];
    const currentMarker = key === currentKey ? ' aria-current="true"' : "";
    return `<a lang="${escapeHtml(locale.htmlLang)}" href="${routeFor(key, page)}"${currentMarker}>${escapeHtml(locale.languageName)}</a>`;
  }).join("");
  return `<details class="language-menu">
    <summary aria-label="${escapeHtml(current.languageLabel)}">${escapeHtml(current.languageName)}</summary>
    <div class="language-menu__panel">${links}</div>
  </details>`;
}

function head(localeKey, page, title, description) {
  const locale = locales[localeKey];
  const canonical = `${config.siteUrl}${relativeRouteFor(localeKey, page)}`;
  const discoveryLinks = isPreviewOrigin ? "" : `<link rel="canonical" href="${canonical}">\n  ${alternates(page)}\n  <link rel="sitemap" type="application/xml" href="${config.siteUrl}/sitemap.xml">`;
  const robots = isPreviewOrigin ? "noindex,nofollow,noarchive" : "index,follow,max-image-preview:large";
  const socialImage = isPreviewOrigin ? assetPath("assets/og-preview.png") : `${config.siteUrl}/assets/og-preview.png`;
  const socialURL = isPreviewOrigin ? "" : `<meta property="og:url" content="${canonical}">`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": page === "home" ? "SoftwareApplication" : "WebPage",
    name: page === "home" ? config.productName : title,
    description,
    inLanguage: locale.htmlLang,
    copyrightHolder: config.copyrightHolder,
    isPartOf: {
      "@type": "WebSite",
      name: config.productName,
    },
    ...(page === "home" ? {
      applicationCategory: "GameApplication",
      operatingSystem: "macOS 14+, Windows 11",
      isAccessibleForFree: true,
      codeRepository: config.sourceRepositoryUrl,
    } : {}),
    ...(isPreviewOrigin ? {} : { url: canonical }),
  };
  const serializedStructuredData = JSON.stringify(structuredData).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="${escapeHtml(locale.htmlLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#070815">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'">
  <title>${escapeHtml(title)}</title>
  ${discoveryLinks}
  <link rel="icon" href="${assetPath("assets/favicon.svg")}" type="image/svg+xml">
  <link rel="stylesheet" href="${assetPath("assets/styles.css")}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHtml(config.productName)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${socialURL}
  <meta property="og:locale" content="${escapeHtml(locale.ogLocale)}">
  <meta property="og:image" content="${socialImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(locale.visualAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${socialImage}">
  <script type="application/ld+json">${serializedStructuredData}</script>
  <script src="${assetPath("download-config.js")}" defer></script>
  <script src="${assetPath("support-config.js")}" defer></script>
  <script src="${assetPath("assets/main.js")}" defer></script>
</head>`;
}

function header(localeKey, page, compact = false) {
  const t = locales[localeKey];
  const labels = accessibilityLabels[localeKey];
  const home = routeFor(localeKey, "home");
  return `<a class="skip-link" href="#main">${escapeHtml(labels.skip)}</a>
<header class="site-header${compact ? " site-header--compact" : ""}" data-header>
  <a class="wordmark" href="${home}" aria-label="${escapeHtml(config.productName)} — ${escapeHtml(labels.home)}"><span class="wordmark__mark" aria-hidden="true">P</span><span>${escapeHtml(config.productName)}</span></a>
  <nav class="site-nav" aria-label="${escapeHtml(labels.primary)}">
    ${compact ? `<a href="${home}">${escapeHtml(t.pageBack)}</a>` : `<a href="#platforms">${escapeHtml(t.platformLabel)}</a><a href="#features">${escapeHtml(t.navFeatures)}</a><a href="#open">${escapeHtml(t.navOpen)}</a><a href="#support">${escapeHtml(t.navSupport)}</a>`}
  </nav>
  ${languageMenu(localeKey, page)}
</header>`;
}

function footer(localeKey) {
  const t = locales[localeKey];
  const labels = accessibilityLabels[localeKey];
  return `<footer class="site-footer">
  <div class="footer-brand"><span class="wordmark__mark" aria-hidden="true">P</span><div><strong>${escapeHtml(config.productName)}</strong><p>${escapeHtml(t.footerTagline)}</p></div></div>
  <nav aria-label="${escapeHtml(labels.legal)}"><a href="${routeFor(localeKey, "privacy")}">${escapeHtml(t.privacy)}</a><a href="${routeFor(localeKey, "terms")}">${escapeHtml(t.terms)}</a><a href="${routeFor(localeKey, "support")}">${escapeHtml(t.support)}</a><a href="${routeFor(localeKey, "refund")}">${escapeHtml(t.refundTitle)}</a><a href="${routeFor(localeKey, "commerce")}">${escapeHtml(t.commerceTitle)}</a></nav>
  <p class="footer-legal">${escapeHtml(t.legalCallout)}</p>
  <p class="footer-meta">© 2026 ${escapeHtml(config.copyrightHolder)} · ${escapeHtml(config.productName)} · <a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a></p>
</footer>`;
}

function proofItem(number, title, body) {
  return `<li data-reveal><span class="proof-number">${number}</span><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div></li>`;
}

function platformCard(t, target) {
  const mode = target.compatibility === "emulated-core" ? t.windowsArmMode : t.nativeMode;
  return `<article class="platform-card${target.compatibility === "emulated-core" ? " platform-card--compatibility" : ""}" data-reveal>
    <div class="platform-card__heading"><span>${escapeHtml(target.os)}</span><strong>${escapeHtml(target.architecture)}</strong></div>
    <p>${escapeHtml(mode)}</p>
    <div class="platform-card__footer"><span>${escapeHtml(t.candidateStatus)}</span><button type="button" disabled data-download-target="${target.key}" data-download-ready-label="${escapeHtml(t.downloadReady)}">${escapeHtml(t.downloadLocked)}</button></div>
  </article>`;
}

function homePage(localeKey) {
  const t = locales[localeKey];
  const [productLead, ...productTail] = config.productName.split(" ");
  return `${head(localeKey, "home", t.metaTitle, t.metaDescription)}
<body class="home-page">
${header(localeKey, "home")}
<main id="main">
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-glow" aria-hidden="true"></div>
    <div class="hero-copy">
      <p class="eyebrow hero-stage hero-stage--1">${escapeHtml(t.heroEyebrow)}</p>
      <h1 id="hero-title" class="hero-title hero-stage hero-stage--2"><span>${escapeHtml(productLead)}</span><span>${escapeHtml(productTail.join(" "))}</span></h1>
      <p class="hero-lead hero-stage hero-stage--3">${escapeHtml(t.heroLead)}</p>
      <p class="hero-body hero-stage hero-stage--3">${escapeHtml(t.heroBody)}</p>
      <div class="hero-actions hero-stage hero-stage--4"><a class="button button--primary" href="#features">${escapeHtml(t.heroPrimary)}</a><a class="text-link" href="#support">${escapeHtml(t.heroSecondary)}<span aria-hidden="true">↘</span></a></div>
      <p class="hero-status hero-stage hero-stage--4"><span aria-hidden="true"></span>${escapeHtml(t.heroStatus)}</p>
    </div>
    <figure class="hero-visual hero-stage hero-stage--visual" data-depth>
      <div class="screen-halo" aria-hidden="true"></div>
      <img src="${assetPath("assets/ps2-emu-preview.png")}" width="940" height="620" alt="${escapeHtml(t.visualAlt)}" fetchpriority="high" decoding="async">
      <figcaption>${escapeHtml(t.visualCaption)}</figcaption>
    </figure>
    <p class="hero-disclaimer hero-stage hero-stage--4">${escapeHtml(t.legalCallout)}</p>
  </section>

  <section class="platform-section section" id="platforms" aria-labelledby="platforms-title">
    <div class="section-intro" data-reveal><p class="eyebrow">${escapeHtml(t.platformsEyebrow)}</p><h2 id="platforms-title">${escapeHtml(t.platformsTitle)}</h2><p>${escapeHtml(t.platformsBody)}</p></div>
    <div class="platform-grid">
      ${platformTargets.map((target) => platformCard(t, target)).join("\n      ")}
    </div>
    <figure class="windows-visual" id="windows-preview" data-reveal>
      <div><span>WINDOWS UI</span><strong>x64 / ARM64 launcher</strong></div>
      <img src="${assetPath("assets/windows-preview.png")}" width="1320" height="808" alt="${escapeHtml(t.windowsVisualAlt)}" loading="lazy" decoding="async">
      <figcaption>${escapeHtml(t.windowsVisualCaption)}</figcaption>
    </figure>
    <p class="download-gate-note" data-reveal>${escapeHtml(t.downloadsGateNote)}</p>
  </section>

  <section class="proof section" id="features" aria-labelledby="proof-title">
    <div class="section-intro" data-reveal><p class="eyebrow">${escapeHtml(t.proofEyebrow)}</p><h2 id="proof-title">${escapeHtml(t.proofTitle)}</h2><p>${escapeHtml(t.proofBody)}</p></div>
    <ol class="proof-list">
      ${proofItem("01", t.libraryTitle, t.libraryBody)}
      ${proofItem("02", t.formatsTitle, t.formatsBody)}
      ${proofItem("03", t.biosTitle, t.biosBody)}
    </ol>
    <dl class="spec-line" data-reveal><div><dt>${escapeHtml(t.platformLabel)}</dt><dd>${escapeHtml(t.platformValue)}</dd></div><div><dt>${escapeHtml(t.formatsLabel)}</dt><dd>${escapeHtml(t.formatsValue)}</dd></div><div><dt>${escapeHtml(t.coreLabel)}</dt><dd>${escapeHtml(t.coreValue)}</dd></div></dl>
  </section>

  <section class="open-section section" id="open" aria-labelledby="open-title">
    <div class="open-sticky" data-reveal><p class="eyebrow">${escapeHtml(t.provenanceEyebrow)}</p><h2 id="open-title">${escapeHtml(t.provenanceTitle)}</h2><p>${escapeHtml(t.provenanceBody)}</p><div class="source-links"><a href="${escapeHtml(config.sourceRepositoryUrl)}" rel="noopener noreferrer">${escapeHtml(t.sourceLink)} <span aria-hidden="true">↗</span></a><a href="https://github.com/jpd002/Play-" rel="noopener noreferrer">${escapeHtml(t.provenanceLink)} <span aria-hidden="true">↗</span></a><a href="https://github.com/jpd002/Play-/blob/master/License.txt" rel="noopener noreferrer">${escapeHtml(t.licenseLink)} <span aria-hidden="true">↗</span></a></div></div>
    <div class="open-details">
      <article data-reveal><span>01</span><h3>${escapeHtml(t.provenanceSourceTitle)}</h3><p>${escapeHtml(t.provenanceSourceBody)}</p></article>
      <article data-reveal><span>02</span><h3>${escapeHtml(t.provenanceLicenseTitle)}</h3><p>${escapeHtml(t.provenanceLicenseBody)}</p></article>
      <article data-reveal><span>03</span><h3>${escapeHtml(t.provenanceBoundaryTitle)}</h3><p>${escapeHtml(t.provenanceBoundaryBody)}</p></article>
      <p class="legal-callout" data-reveal>${escapeHtml(t.legalCallout)}</p>
    </div>
  </section>

  <section class="support-section section" id="support" aria-labelledby="support-title">
    <div class="support-orbit" aria-hidden="true"><span></span><span></span></div>
    <div class="support-copy" data-reveal><p class="eyebrow">${escapeHtml(t.supportEyebrow)}</p><h2 id="support-title">${escapeHtml(t.supportTitle)}</h2><p>${escapeHtml(t.supportBody)}</p></div>
    <div class="support-action" data-reveal>
      <button class="button button--support" type="button" data-support-primary disabled aria-describedby="support-status support-fine">${escapeHtml(t.supportButton)}</button>
      <p class="support-status" id="support-status" data-support-status>${escapeHtml(t.supportComingSoon)}</p>
      <p class="support-fine" id="support-fine">${escapeHtml(t.supportFine)}</p>
    </div>
  </section>

  <section class="final-section section" aria-labelledby="final-title">
    <div data-reveal><p class="eyebrow">${escapeHtml(t.finalEyebrow)}</p><h2 id="final-title">${escapeHtml(t.finalTitle)}</h2><p>${escapeHtml(t.finalBody)}</p><a class="button button--ghost" href="${routeFor(localeKey, "support")}">${escapeHtml(t.finalButton)}</a></div>
    <div class="final-glyph" aria-hidden="true">P</div>
  </section>
</main>
${footer(localeKey)}
</body>
</html>`;
}

function legalPage(localeKey, page) {
  const t = locales[localeKey];
  const contentKeys = {
    privacy: ["privacyTitle", "privacyIntro", "privacySections"],
    terms: ["termsTitle", "termsIntro", "termsSections"],
    support: ["supportPageTitle", "supportPageIntro", "supportSections"],
    refund: ["refundTitle", "refundIntro", "refundSections"],
    commerce: ["commerceTitle", "commerceIntro", "commerceSections"],
  };
  const [titleKey, introKey, sectionKey] = contentKeys[page];
  const title = `${t[titleKey]} — ${config.productName}`;
  const description = t[introKey];
  const articles = t[sectionKey].map(([heading, body], index) => {
    const resolvedBody = page === "support" && index === 0 && t.supportReleaseStatus
      ? t.supportReleaseStatus
      : body;
    return `<article data-reveal><span>${String(index + 1).padStart(2, "0")}</span><div><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(resolvedBody)}</p></div></article>`;
  }).join("\n");
  return `${head(localeKey, page, title, description)}
<body class="document-page">
${header(localeKey, page, true)}
<main id="main" class="document-main">
  <header class="document-hero"><p class="eyebrow">${escapeHtml(config.productName)} · ${escapeHtml(t[titleKey])}</p><h1>${escapeHtml(t[titleKey])}</h1><p>${escapeHtml(t[introKey])}</p></header>
  <div class="document-list">${articles}</div>
  <aside class="document-contact" data-reveal><p>${escapeHtml(t.legalCallout)}</p><a href="mailto:${escapeHtml(config.supportEmail)}">${escapeHtml(config.supportEmail)}</a></aside>
</main>
${footer(localeKey)}
</body>
</html>`;
}

async function build() {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(join(root, "public"), output, { recursive: true });

  for (const localeKey of localeOrder) {
    for (const page of pages) {
      const target = outputFor(localeKey, page);
      await mkdir(dirname(target), { recursive: true });
      const html = page === "home" ? homePage(localeKey) : legalPage(localeKey, page);
      await writeFile(target, html, "utf8");
    }
  }

  if (isPreviewOrigin) {
    await writeFile(join(output, "robots.txt"), "User-agent: *\nDisallow: /\n", "utf8");
  } else {
    const sitemap = pages.flatMap((page) => localeOrder.map((localeKey) => `  <url><loc>${config.siteUrl}${relativeRouteFor(localeKey, page)}</loc></url>`)).join("\n");
    await writeFile(join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`, "utf8");
    await writeFile(join(output, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`, "utf8");
  }

  const manifest = {
    name: config.productName,
    short_name: config.productName,
    start_url: `${basePath}/`,
    display: "browser",
    background_color: "#070815",
    theme_color: "#070815",
    icons: [{ src: assetPath("assets/favicon.svg"), sizes: "any", type: "image/svg+xml" }],
  };
  await writeFile(join(output, "site.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Built ${localeOrder.length * pages.length} routes in ${output}`);
}

await build();
