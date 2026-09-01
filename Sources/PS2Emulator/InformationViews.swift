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

                Text(preferences.text("Included validation demo", "同梱の検証デモ"))
                    .font(.headline)
                Text(preferences.text(
                    "PS2SDK Cube Demo is an open-source homebrew ELF validation sample, not a commercial PS2 game. It comes from the pinned ps2sdk source and CI build documented in Open Source Licenses, together with the required AFL 2.0, newlib, and GCC notices. PS2 Emu verifies its exact SHA-256 before each launch.",
                    "PS2SDK Cube Demoは、市販のPS2ゲームではなく、オープンソースのhomebrew ELF検証サンプルです。「オープンソースライセンス」に記載した固定ps2sdkソースとCIビルドに由来し、必須のAFL 2.0、newlib、GCC通知を同梱します。PS2 Emuは起動のたびに正確なSHA-256を検証します。"
                ))
                .foregroundStyle(.secondary)
                .lineSpacing(3)

                Divider()

                Link("cless@planter.jp", destination: URL(string: "mailto:cless@planter.jp")!)
                    .font(.callout)
                Link(
                    preferences.text("Play! source code", "Play!ソースコード"),
                    destination: URL(string: "https://github.com/jpd002/Play-")!
                )
                Link(
                    preferences.text("PS2SDK Cube Demo source", "PS2SDK Cube Demoソース"),
                    destination: URL(string: "https://github.com/ps2dev/ps2sdk/tree/39a89923ce59152fa855250cfacaccf8e581a1eb/ee/draw/samples/cube")!
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
                "This external-core build uses a separately installed official Play! app and verifies its publisher, signature, version, code hash, and architecture. It is not ready for public distribution until the outer launcher is signed, notarized, and verified on matching hardware. An explicit expert override can use a user-modified core, which is clearly marked as not security verified. No commercial games, BIOS files, console keys, or copyrighted system software are included; only the separately attributed open-source PS2SDK Cube Demo is bundled.",
                "この外部コア版は、別途インストールした公式Play!の発行元、署名、バージョン、コードハッシュ、アーキテクチャを検証して利用します。外側ランチャーの署名、公証、対象実機検証が完了するまでは公開配布できません。明示的な上級者向け設定ではユーザー改変コアも利用できますが、セキュリティ未検証として明瞭に表示されます。市販ゲーム、BIOS、コンソールキー、著作権で保護されたシステムソフトウェアは含まれず、別途帰属表示されたオープンソースのPS2SDK Cube Demoだけを同梱します。"
            )
        }
        return preferences.text(
            "This local-development build includes a strictly verified Play! app. It is not the public distribution model. An explicit expert override can use a user-modified core, which is clearly marked as not security verified. No commercial games, BIOS files, console keys, or copyrighted system software are included; only the separately attributed open-source PS2SDK Cube Demo is bundled.",
            "このローカル開発版はstrict検証済みのPlay!を同梱していますが、公開配布モデルではありません。明示的な上級者向け設定ではユーザー改変コアも利用できますが、セキュリティ未検証として明瞭に表示されます。市販ゲーム、BIOS、コンソールキー、著作権で保護されたシステムソフトウェアは含まれず、別途帰属表示されたオープンソースのPS2SDK Cube Demoだけを同梱します。"
        )
    }
}

private struct LicensesView: View {
    @EnvironmentObject private var preferences: AppPreferences
    @State private var selectedDocument: LicenseDocument = .ps2sdkAFL

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
            .pickerStyle(.menu)
            .labelsHidden()

            ScrollView {
                Text(selectedDocument.contents(preferences: preferences))
                    .font(.system(size: 11, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
            }
            .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 10))

            if let link = selectedDocument.upstreamLink(preferences: preferences) {
                Link(link.label, destination: link.url)
                .font(.caption)
            }
        }
        .padding(20)
    }

    private var introductionText: String {
        if LegalDocumentLoader.isExternalCoreDistribution {
            return preferences.text(
                "PS2SDK Cube Demo and its required ps2sdk/newlib/GCC license notices are included in this build. Play! is an independent open-source project and is not bundled with this distribution, so no Play!-specific notice file is included in the launcher package.",
                "PS2SDK Cube Demoと必須のps2sdk/newlib/GCCライセンス通知はこのビルドに同梱されます。Play!は独立したオープンソースプロジェクトであり、この配布物には同梱されないため、ランチャーパッケージにはPlay!専用noticeを収録していません。"
            )
        }
        return preferences.text(
            "PS2SDK Cube Demo and its required ps2sdk/newlib/GCC license notices are included in every build. This local-development build also includes the open-source Play! app; its Play!-specific notices appear only when Play! is bundled.",
            "PS2SDK Cube Demoと必須のps2sdk/newlib/GCCライセンス通知はすべてのビルドに同梱されます。このローカル開発版はオープンソースのPlay!アプリも同梱し、Play!専用の通知はPlay!同梱時だけ表示されます。"
        )
    }
}

private enum LicenseDocument: String, CaseIterable, Identifiable {
    case play
    case thirdParty
    case ps2sdkDemoNotice
    case ps2sdkAFL
    case newlib
    case gccRuntimeException
    case gccGPL

    var id: String { rawValue }

    @MainActor
    func title(preferences: AppPreferences) -> String {
        switch self {
        case .play: "Play! BSD 2-Clause"
        case .thirdParty: preferences.text("Third-Party Notices", "第三者通知")
        case .ps2sdkDemoNotice: preferences.text("Cube Demo Notice", "Cube Demo通知")
        case .ps2sdkAFL: "AFL 2.0"
        case .newlib: preferences.text("Newlib License", "Newlibライセンス")
        case .gccRuntimeException: preferences.text("GCC Runtime Exception", "GCC Runtime例外")
        case .gccGPL: "GCC GPLv3"
        }
    }

    @MainActor
    func contents(preferences: AppPreferences) -> String {
        let fileName: String
        switch self {
        case .play: fileName = "Play-License.txt"
        case .thirdParty: fileName = "THIRD-PARTY-NOTICES.md"
        case .ps2sdkDemoNotice: fileName = "Fixtures/PS2SDK-CUBE-NOTICE.md"
        case .ps2sdkAFL: fileName = "Fixtures/PS2SDK-AFL-2.0.txt"
        case .newlib: fileName = "Fixtures/NEWLIB-COPYING.txt"
        case .gccRuntimeException: fileName = "Fixtures/GCC-COPYING.RUNTIME.txt"
        case .gccGPL: fileName = "Fixtures/GCC-COPYING3.txt"
        }

        let requiresBundledPlayCore = self == .play || self == .thirdParty
        if let contents = LegalDocumentLoader.load(
            fileName: fileName,
            requiresBundledPlayCore: requiresBundledPlayCore
        ) {
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
            case .ps2sdkDemoNotice, .ps2sdkAFL, .newlib, .gccRuntimeException, .gccGPL:
                break
            }
        }

        if !requiresBundledPlayCore {
            return preferences.text(
                "A required PS2SDK Cube Demo, newlib, or GCC license/notice file is missing. Do not launch the demo or distribute this build.",
                "必須のPS2SDK Cube Demo、newlib、またはGCCのライセンス・通知ファイルが見つかりません。このデモを起動したり、このビルドを配布したりしないでください。"
            )
        }

        return preferences.text(
            "This notice file is unavailable in a build that may bundle Play!. Do not distribute this build until the bundled notices are restored.",
            "Play!を同梱する可能性がある現在のビルドでは通知ファイルを読み込めません。この通知が復元されるまで配布しないでください。"
        )
    }

    @MainActor
    func upstreamLink(preferences: AppPreferences) -> (label: String, url: URL)? {
        switch self {
        case .play, .thirdParty:
            (
                preferences.text("View the Play! project and license", "Play!プロジェクトとライセンスを表示"),
                URL(string: "https://github.com/jpd002/Play-")!
            )
        case .ps2sdkDemoNotice, .ps2sdkAFL, .newlib, .gccRuntimeException, .gccGPL:
            (
                preferences.text("View the exact PS2SDK Cube Demo source", "正確なPS2SDK Cube Demoソースを表示"),
                URL(string: "https://github.com/ps2dev/ps2sdk/tree/39a89923ce59152fa855250cfacaccf8e581a1eb/ee/draw/samples/cube")!
            )
        }
    }
}

enum LegalDocumentLoader {
    static var isExternalCoreDistribution: Bool {
        Bundle.main.object(forInfoDictionaryKey: "PS2BundledPlayCore") as? Bool == false
    }

    static func load(
        fileName: String,
        requiresBundledPlayCore: Bool = false,
        bundle: Bundle = .main,
        currentDirectoryURL: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    ) -> String? {
        if requiresBundledPlayCore, isExternalCoreDistribution { return nil }
        var candidates: [URL] = []
        if let resourceURL = bundle.resourceURL {
            candidates.append(resourceURL.appendingPathComponent(fileName))
        }
        candidates.append(
            currentDirectoryURL
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
