import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { createWorkbookBuffer, loadWorkbookRows } from "./excelWorkbook.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(MODULE_DIR, "../../public/CatalystCash-Setup-Template.xlsx");
const DAY_MS = 24 * 60 * 60 * 1000;

function excelSerialForDate(dateString) {
  const utcMs = Date.parse(`${dateString}T00:00:00Z`);
  const baseMs = Date.UTC(1899, 11, 31);
  const wholeDays = Math.round((utcMs - baseMs) / DAY_MS);
  return wholeDays >= 60 ? wholeDays + 1 : wholeDays;
}

function buildSharedStringsWorkbook(dateString) {
  const serial = excelSerialForDate(dateString);
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Setup Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`),
    "xl/sharedStrings.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
  <si><t>Config Key</t></si>
  <si><t>Description</t></si>
  <si><t>nextDate</t></si>
  <si><t>Expected Next Date</t></si>
</sst>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="inlineStr"><is><t>Your Value</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2" t="s"><v>3</v></c>
      <c r="C2" s="1"><v>${serial}</v></c>
    </row>
  </sheetData>
</worksheet>`),
  };

  return zipSync(files, { level: 6 }).buffer;
}

describe("excelWorkbook", () => {
  it("loads the shipped setup template workbook", async () => {
    const workbook = await loadWorkbookRows(await readFile(TEMPLATE_PATH));
    const setupRows = workbook.getSheetRows("Setup Data");

    expect(workbook.sheetNames).toEqual(["📋 Instructions", "📝 Setup Data"]);
    expect(setupRows?.[1]).toEqual(["field_key", "Field", "Your Value ✏️", "Unit", "Description / Notes"]);
    expect(setupRows?.[3]?.[0]).toBe("payFrequency");
    expect(setupRows?.[3]?.[1]).toBe("Pay Frequency");
  });

  it("round-trips generated workbooks and preserves widths in the sheet xml", async () => {
    const workbookBuffer = await createWorkbookBuffer({
      title: "Catalyst Cash Spreadsheet Backup",
      sheets: [
        {
          name: "Setup Data",
          rows: [
            ["Config Key", "Description", "Your Value"],
            ["birthYear", "Birth Year", 1990],
            ["track401k", "Track 401k", true],
            ["note", "Freeform note", " keep this spacing "],
          ],
          widths: [34, 48, 24],
        },
      ],
    });

    const workbook = await loadWorkbookRows(workbookBuffer);
    const setupRows = workbook.getSheetRows("Setup Data");
    const archive = unzipSync(new Uint8Array(workbookBuffer));
    const worksheetXml = new TextDecoder().decode(archive["xl/worksheets/sheet1.xml"]);

    expect(setupRows).toEqual([
      ["Config Key", "Description", "Your Value"],
      ["birthYear", "Birth Year", 1990],
      ["track401k", "Track 401k", true],
      ["note", "Freeform note", " keep this spacing "],
    ]);
    expect(worksheetXml).toContain('width="34"');
    expect(worksheetXml).toContain('width="48"');
    expect(worksheetXml).toContain('width="24"');
  });

  it("parses shared strings and converts styled Excel dates into ISO dates", async () => {
    const workbook = await loadWorkbookRows(buildSharedStringsWorkbook("2026-03-27"));

    expect(workbook.sheetNames).toEqual(["Setup Data"]);
    expect(workbook.getSheetRows("Setup Data")).toEqual([
      ["Config Key", "Description", "Your Value"],
      ["nextDate", "Expected Next Date", "2026-03-27"],
    ]);
  });

  it("resolves sheet names through normalized lookup", async () => {
    const workbookBuffer = await createWorkbookBuffer({
      title: "Catalyst Cash Spreadsheet Backup",
      sheets: [
        {
          name: "📝 Setup Data",
          rows: [["Config Key", "Description", "Your Value"]],
        },
      ],
    });

    const workbook = await loadWorkbookRows(workbookBuffer);

    expect(workbook.getSheetRows("Setup Data")).toEqual([["Config Key", "Description", "Your Value"]]);
    expect(workbook.getSheetRows("setup data")).toEqual([["Config Key", "Description", "Your Value"]]);
  });
});
