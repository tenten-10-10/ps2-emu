// Public configuration only. Never put signing keys, access tokens or secrets here.
// Downloads remain disabled until each exact artifact and its owner-approved
// release identity have passed signing, hash, clean-machine and hardware gates.
window.PS2_DOWNLOAD_CONFIG = Object.freeze({
  downloadsEnabled: false,
  releaseVerificationComplete: false,
  approvedDownloadHosts: Object.freeze([]),
  ownerApprovedDownloadHosts: Object.freeze([]),
  artifacts: Object.freeze({
    macArm64: Object.freeze({
      architecture: "macos-arm64",
      url: "",
      sha256: "",
      publisher: "",
    }),
    macX64: Object.freeze({
      architecture: "macos-x86_64",
      url: "",
      sha256: "",
      publisher: "",
    }),
    windowsX64: Object.freeze({
      architecture: "windows-x64",
      url: "",
      sha256: "",
      publisher: "",
    }),
    windowsArm64: Object.freeze({
      architecture: "windows-arm64-launcher-x64-core",
      url: "",
      sha256: "",
      publisher: "",
    }),
  }),
  ownerApprovedArtifacts: Object.freeze({
    macArm64: Object.freeze({ architecture: "macos-arm64", url: "", sha256: "", publisher: "" }),
    macX64: Object.freeze({ architecture: "macos-x86_64", url: "", sha256: "", publisher: "" }),
    windowsX64: Object.freeze({ architecture: "windows-x64", url: "", sha256: "", publisher: "" }),
    windowsArm64: Object.freeze({ architecture: "windows-arm64-launcher-x64-core", url: "", sha256: "", publisher: "" }),
  }),
});
