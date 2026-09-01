import Foundation

enum AppIdentity {
    static let displayName = "PS2 Emu"

    // These directory names intentionally retain the original product name.
    // Changing them during the rename would hide existing libraries and logs.
    static let stableApplicationSupportDirectoryName = "PS2 Emulator"
    static let stableLogDirectoryRelativePath = "Logs/PS2 Emulator"

    static func libraryURL(applicationSupportDirectory: URL) -> URL {
        applicationSupportDirectory
            .appendingPathComponent(stableApplicationSupportDirectoryName, isDirectory: true)
            .appendingPathComponent("library.json")
    }

    static func logDirectoryURL(libraryDirectory: URL) -> URL {
        libraryDirectory.appendingPathComponent(stableLogDirectoryRelativePath, isDirectory: true)
    }
}
