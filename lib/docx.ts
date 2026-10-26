/*
 * WORD (.docx) -> PDF, entirely in the browser.
 *
 * A .docx is a ZIP of XML files. We read word/document.xml (+ styles,
 * numbering and images) with JSZip + DOMParser and lay the content out with
 * the PdfWriter in lib/layout.ts.
 *
 * Supported: paragraphs, headings and other styles (via styles.xml), bold /
 * italic / underline / strike / colour / size, alignment and justify, spacing,
 * indents, tabs, bullet and numbered lists, tables (borders, shading, column
 * spans), inline PNG/JPEG images, page breaks, page size and margins.
 * Not supported: headers/footers, text boxes, footnotes, fields, EMF/WMF/GIF
 * images, non-Western characters (standard PDF fonts only), exact Word
 * pagination. Output is a faithful *text document*, not a pixel copy.
 */

import JSZip from "jszip";
import { PdfWriter, type Family, type Line, type ParaOpts, type RGB, type Run, type Style } from "@/lib/layout";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

type El = Element;
const kids = (el: El | null | undefined, name: string): El[] =>
  el ? Array.from(el.children).filter((c) => c.localName === name) : [];
const kid = (el: El | null | undefined, name: string): El | null => kids(el, name)[0] ?? null;
const attr = (el: El | null | undefined, name: string): string | null => (el ? el.getAttributeNS(W_NS, name) ?? el.getAttribute(`w:${name}`) : null);
const num = (v: string | null): number | null => (v === null || v === "" || isNaN(Number(v)) ? null : Number(v));

/* ------------------------------------------------------------------ props */

type RunProps = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; size?: number; color?: RGB | null; family?: Family; caps?: boolean; sup?: boolean };
type ParaProps = { align?: ParaOpts["align"]; before?: number; after?: number; line?: number; lineRule?: string; indLeft?: number; indHanging?: number; indFirst?: number; numId?: string; ilvl?: number; pageBreakBefore?: boolean };

function onOff(el: El | null): boolean | undefined {
  if (!el) return undefined;
  const v = attr(el, "val");
  return !(v === "0" || v === "false" || v === "off" || v === "none");
}

function familyFor(name: string | null): Family | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  if (/courier|consolas|mono|menlo|lucida console|code/.test(n)) return "courier";
  if (/times|georgia|garamond|cambria|serif|palatino|book|minion|century|baskerville/.test(n) && !/sans/.test(n)) return "times";
  return "helvetica";
}

function hexColor(v: string | null): RGB | null {
  if (!v || v === "auto" || !/^[0-9a-fA-F]{6}$/.test(v)) return null;
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}

function readRunProps(rPr: El | null): RunProps {
  const p: RunProps = {};
  if (!rPr) return p;
  const b = onOff(kid(rPr, "b"));
  if (b !== undefined) p.bold = b;
  const i = onOff(kid(rPr, "i"));
  if (i !== undefined) p.italic = i;
  const u = kid(rPr, "u");
  if (u) p.underline = attr(u, "val") !== "none";
  const s = onOff(kid(rPr, "strike"));
  if (s !== undefined) p.strike = s;
  const sz = num(attr(kid(rPr, "sz"), "val"));
  if (sz) p.size = sz / 2;
  const col = kid(rPr, "color");
  if (col) p.color = hexColor(attr(col, "val"));
  const rf = kid(rPr, "rFonts");
  if (rf) p.family = familyFor(attr(rf, "ascii") ?? attr(rf, "hAnsi") ?? attr(rf, "cs"));
  const caps = onOff(kid(rPr, "caps")) ?? onOff(kid(rPr, "smallCaps"));
  if (caps !== undefined) p.caps = caps;
  const va = attr(kid(rPr, "vertAlign"), "val");
  if (va === "superscript" || va === "subscript") p.sup = true;
  return p;
}

function readParaProps(pPr: El | null): ParaProps {
  const p: ParaProps = {};
  if (!pPr) return p;
  const jc = attr(kid(pPr, "jc"), "val");
  if (jc) p.align = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : jc === "both" || jc === "distribute" ? "justify" : "left";
  const sp = kid(pPr, "spacing");
  if (sp) {
    const b = num(attr(sp, "before"));
    const a = num(attr(sp, "after"));
    const l = num(attr(sp, "line"));
    if (b !== null) p.before = b / 20;
    if (a !== null) p.after = a / 20;
    if (l !== null) {
      p.line = l;
      p.lineRule = attr(sp, "lineRule") ?? "auto";
    }
  }
  const ind = kid(pPr, "ind");
  if (ind) {
    const left = num(attr(ind, "left") ?? attr(ind, "start"));
    const hang = num(attr(ind, "hanging"));
    const first = num(attr(ind, "firstLine"));
    if (left !== null) p.indLeft = left / 20;
    if (hang !== null) p.indHanging = hang / 20;
    if (first !== null) p.indFirst = first / 20;
  }
  const numPr = kid(pPr, "numPr");
  if (numPr) {
    const id = attr(kid(numPr, "numId"), "val");
    if (id) p.numId = id;
    const lv = num(attr(kid(numPr, "ilvl"), "val"));
    if (lv !== null) p.ilvl = lv;
  }
  if (onOff(kid(pPr, "pageBreakBefore"))) p.pageBreakBefore = true;
  return p;
}

/* ------------------------------------------------------------------ styles */

type StyleDef = { basedOn?: string; run: RunProps; para: ParaProps; border?: boolean };

class Styles {
  defs = new Map<string, StyleDef>();
  defaultRun: RunProps = { size: 10, family: "helvetica" };
  defaultPara: ParaProps = { after: 0 };
  defaultParaStyle: string | null = null;

  static async load(zip: JSZip): Promise<Styles> {
    const s = new Styles();
    const xml = await zip.file("word/styles.xml")?.async("string");
    if (!xml) return s;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const root = doc.documentElement;
    const dd = kid(root, "docDefaults");
    if (dd) {
      s.defaultRun = { ...s.defaultRun, ...readRunProps(kid(kid(dd, "rPrDefault"), "rPr")) };
      s.defaultPara = { ...s.defaultPara, ...readParaProps(kid(kid(dd, "pPrDefault"), "pPr")) };
    }
    for (const st of kids(root, "style")) {
      const id = attr(st, "styleId");
      if (!id) continue;
      s.defs.set(id, {
        basedOn: attr(kid(st, "basedOn"), "val") ?? undefined,
        run: readRunProps(kid(st, "rPr")),
        para: readParaProps(kid(st, "pPr")),
        border: hasVisibleBorders(kid(kid(st, "tblPr"), "tblBorders")) || undefined,
      });
      if (attr(st, "type") === "paragraph" && attr(st, "default") === "1") s.defaultParaStyle = id;
    }
    return s;
  }

  resolve(id: string | null | undefined, depth = 0): StyleDef {
    const out: StyleDef = { run: {}, para: {} };
    if (!id || depth > 8) return out;
    const d = this.defs.get(id);
    if (!d) return out;
    const base = this.resolve(d.basedOn, depth + 1);
    return { run: { ...base.run, ...d.run }, para: { ...base.para, ...d.para }, border: d.border ?? base.border };
  }
}

/* --------------------------------------------------------------- numbering */

type LevelDef = { fmt: string; text: string; left?: number; hanging?: number };

class Numbering {
  abstracts = new Map<string, Map<number, LevelDef>>();
  nums = new Map<string, string>();
  counters = new Map<string, number[]>();

  static async load(zip: JSZip): Promise<Numbering> {
    const n = new Numbering();
    const xml = await zip.file("word/numbering.xml")?.async("string");
    if (!xml) return n;
    const root = new DOMParser().parseFromString(xml, "application/xml").documentElement;
    for (const an of kids(root, "abstractNum")) {
      const id = attr(an, "abstractNumId");
      if (id === null) continue;
      const levels = new Map<number, LevelDef>();
      for (const lvl of kids(an, "lvl")) {
        const il = num(attr(lvl, "ilvl")) ?? 0;
        const ind = kid(kid(lvl, "pPr"), "ind");
        levels.set(il, {
          fmt: attr(kid(lvl, "numFmt"), "val") ?? "decimal",
          text: attr(kid(lvl, "lvlText"), "val") ?? "%1.",
          left: ind ? (num(attr(ind, "left") ?? attr(ind, "start")) ?? undefined) : undefined,
          hanging: ind ? (num(attr(ind, "hanging")) ?? undefined) : undefined,
        });
      }
      n.abstracts.set(id, levels);
    }
    for (const nm of kids(root, "num")) {
      const id = attr(nm, "numId");
      const a = attr(kid(nm, "abstractNumId"), "val");
      if (id && a) n.nums.set(id, a);
    }
    return n;
  }

  /** Label and text indent (pt) for the next item of a list. */
  next(numId: string, ilvl: number): { label: string; left: number } | null {
    const abs = this.abstracts.get(this.nums.get(numId) ?? "");
    const lvl = abs?.get(ilvl);
    if (!abs || !lvl) return null;
    const c = this.counters.get(numId) ?? new Array(9).fill(0);
    c[ilvl] += 1;
    for (let k = ilvl + 1; k < 9; k++) c[k] = 0;
    this.counters.set(numId, c);
    const left = lvl.left !== undefined ? lvl.left / 20 : 18 * (ilvl + 1);
    if (lvl.fmt === "bullet") {
      const ch = lvl.text;
      const code = ch.codePointAt(0) ?? 0;
      const label = !ch || code >= 0xe000 || code < 32 ? "•" : ch === "o" ? "o" : ch;
      return { label, left };
    }
    let label = lvl.text.replace(/%([1-9])/g, (_, d: string) => {
      const k = Number(d) - 1;
      const fmt = abs.get(k)?.fmt ?? "decimal";
      return formatNumber(c[k] || 1, fmt);
    });
    if (!label.trim()) label = `${c[ilvl]}.`;
    return { label, left };
  }
}

function roman(n: number): string {
  const map: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
function formatNumber(n: number, fmt: string): string {
  if (fmt === "lowerLetter" || fmt === "upperLetter") {
    const ch = String.fromCharCode(96 + ((n - 1) % 26) + 1);
    return fmt === "upperLetter" ? ch.toUpperCase() : ch;
  }
  if (fmt === "lowerRoman") return roman(n);
  if (fmt === "upperRoman") return roman(n).toUpperCase();
  return String(n);
}

/* ------------------------------------------------------------------- build */

type Part = { kind: "runs"; runs: Run[] } | { kind: "break" } | { kind: "image"; rid: string; w: number; h: number };

export type DocxBuild = { bytes: Uint8Array; pages: number; unsupported: string[]; notes: string[] };

type Ctx = {
  styles: Styles;
  numbering: Numbering;
  rels: Map<string, string>;
  zip: JSZip;
  notes: Set<string>;
};

function hasVisibleBorders(el: El | null): boolean {
  if (!el) return false;
  return Array.from(el.children).some((b) => {
    const v = attr(b, "val");
    return !!v && v !== "nil" && v !== "none";
  });
}

export async function docxToPdf(bytes: Uint8Array, report: (f: number, label?: string) => void): Promise<DocxBuild> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("This file is not a valid .docx document. Older .doc files must be saved as .docx in Word first.");
  }
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("This file is not a valid .docx document. Older .doc files must be saved as .docx in Word first.");
  report(0.05, "Reading document…");

  const styles = await Styles.load(zip);
  const numbering = await Numbering.load(zip);
  const rels = new Map<string, string>();
  const relXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  if (relXml) {
    const rdoc = new DOMParser().parseFromString(relXml, "application/xml");
    for (const r of Array.from(rdoc.getElementsByTagName("Relationship"))) {
      const id = r.getAttribute("Id");
      const target = r.getAttribute("Target");
      if (id && target) rels.set(id, target);
    }
  }
  const ctx: Ctx = { styles, numbering, rels, zip, notes: new Set() };

  const doc = new DOMParser().parseFromString(await docFile.async("string"), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The document could not be read. It may be damaged.");
  const body = kid(doc.documentElement, "body");
  if (!body) throw new Error("The document has no content.");

  // page setup from the last section properties
  const sect = kid(body, "sectPr") ?? doc.getElementsByTagNameNS(W_NS, "sectPr")[0] ?? null;
  const pgSz = kid(sect, "pgSz");
  const pgMar = kid(sect, "pgMar");
  let pw = (num(attr(pgSz, "w")) ?? 12240) / 20;
  let ph = (num(attr(pgSz, "h")) ?? 15840) / 20;
  if (attr(pgSz, "orient") === "landscape" && pw < ph) [pw, ph] = [ph, pw];
  const mar = {
    t: Math.max(24, (num(attr(pgMar, "top")) ?? 1440) / 20),
    r: Math.max(24, (num(attr(pgMar, "right")) ?? 1440) / 20),
    b: Math.max(24, (num(attr(pgMar, "bottom")) ?? 1440) / 20),
    l: Math.max(24, (num(attr(pgMar, "left")) ?? 1440) / 20),
  };
  const w = await PdfWriter.create(pw, ph, mar);

  const blocks: El[] = [];
  const collect = (parent: El) => {
    for (const c of Array.from(parent.children)) {
      if (c.localName === "p" || c.localName === "tbl") blocks.push(c);
      else if (c.localName === "sdt") collect(kid(c, "sdtContent") ?? c);
      else if (c.localName === "customXml") collect(c);
    }
  };
  collect(body);

  let done = 0;
  for (const block of blocks) {
    if (block.localName === "p") await renderParagraph(w, block, ctx);
    else await renderTable(w, block, ctx);
    done++;
    if (done % 25 === 0) {
      report(0.1 + 0.85 * (done / blocks.length), "Building PDF…");
      await new Promise((r) => setTimeout(r, 0)); // let the progress bar breathe on big documents
    }
  }

  const out = await w.save();
  return { bytes: out, pages: w.doc.getPageCount(), unsupported: Array.from(w.unsupported), notes: Array.from(ctx.notes) };
}

/** Everything a paragraph needs, merged from defaults, style and direct formatting. */
function paraSetup(p: El, ctx: Ctx) {
  const pPr = kid(p, "pPr");
  const styleId = attr(kid(pPr, "pStyle"), "val") ?? ctx.styles.defaultParaStyle;
  const st = ctx.styles.resolve(styleId);
  const para: ParaProps = { ...ctx.styles.defaultPara, ...st.para, ...readParaProps(pPr) };
  const baseRun: RunProps = { ...ctx.styles.defaultRun, ...st.run };
  return { para, baseRun, pPr };
}

function runStyle(base: RunProps, run: RunProps, ctx: Ctx, rStyleId: string | null): Style {
  const rs = ctx.styles.resolve(rStyleId).run;
  const m = { ...base, ...rs, ...run };
  const size = (m.size ?? 10) * (m.sup ? 0.7 : 1);
  return {
    family: m.family ?? "helvetica",
    bold: !!m.bold,
    italic: !!m.italic,
    size,
    color: m.color ?? undefined,
    underline: !!m.underline,
    strike: !!m.strike,
  };
}

function parts(p: El, base: RunProps, ctx: Ctx): Part[] {
  const out: Part[] = [];
  let runs: Run[] = [];
  const flush = () => {
    if (runs.length) out.push({ kind: "runs", runs });
    runs = [];
  };
  const walk = (el: El) => {
    for (const c of Array.from(el.children)) {
      const n = c.localName;
      if (n === "r") {
        const rPr = kid(c, "rPr");
        const style = runStyle(base, readRunProps(rPr), ctx, attr(kid(rPr, "rStyle"), "val"));
        const caps = readRunProps(rPr).caps ?? false;
        for (const rc of Array.from(c.children)) {
          const t = rc.localName;
          if (t === "t") runs.push({ text: caps ? (rc.textContent ?? "").toUpperCase() : (rc.textContent ?? ""), style });
          else if (t === "tab") runs.push({ tab: true, style });
          else if (t === "br" || t === "cr") {
            if (attr(rc, "type") === "page") {
              flush();
              out.push({ kind: "break" });
            } else runs.push({ br: true });
          } else if (t === "noBreakHyphen") runs.push({ text: "-", style });
          else if (t === "drawing" || t === "pict") {
            const blip = rc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip")[0];
            const rid = blip?.getAttributeNS(R_NS, "embed") ?? blip?.getAttribute("r:embed");
            if (rid) {
              const ext = rc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "extent")[0];
              const cx = num(ext?.getAttribute("cx") ?? null) ?? 0;
              const cy = num(ext?.getAttribute("cy") ?? null) ?? 0;
              flush();
              out.push({ kind: "image", rid, w: cx / 12700, h: cy / 12700 });
            } else ctx.notes.add("Some drawings or text boxes were skipped.");
          }
        }
      } else if (n === "hyperlink" || n === "ins" || n === "smartTag" || n === "fldSimple" || n === "sdt" || n === "sdtContent" || n === "customXml") {
        walk(n === "sdt" ? (kid(c, "sdtContent") ?? c) : c);
      }
    }
  };
  walk(p);
  flush();
  return out;
}

function lineHeightFor(para: ParaProps, size: number): number {
  if (para.line === undefined) return 1.17;
  if (para.lineRule === "exact" || para.lineRule === "atLeast") return Math.max(0.9, para.line / 20 / Math.max(size, 1));
  return 1.17 * (para.line / 240);
}

async function renderParagraph(w: PdfWriter, p: El, ctx: Ctx) {
  const { para, baseRun } = paraSetup(p, ctx);
  const pieces = parts(p, baseRun, ctx);
  const baseSize = baseRun.size ?? 10;
  if (para.pageBreakBefore) w.pageBreak();

  // list label and indents
  let bullet: ParaOpts["bullet"];
  let indentLeft = para.indLeft ?? 0;
  let indentFirst = para.indFirst ?? 0;
  if (para.indHanging) indentFirst = -para.indHanging;
  if (para.numId && para.numId !== "0") {
    const item = ctx.numbering.next(para.numId, para.ilvl ?? 0);
    if (item) {
      const lbl = pieces.find((x) => x.kind === "runs");
      const st = lbl && lbl.kind === "runs" ? (lbl.runs.find((r) => "style" in r) as { style: Style } | undefined)?.style : undefined;
      bullet = { text: item.label, style: st ?? runStyle(baseRun, {}, ctx, null) };
      indentLeft = Math.max(item.left, indentLeft);
      indentFirst = 0;
    }
  } else if (indentFirst < 0) {
    indentLeft = Math.max(0, indentLeft);
  }

  const opts: ParaOpts = {
    align: para.align,
    indentLeft,
    indentFirst,
    spaceBefore: para.before,
    spaceAfter: para.after,
    lineHeight: lineHeightFor(para, baseSize),
    emptySize: baseSize,
    bullet,
  };

  const textParts = pieces.filter((x) => x.kind === "runs").length;
  if (pieces.length === 0) {
    await w.paragraph([], { ...opts, bullet: undefined });
    return;
  }
  let seenText = 0;
  for (const piece of pieces) {
    if (piece.kind === "break") {
      w.pageBreak();
    } else if (piece.kind === "image") {
      await drawImage(w, piece, ctx);
    } else {
      seenText++;
      await w.paragraph(piece.runs, {
        ...opts,
        bullet: seenText === 1 ? opts.bullet : undefined,
        spaceBefore: seenText === 1 ? opts.spaceBefore : 0,
        spaceAfter: seenText === textParts ? opts.spaceAfter : 0,
      });
    }
  }
}

async function loadImage(ctx: Ctx, rid: string): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  const target = ctx.rels.get(rid);
  if (!target) return null;
  const path = target.startsWith("/") ? target.slice(1) : `word/${target}`.replace(/word\/\.\.\//, "");
  const file = ctx.zip.file(path);
  if (!file) return null;
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const kind = ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpg" : null;
  if (!kind) {
    ctx.notes.add("Images in formats other than PNG and JPEG (for example GIF or EMF) were skipped.");
    return null;
  }
  return { bytes: await file.async("uint8array"), kind };
}

async function drawImage(w: PdfWriter, piece: { rid: string; w: number; h: number }, ctx: Ctx) {
  const img = await loadImage(ctx, piece.rid);
  if (!img) return;
  try {
    await w.image(img.bytes, img.kind, piece.w, piece.h);
  } catch {
    ctx.notes.add("Some images could not be drawn.");
  }
}

/* -------------------------------------------------------------------- tables */

type CellLayout = { lines: Line[]; opts: ParaOpts; before: number; after: number }[];

async function renderTable(w: PdfWriter, tbl: El, ctx: Ctx) {
  const grid = kids(kid(tbl, "tblGrid"), "gridCol").map((g) => (num(attr(g, "w")) ?? 1440) / 20);
  const tblPr = kid(tbl, "tblPr");
  const tableBorders = hasVisibleBorders(kid(tblPr, "tblBorders")) || !!ctx.styles.resolve(attr(kid(tblPr, "tblStyle"), "val")).border;
  const rows = kids(tbl, "tr");
  if (!rows.length) return;

  let cols = grid.length ? grid : [];
  if (!cols.length) {
    const n = Math.max(...rows.map((r) => kids(r, "tc").length));
    cols = new Array(n).fill(w.contentW / Math.max(n, 1));
  }
  const total = cols.reduce((a, b) => a + b, 0);
  const scale = total > w.contentW ? w.contentW / total : 1;
  cols = cols.map((c) => c * scale);

  const padX = 5;
  const padY = 2.5;

  for (const tr of rows) {
    let col = 0;
    const cells: { x: number; width: number; shade: RGB | null; border: boolean; layout: CellLayout; height: number }[] = [];
    let rowH = 0;
    let x = w.m.l;
    for (const tc of kids(tr, "tc")) {
      const tcPr = kid(tc, "tcPr");
      const span = num(attr(kid(tcPr, "gridSpan"), "val")) ?? 1;
      const width = cols.slice(col, col + span).reduce((a, b) => a + b, 0) || cols[col] || 60;
      const shade = hexColor(attr(kid(tcPr, "shd"), "fill"));
      const cellBorder = tableBorders || hasVisibleBorders(kid(tcPr, "tcBorders"));
      const layout: CellLayout = [];
      let height = padY * 2;
      const paras: El[] = [];
      const gather = (parent: El) => {
        for (const c of Array.from(parent.children)) {
          if (c.localName === "p") paras.push(c);
          else if (c.localName === "tbl") for (const r2 of kids(c, "tr")) for (const t2 of kids(r2, "tc")) gather(t2);
          else if (c.localName === "sdt") gather(kid(c, "sdtContent") ?? c);
        }
      };
      gather(tc);
      for (const p of paras) {
        const { para, baseRun } = paraSetup(p, ctx);
        const pieces = parts(p, baseRun, ctx);
        const runs: Run[] = pieces.flatMap((pc) => (pc.kind === "runs" ? pc.runs : []));
        if (pieces.some((pc) => pc.kind === "image")) ctx.notes.add("Images inside table cells were skipped.");
        await w.prepare(runs);
        let bullet: ParaOpts["bullet"];
        let indentLeft = para.indLeft ?? 0;
        if (para.numId && para.numId !== "0") {
          const item = ctx.numbering.next(para.numId, para.ilvl ?? 0);
          if (item) {
            bullet = { text: item.label, style: runStyle(baseRun, {}, ctx, null) };
            await w.ensureFont(bullet.style);
            indentLeft = Math.max(item.left, indentLeft);
          }
        }
        const opts: ParaOpts = { align: para.align, indentLeft, lineHeight: lineHeightFor(para, baseRun.size ?? 10), emptySize: baseRun.size ?? 10, bullet };
        const lines = w.layoutLines(runs, width - padX * 2, opts);
        const before = layout.length ? (para.before ?? 0) : 0;
        const after = para.after ?? 0;
        layout.push({ lines, opts, before, after });
        height += before + lines.reduce((a, l) => a + l.height, 0) + after;
      }
      cells.push({ x, width, shade, border: cellBorder, layout, height });
      rowH = Math.max(rowH, height);
      x += width;
      col += span;
    }
    rowH = Math.max(rowH, 12);
    w.ensureSpace(Math.min(rowH, w.pageH - w.m.t - w.m.b));
    const top = w.y;
    for (const c of cells) {
      if (c.shade) w.page.drawRectangle({ x: c.x, y: w.pdfY(top + rowH), width: c.width, height: rowH, color: w.color(c.shade) });
      if (c.border) w.page.drawRectangle({ x: c.x, y: w.pdfY(top + rowH), width: c.width, height: rowH, borderColor: w.color([0.35, 0.35, 0.35]), borderWidth: 0.5 });
      let cy = top + padY;
      for (const item of c.layout) {
        cy += item.before;
        cy += w.drawLines(w.page, item.lines, c.x + padX, cy, c.width - padX * 2, item.opts);
        cy += item.after;
      }
    }
    w.y = top + rowH;
  }
  w.y += 6;
}
