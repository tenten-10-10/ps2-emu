import Foundation
import Security

enum CoreValidationError: LocalizedError {
    case missing(URL)
    case invalidMetadata(String)
    case unsupportedArchitecture(required: String, found: String)
    case invalidRequirement(OSStatus)
    case invalidSignature(OSStatus)
    case unexpectedCDHash(String)

    var errorDescription: String? {
        switch self {
        case .missing(let url):
            AppLocalizer.text("Play! core not found: \(url.path)", "Play!コアが見つかりません: \(url.path)")
        case .invalidMetadata(let detail):
            AppLocalizer.text(
                "Play! core metadata does not meet the required value: \(detail)",
                "Play!コアのメタデータが必要な値を満たしていません: \(detail)"
            )
        case .unsupportedArchitecture(let required, let found):
            AppLocalizer.text(
                "Play! core does not support this Mac architecture (required: \(required), found: \(found))",
                "Play!コアがこのMacのアーキテクチャに対応していません（必要: \(required)、検出: \(found)）"
            )
        case .invalidRequirement(let status):
            AppLocalizer.text(
                "Could not create the Play! core signature requirement (OSStatus \(status))",
                "Play!コアの署名要件を作成できませんでした (OSStatus \(status))"
            )
        case .invalidSignature(let status):
            AppLocalizer.text(
                "Could not verify the Play! core signature or publisher (OSStatus \(status))",
                "Play!コアの署名または発行元を検証できませんでした (OSStatus \(status))"
            )
        case .unexpectedCDHash(let actual):
            AppLocalizer.text(
                "Play! core CDHash does not match the pinned build: \(actual)",
                "Play!コアのCDHashが固定版と一致しません: \(actual)"
            )
        }
    }
}

enum CoreValidationMode: Equatable, Sendable {
    case strictBundled
    case userModified
}

enum CoreValidator {
    static let officialDownloadURL = URL(
        string: "https://s3.us-east-2.amazonaws.com/playbuilds/04bde0df/Play.dmg"
    )!
    static let expectedBundleID = "com.virtualapplications.Play"
    static let expectedTeamID = "YXKF5365BY"
    static let expectedVersion = "0.77-7-g04bde0df"
    static let expectedCDHashesByArchitecture = [
        "arm64": "3c5b7d6d748717f218ef7be0e6b83109728463bd",
        "x86_64": "ff080b2d4cd99ed6faf0eb5d2ace7f41d28980da"
    ]

    static let currentArchitecture: String = {
        #if arch(arm64)
        "arm64"
        #elseif arch(x86_64)
        "x86_64"
        #else
        "unsupported-host"
        #endif
    }()

    static var expectedCDHash: String {
        expectedCDHashesByArchitecture[currentArchitecture] ?? ""
    }

    static func validate(appURL: URL, mode: CoreValidationMode = .strictBundled) throws {
        let executable = appURL.appendingPathComponent("Contents/MacOS/Play")
        guard FileManager.default.isExecutableFile(atPath: executable.path) else {
            throw CoreValidationError.missing(executable)
        }

        let plistURL = appURL.appendingPathComponent("Contents/Info.plist")
        guard
            let data = try? Data(contentsOf: plistURL),
            let plist = try? PropertyListSerialization.propertyList(from: data, format: nil),
            let dictionary = plist as? [String: Any]
        else {
            throw CoreValidationError.invalidMetadata("Info.plist")
        }

        guard dictionary["CFBundleIdentifier"] as? String == expectedBundleID else {
            throw CoreValidationError.invalidMetadata("Bundle ID")
        }
        try validateArchitecture(executableURL: executable)

        guard mode == .strictBundled else { return }

        guard dictionary["CFBundleShortVersionString"] as? String == expectedVersion else {
            throw CoreValidationError.invalidMetadata("version")
        }

        var staticCode: SecStaticCode?
        var status = SecStaticCodeCreateWithPath(appURL as CFURL, [], &staticCode)
        guard status == errSecSuccess, let staticCode else {
            throw CoreValidationError.invalidSignature(status)
        }

        let requirementText = "anchor apple generic and identifier \"\(expectedBundleID)\" and certificate leaf[subject.OU] = \"\(expectedTeamID)\""
        var requirement: SecRequirement?
        status = SecRequirementCreateWithString(requirementText as CFString, [], &requirement)
        guard status == errSecSuccess, let requirement else {
            throw CoreValidationError.invalidRequirement(status)
        }

        let flags = SecCSFlags(rawValue:
            kSecCSStrictValidate
                | kSecCSCheckAllArchitectures
                | kSecCSCheckNestedCode
        )
        status = SecStaticCodeCheckValidity(staticCode, flags, requirement)
        guard status == errSecSuccess else {
            throw CoreValidationError.invalidSignature(status)
        }

        var signingInfo: CFDictionary?
        status = SecCodeCopySigningInformation(
            staticCode,
            SecCSFlags(rawValue: kSecCSSigningInformation),
            &signingInfo
        )
        guard
            status == errSecSuccess,
            let info = signingInfo as? [String: Any],
            let unique = info[kSecCodeInfoUnique as String] as? Data
        else {
            throw CoreValidationError.invalidSignature(status)
        }

        let cdHash = unique.map { String(format: "%02x", $0) }.joined()
        guard
            let expectedCDHash = expectedCDHashesByArchitecture[currentArchitecture],
            !expectedCDHash.isEmpty
        else {
            throw CoreValidationError.invalidMetadata(
                "unsupported host architecture: \(currentArchitecture)"
            )
        }
        guard cdHash == expectedCDHash else {
            throw CoreValidationError.unexpectedCDHash(cdHash)
        }
    }

    private static func validateArchitecture(executableURL: URL) throws {
        let requiredArchitecture = currentArchitecture

        let outputPipe = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/lipo")
        process.arguments = ["-archs", executableURL.path]
        process.standardOutput = outputPipe
        process.standardError = outputPipe

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            throw CoreValidationError.invalidMetadata("Mach-O architecture")
        }

        let output = String(
            data: outputPipe.fileHandleForReading.readDataToEndOfFile(),
            encoding: .utf8
        )?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let architectures = Set(output.split(whereSeparator: \.isWhitespace).map(String.init))
        guard process.terminationStatus == 0, architectures.contains(requiredArchitecture) else {
            throw CoreValidationError.unsupportedArchitecture(
                required: requiredArchitecture,
                found: output.isEmpty ? "unknown" : output
            )
        }
    }
}
