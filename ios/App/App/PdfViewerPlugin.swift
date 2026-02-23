import Foundation
import Capacitor
import QuickLook

@objc(PdfViewerPlugin)
public class PdfViewerPlugin: CAPPlugin, CAPBridgedPlugin, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    public let identifier = "PdfViewer"
    public let jsName = "PdfViewer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private var fileUrl: URL?

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("Invalid URL"); return
        }
        fileUrl = url
        DispatchQueue.main.async {
            let preview = QLPreviewController()
            preview.dataSource = self
            preview.delegate = self
            self.bridge?.viewController?.present(preview, animated: true)
            call.resolve()
        }
    }

    public func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return fileUrl == nil ? 0 : 1
    }

    public func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return fileUrl! as NSURL
    }
}
