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

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaults.register(defaults: [
            Keys.launchFullscreen: false,
            Keys.scanRecursively: true,
            Keys.showFileDetails: true,
            AppLocalizer.languagePreferenceKey: AppLanguage.system.rawValue,
            Keys.hasAcceptedSafetyNotice: false
        ])
        launchFullscreen = defaults.bool(forKey: Keys.launchFullscreen)
        scanRecursively = defaults.bool(forKey: Keys.scanRecursively)
        showFileDetails = defaults.bool(forKey: Keys.showFileDetails)
        language = AppLanguage(rawValue: defaults.string(forKey: AppLocalizer.languagePreferenceKey) ?? "") ?? .system
        hasAcceptedSafetyNotice = defaults.bool(forKey: Keys.hasAcceptedSafetyNotice)
    }

    var resolvedLanguage: ResolvedAppLanguage {
        language.resolve()
    }

    func text(_ english: String, _ japanese: String) -> String {
        AppLocalizer.text(english, japanese, language: resolvedLanguage)
    }

    private enum Keys {
        static let launchFullscreen = "launchFullscreen"
        static let scanRecursively = "scanRecursively"
        static let showFileDetails = "showFileDetails"
        static let hasAcceptedSafetyNotice = "hasAcceptedSafetyNotice.v1"
    }
}
