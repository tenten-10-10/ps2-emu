import Foundation

struct GameScanResult: Sendable {
    var games: [Game]
    var errors: [String]
}

enum GameScanner {
    static func scan(urls: [URL], recursive: Bool = true) -> [Game] {
        scanWithDiagnostics(urls: urls, recursive: recursive).games
    }

    static func scanWithDiagnostics(urls: [URL], recursive: Bool = true) -> GameScanResult {
        var discovered: [String: Game] = [:]
        var errors: [String] = []

        for inputURL in urls {
            if cancellationRequested() { break }
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: inputURL.path, isDirectory: &isDirectory) else {
                errors.append(AppLocalizer.text("Not found: \(inputURL.path)", "見つかりません: \(inputURL.path)"))
                continue
            }

            if isDirectory.boolValue {
                let directoryResult = scanDirectory(inputURL, recursive: recursive)
                errors.append(contentsOf: directoryResult.errors)
                for game in directoryResult.games {
                    discovered[game.path] = game
                }
            } else if let kind = GameKind.detect(url: inputURL) {
                let game = Game(url: inputURL, kind: kind)
                discovered[game.path] = game
            }
        }

        return GameScanResult(
            games: discovered.values.sorted {
                $0.title.localizedStandardCompare($1.title) == .orderedAscending
            },
            errors: errors
        )
    }

    private static func scanDirectory(_ directory: URL, recursive: Bool) -> GameScanResult {
        let keys: [URLResourceKey] = [.isRegularFileKey, .isDirectoryKey, .isHiddenKey]
        let options: FileManager.DirectoryEnumerationOptions = recursive
            ? [.skipsHiddenFiles, .skipsPackageDescendants]
            : [.skipsHiddenFiles, .skipsPackageDescendants, .skipsSubdirectoryDescendants]

        var errors: [String] = []
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: keys,
            options: options,
            errorHandler: { url, error in
                errors.append("\(url.path): \(error.localizedDescription)")
                return !cancellationRequested()
            }
        ) else {
            return GameScanResult(
                games: [],
                errors: [AppLocalizer.text(
                    "Could not open folder: \(directory.path)",
                    "フォルダを開けません: \(directory.path)"
                )]
            )
        }

        var games: [Game] = []
        for case let url as URL in enumerator {
            if cancellationRequested() { break }
            guard let kind = GameKind.detect(url: url) else { continue }
            let values = try? url.resourceValues(forKeys: Set(keys))
            guard values?.isRegularFile == true else { continue }
            games.append(Game(url: url, kind: kind))
        }
        return GameScanResult(games: games, errors: errors)
    }

    private static func cancellationRequested() -> Bool {
        withUnsafeCurrentTask { task in
            task?.isCancelled == true
        }
    }
}
