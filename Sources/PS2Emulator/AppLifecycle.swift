import AppKit

@MainActor
final class AppLifecycleBridge {
    static let shared = AppLifecycleBridge()
    weak var launcher: EmulatorLauncher?
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let launcher = AppLifecycleBridge.shared.launcher, launcher.isRunning else {
            return .terminateNow
        }

        launcher.prepareForApplicationTermination { allowTermination in
            sender.reply(toApplicationShouldTerminate: allowTermination)
        }
        return .terminateLater
    }
}
