import Foundation

enum GameKind: String, Codable, CaseIterable, Sendable {
    case discImage
    case homebrewELF

    static let discExtensions: Set<String> = ["iso", "mds", "isz", "cso", "cue", "chd"]
    static let elfExtensions: Set<String> = ["elf"]
    static let supportedExtensions = discExtensions.union(elfExtensions)

    static func detect(url: URL) -> GameKind? {
        let ext = url.pathExtension.lowercased()
        if discExtensions.contains(ext) { return .discImage }
        if elfExtensions.contains(ext) { return .homebrewELF }
        return nil
    }

    var label: String {
        switch self {
        case .discImage: AppLocalizer.text("Disc image", "ディスクイメージ")
        case .homebrewELF: "Homebrew ELF"
        }
    }

    var symbol: String {
        switch self {
        case .discImage: "opticaldisc.fill"
        case .homebrewELF: "terminal.fill"
        }
    }
}

struct Game: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var title: String
    let path: String
    let kind: GameKind
    let addedAt: Date
    var lastPlayedAt: Date?
    var totalPlaySeconds: TimeInterval
    var isFavorite: Bool

    init(
        id: UUID = UUID(),
        title: String? = nil,
        url: URL,
        kind: GameKind,
        addedAt: Date = Date(),
        lastPlayedAt: Date? = nil,
        totalPlaySeconds: TimeInterval = 0,
        isFavorite: Bool = false
    ) {
        self.id = id
        self.title = title ?? Self.displayTitle(for: url)
        self.path = url.standardizedFileURL.path
        self.kind = kind
        self.addedAt = addedAt
        self.lastPlayedAt = lastPlayedAt
        self.totalPlaySeconds = totalPlaySeconds
        self.isFavorite = isFavorite
    }

    var fileURL: URL { URL(fileURLWithPath: path) }
    var isBundledHomebrewDemo: Bool { id == BundledHomebrewDemo.id }
    var isAvailable: Bool { FileManager.default.fileExists(atPath: path) }
    var fileExtension: String { fileURL.pathExtension.uppercased() }

    var formattedSize: String {
        guard
            let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey]),
            let size = values.fileSize
        else { return "—" }
        return ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)
    }

    var formattedPlayTime: String {
        AppLocalizer.playTime(seconds: totalPlaySeconds)
    }

    static func displayTitle(for url: URL) -> String {
        let raw = url.deletingPathExtension().lastPathComponent
        return raw
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: ".", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct LibraryDocument: Codable, Sendable {
    var schemaVersion = 1
    var games: [Game]
    var watchedFolders: [String]
}

enum LibraryFilter: String, CaseIterable, Identifiable {
    case all
    case favorites
    case recent
    case homebrew
    case unavailable

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: AppLocalizer.text("All Games", "すべてのゲーム")
        case .favorites: AppLocalizer.text("Favorites", "お気に入り")
        case .recent: AppLocalizer.text("Recently Played", "最近プレイ")
        case .homebrew: "Homebrew"
        case .unavailable: AppLocalizer.text("Missing Files", "見つからない項目")
        }
    }

    var symbol: String {
        switch self {
        case .all: "square.grid.2x2.fill"
        case .favorites: "star.fill"
        case .recent: "clock.arrow.circlepath"
        case .homebrew: "terminal.fill"
        case .unavailable: "exclamationmark.triangle.fill"
        }
    }
}

enum GameSort: String, CaseIterable, Identifiable {
    case title
    case recentlyPlayed
    case recentlyAdded

    var id: String { rawValue }

    var label: String {
        switch self {
        case .title: AppLocalizer.text("Title", "タイトル")
        case .recentlyPlayed: AppLocalizer.text("Recently Played", "最近プレイ")
        case .recentlyAdded: AppLocalizer.text("Date Added", "追加日")
        }
    }
}

enum EmulatorCommand {
    static func arguments(for game: Game, fullscreen: Bool) -> [String] {
        var arguments: [String] = []
        if fullscreen { arguments.append("--fullscreen") }
        switch game.kind {
        case .discImage:
            arguments.append(contentsOf: ["--disc", game.path])
        case .homebrewELF:
            arguments.append(contentsOf: ["--elf", game.path])
        }
        return arguments
    }
}
