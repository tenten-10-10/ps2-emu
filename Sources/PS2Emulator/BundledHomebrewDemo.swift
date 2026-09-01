import CryptoKit
import Foundation

enum BundledHomebrewDemoError: LocalizedError, Equatable {
    case missing(URL)
    case notRegularFile(URL)
    case unexpectedSize(expected: Int, actual: Int)
    case hashMismatch(expected: String, actual: String)
    case metadataMismatch

    var errorDescription: String? {
        switch self {
        case .missing(let url):
            AppLocalizer.text(
                "The included PS2SDK Cube Demo is missing: \(url.path)",
                "同梱のPS2SDK Cube Demoが見つかりません: \(url.path)"
            )
        case .notRegularFile(let url):
            AppLocalizer.text(
                "The included PS2SDK Cube Demo is not a regular bundled file: \(url.path)",
                "同梱のPS2SDK Cube Demoが通常の同梱ファイルではありません: \(url.path)"
            )
        case .unexpectedSize(let expected, let actual):
            AppLocalizer.text(
                "The included PS2SDK Cube Demo failed integrity verification (expected \(expected) bytes, found \(actual)). Reinstall PS2 Emu before launching it.",
                "同梱のPS2SDK Cube Demoの完全性検証に失敗しました（期待サイズ \(expected) bytes、実際 \(actual) bytes）。起動せずPS2 Emuを再インストールしてください。"
            )
        case .hashMismatch(let expected, let actual):
            AppLocalizer.text(
                "The included PS2SDK Cube Demo failed SHA-256 verification (expected \(expected), found \(actual)). Reinstall PS2 Emu before launching it.",
                "同梱のPS2SDK Cube DemoのSHA-256検証に失敗しました（期待値 \(expected)、実際 \(actual)）。起動せずPS2 Emuを再インストールしてください。"
            )
        case .metadataMismatch:
            AppLocalizer.text(
                "The included PS2SDK Cube Demo library record was modified and cannot be launched safely.",
                "同梱のPS2SDK Cube Demoのライブラリ情報が変更されているため、安全に起動できません。"
            )
        }
    }
}

enum BundledHomebrewDemo {
    static let id = UUID(uuidString: "5940D0E6-3F5E-5D32-9C63-E5BE6E1D9F25")!
    static let title = "PS2SDK Cube Demo"
    static let expectedSHA256 = "1293781d9f661763e5e598b8c7037830462b05b53e532c298f8515b0df533584"
    static let expectedByteCount = 174_772
    static let resourceDirectoryName = "Fixtures"
    static let resourceFileName = "ps2sdk-cube.elf"

    static func bundleURL(bundle: Bundle = .main) -> URL? {
        guard
            bundle.bundleIdentifier == "jp.planter.ps2emulator",
            let resourceURL = bundle.resourceURL
        else { return nil }
        return resourceURL
            .appendingPathComponent(resourceDirectoryName, isDirectory: true)
            .appendingPathComponent(resourceFileName, isDirectory: false)
    }

    static func game(url: URL, preserving existing: Game? = nil) -> Game {
        Game(
            id: id,
            title: title,
            url: url,
            kind: .homebrewELF,
            addedAt: existing?.addedAt ?? Date(),
            lastPlayedAt: existing?.lastPlayedAt,
            totalPlaySeconds: existing?.totalPlaySeconds ?? 0,
            isFavorite: existing?.isFavorite ?? false
        )
    }

    static func validateBeforeLaunch(
        _ game: Game,
        bundledURL: URL? = bundleURL()
    ) throws {
        let currentBundledPath = bundledURL?.standardizedFileURL.path
        let isCurrentBundledPath = currentBundledPath == game.path
        guard game.id == id || isCurrentBundledPath else { return }
        guard game.kind == .homebrewELF else {
            throw BundledHomebrewDemoError.metadataMismatch
        }
        if game.id == id {
            guard
                game.title == title,
                currentBundledPath == nil || isCurrentBundledPath
            else {
                throw BundledHomebrewDemoError.metadataMismatch
            }
        }
        try validateFile(at: game.fileURL)
    }

    static func validateFile(at url: URL) throws {
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: url.path) else {
            throw BundledHomebrewDemoError.missing(url)
        }

        let values = try? url.resourceValues(forKeys: [
            .isRegularFileKey,
            .isSymbolicLinkKey,
            .fileSizeKey
        ])
        guard values?.isRegularFile == true, values?.isSymbolicLink != true else {
            throw BundledHomebrewDemoError.notRegularFile(url)
        }
        let actualSize = values?.fileSize ?? -1
        guard actualSize == expectedByteCount else {
            throw BundledHomebrewDemoError.unexpectedSize(
                expected: expectedByteCount,
                actual: actualSize
            )
        }

        let data = try Data(contentsOf: url, options: [.mappedIfSafe])
        let actualHash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard actualHash == expectedSHA256 else {
            throw BundledHomebrewDemoError.hashMismatch(
                expected: expectedSHA256,
                actual: actualHash
            )
        }
    }
}
