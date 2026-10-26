/**
 * OCR (text recognition) for scanned pages and images, using tesseract.js.
 *
 * Everything still runs in the visitor's browser: the page image is processed
 * locally. The first time OCR is used, tesseract.js downloads its WebAssembly
 * engine and the language data (a few MB) from a CDN. To avoid any third-party
 * request, copy those files to /public/tesseract and set
 *   NEXT_PUBLIC_TESSERACT_BASE=/tesseract
 * (expects worker.min.js, tesseract-core*.wasm(.js) and lang/<code>.traineddata.gz).
 */

import type { Worker as TessWorker } from "tesseract.js";

export type OcrLang = "eng" | "spa" | "fra" | "deu" | "ita" | "por";

export const OCR_LANGS: { id: OcrLang; label: string }[] = [
  { id: "eng", label: "English" },
  { id: "spa", label: "Spanish" },
  { id: "fra", label: "French" },
  { id: "deu", label: "German" },
  { id: "ita", label: "Italian" },
  { id: "por", label: "Portuguese" },
];

export type OcrLine = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Estimated baseline, in image pixels. */
  baseline: number;
  confidence: number;
};

type RawBox = { x0: number; y0: number; x1: number; y1: number };
type RawWord = { text?: string; bbox?: RawBox };
type RawLine = { text?: string; bbox?: RawBox; confidence?: number; words?: RawWord[] };

const HAS_DESCENDER = /[gjpqyQ,;()[\]{}|/\\@$]/;

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Turn tesseract.js output (v5 flat lines, or v6 blocks) into plain lines with a baseline estimate. */
export function extractLines(data: unknown): OcrLine[] {
  const d = data as {
    lines?: RawLine[];
    blocks?: { paragraphs?: { lines?: RawLine[] }[] }[];
  };
  let lines: RawLine[] = d.lines ?? [];
  if (!lines.length && d.blocks) {
    lines = d.blocks.flatMap((b) => (b.paragraphs ?? []).flatMap((p) => p.lines ?? []));
  }
  const out: OcrLine[] = [];
  for (const l of lines) {
    const text = (l.text ?? "").replace(/\s+/g, " ").trim();
    const b = l.bbox;
    if (!text || !b) continue;
    const h = b.y1 - b.y0;
    if (h < 4 || b.x1 - b.x0 < 4) continue;
    // Words without descenders end exactly on the baseline, so use them to find it.
    const ends = (l.words ?? [])
      .filter((w) => w.bbox && (w.text ?? "").trim() && !HAS_DESCENDER.test(w.text ?? ""))
      .map((w) => (w.bbox as RawBox).y1);
    const baseline = ends.length ? median(ends) : b.y1 - 0.22 * h;
    out.push({ text, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, baseline, confidence: l.confidence ?? 0 });
  }
  return out;
}

let state: { worker: TessWorker; lang: OcrLang } | null = null;
let onProgress: ((fraction: number, label: string) => void) | null = null;

function labelFor(status: string): string {
  if (/loading tesseract core|initializing tesseract/i.test(status)) return "Loading OCR engine…";
  if (/loading language/i.test(status)) return "Downloading language data…";
  if (/initializing api|loaded language/i.test(status)) return "Starting OCR…";
  if (/recognizing/i.test(status)) return "Reading text…";
  return "Working…";
}

async function getWorker(lang: OcrLang): Promise<TessWorker> {
  if (state && state.lang === lang) return state.worker;
  if (state) {
    await state.worker.terminate();
    state = null;
  }
  const { createWorker } = await import("tesseract.js");
  const base = process.env.NEXT_PUBLIC_TESSERACT_BASE;
  const worker = await createWorker(lang, 1, {
    logger: (m: { status: string; progress: number }) => onProgress?.(m.progress, labelFor(m.status)),
    ...(base ? { workerPath: `${base}/worker.min.js`, corePath: base, langPath: `${base}/lang` } : {}),
  });
  state = { worker, lang };
  return worker;
}

export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  lang: OcrLang,
  progress: (fraction: number, label: string) => void,
): Promise<OcrLine[]> {
  onProgress = progress;
  try {
    progress(0, "Loading OCR engine…");
    const worker = await getWorker(lang);
    const result = await worker.recognize(canvas, {}, { blocks: true, text: true });
    return extractLines(result.data).filter((l) => l.confidence >= 35);
  } finally {
    onProgress = null;
  }
}

export async function terminateOcr(): Promise<void> {
  if (state) {
    const w = state.worker;
    state = null;
    await w.terminate();
  }
}
