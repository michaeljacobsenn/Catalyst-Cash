import AVFoundation
import CoreImage

guard CommandLine.arguments.count == 3 else {
    print("Usage: extract_frames <input.mov> <output_dir>")
    exit(1)
}

let inputUrl = URL(fileURLWithPath: CommandLine.arguments[1])
let outputDir = URL(fileURLWithPath: CommandLine.arguments[2])

let asset = AVAsset(url: inputUrl)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

let duration = asset.duration.seconds
// Extract 8 frames evenly spaced
for i in 0..<8 {
    let time = CMTime(seconds: duration * Double(i) / 7.0, preferredTimescale: 600)
    do {
        let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
        let ciImage = CIImage(cgImage: cgImage)
        let context = CIContext()
        guard let colorSpace = cgImage.colorSpace else { continue }
        let outputUrl = outputDir.appendingPathComponent(String(format: "frame_%02d.jpg", i))
        try context.writeJPEGRepresentation(of: ciImage, to: outputUrl, colorSpace: colorSpace)
        print("Saved \(outputUrl.path)")
    } catch {
        print("Error at frame \(i): \(error)")
    }
}
