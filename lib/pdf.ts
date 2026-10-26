/**
 * CLIENT-SIDE PDF ENGINE
 * ---------------------------------------------------------------------------
 * Everything in this file runs inside the visitor's browser. Files are read
 * with File.arrayBuffer(), processed in memory, and handed back as Blobs that
 * the user downloads. Nothing is ever sent to a server, which is why the site
 * costs nothing to run and why the "100% private" claim is true.
 *
 * Two libraries do the work:
 *
 *  - pdf-lib   : edits PDF *structure* (copy pages between documents, embed
 *                images, write a new file). Used for merge, split, images->PDF.
 *  - pdfjs-dist: Mozilla's PDF renderer. Draws a page onto a <canvas>. Used for
 *                thumbnails, PDF->image, compression and unlock.
 *
 * pdf-lib-plus-encrypt (a pdf-lib fork) adds password encryption on save.
 *
 * Only import this module from client components: it touches `document`.
 */

import { PDFDocument, degrees } from "pdf-lib";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type ReportFn = (fraction: number, label?: string) => void;

/* ------------------------------------------------------------------ helpers */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Wrap bytes in a Blob (copying avoids SharedArrayBuffer typing issues). */
export function toBlob(bytes: Uint8Array, type: string): Blob {
  const copy = bytes.slice().buffer as ArrayBuffer;
  return new Blob([copy], { type });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** Yield to the browser so the UI can repaint between heavy steps. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function releaseCanvas(canvas: HTMLCanvasElement): void {
  // Setting size to 0 frees the backing bitmap right away (important on iOS).
  canvas.width = 0;
  canvas.height = 0;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
      type,
      quality,
    );
  });
}

/* ------------------------------------------------------------------- errors */

export function isPasswordError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "PasswordException";
}

function isWrongPasswordError(e: unknown): boolean {
  // pdf.js: code 1 = password needed, code 2 = password incorrect
  return isPasswordError(e) && (e as { code?: number }).code === 2;
}

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try another file."): string {
  if (isPasswordError(e)) return "This PDF is password-protected. Unlock it first, then try again.";
  if (e instanceof Error) {
    if (/encrypted/i.test(e.message)) return "This PDF is encrypted. Unlock it first, then try again.";
    if (/invalid pdf|no pdf header|failed to parse|InvalidPDF/i.test(e.message)) {
      return "This file doesn't look like a valid PDF, or it is damaged.";
    }
    return e.message || fallback;
  }
  return fallback;
}

/* ----------------------------------------------------------------- pdf.js */

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/**
 * Lazy-load pdf.js only when a PDF is actually opened. This keeps it (and its
 * ~1 MB worker) out of the initial bundle, which protects LCP / Core Web Vitals.
 */
export function getPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // The worker parses PDFs off the main thread so the UI stays smooth.
      mod.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  // pdf.js transfers (detaches) the buffer it is given, so pass a copy.
  return pdfjs.getDocument({ data: bytes.slice(), password }).promise;
}

/** Free a document's worker resources. Works across pdf.js 4.x, 5.x and 6.x. */
export function closePdf(pdf: PDFDocumentProxy): void {
  void pdf.loadingTask.destroy();
}

/** Draw a page onto a canvas. Passing both `canvas` and `canvasContext` keeps this working across pdf.js majors. */
export async function drawPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
): Promise<void> {
  const params = { canvasContext: ctx, canvas, viewport } as unknown as Parameters<PDFPageProxy["render"]>[0];
  await page.render(params).promise;
}

/** Render one page to a small JPEG data-URL (for thumbnails). */
export async function renderThumb(pdf: PDFDocumentProxy, pageNumber: number, width = 240): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = makeCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  await drawPage(page, canvas, ctx, viewport);
  page.cleanup();
  const url = canvas.toDataURL("image/jpeg", 0.72);
  releaseCanvas(canvas);
  return url;
}

/**
 * Render a page at `scale` (1 = 72 DPI, 2 = 144 DPI ...). The longest side is
 * capped so huge pages can't exceed browser canvas limits.
 */
export async function renderPageToCanvas(pdf: PDFDocumentProxy, pageNumber: number, scale: number, maxSide = 4096) {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const safeScale = Math.min(scale, maxSide / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: safeScale });
  const canvas = makeCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  await drawPage(page, canvas, ctx, viewport);
  page.cleanup();
  return { canvas, pointsWidth: base.width, pointsHeight: base.height };
}

export type PdfInspection = {
  bytes: Uint8Array;
  numPages: number;
  thumb: string | null;
  locked: boolean;
  wrongPassword: boolean;
};

/** Read a PDF file, count its pages and render page 1 as a thumbnail. */
export async function inspectPdf(file: File, password?: string): Promise<PdfInspection> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const pdf = await openPdf(bytes, password);
    try {
      const thumb = await renderThumb(pdf, 1, 320);
      return { bytes, numPages: pdf.numPages, thumb, locked: false, wrongPassword: false };
    } finally {
      closePdf(pdf);
    }
  } catch (e) {
    if (isPasswordError(e)) {
      return { bytes, numPages: 0, thumb: null, locked: true, wrongPassword: isWrongPasswordError(e) };
    }
    throw e;
  }
}

export type PdfInfo = { bytes: Uint8Array; numPages: number; thumb: string };

/** Like inspectPdf, but refuses password-protected files. */
export async function loadPdfInfo(file: File): Promise<PdfInfo> {
  const info = await inspectPdf(file);
  if (info.locked || !info.thumb) {
    throw new Error("This PDF is password-protected. Unlock it first, then try again.");
  }
  return { bytes: info.bytes, numPages: info.numPages, thumb: info.thumb };
}

/* -------------------------------------------------------------------- merge */

export async function mergePdfs(inputs: Uint8Array[], report: ReportFn): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    report(i / inputs.length, `Merging file ${i + 1} of ${inputs.length}`);
    const src = await PDFDocument.load(inputs[i]);
    // copyPages clones the page objects (fonts, images...) into the new file.
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    await tick();
  }
  report(0.95, "Writing your PDF");
  return out.save();
}

/* -------------------------------------------------------------------- split */

export function parsePageRanges(input: string, max: number): { pages: number[]; error: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { pages: [], error: null };
  const set = new Set<number>();
  for (const part of trimmed.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(token);
    if (!m) return { pages: [], error: `"${token}" isn't a valid page or range.` };
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > max || b > max) {
      return { pages: [], error: `Pages must be between 1 and ${max}.` };
    }
    if (b < a) return { pages: [], error: `The range ${a}-${b} runs backwards.` };
    for (let p = a; p <= b; p++) set.add(p);
  }
  return { pages: Array.from(set).sort((x, y) => x - y), error: null };
}

export function formatPageRanges(pages: number[]): string {
  const sorted = pages.slice().sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** Copy the chosen pages (1-based) into a brand-new PDF. */
export async function extractPages(bytes: Uint8Array, pages: number[], report: ReportFn): Promise<Uint8Array> {
  report(0.1, "Reading your PDF");
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  report(0.4, "Copying selected pages");
  const copied = await out.copyPages(src, pages.map((p) => p - 1));
  copied.forEach((p) => out.addPage(p));
  report(0.85, "Writing your PDF");
  return out.save();
}

/** One single-page PDF per selected page. */
export async function splitEachPage(
  bytes: Uint8Array,
  pages: number[],
  baseFileName: string,
  report: ReportFn,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const src = await PDFDocument.load(bytes);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < pages.length; i++) {
    report(i / pages.length, `Creating file ${i + 1} of ${pages.length}`);
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [pages[i] - 1]);
    out.addPage(page);
    files.push({ name: `${baseFileName}-page-${pages[i]}.pdf`, bytes: await out.save() });
    await tick();
  }
  return files;
}

/* ----------------------------------------------------------------- compress */

export type CompressPreset = "extreme" | "recommended" | "high";

export const COMPRESS_PRESETS: Record<
  CompressPreset,
  { label: string; blurb: string; scale: number; quality: number }
> = {
  extreme: { label: "Extreme", blurb: "Smallest file. Good for email and forms.", scale: 1.0, quality: 0.5 },
  recommended: { label: "Recommended", blurb: "Best balance of size and clarity.", scale: 1.5, quality: 0.7 },
  high: { label: "High quality", blurb: "Sharp pages, moderate savings.", scale: 2.0, quality: 0.85 },
};

/**
 * Re-draw every page as a JPEG and rebuild the PDF from those images.
 * This is how in-browser compression achieves big savings on scans and photo
 * heavy files. Trade-off: text becomes part of the picture (no longer
 * selectable or searchable). The UI explains this and offers a text-preserving
 * alternative (optimizeStructure).
 */
async function rasterizeToPdf(
  pdf: PDFDocumentProxy,
  scale: number,
  quality: number,
  report: ReportFn,
  verb: string,
  onEstimate?: (estimatedBytes: number) => void,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  let accumulated = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    report((n - 1) / pdf.numPages, `${verb} page ${n} of ${pdf.numPages}`);
    const { canvas, pointsWidth, pointsHeight } = await renderPageToCanvas(pdf, n, scale);
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    releaseCanvas(canvas);
    const jpg = new Uint8Array(await blob.arrayBuffer());
    accumulated += jpg.byteLength;
    const img = await out.embedJpg(jpg);
    const page = out.addPage([pointsWidth, pointsHeight]);
    page.drawImage(img, { x: 0, y: 0, width: pointsWidth, height: pointsHeight });
    onEstimate?.(Math.round((accumulated * pdf.numPages) / n));
    await tick();
  }
  report(0.97, "Writing your PDF");
  return out.save();
}

export async function compressPdf(
  bytes: Uint8Array,
  preset: CompressPreset,
  report: ReportFn,
  onEstimate?: (estimatedBytes: number) => void,
): Promise<Uint8Array> {
  const { scale, quality } = COMPRESS_PRESETS[preset];
  const pdf = await openPdf(bytes);
  try {
    return await rasterizeToPdf(pdf, scale, quality, report, "Compressing", onEstimate);
  } finally {
    closePdf(pdf);
  }
}

/** Lossless re-save with compressed object streams. Keeps text selectable. */
export async function optimizeStructure(bytes: Uint8Array, report: ReportFn): Promise<Uint8Array> {
  report(0.2, "Reading your PDF");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  report(0.6, "Optimizing structure");
  return doc.save({ useObjectStreams: true });
}

/* --------------------------------------------------------------- pdf->images */

export type ImageFormat = "png" | "jpg";
export type RenderedImage = { name: string; blob: Blob; url: string; width: number; height: number };

export async function pdfToImages(
  bytes: Uint8Array,
  opts: { format: ImageFormat; scale: number; quality: number },
  baseFileName: string,
  report: ReportFn,
): Promise<RenderedImage[]> {
  const pdf = await openPdf(bytes);
  const images: RenderedImage[] = [];
  try {
    const digits = String(pdf.numPages).length;
    for (let n = 1; n <= pdf.numPages; n++) {
      report((n - 1) / pdf.numPages, `Rendering page ${n} of ${pdf.numPages}`);
      const { canvas } = await renderPageToCanvas(pdf, n, opts.scale);
      const width = canvas.width;
      const height = canvas.height;
      const isPng = opts.format === "png";
      const blob = await canvasToBlob(canvas, isPng ? "image/png" : "image/jpeg", isPng ? undefined : opts.quality);
      releaseCanvas(canvas);
      images.push({
        name: `${baseFileName}-page-${String(n).padStart(digits, "0")}.${isPng ? "png" : "jpg"}`,
        blob,
        url: URL.createObjectURL(blob),
        width,
        height,
      });
      await tick();
    }
  } finally {
    closePdf(pdf);
  }
  return images;
}

/* --------------------------------------------------------------- images->pdf */

export type PageSizeOption = "fit" | "a4" | "letter";

const PAGE_SIZES: Record<Exclude<PageSizeOption, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/**
 * Decode through <canvas> so (1) phone photos with EXIF rotation come out the
 * right way up, and (2) WebP/GIF/BMP are converted to something pdf-lib can
 * embed. PNG/WebP/GIF keep transparency (PNG out); everything else becomes a
 * high-quality JPEG.
 */
async function prepareImage(file: File): Promise<{ bytes: Uint8Array; kind: "png" | "jpg"; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}" couldn't be read as an image.`);
  }
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  const keepsAlpha = /image\/(png|webp|gif)/.test(file.type);
  if (!keepsAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();
  const blob = await canvasToBlob(canvas, keepsAlpha ? "image/png" : "image/jpeg", 0.92);
  releaseCanvas(canvas);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: keepsAlpha ? "png" : "jpg", width, height };
}

export async function imagesToPdf(
  files: File[],
  opts: { pageSize: PageSizeOption; margin: number },
  report: ReportFn,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    report(i / files.length, `Adding image ${i + 1} of ${files.length}`);
    const { bytes, kind, width, height } = await prepareImage(files[i]);
    const img = kind === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const m = opts.margin;

    if (opts.pageSize === "fit") {
      // 96 px per inch -> 72 pt per inch, capped so giant photos stay sensible.
      const k = Math.min(0.75, 1200 / Math.max(width, height));
      const w = width * k;
      const h = height * k;
      const page = out.addPage([w + 2 * m, h + 2 * m]);
      page.drawImage(img, { x: m, y: m, width: w, height: h });
    } else {
      const [bw, bh] = PAGE_SIZES[opts.pageSize];
      const landscape = width > height;
      const pw = landscape ? bh : bw;
      const ph = landscape ? bw : bh;
      const k = Math.min((pw - 2 * m) / width, (ph - 2 * m) / height);
      const w = width * k;
      const h = height * k;
      const page = out.addPage([pw, ph]);
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    await tick();
  }
  report(0.95, "Writing your PDF");
  return out.save();
}

/* ------------------------------------------------------------ protect/unlock */

export type ProtectOptions = {
  userPassword: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
};

type EncryptCapable = {
  encrypt: (options: {
    userPassword: string;
    ownerPassword: string;
    permissions: {
      printing?: "lowResolution" | "highResolution";
      modifying?: boolean;
      copying?: boolean;
      annotating?: boolean;
      fillingForms?: boolean;
      contentAccessibility?: boolean;
      documentAssembly?: boolean;
    };
  }) => Promise<void>;
};

function randomOwnerPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(24);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

/**
 * Password-protect a PDF. The "user" password is needed to open the file. A
 * random "owner" password is generated and discarded so the permission flags
 * (print / copy / edit) can't be changed without breaking the file.
 */
export async function protectPdf(bytes: Uint8Array, opts: ProtectOptions, report: ReportFn): Promise<Uint8Array> {
  report(0.15, "Loading encryption engine");
  // Loaded on demand so it stays out of the main bundle.
  const { PDFDocument: EncryptableDocument } = await import("pdf-lib-plus-encrypt");
  report(0.35, "Reading your PDF");
  const doc = await EncryptableDocument.load(bytes);
  report(0.6, "Encrypting");
  await (doc as unknown as EncryptCapable).encrypt({
    userPassword: opts.userPassword,
    ownerPassword: randomOwnerPassword(),
    permissions: {
      printing: opts.allowPrinting ? "highResolution" : undefined,
      copying: opts.allowCopying,
      modifying: opts.allowModifying,
      annotating: opts.allowModifying,
      fillingForms: opts.allowModifying,
      contentAccessibility: true,
      documentAssembly: opts.allowModifying,
    },
  });
  report(0.9, "Writing your PDF");
  return doc.save();
}

/**
 * Unlock a PDF. pdf.js opens the file with the password the user typed (a
 * wrong password throws PasswordException), then every page is redrawn into a
 * fresh, unprotected PDF. Result: no password and no print/copy restrictions,
 * but pages become images (text is no longer selectable).
 */
export async function unlockPdf(bytes: Uint8Array, password: string, report: ReportFn): Promise<Uint8Array> {
  const pdf = await openPdf(bytes, password || undefined);
  try {
    return await rasterizeToPdf(pdf, 2, 0.9, report, "Unlocking");
  } finally {
    closePdf(pdf);
  }
}

/* ------------------------------------------------------------------ arrange */

export type PagePlan = { src: number; rotate: number };

/**
 * Build a new PDF from a page plan: order = order of the array, deleted pages
 * are simply left out, `rotate` is added to the page's existing rotation
 * (multiples of 90). src is 1-based.
 */
export async function arrangePdf(bytes: Uint8Array, plan: PagePlan[], report: ReportFn): Promise<Uint8Array> {
  report(0.1, "Reading your PDF");
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, plan.map((p) => p.src - 1));
  report(0.6, "Applying changes");
  copied.forEach((page, i) => {
    const turn = ((plan[i].rotate % 360) + 360) % 360;
    if (turn) page.setRotation(degrees((page.getRotation().angle + turn) % 360));
    out.addPage(page);
  });
  report(0.9, "Writing your PDF");
  return out.save();
}
