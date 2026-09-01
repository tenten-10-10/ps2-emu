import AppKit
import Foundation

enum EmulatorLaunchError: LocalizedError {
    case coreMissing(URL)
    case coreNotExecutable(URL)
    case gameMissing(URL)
    case alreadyRunning

    var errorDescription: String? {
        switch self {
        case .coreMissing(let url):
            AppLocalizer.text(
                "Emulation core not found: \(url.path)",
                "エミュレーションコアが見つかりません: \(url.path)"
            )
        case .coreNotExecutable(let url):
            AppLocalizer.text(
                "Emulation core is not executable: \(url.path)",
                "エミュレーションコアを実行できません: \(url.path)"
            )
        case .gameMissing(let url):
            AppLocalizer.text("Game file not found: \(url.path)", "ゲームファイルが見つかりません: \(url.path)")
        case .alreadyRunning:
            AppLocalizer.text(
                "Another game is running. Stop it before trying again.",
                "別のゲームが実行中です。終了してからもう一度お試しください。"
            )
        }
    }
}

enum EmulatorStatus: Equatable {
    case idle
    case stopping
    case waitingForPlay
    case launching
    case running
    case launchFailed
    case exitCode(Int32)

    func text(language: ResolvedAppLanguage? = nil) -> String {
        switch self {
        case .idle:
            AppLocalizer.text("Core ready", "コア待機中", language: language)
        case .stopping:
            AppLocalizer.text("Stopping…", "終了処理中…", language: language)
        case .waitingForPlay:
            AppLocalizer.text("Waiting for Play! to close", "Play! の終了待ち", language: language)
        case .launching:
            AppLocalizer.text("Launching…", "起動中…", language: language)
        case .running:
            AppLocalizer.text("Running", "実行中", language: language)
        case .launchFailed:
            AppLocalizer.text("Launch failed", "起動失敗", language: language)
        case .exitCode(let code):
            AppLocalizer.text("Exit code \(code)", "終了コード \(code)", language: language)
        }
    }
}

final class CappedLogWriter: @unchecked Sendable {
    static let defaultMaximumBytes = 10 * 1_024 * 1_024

    private let handle: FileHandle
    private let maximumBytes: Int
    private let truncationMarker = Data("\n[PS2 Emu: log truncated at the configured size limit]\n".utf8)
    private let lock = NSLock()
    private var payloadBytesWritten = 0
    private var isTruncated = false
    private var isClosed = false

    init(url: URL, maximumBytes: Int = CappedLogWriter.defaultMaximumBytes) throws {
        self.maximumBytes = max(1, maximumBytes)
        guard FileManager.default.createFile(
            atPath: url.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        ) else {
            throw CocoaError(.fileWriteUnknown)
        }
        handle = try FileHandle(forWritingTo: url)
    }

    func append(_ data: Data) {
        guard !data.isEmpty else { return }
        lock.lock()
        defer { lock.unlock() }
        guard !isClosed, !isTruncated else { return }

        let marker = Data(truncationMarker.prefix(maximumBytes))
        let payloadLimit = max(0, maximumBytes - marker.count)
        let available = max(0, payloadLimit - payloadBytesWritten)
        let payload = Data(data.prefix(available))
        if !payload.isEmpty {
            try? handle.write(contentsOf: payload)
            payloadBytesWritten += payload.count
        }

        if payload.count < data.count {
            try? handle.write(contentsOf: marker)
            isTruncated = true
        }
    }

    func close() {
        lock.lock()
        defer { lock.unlock() }
        guard !isClosed else { return }
        try? handle.close()
        isClosed = true
    }

    deinit {
        close()
    }
}

enum LauncherLogStore {
    static let maximumLogCount = 20

    static func pruneBeforeCreatingLog(
        in directory: URL,
        fileManager: FileManager = .default
    ) {
        let keys: Set<URLResourceKey> = [
            .contentModificationDateKey,
            .isRegularFileKey,
            .isSymbolicLinkKey
        ]
        guard let entries = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles]
        ) else { return }

        let logs = entries.compactMap { url -> (url: URL, modified: Date)? in
            guard url.pathExtension.lowercased() == "log" else { return nil }
            guard let values = try? url.resourceValues(forKeys: keys) else { return nil }
            guard values.isRegularFile == true, values.isSymbolicLink != true else { return nil }
            return (url, values.contentModificationDate ?? .distantPast)
        }
        .sorted { lhs, rhs in lhs.modified > rhs.modified }

        let existingLogsToKeep = max(0, maximumLogCount - 1)
        for entry in logs.dropFirst(existingLogsToKeep) {
            try? fileManager.removeItem(at: entry.url)
        }
    }
}

@MainActor
final class EmulatorLauncher: ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var currentGameTitle: String?
    @Published private(set) var status: EmulatorStatus = .idle
    @Published private(set) var lastLogURL: URL?
    @Published var lastError: String?

    private var process: Process?
    private var startedAt: Date?
    private var runningGameID: UUID?
    private var exitHandler: ((UUID, TimeInterval) -> Void)?
    private var applicationTerminationReply: ((Bool) -> Void)?
    private var stopTimeoutWorkItem: DispatchWorkItem?

    var statusText: String { status.text() }

    func statusText(language: ResolvedAppLanguage) -> String {
        status.text(language: language)
    }

    var coreVersion: String {
        guard let selection = try? resolvedCoreSelection() else {
            return AppLocalizer.text("Configuration error", "設定エラー")
        }
        let plistURL = selection.appURL.appendingPathComponent("Contents/Info.plist")
        guard
            let data = try? Data(contentsOf: plistURL),
            let plist = try? PropertyListSerialization.propertyList(from: data, format: nil),
            let dictionary = plist as? [String: Any],
            let version = dictionary["CFBundleShortVersionString"] as? String
        else { return AppLocalizer.text("Not detected", "未検出") }
        return version
    }

    var isCoreAvailable: Bool {
        coreValidationError == nil
    }

    var isUsingUserModifiedCore: Bool {
        (try? resolvedCoreSelection())?.validationMode == .userModified
    }

    var coreSource: CoreSource? {
        (try? resolvedCoreSelection())?.source
    }

    var coreConfigurationError: String? {
        do {
            _ = try resolvedCoreSelection()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    var coreValidationError: String? {
        do {
            let selection = try resolvedCoreSelection()
            try CoreValidator.validate(appURL: selection.appURL, mode: selection.validationMode)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func launch(
        game: Game,
        fullscreen: Bool,
        onExit: @escaping (UUID, TimeInterval) -> Void
    ) throws {
        guard !isRunning else { throw EmulatorLaunchError.alreadyRunning }
        guard game.isAvailable else { throw EmulatorLaunchError.gameMissing(game.fileURL) }

        try startProcess(
            arguments: EmulatorCommand.arguments(for: game, fullscreen: fullscreen),
            title: game.title,
            gameID: game.id,
            onExit: onExit
        )
    }

    func launchCoreSettings() throws {
        guard !isRunning else { throw EmulatorLaunchError.alreadyRunning }
        try startProcess(
            arguments: [],
            title: AppLocalizer.text("Play! Settings", "Play! 設定"),
            gameID: nil,
            onExit: nil
        )
    }

    func stop() {
        requestGracefulStop(timeout: 4)
    }

    func prepareForApplicationTermination(reply: @escaping (Bool) -> Void) {
        guard let process, process.isRunning else {
            reply(true)
            return
        }
        applicationTerminationReply = reply
        requestGracefulStop(timeout: 4)
    }

    private func requestGracefulStop(timeout: TimeInterval) {
        guard let process, process.isRunning else { return }
        let ownedPID = process.processIdentifier
        status = .stopping
        let application = NSRunningApplication(processIdentifier: process.processIdentifier)
        if application?.terminate() != true {
            process.terminate()
        }

        stopTimeoutWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self, weak process] in
            guard
                let self,
                let process,
                self.process === process,
                process.processIdentifier == ownedPID,
                process.isRunning
            else { return }

            self.status = .waitingForPlay
            let isApplicationTermination = self.applicationTerminationReply != nil
            self.lastError = isApplicationTermination
                ? AppLocalizer.text(
                    "Play! could not be closed automatically. Save in the game, then close the Play! window. Quitting PS2 Emu was cancelled.",
                    "Play! を自動終了できませんでした。ゲーム側で保存してからPlay!のウィンドウを閉じてください。PS2 Emuの終了はキャンセルしました。"
                )
                : AppLocalizer.text(
                    "Play! could not be closed automatically. Save in the game, then close the Play! window.",
                    "Play! を自動終了できませんでした。ゲーム側で保存してからPlay!のウィンドウを閉じてください。"
                )
            let reply = self.applicationTerminationReply
            self.applicationTerminationReply = nil
            reply?(false)
        }
        stopTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: workItem)
    }

    func showLastLog() {
        guard let lastLogURL else { return }
        NSWorkspace.shared.activateFileViewerSelecting([lastLogURL])
    }

    private func startProcess(
        arguments: [String],
        title: String,
        gameID: UUID?,
        onExit: ((UUID, TimeInterval) -> Void)?
    ) throws {
        let selection = try resolvedCoreSelection()
        try CoreValidator.validate(
            appURL: selection.appURL,
            mode: selection.validationMode
        )
        let executableURL = selection.appURL.appendingPathComponent("Contents/MacOS/Play")

        let logURL = try makeLogURL(title: title)
        let logWriter = try CappedLogWriter(url: logURL)
        let outputPipe = Pipe()
        outputPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                logWriter.close()
            } else {
                logWriter.append(data)
            }
        }

        let process = Process()
        process.executableURL = executableURL
        process.arguments = arguments
        process.currentDirectoryURL = selection.appURL.deletingLastPathComponent()
        process.standardOutput = outputPipe
        process.standardError = outputPipe
        process.qualityOfService = .userInteractive

        self.process = process
        self.startedAt = Date()
        self.runningGameID = gameID
        self.exitHandler = onExit
        self.lastLogURL = logURL
        self.currentGameTitle = title
        self.status = .launching
        self.lastError = nil

        process.terminationHandler = { [weak self] terminated in
            let status = terminated.terminationStatus
            Task { @MainActor [weak self] in
                self?.handleTermination(status: status)
            }
        }

        do {
            try process.run()
            try? outputPipe.fileHandleForWriting.close()
            isRunning = true
            status = .running
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                NSRunningApplication(processIdentifier: process.processIdentifier)?.activate(
                    options: [.activateAllWindows]
                )
            }
        } catch {
            outputPipe.fileHandleForReading.readabilityHandler = nil
            try? outputPipe.fileHandleForReading.close()
            try? outputPipe.fileHandleForWriting.close()
            logWriter.close()
            self.process = nil
            self.startedAt = nil
            self.runningGameID = nil
            self.exitHandler = nil
            self.currentGameTitle = nil
            self.status = .launchFailed
            self.lastError = error.localizedDescription
            throw error
        }
    }

    private func handleTermination(status: Int32) {
        stopTimeoutWorkItem?.cancel()
        stopTimeoutWorkItem = nil
        let elapsed = startedAt.map { Date().timeIntervalSince($0) } ?? 0
        if let runningGameID, let exitHandler {
            exitHandler(runningGameID, elapsed)
        }

        isRunning = false
        currentGameTitle = nil
        startedAt = nil
        runningGameID = nil
        exitHandler = nil
        process = nil
        self.status = status == 0 ? .idle : .exitCode(status)
        let reply = applicationTerminationReply
        applicationTerminationReply = nil
        reply?(true)
        if status != 0 {
            lastError = AppLocalizer.text(
                "The emulation core exited with code \(status). Check the log for details.",
                "エミュレーションコアが終了コード \(status) で終了しました。ログを確認してください。"
            )
        }
    }

    private func makeLogURL(title: String) throws -> URL {
        let base = AppIdentity.logDirectoryURL(
            libraryDirectory: FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        )
        try FileManager.default.createDirectory(
            at: base,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: base.path)
        LauncherLogStore.pruneBeforeCreatingLog(in: base)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let safeTitle = title
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
            .prefix(48)
        let nonce = UUID().uuidString.prefix(8).lowercased()
        return base.appendingPathComponent("\(formatter.string(from: Date()))-\(safeTitle)-\(nonce).log")
    }

    private func resolvedCoreSelection() throws -> CoreSelection {
        try CoreRuntimeConfiguration.resolve()
    }
}
