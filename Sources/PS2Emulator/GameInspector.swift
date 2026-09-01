import AppKit
import SwiftUI

struct GameInspector: View {
    @EnvironmentObject private var library: GameLibrary
    @EnvironmentObject private var launcher: EmulatorLauncher
    @EnvironmentObject private var preferences: AppPreferences

    let game: Game
    let playGame: (Game) -> Void

    @State private var editedTitle = ""
    @State private var isRenaming = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    Image(systemName: game.kind.symbol)
                        .font(.title)
                        .foregroundStyle(VisualStyle.electricBlue)
                        .frame(width: 46, height: 46)
                        .background(VisualStyle.electricBlue.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                    Spacer()

                    Button {
                        library.toggleFavorite(game.id)
                    } label: {
                        Image(systemName: game.isFavorite ? "star.fill" : "star")
                            .foregroundStyle(game.isFavorite ? .yellow : .secondary)
                    }
                    .buttonStyle(.plain)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(game.title)
                        .font(.title3.bold())
                        .textSelection(.enabled)
                    Label(
                        game.isBundledHomebrewDemo
                            ? preferences.text("Bundled open-source homebrew demo", "同梱オープンソースhomebrewデモ")
                            : game.kind.label,
                        systemImage: "checkmark.seal.fill"
                    )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Button {
                    playGame(game)
                } label: {
                    Label(
                        game.isBundledHomebrewDemo
                            ? preferences.text("Launch Demo", "デモを起動")
                            : preferences.text("Launch Game", "ゲームを起動"),
                        systemImage: "play.fill"
                    )
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(launcher.isRunning || !game.isAvailable)

                if !game.isAvailable {
                    Label(
                        preferences.text("Source file not found", "元ファイルが見つかりません"),
                        systemImage: "exclamationmark.triangle.fill"
                    )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.red.opacity(0.09), in: RoundedRectangle(cornerRadius: 9))
                }

                Divider()

                VStack(spacing: 12) {
                    metadataRow(preferences.text("Format", "形式"), value: game.fileExtension)
                    metadataRow(preferences.text("Size", "サイズ"), value: game.formattedSize)
                    metadataRow(preferences.text("Play Time", "プレイ時間"), value: game.formattedPlayTime)
                    metadataRow(preferences.text("Date Added", "追加日"), value: formatDate(game.addedAt))
                    metadataRow(
                        preferences.text("Last Played", "最終プレイ"),
                        value: game.lastPlayedAt.map { formatDate($0, includesTime: true) } ?? "—"
                    )
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text(preferences.text("File", "ファイル"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(game.path)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .lineLimit(5)
                    Button(preferences.text("Show in Finder", "Finderで表示")) {
                        NSWorkspace.shared.activateFileViewerSelecting([game.fileURL])
                    }
                    .font(.caption)
                }

                Menu(preferences.text("More Actions", "その他の操作")) {
                    if !game.isBundledHomebrewDemo {
                        Button(preferences.text("Rename…", "タイトルを変更…")) {
                            editedTitle = game.title
                            isRenaming = true
                        }
                    }
                    Button(preferences.text("Remove from Library", "ライブラリから削除"), role: .destructive) {
                        library.removeSelected()
                    }
                }
                .menuStyle(.borderlessButton)
            }
            .padding(20)
        }
        .background(.ultraThinMaterial)
        .sheet(isPresented: $isRenaming) {
            VStack(alignment: .leading, spacing: 18) {
                Text(preferences.text("Rename Game", "タイトルを変更"))
                    .font(.headline)
                TextField(preferences.text("Game Title", "ゲームタイトル"), text: $editedTitle)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Spacer()
                    Button(preferences.text("Cancel", "キャンセル")) {
                        editedTitle = ""
                        isRenaming = false
                    }
                    Button(preferences.text("Save", "保存")) {
                        library.rename(game.id, to: editedTitle)
                        editedTitle = ""
                        isRenaming = false
                    }
                    .disabled(editedTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(24)
            .frame(width: 380)
        }
    }

    private func metadataRow(_ label: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
        .font(.caption)
    }

    private func formatDate(_ date: Date, includesTime: Bool = false) -> String {
        let formatter = DateFormatter()
        formatter.locale = preferences.resolvedLanguage.locale
        formatter.dateStyle = .medium
        formatter.timeStyle = includesTime ? .short : .none
        return formatter.string(from: date)
    }
}
