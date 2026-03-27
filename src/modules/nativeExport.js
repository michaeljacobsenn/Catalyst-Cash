import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import { log } from "./logger.js";

const ExportFile = registerPlugin("ExportFile");
const exportRequests = new Map();
const EXPORT_ERROR_MESSAGES = {
  nativeUnavailable: "Export is unavailable in this build. Rebuild the iPhone app and try again.",
};
const BASE64_CHUNK_SIZE = 0x8000;

function isUnimplementedPluginError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error || "").toLowerCase();
  return code === "UNIMPLEMENTED" || message.includes("unimplemented") || message.includes("not implemented");
}

function decodeBase64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function isBinaryContent(content) {
  return content instanceof ArrayBuffer || ArrayBuffer.isView(content);
}

function toUint8Array(content) {
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  return null;
}

function encodeBinaryToBase64(content) {
  const bytes = toUint8Array(content);
  if (!bytes) return String(content ?? "");

  let binary = "";
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(index, index + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

function createExportBlob(content, mimeType, isBase64) {
  if (isBase64) return decodeBase64ToBlob(content, mimeType);
  if (isBinaryContent(content)) return new Blob([content], { type: mimeType });
  return new Blob([content], { type: mimeType });
}

function normalizeNativeExportPayload(content, isBase64) {
  if (isBase64 || !isBinaryContent(content)) {
    return { content, isBase64 };
  }

  return {
    content: encodeBinaryToBase64(content),
    isBase64: true,
  };
}

async function triggerBrowserDownload(filename, content, mimeType, isBase64 = false) {
  const blob = createExportBlob(content, mimeType, isBase64);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { completed: true, source: "browser" };
}

async function writeNativeExportFile(filename, content, isBase64 = false) {
  const exportPath = `exports/${Date.now()}-${filename}`;
  const options = {
    path: exportPath,
    data: content,
    directory: Directory.Cache,
    recursive: true,
  };
  if (!isBase64) options.encoding = "utf8";
  const result = await Filesystem.writeFile(options);
  return {
    path: exportPath,
    uri: result?.uri || null,
  };
}

async function cleanupNativeExportFile(path) {
  if (!path) return;
  try {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Cache,
    });
  } catch {
    // Best-effort cleanup only.
  }
}

function isUserCancelledShare(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("cancel") || message.includes("user interaction");
}

export async function nativeExport(filename, content, mimeType = "text/plain", isBase64 = false) {
  if (exportRequests.has(filename)) {
    return await exportRequests.get(filename);
  }

  const request = (async () => {
    if (Capacitor.isNativePlatform()) {
      const nativePayload = normalizeNativeExportPayload(content, isBase64);
      let preparedFile = null;
      try {
        preparedFile = await writeNativeExportFile(filename, nativePayload.content, nativePayload.isBase64);
        if (!preparedFile?.uri) {
          throw new Error("Native export file could not be created.");
        }
        await Share.share({
          title: filename,
          text: filename,
          dialogTitle: "Export File",
          files: [preparedFile.uri],
        });
        return { completed: true, source: "capacitor", path: preparedFile.uri };
      } catch (error) {
        const isCancel = isUserCancelledShare(error);
        if (isCancel) {
          return { completed: false, source: "native" };
        }
        void log.error("export", "Native export failed", { error });
        try {
          const pluginResult = await ExportFile.share({
            filename,
            data: nativePayload.content,
            mimeType,
            isBase64: nativePayload.isBase64,
          });
          if (pluginResult?.completed === false) {
            return { completed: false, source: "native" };
          }
          return pluginResult ?? { completed: true, source: "native-plugin" };
        } catch (fallbackError) {
          void log.error("export", "Capacitor export fallback failed", { error: fallbackError });
          const isFallbackCancel = isUserCancelledShare(fallbackError);
          if (isFallbackCancel) {
            return { completed: false, source: "native" };
          }
          const nativeUnavailable = isUnimplementedPluginError(error) || isUnimplementedPluginError(fallbackError);
          if (nativeUnavailable && Capacitor.getPlatform() === "ios") {
            const exportError = new Error(EXPORT_ERROR_MESSAGES.nativeUnavailable);
            if (window.toast?.error) window.toast.error(exportError.message);
            throw exportError;
          }
          if (nativeUnavailable) {
            if (window.toast?.info) window.toast.info(EXPORT_ERROR_MESSAGES.nativeUnavailable);
            return await triggerBrowserDownload(filename, content, mimeType, isBase64);
          }
          if (window.toast?.error) window.toast.error("Export failed. Please check permissions.");
          throw fallbackError;
        }
      } finally {
        if (preparedFile?.path) {
          setTimeout(() => {
            void cleanupNativeExportFile(preparedFile.path);
          }, 60_000);
        }
      }
    }

    return await triggerBrowserDownload(filename, content, mimeType, isBase64);
  })().finally(() => {
    exportRequests.delete(filename);
  });

  exportRequests.set(filename, request);
  return await request;
}
