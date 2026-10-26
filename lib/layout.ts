/*
 * FLOW LAYOUT ENGINE for "document -> PDF" tools (Word, code, notebooks).
 *
 * Runs in the browser with pdf-lib. Text is measured with the 14 standard PDF
 * fonts, so only Western European characters (WinAnsi) can be drawn. Anything
 * else becomes "?" and is counted in `writer.unsupported` so the UI can warn.
 *
 * Pieces:
 *  - PdfWriter: page cursor, paragraphs (wrap, align, justify, bullets, tabs),
 *    images, monospace code blocks, page breaks.
 *  - layoutLines() / drawLines(): split measuring from drawing, so table cells
 *    can be measured first (row height) and drawn afterwards.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

/* Characters the standard fonts can draw (Windows-1252). Same rule as lib/editor.ts. */
const WIN_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019,
  0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
function isWinAnsi(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_EXTRA.has(c);
}

export type Family = "helvetica" | "times" | "courier";
export type RGB = [number, number, number];

export type Style = {
  family: Family;
  bold: boolean;
  italic: boolean;
  size: number;
  color?: RGB;
  underline?: boolean;
  strike?: boolean;
};

export type Run = { text: string; style: Style } | { tab: true; style: Style } | { br: true };

export type ParaOpts = {
  align?: "left" | "center" | "right" | "justify";
  indentLeft?: number;
  /** First-line indent; negative = hanging (used by list items). */
  indentFirst?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  /** Line height as a multiple of the font size (default 1.2). */
  lineHeight?: number;
  bullet?: { text: string; style: Style };
  /** Size used for an empty paragraph. */
  emptySize?: number;
};

type Tok = { kind: "word" | "space" | "tab" | "br"; text: string; style: Style; w: number };
export type Line = { toks: Tok[]; width: number; height: number; lead: number; last: boolean; size: number };

const FONT_NAMES: Record<Family, [string, string, string, string]> = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

const REPLACEMENTS: Record<string, string> = {
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  "‑": "-",
  "‐": "-",
  "‒": "-",
  "−": "-",
  "→": "->",
  "←": "<-",
  "⇒": "=>",
  "✓": "v",
  "✔": "v",
  "✗": "x",
  "✘": "x",
  "●": "•",
  "○": "o",
  "▪": "•",
  "‣": "•",
  "⁃": "-",
  "­": "",
  "​": "",
  "‌": "",
  "‍": "",
  "‎": "",
  "‏": "",
  "﻿": "",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "×": "×",
  "₹": "Rs.",
};

export const mm = (n: number) => (n * 72) / 25.4;
export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

export class PdfWriter {
  doc!: PDFDocument;
  page!: PDFPage;
  y = 0; // cursor measured from the top of the page
  pageW: number;
  pageH: number;
  m: { t: number; r: number; b: number; l: number };
  unsupported = new Set<string>();
  private fonts = new Map<string, PDFFont>();

  private constructor(pageW: number, pageH: number, m: { t: number; r: number; b: number; l: number }) {
    this.pageW = pageW;
    this.pageH = pageH;
    this.m = m;
  }

  static async create(pageW: number, pageH: number, margins: { t: number; r: number; b: number; l: number }): Promise<PdfWriter> {
    const w = new PdfWriter(pageW, pageH, margins);
    w.doc = await PDFDocument.create();
    w.newPage();
    return w;
  }

  get contentW() {
    return this.pageW - this.m.l - this.m.r;
  }
  get bottom() {
    return this.pageH - this.m.b;
  }
  get atPageTop() {
    return this.y <= this.m.t + 0.5;
  }

  newPage() {
    this.page = this.doc.addPage([this.pageW, this.pageH]);
    this.y = this.m.t;
  }

  /** Switch page size/margins (new sheet, new orientation). Reuses the current page if it is still empty. */
  startSection(pageW: number, pageH: number, margins: { t: number; r: number; b: number; l: number }) {
    const reuse = this.atPageTop;
    this.pageW = pageW;
    this.pageH = pageH;
    this.m = margins;
    if (reuse) {
      this.page.setSize(pageW, pageH);
      this.y = margins.t;
    } else this.newPage();
  }

  /** Start a new page unless the current one is still empty. */
  pageBreak() {
    if (!this.atPageTop) this.newPage();
  }

  ensureSpace(h: number) {
    if (this.y + h > this.bottom && !this.atPageTop) this.newPage();
  }

  /* ----------------------------------------------------------------- fonts */

  async ensureFont(s: Pick<Style, "family" | "bold" | "italic">): Promise<PDFFont> {
    const key = `${s.family}${s.bold ? "b" : ""}${s.italic ? "i" : ""}`;
    let f = this.fonts.get(key);
    if (!f) {
      f = await this.doc.embedFont(FONT_NAMES[s.family][(s.bold ? 1 : 0) + (s.italic ? 2 : 0)]);
      this.fonts.set(key, f);
    }
    return f;
  }

  private font(s: Pick<Style, "family" | "bold" | "italic">): PDFFont {
    const f = this.fonts.get(`${s.family}${s.bold ? "b" : ""}${s.italic ? "i" : ""}`);
    if (!f) throw new Error("font not prepared");
    return f;
  }

  async prepare(runs: Run[]) {
    const seen = new Set<string>();
    for (const r of runs) {
      if ("br" in r) continue;
      const k = `${r.style.family}${r.style.bold}${r.style.italic}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await this.ensureFont(r.style);
    }
  }

  /** Replace characters the standard fonts cannot draw. */
  clean(text: string): string {
    let out = "";
    for (const ch of Array.from(text)) {
      const rep = REPLACEMENTS[ch];
      if (rep !== undefined) {
        out += rep;
      } else if (ch === "\n" || ch === "\r" || ch === "\t") {
        out += " ";
      } else if (isWinAnsi(ch)) {
        out += ch;
      } else {
        this.unsupported.add(ch);
        out += "?";
      }
    }
    return out;
  }

  width(text: string, s: Style): number {
    return this.font(s).widthOfTextAtSize(text, s.size);
  }

  /* ---------------------------------------------------------------- layout */

  /** Break runs into lines for the given width. Fonts must be prepared. */
  layoutLines(runs: Run[], width: number, o: ParaOpts = {}): Line[] {
    const lineMult = o.lineHeight ?? 1.2;
    const indentL = o.indentLeft ?? 0;
    const indentF = o.indentFirst ?? 0;

    const toks: Tok[] = [];
    for (const r of runs) {
      if ("br" in r) {
        toks.push({ kind: "br", text: "", style: { family: "helvetica", bold: false, italic: false, size: o.emptySize ?? 11 }, w: 0 });
        continue;
      }
      if ("tab" in r) {
        toks.push({ kind: "tab", text: "", style: r.style, w: 0 });
        continue;
      }
      const parts = this.clean(r.text).split(/( +)/);
      for (const part of parts) {
        if (part === "") continue;
        if (/^ +$/.test(part)) toks.push({ kind: "space", text: part, style: r.style, w: this.width(part, r.style) });
        else toks.push({ kind: "word", text: part, style: r.style, w: this.width(part, r.style) });
      }
    }

    const lines: Line[] = [];
    let cur: Tok[] = [];
    let used = 0;
    let first = true;

    const startX = () => indentL + (first ? indentF : 0);
    const avail = () => Math.max(20, width - startX());

    const finish = (last: boolean) => {
      while (cur.length && cur[cur.length - 1].kind === "space") {
        used -= cur[cur.length - 1].w;
        cur.pop();
      }
      const size = cur.reduce((m, t) => Math.max(m, t.style.size), 0) || (o.emptySize ?? 11);
      lines.push({ toks: cur, width: used, height: size * lineMult, lead: startX(), last, size });
      cur = [];
      used = 0;
      first = false;
    };

    for (const t of toks) {
      if (t.kind === "br") {
        finish(true);
        continue;
      }
      if (t.kind === "tab") {
        const pos = startX() + used;
        const next = (Math.floor(pos / 36) + 1) * 36;
        const w = Math.min(next - pos, avail() - used);
        if (w > 0) {
          cur.push({ ...t, w });
          used += w;
        }
        continue;
      }
      if (t.kind === "space") {
        if (cur.length) {
          cur.push(t);
          used += t.w;
        }
        continue;
      }
      // word
      if (used + t.w > avail() && cur.length) finish(false);
      if (t.w > avail()) {
        // a single word wider than the line: split it by characters
        let piece = "";
        for (const ch of Array.from(t.text)) {
          const w = this.width(piece + ch, t.style);
          if (w > avail() - used && piece) {
            cur.push({ kind: "word", text: piece, style: t.style, w: this.width(piece, t.style) });
            used += this.width(piece, t.style);
            finish(false);
            piece = ch;
          } else piece += ch;
        }
        if (piece) {
          const w = this.width(piece, t.style);
          cur.push({ kind: "word", text: piece, style: t.style, w });
          used += w;
        }
        continue;
      }
      cur.push(t);
      used += t.w;
    }
    finish(true);
    // an empty trailing line after a final <br> is dropped, except for fully empty paragraphs
    if (lines.length > 1 && lines[lines.length - 1].toks.length === 0) lines.pop();
    return lines;
  }

  /** Draw already-measured lines with their top edge at `top` (page-top coordinates). */
  drawLines(page: PDFPage, lines: Line[], x: number, top: number, width: number, o: ParaOpts = {}): number {
    let y = top;
    const align = o.align ?? "left";
    lines.forEach((ln, idx) => {
      const baseline = y + (ln.height - ln.size * 1.2) / 2 + ln.size * 0.95;
      let cx = x + ln.lead;
      const room = width - ln.lead;
      const extra = room - ln.width;
      let gap = 0;
      if (align === "center") cx += Math.max(0, extra / 2);
      else if (align === "right") cx += Math.max(0, extra);
      else if (align === "justify" && !ln.last && extra > 0) {
        const spaces = ln.toks.filter((t) => t.kind === "space").length;
        if (spaces) gap = extra / spaces;
      }
      if (idx === 0 && o.bullet) {
        // The bullet sits just left of the text column (hanging style).
        const b = o.bullet;
        const bw = this.width(b.text, b.style);
        page.drawText(b.text, { x: x + (o.indentLeft ?? 0) - bw - 5, y: this.pdfY(baseline), size: b.style.size, font: this.font(b.style), color: this.color(b.style.color) });
      }
      for (const t of ln.toks) {
        const w = t.kind === "space" ? t.w + gap : t.w;
        if (t.kind === "word") {
          const f = this.font(t.style);
          page.drawText(t.text, { x: cx, y: this.pdfY(baseline), size: t.style.size, font: f, color: this.color(t.style.color) });
          if (t.style.underline) page.drawLine({ start: { x: cx, y: this.pdfY(baseline + t.style.size * 0.12) }, end: { x: cx + w, y: this.pdfY(baseline + t.style.size * 0.12) }, thickness: Math.max(0.4, t.style.size * 0.05), color: this.color(t.style.color) });
          if (t.style.strike) page.drawLine({ start: { x: cx, y: this.pdfY(baseline - t.style.size * 0.3) }, end: { x: cx + w, y: this.pdfY(baseline - t.style.size * 0.3) }, thickness: Math.max(0.4, t.style.size * 0.05), color: this.color(t.style.color) });
        }
        cx += w;
      }
      y += ln.height;
    });
    return y - top;
  }

  pdfY(topY: number) {
    return this.pageH - topY;
  }

  color(c?: RGB) {
    return c ? rgb(c[0], c[1], c[2]) : rgb(0, 0, 0);
  }

  /* ------------------------------------------------------------- paragraph */

  async paragraph(runs: Run[], o: ParaOpts = {}) {
    await this.prepare(runs);
    if (o.bullet) await this.ensureFont(o.bullet.style);
    const x = this.m.l;
    const width = this.contentW;
    const lines = this.layoutLines(runs, width, o);
    if (!this.atPageTop) this.y += o.spaceBefore ?? 0;
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i];
      if (this.y + ln.height > this.bottom && !this.atPageTop) this.newPage();
      this.y += this.drawLines(this.page, [ln], x, this.y, width, { ...o, bullet: i === 0 ? o.bullet : undefined });
      i++;
    }
    this.y += o.spaceAfter ?? 0;
  }

  /* ----------------------------------------------------------------- image */

  async image(bytes: Uint8Array, kind: "png" | "jpg", w: number, h: number, align: "left" | "center" = "left") {
    const img = kind === "png" ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    let dw = w > 0 ? w : img.width;
    let dh = h > 0 ? h : img.height;
    const maxW = this.contentW;
    const maxH = this.pageH - this.m.t - this.m.b;
    const s = Math.min(1, maxW / dw, maxH / dh);
    dw *= s;
    dh *= s;
    this.ensureSpace(dh);
    const x = this.m.l + (align === "center" ? (maxW - dw) / 2 : 0);
    this.page.drawImage(img, { x, y: this.pdfY(this.y + dh), width: dw, height: dh });
    this.y += dh + 4;
  }

  /* ------------------------------------------------------------- code block */

  /**
   * Draw monospace rows. Each row is a list of coloured segments. Long rows
   * wrap with a small continuation indent.
   */
  async codeBlock(
    rows: { segs: { text: string; color?: RGB; bold?: boolean; italic?: boolean }[]; num?: string }[],
    o: { size: number; bg?: RGB; gutter?: number; pad?: number; border?: RGB },
  ) {
    const regular = await this.ensureFont({ family: "courier", bold: false, italic: false });
    const bold = await this.ensureFont({ family: "courier", bold: true, italic: false });
    const italic = await this.ensureFont({ family: "courier", bold: false, italic: true });
    const size = o.size;
    const cw = regular.widthOfTextAtSize("M", size);
    const lh = size * 1.28;
    const pad = o.pad ?? 5;
    const gutter = o.gutter ?? 0;
    const x0 = this.m.l;
    const textX = x0 + pad + gutter;
    const maxChars = Math.max(10, Math.floor((this.contentW - pad * 2 - gutter) / cw));

    for (const row of rows) {
      // flatten segments into characters with colours, then chunk by maxChars
      const chunks: { text: string; color?: RGB; bold?: boolean; italic?: boolean }[][] = [[]];
      let count = 0;
      for (const seg of row.segs) {
        const text = this.clean(seg.text.replace(/\t/g, "    "));
        let rest = text;
        while (rest.length) {
          const room = (chunks.length > 1 ? maxChars - 2 : maxChars) - count;
          if (room <= 0) {
            chunks.push([]);
            count = 0;
            continue;
          }
          const take = rest.slice(0, room);
          chunks[chunks.length - 1].push({ ...seg, text: take });
          count += take.length;
          rest = rest.slice(take.length);
        }
      }
      chunks.forEach((chunk, ci) => {
        if (this.y + lh > this.bottom && !this.atPageTop) this.newPage();
        if (o.bg) this.page.drawRectangle({ x: x0, y: this.pdfY(this.y + lh), width: this.contentW, height: lh + 0.2, color: this.color(o.bg) });
        const base = this.y + lh * 0.5 + size * 0.32;
        if (gutter && ci === 0 && row.num) {
          const nw = regular.widthOfTextAtSize(row.num, size);
          this.page.drawText(row.num, { x: x0 + pad + gutter - nw - 6, y: this.pdfY(base), size, font: regular, color: rgb(0.55, 0.55, 0.55) });
        }
        let cx = textX + (ci > 0 ? cw * 2 : 0);
        for (const seg of chunk) {
          const f = seg.bold ? bold : seg.italic ? italic : regular;
          if (seg.text.trim()) this.page.drawText(seg.text, { x: cx, y: this.pdfY(base), size, font: f, color: this.color(seg.color) });
          cx += cw * seg.text.length;
        }
        this.y += lh;
      });
    }
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
