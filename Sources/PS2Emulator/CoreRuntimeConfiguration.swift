import Foundation

struct CoreSelection: Equatable, Sendable {
    let appURL: URL
    let validationMode: CoreValidationMode
    let source: CoreSource
}

enum CoreSource: Equatable, Sendable {
    case bundled
    case externalOfficial
    case userModified
    case notFound
}

enum CoreConfigurationError: LocalizedError, Equatable {
    case overrideRequiresModifiedCoreOptIn
    case modifiedCoreOptInRequiresOverride
    case overrideMustBeAbsolute(String)

    var errorDescription: String? {
        switch self {
        case .overrideRequiresModifiedCoreOptIn:
            AppLocalizer.text(
                "PS2_EMULATOR_CORE_APP requires PS2_EMULATOR_ALLOW_MODIFIED_CORE=1. The external core was not loaded.",
                "PS2_EMULATOR_CORE_APPを使うにはPS2_EMULATOR_ALLOW_MODIFIED_CORE=1が必要です。外部コアは読み込まれませんでした。"
            )
        case .modifiedCoreOptInRequiresOverride:
            AppLocalizer.text(
                "PS2_EMULATOR_ALLOW_MODIFIED_CORE=1 requires an absolute Play.app path in PS2_EMULATOR_CORE_APP.",
                "PS2_EMULATOR_ALLOW_MODIFIED_CORE=1を使うには、PS2_EMULATOR_CORE_APPにPlay.appの絶対パスが必要です。"
            )
        case .overrideMustBeAbsolute(let path):
            AppLocalizer.text(
                "PS2_EMULATOR_CORE_APP must be an absolute path to Play.app: \(path)",
                "PS2_EMULATOR_CORE_APPにはPlay.appの絶対パスを指定してください: \(path)"
            )
        }
    }
}

enum CoreRuntimeConfiguration {
    static let coreAppEnvironmentKey = "PS2_EMULATOR_CORE_APP"
    static let allowModifiedCoreEnvironmentKey = "PS2_EMULATOR_ALLOW_MODIFIED_CORE"

    static func resolve(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        bundleURL: URL = Bundle.main.bundleURL,
        currentDirectoryURL: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath),
        homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser,
        systemApplicationsURL: URL = URL(fileURLWithPath: "/Applications"),
        fileManager: FileManager = .default
    ) throws -> CoreSelection {
        let rawOverride = environment[coreAppEnvironmentKey]
        let override = rawOverride?.trimmingCharacters(in: .whitespacesAndNewlines)
        let optIn = environment[allowModifiedCoreEnvironmentKey]

        switch (rawOverride, optIn) {
        case (nil, nil):
            let discovered = discoveredStrictCoreAppURL(
                bundleURL: bundleURL,
                currentDirectoryURL: currentDirectoryURL,
                homeDirectoryURL: homeDirectoryURL,
                systemApplicationsURL: systemApplicationsURL,
                fileManager: fileManager
            )
            return CoreSelection(
                appURL: discovered.url,
                validationMode: .strictBundled,
                source: discovered.source
            )
        case (nil, _):
            throw CoreConfigurationError.modifiedCoreOptInRequiresOverride
        case (.some, .some("1")):
            break
        case (.some, _):
            throw CoreConfigurationError.overrideRequiresModifiedCoreOptIn
        }

        guard let override else {
            throw CoreConfigurationError.modifiedCoreOptInRequiresOverride
        }
        guard NSString(string: override).isAbsolutePath else {
            throw CoreConfigurationError.overrideMustBeAbsolute(override)
        }

        return CoreSelection(
            appURL: URL(fileURLWithPath: override).standardizedFileURL,
            validationMode: .userModified,
            source: .userModified
        )
    }

    static func defaultCoreAppURL(bundleURL: URL, currentDirectoryURL: URL) -> URL {
        if bundleURL.pathExtension == "app" {
            return bundleURL.appendingPathComponent("Contents/Helpers/Play.app")
        }
        return currentDirectoryURL.appendingPathComponent("Vendor/Play.app")
    }

    private static func discoveredStrictCoreAppURL(
        bundleURL: URL,
        currentDirectoryURL: URL,
        homeDirectoryURL: URL,
        systemApplicationsURL: URL,
        fileManager: FileManager
    ) -> (url: URL, source: CoreSource) {
        let bundled = defaultCoreAppURL(bundleURL: bundleURL, currentDirectoryURL: currentDirectoryURL)
        let candidates: [(URL, CoreSource)] = [
            (bundled, .bundled),
            (systemApplicationsURL.appendingPathComponent("Play.app"), .externalOfficial),
            (homeDirectoryURL.appendingPathComponent("Applications/Play.app"), .externalOfficial)
        ]

        return candidates.first { fileManager.fileExists(atPath: $0.0.path) }
            .map { (url: $0.0, source: $0.1) }
            ?? (url: bundled, source: .notFound)
    }
}
