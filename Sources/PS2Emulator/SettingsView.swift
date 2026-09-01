import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var library: GameLibrary
    @EnvironmentObject private var launcher: EmulatorLauncher
    @EnvironmentObject private var preferences: AppPreferences

    @State private var informationSheet: InformationSheet?

    var body: some View {
        TabView {
            generalSettings
                .tabItem { Label(preferences.text("General", "一般"), systemImage: "gearshape") }

            engineSettings
                .tabItem { Label(preferences.text("Engine", "エンジン"), systemImage: "cpu") }

            informationSettings
                .tabItem { Label(preferences.text("Information", "情報"), systemImage: "info.circle") }
        }
        .sheet(item: $informationSheet) { sheet in
            InformationSheetView(sheet: sheet)
                .environmentObject(preferences)
        }
    }

    private var generalSettings: some View {
        Form {
            Section(preferences.text("Language", "言語")) {
                Picker(preferences.text("App Language", "アプリの言語"), selection: $preferences.language) {
                    ForEach(AppLanguage.allCases) { language in
                        Text(language.displayName(in: preferences.resolvedLanguage)).tag(language)
                    }
                }
            }

            Section(preferences.text("Launch", "起動")) {
                Toggle(
                    preferences.text("Launch games in full screen", "ゲームをフルスクリーンで起動"),
                    isOn: $preferences.launchFullscreen
                )
                Toggle(
                    preferences.text("Scan subfolders in game folders", "ゲームフォルダのサブフォルダも検索"),
                    isOn: $preferences.scanRecursively
                )
                Toggle(
                    preferences.text("Show file format and size on cards", "カードにファイル形式とサイズを表示"),
                    isOn: $preferences.showFileDetails
                )
            }
            .disabled(!preferences.hasAcceptedSafetyNotice)

            Section(preferences.text("Library", "ライブラリ")) {
                LabeledContent(
                    preferences.text("Registered Games", "登録ゲーム"),
                    value: AppLocalizer.gameCount(library.games.count, language: preferences.resolvedLanguage)
                )
                LabeledContent(
                    preferences.text("Watched Folders", "監視フォルダ"),
                    value: AppLocalizer.folderCount(library.watchedFolders.count, language: preferences.resolvedLanguage)
                )
                HStack {
                    Button(preferences.text("Add Games…", "ゲームを追加…")) { library.showAddGamesPanel() }
                    Button(preferences.text("Add Folders…", "フォルダを追加…")) {
                        library.showAddFolderPanel(recursive: preferences.scanRecursively)
                    }
                }
            }
            .disabled(!preferences.hasAcceptedSafetyNotice)
        }
        .padding(24)
    }

    private var engineSettings: some View {
        Form {
            Section(preferences.text("Play! Engine", "Play! エンジン")) {
                LabeledContent(preferences.text("Version", "バージョン"), value: launcher.coreVersion)
                LabeledContent(
                    preferences.text("Architecture", "アーキテクチャ"),
                    value: "Apple Silicon / Intel Universal"
                )
                LabeledContent(
                    "BIOS",
                    value: preferences.text("Built-in HLE (no external BIOS)", "内蔵HLE（外部BIOS不要）")
                )
                LabeledContent(preferences.text("Status", "状態"), value: coreStatusText)
                if let source = launcher.coreSource {
                    LabeledContent(preferences.text("Source", "読込元"), value: coreSourceText(source))
                }
            }

            if launcher.isUsingUserModifiedCore {
                Section {
                    Label(
                        preferences.text(
                            "User-modified core — signature, publisher, Team ID, CDHash, and security are not verified.",
                            "ユーザー改変コア — 署名、発行元、Team ID、CDHash、セキュリティは検証されません。"
                        ),
                        systemImage: "exclamationmark.shield.fill"
                    )
                    .foregroundStyle(.orange)
                    if let error = launcher.coreValidationError {
                        Label(error, systemImage: "xmark.octagon.fill")
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            } else if let error = launcher.coreValidationError {
                Section {
                    Label(error, systemImage: "xmark.octagon.fill")
                        .foregroundStyle(.red)
                        .font(.caption)
                    Link(
                        preferences.text("Download the verified official Play! build", "検証済みPlay!公式ビルドをダウンロード"),
                        destination: CoreValidator.officialDownloadURL
                    )
                    Text(preferences.text(
                        "Play! is a separate independent application. A separately installed official build is accepted only when strict fingerprint verification succeeds.",
                        "Play!は独立した別アプリです。別途導入した公式版は、strict fingerprint検証に成功した場合だけ利用できます。"
                    ))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            Section {
                HStack {
                    Button(preferences.text("Open Play! Settings", "Play! の設定を開く")) {
                        do {
                            try launcher.launchCoreSettings()
                        } catch {
                            launcher.lastError = error.localizedDescription
                        }
                    }
                    .disabled(
                        !preferences.hasAcceptedSafetyNotice
                            || launcher.isRunning
                            || !launcher.isCoreAvailable
                    )

                    if launcher.lastLogURL != nil {
                        Button(preferences.text("Show Latest Log", "最新ログを表示")) {
                            launcher.showLastLog()
                        }
                    }
                }
            }

            Section(preferences.text("Implementation", "実装情報")) {
                Text(preferences.text(
                    "Play! is an open-source PS2 emulator available under the BSD 2-Clause license. Games, BIOS files, and console keys are not included.",
                    "Play!はBSD 2-Clauseライセンスで公開されるオープンソースPS2エミュレーターです。ゲーム、BIOS、コンソールキーは同梱されません。"
                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                Link(
                    preferences.text("Play! Source Code", "Play!ソースコード"),
                    destination: URL(string: "https://github.com/jpd002/Play-")!
                )
            }
        }
        .padding(24)
    }

    private var informationSettings: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(preferences.text("Safety & Privacy Notice", "安全性とプライバシーに関する注意"))
                    .font(.title2.bold())

                Text(preferences.text(
                    "PS2 Emu is independent and is not affiliated with Sony Interactive Entertainment, PlayStation, or the Play! project. Use only ISO, ELF, and other files you are legally permitted to use.",
                    "PS2 Emuは独立したプロジェクトであり、Sony Interactive Entertainment、PlayStation、Play!プロジェクトとは提携していません。法的に使用が認められたISO、ELF等のファイルだけを使用してください。"
                ))
                .lineSpacing(3)

                Text(preferences.text(
                    "Unknown files cannot be guaranteed safe. Play! opens in a separate window, compatibility varies, and the Play! app may independently make network connections or handle data.",
                    "出所不明ファイルの安全性は保証できません。Play!は別ウィンドウで開き、互換性には差があり、Play!アプリが独自にネットワーク通信やデータ処理を行う場合があります。"
                ))
                .foregroundStyle(.secondary)
                .lineSpacing(3)

                Text(preferences.text(
                    "Imported paths, watched folders, favorites, play history, play time, and Play! output logs are stored locally on this Mac. Logs may include file paths and runtime details.",
                    "読み込んだパス、監視フォルダ、お気に入り、プレイ履歴、プレイ時間、Play!出力ログはこのMacにローカル保存されます。ログにはファイルパスや実行情報が含まれる場合があります。"
                ))
                .foregroundStyle(.secondary)
                .lineSpacing(3)

                Link(
                    "Play! Compatibility Tracker",
                    destination: URL(string: "https://github.com/jpd002/Play-Compatibility")!
                )

                Divider()

                HStack {
                    Button(preferences.text("About PS2 Emu", "PS2 Emuについて")) {
                        informationSheet = .about
                    }
                    Button(preferences.text("Open Source Licenses", "オープンソースライセンス")) {
                        informationSheet = .licenses
                    }
                }

                Button(preferences.text("Show First-Run Notice Again", "初回案内をもう一度表示")) {
                    preferences.hasAcceptedSafetyNotice = false
                }

                Spacer(minLength: 8)

                Link("cless@planter.jp", destination: URL(string: "mailto:cless@planter.jp")!)
                    .font(.caption)
            }
            .padding(28)
        }
    }

    private var coreStatusText: String {
        if launcher.isUsingUserModifiedCore {
            return preferences.text(
                "User-modified core (security not verified)",
                "ユーザー改変コア（セキュリティ未検証）"
            )
        }
        return launcher.isCoreAvailable
            ? preferences.text("Strictly verified", "strict検証済み")
            : preferences.text("Unavailable", "利用不可")
    }

    private func coreSourceText(_ source: CoreSource) -> String {
        switch source {
        case .bundled:
            preferences.text("Bundled Play!", "同梱Play!")
        case .externalOfficial:
            preferences.text("Separately installed Play!", "別途インストールしたPlay!")
        case .userModified:
            preferences.text("User-selected modified Play!", "ユーザー指定の改変Play!")
        case .notFound:
            preferences.text("Not found", "未検出")
        }
    }
}
