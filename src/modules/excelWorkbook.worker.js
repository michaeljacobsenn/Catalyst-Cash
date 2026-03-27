import { createWorkbookBuffer, loadWorkbookRows } from "./excelWorkbook.js";

self.onmessage = async (event) => {
  const { id, action, payload } = event.data || {};

  try {
    if (!id || !action) {
      throw new Error("Invalid workbook worker request.");
    }

    if (action === "loadWorkbookRows") {
      const workbook = await loadWorkbookRows(payload?.buffer);
      const result = {
        sheetNames: Array.isArray(workbook?.sheetNames) ? workbook.sheetNames : [],
        sheets: Object.fromEntries(
          (Array.isArray(workbook?.sheetNames) ? workbook.sheetNames : []).map((sheetName) => [
            sheetName,
            workbook.getSheetRows(sheetName) || null,
          ])
        ),
      };
      self.postMessage({ id, result });
      return;
    }

    if (action === "createWorkbookBuffer") {
      const result = await createWorkbookBuffer(payload?.options || {});
      if (result instanceof ArrayBuffer) {
        self.postMessage({ id, result }, [result]);
        return;
      }
      self.postMessage({ id, result });
      return;
    }

    throw new Error(`Unsupported workbook worker action: ${action}`);
  } catch (error) {
    self.postMessage({
      id,
      error: {
        message: String(error?.message || error || "Workbook worker failed."),
      },
    });
  }
};
