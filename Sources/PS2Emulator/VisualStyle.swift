import SwiftUI

enum VisualStyle {
    static let midnight = Color(red: 0.035, green: 0.045, blue: 0.09)
    static let panel = Color(red: 0.075, green: 0.09, blue: 0.16)
    static let electricBlue = Color(red: 0.23, green: 0.55, blue: 1.0)
    static let violet = Color(red: 0.52, green: 0.31, blue: 0.98)
    static let cyan = Color(red: 0.16, green: 0.83, blue: 0.93)

    static let coverPalettes: [[Color]] = [
        [Color(red: 0.08, green: 0.21, blue: 0.55), electricBlue, cyan],
        [Color(red: 0.19, green: 0.08, blue: 0.44), violet, Color.pink],
        [Color(red: 0.05, green: 0.32, blue: 0.31), Color.teal, cyan],
        [Color(red: 0.36, green: 0.09, blue: 0.16), Color.red, Color.orange],
        [Color(red: 0.12, green: 0.15, blue: 0.29), Color.indigo, electricBlue]
    ]
}

struct EngineStatusPill: View {
    let isRunning: Bool
    let text: String

    var body: some View {
        HStack(spacing: 7) {
            Circle()
                .fill(isRunning ? Color.green : VisualStyle.electricBlue)
                .frame(width: 7, height: 7)
                .shadow(color: (isRunning ? Color.green : VisualStyle.electricBlue).opacity(0.8), radius: 5)
            Text(text)
                .font(.caption.weight(.medium))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.thinMaterial, in: Capsule())
    }
}
