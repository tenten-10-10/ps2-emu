import AppKit
import SwiftUI

struct RootView: View {
    @EnvironmentObject private var library: GameLibrary
    @EnvironmentObject private var launcher: EmulatorLauncher
    @EnvironmentObject private var preferences: AppPreferences

    let playGame: (Game) -> Void

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 210, ideal: 235, max: 280)
        } detail: {
            LibraryWorkspace(playGame: playGame)
        }
        .tint(VisualStyle.electricBlue)
        .alert(AppIdentity.displayName, isPresented: errorPresented) {
            Button("OK", role: .cancel) {
                launcher.lastError = nil
                library.lastError = nil
            }
            if launcher.lastLogURL != nil {
                Button(preferences.text("Show Log", "ログを表示")) { launcher.showLastLog() }
            }
        } message: {
            Text(launcher.lastError ?? library.lastError ?? preferences.text("Unknown error", "不明なエラー"))
        }
    }

    private var errorPresented: Binding<Bool> {
        Binding(
            get: { launcher.lastError != nil || library.lastError != nil },
            set: { value in
                if !value {
                    launcher.lastError = nil
                    library.lastError = nil
                }
            }
        )
    }
}

private struct SidebarView: View {
    @EnvironmentObject private var library: GameLibrary
    @EnvironmentObject private var launcher: EmulatorLauncher
    @EnvironmentObject private var preferences: AppPreferences

    var body: some View {
        VStack(spacing: 0) {
            brand

            List(selection: $library.filter) {
                Section(preferences.text("Library", "ライブラリ")) {
                    ForEach(LibraryFilter.allCases) { filter in
                        Label(filter.title, systemImage: filter.symbol)
                            .tag(filter)
                    }
                }

                if !library.watchedFolders.isEmpty {
                    Section(preferences.text("Game Folders", "ゲームフォルダ")) {
                        ForEach(library.watchedFolders, id: \.self) { folder in
                            Label(URL(fileURLWithPath: folder).lastPathComponent, systemImage: "folder.fill")
                                .help(folder)
                                .contextMenu {
                                    Button(preferences.text("Show in Finder", "Finderで表示")) {
                                        NSWorkspace.shared.open(URL(fileURLWithPath: folder))
                                    }
                                    Button(preferences.text("Remove from List", "一覧から外す"), role: .destructive) {
                                        library.removeFolder(folder)
                                    }
                                }
                        }
                    }
                }
            }
            .listStyle(.sidebar)

            VStack(alignment: .leading, spacing: 10) {
                EngineStatusPill(
                    isRunning: launcher.isRunning,
                    text: launcher.statusText(language: preferences.resolvedLanguage)
                )
                Text(preferences.text(
                    "Play! \(launcher.coreVersion) • No external BIOS",
                    "Play! \(launcher.coreVersion) • 外部BIOS不要"
                ))
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if launcher.isUsingUserModifiedCore {
                    VStack(alignment: .leading, spacing: 3) {
                        Label(
                            preferences.text(
                                "User-modified core • security not verified",
                                "ユーザー改変コア • セキュリティ未検証"
                            ),
                            systemImage: "exclamationmark.shield.fill"
                        )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.orange)
                        if let error = launcher.coreValidationError {
                            Text(error)
                                .font(.caption2)
                                .foregroundStyle(.red)
                                .lineLimit(3)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                } else if launcher.coreConfigurationError != nil {
                    Label(
                        preferences.text("Core configuration error", "コア設定エラー"),
                        systemImage: "xmark.octagon.fill"
                    )
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.red)
                } else if !launcher.isCoreAvailable {
                    VStack(alignment: .leading, spacing: 4) {
                        Label(
                            preferences.text(
                                "Play! is missing or failed verification",
                                "Play!が未検出、または検証に失敗"
                            ),
                            systemImage: "arrow.down.app.fill"
                        )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.orange)

                        Link(
                            preferences.text("Download the verified official Play! build", "検証済みPlay!公式ビルドをダウンロード"),
                            destination: CoreValidator.officialDownloadURL
                        )
                        .font(.caption2)

                        Text(preferences.text(
                            "Play! is a separate independent app.",
                            "Play!は独立した別アプリです。"
                        ))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 8) {
                    Button {
                        library.showAddGamesPanel()
                    } label: {
                        Label(preferences.text("Add", "追加"), systemImage: "plus")
                    }

                    Button {
                        library.showAddFolderPanel(recursive: preferences.scanRecursively)
                    } label: {
                        Image(systemName: "folder.badge.plus")
                    }
                    .help(preferences.text("Add Game Folders", "ゲームフォルダを追加"))
                }
                .buttonStyle(.borderless)
                .font(.caption)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial)
        }
    }

    private var brand: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [VisualStyle.electricBlue, VisualStyle.violet],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Text("2")
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
            }
            .frame(width: 42, height: 42)
            .shadow(color: VisualStyle.electricBlue.opacity(0.35), radius: 10)

            VStack(alignment: .leading, spacing: 1) {
                Text("PS2")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                Text("EMULATOR")
                    .font(.system(size: 9, weight: .semibold, design: .rounded))
                    .tracking(2.1)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
