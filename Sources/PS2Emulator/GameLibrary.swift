import AppKit
import Foundation
import UniformTypeIdentifiers

@MainActor
final class GameLibrary: ObservableObject {
    @Published private(set) var games: [Game] = []
    @Published private(set) var watchedFolders: [String] = []
    @Published var selectedGameID: UUID?
    @Published var filter: LibraryFilter = .all
    @Published var sort: GameSort = .title
    @Published var searchText = ""
    @Published private(set) var isScanning = false
    @Published var lastError: String?

    private let storageURL: URL
    private var scanTask: Task<Void, Never>?
    private var scanWorker: Task<GameScanResult, Never>?

    init(storageURL: URL? = nil) {
        self.storageURL = storageURL ?? Self.defaultStorageURL()
        load()
    }

    var selectedGame: Game? {
        guard let selectedGameID else { return nil }
        return games.first { $0.id == selectedGameID }
    }

    var visibleGames: [Game] {
        let filtered = games.filter { game in
            let matchesFilter: Bool = switch filter {
            case .all: true
            case .favorites: game.isFavorite
            case .recent: game.lastPlayedAt != nil
            case .homebrew: game.kind == .homebrewELF
            case .unavailable: !game.isAvailable
            }
            let matchesSearch = searchText.isEmpty
                || game.title.localizedCaseInsensitiveContains(searchText)
                || game.fileURL.lastPathComponent.localizedCaseInsensitiveContains(searchText)
            return matchesFilter && matchesSearch
        }

        return filtered.sorted { lhs, rhs in
            switch sort {
            case .title:
                lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
            case .recentlyPlayed:
                (lhs.lastPlayedAt ?? .distantPast) > (rhs.lastPlayedAt ?? .distantPast)
            case .recentlyAdded:
                lhs.addedAt > rhs.addedAt
            }
        }
    }

    func showAddGamesPanel() {
        let panel = NSOpenPanel()
        panel.title = AppLocalizer.text("Add PS2 Games", "PS2ゲームを追加")
        panel.message = AppLocalizer.text(
            "Choose legally owned or authorized disc images or homebrew ELF files.",
            "適法に所有または使用許可を得たディスクイメージ、もしくはhomebrew ELFを選択してください。"
        )
        panel.prompt = AppLocalizer.text("Add to Library", "ライブラリに追加")
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = true
        panel.allowedContentTypes = GameKind.supportedExtensions.sorted().compactMap {
            UTType(filenameExtension: $0)
        }
        if panel.runModal() == .OK {
            add(urls: panel.urls)
        }
    }

    func showAddFolderPanel(recursive: Bool) {
        let panel = NSOpenPanel()
        panel.title = AppLocalizer.text("Add Game Folders", "ゲームフォルダを追加")
        panel.message = recursive
            ? AppLocalizer.text(
                "Supported files in subfolders will also be scanned.",
                "サブフォルダも含めて対応ファイルを検索します。"
            )
            : AppLocalizer.text(
                "Only supported files directly inside the selected folders will be scanned.",
                "選択したフォルダ直下を検索します。"
            )
        panel.prompt = AppLocalizer.text("Add Folders", "フォルダを追加")
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = true
        if panel.runModal() == .OK {
            addFolders(panel.urls, recursive: recursive)
        }
    }

    func add(urls: [URL]) {
        var files: [URL] = []
        var directories: [URL] = []
        for url in urls {
            var isDirectory: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue {
                directories.append(url)
            } else {
                files.append(url)
            }
        }
        if !files.isEmpty { merge(GameScanner.scan(urls: files)) }
        if !directories.isEmpty { addFolders(directories, recursive: true) }
    }

    func addFolders(_ urls: [URL], recursive: Bool) {
        let canonicalPaths = urls.map(\.standardizedFileURL.path)
        watchedFolders = Array(Set(watchedFolders + canonicalPaths)).sorted()
        save()
        startBackgroundScan(
            urls: watchedFolders.map { URL(fileURLWithPath: $0) },
            recursive: recursive
        )
    }

    func rescan(recursive: Bool) {
        guard !watchedFolders.isEmpty else { return }
        startBackgroundScan(
            urls: watchedFolders.map { URL(fileURLWithPath: $0) },
            recursive: recursive
        )
    }

    func removeSelected() {
        guard let selectedGameID else { return }
        games.removeAll { $0.id == selectedGameID }
        self.selectedGameID = nil
        save()
    }

    func removeFolder(_ path: String) {
        watchedFolders.removeAll { $0 == path }
        save()
    }

    func toggleFavorite(_ id: UUID) {
        guard let index = games.firstIndex(where: { $0.id == id }) else { return }
        games[index].isFavorite.toggle()
        save()
    }

    func rename(_ id: UUID, to title: String) {
        let cleaned = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty, let index = games.firstIndex(where: { $0.id == id }) else { return }
        games[index].title = cleaned
        save()
    }

    func recordPlayStarted(_ id: UUID) {
        guard let index = games.firstIndex(where: { $0.id == id }) else { return }
        games[index].lastPlayedAt = Date()
        save()
    }

    func recordPlayFinished(_ id: UUID, elapsed: TimeInterval) {
        guard let index = games.firstIndex(where: { $0.id == id }) else { return }
        games[index].totalPlaySeconds += max(0, elapsed)
        save()
    }

    func revealSelectedInFinder() {
        guard let game = selectedGame else { return }
        NSWorkspace.shared.activateFileViewerSelecting([game.fileURL])
    }

    private func merge(_ discovered: [Game]) {
        var existingByPath = Dictionary(uniqueKeysWithValues: games.map { ($0.path, $0) })
        for game in discovered where existingByPath[game.path] == nil {
            existingByPath[game.path] = game
        }
        games = existingByPath.values.sorted {
            $0.title.localizedStandardCompare($1.title) == .orderedAscending
        }
        if selectedGameID == nil { selectedGameID = games.first?.id }
        save()
    }

    private func startBackgroundScan(urls: [URL], recursive: Bool) {
        scanTask?.cancel()
        scanWorker?.cancel()
        isScanning = true
        let paths = urls.map(\.path)
        let worker = Task.detached(priority: .userInitiated) {
            GameScanner.scanWithDiagnostics(
                urls: paths.map { URL(fileURLWithPath: $0) },
                recursive: recursive
            )
        }
        scanWorker = worker
        scanTask = Task { [weak self] in
            let result = await worker.value

            guard !Task.isCancelled, !worker.isCancelled, let self else { return }
            self.scanWorker = nil
            self.scanTask = nil
            self.merge(result.games)
            self.isScanning = false
            if !result.errors.isEmpty {
                let preview = result.errors.prefix(3).joined(separator: "\n")
                self.lastError = AppLocalizer.text(
                    "Some locations could not be scanned.\n\(preview)",
                    "一部の場所をスキャンできませんでした。\n\(preview)"
                )
            }
        }
    }

    private func load() {
        guard FileManager.default.fileExists(atPath: storageURL.path) else { return }
        do {
            let data = try Data(contentsOf: storageURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let document = try decoder.decode(LibraryDocument.self, from: data)
            guard document.schemaVersion == 1 else {
                throw LibraryStoreError.unsupportedSchema(document.schemaVersion)
            }
            games = document.games
            watchedFolders = document.watchedFolders
            selectedGameID = games.first?.id
        } catch {
            let backup = preserveCorruptLibrary()
            let suffix = backup.map {
                AppLocalizer.text("\nOriginal preserved at: \($0.path)", "\n原本を保全しました: \($0.path)")
            } ?? ""
            lastError = AppLocalizer.text(
                "Could not load the library: \(error.localizedDescription)\(suffix)",
                "ライブラリを読み込めませんでした: \(error.localizedDescription)\(suffix)"
            )
        }
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(
                at: storageURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let document = LibraryDocument(games: games, watchedFolders: watchedFolders)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            preserveLastKnownGoodLibrary()
            try encoder.encode(document).write(to: storageURL, options: .atomic)
        } catch {
            lastError = AppLocalizer.text(
                "Could not save the library: \(error.localizedDescription)",
                "ライブラリを保存できませんでした: \(error.localizedDescription)"
            )
        }
    }

    private static func defaultStorageURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return AppIdentity.libraryURL(applicationSupportDirectory: base)
    }

    private func preserveCorruptLibrary() -> URL? {
        guard FileManager.default.fileExists(atPath: storageURL.path) else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let nonce = UUID().uuidString.prefix(8).lowercased()
        let backup = storageURL.deletingLastPathComponent()
            .appendingPathComponent("library.corrupt-\(formatter.string(from: Date()))-\(nonce).json")
        do {
            try FileManager.default.copyItem(at: storageURL, to: backup)
            return backup
        } catch {
            return nil
        }
    }

    private func preserveLastKnownGoodLibrary() {
        guard let currentData = try? Data(contentsOf: storageURL) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard
            let current = try? decoder.decode(LibraryDocument.self, from: currentData),
            current.schemaVersion == 1
        else { return }
        let backup = storageURL.deletingLastPathComponent().appendingPathComponent("library.previous.json")
        try? currentData.write(to: backup, options: .atomic)
    }
}

private enum LibraryStoreError: LocalizedError {
    case unsupportedSchema(Int)

    var errorDescription: String? {
        switch self {
        case .unsupportedSchema(let version):
            AppLocalizer.text(
                "Unsupported library format (schema \(version))",
                "未対応のライブラリ形式です (schema \(version))"
            )
        }
    }
}
