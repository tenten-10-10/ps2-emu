#!/usr/bin/env swift

import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("usage: generate-icon.swift <iconset-directory>\n".utf8))
    exit(64)
}

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let variants: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

func color(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(red: red, green: green, blue: blue, alpha: alpha)
}

func makeIcon(size: Int) throws -> CGImage {
    let width = size
    let space = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: width,
        height: width,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { throw NSError(domain: "Icon", code: 1) }

    let s = CGFloat(size)
    context.setAllowsAntialiasing(true)
    context.setShouldAntialias(true)

    let outer = CGRect(x: s * 0.035, y: s * 0.035, width: s * 0.93, height: s * 0.93)
    let outerPath = CGPath(roundedRect: outer, cornerWidth: s * 0.225, cornerHeight: s * 0.225, transform: nil)
    context.addPath(outerPath)
    context.clip()

    let gradient = CGGradient(
        colorsSpace: space,
        colors: [
            color(0.025, 0.05, 0.16),
            color(0.10, 0.25, 0.65),
            color(0.45, 0.16, 0.78)
        ] as CFArray,
        locations: [0, 0.52, 1]
    )!
    context.drawLinearGradient(
        gradient,
        start: CGPoint(x: s * 0.14, y: s * 0.88),
        end: CGPoint(x: s * 0.92, y: s * 0.08),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )

    context.setStrokeColor(color(0.25, 0.88, 1.0, 0.26))
    context.setLineWidth(s * 0.014)
    for inset in [CGFloat(0.13), 0.21, 0.29] {
        let rect = outer.insetBy(dx: s * inset, dy: s * inset)
        context.strokeEllipse(in: rect)
    }

    context.saveGState()
    context.translateBy(x: s * 0.50, y: s * 0.50)
    context.rotate(by: -.pi / 5.4)
    context.setFillColor(color(0.32, 0.82, 1.0, 0.18))
    context.fill(CGRect(x: -s, y: -s * 0.045, width: s * 2, height: s * 0.09))
    context.restoreGState()

    let font = CTFontCreateWithName("SFProRounded-Heavy" as CFString, s * 0.55, nil)
    let attributes: [CFString: Any] = [
        kCTFontAttributeName: font,
        kCTForegroundColorAttributeName: color(1, 1, 1, 0.96)
    ]
    let attributed = CFAttributedStringCreate(nil, "2" as CFString, attributes as CFDictionary)!
    let line = CTLineCreateWithAttributedString(attributed)
    let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
    context.textPosition = CGPoint(
        x: (s - bounds.width) / 2 - bounds.minX,
        y: (s - bounds.height) / 2 - bounds.minY - s * 0.012
    )
    context.setShadow(offset: CGSize(width: 0, height: -s * 0.015), blur: s * 0.035, color: color(0.1, 0.85, 1, 0.65))
    CTLineDraw(line, context)
    context.setShadow(offset: .zero, blur: 0)

    context.resetClip()
    context.addPath(outerPath)
    context.setStrokeColor(color(1, 1, 1, 0.20))
    context.setLineWidth(max(1, s * 0.007))
    context.strokePath()

    guard let image = context.makeImage() else { throw NSError(domain: "Icon", code: 2) }
    return image
}

for (name, size) in variants {
    let url = output.appendingPathComponent(name)
    guard let destination = CGImageDestinationCreateWithURL(
        url as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else { throw NSError(domain: "Icon", code: 3) }
    CGImageDestinationAddImage(destination, try makeIcon(size: size), nil)
    guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "Icon", code: 4) }
}
