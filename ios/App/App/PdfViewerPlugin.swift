import Foundation
import Capacitor
import QuickLook
import UIKit

@objc(PdfViewerPlugin)
public class PdfViewerPlugin: CAPPlugin, CAPBridgedPlugin, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    public let identifier = "PdfViewer"
    public let jsName = "PdfViewer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private var previewFileURL: URL?
    private var downloadedFileURL: URL?

    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        configuration.waitsForConnectivity = true
        return URLSession(configuration: configuration)
    }()

    @objc func open(_ call: CAPPluginCall) {
        guard let rawURL = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines), !rawURL.isEmpty else {
            call.reject("Missing PDF URL")
            return
        }

        guard let url = normalizedURL(from: rawURL) else {
            call.reject("Invalid PDF URL")
            return
        }

        if url.isFileURL {
            guard FileManager.default.fileExists(atPath: url.path) else {
                call.reject("PDF file does not exist")
                return
            }

            presentPreview(for: url, call: call)
            return
        }

        guard url.scheme?.lowercased() == "https" else {
            call.reject("Only HTTPS PDF URLs are allowed")
            return
        }

        downloadAndPresentRemotePDF(from: url, call: call)
    }

    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return previewFileURL == nil ? 0 : 1
    }

    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        guard index == 0, let previewFileURL else {
            return URL(fileURLWithPath: "/dev/null") as NSURL
        }

        return previewFileURL as NSURL
    }

    public func previewControllerDidDismiss(_ controller: QLPreviewController) {
        previewFileURL = nil
        cleanupDownloadedFileIfNeeded()
    }

    private func normalizedURL(from rawURL: String) -> URL? {
        if rawURL.hasPrefix("/") {
            return URL(fileURLWithPath: rawURL)
        }

        if let parsed = URL(string: rawURL), parsed.scheme != nil {
            return parsed
        }

        return nil
    }

    private func downloadAndPresentRemotePDF(from remoteURL: URL, call: CAPPluginCall) {
        let request = URLRequest(url: remoteURL, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 30)
        let task = session.downloadTask(with: request) { [weak self] temporaryURL, response, error in
            guard let self else {
                DispatchQueue.main.async {
                    call.reject("PDF viewer is unavailable")
                }
                return
            }

            if let error {
                DispatchQueue.main.async {
                    call.reject("Failed to download PDF", nil, error)
                }
                return
            }

            guard let temporaryURL else {
                DispatchQueue.main.async {
                    call.reject("Failed to download PDF")
                }
                return
            }

            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                DispatchQueue.main.async {
                    call.reject("PDF download failed with HTTP status \(httpResponse.statusCode)")
                }
                return
            }

            let destinationURL = makeDownloadDestinationURL(from: remoteURL, suggestedFilename: response?.suggestedFilename)

            do {
                if FileManager.default.fileExists(atPath: destinationURL.path) {
                    try FileManager.default.removeItem(at: destinationURL)
                }

                try FileManager.default.moveItem(at: temporaryURL, to: destinationURL)

                DispatchQueue.main.async { [weak self] in
                    guard let self else {
                        call.reject("PDF viewer is unavailable")
                        return
                    }

                    self.downloadedFileURL = destinationURL
                    self.presentPreview(for: destinationURL, call: call)
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Failed to prepare PDF for preview", nil, error)
                }
            }
        }

        task.resume()
    }

    private func presentPreview(for fileURL: URL, call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("PDF viewer is unavailable")
                return
            }

            guard let rootViewController = self.bridge?.viewController else {
                call.reject("Unable to present PDF viewer")
                return
            }

            let presentingViewController = topViewController(from: rootViewController)
            let previewController = QLPreviewController()
            previewController.dataSource = self
            previewController.delegate = self
            self.previewFileURL = fileURL

            presentingViewController.present(previewController, animated: true) {
                call.resolve()
            }
        }
    }

    private func topViewController(from root: UIViewController) -> UIViewController {
        var topController = root
        while let presented = topController.presentedViewController {
            topController = presented
        }

        return topController
    }

    private func makeDownloadDestinationURL(from sourceURL: URL, suggestedFilename: String?) -> URL {
        let filenameFromResponse = suggestedFilename?.trimmingCharacters(in: .whitespacesAndNewlines)
        let baseFilename: String

        if let filenameFromResponse, !filenameFromResponse.isEmpty {
            baseFilename = filenameFromResponse
        } else if !sourceURL.lastPathComponent.isEmpty {
            baseFilename = sourceURL.lastPathComponent
        } else {
            baseFilename = "document.pdf"
        }

        let sanitizedFilename = baseFilename.replacingOccurrences(of: "/", with: "_")
        let finalFilename: String

        if (sanitizedFilename as NSString).pathExtension.lowercased() == "pdf" {
            finalFilename = sanitizedFilename
        } else {
            finalFilename = "\(sanitizedFilename).pdf"
        }

        let uniqueName = "catalyst-cash-\(UUID().uuidString)-\(finalFilename)"
        return FileManager.default.temporaryDirectory.appendingPathComponent(uniqueName, isDirectory: false)
    }

    private func cleanupDownloadedFileIfNeeded() {
        guard let downloadedFileURL else {
            return
        }

        self.downloadedFileURL = nil
        try? FileManager.default.removeItem(at: downloadedFileURL)
    }
}
