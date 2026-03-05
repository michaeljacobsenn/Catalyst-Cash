import Foundation
import Capacitor

@objc(ICloudSyncPlugin)
public class ICloudSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ICloudSync"
    public let jsName = "ICloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise)
    ]

    private let containerID = "iCloud.com.jacobsen.portfoliopro"
    private let fileName = "CatalystCash_CloudSync.json"

    // ─────────────────────────────────────────────────────────
    // isAvailable — Check if iCloud is signed in and reachable
    // ─────────────────────────────────────────────────────────
    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else {
                call.resolve(["available": false, "reason": "plugin deallocated"])
                return
            }

            let url = FileManager.default.url(forUbiquityContainerIdentifier: self.containerID)
            let available = url != nil

            DispatchQueue.main.async {
                call.resolve([
                    "available": available,
                    "reason": available ? "ok" : "iCloud not signed in or container unavailable"
                ])
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    // save — Write JSON data to iCloud ubiquity container
    // ─────────────────────────────────────────────────────────
    @objc func save(_ call: CAPPluginCall) {
        guard let data = call.getString("data"), !data.isEmpty else {
            call.reject("Missing or empty 'data' parameter")
            return
        }

        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else {
                call.reject("Plugin deallocated")
                return
            }

            guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: self.containerID) else {
                DispatchQueue.main.async {
                    call.reject("iCloud is not available. Make sure iCloud Drive is enabled in Settings.")
                }
                return
            }

            let documentsURL = containerURL.appendingPathComponent("Documents", isDirectory: true)

            // Ensure Documents directory exists inside the ubiquity container
            do {
                if !FileManager.default.fileExists(atPath: documentsURL.path) {
                    try FileManager.default.createDirectory(at: documentsURL, withIntermediateDirectories: true, attributes: nil)
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Failed to create iCloud Documents directory: \(error.localizedDescription)")
                }
                return
            }

            let fileURL = documentsURL.appendingPathComponent(self.fileName)

            // Use NSFileCoordinator for safe iCloud writes
            let coordinator = NSFileCoordinator(filePresenter: nil)
            var coordinatorError: NSError?

            coordinator.coordinate(writingItemAt: fileURL, options: .forReplacing, error: &coordinatorError) { writtenURL in
                do {
                    try data.write(to: writtenURL, atomically: true, encoding: .utf8)
                } catch {
                    DispatchQueue.main.async {
                        call.reject("Failed to write iCloud backup: \(error.localizedDescription)")
                    }
                    return
                }

                DispatchQueue.main.async {
                    call.resolve([
                        "success": true,
                        "path": writtenURL.path
                    ])
                }
            }

            if let coordinatorError {
                DispatchQueue.main.async {
                    call.reject("iCloud file coordination failed: \(coordinatorError.localizedDescription)")
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    // restore — Read JSON data from iCloud ubiquity container
    // ─────────────────────────────────────────────────────────
    @objc func restore(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let self else {
                call.reject("Plugin deallocated")
                return
            }

            guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: self.containerID) else {
                DispatchQueue.main.async {
                    call.resolve(["data": NSNull(), "reason": "iCloud not available"])
                }
                return
            }

            let fileURL = containerURL
                .appendingPathComponent("Documents", isDirectory: true)
                .appendingPathComponent(self.fileName)

            // Check if file exists (it may still be downloading from iCloud)
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                // Try to trigger download if file is in iCloud but not local
                do {
                    try FileManager.default.startDownloadingUbiquitousItem(at: fileURL)
                    // File is downloading — tell JS to retry shortly
                    DispatchQueue.main.async {
                        call.resolve(["data": NSNull(), "reason": "downloading"])
                    }
                } catch {
                    DispatchQueue.main.async {
                        call.resolve(["data": NSNull(), "reason": "no backup found"])
                    }
                }
                return
            }

            // Use NSFileCoordinator for safe iCloud reads
            let coordinator = NSFileCoordinator(filePresenter: nil)
            var coordinatorError: NSError?

            coordinator.coordinate(readingItemAt: fileURL, options: [], error: &coordinatorError) { readURL in
                do {
                    let content = try String(contentsOf: readURL, encoding: .utf8)
                    DispatchQueue.main.async {
                        call.resolve(["data": content, "reason": "ok"])
                    }
                } catch {
                    DispatchQueue.main.async {
                        call.resolve(["data": NSNull(), "reason": "read error: \(error.localizedDescription)"])
                    }
                }
            }

            if let coordinatorError {
                DispatchQueue.main.async {
                    call.resolve(["data": NSNull(), "reason": "coordination error: \(coordinatorError.localizedDescription)"])
                }
            }
        }
    }
}
