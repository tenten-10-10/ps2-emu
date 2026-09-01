const productionSiteUrl = "https://tenten-10-10.github.io/ps2-emu";
const productionBasePath = "/ps2-emu";

export default {
  // Preview deployments override both values and stay noindex. The checked-in
  // defaults are the permanent GitHub Pages production address.
  siteUrl: process.env.PS2_SITE_URL ?? productionSiteUrl,
  basePath: process.env.PS2_SITE_BASE_PATH ?? productionBasePath,
  supportEmail: "cless@planter.jp",
  productName: "PS2 Emu",
  copyrightHolder: "ten:ten",
  currentVersion: "0.1.0",
  sourceRepositoryUrl: "https://github.com/tenten-10-10/ps2-emu",
};
