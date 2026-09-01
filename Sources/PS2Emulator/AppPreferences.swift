import Foundation

@MainActor
final class AppPreferences: ObservableObject {
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
            "bundledDemoLicenseAcceptance.afl-2.0.elf-1293781d9f661763.license-1ecee940922a6886"
    }
}
