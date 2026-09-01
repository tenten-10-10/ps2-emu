(() => {
  "use strict";

  document.documentElement.classList.add("js");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  requestAnimationFrame(() => document.body.classList.add("is-ready"));

  const header = document.querySelector("[data-header]");
  if (header) {
    const syncHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
  }

  const revealNodes = [...document.querySelectorAll("[data-reveal]")];
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6%" });
    revealNodes.forEach((node) => observer.observe(node));
  }

  const depth = document.querySelector("[data-depth]");
  if (depth && !reducedMotion.matches) {
    let frame = 0;
    const updateDepth = (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = depth.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
        const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
        depth.style.setProperty("--tilt-x", `${(-y * 1.4).toFixed(2)}deg`);
        depth.style.setProperty("--tilt-y", `${(x * 1.8).toFixed(2)}deg`);
      });
    };
    depth.addEventListener("pointermove", updateDepth);
    depth.addEventListener("pointerleave", () => {
      depth.style.setProperty("--tilt-x", "0deg");
      depth.style.setProperty("--tilt-y", "0deg");
    });
  }

  const KOFI = Object.freeze({
    key: "kofi",
    label: "Ko-fi",
    allow(url) { return url.hostname === "ko-fi.com" && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname); },
  });

  function validatedKofiLink(candidate) {
    if (typeof candidate !== "string" || candidate.length > 2048) return null;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null;
      return KOFI.allow(parsed) ? parsed.href : null;
    } catch {
      return null;
    }
  }

  const button = document.querySelector("[data-support-primary]");
  const status = document.querySelector("[data-support-status]");
  const supportConfig = window.PS2_SUPPORT_CONFIG;

  if (
    button
    && status
    && supportConfig?.paymentsEnabled === true
    && supportConfig?.recipientVerificationComplete === true
  ) {
    const candidate = supportConfig.links?.[KOFI.key];
    const approved = supportConfig.ownerApprovedLinks?.[KOFI.key];
    if (typeof candidate === "string" && candidate === approved) {
      const url = validatedKofiLink(candidate);
      if (url) {
        button.disabled = false;
        button.addEventListener("click", () => window.location.assign(url));
        status.textContent = `Secure hosted page · ${KOFI.label}`;
      }
    }
  }

  const DOWNLOAD_TARGETS = Object.freeze({
    macArm64: Object.freeze({ architecture: "macos-arm64", suffix: ".dmg" }),
    macX64: Object.freeze({ architecture: "macos-x86_64", suffix: ".dmg" }),
    windowsX64: Object.freeze({ architecture: "windows-x64", suffix: ".zip" }),
    windowsArm64: Object.freeze({ architecture: "windows-arm64-launcher-x64-core", suffix: ".zip" }),
  });

  function validatedArtifact(targetKey, candidate, approved, allowedHosts, ownerApprovedHosts) {
    const definition = DOWNLOAD_TARGETS[targetKey];
    if (!definition || !candidate || !approved) return null;
    if (
      candidate.architecture !== definition.architecture
      || candidate.architecture !== approved.architecture
      || candidate.url !== approved.url
      || candidate.sha256 !== approved.sha256
      || candidate.publisher !== approved.publisher
      || !/^[a-f0-9]{64}$/.test(candidate.sha256)
      || typeof candidate.publisher !== "string"
      || candidate.publisher.trim().length < 2
    ) return null;
    if (
      !Array.isArray(allowedHosts)
      || !Array.isArray(ownerApprovedHosts)
      || allowedHosts.length === 0
      || allowedHosts.join("\n") !== ownerApprovedHosts.join("\n")
    ) return null;
    try {
      const parsed = new URL(candidate.url);
      if (
        parsed.protocol !== "https:"
        || parsed.username
        || parsed.password
        || parsed.port
        || parsed.search
        || parsed.hash
        || !allowedHosts.includes(parsed.hostname)
        || !parsed.pathname.toLowerCase().endsWith(definition.suffix)
      ) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  const downloadConfig = window.PS2_DOWNLOAD_CONFIG;
  if (
    downloadConfig?.downloadsEnabled === true
    && downloadConfig?.releaseVerificationComplete === true
  ) {
    document.querySelectorAll("[data-download-target]").forEach((button) => {
      const targetKey = button.dataset.downloadTarget;
      const url = validatedArtifact(
        targetKey,
        downloadConfig.artifacts?.[targetKey],
        downloadConfig.ownerApprovedArtifacts?.[targetKey],
        downloadConfig.approvedDownloadHosts,
        downloadConfig.ownerApprovedDownloadHosts,
      );
      if (!url) return;
      button.disabled = false;
      button.textContent = button.dataset.downloadReadyLabel || "Download";
      button.addEventListener("click", () => window.location.assign(url));
    });
  }

  document.querySelectorAll(".language-menu").forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      document.querySelectorAll(".language-menu[open]").forEach((other) => {
        if (other !== menu) other.removeAttribute("open");
      });
    });
  });
})();
