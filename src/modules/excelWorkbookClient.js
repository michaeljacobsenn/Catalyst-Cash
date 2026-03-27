let workbookWorker = null;
let requestSequence = 0;

function normalizeSheetLookupKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveSheetName(sheetNames, requestedName) {
  const rawName = String(requestedName ?? "").trim();
  if (!rawName) return null;

  const exactMatch = sheetNames.find((sheetName) => sheetName === rawName);
  if (exactMatch) return exactMatch;

  const normalizedName = normalizeSheetLookupKey(rawName);
  if (!normalizedName) return null;

  const normalizedExactMatch = sheetNames.find((sheetName) => normalizeSheetLookupKey(sheetName) === normalizedName);
  if (normalizedExactMatch) return normalizedExactMatch;

  return sheetNames.find((sheetName) => normalizeSheetLookupKey(sheetName).includes(normalizedName)) || null;
}

function resetWorkbookWorker() {
  if (workbookWorker && typeof workbookWorker.terminate === "function") {
    workbookWorker.terminate();
  }
  workbookWorker = null;
}

function hydrateWorkbookRowsResult(payload) {
  if (payload && typeof payload.getSheetRows === "function") {
    return payload;
  }

  const sheetNames = Array.isArray(payload?.sheetNames) ? payload.sheetNames : [];
  const sheets = payload?.sheets && typeof payload.sheets === "object" ? payload.sheets : {};

  return {
    sheetNames,
    getSheetRows(sheetName) {
      const resolvedName = resolveSheetName(sheetNames, sheetName);
      return resolvedName ? sheets[resolvedName] || null : null;
    },
  };
}

function canUseWorkbookWorker() {
  return typeof Worker !== "undefined";
}

function getWorkbookWorker() {
  if (!canUseWorkbookWorker()) return null;
  if (!workbookWorker) {
    try {
      workbookWorker = new Worker(new URL("./excelWorkbook.worker.js", import.meta.url), { type: "module" });
    } catch {
      workbookWorker = null;
    }
  }
  return workbookWorker;
}

async function loadWorkbookModule() {
  return import("./excelWorkbook.js");
}

function postWorkerRequest(action, payload, transfer = []) {
  const worker = getWorkbookWorker();
  if (!worker) return null;

  return new Promise((resolve, reject) => {
    const id = `workbook-${Date.now()}-${++requestSequence}`;

    const cleanup = () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };

    const handleMessage = (event) => {
      if (event.data?.id !== id) return;
      cleanup();

      if (event.data?.error?.message) {
        reject(new Error(event.data.error.message));
        return;
      }

      resolve(event.data?.result);
    };

    const handleError = (event) => {
      cleanup();
      resetWorkbookWorker();
      reject(event instanceof Error ? event : new Error(event?.message || "Workbook worker crashed."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);

    try {
      worker.postMessage({ id, action, payload }, transfer);
    } catch (error) {
      cleanup();
      resetWorkbookWorker();
      reject(error instanceof Error ? error : new Error("Workbook worker request failed."));
    }
  });
}

export async function loadWorkbookRows(buffer) {
  const transferredBuffer = buffer instanceof ArrayBuffer ? buffer.slice(0) : buffer;
  const workerResult = postWorkerRequest(
    "loadWorkbookRows",
    { buffer: transferredBuffer },
    transferredBuffer instanceof ArrayBuffer ? [transferredBuffer] : []
  );

  if (workerResult) {
    try {
      return hydrateWorkbookRowsResult(await workerResult);
    } catch {
      resetWorkbookWorker();
    }
  }

  const module = await loadWorkbookModule();
  return hydrateWorkbookRowsResult(await module.loadWorkbookRows(buffer));
}

export async function createWorkbookBuffer(options) {
  const workerResult = postWorkerRequest("createWorkbookBuffer", { options });
  if (workerResult) {
    try {
      return await workerResult;
    } catch {
      resetWorkbookWorker();
    }
  }

  const module = await loadWorkbookModule();
  return module.createWorkbookBuffer(options);
}
