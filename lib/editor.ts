/**
 * PDF EDITOR ENGINE (client-side)
 * ---------------------------------------------------------------------------
 * The editor never modifies the original PDF while you work. Every change is a
 * small "edit object" (text, rectangle, drawing, image) stored in memory in
 * PAGE COORDINATES: points (1/72 inch), origin at the top-left of the page as
 * it is displayed. When the user presses Done, buildEditedPdf() draws all
 * objects onto the original file with pdf-lib and returns the new PDF.
 *
 * "Editing existing text" works like this:
 *   1. find the text (pdf.js text layer, or OCR for scans),
 *   2. sample the page colours around it,
 *   3. paint a cover rectangle in the background colour,
 *   4. draw the new text on top, at the same baseline and size.
 *
 * Important: step 3 hides the old text but does not delete it from the file.
 * The "flatten" export option redraws edited pages as images so the old text is
 * really gone.
 */

import {
  PDFDocument,
  StandardFonts,
  LineCapStyle,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OcrLine } from "@/lib/ocr";
import {
  canvasToBlob,
  closePdf,
  getPdfjs,
  openPdf,
  releaseCanvas,
  renderPageToCanvas,
  type ReportFn,
} from "@/lib/pdf";

/* -------------------------------------------------------------------- types */

export type StdFamily = "helvetica" | "times" | "courier";

export type CustomFont = {
  id: string; // "custom-1"
  name: string;
  ext: string; // "ttf" | "otf"
  bytes: Uint8Array;
  ascent: number; // em fractions, positive
  descent: number; // em fractions, positive
};

type Base = { id: string; page: number };

export type TextObj = Base & {
  kind: "text";
  x: number; // top-left of the first line box, in points
  y: number;
  text: string;
  fontSize: number;
  font: string; // StdFamily or a CustomFont id
  bold: boolean;
  italic: boolean;
  color: string; // #rrggbb
  /** Id of the detected text box this object replaces (so it is not offered for editing twice). */
  fromBox?: string;
  /** Painted behind the text when it replaces existing text. Stays put if the text is moved. */
  cover?: { x: number; y: number; w: number; h: number; color: string };
};

export type RectObj = Base & {
  kind: "rect";
  variant: "whiteout" | "highlight" | "box";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  opacity: number;
};

export type DrawObj = Base & {
  kind: "draw";
  points: number[]; // x0,y0,x1,y1,...
  color: string;
  width: number;
};

export type ImageObj = Base & {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  url: string; // object URL for the on-screen preview
};

export type EditObj = TextObj | RectObj | DrawObj | ImageObj;

export type TextBox = {
  id: string;
  source: "pdf" | "ocr";
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number; // y of the text baseline, in points
  text: string;
  fontSize: number;
  family: StdFamily;
  bold: boolean;
  italic: boolean;
};

/* ------------------------------------------------------------ font metrics */

export const LINE_HEIGHT = 1.2;

const STD_METRICS: Record<StdFamily, { ascent: number; descent: number }> = {
  helvetica: { ascent: 0.905, descent: 0.212 }, // Arial / Liberation Sans
  times: { ascent: 0.891, descent: 0.216 }, // Times New Roman / Liberation Serif
  courier: { ascent: 0.8325, descent: 0.3003 }, // Courier New / Liberation Mono
};

export function isStdFamily(font: string): font is StdFamily {
  return font === "helvetica" || font === "times" || font === "courier";
}

export function fontMetrics(font: string, customs: CustomFont[]): { ascent: number; descent: number } {
  if (isStdFamily(font)) return STD_METRICS[font];
  const c = customs.find((f) => f.id === font);
  return c ? { ascent: c.ascent, descent: c.descent } : STD_METRICS.helvetica;
}

/**
 * Distance from the top of a line box to its baseline. The preview uses CSS
 * line-height 1.2, so the half-leading is split evenly above and below the
 * font's ascent+descent. The exporter uses the same formula, so what you see
 * is where the text lands in the PDF.
 */
export function baselineOffset(metrics: { ascent: number; descent: number }, fontSize: number): number {
  return ((LINE_HEIGHT - (metrics.ascent + metrics.descent)) / 2 + metrics.ascent) * fontSize;
}

export function cssFontFamily(font: string): string {
  switch (font) {
    case "times":
      return '"Times New Roman", Times, "Liberation Serif", serif';
    case "courier":
      return '"Courier New", Courier, "Liberation Mono", monospace';
    case "helvetica":
      return 'Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif';
    default:
      return `"pf-${font}", Arial, sans-serif`;
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Width in points of one line of text. */
export function measureLine(text: string, o: { font: string; bold: boolean; italic: boolean }, fontSize: number): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontSize * 0.5;
  // Measure at 100px for precision, then scale.
  measureCtx.font = `${o.italic ? "italic " : ""}${o.bold ? "700 " : "400 "}100px ${cssFontFamily(o.font)}`;
  return (measureCtx.measureText(text).width / 100) * fontSize;
}

export function measureBlock(text: string, o: { font: string; bold: boolean; italic: boolean }, fontSize: number) {
  const lines = text.split("\n");
  const w = Math.max(...lines.map((l) => measureLine(l, o, fontSize)), fontSize * 0.5);
  return { w, h: lines.length * fontSize * LINE_HEIGHT };
}

/* ----------------------------------------------------- WinAnsi (std fonts) */

const WIN_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019,
  0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function isWinAnsi(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_EXTRA.has(c);
}

/** Characters the 14 standard PDF fonts cannot draw (everything outside Western European text). */
export function unsupportedChars(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of Array.from(text)) {
    if (ch === "\n" || ch === "\t" || ch === "\r") continue;
    if (!isWinAnsi(ch)) bad.add(ch);
  }
  return Array.from(bad);
}

/* ----------------------------------------------------------------- colours */

export function toRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

/**
 * Look at the rendered page around a text box and work out (a) the background
 * colour (most common colour in a thin ring just outside the box) and (b) the
 * ink colour (the pixels in the box furthest from the background).
 * `r` is in canvas pixels.
 */
export function sampleColors(canvas: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }): { bg: string; fg: string } {
  if (canvas.width === 0 || canvas.height === 0) return { bg: "#ffffff", fg: "#000000" };
  const pad = 3;
  const ix0 = Math.max(0, Math.floor(r.x));
  const iy0 = Math.max(0, Math.floor(r.y));
  const ix1 = Math.min(canvas.width, Math.ceil(r.x + r.w));
  const iy1 = Math.min(canvas.height, Math.ceil(r.y + r.h));
  const ox0 = Math.max(0, ix0 - pad);
  const oy0 = Math.max(0, iy0 - pad);
  const ox1 = Math.min(canvas.width, ix1 + pad);
  const oy1 = Math.min(canvas.height, iy1 + pad);
  if (ox1 <= ox0 || oy1 <= oy0) return { bg: "#ffffff", fg: "#000000" };
  const w = ox1 - ox0;
  // Copy just the area we need into a small scratch canvas and read that, so the (large) page
  // canvas never has to be read back.
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = oy1 - oy0;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!sctx) return { bg: "#ffffff", fg: "#000000" };
  sctx.drawImage(canvas, ox0, oy0, w, oy1 - oy0, 0, 0, w, oy1 - oy0);
  const data = sctx.getImageData(0, 0, w, oy1 - oy0).data;

  // Background: histogram of the ring pixels (quantised so noise/JPEG artefacts group together).
  const hist = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = oy0; y < oy1; y++) {
    for (let x = ox0; x < ox1; x++) {
      const inside = x >= ix0 && x < ix1 && y >= iy0 && y < iy1;
      if (inside) continue;
      const i = ((y - oy0) * w + (x - ox0)) * 4;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const e = hist.get(key);
      if (e) {
        e.n++;
        e.r += data[i];
        e.g += data[i + 1];
        e.b += data[i + 2];
      } else hist.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  hist.forEach((e) => {
    if (!best || e.n > best.n) best = e;
  });
  let bgR = 255;
  let bgG = 255;
  let bgB = 255;
  if (best) {
    const b = best as { n: number; r: number; g: number; b: number };
    bgR = b.r / b.n;
    bgG = b.g / b.n;
    bgB = b.b / b.n;
  }

  // Ink: average of the pixels inside the box that differ most from the background.
  let maxD = 0;
  for (let y = iy0; y < iy1; y++) {
    for (let x = ix0; x < ix1; x++) {
      const i = ((y - oy0) * w + (x - ox0)) * 4;
      const d = Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
      if (d > maxD) maxD = d;
    }
  }
  let fg: string;
  if (maxD < 60) {
    fg = bgR * 0.299 + bgG * 0.587 + bgB * 0.114 > 140 ? "#000000" : "#ffffff";
  } else {
    let n = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let y = iy0; y < iy1; y++) {
      for (let x = ix0; x < ix1; x++) {
        const i = ((y - oy0) * w + (x - ox0)) * 4;
        const d = Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
        if (d >= maxD * 0.85) {
          n++;
          sr += data[i];
          sg += data[i + 1];
          sb += data[i + 2];
        }
      }
    }
    fg = n ? toHex(sr / n, sg / n, sb / n) : "#000000";
  }
  return { bg: toHex(bgR, bgG, bgB), fg };
}

/* ---------------------------------------------------------------- geometry */

export type Geo = { bx: number; by: number; w0: number; h0: number; rot: 0 | 90 | 180 | 270 };

export function geoFromPage(page: PDFPage): Geo {
  const box = page.getCropBox();
  const a = ((Math.round(page.getRotation().angle / 90) * 90) % 360 + 360) % 360;
  return { bx: box.x, by: box.y, w0: box.width, h0: box.height, rot: a as Geo["rot"] };
}

/**
 * Convert a point in DISPLAY space (points, origin top-left of the page as the
 * viewer shows it, including the page's /Rotate) into PDF user space.
 */
export function toUser(g: Geo, dx: number, dy: number): [number, number] {
  switch (g.rot) {
    case 90:
      return [g.bx + dy, g.by + dx];
    case 180:
      return [g.bx + g.w0 - dx, g.by + dy];
    case 270:
      return [g.bx + g.w0 - dy, g.by + g.h0 - dx];
    default:
      return [g.bx + dx, g.by + g.h0 - dy];
  }
}

/* ------------------------------------------------------------------ export */

export type BuildResult = { bytes: Uint8Array; warnings: string[]; editedPages: number[] };

const STD_FONT_MAP: Record<StdFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

/** Draw every edit object onto the PDF. This is where the client-side magic ends up in the file. */
export async function buildEditedPdf(bytes: Uint8Array, objects: EditObj[], customs: CustomFont[]): Promise<BuildResult> {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const warnings = new Set<string>();
  const edited = new Set<number>();
  const fontCache = new Map<string, { font: PDFFont; std: boolean }>();
  const imageCache = new Map<string, PDFImage>();
  let fontkitRegistered = false;

  const getFont = async (font: string, bold: boolean, italic: boolean) => {
    const key = `${font}|${bold}|${italic}`;
    const hit = fontCache.get(key);
    if (hit) return hit;
    let entry: { font: PDFFont; std: boolean };
    const custom = customs.find((c) => c.id === font);
    if (custom) {
      if (!fontkitRegistered) {
        const fk = (await import("@pdf-lib/fontkit")).default;
        doc.registerFontkit(fk);
        fontkitRegistered = true;
      }
      entry = { font: await doc.embedFont(custom.bytes, { subset: custom.ext === "ttf" }), std: false };
    } else {
      const fam: StdFamily = isStdFamily(font) ? font : "helvetica";
      const idx = (bold ? 1 : 0) + (italic ? 2 : 0);
      entry = { font: await doc.embedFont(STD_FONT_MAP[fam][idx]), std: true };
    }
    fontCache.set(key, entry);
    return entry;
  };

  const drawRect = (page: PDFPage, g: Geo, x: number, y: number, w: number, h: number, color: string, opacity: number) => {
    const [ax, ay] = toUser(g, x, y);
    const [bx, by] = toUser(g, x + w, y + h);
    page.drawRectangle({
      x: Math.min(ax, bx),
      y: Math.min(ay, by),
      width: Math.abs(bx - ax),
      height: Math.abs(by - ay),
      color: toRgb(color),
      opacity,
      borderWidth: 0,
    });
  };

  for (const o of objects) {
    const page = pages[o.page];
    if (!page) continue;
    const g = geoFromPage(page);

    if (o.kind === "rect") {
      drawRect(page, g, o.x, o.y, o.w, o.h, o.fill, o.opacity);
      edited.add(o.page);
    } else if (o.kind === "text") {
      if (o.cover) drawRect(page, g, o.cover.x, o.cover.y, o.cover.w, o.cover.h, o.cover.color, 1);
      const text = o.text.replace(/\r/g, "").replace(/\t/g, "    ");
      if (text.trim()) {
        const { font, std } = await getFont(o.font, o.bold, o.italic);
        const m = fontMetrics(o.font, customs);
        const lineH = o.fontSize * LINE_HEIGHT;
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (!line.trim()) continue;
          if (std) {
            const bad = unsupportedChars(line);
            if (bad.length) {
              bad.forEach((c) => warnings.add(c));
              line = Array.from(line)
                .map((c) => (c === "\n" || isWinAnsi(c) ? c : "?"))
                .join("");
            }
          }
          const [ux, uy] = toUser(g, o.x, o.y + baselineOffset(m, o.fontSize) + i * lineH);
          page.drawText(line, { x: ux, y: uy, size: o.fontSize, font, color: toRgb(o.color), rotate: degrees(g.rot) });
        }
      }
      edited.add(o.page);
    } else if (o.kind === "draw") {
      const color = toRgb(o.color);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) pts.push(toUser(g, o.points[i], o.points[i + 1]));
      if (pts.length === 1) {
        page.drawCircle({ x: pts[0][0], y: pts[0][1], size: o.width / 2, color });
      }
      for (let i = 1; i < pts.length; i++) {
        page.drawLine({
          start: { x: pts[i - 1][0], y: pts[i - 1][1] },
          end: { x: pts[i][0], y: pts[i][1] },
          thickness: o.width,
          color,
          lineCap: LineCapStyle.Round,
        });
      }
      edited.add(o.page);
    } else if (o.kind === "image") {
      let img = imageCache.get(o.id);
      if (!img) {
        img = o.mime === "image/png" ? await doc.embedPng(o.bytes) : await doc.embedJpg(o.bytes);
        imageCache.set(o.id, img);
      }
      const [ux, uy] = toUser(g, o.x, o.y + o.h); // the image's bottom-left corner, as displayed
      page.drawImage(img, { x: ux, y: uy, width: o.w, height: o.h, rotate: degrees(g.rot) });
      edited.add(o.page);
    }
  }

  return { bytes: await doc.save(), warnings: Array.from(warnings), editedPages: Array.from(edited).sort((a, b) => a - b) };
}

/**
 * Redraw the given pages as images so any text hidden under cover rectangles
 * is permanently gone. Other pages are copied unchanged.
 */
export async function flattenPages(bytes: Uint8Array, pageIdx: number[], report: ReportFn, scale = 2.5): Promise<Uint8Array> {
  if (pageIdx.length === 0) return bytes;
  const flat = new Set(pageIdx);
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const pdf = await openPdf(bytes);
  try {
    const n = src.getPageCount();
    for (let i = 0; i < n; i++) {
      report(i / n, `Finishing page ${i + 1} of ${n}`);
      if (flat.has(i)) {
        const { canvas, pointsWidth, pointsHeight } = await renderPageToCanvas(pdf, i + 1, scale, 5000);
        const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
        releaseCanvas(canvas);
        const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const page = out.addPage([pointsWidth, pointsHeight]);
        page.drawImage(img, { x: 0, y: 0, width: pointsWidth, height: pointsHeight });
      } else {
        const [copied] = await out.copyPages(src, [i]);
        out.addPage(copied);
      }
    }
  } finally {
    closePdf(pdf);
  }
  return out.save();
}

/* ------------------------------------------------- text detection (pdf.js) */

export type RawTextItem = {
  str: string;
  x: number;
  baseline: number;
  w: number;
  size: number;
  ascent: number;
  descent: number;
  family: StdFamily;
  bold: boolean;
  italic: boolean;
};

/**
 * Merge the small text fragments pdf.js reports into whole lines (one box per
 * run of text on the same baseline). Large horizontal gaps start a new box so
 * table cells and columns stay separate.
 */
export function groupTextItems(items: RawTextItem[]): Omit<TextBox, "id" | "source">[] {
  const usable = items.filter((i) => i.str.trim() !== "" && i.size > 0.5);
  usable.sort((a, b) => a.baseline - b.baseline || a.x - b.x);

  const rows: RawTextItem[][] = [];
  for (const it of usable) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].baseline - it.baseline) < 0.35 * Math.min(row[0].size, it.size)) row.push(it);
    else rows.push([it]);
  }

  const boxes: Omit<TextBox, "id" | "source">[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: RawTextItem[] = [];
    const flush = () => {
      if (!cur.length) return;
      const first = cur[0];
      let text = "";
      let prevEnd = first.x;
      cur.forEach((it, idx) => {
        const gap = it.x - prevEnd;
        if (idx > 0 && gap > 0.15 * first.size && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        text += it.str;
        prevEnd = it.x + it.w;
      });
      const asc = Math.min(Math.max(first.ascent, 0.6), 1.1);
      const desc = Math.min(Math.max(first.descent, 0.1), 0.4);
      const last = cur[cur.length - 1];
      boxes.push({
        x: first.x,
        y: first.baseline - asc * first.size,
        w: last.x + last.w - first.x,
        h: (asc + desc) * first.size,
        baseline: first.baseline,
        text: text.replace(/\s+$/, ""),
        fontSize: first.size,
        family: first.family,
        bold: first.bold,
        italic: first.italic,
      });
      cur = [];
    };
    let prevEnd = -Infinity;
    for (const it of row) {
      if (cur.length && it.x - prevEnd > 1.5 * cur[0].size) flush();
      cur.push(it);
      prevEnd = it.x + it.w;
    }
    flush();
  }
  return boxes;
}

function guessFamily(realName: string, generic: string): StdFamily {
  const n = realName.toLowerCase();
  if (/courier|mono|consolas|menlo|typewriter/.test(n) || generic === "monospace") return "courier";
  if (
    ((/times|serif|georgia|garamond|palatino|minion|cambria|bodoni|didot|caslon|century|baskerville|roman/.test(n) && !/sans/.test(n)) ||
      generic === "serif") &&
    !/sans/.test(n)
  ) {
    return "times";
  }
  return "helvetica";
}

/** Read the real text of a PDF page as editable boxes in display points. */
export async function extractPdfTextBoxes(pdf: PDFDocumentProxy, pageIndex: number): Promise<TextBox[]> {
  const pdfjs = await getPdfjs();
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  try {
    await page.getOperatorList(); // makes pdf.js load the fonts so their real names are known
  } catch {
    /* names are a bonus; carry on without them */
  }

  const raw: RawTextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    const t = pdfjs.Util.transform(viewport.transform, item.transform) as number[];
    // Skip rotated/sheared text: we only support horizontal text for now.
    if (Math.abs(t[1]) > 0.02 * Math.abs(t[0])) continue;
    const size = Math.hypot(t[2], t[3]);
    const style = (content.styles as Record<string, { fontFamily?: string; ascent?: number; descent?: number }>)[item.fontName] ?? {};
    let realName = "";
    let bold = false;
    let italic = false;
    try {
      const f = page.commonObjs.get(item.fontName) as { name?: string; bold?: boolean; italic?: boolean } | undefined;
      realName = f?.name ?? "";
      bold = Boolean(f?.bold);
      italic = Boolean(f?.italic);
    } catch {
      /* font object not available */
    }
    bold = bold || /bold|black|heavy|semibold|demi/i.test(realName);
    italic = italic || /italic|oblique/i.test(realName);
    raw.push({
      str: item.str,
      x: t[4],
      baseline: t[5],
      w: Math.abs(item.width * (viewport.scale || 1)),
      size,
      ascent: typeof style.ascent === "number" ? style.ascent : 0.78,
      descent: typeof style.descent === "number" ? Math.abs(style.descent) : 0.24,
      family: guessFamily(realName, style.fontFamily ?? ""),
      bold,
      italic,
    });
  }
  return groupTextItems(raw).map((b, i) => ({ ...b, id: `pdf-${pageIndex}-${i}`, source: "pdf" as const }));
}

/* ------------------------------------------------ OCR lines -> text boxes */

/**
 * Convert OCR lines (image pixels) to text boxes (points). OCR only gives a
 * bounding box, so the font size is estimated from the height of the letters
 * and then fitted so that the text in the guessed font is as wide as the
 * original line. Helvetica vs Times is chosen by whichever fits better.
 */
export function ocrLinesToBoxes(lines: OcrLine[], kx: number, ky: number, pageIndex: number): TextBox[] {
  return lines.map((l, i) => {
    const x = l.x0 * kx;
    const y = l.y0 * ky;
    const w = (l.x1 - l.x0) * kx;
    const h = (l.y1 - l.y0) * ky;
    const baseline = l.baseline * ky;
    const est = Math.max(4, (baseline - y) / 0.73);
    let best = { fam: "helvetica" as StdFamily, size: est, err: Infinity };
    for (const fam of ["helvetica", "times"] as StdFamily[]) {
      const natural = measureLine(l.text, { font: fam, bold: false, italic: false }, est);
      if (natural <= 0) continue;
      const err = Math.abs(Math.log(w / natural));
      if (err < best.err) best = { fam, size: est * (w / natural), err };
    }
    const size = Math.min(Math.max(best.size, est * 0.85), est * 1.15);
    return { id: `ocr-${pageIndex}-${i}`, source: "ocr" as const, x, y, w, h, baseline, text: l.text, fontSize: size, family: best.fam, bold: false, italic: false };
  });
}

/* ------------------------------------------- text box -> editable object */

/**
 * Build the edit object that replaces a detected text box: same position,
 * baseline and size, colours sampled from the page, with a cover rectangle in
 * the background colour. `pxPerPt` is the pixel density of `pageCanvas`.
 */
export function textObjFromBox(box: TextBox, page: number, id: string, pageCanvas: HTMLCanvasElement | null, pxPerPt: number): TextObj {
  const colors = pageCanvas
    ? sampleColors(pageCanvas, { x: box.x * pxPerPt, y: box.y * pxPerPt, w: box.w * pxPerPt, h: box.h * pxPerPt })
    : { bg: "#ffffff", fg: "#000000" };
  const padX = box.fontSize * 0.12;
  const padY = box.fontSize * 0.08;
  return {
    id,
    kind: "text",
    page,
    fromBox: box.id,
    x: box.x,
    y: box.baseline - baselineOffset(STD_METRICS[box.family], box.fontSize),
    text: box.text,
    fontSize: box.fontSize,
    font: box.family,
    bold: box.bold,
    italic: box.italic,
    color: colors.fg,
    cover: { x: box.x - padX, y: box.y - padY, w: box.w + 2 * padX, h: box.h + 2 * padY, color: colors.bg },
  };
}

/* ------------------------------------------------------ custom font upload */

/** Read ascent/descent (as fractions of the em) from a TTF/OTF file's `hhea` and `head` tables. */
export function readFontMetrics(bytes: Uint8Array): { ascent: number; descent: number } | null {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numTables = v.getUint16(4);
    let hhea = -1;
    let head = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(v.getUint8(rec), v.getUint8(rec + 1), v.getUint8(rec + 2), v.getUint8(rec + 3));
      const offset = v.getUint32(rec + 8);
      if (tag === "hhea") hhea = offset;
      if (tag === "head") head = offset;
    }
    if (hhea < 0 || head < 0) return null;
    const unitsPerEm = v.getUint16(head + 18);
    const ascent = v.getInt16(hhea + 4) / unitsPerEm;
    const descent = Math.abs(v.getInt16(hhea + 6)) / unitsPerEm;
    if (!(ascent > 0) || !(descent >= 0) || ascent > 2 || descent > 1) return null;
    return { ascent, descent };
  } catch {
    return null;
  }
}
