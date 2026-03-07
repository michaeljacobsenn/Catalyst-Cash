import Foundation
import Capacitor

@objc(ICloudSyncPlugin)
public class ICloudSyncPlugin: CAPPlugin {

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

            let url = FileManager.default.url(forUbiquityContainerIdentifier: nil)
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

            guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
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

            do {
                try data.write(to: fileURL, atomically: true, encoding: .utf8)
                DispatchQueue.main.async {
                    call.resolve([
                        "success": true,
                        "path": fileURL.path
                    ])
                }
            } catch {
                DispatchQueue.main.async {
                    call.reject("Failed to write iCloud backup: \(error.localizedDescription)")
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

            guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
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

            do {
                let content = try String(contentsOf: fileURL, encoding: .utf8)
                DispatchQueue.main.async {
                    call.resolve(["data": content, "reason": "ok"])
                }
            } catch {
                DispatchQueue.main.async {
                    call.resolve(["data": NSNull(), "reason": "read error: \(error.localizedDescription)"])
                }
            }
        }
    }
}
