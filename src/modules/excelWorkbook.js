import { strToU8, unzipSync, zipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

const XML_CONTENT_TYPE = "application/xml";
const SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XLSX_WORKSHEET_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const DAY_MS = 24 * 60 * 60 * 1000;
const TEXT_DECODER = new TextDecoder();
const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});

const BUILTIN_DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

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

function asUint8Array(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  throw new Error("Workbook data must be an ArrayBuffer or Uint8Array.");
}

function asArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function readZipText(entries, path) {
  const entry = entries[path];
  return entry ? TEXT_DECODER.decode(entry) : null;
}

function parseXmlDocument(xml) {
  return XML_PARSER.parse(xml);
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value);
}

function normalizeWorksheetPath(target = "") {
  if (!target) return null;
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("xl/")) return target;
  return `xl/${target.replace(/^\.\//, "")}`;
}

function columnLettersToIndex(reference = "A1") {
  const letters = String(reference).match(/[A-Z]+/i)?.[0] || "A";
  let total = 0;
  for (const char of letters.toUpperCase()) {
    total = total * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, total - 1);
}

function columnIndexToLetters(index) {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result || "A";
}

function cellReference(columnIndex, rowIndex) {
  return `${columnIndexToLetters(columnIndex)}${rowIndex + 1}`;
}

function stripFormattingTokens(formatCode) {
  return String(formatCode || "")
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*]/g, "")
    .replace(/\\./g, "")
    .replace(/_.?/g, "")
    .replace(/\*.?/g, "")
    .toLowerCase();
}

function isDateFormatCode(formatCode) {
  const normalized = stripFormattingTokens(formatCode);
  if (!normalized) return false;
  return /(?:yy|dd|mm|hh|ss|am\/pm|m\/d|d\/m|y-m|m-d)/i.test(normalized);
}

function formatDateOnly(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function excelSerialToDateString(serialNumber, date1904) {
  if (!Number.isFinite(serialNumber)) return "";

  const wholeDays = Math.floor(serialNumber);
  const fractional = serialNumber - wholeDays;
  let utcMs;

  if (date1904) {
    utcMs = Date.UTC(1904, 0, 1) + wholeDays * DAY_MS;
  } else {
    const adjustedDays = wholeDays > 59 ? wholeDays - 1 : wholeDays;
    utcMs = Date.UTC(1899, 11, 31) + adjustedDays * DAY_MS;
  }

  const timeMs = Math.round(fractional * DAY_MS);
  return formatDateOnly(new Date(utcMs + timeMs));
}

function extractText(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object") {
    if (Object.prototype.hasOwnProperty.call(node, "text")) return extractText(node.text);
    if (Object.prototype.hasOwnProperty.call(node, "t")) return extractText(node.t);
    if (Object.prototype.hasOwnProperty.call(node, "r")) {
      return ensureArray(node.r).map((part) => extractText(part?.t ?? part)).join("");
    }
  }
  return "";
}

function normalizeDateText(rawValue) {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : formatDateOnly(parsed);
}

function normalizeStringCell(value) {
  if (value == null) return "";
  if (value instanceof Date) return formatDateOnly(value);
  return String(value);
}

function parseSharedStrings(entries) {
  const xml = readZipText(entries, "xl/sharedStrings.xml");
  if (!xml) return [];

  const document = parseXmlDocument(xml)?.sst;
  return ensureArray(document?.si).map((entry) => extractText(entry));
}

function parseStyles(entries) {
  const xml = readZipText(entries, "xl/styles.xml");
  if (!xml) return [];

  const document = parseXmlDocument(xml)?.styleSheet;
  const customFormatCodes = new Map();

  for (const entry of ensureArray(document?.numFmts?.numFmt)) {
    const formatId = Number.parseInt(entry?.numFmtId ?? "", 10);
    if (!Number.isFinite(formatId)) continue;
    customFormatCodes.set(formatId, extractText(entry?.formatCode));
  }

  return ensureArray(document?.cellXfs?.xf).map((entry) => {
    const formatId = Number.parseInt(entry?.numFmtId ?? "", 10);
    if (!Number.isFinite(formatId)) return false;
    if (BUILTIN_DATE_FORMAT_IDS.has(formatId)) return true;
    return isDateFormatCode(customFormatCodes.get(formatId));
  });
}

function parseWorkbookSheets(entries) {
  const workbookXml = readZipText(entries, "xl/workbook.xml");
  const relsXml = readZipText(entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new Error("Workbook is missing workbook metadata.");
  }

  const workbookDocument = parseXmlDocument(workbookXml)?.workbook;
  const relsDocument = parseXmlDocument(relsXml)?.Relationships;
  const relationships = new Map();

  for (const relationship of ensureArray(relsDocument?.Relationship)) {
    if (relationship?.Type === XLSX_WORKSHEET_REL && relationship?.Id && relationship?.Target) {
      relationships.set(String(relationship.Id), normalizeWorksheetPath(relationship.Target));
    }
  }

  const sheets = ensureArray(workbookDocument?.sheets?.sheet).map((sheet) => ({
    name: String(sheet?.name || ""),
    path: relationships.get(String(sheet?.["r:id"] || "")) || null,
  }));

  const date1904 = workbookDocument?.workbookPr?.date1904 === "1" || workbookDocument?.workbookPr?.date1904 === true;
  return { sheets, date1904 };
}

function parseCellValue(cell, sharedStrings, dateStyleFlags, date1904) {
  const type = String(cell?.t || "");
  const styleIndex = Number.parseInt(cell?.s ?? "", 10);
  const rawValue = cell?.v;

  if (type === "inlineStr") return extractText(cell?.is);
  if (type === "s") {
    const sharedIndex = Number.parseInt(rawValue ?? "", 10);
    return Number.isFinite(sharedIndex) ? sharedStrings[sharedIndex] || "" : "";
  }
  if (type === "b") return String(rawValue) === "1";
  if (type === "d") return normalizeDateText(rawValue);
  if (type === "str") return extractText(rawValue);
  if (type === "e") return extractText(rawValue);
  if (rawValue == null || rawValue === "") return "";

  const numeric = Number(rawValue);
  if (!Number.isNaN(numeric)) {
    if (Number.isInteger(styleIndex) && dateStyleFlags[styleIndex]) {
      return excelSerialToDateString(numeric, date1904);
    }
    return numeric;
  }

  return extractText(rawValue);
}

function worksheetToRows(worksheetXml, sharedStrings, dateStyleFlags, date1904) {
  const document = parseXmlDocument(worksheetXml)?.worksheet;
  const rows = [];
  let currentRowIndex = 1;

  for (const rowNode of ensureArray(document?.sheetData?.row)) {
    const declaredRow = Number.parseInt(rowNode?.r ?? "", 10);
    const rowIndex = Number.isFinite(declaredRow) ? declaredRow : currentRowIndex;

    while (currentRowIndex < rowIndex) {
      rows.push([]);
      currentRowIndex += 1;
    }

    const rowValues = [];
    for (const cell of ensureArray(rowNode?.c)) {
      const targetIndex = cell?.r ? columnLettersToIndex(cell.r) : rowValues.length;
      while (rowValues.length < targetIndex) rowValues.push("");
      rowValues[targetIndex] = parseCellValue(cell, sharedStrings, dateStyleFlags, date1904);
    }

    while (rowValues.length > 0 && String(rowValues[rowValues.length - 1] ?? "").trim() === "") {
      rowValues.pop();
    }

    rows.push(rowValues);
    currentRowIndex = rowIndex + 1;
  }

  return rows;
}

function parseWorkbookRows(buffer) {
  const entries = unzipSync(asUint8Array(buffer));
  const sharedStrings = parseSharedStrings(entries);
  const dateStyleFlags = parseStyles(entries);
  const { sheets, date1904 } = parseWorkbookSheets(entries);
  const rowsBySheet = new Map();

  for (const sheet of sheets) {
    if (!sheet.name || !sheet.path) continue;
    const worksheetXml = readZipText(entries, sheet.path);
    if (!worksheetXml) continue;
    rowsBySheet.set(sheet.name, worksheetToRows(worksheetXml, sharedStrings, dateStyleFlags, date1904));
  }

  return {
    sheetNames: sheets.filter((sheet) => sheet.name).map((sheet) => sheet.name),
    getSheetRows(sheetName) {
      const resolvedName = resolveSheetName(Array.from(rowsBySheet.keys()), sheetName);
      return resolvedName ? rowsBySheet.get(resolvedName) || null : null;
    },
  };
}

function normalizeSheetName(name, index) {
  const sanitized = String(name || `Sheet ${index + 1}`)
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (sanitized || `Sheet ${index + 1}`).slice(0, 31);
}

function serializeInlineStringCell(reference, value) {
  const text = normalizeStringCell(value);
  const preserveWhitespace = /^\s|\s$|\n/.test(text);
  const preserveAttr = preserveWhitespace ? ' xml:space="preserve"' : "";
  return `<c r="${reference}" t="inlineStr"><is><t${preserveAttr}>${escapeXmlText(text)}</t></is></c>`;
}

function serializeCell(reference, value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return serializeInlineStringCell(reference, value);
}

function dimensionRef(maxColumnCount, maxRowCount) {
  const endCell = `${columnIndexToLetters(Math.max(0, maxColumnCount - 1))}${Math.max(1, maxRowCount)}`;
  return `A1:${endCell}`;
}

function serializeWorksheetXml(sheet) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const maxColumnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 1);
  const rowXml = rows
    .map((row, rowIndex) => {
      const values = Array.isArray(row) ? row : [];
      const cells = values
        .map((value, columnIndex) => serializeCell(cellReference(columnIndex, rowIndex), value))
        .filter(Boolean)
        .join("");
      return cells ? `<row r="${rowIndex + 1}">${cells}</row>` : `<row r="${rowIndex + 1}"/>`;
    })
    .join("");

  const columnXml = Array.isArray(sheet.widths) && sheet.widths.length > 0
    ? `<cols>${sheet.widths
        .map((width, index) => {
          const numericWidth = Number(width);
          if (!Number.isFinite(numericWidth) || numericWidth <= 0) return "";
          return `<col min="${index + 1}" max="${index + 1}" width="${numericWidth}" customWidth="1"/>`;
        })
        .join("")}</cols>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${SPREADSHEETML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimensionRef(maxColumnCount, Math.max(1, rows.length))}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  ${columnXml}
  <sheetData>${rowXml}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function serializeWorkbookXml(sheets) {
  const sheetXml = sheets
    .map((sheet, index) => {
      const name = escapeXmlAttribute(sheet.name);
      return `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetXml}</sheets>
</workbook>`;
}

function serializeWorkbookRelsXml(sheets) {
  const relationships = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="${XLSX_WORKSHEET_REL}" Target="worksheets/sheet${index + 1}.xml"/>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relationships}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function serializeRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function serializeContentTypesXml(sheets) {
  const worksheetOverrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="${XML_CONTENT_TYPE}"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${worksheetOverrides}
</Types>`;
}

function serializeStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${SPREADSHEETML_NS}">
  <fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function serializeCoreXml({ title, author }) {
  const timestamp = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXmlText(title)}</dc:title>
  <dc:creator>${escapeXmlText(author)}</dc:creator>
  <cp:lastModifiedBy>${escapeXmlText(author)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
}

function serializeAppXml({ company, sheets }) {
  const titles = sheets.map((sheet) => `<vt:lpstr>${escapeXmlText(sheet.name)}</vt:lpstr>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Catalyst Cash</Application>
  <Company>${escapeXmlText(company)}</Company>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheets.length}" baseType="lpstr">${titles}</vt:vector>
  </TitlesOfParts>
</Properties>`;
}

function buildWorkbookArchive({ title, author, company, sheets }) {
  const normalizedSheets = sheets.map((sheet, index) => ({
    ...sheet,
    name: normalizeSheetName(sheet?.name, index),
  }));

  const files = {
    "[Content_Types].xml": strToU8(serializeContentTypesXml(normalizedSheets)),
    "_rels/.rels": strToU8(serializeRootRelsXml()),
    "docProps/core.xml": strToU8(serializeCoreXml({ title, author })),
    "docProps/app.xml": strToU8(serializeAppXml({ company, sheets: normalizedSheets })),
    "xl/workbook.xml": strToU8(serializeWorkbookXml(normalizedSheets)),
    "xl/_rels/workbook.xml.rels": strToU8(serializeWorkbookRelsXml(normalizedSheets)),
    "xl/styles.xml": strToU8(serializeStylesXml()),
  };

  normalizedSheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(serializeWorksheetXml(sheet));
  });

  return zipSync(files, { level: 6 });
}

export async function loadWorkbookRows(buffer) {
  return parseWorkbookRows(buffer);
}

export async function createWorkbookBuffer({ title, author = "Catalyst Cash", company = "Catalyst Cash", sheets }) {
  const workbookBytes = buildWorkbookArchive({
    title,
    author,
    company,
    sheets: Array.isArray(sheets) ? sheets : [],
  });
  return asArrayBuffer(workbookBytes);
}
