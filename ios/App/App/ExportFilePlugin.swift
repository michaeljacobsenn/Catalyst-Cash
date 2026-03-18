import Foundation
import Capacitor
import UIKit

@objc(ExportFilePlugin)
public class ExportFilePlugin: CAPPlugin {

    private var exportedFileURL: URL?

    @objc func share(_ call: CAPPluginCall) {
        guard let filename = call.getString("filename")?.trimmingCharacters(in: .whitespacesAndNewlines), !filename.isEmpty else {
            call.reject("Missing filename")
            return
        }

        guard let rawData = call.getString("data") else {
            call.reject("Missing export data")
            return
        }

        let isBase64 = call.getBool("isBase64") ?? false

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else {
                DispatchQueue.main.async {
                    call.reject("Export plugin unavailable")
                }
                return
            }

            do {
                let fileURL = try self.writeExportFile(filename: filename, rawData: rawData, isBase64: isBase64)
                DispatchQueue.main.async {
                    self.presentShareSheet(for: fileURL, call: call)
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Failed to prepare export file", nil, error)
                }
            }
        }
    }

    private func writeExportFile(filename: String, rawData: String, isBase64: Bool) throws -> URL {
        let sanitizedFilename = filename.replacingOccurrences(of: "/", with: "-")
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("catalyst-export-\(UUID().uuidString)-\(sanitizedFilename)", isDirectory: false)

        let data: Data
        if isBase64 {
            guard let decoded = Data(base64Encoded: rawData) else {
                throw NSError(domain: "ExportFilePlugin", code: 1001, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 export data"])
            }
            data = decoded
        } else {
            guard let encoded = rawData.data(using: .utf8) else {
                throw NSError(domain: "ExportFilePlugin", code: 1002, userInfo: [NSLocalizedDescriptionKey: "Failed to encode export data"])
            }
            data = encoded
        }

        try data.write(to: fileURL, options: .atomic)
        exportedFileURL = fileURL
        return fileURL
    }

    private func presentShareSheet(for fileURL: URL, call: CAPPluginCall) {
        guard let rootViewController = bridge?.viewController else {
            call.reject("Unable to present export sheet")
            return
        }

        let presentingViewController = topViewController(from: rootViewController)
        let activityController = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)

        if let popover = activityController.popoverPresentationController {
            popover.sourceView = presentingViewController.view
            popover.sourceRect = CGRect(
                x: presentingViewController.view.bounds.midX,
                y: presentingViewController.view.bounds.maxY - 1,
                width: 1,
                height: 1
            )
            popover.permittedArrowDirections = []
        }

        activityController.completionWithItemsHandler = { [weak self] _, completed, _, error in
            if let error {
                call.reject("Export failed", nil, error)
                self?.cleanupExportedFile()
                return
            }

            call.resolve([
                "completed": completed,
                "path": fileURL.path
            ])
            self?.cleanupExportedFile()
        }

        presentingViewController.present(activityController, animated: true)
    }

    private func topViewController(from root: UIViewController) -> UIViewController {
        var topController = root
        while let presented = topController.presentedViewController {
            topController = presented
        }
        return topController
    }

    private func cleanupExportedFile() {
        guard let exportedFileURL else { return }
        self.exportedFileURL = nil
        try? FileManager.default.removeItem(at: exportedFileURL)
    }
}
