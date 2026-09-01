(() => {
  "use strict";

  const strings = Object.freeze({
    en: {
      library: "Library",
      settings: "Settings",
      openPlaySettings: "Open Play! settings",
      lawfulOnly: "Use only lawfully owned game dumps or authorized homebrew.",
      showLogs: "Show logs",
      about: "About",
      workspace: "LOCAL GAME WORKSPACE",
      yourLibrary: "Your library",
      search: "Search",
      searchPlaceholder: "Search games",
      addFolder: "Add folder",
      addGames: "Add games",
      stop: "Stop",
      armTitle: "Native ARM64 launcher, x64 Play! via Windows emulation",
      armBody: "Play! does not currently publish a Windows ARM64 core. Windows 11 runs the separate x64 Play! process through Prism.",
      games: "Games",
      emptyEyebrow: "NOTHING IMPORTED",
      emptyTitle: "Bring your own library.",
      emptyBody: "Files remain where they are. The launcher stores only their local paths and play history.",
      chooseGames: "Choose games",
      preferences: "PREFERENCES",
      language: "Language",
      systemLanguage: "System default",
      launch: "Launch",
      fullscreen: "Start in fullscreen",
      fullscreenHelp: "Passes --fullscreen directly to Play!.",
      core: "Play! core",
      getOfficialPlay: "Get official Play!",
      chooseCustomCore: "Choose custom core",
      useStandardCore: "Use standard install",
      standardHashWarning: "Standard Play! is unsigned. PS2 Emu allows only one reviewed build whose Play.exe and required Qt files exactly match pinned SHA-256 hashes, sizes, x64 PE machines, and version signals. Publisher unverified.",
      customWarning: "A custom core bypasses publisher/version trust. Consent pins only Play.exe path and hash, not adjacent DLLs or plugins. Select one only if you understand the whole installation.",
      done: "Done",
      noticeTitle: "Before you continue",
      noticeLead: "PS2 Emu is an independent launcher. Play! opens separately and game compatibility is not guaranteed.",
      noticeLawful: "I will use only game dumps I may lawfully use or authorized homebrew. No commercial games or BIOS are included.",
      noticePrivacy: "I understand that local file paths, library history and capped diagnostic logs are stored on this PC.",
      noticeAffiliation: "I understand this project is not affiliated with or endorsed by Sony, PlayStation or Play!.",
      noticeHashOnly: "I understand that standard Windows Play! is unsigned and accepted only by exact hashes; its publisher is unverified.",
      noticeDemo: "I have reviewed and accept the Academic Free License 2.0 terms for the bundled official ps2dev/ps2sdk Cube Demo. It is the only bundled playable content; no commercial games are included.",
      aboutEyebrow: "OPEN-SOURCE SAMPLE",
      aboutTitle: "About PS2 Emu",
      aboutDemoTitle: "PS2SDK Cube Demo",
      aboutDemoSource: "Official source: ps2dev/ps2sdk samples/cube · License: Academic Free License 2.0 (AFL-2.0).",
      aboutDemoIntegrity: "The ELF is stored outside app.asar and checked against this exact SHA-256 at packaging, verification, and immediately before launch:",
      aboutRuntimeNotice: "The accompanying notice records statically linked runtime provenance. Public distribution remains gated on final legal review.",
      aboutNoCommercial: "No commercial games, PlayStation 2 BIOS, Play.exe, or Play! core are included.",
      readDemoLicense: "Read AFL-2.0 terms",
      readDemoNotice: "Read provenance & notices",
      continue: "Continue",
      play: "Play",
      remove: "Remove",
      favorite: "Favorite",
      titles: "titles",
      coreReady: "Launcher ready",
      launching: "Launching",
      running: "Running",
      stopping: "Stopping",
      waiting: "Waiting for Play!",
      failed: "Launch failed",
      customConfirm: "A custom executable is not publisher/version verified. Continue to the Windows file picker only if you trust it?",
    },
    ja: {
      library: "ライブラリ",
      settings: "設定",
      openPlaySettings: "Play! の設定を開く",
      lawfulOnly: "適法に所有・利用できるゲームデータまたは許可済みhomebrewだけを使用してください。",
      showLogs: "ログを表示",
      about: "このアプリについて",
      workspace: "ローカルゲーム ワークスペース",
      yourLibrary: "ゲームライブラリ",
      search: "検索",
      searchPlaceholder: "ゲームを検索",
      addFolder: "フォルダを追加",
      addGames: "ゲームを追加",
      stop: "停止",
      armTitle: "ARM64ネイティブ・ランチャー、x64 Play!はWindows互換実行",
      armBody: "Play! はWindows ARM64コアを公開していません。別プロセスのx64 Play!をWindows 11がPrism経由で実行します。",
      games: "ゲーム",
      emptyEyebrow: "ゲーム未登録",
      emptyTitle: "自分のライブラリを追加。",
      emptyBody: "ファイルは元の場所に残り、ランチャーはローカルパスとプレイ履歴だけを保存します。",
      chooseGames: "ゲームを選択",
      preferences: "環境設定",
      language: "言語",
      systemLanguage: "システム設定",
      launch: "起動",
      fullscreen: "フルスクリーンで開始",
      fullscreenHelp: "Play! に --fullscreen を直接渡します。",
      core: "Play! コア",
      getOfficialPlay: "公式Play!を入手",
      chooseCustomCore: "カスタムコアを選択",
      useStandardCore: "標準インストールを使用",
      standardHashWarning: "標準Play!は未署名です。PS2 Emuは、Play.exeと必要なQtファイルのSHA-256、サイズ、x64 PE machine、バージョン情報が固定値と完全一致する確認済みbuildだけを許可します。発行元は未検証です。",
      customWarning: "カスタムコアは発行元・バージョンの信頼検証対象外です。同意で固定するのはPlay.exeのパスとhashだけで、隣接DLLやpluginは対象外です。インストール全体を信頼できる場合だけ選択してください。",
      done: "完了",
      noticeTitle: "続行する前に",
      noticeLead: "PS2 Emuは独立したランチャーです。Play!は別ウィンドウで開き、ゲーム互換性は保証されません。",
      noticeLawful: "適法に利用できるゲームダンプまたは許可済みhomebrewだけを使用します。商用ゲームやBIOSは同梱されません。",
      noticePrivacy: "このPCにローカルファイルパス、ライブラリ履歴、上限付き診断ログが保存されることを理解しました。",
      noticeAffiliation: "Sony、PlayStation、Play!との提携・承認関係がないことを理解しました。",
      noticeHashOnly: "標準Windows Play!は未署名で、完全一致するhashだけで許可され、発行元は未検証であることを理解しました。",
      noticeDemo: "同梱する公式ps2dev/ps2sdk Cube DemoのAcademic Free License 2.0全文を確認し、条件を受諾します。同梱する実行可能コンテンツはこれだけで、商用ゲームは含みません。",
      aboutEyebrow: "オープンソース サンプル",
      aboutTitle: "PS2 Emuについて",
      aboutDemoTitle: "PS2SDK Cube Demo",
      aboutDemoSource: "公式ソース: ps2dev/ps2sdk samples/cube · ライセンス: Academic Free License 2.0 (AFL-2.0)。",
      aboutDemoIntegrity: "ELFはapp.asarの外に置き、package作成・検証時と起動直前に次のSHA-256との完全一致を確認します:",
      aboutRuntimeNotice: "同梱NOTICEに静的linkされたruntimeの来歴を記録しています。一般公開には最終法務確認が必要です。",
      aboutNoCommercial: "商用ゲーム、PlayStation 2 BIOS、Play.exe、Play!コアは同梱しません。",
      readDemoLicense: "AFL-2.0全文を読む",
      readDemoNotice: "来歴・noticeを読む",
      continue: "続ける",
      play: "起動",
      remove: "削除",
      favorite: "お気に入り",
      titles: "本",
      coreReady: "ランチャー待機中",
      launching: "起動中",
      running: "実行中",
      stopping: "停止中",
      waiting: "Play! の終了待ち",
      failed: "起動失敗",
      customConfirm: "この実行ファイルは発行元・バージョンを検証できません。信頼できる場合だけWindowsのファイル選択へ進みますか？",
    },
  });

  let appState = null;
  let activeLanguage = "en";
  let toastTimer = 0;

  const elements = {
    platformLabel: document.querySelector("[data-platform-label]"),
    coreDot: document.querySelector("[data-core-dot]"),
    coreStatus: document.querySelector("[data-core-status]"),
    coreMessage: document.querySelector("[data-core-message]"),
    coreSettings: document.querySelector("[data-core-settings]"),
    runtimePulse: document.querySelector("[data-runtime-pulse]"),
    runtimeStatus: document.querySelector("[data-runtime-status]"),
    runtimeGame: document.querySelector("[data-runtime-game]"),
    stop: document.querySelector("[data-stop]"),
    armNote: document.querySelector("[data-arm-note]"),
    gameGrid: document.querySelector("[data-game-grid]"),
    emptyState: document.querySelector("[data-empty-state]"),
    libraryCount: document.querySelector("[data-library-count]"),
    search: document.querySelector("[data-search]"),
    settingsDialog: document.querySelector("[data-settings-dialog]"),
    aboutDialog: document.querySelector("[data-about-dialog]"),
    noticeDialog: document.querySelector("[data-notice-dialog]"),
    language: document.querySelector("[data-language]"),
    fullscreen: document.querySelector("[data-fullscreen]"),
    settingsCore: document.querySelector("[data-settings-core]"),
    version: document.querySelector("[data-version]"),
    noticeLanguage: document.querySelector("[data-notice-language]"),
    noticeLawful: document.querySelector("[data-notice-lawful]"),
    noticePrivacy: document.querySelector("[data-notice-privacy]"),
    noticeAffiliation: document.querySelector("[data-notice-affiliation]"),
    noticeHashOnly: document.querySelector("[data-notice-hash-only]"),
    noticeDemo: document.querySelector("[data-notice-demo]"),
    noticeContinue: document.querySelector("[data-notice-continue]"),
    demoSha: document.querySelector("[data-demo-sha]"),
    toast: document.querySelector("[data-toast]"),
  };

  function text(key) {
    return strings[activeLanguage]?.[key] || strings.en[key] || key;
  }

  function applyTranslations() {
    document.documentElement.lang = activeLanguage;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = text(node.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.placeholder = text(node.dataset.i18nPlaceholder);
    });
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = String(message || "Unexpected error");
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 6_000);
  }

  async function perform(action) {
    try {
      const result = await action();
      if (result && typeof result === "object") update(result);
      return result;
    } catch (error) {
      showToast(error?.message || error);
      return null;
    }
  }

  function runtimeLabel(status) {
    return ({
      idle: text("coreReady"),
      launching: text("launching"),
      running: text("running"),
      stopping: text("stopping"),
      waiting: text("waiting"),
      failed: text("failed"),
    })[status] || status;
  }

  function gameCard(game) {
    const article = document.createElement("article");
    article.className = "game-card";
    article.dataset.gameId = game.id;

    const top = document.createElement("div");
    top.className = "game-card__top";
    const format = document.createElement("span");
    format.className = "game-format";
    format.textContent = game.filePath.split(".").pop().toUpperCase();
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `favorite-button${game.favorite ? " is-favorite" : ""}`;
    favorite.textContent = game.favorite ? "◆" : "◇";
    favorite.setAttribute("aria-label", `${text("favorite")}: ${game.title}`);
    favorite.dataset.action = "favorite";
    top.append(format, favorite);

    const title = document.createElement("h3");
    title.textContent = game.title;
    const gamePath = document.createElement("p");
    gamePath.className = "game-path";
    gamePath.textContent = game.filePath;

    const actions = document.createElement("div");
    actions.className = "game-card__actions";
    const launch = document.createElement("button");
    launch.type = "button";
    launch.className = "button button--primary";
    launch.textContent = text("play");
    launch.dataset.action = "launch";
    launch.disabled = !appState.core.available || appState.runtime.status !== "idle";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = text("remove");
    remove.dataset.action = "remove";
    actions.append(launch, remove);
    article.append(top, title, gamePath, actions);
    return article;
  }

  function renderLibrary() {
    const query = elements.search.value.trim().toLocaleLowerCase(activeLanguage === "ja" ? "ja-JP" : "en-US");
    const games = appState.games.filter((game) => {
      if (!query) return true;
      return `${game.title}\n${game.filePath}`.toLocaleLowerCase().includes(query);
    });
    elements.gameGrid.replaceChildren(...games.map(gameCard));
    elements.emptyState.hidden = appState.games.length !== 0;
    elements.gameGrid.hidden = appState.games.length === 0;
    elements.libraryCount.textContent = activeLanguage === "ja"
      ? `${games.length}${text("titles")}`
      : `${games.length} ${text("titles")}`;
  }

  function update(nextState) {
    appState = nextState;
    activeLanguage = nextState.language === "ja" ? "ja" : "en";
    applyTranslations();
    elements.platformLabel.textContent = nextState.architecture === "arm64"
      ? "Windows · ARM64"
      : "Windows · x64";
    elements.armNote.hidden = nextState.architecture !== "arm64";

    elements.coreDot.classList.toggle("is-ready", nextState.core.available);
    elements.coreStatus.textContent = nextState.core.available
      ? (nextState.core.mode === "modified" ? "Custom Play! x64" : "Play! x64 · hash verified")
      : "Play! x64 required";
    elements.coreMessage.textContent = nextState.core.message;
    elements.coreSettings.disabled = !nextState.core.available || nextState.runtime.status !== "idle";

    elements.runtimeStatus.textContent = runtimeLabel(nextState.runtime.status);
    elements.runtimeGame.textContent = nextState.runtime.currentGameTitle || "";
    elements.runtimePulse.classList.toggle("is-running", nextState.runtime.status === "running");
    elements.stop.hidden = !["launching", "running", "stopping", "waiting"].includes(nextState.runtime.status);
    if (nextState.runtime.error) showToast(nextState.runtime.error);

    elements.language.value = nextState.preferences.language;
    elements.fullscreen.checked = nextState.preferences.fullscreen;
    elements.settingsCore.textContent = nextState.core.path
      ? `${nextState.core.message}\n${nextState.core.path}`
      : nextState.core.message;
    elements.version.textContent = `PS2 Emu ${nextState.appVersion} · ${nextState.architecture}`;
    elements.demoSha.textContent = nextState.bundledDemo.sha256;
    renderLibrary();

    const noticeAccepted = nextState.preferences.consentAccepted === true
      && nextState.preferences.bundledDemoTermsAccepted === true;
    if (!noticeAccepted && !elements.noticeDialog.open) {
      elements.noticeLanguage.value = activeLanguage;
      elements.noticeDialog.showModal();
    } else if (noticeAccepted && elements.noticeDialog.open) {
      elements.noticeDialog.close();
    }
  }

  function syncNoticeButton() {
    elements.noticeContinue.disabled = !(
      elements.noticeLawful.checked
      && elements.noticePrivacy.checked
      && elements.noticeAffiliation.checked
      && elements.noticeHashOnly.checked
      && elements.noticeDemo.checked
    );
  }

  document.querySelectorAll("[data-add-files], [data-empty-add]").forEach((button) => {
    button.addEventListener("click", () => perform(() => window.ps2.addFiles()));
  });
  document.querySelector("[data-add-folder]").addEventListener("click", () => perform(() => window.ps2.addFolder()));
  document.querySelector("[data-open-settings]").addEventListener("click", () => elements.settingsDialog.showModal());
  document.querySelector("[data-open-about]").addEventListener("click", () => elements.aboutDialog.showModal());
  document.querySelector("[data-show-logs]").addEventListener("click", () => perform(() => window.ps2.showLogs()));
  document.querySelectorAll("[data-open-demo-license]").forEach((button) => {
    button.addEventListener("click", () => perform(() => window.ps2.openDemoLicense()));
  });
  document.querySelectorAll("[data-open-demo-notice]").forEach((button) => {
    button.addEventListener("click", () => perform(() => window.ps2.openDemoNotice()));
  });
  document.querySelector("[data-download-play]").addEventListener("click", () => perform(() => window.ps2.openOfficialPlayDownload()));
  document.querySelector("[data-use-standard]").addEventListener("click", () => perform(() => window.ps2.useStandardCore()));
  document.querySelector("[data-choose-core]").addEventListener("click", () => perform(() => window.ps2.chooseModifiedCore()));
  document.querySelector("[data-core-settings]").addEventListener("click", () => perform(() => window.ps2.openCoreSettings()));
  elements.stop.addEventListener("click", () => perform(() => window.ps2.stopCore()));
  elements.search.addEventListener("input", () => renderLibrary());

  elements.language.addEventListener("change", () => perform(() => window.ps2.updatePreferences({ language: elements.language.value })));
  elements.fullscreen.addEventListener("change", () => perform(() => window.ps2.updatePreferences({ fullscreen: elements.fullscreen.checked })));

  elements.gameGrid.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    const card = event.target.closest("[data-game-id]");
    if (!actionButton || !card) return;
    const gameID = card.dataset.gameId;
    if (actionButton.dataset.action === "launch") perform(() => window.ps2.launchGame(gameID));
    if (actionButton.dataset.action === "favorite") perform(() => window.ps2.toggleFavorite(gameID));
    if (actionButton.dataset.action === "remove") perform(() => window.ps2.removeGame(gameID));
  });

  [elements.noticeLawful, elements.noticePrivacy, elements.noticeAffiliation, elements.noticeHashOnly, elements.noticeDemo].forEach((checkbox) => {
    checkbox.addEventListener("change", syncNoticeButton);
  });
  elements.noticeLanguage.addEventListener("change", () => {
    activeLanguage = elements.noticeLanguage.value === "ja" ? "ja" : "en";
    applyTranslations();
  });
  elements.noticeContinue.addEventListener("click", () => perform(() => window.ps2.acceptNotice({
    lawfulUseAccepted: elements.noticeLawful.checked,
    privacyAccepted: elements.noticePrivacy.checked,
    nonAffiliationAccepted: elements.noticeAffiliation.checked,
    hashOnlyRiskAccepted: elements.noticeHashOnly.checked,
    bundledDemoAccepted: elements.noticeDemo.checked,
    language: elements.noticeLanguage.value,
  })));
  elements.noticeDialog.addEventListener("cancel", (event) => event.preventDefault());

  window.ps2.onState(update);
  perform(() => window.ps2.getState());
})();
