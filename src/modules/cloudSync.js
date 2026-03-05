import { Capacitor } from "@capacitor/core";
import { registerPlugin } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { encrypt, decrypt, isEncrypted } from "./crypto.js";
import { fetchWithRetry } from "./fetchWithRetry.js";

// ═══════════════════════════════════════════════════════════════
// NATIVE iCLOUD SYNC PLUGIN
// Uses the iCloud ubiquity container for true cross-device backup.
// Falls back to Capacitor Filesystem on non-native platforms.
// ═══════════════════════════════════════════════════════════════

const ICloudSync = Capacitor.isNativePlatform()
    ? registerPlugin("ICloudSync")
    : null;

// ═══════════════════════════════════════════════════════════════
// GOOGLE DRIVE (App Data Folder) SYNC
// ═══════════════════════════════════════════════════════════════

const FILE_NAME = "CatalystCash_CloudSync.json";

export async function uploadToGoogleDrive(accessToken, payload, passphrase = null) {
    if (!accessToken) return false;
    try {
        const searchRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${FILE_NAME}'`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!searchRes.ok) {
            const errBody = await searchRes.text().catch(() => "");
            if (searchRes.status === 401) throw new Error("DRIVE_AUTH_EXPIRED");
            if (searchRes.status === 403) throw new Error("DRIVE_API_DISABLED");
            throw new Error(`Drive search failed (${searchRes.status}): ${errBody}`);
        }
        const searchData = await searchRes.json();

        let fileContent = JSON.stringify(payload);
        if (passphrase) {
            const envelope = await encrypt(fileContent, passphrase);
            fileContent = JSON.stringify(envelope);
        }

        const form = new FormData();
        let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let method = 'POST';

        if (searchData.files && searchData.files.length > 0) {
            const fileId = searchData.files[0].id;
            const patchMeta = { name: FILE_NAME, mimeType: 'application/json' };
            form.append('metadata', new Blob([JSON.stringify(patchMeta)], { type: 'application/json' }));
            uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
            method = 'PATCH';
        } else {
            const createMeta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
            form.append('metadata', new Blob([JSON.stringify(createMeta)], { type: 'application/json' }));
        }
        form.append('file', new Blob([fileContent], { type: 'application/json' }));

        const uploadRes = await fetchWithRetry(uploadUrl, {
            method,
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: form
        });

        if (!uploadRes.ok) {
            const errBody = await uploadRes.text().catch(() => "");
            if (uploadRes.status === 401) throw new Error("DRIVE_AUTH_EXPIRED");
            if (uploadRes.status === 403) throw new Error("DRIVE_API_DISABLED");
            throw new Error(`Drive upload failed (${uploadRes.status}): ${errBody}`);
        }
        return true;
    } catch (e) {
        console.error("Google Drive Sync Error:", e?.message || e);
        if (e?.message === "DRIVE_AUTH_EXPIRED" || e?.message === "DRIVE_API_DISABLED") throw e;
        return false;
    }
}

export async function downloadFromGoogleDrive(accessToken, passphrase = null) {
    if (!accessToken) return null;
    try {
        const searchRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${FILE_NAME}'`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!searchRes.ok) {
            const errBody = await searchRes.text().catch(() => "");
            if (searchRes.status === 401) throw new Error("DRIVE_AUTH_EXPIRED");
            if (searchRes.status === 403) throw new Error("DRIVE_API_DISABLED");
            throw new Error(`Drive search failed (${searchRes.status}): ${errBody}`);
        }
        const searchData = await searchRes.json();

        if (!searchData.files || searchData.files.length === 0) return null;

        const fileId = searchData.files[0].id;
        const dlRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!dlRes.ok) {
            if (dlRes.status === 401) throw new Error("DRIVE_AUTH_EXPIRED");
            if (dlRes.status === 403) throw new Error("DRIVE_API_DISABLED");
            throw new Error(`Google Drive download failed (${dlRes.status})`);
        }
        const data = await dlRes.json();

        if (isEncrypted(data)) {
            if (!passphrase) throw new Error("Cloud data is encrypted — passphrase required");
            const decrypted = await decrypt(data, passphrase);
            return JSON.parse(decrypted);
        }
        return data;
    } catch (e) {
        console.error("Google Drive Download Error:", e?.message || e);
        if (e?.message === "DRIVE_AUTH_EXPIRED" || e?.message === "DRIVE_API_DISABLED") throw e;
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// iCLOUD SYNC — Native ubiquity container (cross-device)
//
// On iOS: Uses the native ICloudSyncPlugin which writes to the
// real iCloud ubiquity container. Survives app deletion,
// restores on new devices with the same Apple ID.
//
// On Web: Falls back to Capacitor Filesystem (local only).
// ═══════════════════════════════════════════════════════════════

/**
 * Check if iCloud is available on this device.
 * @returns {Promise<{ available: boolean, reason: string }>}
 */
export async function isICloudAvailable() {
    if (!ICloudSync) return { available: false, reason: "not native" };
    try {
        return await ICloudSync.isAvailable();
    } catch (e) {
        return { available: false, reason: e?.message || "unknown error" };
    }
}

export async function uploadToICloud(payload, passphrase = null) {
    try {
        let data = JSON.stringify(payload);
        if (passphrase) {
            const envelope = await encrypt(data, passphrase);
            data = JSON.stringify(envelope);
        }

        // Native iOS — use ubiquity container
        if (ICloudSync) {
            const result = await ICloudSync.save({ data });
            if (result?.success) {
                console.log("[iCloud] Backup saved to ubiquity container:", result.path);
                return true;
            }
            console.warn("[iCloud] Save returned without success:", result);
            return false;
        }

        // Web fallback — local Capacitor Filesystem
        if (Capacitor.getPlatform() !== 'ios') {
            console.warn("iCloud sync is only available on iOS. Using local fallback.");
        }
        await Filesystem.writeFile({
            path: FILE_NAME,
            data,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
        });
        return true;
    } catch (e) {
        console.error("iCloud Sync Write Error:", e);
        return false;
    }
}

export async function downloadFromICloud(passphrase = null) {
    try {
        let rawData;

        // Native iOS — use ubiquity container
        if (ICloudSync) {
            const result = await ICloudSync.restore();

            if (result?.reason === "downloading") {
                // File exists in iCloud but is still downloading to device
                // Wait 2 seconds and retry once
                console.log("[iCloud] Backup is downloading from iCloud, retrying in 2s...");
                await new Promise(r => setTimeout(r, 2000));
                const retry = await ICloudSync.restore();
                if (!retry?.data) {
                    console.log("[iCloud] Backup still downloading. Will restore on next app launch.");
                    return null;
                }
                rawData = retry.data;
            } else if (!result?.data) {
                console.log("[iCloud] No backup found:", result?.reason);
                return null;
            } else {
                rawData = result.data;
            }
        } else {
            // Web fallback
            try {
                const result = await Filesystem.readFile({
                    path: FILE_NAME,
                    directory: Directory.Documents,
                    encoding: Encoding.UTF8,
                });
                rawData = result.data;
            } catch (e) {
                const msg = e?.message || String(e);
                if (msg.includes("not exist") || msg.includes("ENOENT") || msg.includes("NOT_FOUND")) {
                    return null;
                }
                console.error("iCloud Sync Read Error:", e);
                return null;
            }
        }

        // Parse the data
        let data;
        try {
            data = JSON.parse(rawData);
        } catch (e) {
            console.error("iCloud Sync Parse Error: Backup contains invalid JSON.", e);
            return null;
        }

        // Decrypt if needed
        if (isEncrypted(data)) {
            if (!passphrase) throw new Error("iCloud data is encrypted — passphrase required");
            const decrypted = await decrypt(data, passphrase);
            return JSON.parse(decrypted);
        }
        return data;
    } catch (e) {
        console.error("iCloud Sync Error:", e?.message || e);
        return null;
    }
}
