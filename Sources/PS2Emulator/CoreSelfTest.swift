import Foundation

enum CoreSelfTest {
    static func run() -> Int32 {
        let bundle = Bundle.main
        guard bundle.bundleURL.pathExtension == "app" else {
            writeError("outer_bundle=invalid path=\(bundle.bundleURL.path)")
            return 10
        }

        let coreApp = bundle.bundleURL.appendingPathComponent("Contents/Helpers/Play.app")
        let executable = coreApp.appendingPathComponent("Contents/MacOS/Play")
        do {
            try CoreValidator.validate(appURL: coreApp, mode: .strictBundled)
        } catch {
            writeError("core_validation=failed error=\(error.localizedDescription)")
            return 11
        }

        let pipe = Pipe()
        let process = Process()
        process.executableURL = executable
        process.arguments = ["--version"]
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            writeError("core_launch=failed error=\(error.localizedDescription)")
            return 12
        }

        let output = String(
            data: pipe.fileHandleForReading.readDataToEndOfFile(),
            encoding: .utf8
        )?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard process.terminationStatus == 0, output.contains("Play! Version:") else {
            writeError("core_version=invalid status=\(process.terminationStatus) output=\(output)")
            return 13
        }

        print("outer_bundle=ok identifier=\(bundle.bundleIdentifier ?? "unknown")")
        print("core_signature=ok cdhash=\(CoreValidator.expectedCDHash)")
        print("core_version=ok value=\(output)")
        print("bios=not_required")
        return 0
    }

    private static func writeError(_ message: String) {
        FileHandle.standardError.write(Data((message + "\n").utf8))
    }
}
