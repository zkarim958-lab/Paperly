"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Table2,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  arrangePdf,
  baseName,
  closePdf,
  downloadBlob,
  formatBytes,
  friendlyError,
  loadPdfInfo,
  moveItem,
  openPdf,
  renderThumb,
  toBlob,
  type PdfInfo,
} from "@/lib/pdf";
import { OCR_LANGS, pdfToDocx, pdfToPptx, pdfToXlsx, readPages, type ExcelMode, type OcrLang, type PptMode, type ReadResult } from "@/lib/pdfconvert";
import { docxToPdf } from "@/lib/docx";
import { DEFAULT_XLSX_OPTIONS, parseCsv, parseXlsx, sheetsToPdf, type XlsxPdfOptions } from "@/lib/xlsx";
import { DEFAULT_CODE_OPTIONS, codeToPdf, notebookToPdf, type CodePdfOptions } from "@/lib/code";
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
  useProcessor,
} from "@/components/ui";

const PDF_ACCEPT = ".pdf,application/pdf";

type Initial = { mode?: string } | undefined;

/* small shared bits ------------------------------------------------------- */

function Choice({ selected, onSelect, title, description }: { selected: boolean; onSelect: () => void; title: string; description?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "w-full rounded-xl border p-4 text-left transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40",
        selected ? "border-zinc-900 bg-zinc-100 shadow-md dark:border-white dark:bg-white/10" : "border-zinc-200 bg-white/60 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03]",
      )}
    >
      <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{title}</span>
      {description && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>}
    </button>
  );
}

function Toggle({ checked, onChange, title, description }: { checked: boolean; onChange: (v: boolean) => void; title: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 rounded accent-orange-600 dark:accent-orange-400" />
      <span>
        <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>}
      </span>
    </label>
  );
}

function PlainFileHeader({ icon: Icon, name, size, extra, onChange }: { icon: typeof FileText; name: string; size: number; extra?: string; onChange: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-zinc-900 dark:text-white" title={name}>{name}</p>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {formatBytes(size)}
          {extra ? ` · ${extra}` : ""}
        </p>
        <button type="button" onClick={onChange} className="mt-2 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-300">
          Choose a different file
        </button>
      </div>
    </div>
  );
}

function Notes({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mx-auto mt-6 max-w-xl list-disc space-y-1 pl-5 text-left text-sm text-zinc-600 dark:text-zinc-400">
      {items.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

function useSinglePdf() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async (files: File[]) => {
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
  const clear = () => {
    setFile(null);
    setInfo(null);
    setError(null);
  };
  return { file, info, error, setError, loading, load, clear };
}

function Loading({ text }: { text: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 py-16 text-zinc-600 dark:text-zinc-300">
      <Loader2 className="h-6 w-6 animate-spin" /> {text}
    </Card>
  );
}

/* ============================================================ ROTATE / ORDER */

type PageItem = { id: string; src: number; rotate: number; deleted: boolean };

const COPY = {
  rotate: {
    drop: "Drop a PDF to rotate",
    sub: "Turn single pages or the whole document, then download.",
    action: "Rotate and download",
    done: "Your PDF is rotated",
    suffix: "rotated",
  },
  reorder: {
    drop: "Drop a PDF to reorder",
    sub: "Drag pages into a new order, or use the arrows.",
    action: "Save new order",
    done: "Your pages are reordered",
    suffix: "reordered",
  },
  delete: {
    drop: "Drop a PDF to delete pages",
    sub: "Mark the pages you don't want and download the rest.",
    action: "Delete pages and download",
    done: "The pages are removed",
    suffix: "edited",
  },
} as const;

export function OrganizeTool({ initial }: { initial?: Initial } = {}) {
  const mode: keyof typeof COPY = initial?.mode === "reorder" ? "reorder" : initial?.mode === "delete" ? "delete" : "rotate";
  const copy = COPY[mode];
  const { file, info, error, setError, loading, load, clear } = useSinglePdf();
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [items, setItems] = useState<PageItem[]>([]);
  const [result, setResult] = useState<{ bytes: Uint8Array; pages: number } | null>(null);
  const { state, run } = useProcessor();

  useEffect(() => {
    if (!info) return;
    setItems(Array.from({ length: info.numPages }, (_, i) => ({ id: `p${i + 1}`, src: i + 1, rotate: 0, deleted: false })));
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;
    setThumbs(new Array(info.numPages).fill(null));
    (async () => {
      try {
        pdf = await openPdf(info.bytes);
        for (let n = 1; n <= info.numPages; n++) {
          if (cancelled) break;
          const t = await renderThumb(pdf, n, 220);
          if (cancelled) break;
          setThumbs((prev) => {
            const c = prev.slice();
            c[n - 1] = t;
            return c;
          });
        }
      } catch {
        /* thumbnails are optional */
      }
    })();
    return () => {
      cancelled = true;
      if (pdf) closePdf(pdf);
    };
  }, [info]);

  const reset = () => {
    clear();
    setItems([]);
    setThumbs([]);
    setResult(null);
  };

  const update = (id: string, patch: (p: PageItem) => PageItem) => setItems((l) => l.map((p) => (p.id === id ? patch(p) : p)));
  const kept = items.filter((p) => !p.deleted);
  const changed = items.some((p) => p.rotate % 360 !== 0 || p.deleted) || items.some((p, i) => p.src !== i + 1);

  const save = async () => {
    if (!info || !file || !kept.length) return;
    setError(null);
    try {
      const bytes = await run("Saving your PDF…", (report) => arrangePdf(info.bytes, kept.map((p) => ({ src: p.src, rotate: p.rotate })), report));
      setResult({ bytes, pages: kept.length });
    } catch (e) {
      setError(friendlyError(e, "Could not save the PDF. Please try another file."));
    }
  };

  if (state.running) return <ProcessingPanel state={state} />;

  if (result && file) {
    return (
      <ResultCard
        title={copy.done}
        subtitle="Nothing was uploaded. The new file was made on your device."
        stats={[
          { label: "Pages", value: String(result.pages) },
          { label: "Size", value: formatBytes(result.bytes.byteLength) },
          { label: "Original", value: formatBytes(file.size) },
        ]}
        downloadLabel="Download PDF"
        onDownload={() => downloadBlob(toBlob(result.bytes, "application/pdf"), `${baseName(file.name)}-${copy.suffix}.pdf`)}
        onReset={reset}
        resetLabel="Start over"
      />
    );
  }

  if (!info || !file) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {loading ? <Loading text="Reading your PDF…" /> : <DropZone accept={PDF_ACCEPT} acceptLabel="PDF files" onFiles={load} icon={RotateCw} title={copy.drop} subtitle={copy.sub} />}
      </div>
    );
  }

  const rotateAll = (d: number) => setItems((l) => l.map((p) => ({ ...p, rotate: (p.rotate + d + 360) % 360 })));

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <Card>
        <SectionLabel>Your file</SectionLabel>
        <FileHeader thumb={info.thumb} name={file.name} size={file.size} pages={info.numPages} onChange={reset} />
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>{mode === "reorder" ? "Drag to reorder" : mode === "delete" ? "Pick pages to delete" : "Rotate pages"}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => rotateAll(-90)} className={btnSecondary}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Rotate all left
            </button>
            <button type="button" onClick={() => rotateAll(90)} className={btnSecondary}>
              <RotateCw className="h-4 w-4" aria-hidden /> Rotate all right
            </button>
            <button type="button" onClick={() => setItems((l) => l.slice().sort((a, b) => b.src - a.src))} className={btnSecondary}>
              Reverse order
            </button>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((p, i) => (
            <li key={p.id}>
              <SortableItem index={i} onReorder={(from, to) => setItems((l) => moveItem(l, from, to))}>
                <div className={cx("rounded-xl border border-zinc-200 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]", p.deleted && "opacity-40")}>
                  <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-white/5">
                    {thumbs[p.src - 1] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbs[p.src - 1] as string}
                        alt={`Page ${p.src}`}
                        draggable={false}
                        className="max-h-36 max-w-[85%] bg-white object-contain shadow transition-transform duration-200"
                        style={{ transform: `rotate(${p.rotate}deg)${p.rotate % 180 !== 0 ? " scale(0.72)" : ""}` }}
                      />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
                    )}
                  </div>
                  <p className="mt-2 text-center text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Page {p.src}
                    {p.rotate ? ` · ${p.rotate}°` : ""}
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-0.5">
                    <MiniBtn label={`Move page ${p.src} earlier`} disabled={i === 0} onClick={() => setItems((l) => moveItem(l, i, i - 1))}>
                      <ArrowLeft className="h-4 w-4" />
                    </MiniBtn>
                    <MiniBtn label={`Rotate page ${p.src} left`} onClick={() => update(p.id, (x) => ({ ...x, rotate: (x.rotate + 270) % 360 }))}>
                      <RotateCcw className="h-4 w-4" />
                    </MiniBtn>
                    <MiniBtn label={`Rotate page ${p.src} right`} onClick={() => update(p.id, (x) => ({ ...x, rotate: (x.rotate + 90) % 360 }))}>
                      <RotateCw className="h-4 w-4" />
                    </MiniBtn>
                    <MiniBtn label={p.deleted ? `Restore page ${p.src}` : `Delete page ${p.src}`} onClick={() => update(p.id, (x) => ({ ...x, deleted: !x.deleted }))}>
                      {p.deleted ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </MiniBtn>
                    <MiniBtn label={`Move page ${p.src} later`} disabled={i === items.length - 1} onClick={() => setItems((l) => moveItem(l, i, i + 1))}>
                      <ArrowRight className="h-4 w-4" />
                    </MiniBtn>
                  </div>
                </div>
              </SortableItem>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col items-center gap-2">
          <button type="button" onClick={save} disabled={!kept.length || !changed} className={cx(btnPrimary, "w-full sm:w-auto sm:min-w-[260px]")}>
            {copy.action}
          </button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {kept.length} of {items.length} pages will be kept{!changed ? " · make a change to continue" : ""}
          </p>
        </div>
      </Card>
    </div>
  );
}

function MiniBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200/70 active:scale-90 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

/* ============================================================== PDF -> OFFICE */

type OfficeKind = "word" | "excel" | "ppt";

const KIND = {
  word: { label: "Word", ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: FileText },
  excel: { label: "Excel", ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", icon: FileSpreadsheet },
  ppt: { label: "PowerPoint", ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", icon: Presentation },
} as const;

function PdfToOfficeTool({ kind }: { kind: OfficeKind }) {
  const k = KIND[kind];
  const { file, info, error, setError, loading, load, clear } = useSinglePdf();
  const [ocr, setOcr] = useState(false);
  const [lang, setLang] = useState<OcrLang>("eng");
  const [excelMode, setExcelMode] = useState<ExcelMode>("per-page");
  const [pptMode, setPptMode] = useState<PptMode>("image");
  const [result, setResult] = useState<{ bytes: Uint8Array; notes: string[]; stats: { label: string; value: string }[] } | null>(null);
  const { state, run } = useProcessor();

  const reset = () => {
    clear();
    setResult(null);
  };

  const convert = async () => {
    if (!info || !file) return;
    setError(null);
    try {
      const out = await run(`Converting to ${k.label}…`, async (report) => {
        const needText = kind !== "ppt" || pptMode === "text";
        let read: ReadResult;
        if (needText) read = await readPages(info.bytes, { ocr, lang }, (f, l) => report(f * 0.9, l));
        else read = await readPages(info.bytes, { ocr: false, lang }, () => undefined);
        const notes: string[] = [];
        if (read.ocrPages) notes.push(`${read.ocrPages} scanned page${read.ocrPages > 1 ? "s were" : " was"} read with OCR, so please proofread the text.`);
        if (read.emptyPages && needText) {
          notes.push(
            ocr
              ? `${read.emptyPages} page${read.emptyPages > 1 ? "s" : ""} had no readable text.`
              : `${read.emptyPages} page${read.emptyPages > 1 ? "s" : ""} contain no selectable text (probably scans). Turn on "Read scanned pages" and convert again.`,
          );
        }
        if (kind === "word") {
          const bytes = await pdfToDocx(read);
          notes.push("Text, headings and layout are rebuilt. Images and vector graphics are not copied into the Word file.");
          return { bytes, notes, stats: [{ label: "Pages", value: String(read.pages.length) }] };
        }
        if (kind === "excel") {
          const x = await pdfToXlsx(read, excelMode);
          notes.push("Rows and columns are guessed from where the text sits. Works best on table-like PDFs; check merged or multi-line cells.");
          return { bytes: x.bytes, notes, stats: [{ label: "Sheets", value: String(x.sheets) }, { label: "Rows", value: String(x.rows) }] };
        }
        const p = await pdfToPptx(info.bytes, read, pptMode, report);
        if (pptMode === "text") notes.push("Each text line becomes its own text box at its original position. Images and graphics are not included.");
        return { bytes: p.bytes, notes, stats: [{ label: "Slides", value: String(p.slides) }] };
      });
      setResult({ bytes: out.bytes, notes: out.notes, stats: [...out.stats, { label: "Size", value: formatBytes(out.bytes.byteLength) }] });
    } catch (e) {
      setError(friendlyError(e, `Could not convert this PDF to ${k.label}.`));
    }
  };

  if (state.running) return <ProcessingPanel state={state} detail={ocr ? "OCR downloads language data the first time and can take a while." : undefined} />;

  if (result && file) {
    return (
      <ResultCard
        title={`Your ${k.label} file is ready`}
        subtitle="Converted in your browser. Your PDF was not uploaded."
        stats={result.stats}
        downloadLabel={`Download .${k.ext}`}
        onDownload={() => downloadBlob(toBlob(result.bytes, k.mime), `${baseName(file.name)}.${k.ext}`)}
        onReset={reset}
        resetLabel="Convert another"
      >
        <Notes items={result.notes} />
      </ResultCard>
    );
  }

  if (!info || !file) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {loading ? (
          <Loading text="Reading your PDF…" />
        ) : (
          <DropZone accept={PDF_ACCEPT} acceptLabel="PDF files" onFiles={load} icon={k.icon} title={`Drop a PDF to convert to ${k.label}`} subtitle="Free, private and done on your device." />
        )}
      </div>
    );
  }

  const canOcr = kind !== "ppt" || pptMode === "text";

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionLabel>Your file</SectionLabel>
          <FileHeader thumb={info.thumb} name={file.name} size={file.size} pages={info.numPages} onChange={reset} />
          {kind === "excel" && (
            <div className="mt-8">
              <SectionLabel>Sheets</SectionLabel>
              <div role="radiogroup" aria-label="Sheets" className="grid gap-3 sm:grid-cols-2">
                <Choice selected={excelMode === "per-page"} onSelect={() => setExcelMode("per-page")} title="One sheet per page" description="Safest. Each page keeps its own columns." />
                <Choice selected={excelMode === "single"} onSelect={() => setExcelMode("single")} title="Everything on one sheet" description="Good for one long table that runs over several pages." />
              </div>
            </div>
          )}
          {kind === "ppt" && (
            <div className="mt-8">
              <SectionLabel>Slide style</SectionLabel>
              <div role="radiogroup" aria-label="Slide style" className="grid gap-3 sm:grid-cols-2">
                <Choice selected={pptMode === "image"} onSelect={() => setPptMode("image")} title="Pages as pictures" description="Looks exactly like the PDF. Text can't be edited." />
                <Choice selected={pptMode === "text"} onSelect={() => setPptMode("text")} title="Editable text boxes" description="Text is editable, graphics and photos are left out." />
              </div>
            </div>
          )}
        </Card>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>Options</SectionLabel>
            {canOcr ? (
              <div className="space-y-3">
                <Toggle checked={ocr} onChange={setOcr} title="Read scanned pages (OCR)" description="Only pages without selectable text are scanned. Slower, and the first run downloads language data." />
                {ocr && (
                  <div>
                    <label htmlFor="conv-ocr-lang" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Language of the document</label>
                    <select id="conv-ocr-lang" value={lang} onChange={(e) => setLang(e.target.value as OcrLang)} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-zinc-900">
                      {OCR_LANGS.map((l) => (
                        <option key={l.id} value={l.id}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Pages are rendered as high quality pictures, so scans work without OCR.</p>
            )}
            <button type="button" onClick={convert} className={cx(btnPrimary, "mt-5 w-full")}>
              <k.icon className="h-5 w-5" aria-hidden />
              Convert to {k.label}
            </button>
            <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">{info.numPages} page{info.numPages > 1 ? "s" : ""} · {formatBytes(file.size)}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export const PdfToWordTool = (_: { initial?: Initial } = {}) => <PdfToOfficeTool kind="word" />;
export const PdfToExcelTool = (_: { initial?: Initial } = {}) => <PdfToOfficeTool kind="excel" />;
export const PdfToPptTool = (_: { initial?: Initial } = {}) => <PdfToOfficeTool kind="ppt" />;

/* ============================================================== OFFICE -> PDF */

type ToPdfResult = { bytes: Uint8Array; pages: number; notes: string[] };

function describeUnsupported(chars: string[]): string[] {
  return chars.length
    ? [`These characters can't be drawn with the standard PDF fonts and show as "?": ${chars.slice(0, 12).join(" ")}${chars.length > 12 ? " …" : ""}`]
    : [];
}

function OfficeToPdfTool({ kind }: { kind: "word" | "excel" }) {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState<XlsxPdfOptions["page"]>("a4");
  const [grid, setGrid] = useState(true);
  const [result, setResult] = useState<ToPdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state, run } = useProcessor();
  const word = kind === "word";
  const accept = word ? ".docx" : ".xlsx,.csv,text/csv";

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const convert = async () => {
    if (!file) return;
    setError(null);
    try {
      const out = await run("Converting to PDF…", async (report): Promise<ToPdfResult> => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (word) {
          const r = await docxToPdf(bytes, report);
          return { bytes: r.bytes, pages: r.pages, notes: [...r.notes, ...describeUnsupported(r.unsupported)] };
        }
        const isCsv = /\.csv$/i.test(file.name);
        const sheets = isCsv ? parseCsv(new TextDecoder().decode(bytes), baseName(file.name)) : await parseXlsx(bytes);
        if (!sheets.length) throw new Error("This workbook has no sheets with data.");
        const r = await sheetsToPdf(sheets, { ...DEFAULT_XLSX_OPTIONS, page, gridlines: grid }, report);
        return { bytes: r.bytes, pages: r.pages, notes: describeUnsupported(r.unsupported ?? []) };
      });
      setResult(out);
    } catch (e) {
      setError(friendlyError(e, word ? "Could not read this Word file. Make sure it is a .docx." : "Could not read this spreadsheet. Make sure it is .xlsx or .csv."));
    }
  };

  if (state.running) return <ProcessingPanel state={state} />;

  if (result && file) {
    return (
      <ResultCard
        title="Your PDF is ready"
        subtitle="Converted in your browser. Your file was not uploaded."
        stats={[{ label: "Pages", value: String(result.pages) }, { label: "Size", value: formatBytes(result.bytes.byteLength) }]}
        downloadLabel="Download PDF"
        onDownload={() => downloadBlob(toBlob(result.bytes, "application/pdf"), `${baseName(file.name)}.pdf`)}
        onReset={reset}
        resetLabel="Convert another"
      >
        <Notes items={result.notes.length ? result.notes : []} />
      </ResultCard>
    );
  }

  if (!file) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <DropZone
          accept={accept}
          acceptLabel={word ? "Word .docx files" : "Excel .xlsx or CSV files"}
          onFiles={(f) => {
            setError(null);
            setFile(f[0]);
          }}
          icon={word ? FileText : FileSpreadsheet}
          title={word ? "Drop a Word file to convert to PDF" : "Drop an Excel or CSV file to convert to PDF"}
          subtitle={word ? "Works with .docx files. Headings, lists, tables and pictures are kept." : "Works with .xlsx and .csv. Numbers, dates and formatting are kept."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionLabel>Your file</SectionLabel>
          <PlainFileHeader icon={word ? FileText : Table2} name={file.name} size={file.size} onChange={reset} />
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
            {word
              ? "The PDF is built from the contents of your document with the standard PDF fonts. Complex layouts (text boxes, headers, footnotes) are simplified."
              : "Wide sheets are scaled or split across pages automatically. Only the standard PDF fonts are used."}
          </p>
        </Card>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>Options</SectionLabel>
            {!word && (
              <div className="space-y-3">
                <div role="radiogroup" aria-label="Page size" className="grid grid-cols-2 gap-3">
                  <Choice selected={page === "a4"} onSelect={() => setPage("a4")} title="A4" />
                  <Choice selected={page === "letter"} onSelect={() => setPage("letter")} title="Letter" />
                </div>
                <Toggle checked={grid} onChange={setGrid} title="Draw gridlines" description="Thin borders around every cell." />
              </div>
            )}
            <button type="button" onClick={convert} className={cx(btnPrimary, word ? "w-full" : "mt-5 w-full")}>
              {word ? <FileText className="h-5 w-5" aria-hidden /> : <FileSpreadsheet className="h-5 w-5" aria-hidden />}
              Convert to PDF
            </button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export const WordToPdfTool = (_: { initial?: Initial } = {}) => <OfficeToPdfTool kind="word" />;
export const ExcelToPdfTool = (_: { initial?: Initial } = {}) => <OfficeToPdfTool kind="excel" />;

/* ============================================================ CODE -> PDF */

export function CodeToPdfTool({ initial }: { initial?: Initial } = {}) {
  const preferNotebook = initial?.mode === "notebook";
  const [file, setFile] = useState<File | null>(null);
  const [opts, setOpts] = useState<CodePdfOptions>(DEFAULT_CODE_OPTIONS);
  const [result, setResult] = useState<ToPdfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state, run } = useProcessor();
  const isNb = file ? /\.ipynb$/i.test(file.name) : preferNotebook;

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };
  const set = <K extends keyof CodePdfOptions>(key: K, v: CodePdfOptions[K]) => setOpts((o) => ({ ...o, [key]: v }));

  const convert = async () => {
    if (!file) return;
    setError(null);
    try {
      const out = await run("Converting to PDF…", async (report): Promise<ToPdfResult> => {
        const text = await file.text();
        const r = /\.ipynb$/i.test(file.name) ? await notebookToPdf(file.name, text, opts, report) : await codeToPdf(file.name, text, opts, report);
        return { bytes: r.bytes, pages: r.pages, notes: describeUnsupported(r.unsupported) };
      });
      setResult(out);
    } catch (e) {
      setError(friendlyError(e, "Could not convert this file. For notebooks, make sure it is a valid .ipynb."));
    }
  };

  if (state.running) return <ProcessingPanel state={state} />;

  if (result && file) {
    return (
      <ResultCard
        title="Your PDF is ready"
        subtitle="Converted in your browser. Your code was not uploaded."
        stats={[{ label: "Pages", value: String(result.pages) }, { label: "Size", value: formatBytes(result.bytes.byteLength) }]}
        downloadLabel="Download PDF"
        onDownload={() => downloadBlob(toBlob(result.bytes, "application/pdf"), `${baseName(file.name)}.pdf`)}
        onReset={reset}
        resetLabel="Convert another"
      >
        <Notes items={result.notes} />
      </ResultCard>
    );
  }

  if (!file) {
    return (
      <div className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <DropZone
          accept=".py,.ipynb,.txt,.js,.ts,.tsx,.jsx,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.sql,.sh,.json,.html,.css,.md,.r,.swift,.kt"
          acceptLabel="Python, notebook or code files"
          onFiles={(f) => {
            setError(null);
            setFile(f[0]);
          }}
          icon={FileCode2}
          title={preferNotebook ? "Drop a Jupyter notebook (.ipynb)" : "Drop a Python file or notebook"}
          subtitle="Colour syntax highlighting, line numbers and notebook outputs, all offline in your browser."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionLabel>Your file</SectionLabel>
          <PlainFileHeader icon={FileCode2} name={file.name} size={file.size} extra={isNb ? "Jupyter notebook" : "Source code"} onChange={reset} />
        </Card>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <SectionLabel>Options</SectionLabel>
            <div className="space-y-3">
              <div role="radiogroup" aria-label="Page size" className="grid grid-cols-2 gap-3">
                <Choice selected={opts.page === "a4"} onSelect={() => set("page", "a4")} title="A4" />
                <Choice selected={opts.page === "letter"} onSelect={() => set("page", "letter")} title="Letter" />
              </div>
              <div>
                <label htmlFor="code-font" className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Font size: {opts.fontSize} pt</label>
                <input id="code-font" type="range" min={7} max={14} step={0.5} value={opts.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))} className="w-full accent-orange-600 dark:accent-orange-400" />
              </div>
              <Toggle checked={opts.lineNumbers} onChange={(v) => set("lineNumbers", v)} title="Line numbers" />
              {isNb && (
                <>
                  <Toggle checked={opts.showCode} onChange={(v) => set("showCode", v)} title="Include code cells" />
                  <Toggle checked={opts.showOutputs} onChange={(v) => set("showOutputs", v)} title="Include outputs and charts" />
                </>
              )}
            </div>
            <button type="button" onClick={convert} className={cx(btnPrimary, "mt-5 w-full")}>
              <FileCode2 className="h-5 w-5" aria-hidden />
              Convert to PDF
            </button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
