// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "PS2Emulator",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "PS2Emulator", targets: ["PS2Emulator"])
    ],
    targets: [
        .executableTarget(
            name: "PS2Emulator",
            path: "Sources/PS2Emulator"
        ),
        .testTarget(
            name: "PS2EmulatorTests",
            dependencies: ["PS2Emulator"],
            path: "Tests/PS2EmulatorTests"
        )
    ],
    swiftLanguageVersions: [.v5]
)
