// Renders the Scout.app icon from the colour favicon: swift make-icon.swift <favicon.svg> <out-1024.png>
// then resize it into Scout.iconset/icon_<n>x<n>[@2x].png (sips -z) and run: iconutil -c icns Scout.iconset -o Scout.icns
import AppKit
let args = CommandLine.arguments
let svg = NSImage(contentsOf: URL(fileURLWithPath: args[1]))!
let size = 1024.0
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
// macOS icon grid: 824 px rounded square centred on a 1024 canvas.
let tile = NSRect(x: 100, y: 100, width: 824, height: 824)
NSColor(srgbRed: 0x33/255, green: 0x26/255, blue: 0x19/255, alpha: 1).setFill()
NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185).fill()
let art = 600.0
svg.draw(in: NSRect(x: (size - art) / 2, y: (size - art) / 2 - 10, width: art, height: art))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
