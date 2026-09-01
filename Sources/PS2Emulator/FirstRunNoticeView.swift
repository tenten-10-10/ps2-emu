import SwiftUI

struct FirstRunNoticeView: View {
    @EnvironmentObject private var preferences: AppPreferences
    @EnvironmentObject private var launcher: EmulatorLauncher

    let accept: () -> Void

    @State private var hasAcknowledged = false
    @State private var informationSheet: InformationSheet?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [VisualStyle.electricBlue, VisualStyle.violet],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Text("2")
                        .font(.system(size: 26, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                }
                .frame(width: 54, height: 54)

                VStack(alignment: .leading, spacing: 2) {
                    Text(AppIdentity.displayName)
                        .font(.title2.bold())
                    Text(preferences.text("Before you continue", "使用を開始する前に"))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                languagePicker
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 20)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(preferences.text(
                        "Please review these important legal, safety, privacy, and compatibility notices.",
                        "法的条件、安全性、プライバシー、互換性に関する重要事項をご確認ください。"
                    ))
                    .font(.title3.weight(.semibold))
                    .padding(.bottom, 2)

                    if launcher.isUsingUserModifiedCore {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(
                                preferences.text(
                                    "User-modified Play! core selected — its signature, publisher, and security are not verified.",
                                    "ユーザー改変Play!コアが選択されています。署名、発行元、セキュリティは検証されません。"
                                ),
                                systemImage: "exclamationmark.shield.fill"
                            )
                            .font(.headline)
                            if let error = launcher.coreValidationError {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                        .foregroundStyle(.orange)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    } else if let error = launcher.coreConfigurationError {
                        Label(error, systemImage: "xmark.octagon.fill")
                            .font(.headline)
                            .foregroundStyle(.red)
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                    } else if launcher.coreConfigurationError == nil, !launcher.isCoreAvailable {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(
                                preferences.text(
                                    "Play! is not installed or failed strict verification.",
                                    "Play!が未導入、またはstrict検証に失敗しています。"
                                ),
                                systemImage: "arrow.down.app.fill"
                            )
                            .font(.headline)
                            Link(
                                preferences.text("Download the verified official Play! build", "検証済みPlay!公式ビルドをダウンロード"),
                                destination: CoreValidator.officialDownloadURL
                            )
                            Text(preferences.text(
                                "PS2 Emu can open a separately installed, matching official Play! app.",
                                "PS2 Emuは、別途導入された対応する公式Play!アプリを利用できます。"
                            ))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                    }

                    NoticeRow(
                        symbol: "person.crop.circle.badge.xmark",
                        title: preferences.text("Independent and unaffiliated", "非提携の独立プロジェクト"),
                        message: preferences.text(
                            "PS2 Emu is not affiliated with, endorsed by, or sponsored by Sony Interactive Entertainment, PlayStation, or the Play! project. Their names and marks belong to their respective owners.",
                            "PS2 Emuは、Sony Interactive Entertainment、PlayStation、Play!プロジェクトとは提携・承認・後援関係にありません。各名称・商標はそれぞれの権利者に帰属します。"
                        )
                    )

                    NoticeRow(
                        symbol: "shippingbox.fill",
                        title: preferences.text(
                            "Included open-source validation demo",
                            "同梱のオープンソース検証デモ"
                        ),
                        message: preferences.text(
                            "PS2SDK Cube Demo is included as a homebrew ELF validation sample under the Academic Free License 2.0. It is not a commercial PS2 game. Its exact source, attribution, SHA-256, and required ps2sdk/newlib/GCC license notices are available in Open Source Licenses.",
                            "PS2SDK Cube DemoはAcademic Free License 2.0のhomebrew ELF検証サンプルとして同梱されています。市販のPS2ゲームではありません。正確なソース、帰属表示、SHA-256、必須のps2sdk/newlib/GCCライセンス通知は「オープンソースライセンス」で確認できます。"
                        )
                    )

                    NoticeRow(
                        symbol: "checkmark.shield",
                        title: preferences.text("Use only lawful content", "適法なコンテンツのみ使用"),
                        message: preferences.text(
                            "Except for the identified open-source PS2SDK Cube Demo, use only disc images you created from games you legally own where applicable law permits, or ISO/ELF and other files you are authorized to use. No commercial games, BIOS files, or console keys are included.",
                            "明示されたオープンソースのPS2SDK Cube Demoを除き、適用法で認められる範囲で、適法に所有するゲームから自分で作成したディスクイメージ、または使用許可を得たISO・ELF等のファイルだけを使用してください。市販ゲーム、BIOS、コンソールキーは同梱されません。"
                        )
                    )

                    NoticeRow(
                        symbol: "exclamationmark.triangle",
                        title: preferences.text("Imported files are untrusted", "読み込むファイルは信頼できるものに限定"),
                        message: preferences.text(
                            "A supported file extension does not verify a file's contents. Unknown or modified files cannot be guaranteed safe. Import files only from sources you trust.",
                            "対応拡張子であっても内容の真正性や安全性は検証されません。出所不明または改変されたファイルの安全は保証できないため、信頼できるファイルだけを読み込んでください。"
                        )
                    )

                    NoticeRow(
                        symbol: "macwindow.on.rectangle",
                        title: preferences.text("Play! opens separately", "Play!は別ウィンドウで動作"),
                        message: preferences.text(
                            "Games and core settings open in a separate Play! window. Compatibility, graphics, audio, controls, performance, and stability vary by game and Mac.",
                            "ゲームとコア設定は別のPlay!ウィンドウで開きます。互換性、映像、音声、操作、性能、安定性はゲームやMacによって異なります。"
                        )
                    )

                    NoticeRow(
                        symbol: "externaldrive.badge.icloud",
                        title: preferences.text("Local history and logs", "ローカルの履歴・ログ保存"),
                        message: preferences.text(
                            "This wrapper stores imported file paths, watched folders, favorites, play history, and play time in Application Support. Play! output logs, which may contain paths or runtime details, are stored in your Library logs folder.",
                            "本ラッパーは、読み込んだファイルのパス、監視フォルダ、お気に入り、プレイ履歴、プレイ時間をApplication Supportに保存します。パスや実行情報を含む可能性があるPlay!出力ログは、ユーザーLibraryのLogsフォルダに保存されます。"
                        )
                    )

                    NoticeRow(
                        symbol: "network",
                        title: preferences.text("Play! may act independently", "Play!による独自の通信・データ処理"),
                        message: preferences.text(
                            "The Play! core used by this wrapper is a separate third-party application. Depending on its implementation and settings, it may make network connections or handle data independently. This wrapper does not control those behaviors.",
                            "本ラッパーが利用するPlay!コアは別の第三者アプリです。その実装や設定により、独自にネットワーク通信またはデータ処理を行う可能性があり、本ラッパーはその挙動を管理しません。"
                        )
                    )
                }
                .padding(28)
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }

            Divider()

            VStack(alignment: .leading, spacing: 14) {
                Toggle(isOn: $hasAcknowledged) {
                    Text(preferences.text(
                        "I have read and understand these notices, have reviewed and accept the Academic Free License 2.0 terms for the included PS2SDK Cube Demo, and will use only content I am legally permitted to use.",
                        "上記の注意事項を読み、理解しました。同梱のPS2SDK Cube Demoに適用されるAcademic Free License 2.0の条件を確認して受諾し、法的に使用が認められたコンテンツだけを使用します。"
                    ))
                }

                HStack {
                    Button(preferences.text("About", "このアプリについて")) {
                        informationSheet = .about
                    }
                    Button(preferences.text("Licenses", "ライセンス")) {
                        informationSheet = .licenses
                    }

                    Spacer()

                    Button(preferences.text("I Understand and Continue", "理解して続ける"), action: accept)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(!hasAcknowledged)
                }
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 18)
        }
        .background(
            LinearGradient(
                colors: [Color(nsColor: .windowBackgroundColor), VisualStyle.midnight.opacity(0.18)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .sheet(item: $informationSheet) { sheet in
            InformationSheetView(sheet: sheet)
                .environmentObject(preferences)
        }
    }

    private var languagePicker: some View {
        HStack(spacing: 8) {
            Text(preferences.text("Language", "言語"))
                .font(.caption)
                .foregroundStyle(.secondary)
            Picker(preferences.text("Language", "言語"), selection: $preferences.language) {
                ForEach(AppLanguage.allCases) { language in
                    Text(language.displayName(in: preferences.resolvedLanguage)).tag(language)
                }
            }
            .labelsHidden()
            .frame(width: 130)
        }
    }
}

private struct NoticeRow: View {
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(VisualStyle.electricBlue)
                .frame(width: 34, height: 34)
                .background(VisualStyle.electricBlue.opacity(0.10), in: RoundedRectangle(cornerRadius: 9))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(message)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
