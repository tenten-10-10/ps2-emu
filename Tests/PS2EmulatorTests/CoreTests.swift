import Foundation
import AppKit
import SwiftUI
import XCTest
@testable import PS2Emulator

final class CoreTests: XCTestCase {
    func testProductRenamePreservesBundleIdentityAndExistingUserDataPaths() throws {
        XCTAssertEqual(AppIdentity.displayName, "PS2 Emu")

        let applicationSupport = URL(fileURLWithPath: "/example/Library/Application Support", isDirectory: true)
        XCTAssertEqual(
            AppIdentity.libraryURL(applicationSupportDirectory: applicationSupport).path,
            "/example/Library/Application Support/PS2 Emulator/library.json"
        )

        let library = URL(fileURLWithPath: "/example/Library", isDirectory: true)
        XCTAssertEqual(
            AppIdentity.logDirectoryURL(libraryDirectory: library).path,
            "/example/Library/Logs/PS2 Emulator"
        )

        let projectRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let plistData = try Data(contentsOf: projectRoot.appendingPathComponent("Resources/Info.plist"))
        let plist = try XCTUnwrap(
            PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any]
        )
        XCTAssertEqual(plist["CFBundleDisplayName"] as? String, "PS2 Emu")
        XCTAssertEqual(plist["CFBundleName"] as? String, "PS2 Emu")
        XCTAssertEqual(plist["CFBundleIdentifier"] as? String, "jp.planter.ps2emulator")
        XCTAssertEqual(plist["CFBundleExecutable"] as? String, "PS2Emulator")
    }

    func testSupportedFormats() {
        XCTAssertEqual(GameKind.detect(url: URL(fileURLWithPath: "/Games/Test.ISO")), .discImage)
        XCTAssertEqual(GameKind.detect(url: URL(fileURLWithPath: "/Games/Test.chd")), .discImage)
        XCTAssertEqual(GameKind.detect(url: URL(fileURLWithPath: "/Games/Homebrew.ELF")), .homebrewELF)
        XCTAssertNil(GameKind.detect(url: URL(fileURLWithPath: "/Games/notes.txt")))
    }

    func testCommandBuilderUsesArgumentArrayWithoutShellQuoting() {
        let url = URL(fileURLWithPath: "/Games/My Game; echo unsafe.iso")
        let game = Game(url: url, kind: .discImage)

        XCTAssertEqual(
            EmulatorCommand.arguments(for: game, fullscreen: true),
            ["--fullscreen", "--disc", "/Games/My Game; echo unsafe.iso"]
        )
    }

    func testELFCommand() {
        let game = Game(url: URL(fileURLWithPath: "/Games/demo.elf"), kind: .homebrewELF)
        XCTAssertEqual(EmulatorCommand.arguments(for: game, fullscreen: false), ["--elf", "/Games/demo.elf"])
    }

    func testScannerFindsSupportedFilesAndSkipsHiddenAndUnsupported() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let nested = root.appendingPathComponent("Nested")
        try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        try Data("iso".utf8).write(to: root.appendingPathComponent("Alpha.iso"))
        try Data("chd".utf8).write(to: nested.appendingPathComponent("Beta.chd"))
        try Data("elf".utf8).write(to: nested.appendingPathComponent("Demo.elf"))
        try Data("text".utf8).write(to: root.appendingPathComponent("Readme.txt"))
        try Data("hidden".utf8).write(to: root.appendingPathComponent(".Hidden.iso"))

        XCTAssertEqual(GameScanner.scan(urls: [root], recursive: true).map(\.title), ["Alpha", "Beta", "Demo"])
        XCTAssertEqual(GameScanner.scan(urls: [root], recursive: false).map(\.title), ["Alpha"])
    }

    @MainActor
    func testLibraryPersistsAndDeduplicates() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let storage = root.appendingPathComponent("library.json")
        let gameURL = root.appendingPathComponent("A Game.iso")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("iso".utf8).write(to: gameURL)
        defer { try? FileManager.default.removeItem(at: root) }

        let first = GameLibrary(storageURL: storage)
        first.add(urls: [gameURL, gameURL])
        XCTAssertEqual(first.games.count, 1)
        first.toggleFavorite(first.games[0].id)

        let second = GameLibrary(storageURL: storage)
        XCTAssertEqual(second.games.count, 1)
        XCTAssertTrue(second.games[0].isFavorite)
        XCTAssertEqual(second.games[0].title, "A Game")
    }

    @MainActor
    func testCorruptLibraryIsPreservedBeforeRecoverySave() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let storage = root.appendingPathComponent("library.json")
        let gameURL = root.appendingPathComponent("Recovered.iso")
        let corruptData = Data("{ definitely-not-json".utf8)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try corruptData.write(to: storage)
        try Data("iso".utf8).write(to: gameURL)
        defer { try? FileManager.default.removeItem(at: root) }

        let library = GameLibrary(storageURL: storage)
        XCTAssertNotNil(library.lastError)

        let backups = try FileManager.default.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: nil
        ).filter { $0.lastPathComponent.hasPrefix("library.corrupt-") }
        XCTAssertEqual(backups.count, 1)
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(backups.first)), corruptData)

        library.add(urls: [gameURL])
        XCTAssertEqual(library.games.map(\.title), ["Recovered"])
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(backups.first)), corruptData)

        let recovered = GameLibrary(storageURL: storage)
        XCTAssertEqual(recovered.games.map(\.title), ["Recovered"])
    }

    @MainActor
    func testFolderScanCompletesAndReportsMissingPaths() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let storage = root.appendingPathComponent("library.json")
        let games = root.appendingPathComponent("Games")
        try FileManager.default.createDirectory(at: games, withIntermediateDirectories: true)
        try Data("iso".utf8).write(to: games.appendingPathComponent("Async Scan.iso"))
        defer { try? FileManager.default.removeItem(at: root) }

        let library = GameLibrary(storageURL: storage)
        library.addFolders([games], recursive: true)
        for _ in 0..<100 {
            if !library.isScanning { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertFalse(library.isScanning)
        XCTAssertEqual(library.games.map(\.title), ["Async Scan"])

        let missing = root.appendingPathComponent("Missing")
        library.addFolders([missing], recursive: true)
        for _ in 0..<100 {
            if !library.isScanning { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertFalse(library.isScanning)
        XCTAssertTrue(library.lastError?.contains(AppLocalizer.text("Not found", "見つかりません")) == true)
    }

    @MainActor
    func testConsecutiveFolderScansCoalesceAllWatchedFolders() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let storage = root.appendingPathComponent("library.json")
        let firstFolder = root.appendingPathComponent("First")
        let secondFolder = root.appendingPathComponent("Second")
        try FileManager.default.createDirectory(at: firstFolder, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: secondFolder, withIntermediateDirectories: true)
        for index in 0..<300 {
            try Data("iso".utf8).write(
                to: firstFolder.appendingPathComponent(String(format: "First %03d.iso", index))
            )
        }
        try Data("iso".utf8).write(to: secondFolder.appendingPathComponent("Second Game.iso"))
        defer { try? FileManager.default.removeItem(at: root) }

        let library = GameLibrary(storageURL: storage)
        library.addFolders([firstFolder], recursive: true)
        library.addFolders([secondFolder], recursive: true)

        for _ in 0..<200 {
            if !library.isScanning { break }
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertFalse(library.isScanning)
        XCTAssertEqual(library.watchedFolders.count, 2)
        XCTAssertEqual(library.games.count, 301)
        XCTAssertTrue(library.games.contains { $0.title == "First 000" })
        XCTAssertTrue(library.games.contains { $0.title == "Second Game" })
    }

    @MainActor
    func testLibraryCardsRenderOffscreen() throws {
#if arch(x86_64)
        let environment = ProcessInfo.processInfo.environment
        try XCTSkipIf(
            environment["GITHUB_ACTIONS"] == "true"
                && environment["RUNNER_ENVIRONMENT"] == "github-hosted",
            "The GitHub-hosted Intel runner aborts in Metal while rendering this offscreen SwiftUI view."
        )
#endif
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let storage = root.appendingPathComponent("library.json")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let sampleNames = [
            "Granite Circuit.iso",
            "Midnight Vector.chd",
            "Homebrew Gallery.elf",
            "Blue Horizon.cso"
        ]
        for name in sampleNames {
            try Data(repeating: 0, count: 1024).write(to: root.appendingPathComponent(name))
        }

        let library = GameLibrary(storageURL: storage)
        library.add(urls: sampleNames.map { root.appendingPathComponent($0) })
        library.selectedGameID = library.games.first?.id
        let view = ZStack {
            LinearGradient(
                colors: [Color(red: 0.03, green: 0.04, blue: 0.09), Color(red: 0.08, green: 0.10, blue: 0.19)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("すべてのゲーム")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                        Text("\(library.games.count)本 • BIOS不要")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.55))
                    }
                    Spacer()
                    EngineStatusPill(isRunning: false, text: "Play! 0.77 • コア待機中")
                        .foregroundStyle(.white)
                }

                HStack(alignment: .top, spacing: 18) {
                    ForEach(library.games) { game in
                        GameCard(
                            game: game,
                            isSelected: game.id == library.games.first?.id,
                            showDetails: true
                        )
                    }
                }
                Spacer()
                Text("ISO • MDS • ISZ • CSO • CUE • CHD • ELF")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.white.opacity(0.45))
            }
            .padding(34)
        }
        .frame(width: 940, height: 620)
        .environment(\.colorScheme, .dark)

        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.cgImage)
        XCTAssertEqual(image.width, 940)
        XCTAssertEqual(image.height, 620)

        if let snapshotPath = ProcessInfo.processInfo.environment["PS2_SNAPSHOT_PATH"] {
            let representation = NSBitmapImageRep(cgImage: image)
            let data = try XCTUnwrap(representation.representation(using: .png, properties: [:]))
            try data.write(to: URL(fileURLWithPath: snapshotPath), options: .atomic)
        }
    }

    func testLanguageResolutionUsesEnglishFallbackAndJapaneseLocale() {
        XCTAssertEqual(AppLanguage.system.resolve(preferredLanguages: []), .english)
        XCTAssertEqual(AppLanguage.system.resolve(preferredLanguages: ["fr-FR"]), .english)
        XCTAssertEqual(AppLanguage.system.resolve(preferredLanguages: ["ja-JP"]), .japanese)
        XCTAssertEqual(AppLanguage.english.resolve(preferredLanguages: ["ja-JP"]), .english)
        XCTAssertEqual(AppLanguage.japanese.resolve(preferredLanguages: ["en-US"]), .japanese)
    }

    @MainActor
    func testSafetyConsentAndLanguageSelectionPersist() throws {
        let suiteName = "PS2EmulatorTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let initial = AppPreferences(defaults: defaults)
        XCTAssertFalse(initial.hasAcceptedSafetyNotice)
        XCTAssertEqual(initial.language, .system)

        initial.hasAcceptedSafetyNotice = true
        initial.language = .japanese

        let restored = AppPreferences(defaults: defaults)
        XCTAssertTrue(restored.hasAcceptedSafetyNotice)
        XCTAssertEqual(restored.language, .japanese)
    }

    func testModifiedCoreOverrideRequiresBothExactEnvironmentValues() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let absoluteCore = base.appendingPathComponent("Play.app").path

        XCTAssertThrowsError(try CoreRuntimeConfiguration.resolve(
            environment: [CoreRuntimeConfiguration.coreAppEnvironmentKey: absoluteCore]
        )) { error in
            XCTAssertEqual(error as? CoreConfigurationError, .overrideRequiresModifiedCoreOptIn)
        }

        XCTAssertThrowsError(try CoreRuntimeConfiguration.resolve(
            environment: [CoreRuntimeConfiguration.allowModifiedCoreEnvironmentKey: "1"]
        )) { error in
            XCTAssertEqual(error as? CoreConfigurationError, .modifiedCoreOptInRequiresOverride)
        }

        XCTAssertThrowsError(try CoreRuntimeConfiguration.resolve(environment: [
            CoreRuntimeConfiguration.coreAppEnvironmentKey: "relative/Play.app",
            CoreRuntimeConfiguration.allowModifiedCoreEnvironmentKey: "1"
        ])) { error in
            XCTAssertEqual(error as? CoreConfigurationError, .overrideMustBeAbsolute("relative/Play.app"))
        }

        let selection = try CoreRuntimeConfiguration.resolve(environment: [
            CoreRuntimeConfiguration.coreAppEnvironmentKey: absoluteCore,
            CoreRuntimeConfiguration.allowModifiedCoreEnvironmentKey: "1"
        ])
        XCTAssertEqual(selection.appURL.path, absoluteCore)
        XCTAssertEqual(selection.validationMode, .userModified)
        XCTAssertEqual(selection.source, .userModified)
    }

    func testCoreDiscoveryPrefersBundledThenSystemThenUserApplications() throws {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let bundle = root.appendingPathComponent("PS2 Emu.app")
        let current = root.appendingPathComponent("Current")
        let home = root.appendingPathComponent("Home")
        let systemApplications = root.appendingPathComponent("SystemApplications")
        let bundled = bundle.appendingPathComponent("Contents/Helpers/Play.app")
        let system = systemApplications.appendingPathComponent("Play.app")
        let user = home.appendingPathComponent("Applications/Play.app")
        try fileManager.createDirectory(at: bundled, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: system, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: user, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: root) }

        func resolve() throws -> CoreSelection {
            try CoreRuntimeConfiguration.resolve(
                environment: [:],
                bundleURL: bundle,
                currentDirectoryURL: current,
                homeDirectoryURL: home,
                systemApplicationsURL: systemApplications,
                fileManager: fileManager
            )
        }

        var selection = try resolve()
        XCTAssertEqual(selection.appURL.path, bundled.path)
        XCTAssertEqual(selection.validationMode, .strictBundled)
        XCTAssertEqual(selection.source, .bundled)

        try fileManager.removeItem(at: bundled)
        selection = try resolve()
        XCTAssertEqual(selection.appURL.path, system.path)
        XCTAssertEqual(selection.validationMode, .strictBundled)
        XCTAssertEqual(selection.source, .externalOfficial)

        try fileManager.removeItem(at: system)
        selection = try resolve()
        XCTAssertEqual(selection.appURL.path, user.path)
        XCTAssertEqual(selection.validationMode, .strictBundled)
        XCTAssertEqual(selection.source, .externalOfficial)

        try fileManager.removeItem(at: user)
        selection = try resolve()
        XCTAssertEqual(selection.appURL.path, bundled.path)
        XCTAssertEqual(selection.validationMode, .strictBundled)
        XCTAssertEqual(selection.source, .notFound)
        XCTAssertThrowsError(try CoreValidator.validate(
            appURL: selection.appURL,
            mode: selection.validationMode
        ))

        let localVendor = current.appendingPathComponent("Vendor/Play.app")
        try fileManager.createDirectory(at: localVendor, withIntermediateDirectories: true)
        let localSelection = try CoreRuntimeConfiguration.resolve(
            environment: [:],
            bundleURL: root.appendingPathComponent("swiftpm-binary"),
            currentDirectoryURL: current,
            homeDirectoryURL: home,
            systemApplicationsURL: systemApplications,
            fileManager: fileManager
        )
        XCTAssertEqual(localSelection.appURL.path, localVendor.path)
        XCTAssertEqual(localSelection.source, .bundled)
    }

    func testPinnedCoreCDHashMatchesExecutionArchitecture() {
        XCTAssertEqual(
            CoreValidator.officialDownloadURL.absoluteString,
            "https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg"
        )
        XCTAssertEqual(CoreValidator.expectedVersion, "0.77-7-g04bde0df")
        XCTAssertNotEqual(CoreValidator.expectedVersion, "0.70")
        XCTAssertEqual(
            CoreValidator.expectedCDHashesByArchitecture,
            [
                "arm64": "3c5b7d6d748717f218ef7be0e6b83109728463bd",
                "x86_64": "ff080b2d4cd99ed6faf0eb5d2ace7f41d28980da"
            ]
        )
        XCTAssertEqual(Set(CoreValidator.expectedCDHashesByArchitecture.values).count, 2)

        #if arch(arm64)
        XCTAssertEqual(CoreValidator.currentArchitecture, "arm64")
        XCTAssertEqual(
            CoreValidator.expectedCDHash,
            "3c5b7d6d748717f218ef7be0e6b83109728463bd"
        )
        #elseif arch(x86_64)
        XCTAssertEqual(CoreValidator.currentArchitecture, "x86_64")
        XCTAssertEqual(
            CoreValidator.expectedCDHash,
            "ff080b2d4cd99ed6faf0eb5d2ace7f41d28980da"
        )
        #else
        XCTFail("Unsupported test architecture: \(CoreValidator.currentArchitecture)")
        #endif
    }

    func testUserModifiedValidationAllowsRelinkingButStillChecksIdentityAndArchitecture() throws {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let app = root.appendingPathComponent("Play.app")
        let macOS = app.appendingPathComponent("Contents/MacOS")
        let infoURL = app.appendingPathComponent("Contents/Info.plist")
        try fileManager.createDirectory(at: macOS, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: root) }

        let runningExecutable = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
        try fileManager.createSymbolicLink(
            at: macOS.appendingPathComponent("Play"),
            withDestinationURL: runningExecutable
        )
        let plistData = try PropertyListSerialization.data(
            fromPropertyList: ["CFBundleIdentifier": CoreValidator.expectedBundleID],
            format: .xml,
            options: 0
        )
        try plistData.write(to: infoURL)

        XCTAssertNoThrow(try CoreValidator.validate(appURL: app, mode: .userModified))
        XCTAssertThrowsError(try CoreValidator.validate(appURL: app, mode: .strictBundled))

        let wrongIdentity = try PropertyListSerialization.data(
            fromPropertyList: ["CFBundleIdentifier": "invalid.example"],
            format: .xml,
            options: 0
        )
        try wrongIdentity.write(to: infoURL)
        XCTAssertThrowsError(try CoreValidator.validate(appURL: app, mode: .userModified))
    }

    func testLauncherLogsArePrivateCappedAndRotated() throws {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fileManager.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: root) }

        for index in 0..<25 {
            let url = root.appendingPathComponent("\(index).log")
            try Data("old".utf8).write(to: url)
            try fileManager.setAttributes(
                [.modificationDate: Date(timeIntervalSince1970: TimeInterval(index))],
                ofItemAtPath: url.path
            )
        }
        let unrelated = root.appendingPathComponent("keep.txt")
        try Data("keep".utf8).write(to: unrelated)
        let symlink = root.appendingPathComponent("linked.log")
        try fileManager.createSymbolicLink(at: symlink, withDestinationURL: unrelated)

        LauncherLogStore.pruneBeforeCreatingLog(in: root, fileManager: fileManager)
        let remainingLogs = try fileManager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "log" && $0.lastPathComponent != "linked.log" }
        XCTAssertEqual(remainingLogs.count, LauncherLogStore.maximumLogCount - 1)
        XCTAssertTrue(fileManager.fileExists(atPath: unrelated.path))
        XCTAssertTrue(fileManager.fileExists(atPath: symlink.path))

        let cappedURL = root.appendingPathComponent("capped.log")
        let writer = try CappedLogWriter(url: cappedURL, maximumBytes: 128)
        writer.append(Data(repeating: 65, count: 1_024))
        writer.append(Data(repeating: 66, count: 1_024))
        writer.close()

        let capped = try Data(contentsOf: cappedURL)
        XCTAssertLessThanOrEqual(capped.count, 128)
        XCTAssertTrue(String(decoding: capped, as: UTF8.self).contains("log truncated"))
        let permissions = try fileManager.attributesOfItem(atPath: cappedURL.path)[.posixPermissions] as? NSNumber
        XCTAssertEqual((permissions?.intValue ?? 0) & 0o777, 0o600)
    }
}
