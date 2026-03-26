import Foundation
import Capacitor

@objc(ICloudSyncPlugin)
public class ICloudSyncPlugin: CAPPlugin {

    private let containerID = "iCloud.com.jacobsen.portfoliopro"
    private let fileName = "CatalystCash_CloudSync.json"
    private let archivePrefix = "CatalystCash_CloudSync_"
    private let archiveRetentionCount = 4

    private static let archiveDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
        return formatter
    }()

    private func documentsDirectoryURL() throws -> URL {
        guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: self.containerID) else {
            throw NSError(domain: "ICloudSyncPlugin", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "iCloud is not available. Make sure iCloud Drive is enabled in Settings."
            ])
        }
        let documentsURL = containerURL.appendingPathComponent("Documents", isDirectory: true)
        if !FileManager.default.fileExists(atPath: documentsURL.path) {
            try FileManager.default.createDirectory(at: documentsURL, withIntermediateDirectories: true, attributes: nil)
        }
        return documentsURL
    }

    private func archiveFileURL(in documentsURL: URL, date: Date) -> URL {
        let stamp = Self.archiveDateFormatter.string(from: date)
        return documentsURL.appendingPathComponent("\(archivePrefix)\(stamp).json")
    }

    private func archivedBackupURLs(in documentsURL: URL) -> [URL] {
        let contents = (try? FileManager.default.contentsOfDirectory(
            at: documentsURL,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        )) ?? []

        return contents
            .filter { url in
                let name = url.lastPathComponent
                return name.hasPrefix(archivePrefix) && name.hasSuffix(".json")
            }
            .sorted { lhs, rhs in
                let leftDate = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                let rightDate = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                return leftDate > rightDate
            }
    }

    private func archiveExistingBackupIfNeeded(primaryURL: URL, documentsURL: URL) throws {
        guard FileManager.default.fileExists(atPath: primaryURL.path) else { return }

        let attrs = try? FileManager.default.attributesOfItem(atPath: primaryURL.path)
        let modifiedAt = (attrs?[.modificationDate] as? Date) ?? Date()
        let archiveURL = archiveFileURL(in: documentsURL, date: modifiedAt)

        if FileManager.default.fileExists(atPath: archiveURL.path) {
            try? FileManager.default.removeItem(at: archiveURL)
        }
        try FileManager.default.copyItem(at: primaryURL, to: archiveURL)
        try pruneArchivedBackups(in: documentsURL)
    }

    private func pruneArchivedBackups(in documentsURL: URL) throws {
        let archives = archivedBackupURLs(in: documentsURL)
        guard archives.count > archiveRetentionCount else { return }
        for archiveURL in archives.dropFirst(archiveRetentionCount) {
            try? FileManager.default.removeItem(at: archiveURL)
        }
    }

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

            do {
                let documentsURL = try self.documentsDirectoryURL()
                let fileURL = documentsURL.appendingPathComponent(self.fileName)
                try? self.archiveExistingBackupIfNeeded(primaryURL: fileURL, documentsURL: documentsURL)
                try data.write(to: fileURL, atomically: true, encoding: .utf8)
                let verification = try String(contentsOf: fileURL, encoding: .utf8)

                DispatchQueue.main.async {
                    call.resolve([
                        "success": verification == data,
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

            guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: self.containerID) else {
                DispatchQueue.main.async {
                    call.resolve(["data": NSNull(), "reason": "iCloud not available"])
                }
                return
            }

            let documentsURL = containerURL.appendingPathComponent("Documents", isDirectory: true)
            let primaryURL = documentsURL.appendingPathComponent(self.fileName)
            let candidateURLs = [primaryURL] + self.archivedBackupURLs(in: documentsURL)

            for candidateURL in candidateURLs {
                if FileManager.default.fileExists(atPath: candidateURL.path) {
                    do {
                        let content = try String(contentsOf: candidateURL, encoding: .utf8)
                        DispatchQueue.main.async {
                            call.resolve(["data": content, "reason": "ok", "path": candidateURL.path])
                        }
                        return
                    } catch {
                        continue
                    }
                }
            }

            // Check if the primary file exists in iCloud but is not local yet.
            do {
                try FileManager.default.startDownloadingUbiquitousItem(at: primaryURL)
                DispatchQueue.main.async {
                    call.resolve(["data": NSNull(), "reason": "downloading"])
                }
            } catch {
                DispatchQueue.main.async {
                    call.resolve(["data": NSNull(), "reason": "no backup found"])
                }
            }
        }
    }
}
