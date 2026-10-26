"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import JSZip from "jszip";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  ImagePlus,
  Layers,
  Loader2,
  LockKeyhole,
  Scissors,
  Shrink,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  COMPRESS_PRESETS,
  baseName,
  closePdf,
  compressPdf,
  downloadBlob,
  extractPages,
  formatBytes,
  formatPageRanges,
  friendlyError,
  imagesToPdf,
  inspectPdf,
  isPasswordError,
  loadPdfInfo,
  mergePdfs,
  moveItem,
  openPdf,
  optimizeStructure,
  parsePageRanges,
  pdfToImages,
  protectPdf,
  renderThumb,
  splitEachPage,
  toBlob,
  unlockPdf,
  type CompressPreset,
  type ImageFormat,
  type PageSizeOption,
  type PdfInfo,
  type RenderedImage,
} from "@/lib/pdf";
import {
  Card,
  DropZone,
  ErrorBanner,
  FileHeader,
  ProcessingPanel,
  ResultCard,
  SectionLabel,
  SortableItem,
  btnPrimary,
  btnSecondary,
  cx,
  inputClass,
  useProcessor,
} from "@/components/ui";

let uidCounter = 0;
const nextId = () => `item-${++uidCounter}`;

const PDF_ACCEPT = ".pdf,application/pdf";
const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.bmp,image/*";

/* A selectable card used for presets and options */
function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "relative w-full rounded-xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40",
        selected
          ? "border-orange-600 dark:border-orange-400 bg-zinc-100 shadow-md shadow-orange-900/10 dark:bg-white/10"
          : "border-zinc-200 bg-white/60 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03]",
      )}
    >
      <span className="block pr-7 text-sm font-semibold text-zinc-900 dark:text-white">{title}</span>
      {description && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>}
      {selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full accent3d text-white">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
    </button>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 transition hover:bg-zinc-200/70 active:scale-90 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

/* ================================================================== MERGE */

type MergeItem = {
  id: string;
  name: string;
  size: number;
  bytes?: Uint8Array;
  pages?: number;
  thumb?: string;
  error?: string;
};

export function MergeTool() {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [outName, setOutName] = useState("merged");
  const [result, setResult] = useState<{ bytes: Uint8Array; pages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state, run } = useProcessor();

  const addFiles = useCallback(async (files: File[]) => {
    setError(null);
    setResult(null);
    const fresh: MergeItem[] = files.map((f) => ({ id: nextId(), name: f.name, size: f.size }));
    setItems((prev) => [...prev, ...fresh]);
    for (let i = 0; i < files.length; i++) {
      const id = fresh[i].id;
      try {
        const info = await loadPdfInfo(files[i]);
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, bytes: info.bytes, pages: info.numPages, thumb: info.thumb } : it)));
      } catch (e) {
        const message = friendlyError(e);
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, error: message } : it)));
      }
    }
  }, []);

  const reorder = (from: number, to: number) => setItems((prev) => moveItem(prev, from, to));
  const remove = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const ready = items.filter((it) => it.bytes);
  const loading = items.some((it) => !it.bytes && !it.error);
  const hasErrors = items.some((it) => it.error);
  const totalPages = ready.reduce((n, it) => n + (it.pages ?? 0), 0);
  const totalSize = items.reduce((n, it) => n + it.size, 0);
  const canMerge = ready.length >= 2 && !loading && !hasErrors;

  const merge = async () => {
    setError(null);
    try {
      const bytes = await run("Merging your PDFs…", (report) => mergePdfs(ready.map((it) => it.bytes as Uint8Array), report));
      setResult({ bytes, pages: totalPages });
    } catch (e) {
      setError(friendlyError(e, "Merging failed. Please check your files and try again."));
    }
  };

  const reset = () => {
    setItems([]);
    setResult(null);
    setError(null);
  };

  const fileName = `${(outName.trim() || "merged").replace(/\.pdf$/i, "")}.pdf`;

  if (state.running) return <ProcessingPanel state={state} />;

  if (result) {
    return (
      <ResultCard
        title="Your PDFs are merged"
        subtitle="Your file was created on this device. Nothing was uploaded."
        stats={[
          { label: "Files merged", value: String(ready.length) },
          { label: "Total pages", value: String(result.pages) },
          { label: "File size", value: formatBytes(result.bytes.byteLength) },
        ]}
        downloadLabel="Download merged PDF"
        onDownload={() => downloadBlob(toBlob(result.bytes, "application/pdf"), fileName)}
        onReset={reset}
        resetLabel="Merge more files"
      />
    );
  }

  if (items.length === 0) {
    return (
      <DropZone
        accept={PDF_ACCEPT}
        acceptLabel="PDF files"
        multiple
        onFiles={addFiles}
        icon={Layers}
        title="Drop your PDFs here"
        subtitle="Add two or more PDF files, then drag the cards to set the order."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4">
            {items.map((it, index) => (
              <li key={it.id}>
                <SortableItem index={index} onReorder={reorder} className="h-full">
                  <div
                    className={cx(
                      "group relative flex h-full cursor-grab flex-col rounded-xl border bg-white/80 p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-lg active:cursor-grabbing dark:bg-white/[0.05]",
                      it.error ? "border-red-300 dark:border-red-500/40" : "border-zinc-200 dark:border-white/10",
                    )}
                  >
                    <span className="absolute left-5 top-5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/80 text-xs font-bold text-white backdrop-blur">
                      {index + 1}
                    </span>
                    <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-white/5">
                      {it.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.thumb} alt={`Preview of ${it.name}`} className="h-full w-full object-cover" draggable={false} />
                      ) : it.error ? (
                        <p className="px-3 text-center text-xs text-red-600 dark:text-red-300">{it.error}</p>
                      ) : (
                        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" aria-label="Loading preview" />
                      )}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-zinc-900 dark:text-white" title={it.name}>{it.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {it.pages ? `${it.pages} page${it.pages > 1 ? "s" : ""} · ` : ""}
                      {formatBytes(it.size)}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex">
                        <IconButton label="Move earlier" onClick={() => reorder(index, index - 1)} disabled={index === 0}>
                          <ArrowLeft className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Move later" onClick={() => reorder(index, index + 1)} disabled={index === items.length - 1}>
                          <ArrowRight className="h-4 w-4" />
                        </IconButton>
                      </div>
                      <IconButton label={`Remove ${it.name}`} onClick={() => remove(it.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </IconButton>
                    </div>
                  </div>
                </SortableItem>
              </li>
            ))}
          </ul>
          <DropZone accept={PDF_ACCEPT} acceptLabel="PDF files" multiple compact onFiles={addFiles} icon={Layers} title="Add more PDFs" subtitle="Drop files here or click to browse." />
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>Merge settings</SectionLabel>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Files", String(items.length)],
                ["Pages", String(totalPages)],
                ["Size", formatBytes(totalSize)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-zinc-100/80 px-2 py-2.5 dark:bg-white/5">
                  <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{k}</dt>
                  <dd className="text-sm font-semibold text-zinc-900 dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <label htmlFor="merge-name" className="mt-5 block text-sm font-medium text-zinc-700 dark:text-zinc-200">File name</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input id="merge-name" value={outName} onChange={(e) => setOutName(e.target.value)} className={inputClass} />
              <span className="text-sm text-zinc-500">.pdf</span>
            </div>
            {hasErrors && <p className="mt-3 text-xs text-red-600 dark:text-red-300">Remove the files marked in red to continue.</p>}
            {ready.length < 2 && !hasErrors && <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Add at least two PDFs to merge.</p>}
            <button type="button" onClick={merge} disabled={!canMerge} className={cx(btnPrimary, "mt-5 w-full")}>
              <Layers className="h-5 w-5" aria-hidden />
              Merge PDFs
            </button>
            <button type="button" onClick={reset} className={cx(btnSecondary, "mt-3 w-full")}>Clear all</button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================ COMPRESS */

export function CompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [preset, setPreset] = useState<CompressPreset>("recommended");
  const [keepText, setKeepText] = useState(false);
  const [live, setLive] = useState<number | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; original: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { state, run } = useProcessor();

  const onFiles = async (files: File[]) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      setInfo(await loadPdfInfo(files[0]));
      setFile(files[0]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setInfo(null);
    setResult(null);
    setError(null);
    setLive(null);
  };

  const compress = async () => {
    if (!info) return;
    setError(null);
    setLive(null);
    try {
      const bytes = await run(keepText ? "Optimizing PDF structure…" : "Compressing your PDF…", (report) =>
        keepText ? optimizeStructure(info.bytes, report) : compressPdf(info.bytes, preset, report, (est) => setLive(est)),
      );
      setResult({ bytes, original: info.bytes.byteLength });
    } catch (e) {
      setError(friendlyError(e, "Compression failed. Please try another file."));
    }
  };

  const liveDetail =
    live !== null && info
      ? `Estimated size ${formatBytes(live)} (about ${Math.max(0, Math.round((1 - live / info.bytes.byteLength) * 100))}% smaller)`
      : undefined;

  if (state.running) return <ProcessingPanel state={state} detail={liveDetail} />;

  if (result && file) {
    const smaller = result.bytes.byteLength < result.original;
    const savedPct = smaller ? Math.round((1 - result.bytes.byteLength / result.original) * 100) : 0;
    const finalBytes = smaller ? result.bytes : (info as PdfInfo).bytes;
    return (
      <ResultCard
        title={smaller ? "Your PDF is smaller" : "This PDF is already well optimized"}
        subtitle={
          smaller
            ? keepText
              ? "Text stays selectable and searchable."
              : "Pages were re-encoded as images, so text is no longer selectable."
            : "We couldn't make it smaller with these settings, so you'll get your original file. Try a stronger preset."
        }
        highlight={`Saved ${savedPct}%`}
        stats={[
          { label: "Before", value: formatBytes(result.original) },
          { label: "After", value: formatBytes(finalBytes.byteLength) },
          { label: "Saved", value: formatBytes(Math.max(0, result.original - finalBytes.byteLength)) },
        ]}
        downloadLabel="Download PDF"
        onDownload={() => downloadBlob(toBlob(finalBytes, "application/pdf"), `${baseName(file.name)}-compressed.pdf`)}
        onReset={reset}
        resetLabel="Compress another"
      />
    );
  }

  if (!info || !file) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {loading ? (
          <Card className="flex items-center justify-center gap-3 py-16 text-zinc-600 dark:text-zinc-300">
            <Loader2 className="h-6 w-6 animate-spin" /> Reading your PDF…
          </Card>
        ) : (
          <DropZone accept={PDF_ACCEPT} acceptLabel="PDF files" onFiles={onFiles} icon={Shrink} title="Drop a PDF to compress" subtitle="Pick a compression level and see the savings in real time." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionLabel>Your file</SectionLabel>
          <FileHeader thumb={info.thumb} name={file.name} size={file.size} pages={info.numPages} onChange={reset} />
          <div className="mt-8">
            <SectionLabel>Compression level</SectionLabel>
            <div role="radiogroup" aria-label="Compression level" className={cx("grid gap-3 sm:grid-cols-3", keepText && "pointer-events-none opacity-40")}>
              {(Object.keys(COMPRESS_PRESETS) as CompressPreset[]).map((key) => (
                <ChoiceCard key={key} selected={preset === key} onSelect={() => setPreset(key)} title={COMPRESS_PRESETS[key].label} description={COMPRESS_PRESETS[key].blurb} />
              ))}
            </div>
          </div>
        </Card>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>Options</SectionLabel>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <input type="checkbox" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} className="mt-1 h-5 w-5 rounded accent-orange-600 dark:accent-orange-400" />
              <span>
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Keep text selectable</span>
                <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                  Lighter optimization that keeps text searchable. Savings are usually small.
                </span>
              </span>
            </label>
            {!keepText && (
              <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Standard compression redraws each page as an image. It works best for scans and photo-heavy files, and text will no longer be selectable.
              </p>
            )}
            <button type="button" onClick={compress} className={cx(btnPrimary, "mt-5 w-full")}>
              <Shrink className="h-5 w-5" aria-hidden />
              Compress PDF
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">Current size: {formatBytes(file.size)}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ================================================================== SPLIT */

type SplitResult = { blob: Blob; filename: string; count: number; zip: boolean };

export function SplitTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [separate, setSeparate] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { state, run } = useProcessor();

  // Render page thumbnails one by one so the grid fills in progressively.
  useEffect(() => {
    if (!info) return;
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;
    setThumbs(new Array(info.numPages).fill(null));
    (async () => {
      try {
        pdf = await openPdf(info.bytes);
        for (let n = 1; n <= info.numPages; n++) {
          if (cancelled) break;
          const thumb = await renderThumb(pdf, n, 220);
          if (cancelled) break;
          setThumbs((prev) => {
            const copy = prev.slice();
            copy[n - 1] = thumb;
            return copy;
          });
        }
      } catch {
        /* thumbnails are a nicety; page selection still works without them */
      }
    })();
    return () => {
      cancelled = true;
      if (pdf) closePdf(pdf);
    };
  }, [info]);

  const applySelection = (pages: number[]) => {
    setSelected(new Set(pages));
    setRangeText(formatPageRanges(pages));
    setRangeError(null);
  };

  const togglePage = (n: number) => {
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    applySelection(Array.from(next));
  };

  const onRangeChange = (value: string) => {
    setRangeText(value);
    if (!info) return;
    const parsed = parsePageRanges(value, info.numPages);
    setRangeError(parsed.error);
    if (!parsed.error) setSelected(new Set(parsed.pages));
  };

  const onFiles = async (files: File[]) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const loaded = await loadPdfInfo(files[0]);
      setInfo(loaded);
      setFile(files[0]);
      setSelected(new Set());
      setRangeText("");
      setRangeError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setInfo(null);
    setThumbs([]);
    setSelected(new Set());
    setRangeText("");
    setResult(null);
    setError(null);
  };

  const pages = Array.from(selected).sort((a, b) => a - b);

  const extract = async () => {
    if (!info || !file || pages.length === 0) return;
    setError(null);
    try {
      const name = baseName(file.name);
      if (separate && pages.length > 1) {
        const blob = await run("Splitting your PDF…", async (report) => {
          const files = await splitEachPage(info.bytes, pages, name, report);
          report(0.9, "Creating ZIP");
          const zip = new JSZip();
          files.forEach((f) => zip.file(f.name, f.bytes));
          return zip.generateAsync({ type: "blob", compression: "STORE" });
        });
        setResult({ blob, filename: `${name}-pages.zip`, count: pages.length, zip: true });
      } else {
        const bytes = await run("Extracting pages…", (report) => extractPages(info.bytes, pages, report));
        setResult({ blob: toBlob(bytes, "application/pdf"), filename: `${name}-extracted.pdf`, count: pages.length, zip: false });
      }
    } catch (e) {
      setError(friendlyError(e, "Extraction failed. Please try again."));
    }
  };

  if (state.running) return <ProcessingPanel state={state} />;

  if (result) {
    return (
      <ResultCard
        title={result.zip ? "Your pages are ready" : "Your pages are extracted"}
        subtitle="Created on this device. Nothing was uploaded."
        stats={[
          { label: result.zip ? "PDF files" : "Pages", value: String(result.count) },
          { label: "Format", value: result.zip ? "ZIP" : "PDF" },
          { label: "File size", value: formatBytes(result.blob.size) },
        ]}
        downloadLabel={result.zip ? "Download ZIP" : "Download PDF"}
        onDownload={() => downloadBlob(result.blob, result.filename)}
        onReset={reset}
        resetLabel="Split another PDF"
      />
    );
  }

  if (!info || !file) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {loading ? (
          <Card className="flex items-center justify-center gap-3 py-16 text-zinc-600 dark:text-zinc-300">
            <Loader2 className="h-6 w-6 animate-spin" /> Reading your PDF…
          </Card>
        ) : (
          <DropZone accept={PDF_ACCEPT} acceptLabel="PDF files" onFiles={onFiles} icon={Scissors} title="Drop a PDF to split" subtitle="Preview every page, then pick the ones you want to keep." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>{info.numPages} pages. Tap pages to select.</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cx(btnSecondary, "!px-3 !py-2 !text-xs")} onClick={() => applySelection(Array.from({ length: info.numPages }, (_, i) => i + 1))}>All</button>
              <button type="button" className={cx(btnSecondary, "!px-3 !py-2 !text-xs")} onClick={() => applySelection(Array.from({ length: info.numPages }, (_, i) => i + 1).filter((n) => n % 2 === 1))}>Odd</button>
              <button type="button" className={cx(btnSecondary, "!px-3 !py-2 !text-xs")} onClick={() => applySelection(Array.from({ length: info.numPages }, (_, i) => i + 1).filter((n) => n % 2 === 0))}>Even</button>
              <button type="button" className={cx(btnSecondary, "!px-3 !py-2 !text-xs")} onClick={() => applySelection([])}>Clear</button>
            </div>
          </div>
          <ul className="grid max-h-[70vh] grid-cols-3 gap-3 overflow-y-auto p-1 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: info.numPages }, (_, i) => i + 1).map((n) => {
              const on = selected.has(n);
              return (
                <li key={n}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Page ${n}`}
                    onClick={() => togglePage(n)}
                    className={cx(
                      "group relative block w-full overflow-hidden rounded-xl border-2 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40",
                      on ? "border-orange-600 dark:border-orange-400 shadow-md shadow-orange-900/10" : "border-transparent bg-zinc-100 dark:bg-white/5",
                    )}
                  >
                    <div className="flex aspect-[3/4] items-center justify-center bg-white dark:bg-zinc-800">
                      {thumbs[n - 1] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbs[n - 1] as string} alt="" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <span className="h-full w-full animate-pulse bg-zinc-200 dark:bg-white/10" />
                      )}
                    </div>
                    <span className={cx("absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-xs font-bold", on ? "accent3d text-white" : "bg-zinc-900/70 text-white")}>{n}</span>
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full accent3d text-white shadow">
                        <Check className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>Your file</SectionLabel>
            <FileHeader thumb={info.thumb} name={file.name} size={file.size} pages={info.numPages} onChange={reset} />
          </Card>
          <Card>
            <SectionLabel>Pages to extract</SectionLabel>
            <label htmlFor="split-range" className="sr-only">Page ranges</label>
            <input
              id="split-range"
              value={rangeText}
              onChange={(e) => onRangeChange(e.target.value)}
              placeholder="e.g. 1-3, 5, 8-10"
              inputMode="text"
              aria-invalid={Boolean(rangeError)}
              className={inputClass}
            />
            {rangeError ? (
              <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">{rangeError}</p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{pages.length} page{pages.length === 1 ? "" : "s"} selected</p>
            )}
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-zinc-700 dark:text-zinc-200">
              <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} className="mt-0.5 h-5 w-5 rounded accent-orange-600 dark:accent-orange-400" />
              <span>Save each page as its own PDF (ZIP)</span>
            </label>
            <button type="button" onClick={extract} disabled={pages.length === 0 || Boolean(rangeError)} className={cx(btnPrimary, "mt-5 w-full")}>
              <Scissors className="h-5 w-5" aria-hidden />
              Extract pages
            </button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================ PDF -> IMAGES */

const IMAGE_QUALITY = [
  { key: 1.5, title: "Standard", description: "About 108 DPI. Fast, small files." },
  { key: 2, title: "High", description: "About 144 DPI. Great for screens." },
  { key: 3, title: "Maximum", description: "About 216 DPI. Print-ready detail." },
];

export function PdfToImagesTool({ initial }: { initial?: { format?: "png" | "jpg" } } = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [format, setFormat] = useState<ImageFormat>(initial?.format ?? "png");
  const [scale, setScale] = useState(2);
  const [quality, setQuality] = useState(90);
  const [images, setImages] = useState<RenderedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { state, run } = useProcessor();

  // Free the object URLs when results change or the tool closes.
  useEffect(() => {
    return () => images.forEach((img) => URL.revokeObjectURL(img.url));
  }, [images]);

  const onFiles = async (files: File[]) => {
    setError(null);
    setLoading(true);
    try {
      setInfo(await loadPdfInfo(files[0]));
      setFile(files[0]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setInfo(null);
    setImages([]);
    setError(null);
  };

  const convert = async () => {
    if (!info || !file) return;
    setError(null);
    try {
      const out = await run("Converting pages to images…", (report) =>
        pdfToImages(info.bytes, { format, scale, quality: quality / 100 }, baseName(file.name), report),
      );
      setImages(out);
    } catch (e) {
      setError(friendlyError(e, "Conversion failed. Please try another file."));
    }
  };

  const downloadAll = async () => {
    if (!file) return;
    if (images.length === 1) {
      downloadBlob(images[0].blob, images[0].name);
      return;
    }
    const zip = new JSZip();
    images.forEach((img) => zip.file(img.name, img.blob));
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    downloadBlob(blob, `${baseName(file.name)}-images.zip`);
  };

  if (state.running) return <ProcessingPanel state={state} />;

  if (images.length > 0 && file) {
    const total = images.reduce((n, img) => n + img.blob.size, 0);
    return (
      <ResultCard
        title={`${images.length} image${images.length > 1 ? "s" : ""} ready`}
        subtitle="Click any preview to download that page on its own."
        stats={[
          { label: "Format", value: format.toUpperCase() },
          { label: "Resolution", value: `${images[0].width} × ${images[0].height}` },
          { label: "Total size", value: formatBytes(total) },
        ]}
        downloadLabel={images.length > 1 ? "Download all (ZIP)" : "Download image"}
        onDownload={downloadAll}
        onReset={reset}
        resetLabel="Convert another PDF"
      >
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {images.map((img) => (
            <li key={img.name}>
              <button type="button" onClick={() => downloadBlob(img.blob, img.name)} className="group block w-full overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.name} className="aspect-[3/4] w-full object-cover" loading="lazy" />
                <span className="block truncate px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-300">{img.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </ResultCard>
    );
  }

  if (!info || !file) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {loading ? (
          <Card className="flex items-center justify-center gap-3 py-16 text-zinc-600 dark:text-zinc-300">
            <Loader2 className="h-6 w-6 animate-spin" /> Reading your PDF…
          </Card>
        ) : (
          <DropZone accept={PDF_ACCEPT} acceptLabel="PDF files" onFiles={onFiles} icon={FileImage} title="Drop a PDF to convert" subtitle="Turn every page into a crisp PNG or JPG image." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionLabel>Your file</SectionLabel>
          <FileHeader thumb={info.thumb} name={file.name} size={file.size} pages={info.numPages} onChange={reset} />
          <div className="mt-8">
            <SectionLabel>Image quality</SectionLabel>
            <div role="radiogroup" aria-label="Image quality" className="grid gap-3 sm:grid-cols-3">
              {IMAGE_QUALITY.map((q) => (
                <ChoiceCard key={q.key} selected={scale === q.key} onSelect={() => setScale(q.key)} title={q.title} description={q.description} />
              ))}
            </div>
          </div>
        </Card>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>Output format</SectionLabel>
            <div role="radiogroup" aria-label="Output format" className="grid grid-cols-2 gap-3">
              <ChoiceCard selected={format === "png"} onSelect={() => setFormat("png")} title="PNG" description="Lossless, sharp text" />
              <ChoiceCard selected={format === "jpg"} onSelect={() => setFormat("jpg")} title="JPG" description="Smaller files" />
            </div>
            {format === "jpg" && (
              <div className="mt-5">
                <label htmlFor="jpg-quality" className="flex justify-between text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  JPG quality <span className="tabular-nums">{quality}%</span>
                </label>
                <input id="jpg-quality" type="range" min={50} max={100} step={5} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="mt-2 w-full accent-orange-600 dark:accent-orange-400" />
              </div>
            )}
            <button type="button" onClick={convert} className={cx(btnPrimary, "mt-6 w-full")}>
              <FileImage className="h-5 w-5" aria-hidden />
              Convert to {format.toUpperCase()}
            </button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================ IMAGES -> PDF */

type ImageItem = { id: string; file: File; url: string };

export function ImagesToPdfTool() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeOption>("a4");
  const [margin, setMargin] = useState(18);
  const [result, setResult] = useState<{ bytes: Uint8Array; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state, run } = useProcessor();
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    const urls = urlsRef;
    return () => urls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const addFiles = (files: File[]) => {
    setError(null);
    setResult(null);
    const fresh = files.map((file) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      return { id: nextId(), file, url };
    });
    setItems((prev) => [...prev, ...fresh]);
  };

  const remove = (id: string) => {
    setItems((prev) => {
      const gone = prev.find((it) => it.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((it) => it.id !== id);
    });
  };

  const reorder = (from: number, to: number) => setItems((prev) => moveItem(prev, from, to));

  const reset = () => {
    items.forEach((it) => URL.revokeObjectURL(it.url));
    setItems([]);
    setResult(null);
    setError(null);
  };

  const convert = async () => {
    setError(null);
    try {
      const bytes = await run("Building your PDF…", (report) => imagesToPdf(items.map((it) => it.file), { pageSize, margin }, report));
      setResult({ bytes, count: items.length });
    } catch (e) {
      setError(friendlyError(e, "Conversion failed. Please check your images."));
    }
  };

  if (state.running) return <ProcessingPanel state={state} />;

  if (result) {
    return (
      <ResultCard
        title="Your PDF is ready"
        subtitle="Created on this device. Nothing was uploaded."
        stats={[
          { label: "Pages", value: String(result.count) },
          { label: "Page size", value: pageSize === "fit" ? "Fit to image" : pageSize === "a4" ? "A4" : "US Letter" },
          { label: "File size", value: formatBytes(result.bytes.byteLength) },
        ]}
        downloadLabel="Download PDF"
        onDownload={() => downloadBlob(toBlob(result.bytes, "application/pdf"), "images.pdf")}
        onReset={reset}
        resetLabel="Convert more images"
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <DropZone accept={IMAGE_ACCEPT} acceptLabel="image files" multiple onFiles={addFiles} icon={ImagePlus} title="Drop your images here" subtitle="JPG, PNG, WebP, GIF or BMP. Each image becomes one page." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4">
            {items.map((it, index) => (
              <li key={it.id}>
                <SortableItem index={index} onReorder={reorder} className="h-full">
                  <div className="relative flex h-full cursor-grab flex-col rounded-xl border border-zinc-200 bg-white/80 p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-lg active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.05]">
                    <span className="absolute left-5 top-5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/80 text-xs font-bold text-white backdrop-blur">{index + 1}</span>
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-white/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.url} alt={`Preview of ${it.file.name}`} className="h-full w-full object-contain" draggable={false} />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-zinc-900 dark:text-white" title={it.file.name}>{it.file.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatBytes(it.file.size)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex">
                        <IconButton label="Move earlier" onClick={() => reorder(index, index - 1)} disabled={index === 0}>
                          <ArrowLeft className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Move later" onClick={() => reorder(index, index + 1)} disabled={index === items.length - 1}>
                          <ArrowRight className="h-4 w-4" />
                        </IconButton>
                      </div>
                      <IconButton label={`Remove ${it.file.name}`} onClick={() => remove(it.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </IconButton>
                    </div>
                  </div>
                </SortableItem>
              </li>
            ))}
          </ul>
          <DropZone accept={IMAGE_ACCEPT} acceptLabel="image files" multiple compact onFiles={addFiles} icon={ImagePlus} title="Add more images" subtitle="Drop files here or click to browse." />
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>PDF settings</SectionLabel>
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">Page size</p>
            <div role="radiogroup" aria-label="Page size" className="grid gap-2">
              <ChoiceCard selected={pageSize === "a4"} onSelect={() => setPageSize("a4")} title="A4" description="Standard in the UK and Australia" />
              <ChoiceCard selected={pageSize === "letter"} onSelect={() => setPageSize("letter")} title="US Letter" description="Standard in the US and Canada" />
              <ChoiceCard selected={pageSize === "fit"} onSelect={() => setPageSize("fit")} title="Fit to image" description="Each page matches its image" />
            </div>
            <label htmlFor="img-margin" className="mt-5 flex justify-between text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Margin <span className="tabular-nums">{margin === 0 ? "None" : `${Math.round(margin / 2.835)} mm`}</span>
            </label>
            <input id="img-margin" type="range" min={0} max={54} step={9} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="mt-2 w-full accent-orange-600 dark:accent-orange-400" />
            <button type="button" onClick={convert} className={cx(btnPrimary, "mt-6 w-full")}>
              <FileText className="h-5 w-5" aria-hidden />
              Create PDF ({items.length} image{items.length > 1 ? "s" : ""})
            </button>
            <button type="button" onClick={reset} className={cx(btnSecondary, "mt-3 w-full")}>Clear all</button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ========================================================= PROTECT / UNLOCK */

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return { score, label: ["Too weak", "Weak", "Okay", "Strong", "Excellent"][score] };
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}</label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={cx(inputClass, "pr-12")} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-white/10">
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

type LockInfo = {
  file: File;
  bytes: Uint8Array;
  numPages: number;
  thumb: string | null;
  locked: boolean;
};

export function ProtectTool({ initial }: { initial?: { mode?: string } } = {}) {
  const [mode, setMode] = useState<"protect" | "unlock">(initial?.mode === "unlock" ? "unlock" : "protect");
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowModifying, setAllowModifying] = useState(false);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; kind: "protect" | "unlock" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { state, run } = useProcessor();

  const reset = () => {
    setLock(null);
    setPassword("");
    setConfirm("");
    setResult(null);
    setError(null);
  };

  const switchMode = (next: "protect" | "unlock") => {
    reset();
    setMode(next);
  };

  const onFiles = async (files: File[]) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const inspected = await inspectPdf(files[0]);
      if (mode === "protect" && inspected.locked) {
        setError("This PDF already has a password. Use the Unlock tab first.");
        return;
      }
      setLock({ file: files[0], bytes: inspected.bytes, numPages: inspected.numPages, thumb: inspected.thumb, locked: inspected.locked });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const strength = passwordStrength(password);
  const canProtect = password.length >= 4 && password === confirm;

  const protect = async () => {
    if (!lock || !canProtect) return;
    setError(null);
    try {
      const bytes = await run("Encrypting your PDF…", (report) =>
        protectPdf(lock.bytes, { userPassword: password, allowPrinting, allowCopying, allowModifying }, report),
      );
      setResult({ bytes, name: `${baseName(lock.file.name)}-protected.pdf`, kind: "protect" });
    } catch (e) {
      setError(friendlyError(e, "Encryption failed. Please try another file."));
    }
  };

  const unlock = async () => {
    if (!lock) return;
    setError(null);
    try {
      // Check the password first so a typo doesn't cost a full progress run.
      if (lock.locked) {
        const check = await inspectPdf(lock.file, password);
        if (check.locked) {
          setError(password ? "That password isn't correct. Please try again." : "Enter the PDF's password to unlock it.");
          return;
        }
      }
      const bytes = await run("Unlocking your PDF…", (report) => unlockPdf(lock.bytes, password, report));
      setResult({ bytes, name: `${baseName(lock.file.name)}-unlocked.pdf`, kind: "unlock" });
    } catch (e) {
      setError(isPasswordError(e) ? "That password isn't correct. Please try again." : friendlyError(e, "Unlocking failed. Please try again."));
    }
  };

  const tabs = (
    <div role="tablist" aria-label="Protect or unlock" className="mb-6 inline-flex rounded-xl border border-zinc-200 bg-white/60 p-1 dark:border-white/10 dark:bg-white/5">
      {(["protect", "unlock"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => switchMode(m)}
          className={cx(
            "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40",
            mode === m ? "accent3d text-white shadow" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white",
          )}
        >
          {m === "protect" ? <LockKeyhole className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          {m === "protect" ? "Protect" : "Unlock"}
        </button>
      ))}
    </div>
  );

  if (state.running) return <ProcessingPanel state={state} />;

  if (result) {
    return (
      <ResultCard
        title={result.kind === "protect" ? "Your PDF is password-protected" : "Your PDF is unlocked"}
        subtitle={
          result.kind === "protect"
            ? "Keep the password safe. We can't recover it, because we never see your file or password."
            : "The password and restrictions are gone. Pages were redrawn as images, so text is no longer selectable."
        }
        stats={[
          { label: "Status", value: result.kind === "protect" ? "Protected" : "Unlocked" },
          { label: "File size", value: formatBytes(result.bytes.byteLength) },
          { label: "Uploaded", value: "Nothing" },
        ]}
        downloadLabel="Download PDF"
        onDownload={() => downloadBlob(toBlob(result.bytes, "application/pdf"), result.name)}
        onReset={reset}
        resetLabel="Start over"
      />
    );
  }

  if (!lock) {
    return (
      <div className="space-y-4">
        {tabs}
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {loading ? (
          <Card className="flex items-center justify-center gap-3 py-16 text-zinc-600 dark:text-zinc-300">
            <Loader2 className="h-6 w-6 animate-spin" /> Reading your PDF…
          </Card>
        ) : (
          <DropZone
            accept={PDF_ACCEPT}
            acceptLabel="PDF files"
            onFiles={onFiles}
            icon={mode === "protect" ? LockKeyhole : Unlock}
            title={mode === "protect" ? "Drop a PDF to protect" : "Drop a PDF to unlock"}
            subtitle={mode === "protect" ? "Add a password so only people who know it can open the file." : "Enter the password to remove it from the file."}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tabs}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionLabel>Your file</SectionLabel>
          <FileHeader thumb={lock.thumb} name={lock.file.name} size={lock.file.size} pages={lock.numPages || undefined} onChange={reset} />
          {mode === "unlock" && (
            <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              Unlocking redraws each page into a new, unprotected PDF. It needs the correct password and can't crack unknown ones. Text in the result is no longer selectable.
            </p>
          )}
        </Card>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            {mode === "protect" ? (
              <>
                <SectionLabel>Set a password</SectionLabel>
                <div className="space-y-4">
                  <PasswordField id="pw" label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
                  {password && (
                    <div aria-live="polite">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} className={cx("h-1.5 flex-1 rounded-full transition", i < strength.score ? (strength.score >= 3 ? "bg-emerald-500" : strength.score === 2 ? "bg-amber-500" : "bg-red-500") : "bg-zinc-200 dark:bg-white/10")} />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Strength: {strength.label}</p>
                    </div>
                  )}
                  <PasswordField id="pw2" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
                  {confirm && password !== confirm && <p role="alert" className="text-xs text-red-600 dark:text-red-300">Passwords don't match.</p>}
                </div>
                <fieldset className="mt-5">
                  <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">Allow after opening</legend>
                  {[
                    ["Printing", allowPrinting, setAllowPrinting],
                    ["Copying text", allowCopying, setAllowCopying],
                    ["Editing and annotating", allowModifying, setAllowModifying],
                  ].map(([label, value, setter]) => (
                    <label key={label as string} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                      <input type="checkbox" checked={value as boolean} onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)} className="h-5 w-5 rounded accent-orange-600 dark:accent-orange-400" />
                      {label as string}
                    </label>
                  ))}
                </fieldset>
                <button type="button" onClick={protect} disabled={!canProtect} className={cx(btnPrimary, "mt-5 w-full")}>
                  <LockKeyhole className="h-5 w-5" aria-hidden />
                  Protect PDF
                </button>
              </>
            ) : (
              <>
                <SectionLabel>{lock.locked ? "Enter the password" : "Remove restrictions"}</SectionLabel>
                {lock.locked ? (
                  <PasswordField id="unlock-pw" label="PDF password" value={password} onChange={setPassword} autoComplete="off" />
                ) : (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    This PDF opens without a password. Unlocking will still remove any print, copy or edit restrictions.
                  </p>
                )}
                <button type="button" onClick={unlock} disabled={lock.locked && !password} className={cx(btnPrimary, "mt-5 w-full")}>
                  <Unlock className="h-5 w-5" aria-hidden />
                  Unlock PDF
                </button>
              </>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
