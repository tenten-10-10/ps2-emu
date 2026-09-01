import SwiftUI

enum InformationSheet: String, Identifiable {
    case about
    case licenses

    var id: String { rawValue }
}

struct InformationSheetView: View {
    @EnvironmentObject private var preferences: AppPreferences
    @Environment(\.dismiss) private var dismiss

    let sheet: InformationSheet

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
                Button(preferences.text("Done", "完了")) { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }
            .padding(16)

            Divider()

            switch sheet {
            case .about:
                AboutView()
            case .licenses:
                LicensesView()
            }
        }
        .frame(width: 660, height: 560)
        .environment(\.locale, preferences.resolvedLanguage.locale)
    }

    private var title: String {
        switch sheet {
        case .about: preferences.text("About PS2 Emu", "PS2 Emuについて")
        case .licenses: preferences.text("Open Source Licenses", "オープンソースライセンス")
        }
    }
}

private struct AboutView: View {
    @EnvironmentObject private var preferences: AppPreferences

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 16) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [VisualStyle.electricBlue, VisualStyle.violet],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        Text("2")
                            .font(.system(size: 36, weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 78, height: 78)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(AppIdentity.displayName)
                            .font(.title.bold())
                        Text(versionText)
                            .foregroundStyle(.secondary)
                        Text(preferences.text(
                            "A free desktop launcher built around the Play! emulation core.",
                            "Play!エミュレーションコアを利用した無料のデスクトップランチャーです。"
                        ))
                        .font(.callout)
                    }
                }

                Divider()

                Text(preferences.text("Independent project", "独立したプロジェクト"))
                    .font(.headline)
                Text(preferences.text(
                    "PS2 Emu is not affiliated with, endorsed by, or sponsored by Sony Interactive Entertainment, PlayStation, or the Play! project. PlayStation names and marks belong to their respective owners.",
                    "PS2 Emuは、Sony Interactive Entertainment、PlayStation、Play!プロジェクトとは提携・承認・後援関係にない独立したプロジェクトです。PlayStationに関する名称・商標は各権利者に帰属します。"
                ))
                .foregroundStyle(.secondary)
                .lineSpacing(3)

                Text(preferences.text("Core and content", "コアとコンテンツ"))
                    .font(.headline)
                Text(coreAndContentText)
                .foregroundStyle(.secondary)
                .lineSpacing(3)

                Divider()

                Link("cless@planter.jp", destination: URL(string: "mailto:cless@planter.jp")!)
                    .font(.callout)
                Link(
                    preferences.text("Play! source code", "Play!ソースコード"),
                    destination: URL(string: "https://github.com/jpd002/Play-")!
                )
            }
            .padding(24)
        }
    }

    private var versionText: String {
        let dictionary = Bundle.main.infoDictionary
        let version = dictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
        let build = dictionary?["CFBundleVersion"] as? String ?? "1"
        return preferences.text("Version \(version) (\(build))", "バージョン \(version)（\(build)）")
    }

    private var coreAndContentText: String {
        if LegalDocumentLoader.isExternalCoreDistribution {
            return preferences.text(
                "This external-core build uses a separately installed official Play! app and verifies its publisher, signature, version, code hash, and architecture. It is not ready for public distribution until the outer launcher is signed, notarized, and verified on matching hardware. An explicit expert override can use a user-modified core, which is clearly marked as not security verified. Games, BIOS files, console keys, and copyrighted system software are not included.",
                "この外部コア版は、別途インストールした公式Play!の発行元、署名、バージョン、コードハッシュ、アーキテクチャを検証して利用します。外側ランチャーの署名、公証、対象実機検証が完了するまでは公開配布できません。明示的な上級者向け設定ではユーザー改変コアも利用できますが、セキュリティ未検証として明瞭に表示されます。ゲーム、BIOS、コンソールキー、著作権で保護されたシステムソフトウェアは含まれません。"
            )
        }
        return preferences.text(
            "This local-development build includes a strictly verified Play! app. It is not the public distribution model. An explicit expert override can use a user-modified core, which is clearly marked as not security verified. Games, BIOS files, console keys, and copyrighted system software are not included.",
            "このローカル開発版はstrict検証済みのPlay!を同梱していますが、公開配布モデルではありません。明示的な上級者向け設定ではユーザー改変コアも利用できますが、セキュリティ未検証として明瞭に表示されます。ゲーム、BIOS、コンソールキー、著作権で保護されたシステムソフトウェアは含まれません。"
        )
    }
}

private struct LicensesView: View {
    @EnvironmentObject private var preferences: AppPreferences
    @State private var selectedDocument: LicenseDocument = .play

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(introductionText)
            .font(.callout)
            .foregroundStyle(.secondary)

            Picker(preferences.text("Document", "文書"), selection: $selectedDocument) {
                ForEach(LicenseDocument.allCases) { document in
                    Text(document.title(preferences: preferences)).tag(document)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            ScrollView {
                Text(selectedDocument.contents(preferences: preferences))
                    .font(.system(size: 11, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
            }
            .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 10))

            if selectedDocument == .play {
                Link(
                    preferences.text("View the Play! project and license", "Play!プロジェクトとライセンスを表示"),
                    destination: URL(string: "https://github.com/jpd002/Play-")!
                )
                .font(.caption)
            }
        }
        .padding(20)
    }

    private var introductionText: String {
        if LegalDocumentLoader.isExternalCoreDistribution {
            return preferences.text(
                "Play! is an independent open-source project and is not bundled with this distribution. Use the upstream link below to review its license. No Play!-specific notice file is included in this launcher package.",
                "Play!は独立したオープンソースプロジェクトであり、この配布物には同梱されていません。下の上流リンクからライセンスを確認できます。このランチャーパッケージにはPlay!専用noticeを収録していません。"
            )
        }
        return preferences.text(
            "This local-development build includes the open-source Play! app. Its license and third-party notices are available here and in the app package; this bundled build is not approved for public distribution.",
            "このローカル開発版はオープンソースのPlay!アプリを同梱しています。ライセンスと第三者通知はここおよびアプリパッケージ内で確認できますが、この同梱版は公開配布できません。"
        )
    }
}

private enum LicenseDocument: String, CaseIterable, Identifiable {
    case play
    case thirdParty

    var id: String { rawValue }

    @MainActor
    func title(preferences: AppPreferences) -> String {
        switch self {
        case .play: "Play! BSD 2-Clause"
        case .thirdParty: preferences.text("Third-Party Notices", "第三者通知")
        }
    }

    @MainActor
    func contents(preferences: AppPreferences) -> String {
        let fileName: String
        switch self {
        case .play: fileName = "Play-License.txt"
        case .thirdParty: fileName = "THIRD-PARTY-NOTICES.md"
        }

        if let contents = LegalDocumentLoader.load(fileName: fileName) {
            return contents
        }

        if LegalDocumentLoader.isExternalCoreDistribution {
            switch self {
            case .play:
                return preferences.text(
                    "Play! is not bundled with this distribution. The separately installed Play! application is an independent third-party project; use the upstream project link below to review its license.",
                    "この配布物にはPlay!は同梱されていません。別途インストールするPlay!は独立した第三者プロジェクトです。下の上流プロジェクトリンクからライセンスを確認してください。"
                )
            case .thirdParty:
                return preferences.text(
                    "No Play!-specific third-party notice file is bundled with this external-core distribution.",
                    "この外部core版には、Play!専用の第三者通知ファイルは同梱されていません。"
                )
            }
        }

        return preferences.text(
            "This notice file is unavailable in a build that may bundle Play!. Do not distribute this build until the bundled notices are restored.",
            "Play!を同梱する可能性がある現在のビルドでは通知ファイルを読み込めません。この通知が復元されるまで配布しないでください。"
        )
    }
}

enum LegalDocumentLoader {
    static var isExternalCoreDistribution: Bool {
        Bundle.main.object(forInfoDictionaryKey: "PS2BundledPlayCore") as? Bool == false
    }

    static func load(fileName: String) -> String? {
        guard !isExternalCoreDistribution else { return nil }
        var candidates: [URL] = []
        if let resourceURL = Bundle.main.resourceURL {
            candidates.append(resourceURL.appendingPathComponent(fileName))
        }
        candidates.append(
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appendingPathComponent("Resources", isDirectory: true)
                .appendingPathComponent(fileName)
        )

        for url in candidates where FileManager.default.fileExists(atPath: url.path) {
            if let contents = try? String(contentsOf: url, encoding: .utf8) {
                return contents
            }
        }
        return nil
    }
}
