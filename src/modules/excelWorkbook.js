const loadExcelJs = () => import("exceljs");

function getWorkbookCtor(module) {
  return module?.Workbook || module?.default?.Workbook || module?.default;
}

function normalizeCellValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || "").join("");
    }
    if (Object.prototype.hasOwnProperty.call(value, "result")) {
      return normalizeCellValue(value.result);
    }
    if (typeof value.text === "string") {
      return value.text;
    }
    if (typeof value.hyperlink === "string") {
      return value.hyperlink;
    }
  }
  return value;
}

function worksheetToRows(worksheet) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const normalized = values.map(normalizeCellValue);
    while (normalized.length > 0 && String(normalized[normalized.length - 1] ?? "").trim() === "") {
      normalized.pop();
    }
    rows.push(normalized);
  });
  return rows;
}

export async function loadWorkbookRows(buffer) {
  const module = await loadExcelJs();
  const Workbook = getWorkbookCtor(module);
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer);

  return {
    sheetNames: workbook.worksheets.map((worksheet) => worksheet.name),
    getSheetRows(sheetName) {
      const worksheet = workbook.worksheets.find((entry) => entry.name.includes(sheetName));
      return worksheet ? worksheetToRows(worksheet) : null;
    },
  };
}

export async function createWorkbookBuffer({ title, author = "Catalyst Cash", company = "Catalyst Cash", sheets }) {
  const module = await loadExcelJs();
  const Workbook = getWorkbookCtor(module);
  const workbook = new Workbook();

  workbook.creator = author;
  workbook.company = company;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = title;

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
    if (Array.isArray(sheet.widths) && sheet.widths.length > 0) {
      worksheet.columns = sheet.widths.map((width) => ({ width }));
    }
  }

  return workbook.xlsx.writeBuffer();
}
