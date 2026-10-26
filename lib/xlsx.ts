/*
 * EXCEL (.xlsx) and CSV -> PDF, entirely in the browser.
 *
 * Reads the workbook with JSZip + DOMParser (shared strings, number formats,
 * dates, percentages, bold, column widths) and draws each sheet as a gridded
 * table. Wide sheets switch to landscape and scale down; very wide sheets are
 * split into column groups across pages. Formulas show their last saved value.
 * Legacy .xls files are not supported (save as .xlsx first).
 */

import JSZip from "jszip";
import { PdfWriter, type ParaOpts, type RGB, type Run, type Style } from "@/lib/layout";

type Cell = { text: string; num: boolean; bold: boolean };
export type Sheet = { name: string; rows: (Cell | null)[][]; colWidths: number[] };

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const kids = (el: Element | null | undefined, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] ?? null;

/* ------------------------------------------------------- number formatting */

const BUILTIN: Record<number, string> = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00",
  14: "mm-dd-yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function stripFormat(code: string): string {
  return code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "").replace(/_./g, "").replace(/\*./g, "");
}
function isDateFormat(code: string): boolean {
  const c = stripFormat(code);
  return /[dmyhs]/i.test(c) && !/^general$/i.test(c.trim());
}

function formatDate(serial: number, code: string): string {
  const ms = Math.round((serial - 25569) * 86400000);
  const d = new Date(ms);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), wd = d.getUTCDay();
  const h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
  const ampm = /AM\/PM|A\/P/i.test(code);
  let out = "";
  const src = code.replace(/\[[^\]]*\]/g, (m) => (/^\[h+\]$/i.test(m) ? "h" : ""));
  let lastWasHour = false;
  for (let i = 0; i < src.length; ) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if (src[i] === '"') {
      const end = src.indexOf('"', i + 1);
      out += src.slice(i + 1, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end + 1;
    } else if (src[i] === "\\" || src[i] === "_" || src[i] === "*") {
      if (src[i] === "\\") out += src[i + 1] ?? "";
      else if (src[i] === "_") out += " ";
      i += 2;
    } else if ((m = /^(am\/pm|a\/p)/i.exec(rest))) {
      out += h >= 12 ? (m[0].length > 3 ? "PM" : "P") : (m[0].length > 3 ? "AM" : "A");
      i += m[0].length;
    } else if ((m = /^y{3,4}/i.exec(rest))) { out += String(Y); i += m[0].length; }
    else if ((m = /^yy?/i.exec(rest))) { out += String(Y).slice(-2); i += m[0].length; }
    else if ((m = /^m{5}/i.exec(rest))) { out += MONTHS[M][0]; i += 5; }
    else if ((m = /^m{4}/i.exec(rest))) { out += MONTHS[M]; i += 4; }
    else if ((m = /^m{3}/i.exec(rest))) { out += MONTHS[M].slice(0, 3); i += 3; }
    else if ((m = /^mm?/i.exec(rest))) {
      const after = /^[^a-zA-Z]*s/i.test(src.slice(i + m[0].length));
      const minute = lastWasHour || after;
      const v = minute ? mi : M + 1;
      out += m[0].length === 2 ? String(v).padStart(2, "0") : String(v);
      i += m[0].length;
      lastWasHour = false;
    } else if ((m = /^d{4}/i.exec(rest))) { out += DAYS[wd]; i += 4; }
    else if ((m = /^d{3}/i.exec(rest))) { out += DAYS[wd].slice(0, 3); i += 3; }
    else if ((m = /^dd?/i.exec(rest))) { out += m[0].length === 2 ? String(D).padStart(2, "0") : String(D); i += m[0].length; }
    else if ((m = /^hh?/i.exec(rest))) {
      const hh = ampm ? ((h + 11) % 12) + 1 : h;
      out += m[0].length === 2 ? String(hh).padStart(2, "0") : String(hh);
      i += m[0].length;
      lastWasHour = true;
      continue;
    } else if ((m = /^ss?/i.exec(rest))) { out += m[0].length === 2 ? String(s).padStart(2, "0") : String(s); i += m[0].length; }
    else { out += src[i]; i += 1; }
    if (src[i - 1] !== ":" && src[i - 1] !== " ") lastWasHour = false;
  }
  return out.trim();
}

function formatNumber(v: number, code: string): string {
  if (!code || /^general$/i.test(code.trim())) {
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(12)));
  }
  const sections = code.split(";");
  const neg = v < 0 && sections.length > 1;
  const sec = (neg ? sections[1] : sections[0]) ?? "General";
  const abs = neg ? Math.abs(v) : v;
  let literal = "";
  // currency / literal text outside the digit placeholders
  const cleaned = sec.replace(/\[\$([^\]-]*)[^\]]*\]/g, (_, c: string) => c).replace(/\[[^\]]*\]/g, "");
  const prefix = (/^([^#0?.,%]*)/.exec(cleaned)?.[1] ?? "").replace(/"([^"]*)"/g, "$1").replace(/[_*\\]./g, " ");
  const suffix = (/([^#0?.,%]*)$/.exec(cleaned)?.[1] ?? "").replace(/"([^"]*)"/g, "$1").replace(/[_*\\]./g, " ");
  literal = "";
  const body = cleaned.slice(prefix.length, cleaned.length - suffix.length);
  const percent = body.includes("%");
  const sci = /E[+-]/i.test(body);
  const decimals = /\.([0#?]+)/.exec(body)?.[1].length ?? 0;
  const thousands = /[#0?],[#0?]/.test(body);
  let x = percent ? abs * 100 : abs;
  let text: string;
  if (sci) text = x.toExponential(decimals).replace("e", "E").replace(/E([+-])(\d)$/, "E$10$2");
  else {
    text = x.toFixed(decimals);
    if (thousands) {
      const [i, f] = text.split(".");
      text = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : "");
    }
  }
  if (percent) text += "%";
  const sign = v < 0 && !neg ? "-" : "";
  void literal;
  const paren = neg && /\(/.test(sec);
  return paren ? `(${prefix.replace(/[()]/g, "")}${text}${suffix.replace(/[()]/g, "")})` : `${sign}${prefix.replace(/\s+$/, (m) => (prefix.trim() ? m : ""))}${text}${suffix}`.replace(/^-\s+/, "-");
}

/* ----------------------------------------------------------------- parsing */

export async function parseXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("This file is not a valid .xlsx workbook. Older .xls files must be saved as .xlsx in Excel first.");
  }
  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) throw new Error("This file is not a valid .xlsx workbook. Older .xls files must be saved as .xlsx in Excel first.");
  const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml").documentElement;

  const wb = parse(await wbFile.async("string"));
  const relRoot = parse((await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "<r/>");
  const rels = new Map<string, string>();
  for (const r of Array.from(relRoot.getElementsByTagName("Relationship"))) rels.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");

  // shared strings
  const shared: string[] = [];
  const ssXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ssXml) {
    for (const si of kids(parse(ssXml), "si")) shared.push(Array.from(si.getElementsByTagNameNS(MAIN_NS, "t")).map((t) => t.textContent ?? "").join(""));
  }

  // styles: number formats + bold fonts
  const xfFmt: number[] = [];
  const xfBold: boolean[] = [];
  const customFmt = new Map<number, string>();
  const stXml = await zip.file("xl/styles.xml")?.async("string");
  if (stXml) {
    const st = parse(stXml);
    for (const nf of kids(kid(st, "numFmts"), "numFmt")) customFmt.set(Number(nf.getAttribute("numFmtId")), nf.getAttribute("formatCode") ?? "");
    const fontBold = kids(kid(st, "fonts"), "font").map((f) => !!kid(f, "b") && kid(f, "b")?.getAttribute("val") !== "0");
    for (const xf of kids(kid(st, "cellXfs"), "xf")) {
      xfFmt.push(Number(xf.getAttribute("numFmtId") ?? 0));
      xfBold.push(!!fontBold[Number(xf.getAttribute("fontId") ?? 0)]);
    }
  }
  const fmtCode = (xf: number) => {
    const id = xfFmt[xf] ?? 0;
    return customFmt.get(id) ?? BUILTIN[id] ?? "General";
  };

  const colLetterToIdx = (s: string) => s.split("").reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;
  const sheets: Sheet[] = [];

  for (const sh of kids(kid(wb, "sheets"), "sheet")) {
    const name = sh.getAttribute("name") ?? "Sheet";
    const rid = sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? sh.getAttribute("r:id") ?? "";
    let target = rels.get(rid) ?? "";
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const f = zip.file(target);
    if (!f) continue;
    const root = parse(await f.async("string"));
    const rows: (Cell | null)[][] = [];
    let maxCol = -1;

    for (const row of kids(kid(root, "sheetData"), "row")) {
      const rIdx = Number(row.getAttribute("r") ?? rows.length + 1) - 1;
      while (rows.length <= rIdx) rows.push([]);
      let auto = 0;
      for (const c of kids(row, "c")) {
        const ref = c.getAttribute("r") ?? "";
        const m = /^([A-Z]+)/.exec(ref);
        const ci = m ? colLetterToIdx(m[1]) : auto;
        auto = ci + 1;
        const t = c.getAttribute("t");
        const s = Number(c.getAttribute("s") ?? 0);
        const vEl = kid(c, "v");
        const v = vEl?.textContent ?? "";
        let text = "";
        let isNum = false;
        if (t === "s") text = shared[Number(v)] ?? "";
        else if (t === "inlineStr") text = Array.from(c.getElementsByTagNameNS(MAIN_NS, "t")).map((x) => x.textContent ?? "").join("");
        else if (t === "b") text = v === "1" ? "TRUE" : "FALSE";
        else if (t === "e" || t === "str") text = v;
        else if (v !== "") {
          const n = Number(v);
          if (!isNaN(n)) {
            const code = fmtCode(s);
            text = isDateFormat(code) ? formatDate(n, code) : formatNumber(n, code);
            isNum = !isDateFormat(code);
          } else text = v;
        }
        if (text === "") continue;
        rows[rIdx][ci] = { text, num: isNum, bold: !!xfBold[s] };
        maxCol = Math.max(maxCol, ci);
      }
    }
    while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
    if (!rows.length || maxCol < 0) continue;

    // column widths (characters -> points)
    const widths = new Array(maxCol + 1).fill(8.43);
    for (const col of kids(kid(root, "cols"), "col")) {
      const min = Number(col.getAttribute("min") ?? 1) - 1;
      const max = Math.min(Number(col.getAttribute("max") ?? min + 1) - 1, maxCol);
      const wd = Number(col.getAttribute("width") ?? 8.43);
      for (let k = min; k <= max; k++) widths[k] = wd;
    }
    sheets.push({ name, rows, colWidths: widths.map((c) => (c * 7 + 5) * 0.75) });
  }
  if (!sheets.length) throw new Error("This workbook has no data to convert.");
  return sheets;
}

/** Parse CSV text (comma, semicolon or tab separated, quotes supported). */
export function parseCsv(text: string, name = "Sheet1"): Sheet[] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  if (!rows.length) throw new Error("This CSV file is empty.");
  const maxCol = Math.max(...rows.map((r) => r.length));
  const widths = new Array(maxCol).fill(0);
  const cells = rows.map((r) =>
    r.map((t, ci) => {
      widths[ci] = Math.max(widths[ci], Math.min(t.length, 40));
      return t === "" ? null : { text: t, num: /^-?[\d,]+(\.\d+)?%?$/.test(t.trim()), bold: false };
    }),
  );
  return [{ name, rows: cells, colWidths: widths.map((c) => Math.max(c, 6) * 5.6 + 8) }];
}

/* -------------------------------------------------------------- PDF output */

export type XlsxPdfOptions = { page: "a4" | "letter"; gridlines: boolean; fontSize: number };
export const DEFAULT_XLSX_OPTIONS: XlsxPdfOptions = { page: "a4", gridlines: true, fontSize: 9 };

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

export async function sheetsToPdf(sheets: Sheet[], o: XlsxPdfOptions, report: (f: number, label?: string) => void) {
  const [pw0, ph0] = SIZES[o.page];
  const M = 32;
  const w = await PdfWriter.create(pw0, ph0, { t: M, r: M, b: M, l: M });
  const reg: Style = { family: "helvetica", bold: false, italic: false, size: o.fontSize };
  await w.ensureFont(reg);
  await w.ensureFont({ ...reg, bold: true });
  const gray: RGB = [0.78, 0.78, 0.8];
  let pagesDone = 0;

  for (let si = 0; si < sheets.length; si++) {
    const sh = sheets[si];
    report(0.05 + 0.9 * (si / sheets.length), `Drawing ${sh.name}…`);
    // Numbers and dates must not wrap, so widen those columns to fit their widest value.
    const need = sh.colWidths.slice();
    for (const row of sh.rows) {
      row.forEach((cell, ci) => {
        if (!cell || (!cell.num && (cell.text.length > 22 || /\s{1}\S+\s/.test(cell.text)))) return;
        const wdt = w.width(cell.text, { ...reg, bold: cell.bold }) + 10;
        if (wdt > need[ci]) need[ci] = Math.min(wdt, 260);
      });
    }
    sh.colWidths = need;
    const total = sh.colWidths.reduce((a, b) => a + b, 0);
    const portrait = pw0 - 2 * M;
    const landscape = ph0 - 2 * M;
    const useLandscape = total > portrait * 1.1;
    const pageW = useLandscape ? ph0 : pw0;
    const pageH = useLandscape ? pw0 : ph0;
    const avail = pageW - 2 * M;

    // split very wide sheets into column groups that can be drawn at >= 55% scale
    const maxGroup = avail / 0.55;
    const groups: number[][] = [];
    let cur: number[] = [];
    let curW = 0;
    sh.colWidths.forEach((cw, ci) => {
      if (cur.length && curW + cw > maxGroup) {
        groups.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(ci);
      curW += cw;
    });
    if (cur.length) groups.push(cur);
    void landscape;

    for (const group of groups) {
      w.startSection(pageW, pageH, { t: M, r: M, b: M, l: M });
      const gw = group.reduce((a, ci) => a + sh.colWidths[ci], 0);
      const scale = Math.min(1, avail / gw);
      const size = Math.max(5, o.fontSize * Math.max(scale, 0.6));
      const lh = size * 1.25;
      const pad = 3;
      const colW = group.map((ci) => sh.colWidths[ci] * scale);
      const xs: number[] = [];
      colW.reduce((x, c) => (xs.push(x), x + c), w.m.l);
      const tableW = colW.reduce((a, b) => a + b, 0);

      if (sheets.length > 1) {
        await w.paragraph([{ text: sh.name, style: { ...reg, size: 8, bold: true, color: [0.4, 0.4, 0.4] } }], { spaceAfter: 4 });
      }

      for (const row of sh.rows) {
        // lay out each cell to find the row height
        const laid = group.map((ci, gi) => {
          const cell = row[ci];
          if (!cell) return null;
          const style: Style = { ...reg, size, bold: cell.bold };
          const runs: Run[] = [{ text: cell.text, style }];
          const opts: ParaOpts = { align: cell.num ? "right" : "left", lineHeight: 1.25 };
          return { lines: w.layoutLines(runs, colW[gi] - pad * 2, opts), opts };
        });
        const rowH = Math.max(lh + 2, ...laid.map((l) => (l ? l.lines.reduce((a, ln) => a + ln.height, 0) + 3 : 0)));
        if (w.y + rowH > w.bottom && !w.atPageTop) w.newPage();
        const top = w.y;
        laid.forEach((l, gi) => {
          if (l) w.drawLines(w.page, l.lines, xs[gi] + pad, top + 1.5, colW[gi] - pad * 2, l.opts);
        });
        if (o.gridlines) {
          w.page.drawLine({ start: { x: w.m.l, y: w.pdfY(top + rowH) }, end: { x: w.m.l + tableW, y: w.pdfY(top + rowH) }, thickness: 0.3, color: w.color(gray) });
          xs.forEach((x) => w.page.drawLine({ start: { x, y: w.pdfY(top) }, end: { x, y: w.pdfY(top + rowH) }, thickness: 0.3, color: w.color(gray) }));
          w.page.drawLine({ start: { x: w.m.l + tableW, y: w.pdfY(top) }, end: { x: w.m.l + tableW, y: w.pdfY(top + rowH) }, thickness: 0.3, color: w.color(gray) });
          w.page.drawLine({ start: { x: w.m.l, y: w.pdfY(top) }, end: { x: w.m.l + tableW, y: w.pdfY(top) }, thickness: 0.3, color: w.color(gray) });
        }
        w.y = top + rowH;
      }
      pagesDone++;
    }
  }
  const bytes = await w.save();
  return { bytes, pages: w.doc.getPageCount(), unsupported: Array.from(w.unsupported) };
}
