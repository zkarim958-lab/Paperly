/*
 * CODE AND NOTEBOOK -> PDF (client side).
 *
 *  - highlight(): small tokenizer (Python in detail, other languages with
 *    generic strings/comments/numbers/keywords) producing coloured segments.
 *  - codeToPdf(): source file -> paged PDF with optional line numbers.
 *  - notebookToPdf(): Jupyter .ipynb -> markdown cells, code cells, text outputs
 *    and embedded PNG/JPEG outputs (charts).
 */

import { PAGE_SIZES, PdfWriter, type RGB, type Run, type Style } from "@/lib/layout";

export type CodeSeg = { text: string; color?: RGB; bold?: boolean; italic?: boolean };
export type Lang = "python" | "generic";

const COL = {
  keyword: [0.0, 0.18, 0.62] as RGB,
  builtin: [0.1, 0.38, 0.55] as RGB,
  string: [0.12, 0.45, 0.12] as RGB,
  comment: [0.45, 0.45, 0.45] as RGB,
  number: [0.7, 0.3, 0.0] as RGB,
  decorator: [0.5, 0.2, 0.6] as RGB,
  name: [0.0, 0.4, 0.5] as RGB,
  error: [0.7, 0.1, 0.1] as RGB,
};

const PY_KEYWORDS = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case".split(" "),
);
const PY_BUILTINS = new Set(
  "print len range int str float list dict set tuple bool type isinstance open input sum min max abs sorted enumerate zip map filter any all super self cls object Exception ValueError TypeError KeyError".split(" "),
);
const GENERIC_KEYWORDS = new Set(
  "abstract break case catch class const continue default do else enum export extends final finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw throws try typeof var void while yield async await fn pub use mod struct impl match mut self true false select from where insert update delete create table int string bool float double char long short byte def end begin then elif fi done echo".split(" "),
);

/** Per-line coloured segments for a whole source file. */
export function highlight(source: string, lang: Lang, lineComment: "#" | "//" | "--" = "#"): CodeSeg[][] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: CodeSeg[][] = [];
  let triple: string | null = null;
  let prevWord = "";

  for (const line of lines) {
    const segs: CodeSeg[] = [];
    const push = (text: string, color?: RGB, extra?: Partial<CodeSeg>) => {
      if (!text) return;
      const last = segs[segs.length - 1];
      if (last && last.color === color && !last.bold === !extra?.bold && !last.italic === !extra?.italic) last.text += text;
      else segs.push({ text, color, ...extra });
    };
    let i = 0;
    if (triple) {
      const end = line.indexOf(triple);
      if (end === -1) {
        push(line, COL.string);
        out.push(segs);
        continue;
      }
      push(line.slice(0, end + 3), COL.string);
      i = end + 3;
      triple = null;
    }
    while (i < line.length) {
      const rest = line.slice(i);
      const ch = line[i];

      if (rest.startsWith(lineComment)) {
        push(rest, COL.comment, { italic: true });
        break;
      }
      if (lang === "generic" && rest.startsWith("/*")) {
        const end = rest.indexOf("*/");
        const text = end === -1 ? rest : rest.slice(0, end + 2);
        push(text, COL.comment, { italic: true });
        i += text.length;
        continue;
      }
      const sm = /^(?:[rRbBfFuU]{1,2})?('''|"""|'|"|`)/.exec(rest);
      if (sm && (sm[0].length === sm[1].length || lang === "python")) {
        const q = sm[1];
        let j = sm[0].length;
        if ((q === "'''" || q === '"""') && lang === "python") {
          const end = rest.indexOf(q, j);
          if (end === -1) {
            push(rest, COL.string);
            triple = q;
            i = line.length;
            continue;
          }
          push(rest.slice(0, end + 3), COL.string);
          i += end + 3;
          continue;
        }
        const quote = q[0];
        while (j < rest.length && rest[j] !== quote) j += rest[j] === "\\" ? 2 : 1;
        const text = rest.slice(0, Math.min(j + 1, rest.length));
        push(text, COL.string);
        i += text.length;
        continue;
      }
      const nm = /^(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
      if (nm && !/\w/.test(line[i - 1] ?? "")) {
        push(nm[0], COL.number);
        i += nm[0].length;
        continue;
      }
      if (lang === "python" && ch === "@" && /^\s*$/.test(line.slice(0, i))) {
        const dm = /^@[\w.]+/.exec(rest);
        if (dm) {
          push(dm[0], COL.decorator);
          i += dm[0].length;
          continue;
        }
      }
      const im = /^[A-Za-z_$][\w$]*/.exec(rest);
      if (im) {
        const w = im[0];
        const kws = lang === "python" ? PY_KEYWORDS : GENERIC_KEYWORDS;
        if (kws.has(w)) push(w, COL.keyword, { bold: true });
        else if (lang === "python" && (prevWord === "def" || prevWord === "class")) push(w, COL.name, { bold: true });
        else if (lang === "python" && PY_BUILTINS.has(w)) push(w, COL.builtin);
        else push(w);
        prevWord = w;
        i += w.length;
        continue;
      }
      push(ch);
      if (!/\s/.test(ch)) prevWord = "";
      i += 1;
    }
    out.push(segs);
  }
  return out;
}

/** Guess language settings from a file name. */
export function langFor(name: string): { lang: Lang; comment: "#" | "//" | "--" } {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "py" || ext === "pyw" || ext === "pyi") return { lang: "python", comment: "#" };
  if (["sh", "bash", "rb", "yml", "yaml", "toml", "r", "pl", "ps1"].includes(ext)) return { lang: "generic", comment: "#" };
  if (["sql", "lua", "hs"].includes(ext)) return { lang: "generic", comment: "--" };
  if (["txt", "md", "csv", "log", "json", "ini", "cfg"].includes(ext)) return { lang: "generic", comment: "#" };
  return { lang: "generic", comment: "//" };
}

export type CodePdfOptions = {
  page: "a4" | "letter";
  fontSize: number;
  lineNumbers: boolean;
  showCode: boolean;
  showOutputs: boolean;
};

export const DEFAULT_CODE_OPTIONS: CodePdfOptions = { page: "a4", fontSize: 9, lineNumbers: true, showCode: true, showOutputs: true };

export type PdfBuild = { bytes: Uint8Array; pages: number; unsupported: string[] };

const BG: RGB = [0.965, 0.965, 0.97];
const GRAY: RGB = [0.45, 0.45, 0.45];

async function titleBar(w: PdfWriter, text: string) {
  const style: Style = { family: "helvetica", bold: true, italic: false, size: 13 };
  await w.paragraph([{ text, style }], { spaceAfter: 6 });
  w.page.drawLine({ start: { x: w.m.l, y: w.pdfY(w.y - 2) }, end: { x: w.pageW - w.m.r, y: w.pdfY(w.y - 2) }, thickness: 0.6, color: w.color([0.8, 0.8, 0.82]) });
  w.y += 6;
}

export async function codeToPdf(name: string, text: string, o: CodePdfOptions, report: (f: number, label?: string) => void): Promise<PdfBuild> {
  const [pw, ph] = PAGE_SIZES[o.page];
  const w = await PdfWriter.create(pw, ph, { t: 46, r: 40, b: 46, l: 40 });
  const { lang, comment } = langFor(name);
  report(0.1, "Highlighting code…");
  const lines = highlight(text, lang, comment);
  await titleBar(w, name);
  const digits = String(lines.length).length;
  const gutter = o.lineNumbers ? digits * o.fontSize * 0.6 + 12 : 0;
  const rows = lines.map((segs, i) => ({ segs, num: String(i + 1) }));
  // draw in chunks so progress can move on very long files
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await w.codeBlock(rows.slice(i, i + CHUNK), { size: o.fontSize, bg: undefined, gutter, pad: 0 });
    report(0.1 + (0.85 * Math.min(i + CHUNK, rows.length)) / rows.length, "Building PDF…");
  }
  const bytes = await w.save();
  return { bytes, pages: w.doc.getPageCount(), unsupported: Array.from(w.unsupported) };
}

/* ----------------------------------------------------------- notebooks */

type NbOutput =
  | { kind: "text"; text: string; error?: boolean }
  | { kind: "image"; bytes: Uint8Array; type: "png" | "jpg" };
type NbCell = { type: "markdown" | "code" | "raw"; source: string; count: number | null; outputs: NbOutput[] };

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
const joinText = (v: unknown) => (Array.isArray(v) ? v.join("") : typeof v === "string" ? v : "");

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function parseNotebook(json: string): { cells: NbCell[]; language: string } {
  let nb: Record<string, unknown>;
  try {
    nb = JSON.parse(json);
  } catch {
    throw new Error("This file is not a valid Jupyter notebook (.ipynb).");
  }
  const rawCells = (nb.cells as unknown[]) ?? ((nb.worksheets as { cells?: unknown[] }[] | undefined)?.[0]?.cells ?? null);
  if (!Array.isArray(rawCells)) throw new Error("This notebook has no cells.");
  const meta = (nb.metadata as { language_info?: { name?: string }; kernelspec?: { language?: string } } | undefined) ?? {};
  const language = (meta.language_info?.name ?? meta.kernelspec?.language ?? "python").toLowerCase();
  const cells: NbCell[] = rawCells.map((rc) => {
    const c = rc as { cell_type?: string; source?: unknown; input?: unknown; execution_count?: number | null; prompt_number?: number; outputs?: unknown[] };
    const type = c.cell_type === "markdown" ? "markdown" : c.cell_type === "code" ? "code" : "raw";
    const outputs: NbOutput[] = [];
    for (const o of c.outputs ?? []) {
      const out = o as { output_type?: string; text?: unknown; name?: string; data?: Record<string, unknown>; traceback?: unknown[]; ename?: string; evalue?: string };
      if (out.output_type === "stream") outputs.push({ kind: "text", text: joinText(out.text), error: out.name === "stderr" });
      else if (out.output_type === "error") outputs.push({ kind: "text", error: true, text: stripAnsi((out.traceback ?? []).map(String).join("\n") || `${out.ename}: ${out.evalue}`) });
      else if (out.data) {
        const png = out.data["image/png"];
        const jpg = out.data["image/jpeg"];
        if (png) outputs.push({ kind: "image", type: "png", bytes: b64ToBytes(joinText(png)) });
        else if (jpg) outputs.push({ kind: "image", type: "jpg", bytes: b64ToBytes(joinText(jpg)) });
        else if (out.data["text/plain"]) outputs.push({ kind: "text", text: joinText(out.data["text/plain"]) });
      }
    }
    return { type, source: joinText(c.source ?? c.input), count: c.execution_count ?? c.prompt_number ?? null, outputs };
  });
  return { cells, language };
}

const BODY: Style = { family: "helvetica", bold: false, italic: false, size: 10.5 };

/** **bold**, *italic*, `code` and [text](url) -> styled runs. */
function inlineRuns(text: string, base: Style): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) runs.push({ text: text.slice(last, m.index), style: base });
    const t = m[0];
    if (t.startsWith("**") || t.startsWith("__")) runs.push({ text: t.slice(2, -2), style: { ...base, bold: true } });
    else if (t.startsWith("`")) runs.push({ text: t.slice(1, -1), style: { ...base, family: "courier", size: base.size * 0.92 } });
    else if (t.startsWith("[")) {
      const label = /^\[([^\]]+)\]/.exec(t)![1];
      runs.push({ text: label, style: { ...base, underline: true, color: [0.1, 0.3, 0.75] } });
    } else runs.push({ text: t.slice(1, -1), style: { ...base, italic: true } });
    last = m.index! + t.length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), style: base });
  return runs;
}

async function renderMarkdown(w: PdfWriter, md: string, o: CodePdfOptions) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  const flush = async () => {
    if (!para.length) return;
    await w.paragraph(inlineRuns(para.join(" "), BODY), { spaceAfter: 6 });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```/.exec(line);
    if (fence) {
      await flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      await w.codeBlock(code.map((t) => ({ segs: [{ text: t }] })), { size: o.fontSize, bg: BG, pad: 5 });
      w.y += 6;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      await flush();
      const level = h[1].length;
      const size = [20, 16, 13.5, 12, 11, 10.5][level - 1];
      await w.paragraph(inlineRuns(h[2].replace(/#+\s*$/, ""), { ...BODY, bold: true, size }), { spaceBefore: level <= 2 ? 10 : 6, spaceAfter: 5 });
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      await flush();
      const depth = Math.floor(li[1].replace(/\t/g, "    ").length / 2);
      await w.paragraph(inlineRuns(li[3], BODY), {
        indentLeft: 18 + depth * 14,
        bullet: { text: /\d/.test(li[2]) ? li[2] : "•", style: BODY },
        spaceAfter: 2,
      });
      continue;
    }
    if (/^\s*$/.test(line)) {
      await flush();
      continue;
    }
    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      await flush();
      w.page.drawLine({ start: { x: w.m.l, y: w.pdfY(w.y + 4) }, end: { x: w.pageW - w.m.r, y: w.pdfY(w.y + 4) }, thickness: 0.6, color: w.color([0.8, 0.8, 0.82]) });
      w.y += 10;
      continue;
    }
    if (/^\s*!\[.*\]\(.*\)\s*$/.test(line)) {
      await flush();
      await w.paragraph([{ text: "[image]", style: { ...BODY, italic: true, color: GRAY } }], { spaceAfter: 4 });
      continue;
    }
    para.push(line.trim());
  }
  await flush();
}

export async function notebookToPdf(name: string, json: string, o: CodePdfOptions, report: (f: number, label?: string) => void): Promise<PdfBuild> {
  const { cells, language } = parseNotebook(json);
  const [pw, ph] = PAGE_SIZES[o.page];
  const w = await PdfWriter.create(pw, ph, { t: 46, r: 44, b: 46, l: 44 });
  await titleBar(w, name.replace(/\.ipynb$/i, ""));
  const py = language === "python";
  const small: Style = { family: "helvetica", bold: false, italic: false, size: 7.5, color: GRAY };

  for (let ci = 0; ci < cells.length; ci++) {
    const c = cells[ci];
    report(ci / Math.max(cells.length, 1) * 0.95 + 0.02, "Building PDF…");
    if (c.type === "markdown") {
      await renderMarkdown(w, c.source, o);
      continue;
    }
    if (c.type === "raw") {
      if (c.source.trim()) await w.paragraph([{ text: c.source, style: { ...BODY, family: "courier", size: o.fontSize } }], { spaceAfter: 6 });
      continue;
    }
    if (o.showCode && c.source.trim()) {
      await w.paragraph([{ text: `In [${c.count ?? " "}]:`, style: small }], { spaceAfter: 1 });
      const segs = highlight(c.source.replace(/\s+$/, ""), py ? "python" : "generic", py ? "#" : "//");
      await w.codeBlock(segs.map((s, i) => ({ segs: s, num: String(i + 1) })), { size: o.fontSize, bg: BG, pad: 5 });
      w.y += 4;
    }
    if (o.showOutputs) {
      for (const out of c.outputs) {
        if (out.kind === "image") {
          try {
            await w.image(out.bytes, out.type, 0, 0, "left");
          } catch {
            await w.paragraph([{ text: "[image output could not be drawn]", style: { ...small, italic: true } }], { spaceAfter: 4 });
          }
        } else if (out.text.trim()) {
          const color: RGB | undefined = out.error ? COL.error : undefined;
          await w.codeBlock(out.text.replace(/\s+$/, "").split("\n").map((t) => ({ segs: [{ text: t, color }] })), { size: o.fontSize * 0.95, pad: 5 });
          w.y += 4;
        }
      }
    }
    w.y += 6;
  }
  const bytes = await w.save();
  return { bytes, pages: w.doc.getPageCount(), unsupported: Array.from(w.unsupported) };
}
