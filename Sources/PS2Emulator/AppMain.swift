import AppKit
import Darwin
import SwiftUI

@MainActor
struct PS2EmulatorScene: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var library: GameLibrary
    @StateObject private var launcher: EmulatorLauncher
    @StateObject private var preferences: AppPreferences
    @State private var pendingOpenURLs: [URL] = []

    init() {
        let launcher = EmulatorLauncher()
        _library = StateObject(wrappedValue: GameLibrary())
        _launcher = StateObject(wrappedValue: launcher)
        _preferences = StateObject(wrappedValue: AppPreferences())
        AppLifecycleBridge.shared.launcher = launcher
    }

    var body: some Scene {
        WindowGroup(AppIdentity.displayName) {
            Group {
                if preferences.hasAcceptedRequiredNotices {
                    RootView(playGame: play)
                } else {
                    FirstRunNoticeView {
                        preferences.hasAcceptedSafetyNotice = true
                        preferences.hasAcceptedBundledDemoLicense = true
                    }
                }
            }
                .environmentObject(library)
                .environmentObject(launcher)
                .environmentObject(preferences)
                .environment(\.locale, preferences.resolvedLanguage.locale)
                .frame(minWidth: 920, minHeight: 600)
                .onOpenURL(perform: handleOpenURL)
                .onChange(of: preferences.hasAcceptedRequiredNotices) { _, accepted in
                    guard accepted, !pendingOpenURLs.isEmpty else { return }
                    library.add(urls: pendingOpenURLs)
                    pendingOpenURLs.removeAll()
                }
        }
        .defaultSize(width: 1180, height: 760)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button(preferences.text("Add Games…", "ゲームを追加…")) {
                    library.showAddGamesPanel()
                }
                .keyboardShortcut("o", modifiers: .command)
                .disabled(!preferences.hasAcceptedRequiredNotices)

                Button(preferences.text("Add Game Folders…", "ゲームフォルダを追加…")) {
                    library.showAddFolderPanel(recursive: preferences.scanRecursively)
                }
                .keyboardShortcut("o", modifiers: [.command, .shift])
                .disabled(!preferences.hasAcceptedRequiredNotices)
            }

            CommandMenu(LocalizedStringKey(preferences.text("Game", "ゲーム"))) {
                Button(preferences.text("Launch Selected Game", "選択したゲームを起動")) {
                    if let game = library.selectedGame { play(game) }
                }
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(
                    !preferences.hasAcceptedRequiredNotices
                        || library.selectedGame == nil
                        || launcher.isRunning
                )

                Button(preferences.text("Stop Emulation", "エミュレーションを終了")) {
                    launcher.stop()
                }
                .keyboardShortcut(".", modifiers: .command)
                .disabled(!launcher.isRunning)

                Divider()

                Button(preferences.text("Rescan Library", "ライブラリを再スキャン")) {
                    library.rescan(recursive: preferences.scanRecursively)
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
                .disabled(!preferences.hasAcceptedRequiredNotices)

                Button(preferences.text("Open Play! Settings", "Play! の設定を開く")) {
                    launchCoreSettings()
                }
                .disabled(!preferences.hasAcceptedRequiredNotices || launcher.isRunning)
            }
        }

        Settings {
            SettingsView()
                .environmentObject(library)
                .environmentObject(launcher)
                .environmentObject(preferences)
                .environment(\.locale, preferences.resolvedLanguage.locale)
                .frame(width: 600, height: 520)
        }
    }

    private func play(_ game: Game) {
        guard preferences.hasAcceptedRequiredNotices else { return }
        do {
            try launcher.launch(game: game, fullscreen: preferences.launchFullscreen) { id, elapsed in
                library.recordPlayFinished(id, elapsed: elapsed)
            }
            library.recordPlayStarted(game.id)
        } catch {
            launcher.lastError = error.localizedDescription
        }
    }

    private func launchCoreSettings() {
        guard preferences.hasAcceptedRequiredNotices else { return }
        do {
            try launcher.launchCoreSettings()
        } catch {
            launcher.lastError = error.localizedDescription
        }
    }

    private func handleOpenURL(_ url: URL) {
        if preferences.hasAcceptedRequiredNotices {
            library.add(urls: [url])
        } else if !pendingOpenURLs.contains(url) {
            pendingOpenURLs.append(url)
        }
    }
}

@main
enum PS2EmulatorMain {
    @MainActor
    static func main() {
        if CommandLine.arguments.contains("--self-test") {
            Darwin.exit(CoreSelfTest.run())
        }
        PS2EmulatorScene.main()
    }
}
