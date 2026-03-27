const DEFAULT_PAGE = {
  width: 612,
  height: 792,
};

const FONT_IDS = {
  normal: "F1",
  bold: "F2",
};

const TEXT_ENCODER = new TextEncoder();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pdfNumber(value) {
  const normalized = Number.isFinite(value) ? value : 0;
  return String(Number(normalized.toFixed(3))).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function colorToPdf(color = []) {
  const [red = 0, green = 0, blue = 0] = color;
  return [red, green, blue].map((channel) => pdfNumber(clamp(channel, 0, 255) / 255)).join(" ");
}

function normalizePdfText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfString(value) {
  return normalizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function sanitizePdfMetadataValue(value) {
  const normalized = normalizePdfText(value).replace(/\s+/g, " ").trim();
  return normalized || null;
}

function formatPdfDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `D:${year}${month}${day}${hours}${minutes}${seconds}Z`;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function estimateCharWidth(character) {
  if (character === " ") return 0.28;
  if (/[.,:;|!']/u.test(character)) return 0.24;
  if (/[()[\]{}]/u.test(character)) return 0.34;
  if (/[iljtfr]/u.test(character)) return 0.31;
  if (/[mwMW@#%&]/u.test(character)) return 0.9;
  if (/[A-Z]/u.test(character)) return 0.68;
  if (/[0-9]/u.test(character)) return 0.56;
  return 0.54;
}

function estimateTextWidth(text, size, font) {
  const weightMultiplier = font === "bold" ? 1.04 : 1;
  let total = 0;
  for (const character of normalizePdfText(text)) {
    total += estimateCharWidth(character);
  }
  return total * size * weightMultiplier;
}

function splitLongWord(word, maxWidth, size, font) {
  const segments = [];
  let current = "";

  for (const character of word) {
    const next = current + character;
    if (current && estimateTextWidth(next, size, font) > maxWidth) {
      segments.push(current);
      current = character;
      continue;
    }
    current = next;
  }

  if (current) segments.push(current);
  return segments;
}

function splitTextToSize(text, maxWidth, { font = "normal", size = 12 } = {}) {
  const normalized = normalizePdfText(text).replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const words = normalized.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (estimateTextWidth(candidate, size, font) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }

    if (estimateTextWidth(word, size, font) <= maxWidth) {
      currentLine = word;
      continue;
    }

    const segments = splitLongWord(word, maxWidth, size, font);
    lines.push(...segments.slice(0, -1));
    currentLine = segments.at(-1) || "";
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

class PdfPage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.commands = [];
  }

  toPdfY(topY) {
    return this.height - topY;
  }

  drawText(lines, x, y, { font = "normal", size = 12, color = [0, 0, 0], lineHeight = size * 1.2 } = {}) {
    const fontId = FONT_IDS[font] || FONT_IDS.normal;
    const textLines = Array.isArray(lines) ? lines : [lines];

    for (let index = 0; index < textLines.length; index += 1) {
      const line = escapePdfString(textLines[index]);
      const baseline = this.toPdfY(y + index * lineHeight);
      this.commands.push(
        `BT /${fontId} ${pdfNumber(size)} Tf ${colorToPdf(color)} rg 1 0 0 1 ${pdfNumber(x)} ${pdfNumber(baseline)} Tm (${line}) Tj ET`
      );
    }
  }

  drawLine(x1, y1, x2, y2, { color = [0, 0, 0], width = 1 } = {}) {
    this.commands.push(
      `${pdfNumber(width)} w ${colorToPdf(color)} RG ${pdfNumber(x1)} ${pdfNumber(this.toPdfY(y1))} m ${pdfNumber(x2)} ${pdfNumber(this.toPdfY(y2))} l S`
    );
  }

  drawRoundedRect(x, y, width, height, radius, { fillColor = [255, 255, 255], borderColor = [0, 0, 0], lineWidth = 1 } = {}) {
    const safeRadius = clamp(radius, 0, Math.min(width / 2, height / 2));
    const kappa = safeRadius * 0.5522847498;
    const left = x;
    const right = x + width;
    const bottom = this.height - y - height;
    const top = bottom + height;

    const path = [
      `${pdfNumber(left + safeRadius)} ${pdfNumber(bottom)} m`,
      `${pdfNumber(right - safeRadius)} ${pdfNumber(bottom)} l`,
      `${pdfNumber(right - safeRadius + kappa)} ${pdfNumber(bottom)} ${pdfNumber(right)} ${pdfNumber(bottom + safeRadius - kappa)} ${pdfNumber(right)} ${pdfNumber(bottom + safeRadius)} c`,
      `${pdfNumber(right)} ${pdfNumber(top - safeRadius)} l`,
      `${pdfNumber(right)} ${pdfNumber(top - safeRadius + kappa)} ${pdfNumber(right - safeRadius + kappa)} ${pdfNumber(top)} ${pdfNumber(right - safeRadius)} ${pdfNumber(top)} c`,
      `${pdfNumber(left + safeRadius)} ${pdfNumber(top)} l`,
      `${pdfNumber(left + safeRadius - kappa)} ${pdfNumber(top)} ${pdfNumber(left)} ${pdfNumber(top - safeRadius + kappa)} ${pdfNumber(left)} ${pdfNumber(top - safeRadius)} c`,
      `${pdfNumber(left)} ${pdfNumber(bottom + safeRadius)} l`,
      `${pdfNumber(left)} ${pdfNumber(bottom + safeRadius - kappa)} ${pdfNumber(left + safeRadius - kappa)} ${pdfNumber(bottom)} ${pdfNumber(left + safeRadius)} ${pdfNumber(bottom)} c`,
      "B",
    ].join(" ");

    this.commands.push(`${pdfNumber(lineWidth)} w ${colorToPdf(borderColor)} RG ${colorToPdf(fillColor)} rg ${path}`);
  }

  toContentStream() {
    return this.commands.join("\n");
  }
}

export class SimplePdfDocument {
  constructor({ width = DEFAULT_PAGE.width, height = DEFAULT_PAGE.height, metadata = {} } = {}) {
    this.width = width;
    this.height = height;
    this.pages = [new PdfPage(width, height)];
    this.metadata = {
      title: sanitizePdfMetadataValue(metadata.title),
      author: sanitizePdfMetadataValue(metadata.author),
      subject: sanitizePdfMetadataValue(metadata.subject),
      creator: sanitizePdfMetadataValue(metadata.creator),
      producer: sanitizePdfMetadataValue(metadata.producer || "Catalyst Cash"),
      keywords: sanitizePdfMetadataValue(metadata.keywords),
      creationDate: metadata.creationDate instanceof Date ? metadata.creationDate : new Date(),
    };
  }

  get currentPage() {
    return this.pages[this.pages.length - 1];
  }

  addPage() {
    const page = new PdfPage(this.width, this.height);
    this.pages.push(page);
    return page;
  }

  splitTextToSize(text, maxWidth, options) {
    return splitTextToSize(text, maxWidth, options);
  }

  drawText(lines, x, y, options) {
    this.currentPage.drawText(lines, x, y, options);
  }

  drawLine(x1, y1, x2, y2, options) {
    this.currentPage.drawLine(x1, y1, x2, y2, options);
  }

  drawRoundedRect(x, y, width, height, radius, options) {
    this.currentPage.drawRoundedRect(x, y, width, height, radius, options);
  }

  toUint8Array() {
    const objects = [null];
    const pageRefs = [];

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    const metadataEntries = [];
    if (this.metadata.title) metadataEntries.push(`/Title (${escapePdfString(this.metadata.title)})`);
    if (this.metadata.author) metadataEntries.push(`/Author (${escapePdfString(this.metadata.author)})`);
    if (this.metadata.subject) metadataEntries.push(`/Subject (${escapePdfString(this.metadata.subject)})`);
    if (this.metadata.creator) metadataEntries.push(`/Creator (${escapePdfString(this.metadata.creator)})`);
    if (this.metadata.producer) metadataEntries.push(`/Producer (${escapePdfString(this.metadata.producer)})`);
    if (this.metadata.keywords) metadataEntries.push(`/Keywords (${escapePdfString(this.metadata.keywords)})`);
    const creationDate = formatPdfDate(this.metadata.creationDate);
    if (creationDate) {
      metadataEntries.push(`/CreationDate (${creationDate})`);
      metadataEntries.push(`/ModDate (${creationDate})`);
    }
    objects[5] = `<< ${metadataEntries.join(" ")} >>`;

    let nextObjectId = 6;
    for (const page of this.pages) {
      const pageObjectId = nextObjectId;
      const contentObjectId = nextObjectId + 1;
      nextObjectId += 2;

      const content = page.toContentStream();
      const contentLength = TEXT_ENCODER.encode(content).length;

      objects[pageObjectId] = [
        "<< /Type /Page",
        "/Parent 2 0 R",
        `/MediaBox [0 0 ${pdfNumber(this.width)} ${pdfNumber(this.height)}]`,
        "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>",
        `/Contents ${contentObjectId} 0 R`,
        ">>",
      ].join(" ");

      objects[contentObjectId] = `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`;
      pageRefs.push(`${pageObjectId} 0 R`);
    }

    objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${this.pages.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    for (let objectId = 1; objectId < objects.length; objectId += 1) {
      offsets[objectId] = pdf.length;
      pdf += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n`;
    pdf += "0000000000 65535 f \n";
    for (let objectId = 1; objectId < objects.length; objectId += 1) {
      pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return TEXT_ENCODER.encode(pdf);
  }

  toBase64() {
    return bytesToBase64(this.toUint8Array());
  }
}
