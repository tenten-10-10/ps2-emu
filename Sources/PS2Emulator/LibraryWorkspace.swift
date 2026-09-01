import AppKit
import SwiftUI

struct LibraryWorkspace: View {
    @EnvironmentObject private var library: GameLibrary
    @EnvironmentObject private var launcher: EmulatorLauncher
    @EnvironmentObject private var preferences: AppPreferences

    let playGame: (Game) -> Void

    var body: some View {
        VStack(spacing: 0) {
            workspaceHeader

            Divider().opacity(0.45)

            if library.visibleGames.isEmpty {
                EmptyLibraryView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HSplitView {
                    gameGrid
                        .frame(minWidth: 520)

                    if let game = library.selectedGame {
                        GameInspector(game: game, playGame: playGame)
                            .frame(minWidth: 260, idealWidth: 290, maxWidth: 330)
                    }
                }
            }

            Divider().opacity(0.45)
            statusBar
        }
        .background(
            LinearGradient(
                colors: [
                    Color(nsColor: .windowBackgroundColor),
                    VisualStyle.midnight.opacity(0.16)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .dropDestination(for: URL.self) { urls, _ in
            library.add(urls: urls)
            return !urls.isEmpty
        }
    }

    private var workspaceHeader: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(library.filter.title)
                    .font(.title2.bold())
                Text(AppLocalizer.gameCount(
                    library.visibleGames.count,
                    language: preferences.resolvedLanguage
                ))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField(preferences.text("Search games", "ゲームを検索"), text: $library.searchText)
                    .textFieldStyle(.plain)
                    .frame(width: 180)
                if !library.searchText.isEmpty {
                    Button {
                        library.searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 9, style: .continuous))

            Picker(preferences.text("Sort Order", "並び順"), selection: $library.sort) {
                ForEach(GameSort.allCases) { sort in
                    Text(sort.label).tag(sort)
                }
            }
            .labelsHidden()
            .frame(width: 130)

            Button {
                library.rescan(recursive: preferences.scanRecursively)
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .help(preferences.text("Rescan Library", "ライブラリを再スキャン"))
            .disabled(library.watchedFolders.isEmpty || library.isScanning)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 16)
    }

    private var gameGrid: some View {
        ScrollView {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 176, maximum: 220), spacing: 18)],
                alignment: .leading,
                spacing: 20
            ) {
                ForEach(library.visibleGames) { game in
                    GameCard(
                        game: game,
                        isSelected: library.selectedGameID == game.id,
                        showDetails: preferences.showFileDetails
                    )
                    .onTapGesture {
                        library.selectedGameID = game.id
                    }
                    .onTapGesture(count: 2) {
                        library.selectedGameID = game.id
                        if !launcher.isRunning, game.isAvailable {
                            playGame(game)
                        }
                    }
                    .contextMenu {
                        Button(preferences.text("Launch", "起動")) { playGame(game) }
                            .disabled(launcher.isRunning || !game.isAvailable)
                        Button(game.isFavorite
                            ? preferences.text("Remove from Favorites", "お気に入りから外す")
                            : preferences.text("Add to Favorites", "お気に入りに追加")) {
                            library.toggleFavorite(game.id)
                        }
                        Button(preferences.text("Show in Finder", "Finderで表示")) {
                            NSWorkspace.shared.activateFileViewerSelecting([game.fileURL])
                        }
                    }
                }
            }
            .padding(22)
        }
    }

    private var statusBar: some View {
        HStack(spacing: 12) {
            EngineStatusPill(
                isRunning: launcher.isRunning,
                text: launcher.statusText(language: preferences.resolvedLanguage)
            )

            if let title = launcher.currentGameTitle {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if launcher.isUsingUserModifiedCore {
                Label(
                    preferences.text(
                        "User-modified core • security not verified",
                        "ユーザー改変コア • セキュリティ未検証"
                    ),
                    systemImage: "exclamationmark.shield.fill"
                )
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.orange)
            } else {
                Text(preferences.text(
                    "Supported: ISO • MDS • ISZ • CSO • CUE • CHD • ELF",
                    "対応: ISO • MDS • ISZ • CSO • CUE • CHD • ELF"
                ))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if launcher.isRunning {
                Button(preferences.text("Stop", "終了")) { launcher.stop() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(.ultraThinMaterial)
    }
}

struct GameCard: View {
    let game: Game
    let isSelected: Bool
    let showDetails: Bool

    @State private var isHovering = false

    private var palette: [Color] {
        let value = game.title.unicodeScalars.reduce(0) { ($0 &* 31) &+ Int($1.value) }
        let index = Int(value.magnitude % UInt(VisualStyle.coverPalettes.count))
        return VisualStyle.coverPalettes[index]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: palette,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                coverPattern

                VStack {
                    Spacer()
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("PLAY")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .tracking(3)
                                .opacity(0.72)
                            Text("2")
                                .font(.system(size: 52, weight: .black, design: .rounded))
                        }
                        Spacer()
                        Image(systemName: game.kind.symbol)
                            .font(.title2)
                    }
                    .foregroundStyle(.white)
                    .padding(16)
                }

                if game.isFavorite {
                    Image(systemName: "star.fill")
                        .foregroundStyle(.yellow)
                        .padding(11)
                }

                if !game.isAvailable {
                    Label(
                        AppLocalizer.text("FILE MISSING", "ファイルなし"),
                        systemImage: "exclamationmark.triangle.fill"
                    )
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(.red.opacity(0.86), in: Capsule())
                        .padding(9)
                }
            }
            .aspectRatio(4 / 5, contentMode: .fit)
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(
                        isSelected ? VisualStyle.electricBlue : .white.opacity(isHovering ? 0.28 : 0.10),
                        lineWidth: isSelected ? 3 : 1
                    )
            }
            .shadow(
                color: isSelected ? VisualStyle.electricBlue.opacity(0.25) : .black.opacity(0.20),
                radius: isHovering ? 14 : 7,
                y: isHovering ? 7 : 3
            )
            .scaleEffect(isHovering ? 1.018 : 1)

            Text(game.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)

            if showDetails {
                HStack(spacing: 6) {
                    Text(game.fileExtension)
                    Text("•")
                    Text(game.formattedSize)
                }
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
        .animation(.easeOut(duration: 0.16), value: isHovering)
        .onHover { isHovering = $0 }
    }

    private var coverPattern: some View {
        GeometryReader { proxy in
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.16), lineWidth: 1)
                    .frame(width: proxy.size.width * 1.08)
                    .offset(x: proxy.size.width * 0.28, y: -proxy.size.height * 0.20)
                Circle()
                    .stroke(.white.opacity(0.10), lineWidth: 22)
                    .frame(width: proxy.size.width * 0.66)
                    .offset(x: -proxy.size.width * 0.30, y: proxy.size.height * 0.24)
                Rectangle()
                    .fill(.white.opacity(0.08))
                    .frame(width: proxy.size.width * 1.5, height: 1)
                    .rotationEffect(.degrees(-32))
            }
            .clipped()
        }
    }
}

private struct EmptyLibraryView: View {
    @EnvironmentObject private var library: GameLibrary
    @EnvironmentObject private var preferences: AppPreferences

    var body: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .fill(VisualStyle.electricBlue.opacity(0.12))
                    .frame(width: 138, height: 138)
                Circle()
                    .stroke(VisualStyle.electricBlue.opacity(0.3), lineWidth: 1)
                    .frame(width: 106, height: 106)
                Image(systemName: "opticaldisc")
                    .font(.system(size: 54, weight: .thin))
                    .foregroundStyle(VisualStyle.electricBlue)
            }

            VStack(spacing: 7) {
                Text(library.games.isEmpty
                    ? preferences.text("Build Your Game Library", "ゲームライブラリを作りましょう")
                    : preferences.text("No Matching Games", "該当するゲームがありません"))
                    .font(.title2.bold())
                Text(library.games.isEmpty
                     ? preferences.text(
                        "Add legally owned or authorized PS2 disc images.\nNo external BIOS is required. Library paths and history are stored locally; Play! may operate independently.",
                        "適法に所有または使用許可を得たPS2ディスクイメージを追加してください。\n外部BIOSは不要です。ライブラリのパスと履歴はローカル保存され、Play!は独自に動作する場合があります。"
                     )
                     : preferences.text(
                        "Change the search terms or filter.",
                        "検索条件またはフィルタを変更してください。"
                     ))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
            }

            if library.games.isEmpty {
                HStack(spacing: 12) {
                    Button(preferences.text("Add Games…", "ゲームを追加…")) { library.showAddGamesPanel() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    Button(preferences.text("Add Folders…", "フォルダを追加…")) {
                        library.showAddFolderPanel(recursive: preferences.scanRecursively)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
            }

            Text(preferences.text(
                "Drag and drop ISO, CHD, ELF, and other supported files here",
                "ここへISO・CHD・ELFなどをドラッグ＆ドロップできます"
            ))
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(40)
    }
}
