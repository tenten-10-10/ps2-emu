import CryptoKit
import Foundation

@MainActor
final class AppPreferences: ObservableObject {
    struct BundledDemoReviewedFileIdentity: Equatable, Sendable {
        let relativePath: String
        let sha256: String
        let byteCount: Int
    }

    nonisolated static let bundledDemoReviewedFileIdentities = [
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/ps2sdk-cube.elf",
            sha256: "1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584",
            byteCount: 174_772
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/PS2SDK-AFL-2.0.txt",
            sha256: "1ecee940922a6886baccddd9133d17f1ce677d32c5a954fac8e48224f2766fe8",
            byteCount: 9_005
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/PS2SDK-CUBE-NOTICE.md",
            sha256: "74e4ebb0e2f098bd02dc68afb3d48c22cfd1d9ae045986786ddd54fa77b0ba94",
            byteCount: 7_280
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/NEWLIB-COPYING.txt",
            sha256: "f3afe48e4bc6ed8466a42e9dacb6be1d8f9cbf5aac15cb8e474a5ccde8b40ef6",
            byteCount: 78_388
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/GCC-COPYING.RUNTIME.txt",
            sha256: "9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74",
            byteCount: 3_324
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/GCC-COPYING3.txt",
            sha256: "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903",
            byteCount: 35_147
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/source/cube.c",
            sha256: "fb5cc5955ffe346ede5f31d73743545d001fd144fff7ab186cf6b5654ba1b824",
            byteCount: 6_298
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/source/mesh_data.c",
            sha256: "ff6ab49e9aa12250aa1b4d8b9a63a018b954a5d49b4e89ca2ed6abe60ed2cd43",
            byteCount: 2_456
        ),
        BundledDemoReviewedFileIdentity(
            relativePath: "Resources/Fixtures/source/Makefile",
            sha256: "7ecc7e683798fe29a0627ade45f10a0aa022e060cf342b413ac4c88a641d925b",
            byteCount: 718
        )
    ]

    nonisolated static let bundledDemoLicenseAcceptanceRevision =
        bundledDemoLicenseAcceptanceRevision(for: bundledDemoReviewedFileIdentities)
    nonisolated static let bundledDemoLicenseAcceptanceKey =
        "bundledDemoLicenseAcceptance.v2.\(bundledDemoLicenseAcceptanceRevision)"

    nonisolated static func bundledDemoLicenseAcceptanceRevision(
        for identities: [BundledDemoReviewedFileIdentity]
    ) -> String {
        let manifest = "ps2sdk-cube-demo-assent-revision-v2\n" + identities
            .sorted { $0.relativePath < $1.relativePath }
            .map { "\($0.relativePath)|\($0.sha256)|\($0.byteCount)" }
            .joined(separator: "\n") + "\n"
        let digest = SHA256.hash(data: Data(manifest.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return "sha256-\(digest)"
    }

    @Published var launchFullscreen: Bool {
        didSet { defaults.set(launchFullscreen, forKey: Keys.launchFullscreen) }
    }

    @Published var scanRecursively: Bool {
        didSet { defaults.set(scanRecursively, forKey: Keys.scanRecursively) }
    }

    @Published var showFileDetails: Bool {
        didSet { defaults.set(showFileDetails, forKey: Keys.showFileDetails) }
    }

    @Published var language: AppLanguage {
        didSet { defaults.set(language.rawValue, forKey: AppLocalizer.languagePreferenceKey) }
    }

    @Published var hasAcceptedSafetyNotice: Bool {
        didSet { defaults.set(hasAcceptedSafetyNotice, forKey: Keys.hasAcceptedSafetyNotice) }
    }

    @Published var hasAcceptedBundledDemoLicense: Bool {
        didSet {
            defaults.set(
                hasAcceptedBundledDemoLicense,
                forKey: Keys.hasAcceptedBundledDemoLicense
            )
        }
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaults.register(defaults: [
            Keys.launchFullscreen: false,
            Keys.scanRecursively: true,
            Keys.showFileDetails: true,
            AppLocalizer.languagePreferenceKey: AppLanguage.system.rawValue,
            Keys.hasAcceptedSafetyNotice: false,
            Keys.hasAcceptedBundledDemoLicense: false
        ])
        launchFullscreen = defaults.bool(forKey: Keys.launchFullscreen)
        scanRecursively = defaults.bool(forKey: Keys.scanRecursively)
        showFileDetails = defaults.bool(forKey: Keys.showFileDetails)
        language = AppLanguage(rawValue: defaults.string(forKey: AppLocalizer.languagePreferenceKey) ?? "") ?? .system
        hasAcceptedSafetyNotice = defaults.bool(forKey: Keys.hasAcceptedSafetyNotice)
        hasAcceptedBundledDemoLicense = defaults.bool(forKey: Keys.hasAcceptedBundledDemoLicense)
    }

    var resolvedLanguage: ResolvedAppLanguage {
        language.resolve()
    }

    var hasAcceptedRequiredNotices: Bool {
        hasAcceptedSafetyNotice && hasAcceptedBundledDemoLicense
    }

    func text(_ english: String, _ japanese: String) -> String {
        AppLocalizer.text(english, japanese, language: resolvedLanguage)
    }

    private enum Keys {
        static let launchFullscreen = "launchFullscreen"
        static let scanRecursively = "scanRecursively"
        static let showFileDetails = "showFileDetails"
        static let hasAcceptedSafetyNotice = "hasAcceptedSafetyNotice.v1"
        static let hasAcceptedBundledDemoLicense =
            AppPreferences.bundledDemoLicenseAcceptanceKey
    }
}
