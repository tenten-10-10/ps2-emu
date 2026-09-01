import Foundation

enum ResolvedAppLanguage: Equatable, Sendable {
    case english
    case japanese

    var locale: Locale {
        switch self {
        case .english: Locale(identifier: "en")
        case .japanese: Locale(identifier: "ja")
        }
    }
}

enum AppLanguage: String, CaseIterable, Identifiable, Sendable {
    case system
    case english
    case japanese

    var id: String { rawValue }

    func resolve(preferredLanguages: [String] = Locale.preferredLanguages) -> ResolvedAppLanguage {
        switch self {
        case .english:
            .english
        case .japanese:
            .japanese
        case .system:
            Self.systemLanguage(preferredLanguages: preferredLanguages)
        }
    }

    func displayName(in language: ResolvedAppLanguage) -> String {
        switch self {
        case .system:
            AppLocalizer.text("System", "システム", language: language)
        case .english:
            "English"
        case .japanese:
            "日本語"
        }
    }

    private static func systemLanguage(preferredLanguages: [String]) -> ResolvedAppLanguage {
        guard let identifier = preferredLanguages.first?.lowercased() else { return .english }
        return identifier == "ja" || identifier.hasPrefix("ja-") || identifier.hasPrefix("ja_")
            ? .japanese
            : .english
    }
}

enum AppLocalizer {
    static let languagePreferenceKey = "appLanguage"

    static func currentLanguage(
        defaults: UserDefaults = .standard,
        preferredLanguages: [String] = Locale.preferredLanguages
    ) -> ResolvedAppLanguage {
        let selection = defaults.string(forKey: languagePreferenceKey)
            .flatMap(AppLanguage.init(rawValue:)) ?? .system
        return selection.resolve(preferredLanguages: preferredLanguages)
    }

    static func text(
        _ english: String,
        _ japanese: String,
        language: ResolvedAppLanguage? = nil
    ) -> String {
        switch language ?? currentLanguage() {
        case .english: english
        case .japanese: japanese
        }
    }

    static func gameCount(_ count: Int, language: ResolvedAppLanguage? = nil) -> String {
        switch language ?? currentLanguage() {
        case .english: "\(count) \(count == 1 ? "game" : "games")"
        case .japanese: "\(count)本"
        }
    }

    static func folderCount(_ count: Int, language: ResolvedAppLanguage? = nil) -> String {
        switch language ?? currentLanguage() {
        case .english: "\(count) \(count == 1 ? "folder" : "folders")"
        case .japanese: "\(count)個"
        }
    }

    static func playTime(seconds: TimeInterval, language: ResolvedAppLanguage? = nil) -> String {
        let minutes = Int(seconds / 60)
        switch language ?? currentLanguage() {
        case .english:
            if minutes < 1 { return "Not played" }
            if minutes < 60 { return "\(minutes) min" }
            return String(format: "%d hr %02d min", minutes / 60, minutes % 60)
        case .japanese:
            if minutes < 1 { return "未プレイ" }
            if minutes < 60 { return "\(minutes)分" }
            return String(format: "%d時間 %02d分", minutes / 60, minutes % 60)
        }
    }
}
