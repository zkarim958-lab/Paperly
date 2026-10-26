/*
 * PDF -> WORD / EXCEL / POWERPOINT, entirely in the browser.
 *
 * No server, no conversion service. We read the PDF with pdf.js, rebuild its
 * structure from the positions of the text, and write the Office files
 * ourselves (they are ZIPs of XML) with JSZip.
 *
 * What this is, honestly: a *text and layout reconstruction*.
 *  - Word: paragraphs, headings (by size/bold), alignment, indents, simple
 *    tab-aligned columns, page breaks. Images and vector graphics are not
 *    carried over.
 *  - Excel: text is split into rows and columns by position and numbers are
 *    stored as numbers. Works best on table-like PDFs.
 *  - PowerPoint: either each page as a picture (exact look), or editable text
 *    boxes at the original positions.
 *  - Scanned pages (no text) can be read with OCR when enabled.
 */

import JSZip from "jszip";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractPdfTextBoxes, ocrLinesToBoxes, type TextBox } from "@/lib/editor";
import { OCR_LANGS, recognizeCanvas, terminateOcr, type OcrLang } from "@/lib/ocr";
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas, type ReportFn } from "@/lib/pdf";

export { OCR_LANGS };
export type { OcrLang };

export type PageContent = { w: number; h: number; boxes: TextBox[]; ocr: boolean };

export type ReadResult = { pages: PageContent[]; ocrPages: number; emptyPages: number };

/* ------------------------------------------------------------------ reading */

export async function readPages(
  bytes: Uint8Array,
  opts: { ocr: boolean; lang: OcrLang; pages?: number[] },
  report: ReportFn,
): Promise<ReadResult> {
  const pdf: PDFDocumentProxy = await openPdf(bytes);
  const pages: PageContent[] = [];
  let ocrPages = 0;
  let emptyPages = 0;
  try {
    const list = opts.pages ?? Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    for (let k = 0; k < list.length; k++) {
      const n = list[k];
      report(0.05 + 0.85 * (k / list.length), `Reading page ${n} of ${pdf.numPages}…`);
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      let boxes = await extractPdfTextBoxes(pdf, n - 1);
      let usedOcr = false;
      const chars = boxes.reduce((a, b) => a + b.text.length, 0);
      if (chars < 3 && opts.ocr) {
        const { canvas, pointsWidth, pointsHeight } = await renderPageToCanvas(pdf, n, 3, 4200);
        const lines = await recognizeCanvas(canvas, opts.lang, (f, label) => report(0.05 + 0.85 * ((k + f) / list.length), `Page ${n}: ${label}`));
        const kx = pointsWidth / canvas.width;
        const ky = pointsHeight / canvas.height;
        releaseCanvas(canvas);
        boxes = ocrLinesToBoxes(lines, kx, ky, n - 1);
        usedOcr = true;
        ocrPages++;
      }
      if (!boxes.length) emptyPages++;
      pages.push({ w: vp.width, h: vp.height, boxes, ocr: usedOcr });
      page.cleanup();
    }
  } finally {
    closePdf(pdf);
    if (opts.ocr) await terminateOcr().catch(() => undefined);
  }
  return { pages, ocrPages, emptyPages };
}

/* -------------------------------------------------------------------- utils */

const xmlEscape = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const percentile = (v: number[], p: number) => {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};

type Row = { segs: TextBox[]; baseline: number; size: number; x0: number; x1: number; bold: boolean; italic: boolean; family: TextBox["family"] };

/** Group text boxes of one page into rows (same baseline), left to right. */
function toRows(boxes: TextBox[]): Row[] {
  const sorted = boxes.slice().sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows: Row[] = [];
  for (const b of sorted) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(r.baseline - b.baseline) < 0.5 * Math.min(r.size, b.fontSize)) {
      r.segs.push(b);
      r.size = Math.max(r.size, b.fontSize);
    } else rows.push({ segs: [b], baseline: b.baseline, size: b.fontSize, x0: b.x, x1: b.x + b.w, bold: b.bold, italic: b.italic, family: b.family });
  }
  for (const r of rows) {
    r.segs.sort((a, b) => a.x - b.x);
    r.x0 = r.segs[0].x;
    const last = r.segs[r.segs.length - 1];
    r.x1 = last.x + last.w;
    r.bold = r.segs.every((s) => s.bold);
    r.italic = r.segs.every((s) => s.italic);
    r.family = r.segs[0].family;
  }
  return rows;
}

async function zipBytes(zip: JSZip): Promise<Uint8Array> {
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/* ==================================================================== WORD */

type DPara = {
  rows: Row[];
  runs: { text: string; size: number; bold: boolean; italic: boolean; family: TextBox["family"] }[];
  tabs: number[]; // x positions (pt, page coordinates) for multi-segment rows
  align: "left" | "center" | "right";
  indent: number;
  pageStart: boolean;
  lineGap: number;
  firstBaseline: number;
  lastBaseline: number;
  size: number;
};

const FONT_NAME = { helvetica: "Arial", times: "Times New Roman", courier: "Courier New" } as const;

function buildParagraphs(page: PageContent, pageIndex: number): { paras: DPara[]; marginL: number; marginR: number; marginT: number; marginB: number } {
  const rows = toRows(page.boxes);
  if (!rows.length) return { paras: [], marginL: 72, marginR: 72, marginT: 72, marginB: 72 };
  const body = median(page.boxes.flatMap((b) => new Array(Math.max(1, Math.min(b.text.length, 40))).fill(b.fontSize)));
  const marginL = percentile(rows.map((r) => r.x0), 0.05);
  const textRight = percentile(rows.map((r) => r.x1), 0.95);
  const contentW = Math.max(1, textRight - marginL);
  const paras: DPara[] = [];

  const newPara = (r: Row, first: boolean): DPara => ({
    rows: [r],
    runs: [],
    tabs: [],
    align: "left",
    indent: 0,
    pageStart: first && pageIndex > 0,
    lineGap: 0,
    firstBaseline: r.baseline,
    lastBaseline: r.baseline,
    size: r.size,
  });

  let cur: DPara | null = null;
  rows.forEach((r, idx) => {
    const multi = r.segs.length > 1;
    const prev: Row | null = cur ? cur.rows[cur.rows.length - 1] : null;
    let join = false;
    if (cur && prev && !multi && prev.segs.length === 1) {
      const gap = r.baseline - prev.baseline;
      const sameSize = Math.abs(r.size - prev.size) <= 0.12 * prev.size;
      const gapOk = gap >= 0.8 * prev.size && gap <= 1.6 * prev.size;
      const alignOk = Math.abs(r.x0 - prev.x0) <= 0.6 * prev.size || (cur.rows.length === 1 && prev.x0 - r.x0 >= -0.6 * prev.size && prev.x0 - r.x0 <= 3 * prev.size);
      const prevFull = prev.x1 >= textRight - 0.2 * contentW;
      const centered = Math.abs((prev.x0 + prev.x1) / 2 - page.w / 2) < 0.03 * page.w && prev.x1 - prev.x0 < 0.7 * contentW;
      join = sameSize && gapOk && alignOk && prevFull && !centered;
    }
    if (join && cur) {
      cur.rows.push(r);
      cur.lastBaseline = r.baseline;
    } else {
      cur = newPara(r, idx === 0);
      paras.push(cur);
    }
  });

  for (const p of paras) {
    const first = p.rows[0];
    // runs
    if (p.rows.length === 1 && first.segs.length > 1) {
      first.segs.forEach((s, i) => {
        if (i > 0) p.runs.push({ text: "\t", size: s.fontSize, bold: false, italic: false, family: s.family });
        p.runs.push({ text: s.text, size: s.fontSize, bold: s.bold, italic: s.italic, family: s.family });
      });
      p.tabs = first.segs.slice(1).map((s) => s.x);
    } else {
      let text = "";
      p.rows.forEach((r, i) => {
        const t = r.segs.map((s) => s.text).join(" ");
        if (i === 0) text = t;
        else text += /-$/.test(text) && /^[a-z]/.test(t) ? t : " " + t;
      });
      p.runs.push({ text, size: first.size, bold: p.rows.every((r) => r.bold), italic: p.rows.every((r) => r.italic), family: first.family });
    }
    p.size = first.size;
    p.indent = Math.max(0, first.x0 - marginL);
    const center = (first.x0 + p.rows[p.rows.length - 1].x1) / 2;
    const w1 = Math.max(...p.rows.map((r) => r.x1 - r.x0));
    if (p.rows.length === 1 && first.segs.length === 1 && Math.abs(center - page.w / 2) < 0.025 * page.w && w1 < 0.75 * contentW && first.x0 - marginL > 0.08 * contentW) p.align = "center";
    else if (p.rows.length === 1 && first.segs.length === 1 && textRight - first.x1 < 0.02 * contentW && first.x0 - marginL > 0.4 * contentW) p.align = "right";
    if (p.align !== "left") p.indent = 0;
    if (p.rows.length > 1) {
      const gaps: number[] = [];
      for (let i = 1; i < p.rows.length; i++) gaps.push(p.rows[i].baseline - p.rows[i - 1].baseline);
      p.lineGap = median(gaps);
    }
  }

  const marginT = Math.min(...page.boxes.map((b) => b.y));
  const marginB = page.h - Math.max(...page.boxes.map((b) => b.y + b.h));
  return { paras, marginL, marginR: Math.max(0, page.w - textRight), marginT, marginB };
}

const tw = (pt: number) => Math.round(pt * 20);

export async function pdfToDocx(read: ReadResult): Promise<Uint8Array> {
  const first = read.pages.find((p) => p.boxes.length) ?? read.pages[0];
  const pageW = first?.w ?? 612;
  const pageH = first?.h ?? 792;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const built = read.pages.map((p, i) => buildParagraphs(p, i));
  const withText = built.filter((b) => b.paras.length);
  const mL = clamp(withText.length ? Math.min(...withText.map((b) => b.marginL)) : 72, 18, 144);
  const mR = clamp(withText.length ? Math.min(...withText.map((b) => b.marginR)) : 72, 18, 144);
  const mT = clamp(withText.length ? Math.min(...withText.map((b) => b.marginT)) : 72, 18, 144);
  const mB = clamp(withText.length ? Math.min(...withText.map((b) => b.marginB)) : 72, 18, 144);

  let xml = "";
  built.forEach((b, pi) => {
    if (!b.paras.length) {
      // keep page numbering: an empty page becomes a page break
      if (pi > 0) xml += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      return;
    }
    b.paras.forEach((p, i) => {
      const next = b.paras[i + 1];
      const lineH = p.rows.length > 1 && p.lineGap > 0 ? p.lineGap : p.size * 1.17;
      const dist = next ? next.firstBaseline - p.lastBaseline : 0;
      const nextLine = next ? (next.rows.length > 1 && next.lineGap > 0 ? next.lineGap : next.size * 1.17) : 0;
      const after = next ? clamp(dist - nextLine, 0, 70) : 0;
      let ppr = "";
      if (p.pageStart || (i === 0 && pi > 0)) ppr += "<w:pageBreakBefore/>";
      if (p.tabs.length) ppr += `<w:tabs>${p.tabs.map((x) => `<w:tab w:val="left" w:pos="${tw(Math.max(0, x - b.marginL))}"/>`).join("")}</w:tabs>`;
      ppr += `<w:spacing w:before="0" w:after="${tw(after)}"${p.rows.length > 1 && p.lineGap > 0 ? ` w:line="${tw(lineH)}" w:lineRule="exact"` : ""}/>`;
      if (p.indent > 2 && p.align === "left") ppr += `<w:ind w:left="${tw(p.indent)}"/>`;
      if (p.align !== "left") ppr += `<w:jc w:val="${p.align}"/>`;
      let runs = "";
      for (const r of p.runs) {
        if (r.text === "\t") {
          runs += "<w:r><w:tab/></w:r>";
          continue;
        }
        const f = FONT_NAME[r.family];
        runs += `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>${r.bold ? "<w:b/>" : ""}${r.italic ? "<w:i/>" : ""}<w:sz w:val="${Math.max(2, Math.round(r.size * 2))}"/><w:szCs w:val="${Math.max(2, Math.round(r.size * 2))}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`;
      }
      xml += `<w:p><w:pPr>${ppr}</w:pPr>${runs}</w:p>`;
    });
  });

  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${xml || "<w:p/>"}<w:sectPr><w:pgSz w:w="${tw(pageW)}" w:h="${tw(pageH)}"/><w:pgMar w:top="${tw(mT)}" w:right="${tw(mR)}" w:bottom="${tw(mB)}" w:left="${tw(mL)}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`);
  zip.file("word/document.xml", doc);
  return zipBytes(zip);
}

/* =================================================================== EXCEL */

type XCell = { v: string | number; fmt?: 0 | 1 | 2 | 3 | 4 };
type XSheet = { name: string; rows: (XCell | null)[][] };

function parseNumber(t: string): { v: number; fmt: 0 | 1 | 2 | 3 | 4 } | null {
  const s = t.trim();
  const m = /^(\()?(-)?([$€£])?\s?(-)?(\d[\d,]*(?:\.\d+)?|\.\d+)(%)?(\))?$/.exec(s);
  if (!m) return null;
  const digits = m[5];
  if (/^0\d/.test(digits) && !digits.includes(".")) return null; // keep leading zeros (ids, zip codes) as text
  if (digits.includes(",") && !/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(digits)) return null;
  let v = Number(digits.replace(/,/g, ""));
  if (isNaN(v)) return null;
  if (m[1] && m[7]) v = -v;
  else if (m[2] || m[4]) v = -v;
  let fmt: 0 | 1 | 2 | 3 | 4 = 0;
  if (m[6]) {
    v = v / 100;
    fmt = 1;
  } else if (m[3] === "$") fmt = 2;
  else if (m[3] === "€") fmt = 3;
  else if (m[3] === "£") fmt = 4;
  return { v, fmt };
}

function pageToRows(page: PageContent, columns: { x0: number; x1: number }[]): (XCell | null)[][] {
  const rows = toRows(page.boxes);
  const out: (XCell | null)[][] = [];
  for (const r of rows) {
    const cells: (XCell | null)[] = [];
    for (const s of r.segs) {
      let ci = 0;
      if (columns.length) {
        let best = -1;
        let bestOv = 0;
        columns.forEach((c, i) => {
          const ov = Math.min(c.x1, s.x + s.w) - Math.max(c.x0, s.x);
          if (ov > bestOv) {
            bestOv = ov;
            best = i;
          }
        });
        if (best < 0) best = Math.max(0, columns.findIndex((c) => c.x0 >= s.x));
        ci = best < 0 ? columns.length - 1 : best;
      }
      const num = parseNumber(s.text);
      const cell: XCell = num ? { v: num.v, fmt: num.fmt } : { v: s.text };
      if (cells[ci]) {
        const prev = cells[ci] as XCell;
        cells[ci] = { v: `${prev.v} ${s.text}` };
      } else cells[ci] = cell;
    }
    out.push(cells);
  }
  return out;
}

/** Column bands from the segments of rows that have two or more cells. */
function detectColumns(pages: PageContent[]): { x0: number; x1: number }[] {
  const ivs: { x0: number; x1: number }[] = [];
  for (const p of pages) {
    for (const r of toRows(p.boxes)) {
      if (r.segs.length < 2) continue;
      for (const s of r.segs) if (s.w < 0.5 * p.w) ivs.push({ x0: s.x, x1: s.x + s.w });
    }
  }
  ivs.sort((a, b) => a.x0 - b.x0);
  const cols: { x0: number; x1: number }[] = [];
  for (const iv of ivs) {
    const last = cols[cols.length - 1];
    if (last && iv.x0 <= last.x1 + 1) last.x1 = Math.max(last.x1, iv.x1);
    else cols.push({ ...iv });
  }
  // Two neighbouring bands that never appear in the same row are really one
  // column (a centred header over right-aligned numbers, for example).
  const colOf = (x0: number, w: number) => {
    let best = -1;
    let bo = 0;
    cols.forEach((c, i) => {
      const ov = Math.min(c.x1, x0 + w) - Math.max(c.x0, x0);
      if (ov > bo) {
        bo = ov;
        best = i;
      }
    });
    return best;
  };
  const together: Set<string> = new Set();
  for (const p of pages) {
    for (const r of toRows(p.boxes)) {
      const idx = r.segs.map((s) => colOf(s.x, s.w)).filter((i) => i >= 0);
      for (const a of idx) for (const b of idx) if (a < b) together.add(`${a}:${b}`);
    }
  }
  const merged: { x0: number; x1: number }[] = [];
  let group: number[] = [0];
  const flush = () => {
    merged.push({ x0: cols[group[0]].x0, x1: cols[group[group.length - 1]].x1 });
  };
  for (let i = 1; i < cols.length; i++) {
    const conflict = group.some((g) => together.has(`${g}:${i}`));
    if (!conflict) group.push(i);
    else {
      flush();
      group = [i];
    }
  }
  if (cols.length) flush();
  return merged;
}

const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export type ExcelMode = "per-page" | "single";

export async function pdfToXlsx(read: ReadResult, mode: ExcelMode): Promise<{ bytes: Uint8Array; sheets: number; rows: number }> {
  const sheets: XSheet[] = [];
  if (mode === "single") {
    const cols = detectColumns(read.pages);
    const rows: (XCell | null)[][] = [];
    for (const p of read.pages) rows.push(...pageToRows(p, cols));
    if (rows.length) sheets.push({ name: "Sheet1", rows });
  } else {
    read.pages.forEach((p, i) => {
      const rows = pageToRows(p, detectColumns([p]));
      if (rows.length) sheets.push({ name: `Page ${i + 1}`, rows });
    });
  }
  if (!sheets.length) sheets.push({ name: "Sheet1", rows: [] });

  const zip = new JSZip();
  const CT = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="&quot;€&quot;#,##0.00"/><numFmt numFmtId="166" formatCode="&quot;£&quot;#,##0.00"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);

  let totalRows = 0;
  sheets.forEach((s, i) => {
    const widths: number[] = [];
    let body = "";
    s.rows.forEach((row, ri) => {
      let cells = "";
      row.forEach((c, ci) => {
        if (!c) return;
        const ref = `${colName(ci)}${ri + 1}`;
        const len = String(c.v).length;
        widths[ci] = Math.max(widths[ci] ?? 8, Math.min(len + 2, 60));
        if (typeof c.v === "number") cells += `<c r="${ref}"${c.fmt ? ` s="${c.fmt}"` : ""}><v>${c.v}</v></c>`;
        else cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(c.v)}</t></is></c>`;
      });
      body += `<row r="${ri + 1}">${cells}</row>`;
    });
    totalRows += s.rows.length;
    const cols = widths.length ? `<cols>${widths.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w ?? 8}" customWidth="1"/>`).join("")}</cols>` : "";
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`);
  });
  return { bytes: await zipBytes(zip), sheets: sheets.length, rows: totalRows };
}

/* ============================================================= POWERPOINT */

export type PptMode = "image" | "text";

const EMU = 12700;
const A = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`;
const R = `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const P = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme ${A} name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const GRP = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

export async function pdfToPptx(
  bytes: Uint8Array,
  read: ReadResult,
  mode: PptMode,
  report: ReportFn,
): Promise<{ bytes: Uint8Array; slides: number }> {
  const pages = read.pages;
  const w0 = pages[0]?.w ?? 792;
  const h0 = pages[0]?.h ?? 612;
  const cx = Math.round(Math.min(w0 * EMU, 50_000_000));
  const cy = Math.round(Math.min(h0 * EMU, 50_000_000));
  const zip = new JSZip();

  const images: Uint8Array[] = [];
  if (mode === "image") {
    const pdf = await openPdf(bytes);
    try {
      for (let i = 0; i < pages.length; i++) {
        report(0.1 + 0.8 * (i / pages.length), `Rendering slide ${i + 1} of ${pages.length}…`);
        const { canvas } = await renderPageToCanvas(pdf, i + 1, 2.2, 2400);
        const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode image"))), "image/jpeg", 0.88));
        images.push(new Uint8Array(await blob.arrayBuffer()));
        releaseCanvas(canvas);
      }
    } finally {
      closePdf(pdf);
    }
  }

  const n = pages.length;
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${pages.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${A} ${R} ${P}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${pages.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${pages.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/theme/theme1.xml", THEME);
  zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${A} ${R} ${P}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${A} ${R} ${P} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);

  pages.forEach((pg, i) => {
    let shapes = "";
    let rels = `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`;
    if (mode === "image") {
      zip.file(`ppt/media/image${i + 1}.jpeg`, images[i]);
      rels += `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.jpeg"/>`;
      shapes = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${i + 1}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    } else {
      const k = (cx / EMU) / pg.w;
      pg.boxes.forEach((b, bi) => {
        const f = FONT_NAME[b.family];
        const sz = Math.max(100, Math.round(b.fontSize * k * 100));
        shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${bi + 2}" name="Text ${bi + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(b.x * k * EMU)}" y="${Math.round(b.y * k * EMU)}"/><a:ext cx="${Math.round((b.w * 1.08 + 4) * k * EMU)}" cy="${Math.round(b.h * 1.05 * k * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${sz}" b="${b.bold ? 1 : 0}" i="${b.italic ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="${f}"/></a:rPr><a:t>${xmlEscape(b.text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
      });
    }
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${A} ${R} ${P}><p:cSld><p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
  });
  return { bytes: await zipBytes(zip), slides: n };
}
