import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { encrypt, decrypt, isEncrypted } from "./crypto.js";

// ═══════════════════════════════════════════════════════════════
// GOOGLE DRIVE (App Data Folder) SYNC
// ═══════════════════════════════════════════════════════════════

const FILE_NAME = "CatalystCash_CloudSync.json";

export async function uploadToGoogleDrive(accessToken, payload, passphrase = null) {
    if (!accessToken) return false;
    try {
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${FILE_NAME}'`, {
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
            // PATCH: do NOT include 'parents' — Google Drive rejects it with a 400 fieldViolation
            const fileId = searchData.files[0].id;
            const patchMeta = { name: FILE_NAME, mimeType: 'application/json' };
            form.append('metadata', new Blob([JSON.stringify(patchMeta)], { type: 'application/json' }));
            uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
            method = 'PATCH';
        } else {
            // POST (create): include 'parents' to place in appDataFolder
            const createMeta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
            form.append('metadata', new Blob([JSON.stringify(createMeta)], { type: 'application/json' }));
        }
        form.append('file', new Blob([fileContent], { type: 'application/json' }));

        const uploadRes = await fetch(uploadUrl, {
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
        if (e?.message === "DRIVE_AUTH_EXPIRED" || e?.message === "DRIVE_API_DISABLED") throw e; // re-throw so caller can trigger UI
        return false;
    }
}

export async function downloadFromGoogleDrive(accessToken, passphrase = null) {
    if (!accessToken) return null;
    try {
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${FILE_NAME}'`, {
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
        const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
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
// ICLOUD (Filesystem / Documents) SYNC
// iOS automatically syncs the app's Documents directory to the
// user's iCloud Drive when "Catalyst Cash" is enabled under
// iOS Settings → [Apple ID] → iCloud → Apps Using iCloud.
// No extra entitlements or CloudKit code is needed beyond the
// standard Capacitor Filesystem plugin.
// ═══════════════════════════════════════════════════════════════

export async function uploadToICloud(payload, passphrase = null) {
    if (Capacitor.getPlatform() !== 'ios') return false;
    try {
        let data = JSON.stringify(payload);
        if (passphrase) {
            const envelope = await encrypt(data, passphrase);
            data = JSON.stringify(envelope);
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
    if (Capacitor.getPlatform() !== 'ios') return null;
    try {
        const result = await Filesystem.readFile({
            path: FILE_NAME,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
        });

        const data = JSON.parse(result.data);
        if (isEncrypted(data)) {
            if (!passphrase) throw new Error("iCloud data is encrypted — passphrase required");
            const decrypted = await decrypt(data, passphrase);
            return JSON.parse(decrypted);
        }
        return data;
    } catch (e) {
        // File likely doesn't exist yet — not an error
        return null;
    }
}
