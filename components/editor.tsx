"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  Bold,
  Check,
  Copy,
  Eraser,
  Highlighter,
  ImagePlus,
  Italic,
  Loader2,
  MousePointer2,
  Pencil,
  PencilLine,
  Redo2,
  ScanText,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  baseName,
  canvasToBlob,
  closePdf,
  downloadBlob,
  drawPage,
  formatBytes,
  friendlyError,
  imagesToPdf,
  inspectPdf,
  openPdf,
  releaseCanvas,
  renderPageToCanvas,
  toBlob,
} from "@/lib/pdf";
import {
  buildEditedPdf,
  cssFontFamily,
  extractPdfTextBoxes,
  flattenPages,
  isStdFamily,
  ocrLinesToBoxes,
  readFontMetrics,
  sampleColors,
  textObjFromBox,
  unsupportedChars,
  LINE_HEIGHT,
  type CustomFont,
  type DrawObj,
  type EditObj,
  type ImageObj,
  type RectObj,
  type TextBox,
  type TextObj,
} from "@/lib/editor";
import { OCR_LANGS, recognizeCanvas, terminateOcr, type OcrLang } from "@/lib/ocr";
import { Card, DropZone, ErrorBanner, ProcessingPanel, ResultCard, btnPrimary, btnSecondary, cx, inputClass, useProcessor } from "@/components/ui";

/* ------------------------------------------------------------------ types */

type Tool = "select" | "edit" | "text" | "whiteout" | "highlight" | "box" | "draw" | "image";

export type EditorSession = {
  name: string;
  bytes: Uint8Array;
  objects: EditObj[];
  customs: CustomFont[];
  /** Set when the source was an image: the original pixel width, used to export a PNG at the same size. */
  imageWidth?: number;
};

type Defaults = { font: string; size: number; bold: boolean; italic: boolean; color: string; highlight: string; box: string; drawColor: string; drawWidth: number };

type Draft =
  | { kind: "rect"; variant: RectObj["variant"]; page: number; x0: number; y0: number; x1: number; y1: number }
  | { kind: "draw"; page: number; points: number[] };

type DragState = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  moved: boolean;
  wasSelected: boolean;
  lastDx: number;
  lastDy: number;
};

const TOOLS: { id: Tool; label: string; icon: typeof Type; hint: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, hint: "Click an item to select it. Drag to move. Double-click text to edit it." },
  { id: "edit", label: "Edit text", icon: PencilLine, hint: "Click any text on the page to change it. For scanned pages or text inside images, use Scan text below." },
  { id: "text", label: "Add text", icon: Type, hint: "Click anywhere on the page and start typing." },
  { id: "whiteout", label: "Whiteout", icon: Eraser, hint: "Drag over anything you want to hide. The colour matches the page automatically." },
  { id: "highlight", label: "Highlight", icon: Highlighter, hint: "Drag over text to highlight it." },
  { id: "box", label: "Box", icon: Square, hint: "Drag to draw a filled rectangle. Change its colour on the right." },
  { id: "draw", label: "Draw", icon: Pencil, hint: "Draw or sign with your mouse, finger or pen." },
  { id: "image", label: "Image", icon: ImagePlus, hint: "Choose an image (logo, stamp, signature) to place on the page." },
];

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;

let idCounter = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${++idCounter}`;

/* ---------------------------------------------------------------- helpers */

function textBlockStyle(o: Pick<TextObj, "fontSize" | "font" | "bold" | "italic" | "color">): CSSProperties {
  return {
    fontSize: o.fontSize,
    fontFamily: cssFontFamily(o.font),
    fontWeight: o.bold ? 700 : 400,
    fontStyle: o.italic ? "italic" : "normal",
    color: o.color,
    lineHeight: LINE_HEIGHT,
    whiteSpace: "pre",
    fontKerning: "none",
    fontVariantLigatures: "none",
    letterSpacing: 0,
  };
}

async function normalizeImage(file: File): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg"; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  const alpha = /image\/(png|webp|gif)/.test(file.type);
  if (!alpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await canvasToBlob(canvas, alpha ? "image/png" : "image/jpeg", 0.92);
  const w = canvas.width;
  const h = canvas.height;
  releaseCanvas(canvas);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: alpha ? "image/png" : "image/jpeg", w, h };
}

function rectOf(d: Extract<Draft, { kind: "rect" }>) {
  return { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
}

function overlapRatio(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (x * y) / Math.max(1, a.w * a.h);
}

/* =================================================================== PAGE */

type PageViewProps = {
  index: number;
  size: { w: number; h: number };
  zoom: number;
  pdf: PDFDocumentProxy | null;
  scrollEl: HTMLElement | null;
  registerEl: (index: number, el: HTMLDivElement | null) => void;
  registerCanvas: (index: number, info: { canvas: HTMLCanvasElement; pxPerPt: number } | null) => void;
  onVisible: (index: number) => void;
  overlayHandlers: {
    onPointerDown: (e: RPointerEvent<Element>) => void;
    onPointerMove: (e: RPointerEvent<Element>) => void;
    onPointerUp: (e: RPointerEvent<Element>) => void;
  };
  drawing: boolean;
  children: ReactNode;
};

function PageView({ index, size, zoom, pdf, scrollEl, registerEl, registerCanvas, onVisible, overlayHandlers, drawing, children }: PageViewProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(index < 2);

  useEffect(() => {
    registerEl(index, outerRef.current);
    return () => registerEl(index, null);
  }, [index, registerEl]);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || !scrollEl) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root: scrollEl, rootMargin: "1500px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [scrollEl]);

  useEffect(() => {
    if (visible) onVisible(index);
  }, [visible, index, onVisible]);

  // Draw the page into a canvas whenever it scrolls into range or the zoom changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!visible || !pdf) {
      host.replaceChildren();
      registerCanvas(index, null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(index + 1);
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(zoom * dpr, 4096 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.style.cssText = "width:100%;height:100%;display:block";
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await drawPage(page, canvas, ctx, viewport);
        if (cancelled) {
          releaseCanvas(canvas);
          return;
        }
        host.replaceChildren(canvas);
        registerCanvas(index, { canvas, pxPerPt: canvas.width / base.width });
      } catch {
        /* a failed render leaves the previous bitmap in place */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, zoom, pdf, index, registerCanvas]);

  return (
    <div
      ref={outerRef}
      data-page={index}
      className="relative mx-auto shrink-0 bg-white shadow-xl ring-1 ring-black/10"
      style={{ width: size.w * zoom, height: size.h * zoom }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {!visible && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Page {index + 1}</div>
      )}
      <div
        data-overlay
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: drawing ? "none" : "pan-y pinch-zoom" }}
        {...overlayHandlers}
      >
        <div style={{ width: size.w, height: size.h, transform: `scale(${zoom})`, transformOrigin: "0 0", position: "relative" }}>{children}</div>
      </div>
    </div>
  );
}

/* ================================================================ EDITOR */

type EditorProps = {
  session: EditorSession;
  onCancel: () => void;
  onDone: (objects: EditObj[], customs: CustomFont[], opts: { flatten: boolean }) => void;
};

export function Editor({ session, onCancel, onDone }: EditorProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("select");
  const [objects, setObjects] = useState<EditObj[]>(session.objects);
  const [customs, setCustoms] = useState<CustomFont[]>(session.customs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [boxes, setBoxes] = useState<Record<number, TextBox[]>>({});
  const [pdfTextCount, setPdfTextCount] = useState<Record<number, number>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [ocrLang, setOcrLang] = useState<OcrLang>("eng");
  const [ocr, setOcr] = useState<{ page: number; progress: number; label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [defaults, setDefaults] = useState<Defaults>({
    font: "helvetica",
    size: 14,
    bold: false,
    italic: false,
    color: "#000000",
    highlight: "#ffe600",
    box: "#4f46e5",
    drawColor: "#1d4ed8",
    drawWidth: 2,
  });

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollRefCurrent = useRef<HTMLDivElement | null>(null);
  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    scrollRefCurrent.current = el;
    setScrollEl(el);
  }, []);
  const objectsRef = useRef(objects);
  const undoRef = useRef<EditObj[][]>([]);
  const redoRef = useRef<EditObj[][]>([]);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const canvases = useRef(new Map<number, { canvas: HTMLCanvasElement; pxPerPt: number }>());
  const loadingBoxes = useRef(new Set<number>());
  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraftBoth = useCallback((d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  }, []);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const registeredFonts = useRef(new Set<string>());

  /* ---- loading the document ---- */
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    (async () => {
      try {
        doc = await openPdf(session.bytes);
        if (cancelled) {
          closePdf(doc);
          return;
        }
        pdfRef.current = doc;
        setPdf(doc);
        const first = await doc.getPage(1);
        const v = first.getViewport({ scale: 1 });
        const all = new Array(doc.numPages).fill(null).map(() => ({ w: v.width, h: v.height }));
        setSizes(all);
        const fit = Math.min(1.6, Math.max(ZOOM_MIN, ((scrollRefCurrent.current?.clientWidth || window.innerWidth) - 48) / v.width));
        setZoom(Math.round(fit * 100) / 100);
        // Remaining page sizes arrive in the background so large books open immediately.
        for (let i = 1; i < doc.numPages && !cancelled; i += 20) {
          const batch: { i: number; w: number; h: number }[] = [];
          for (let j = i; j < Math.min(i + 20, doc.numPages); j++) {
            const p = await doc.getPage(j + 1);
            const vp = p.getViewport({ scale: 1 });
            batch.push({ i: j, w: vp.width, h: vp.height });
          }
          if (cancelled) break;
          setSizes((prev) => {
            const next = prev.slice();
            batch.forEach((b) => (next[b.i] = { w: b.w, h: b.h }));
            return next;
          });
        }
      } catch (e) {
        if (!cancelled) setLoadError(friendlyError(e, "Couldn't open this PDF for editing."));
      }
    })();
    return () => {
      cancelled = true;
      if (doc) closePdf(doc);
      void terminateOcr();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.bytes]);


  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Make uploaded fonts available to the on-screen preview.
  useEffect(() => {
    customs.forEach((c) => {
      if (registeredFonts.current.has(c.id)) return;
      registeredFonts.current.add(c.id);
      const face = new FontFace(`pf-${c.id}`, c.bytes.slice().buffer as ArrayBuffer);
      face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
    });
  }, [customs]);

  /* ---- history ---- */
  const setObjs = useCallback((next: EditObj[]) => {
    objectsRef.current = next;
    setObjects(next);
  }, []);

  const snapshot = useCallback(() => {
    undoRef.current.push(objectsRef.current);
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
    setHist({ undo: undoRef.current.length, redo: 0 });
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(objectsRef.current);
    setObjs(prev);
    setEditingId(null);
    setHist({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, [setObjs]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(objectsRef.current);
    setObjs(next);
    setEditingId(null);
    setHist({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, [setObjs]);

  const update = useCallback(
    (id: string, patch: Partial<TextObj> | Partial<RectObj> | Partial<ImageObj> | Partial<DrawObj>) => {
      setObjs(objectsRef.current.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObj) : o)));
    },
    [setObjs],
  );

  const add = useCallback(
    (obj: EditObj) => {
      snapshot();
      setObjs([...objectsRef.current, obj]);
    },
    [setObjs, snapshot],
  );

  const remove = useCallback(
    (id: string) => {
      snapshot();
      setObjs(objectsRef.current.filter((o) => o.id !== id));
      setSelectedId((s) => (s === id ? null : s));
      setEditingId((s) => (s === id ? null : s));
    },
    [setObjs, snapshot],
  );

  const selected = useMemo(() => objects.find((o) => o.id === selectedId) ?? null, [objects, selectedId]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = Boolean(editingId) || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        if (exportOpen) setExportOpen(false);
        else {
          setEditingId(null);
          setSelectedId(null);
          setDraftBoth(null);
          setTool("select");
        }
      } else if (!typing && selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        remove(selectedId);
      } else if (!typing && selectedId && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const o = objectsRef.current.find((x) => x.id === selectedId);
        if (!o || o.kind === "draw") return;
        const step = e.shiftKey ? 10 : 1;
        snapshot();
        update(o.id, {
          x: o.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0),
          y: o.y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0),
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, exportOpen, redo, undo, remove, selectedId, snapshot, update]);

  /* ---- page registry and scrolling ---- */
  const registerEl = useCallback((i: number, el: HTMLDivElement | null) => {
    pageEls.current[i] = el;
  }, []);
  const registerCanvas = useCallback((i: number, info: { canvas: HTMLCanvasElement; pxPerPt: number } | null) => {
    if (info) canvases.current.set(i, info);
    else canvases.current.delete(i);
  }, []);

  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = el.getBoundingClientRect().top + el.clientHeight * 0.4;
        let best = 0;
        for (let i = 0; i < pageEls.current.length; i++) {
          const p = pageEls.current[i];
          if (!p) continue;
          if (p.getBoundingClientRect().top <= mid) best = i;
          else break;
        }
        setCurrentPage(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollEl]);

  const goToPage = (n: number) => {
    const i = Math.min(Math.max(n, 1), sizes.length) - 1;
    pageEls.current[i]?.scrollIntoView({ block: "start" });
    setCurrentPage(i);
  };

  const fitWidth = () => {
    const w = scrollEl?.clientWidth ?? 800;
    const pw = sizes[currentPage]?.w ?? sizes[0]?.w ?? 600;
    setZoom(Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (w - 48) / pw)) * 100) / 100);
  };

  /* ---- detected text ---- */
  const ensureBoxes = useCallback(async (i: number) => {
    const doc = pdfRef.current;
    if (!doc || loadingBoxes.current.has(i)) return;
    loadingBoxes.current.add(i);
    try {
      const found = await extractPdfTextBoxes(doc, i);
      setPdfTextCount((p) => ({ ...p, [i]: found.length }));
      setBoxes((prev) => ({ ...prev, [i]: [...found, ...(prev[i] ?? []).filter((b) => b.source === "ocr")] }));
    } catch {
      setPdfTextCount((p) => ({ ...p, [i]: 0 }));
    }
  }, []);

  const runOcr = async (pageIndex: number) => {
    const doc = pdfRef.current;
    if (!doc || ocr) return;
    setNotice(null);
    setOcr({ page: pageIndex, progress: 0, label: "Preparing page…" });
    try {
      const { canvas, pointsWidth, pointsHeight } = await renderPageToCanvas(doc, pageIndex + 1, 3, 4200);
      const lines = await recognizeCanvas(canvas, ocrLang, (progress, label) => setOcr({ page: pageIndex, progress, label }));
      const kx = pointsWidth / canvas.width;
      const ky = pointsHeight / canvas.height;
      releaseCanvas(canvas);
      const found = ocrLinesToBoxes(lines, kx, ky, pageIndex);
      setBoxes((prev) => {
        const pdfBoxes = (prev[pageIndex] ?? []).filter((b) => b.source === "pdf");
        const fresh = found.filter((o) => !pdfBoxes.some((p) => overlapRatio(o, p) > 0.4));
        return { ...prev, [pageIndex]: [...pdfBoxes, ...fresh] };
      });
      setNotice(found.length ? `Found ${found.length} line${found.length === 1 ? "" : "s"} of text on page ${pageIndex + 1}. Click one to edit it.` : "No text was found on this page. Try another language, or use Whiteout and Add text.");
    } catch (e) {
      setNotice(friendlyError(e, "Text recognition failed. Check your connection (the first run downloads the language data) and try again."));
    } finally {
      setOcr(null);
    }
  };

  /* ---- creating and editing objects ---- */
  const beginEditBox = (box: TextBox, pageIndex: number) => {
    const info = canvases.current.get(pageIndex);
    const obj = textObjFromBox(box, pageIndex, newId("t"), info?.canvas ?? null, info?.pxPerPt ?? 1);
    add(obj);
    setSelectedId(obj.id);
    setEditingId(obj.id);
    setPanelOpen(true);
  };

  const pointFromEvent = (e: RPointerEvent<Element>, pageIndex: number) => {
    const el = pageEls.current[pageIndex];
    const r = el?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };

  const overlayHandlers = (pageIndex: number) => ({
    onPointerDown: (e: RPointerEvent<Element>) => {
      if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.bg) return;
      const p = pointFromEvent(e, pageIndex);
      setCurrentPage(pageIndex);
      if (tool === "select" || tool === "edit" || tool === "image") {
        setSelectedId(null);
        setEditingId(null);
        return;
      }
      if (tool === "text") {
        const obj: TextObj = {
          id: newId("t"),
          kind: "text",
          page: pageIndex,
          x: p.x,
          y: p.y - defaults.size * 0.5,
          text: "",
          fontSize: defaults.size,
          font: defaults.font,
          bold: defaults.bold,
          italic: defaults.italic,
          color: defaults.color,
        };
        add(obj);
        setSelectedId(obj.id);
        setPanelOpen(true);
        // The browser moves focus to the clicked element right after pointerdown, which would
        // immediately blur a text field focused now. Start editing on the next tick instead.
        setTimeout(() => setEditingId(obj.id), 0);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      if (tool === "draw") setDraftBoth({ kind: "draw", page: pageIndex, points: [p.x, p.y] });
      else setDraftBoth({ kind: "rect", variant: tool === "box" ? "box" : tool, page: pageIndex, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    },
    onPointerMove: (e: RPointerEvent<Element>) => {
      const draft = draftRef.current;
      if (!draft || draft.page !== pageIndex) return;
      const p = pointFromEvent(e, pageIndex);
      if (draft.kind === "rect") setDraftBoth({ ...draft, x1: p.x, y1: p.y });
      else {
        const n = draft.points.length;
        if (Math.hypot(p.x - draft.points[n - 2], p.y - draft.points[n - 1]) > 0.8 / Math.max(zoom, 0.5)) setDraftBoth({ ...draft, points: [...draft.points, p.x, p.y] });
      }
    },
    onPointerUp: () => {
      const draft = draftRef.current;
      if (!draft || draft.page !== pageIndex) return;
      if (draft.kind === "draw") {
        add({ id: newId("d"), kind: "draw", page: pageIndex, points: draft.points, color: defaults.drawColor, width: defaults.drawWidth });
      } else {
        const r = rectOf(draft);
        if (r.w >= 3 && r.h >= 3) {
          let fill = defaults.box;
          let opacity = 1;
          if (draft.variant === "highlight") {
            fill = defaults.highlight;
            opacity = 0.4;
          } else if (draft.variant === "whiteout") {
            const info = canvases.current.get(pageIndex);
            fill = info ? sampleColors(info.canvas, { x: r.x * info.pxPerPt, y: r.y * info.pxPerPt, w: r.w * info.pxPerPt, h: r.h * info.pxPerPt }).bg : "#ffffff";
          }
          const obj: RectObj = { id: newId("r"), kind: "rect", variant: draft.variant, page: pageIndex, ...r, fill, opacity };
          add(obj);
          setSelectedId(obj.id);
          setPanelOpen(true);
        }
      }
      setDraftBoth(null);
    },
  });

  const placeImage = async (file: File) => {
    try {
      const img = await normalizeImage(file);
      const pg = currentPage;
      const size = sizes[pg] ?? { w: 612, h: 792 };
      const w = Math.min(160, size.w * 0.4);
      const h = (w * img.h) / img.w;
      const url = URL.createObjectURL(new Blob([img.bytes.slice().buffer as ArrayBuffer], { type: img.mime }));
      const obj: ImageObj = { id: newId("i"), kind: "image", page: pg, x: (size.w - w) / 2, y: (size.h - h) / 2, w, h, bytes: img.bytes, mime: img.mime, url };
      add(obj);
      setSelectedId(obj.id);
      setTool("select");
      setPanelOpen(true);
    } catch {
      setNotice("That image couldn't be read. Try a PNG or JPG.");
    }
  };

  const uploadFont = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const m = readFontMetrics(bytes);
    if (!m) {
      setNotice("That font file couldn't be read. Use a .ttf or .otf file.");
      return;
    }
    const ext = file.name.toLowerCase().endsWith(".otf") ? "otf" : "ttf";
    const font: CustomFont = { id: newId("font"), name: baseName(file.name), ext, bytes, ascent: m.ascent, descent: m.descent };
    setCustoms((c) => [...c, font]);
    if (selected?.kind === "text") update(selected.id, { font: font.id });
    else setDefaults((d) => ({ ...d, font: font.id }));
  };

  /* ---- object dragging ---- */
  const startDrag = (e: RPointerEvent<Element>, o: EditObj, mode: "move" | "resize") => {
    if (o.kind === "draw" && mode === "resize") return;
    e.stopPropagation();
    if (editingId === o.id) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const isBox = o.kind === "rect" || o.kind === "image";
    dragRef.current = {
      id: o.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: o.kind === "draw" ? 0 : o.x,
      origY: o.kind === "draw" ? 0 : o.y,
      origW: isBox ? o.w : 0,
      origH: isBox ? o.h : 0,
      moved: false,
      wasSelected: selectedId === o.id,
      lastDx: 0,
      lastDy: 0,
    };
    setSelectedId(o.id);
    setPanelOpen(true);
  };

  const moveDrag = (e: RPointerEvent<Element>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    if (!d.moved) {
      if (Math.hypot(dx, dy) * zoom < 3) return;
      d.moved = true;
      snapshot();
    }
    const o = objectsRef.current.find((x) => x.id === d.id);
    if (!o) return;
    if (d.mode === "resize" && (o.kind === "rect" || o.kind === "image")) {
      if (o.kind === "image") {
        const w = Math.max(10, d.origW + dx);
        update(o.id, { w, h: (w * d.origH) / d.origW });
      } else update(o.id, { w: Math.max(4, d.origW + dx), h: Math.max(4, d.origH + dy) });
    } else if (o.kind === "draw") {
      // Moving a drawing shifts every point by the movement since the previous event.
      const ddx = dx - d.lastDx;
      const ddy = dy - d.lastDy;
      d.lastDx = dx;
      d.lastDy = dy;
      update(o.id, { points: o.points.map((v, i) => v + (i % 2 === 0 ? ddx : ddy)) });
    } else {
      update(o.id, { x: d.origX + dx, y: d.origY + dy });
    }
  };

  const endDrag = (o: EditObj) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    if (o.kind === "text" && (tool === "edit" || d.wasSelected)) {
      setEditingId(o.id);
    }
  };

  /* ---- rendering of one page's overlay ---- */
  const renderOverlay = (pageIndex: number) => {
    const pageObjs = objects.filter((o) => o.page === pageIndex);
    const interactive = tool === "select" || tool === "edit";
    const used = new Set(objects.filter((o): o is TextObj => o.kind === "text" && Boolean(o.fromBox)).map((o) => o.fromBox as string));
    return (
      <>
        {/* background hit layer so clicks on empty page reach the overlay handlers */}
        <div data-bg="1" style={{ position: "absolute", inset: 0 }} />

        {tool === "edit" &&
          (boxes[pageIndex] ?? [])
            .filter((b) => !used.has(b.id))
            .map((b) => (
              <button
                key={b.id}
                type="button"
                tabIndex={-1}
                aria-label={`Edit text: ${b.text}`}
                title={b.text}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => beginEditBox(b, pageIndex)}
                className={cx(
                  "absolute cursor-text rounded-[2px] border transition-colors",
                  b.source === "ocr" ? "border-zinc-500/50 bg-zinc-500/10 hover:bg-zinc-500/30" : "border-zinc-500/40 bg-zinc-500/10 hover:bg-zinc-500/30",
                )}
                style={{ left: b.x - 1, top: b.y - 1, width: b.w + 2, height: b.h + 2 }}
              />
            ))}

        {/* cover rectangles first, so they sit under every text */}
        {pageObjs.map((o) =>
          o.kind === "text" && o.cover ? (
            <div key={`c-${o.id}`} style={{ position: "absolute", left: o.cover.x, top: o.cover.y, width: o.cover.w, height: o.cover.h, background: o.cover.color, pointerEvents: "none" }} />
          ) : null,
        )}

        {pageObjs.map((o) => {
          const isSel = selectedId === o.id;
          const common = {
            onPointerMove: moveDrag,
            onPointerUp: () => endDrag(o),
          };
          const ring = isSel ? "outline outline-2 outline-offset-1 outline-orange-600" : interactive ? "hover:outline hover:outline-1 hover:outline-orange-600" : "";
          const pe = interactive ? "auto" : "none";

          if (o.kind === "rect") {
            return (
              <div
                key={o.id}
                className={cx("absolute", ring)}
                style={{ left: o.x, top: o.y, width: o.w, height: o.h, background: o.fill, opacity: o.opacity, pointerEvents: pe, cursor: interactive ? "move" : "default", touchAction: isSel ? "none" : undefined }}
                onPointerDown={(e) => startDrag(e, o, "move")}
                {...common}
              >
                {isSel && <ResizeHandle onPointerDown={(e) => startDrag(e, o, "resize")} {...common} zoom={zoom} />}
              </div>
            );
          }
          if (o.kind === "image") {
            return (
              <div
                key={o.id}
                className={cx("absolute", ring)}
                style={{ left: o.x, top: o.y, width: o.w, height: o.h, pointerEvents: pe, cursor: interactive ? "move" : "default", touchAction: isSel ? "none" : undefined }}
                onPointerDown={(e) => startDrag(e, o, "move")}
                {...common}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.url} alt="" draggable={false} className="h-full w-full select-none" />
                {isSel && <ResizeHandle onPointerDown={(e) => startDrag(e, o, "resize")} {...common} zoom={zoom} />}
              </div>
            );
          }
          if (o.kind === "draw") {
            const xs = o.points.filter((_, i) => i % 2 === 0);
            const ys = o.points.filter((_, i) => i % 2 === 1);
            const pad = o.width + 4;
            const minX = Math.min(...xs) - pad;
            const minY = Math.min(...ys) - pad;
            const w = Math.max(...xs) - minX + pad;
            const h = Math.max(...ys) - minY + pad;
            const d = o.points.map((v, i) => (i % 2 === 0 ? `${i === 0 ? "M" : "L"}${v - minX},` : `${v - minY} `)).join("");
            return (
              <svg
                key={o.id}
                className={cx("absolute overflow-visible", ring)}
                style={{ left: minX, top: minY, width: w, height: h, pointerEvents: pe, cursor: interactive ? "move" : "default", touchAction: isSel ? "none" : undefined }}
                onPointerDown={(e) => startDrag(e, o, "move")}
                {...common}
              >
                <path d={d.trim()} fill="none" stroke={o.color} strokeWidth={o.width} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
                {o.points.length === 2 && <circle cx={o.points[0] - minX} cy={o.points[1] - minY} r={o.width / 2} fill={o.color} />}
              </svg>
            );
          }
          return (
            <TextView
              key={o.id}
              obj={o}
              selected={isSel}
              editing={editingId === o.id}
              interactive={interactive}
              ring={ring}
              pointerEvents={pe}
              onPointerDown={(e) => startDrag(e, o, "move")}
              onDoubleClick={() => interactive && setEditingId(o.id)}
              onLiveText={(text) => update(o.id, { text })}
              onFinish={(text) => {
                setEditingId(null);
                if (!text.trim() && !o.cover) {
                  setObjs(objectsRef.current.filter((x) => x.id !== o.id));
                  setSelectedId(null);
                } else if (text !== o.text) update(o.id, { text });
              }}
              {...common}
            />
          );
        })}

        {draft && draft.page === pageIndex && draft.kind === "rect" && (() => {
          const r = rectOf(draft);
          const fill = draft.variant === "highlight" ? defaults.highlight : draft.variant === "whiteout" ? "#ffffff" : defaults.box;
          return <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, background: fill, opacity: draft.variant === "highlight" ? 0.4 : 0.85, outline: "1px dashed #18181b", pointerEvents: "none" }} />;
        })()}
        {draft && draft.page === pageIndex && draft.kind === "draw" && (
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
            <path d={draft.points.map((v, i) => (i % 2 === 0 ? `${i === 0 ? "M" : "L"}${v},` : `${v} `)).join("").trim()} fill="none" stroke={defaults.drawColor} strokeWidth={defaults.drawWidth} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </>
    );
  };

  /* ---- export ---- */
  const coverPages = useMemo(() => {
    const s = new Set<number>();
    objects.forEach((o) => {
      if ((o.kind === "text" && o.cover) || (o.kind === "rect" && o.variant === "whiteout")) s.add(o.page);
    });
    return Array.from(s);
  }, [objects]);

  const badChars = useMemo(() => {
    const bad = new Set<string>();
    objects.forEach((o) => {
      if (o.kind === "text" && isStdFamily(o.font)) unsupportedChars(o.text).forEach((c) => bad.add(c));
    });
    return Array.from(bad);
  }, [objects]);

  const [flatten, setFlatten] = useState(true);
  useEffect(() => {
    if (exportOpen) setFlatten(coverPages.length > 0);
  }, [exportOpen, coverPages.length]);

  const tipText = TOOLS.find((t) => t.id === tool)?.hint ?? "";
  const noPdfText = pdfTextCount[currentPage] === 0;
  const hasEdits = objects.length > 0;
  const rtl = objects.some((o) => o.kind === "text" && /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(o.text));

  const panel = (
    <PropertiesPanel
      selected={selected}
      defaults={defaults}
      setDefaults={setDefaults}
      customs={customs}
      onUpdate={(patch) => {
        if (!selected) return;
        snapshot();
        update(selected.id, patch);
      }}
      onDelete={() => selected && remove(selected.id)}
      onDuplicate={() => {
        if (!selected) return;
        const copy = { ...selected, id: newId("x") } as EditObj;
        if (copy.kind === "draw") copy.points = copy.points.map((v) => v + 12);
        else {
          copy.x += 12;
          copy.y += 12;
          if (copy.kind === "text") {
            delete copy.fromBox;
            delete copy.cover;
          }
        }
        add(copy);
        setSelectedId(copy.id);
      }}
      onUploadFont={() => fontInputRef.current?.click()}
    />
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-100 text-zinc-900 dark:bg-[#14110f] dark:text-zinc-100" role="dialog" aria-label="PDF editor">
      {/* top bar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white/90 px-2 backdrop-blur sm:px-4 dark:border-white/10 dark:bg-zinc-950/80">
        <button type="button" onClick={() => (hasEdits ? window.confirm("Discard all your edits and close the editor?") && onCancel() : onCancel())} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10" aria-label="Close editor">
          <X className="h-4 w-4" /> <span className="hidden sm:inline">Close</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={session.name}>{session.name}</p>
        <div className="flex items-center gap-1">
          <BarButton label="Undo (Ctrl+Z)" onClick={undo} disabled={hist.undo === 0}><Undo2 className="h-4 w-4" /></BarButton>
          <BarButton label="Redo (Ctrl+Y)" onClick={redo} disabled={hist.redo === 0}><Redo2 className="h-4 w-4" /></BarButton>
          <span className="mx-1 hidden h-6 w-px bg-zinc-200 sm:block dark:bg-white/10" />
          <BarButton label="Zoom out" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - 0.1) * 100) / 100))}><ZoomOut className="h-4 w-4" /></BarButton>
          <button type="button" onClick={fitWidth} title="Fit to width" className="hidden h-10 min-w-[3.5rem] rounded-xl px-2 text-sm font-semibold tabular-nums hover:bg-zinc-100 sm:block dark:hover:bg-white/10">{Math.round(zoom * 100)}%</button>
          <BarButton label="Zoom in" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + 0.1) * 100) / 100))}><ZoomIn className="h-4 w-4" /></BarButton>
        </div>
        <label className="hidden items-center gap-1 text-sm text-zinc-600 md:flex dark:text-zinc-300">
          Page
          <input
            key={currentPage}
            defaultValue={currentPage + 1}
            inputMode="numeric"
            aria-label="Go to page"
            onKeyDown={(e) => e.key === "Enter" && goToPage(Number((e.target as HTMLInputElement).value) || 1)}
            onBlur={(e) => goToPage(Number(e.target.value) || 1)}
            className="h-9 w-14 rounded-lg border border-zinc-200 bg-white px-2 text-center text-sm dark:border-white/10 dark:bg-white/5"
          />
          / {sizes.length || "…"}
        </label>
        <button type="button" onClick={() => setPanelOpen((o) => !o)} className="h-10 rounded-xl border border-zinc-200 px-3 text-sm font-semibold lg:hidden dark:border-white/10">Properties</button>
        <button type="button" onClick={() => setExportOpen(true)} className={cx(btnPrimary, "!rounded-xl !px-4 !py-2 !text-sm")}>
          <Check className="h-4 w-4" /> Done
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* tool rail (desktop) */}
        <nav aria-label="Editing tools" className="hidden w-[76px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-zinc-200 bg-white/70 py-3 lg:flex dark:border-white/10 dark:bg-zinc-950/50">
          {TOOLS.map((t) => (
            <ToolButton key={t.id} t={t} active={tool === t.id} onClick={() => (t.id === "image" ? imageInputRef.current?.click() : setTool(t.id))} />
          ))}
        </nav>

        {/* canvas area */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* Fixed-height hint bar: its height must not change between tools, or the page would jump. */}
          <div className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-zinc-200 bg-white/60 px-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-300">
            <p className="min-w-0 flex-1 truncate" title={tipText}>{tipText}</p>
            {tool === "edit" && (
              <div className="flex shrink-0 items-center gap-2">
                <label className="sr-only" htmlFor="ocr-lang">OCR language</label>
                <select id="ocr-lang" value={ocrLang} onChange={(e) => setOcrLang(e.target.value as OcrLang)} disabled={Boolean(ocr)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-zinc-900">
                  {OCR_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
                <button type="button" onClick={() => runOcr(currentPage)} disabled={Boolean(ocr)} className={cx("inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition disabled:opacity-60", noPdfText ? "accent3d text-white shadow hover:bg-zinc-700 dark:hover:bg-zinc-200" : "border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5")}>
                  {ocr ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                  {ocr ? `${ocr.label} ${Math.round(ocr.progress * 100)}%` : `Scan text on page ${currentPage + 1}`}
                </button>
              </div>
            )}
          </div>
          {((tool === "edit" && noPdfText && !ocr) || notice) && (
            <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex flex-col items-center gap-2 px-3">
              {tool === "edit" && noPdfText && !ocr && (
                <p className="pointer-events-auto max-w-xl rounded-xl accent3d px-4 py-2 text-center text-xs font-medium text-white shadow-lg">
                  This page has no selectable text (it looks scanned). Press &quot;Scan text&quot; above to make it editable.
                </p>
              )}
              {notice && (
                <p role="status" className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-zinc-900">
                  <span className="flex-1">{notice}</span>
                  <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="-mr-1 rounded p-0.5 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                </p>
              )}
            </div>
          )}

          <div
            ref={setScrollRef}
            className="min-h-0 flex-1 overflow-auto px-3 py-6"
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
          >
            {loadError ? (
              <div className="mx-auto max-w-lg"><ErrorBanner message={loadError} /></div>
            ) : !pdf ? (
              <div className="flex h-full items-center justify-center gap-3 text-zinc-500"><Loader2 className="h-6 w-6 animate-spin" /> Opening your PDF…</div>
            ) : (
              <div className="flex flex-col items-center gap-6" style={{ width: "max-content", minWidth: "100%" }}>
                {sizes.map((size, i) => (
                  <PageView
                    key={i}
                    index={i}
                    size={size}
                    zoom={zoom}
                    pdf={pdf}
                    scrollEl={scrollEl}
                    registerEl={registerEl}
                    registerCanvas={registerCanvas}
                    onVisible={ensureBoxes}
                    overlayHandlers={overlayHandlers(i)}
                    drawing={tool === "draw" || tool === "whiteout" || tool === "highlight" || tool === "box"}
                  >
                    {renderOverlay(i)}
                  </PageView>
                ))}
              </div>
            )}
          </div>

          {/* tool bar (mobile) */}
          <nav aria-label="Editing tools" className="flex shrink-0 gap-1 overflow-x-auto border-t border-zinc-200 bg-white/90 px-2 py-1.5 lg:hidden dark:border-white/10 dark:bg-zinc-950/80">
            {TOOLS.map((t) => (
              <ToolButton key={t.id} t={t} active={tool === t.id} compact onClick={() => (t.id === "image" ? imageInputRef.current?.click() : setTool(t.id))} />
            ))}
          </nav>
        </div>

        {/* properties */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white/70 p-4 lg:block dark:border-white/10 dark:bg-zinc-950/50">{panel}</aside>
      </div>

      {panelOpen && (
        <div className="fixed inset-x-0 bottom-[60px] z-[75] max-h-[48vh] overflow-y-auto rounded-t-3xl border-t border-zinc-200 bg-white p-4 shadow-2xl lg:hidden dark:border-white/10 dark:bg-zinc-900">
          <div className="mb-2 flex justify-end"><button type="button" aria-label="Close properties" onClick={() => setPanelOpen(false)} className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div>
          {panel}
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void placeImage(f); e.target.value = ""; }} />
      <input ref={fontInputRef} type="file" accept=".ttf,.otf" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFont(f); e.target.value = ""; }} />

      {ocr && (
        <div className="fixed bottom-20 left-1/2 z-[80] w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-zinc-900" role="status">
          <p className="text-sm font-semibold">{ocr.label}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"><div className="h-full rounded-full accent3d transition-[width]" style={{ width: `${Math.max(4, Math.round(ocr.progress * 100))}%` }} /></div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">The first scan downloads the language data once (a few MB). Your page stays on this device.</p>
        </div>
      )}

      {exportOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-900/60 p-3 backdrop-blur-sm sm:items-center" onPointerDown={(e) => e.target === e.currentTarget && setExportOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900" role="dialog" aria-label="Finish editing">
            <h2 className="text-xl font-bold">Ready to finish?</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{objects.length === 0 ? "You haven't made any changes yet." : `${objects.length} change${objects.length === 1 ? "" : "s"} will be applied to your PDF.`}</p>

            {coverPages.length > 0 && (
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-4 dark:border-white/10">
                <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} className="mt-1 h-5 w-5 rounded accent-orange-600 dark:accent-orange-400" />
                <span>
                  <span className="block text-sm font-semibold">Permanently remove the old text (recommended)</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Edited text is covered, but the original words can still exist underneath and be copied. This turns {coverPages.length} edited page{coverPages.length === 1 ? "" : "s"} into images so nothing is left hidden. Text on those pages is no longer selectable.
                  </span>
                </span>
              </label>
            )}
            {badChars.length > 0 && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                Some characters ({badChars.slice(0, 8).join(" ")}) aren&apos;t in the standard fonts and will appear as &quot;?&quot;. Upload a .ttf/.otf font that includes them in the properties panel.
              </p>
            )}
            {rtl && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                Right-to-left scripts (Arabic, Urdu, Hebrew) aren&apos;t supported yet. Letters would be drawn disconnected and in the wrong order.
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setExportOpen(false)} className={btnSecondary}>Keep editing</button>
              <button type="button" onClick={() => onDone(objectsRef.current, customs, { flatten: flatten && coverPages.length > 0 })} className={btnPrimary}>Apply &amp; create PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================ small parts */

function BarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-700 transition hover:bg-zinc-100 active:scale-90 disabled:pointer-events-none disabled:opacity-30 dark:text-zinc-200 dark:hover:bg-white/10">
      {children}
    </button>
  );
}

function ToolButton({ t, active, onClick, compact }: { t: (typeof TOOLS)[number]; active: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={t.hint}
      className={cx(
        "flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40",
        compact ? "h-12 w-16" : "h-[60px] w-[60px]",
        active ? "accent3d text-white shadow-lg shadow-orange-900/10" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10",
      )}
    >
      <t.icon className="h-5 w-5" aria-hidden />
      {t.label}
    </button>
  );
}

function ResizeHandle({ onPointerDown, onPointerMove, onPointerUp, zoom }: { onPointerDown: (e: RPointerEvent<Element>) => void; onPointerMove: (e: RPointerEvent<Element>) => void; onPointerUp: () => void; zoom: number }) {
  const s = 12 / zoom;
  return <span role="presentation" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="absolute rounded-sm border-2 border-white accent3d shadow" style={{ width: s, height: s, right: -s / 2, bottom: -s / 2, cursor: "nwse-resize", touchAction: "none" }} />;
}

function TextView({
  obj,
  selected,
  editing,
  interactive,
  ring,
  pointerEvents,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onLiveText,
  onFinish,
}: {
  obj: TextObj;
  selected: boolean;
  editing: boolean;
  interactive: boolean;
  ring: string;
  pointerEvents: "auto" | "none";
  onPointerDown: (e: RPointerEvent<Element>) => void;
  onPointerMove: (e: RPointerEvent<Element>) => void;
  onPointerUp: () => void;
  onDoubleClick: () => void;
  onLiveText: (text: string) => void;
  onFinish: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Put the text into the element once when editing starts. React must not
  // re-render children while the user types, or the caret would jump.
  useEffect(() => {
    const el = ref.current;
    if (!el || !editing) return;
    el.innerText = obj.text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const read = () => (ref.current?.innerText ?? "").replace(/\n$/, "");

  return (
    <div
      ref={ref}
      className={cx("absolute min-h-[1em] min-w-[0.5em] outline-none", editing ? "outline outline-2 outline-offset-1 outline-orange-600" : ring)}
      style={{ left: obj.x, top: obj.y, ...textBlockStyle(obj), pointerEvents, cursor: editing ? "text" : interactive ? "move" : "default", touchAction: selected && !editing ? "none" : undefined, userSelect: editing ? "text" : "none", WebkitUserSelect: editing ? "text" : "none" }}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={false}
      onPointerDown={(e) => (editing ? e.stopPropagation() : onPointerDown(e))}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onInput={() => onLiveText(read())}
      onBlur={() => {
        if (!editing) return;
        const text = read();
        if (ref.current) ref.current.textContent = ""; // drop the nodes the browser created, React re-renders the text
        onFinish(text);
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      onKeyDown={(e) => {
        if (editing && e.key === "Escape") {
          e.stopPropagation();
          ref.current?.blur();
        }
      }}
    >
      {editing ? null : obj.text}
    </div>
  );
}

/* ============================================================ properties */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-3">
      <input type="color" aria-label={label} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-transparent p-1 dark:border-white/10" />
      <span className="font-mono text-xs uppercase text-zinc-500 dark:text-zinc-400">{value}</span>
    </label>
  );
}

function PropertiesPanel({
  selected,
  defaults,
  setDefaults,
  customs,
  onUpdate,
  onDelete,
  onDuplicate,
  onUploadFont,
}: {
  selected: EditObj | null;
  defaults: Defaults;
  setDefaults: (fn: (d: Defaults) => Defaults) => void;
  customs: CustomFont[];
  onUpdate: (patch: Partial<TextObj> & Partial<RectObj> & Partial<DrawObj>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUploadFont: () => void;
}) {
  const fontSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => (e.target.value === "__upload" ? onUploadFont() : onChange(e.target.value))} aria-label="Font" className={cx(inputClass, "!py-2.5 !text-sm")}>
      <option value="helvetica">Helvetica / Arial</option>
      <option value="times">Times New Roman</option>
      <option value="courier">Courier</option>
      {customs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value="__upload">Upload a font (.ttf / .otf)…</option>
    </select>
  );

  const styleToggles = (bold: boolean, italic: boolean, setB: (v: boolean) => void, setI: (v: boolean) => void) => (
    <div className="flex gap-2">
      <button type="button" aria-pressed={bold} onClick={() => setB(!bold)} className={cx("inline-flex h-10 w-10 items-center justify-center rounded-xl border", bold ? "border-orange-600 dark:border-orange-400 bg-zinc-100 text-zinc-900 dark:bg-white/20 dark:text-zinc-200" : "border-zinc-200 dark:border-white/10")} aria-label="Bold"><Bold className="h-4 w-4" /></button>
      <button type="button" aria-pressed={italic} onClick={() => setI(!italic)} className={cx("inline-flex h-10 w-10 items-center justify-center rounded-xl border", italic ? "border-orange-600 dark:border-orange-400 bg-zinc-100 text-zinc-900 dark:bg-white/20 dark:text-zinc-200" : "border-zinc-200 dark:border-white/10")} aria-label="Italic"><Italic className="h-4 w-4" /></button>
    </div>
  );

  const sizeField = (value: number, onChange: (v: number) => void) => (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Smaller text" onClick={() => onChange(Math.max(4, Math.round((value - 0.5) * 10) / 10))} className="h-10 w-10 rounded-xl border border-zinc-200 text-lg font-bold dark:border-white/10">−</button>
      <input type="number" min={4} max={200} step={0.5} value={Math.round(value * 10) / 10} onChange={(e) => onChange(Math.min(200, Math.max(4, Number(e.target.value) || value)))} aria-label="Font size" className={cx(inputClass, "!w-20 !px-2 !py-2 text-center !text-sm")} />
      <button type="button" aria-label="Larger text" onClick={() => onChange(Math.min(200, Math.round((value + 0.5) * 10) / 10))} className="h-10 w-10 rounded-xl border border-zinc-200 text-lg font-bold dark:border-white/10">+</button>
      <span className="text-xs text-zinc-500">pt</span>
    </div>
  );

  if (!selected) {
    return (
      <div className="space-y-5">
        <h3 className="text-sm font-bold">New text style</h3>
        <Field label="Font">{fontSelect(defaults.font, (v) => setDefaults((d) => ({ ...d, font: v })))}</Field>
        <Field label="Size">{sizeField(defaults.size, (v) => setDefaults((d) => ({ ...d, size: v })))}</Field>
        <Field label="Style">{styleToggles(defaults.bold, defaults.italic, (v) => setDefaults((d) => ({ ...d, bold: v })), (v) => setDefaults((d) => ({ ...d, italic: v })))}</Field>
        <Field label="Text colour"><ColorInput label="Text colour" value={defaults.color} onChange={(v) => setDefaults((d) => ({ ...d, color: v }))} /></Field>
        <hr className="border-zinc-200 dark:border-white/10" />
        <h3 className="text-sm font-bold">Other tools</h3>
        <Field label="Highlight colour"><ColorInput label="Highlight colour" value={defaults.highlight} onChange={(v) => setDefaults((d) => ({ ...d, highlight: v }))} /></Field>
        <Field label="Box colour"><ColorInput label="Box colour" value={defaults.box} onChange={(v) => setDefaults((d) => ({ ...d, box: v }))} /></Field>
        <Field label="Pen colour"><ColorInput label="Pen colour" value={defaults.drawColor} onChange={(v) => setDefaults((d) => ({ ...d, drawColor: v }))} /></Field>
        <Field label={`Pen width: ${defaults.drawWidth}pt`}><input type="range" min={1} max={12} value={defaults.drawWidth} onChange={(e) => setDefaults((d) => ({ ...d, drawWidth: Number(e.target.value) }))} className="w-full accent-orange-600 dark:accent-orange-400" /></Field>
        <p className="rounded-xl bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
          Tip: to match a book&apos;s exact font, upload the same .ttf/.otf file. Otherwise the closest standard font is used.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold capitalize">{selected.kind === "rect" ? (selected.variant === "box" ? "Box" : selected.variant) : selected.kind === "draw" ? "Drawing" : selected.kind}</h3>
        <div className="flex gap-1">
          <button type="button" onClick={onDuplicate} aria-label="Duplicate" title="Duplicate" className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10"><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={onDelete} aria-label="Delete" title="Delete (Del)" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {selected.kind === "text" && (
        <>
          <Field label="Font">{fontSelect(selected.font, (v) => onUpdate({ font: v }))}</Field>
          <Field label="Size">{sizeField(selected.fontSize, (v) => onUpdate({ fontSize: v }))}</Field>
          <Field label="Style">{styleToggles(selected.bold, selected.italic, (v) => onUpdate({ bold: v }), (v) => onUpdate({ italic: v }))}</Field>
          <Field label="Text colour"><ColorInput label="Text colour" value={selected.color} onChange={(v) => onUpdate({ color: v })} /></Field>
          {selected.cover && (
            <Field label="Background behind text"><ColorInput label="Cover colour" value={selected.cover.color} onChange={(v) => onUpdate({ cover: { ...(selected.cover as NonNullable<TextObj["cover"]>), color: v } })} /></Field>
          )}
          {selected.fromBox && <p className="rounded-xl bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-600 dark:bg-white/5 dark:text-zinc-300">Font, size and colours were matched automatically. Adjust them if the result doesn&apos;t look identical. Uploading the original font gives an exact match.</p>}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Double-click the text to edit. Drag to move. Press Enter for a new line.</p>
        </>
      )}
      {selected.kind === "rect" && (
        <>
          <Field label="Colour"><ColorInput label="Fill colour" value={selected.fill} onChange={(v) => onUpdate({ fill: v })} /></Field>
          <Field label={`Opacity: ${Math.round(selected.opacity * 100)}%`}><input type="range" min={10} max={100} value={Math.round(selected.opacity * 100)} onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })} className="w-full accent-orange-600 dark:accent-orange-400" /></Field>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Drag the corner handle to resize.</p>
        </>
      )}
      {selected.kind === "draw" && (
        <>
          <Field label="Colour"><ColorInput label="Pen colour" value={selected.color} onChange={(v) => onUpdate({ color: v })} /></Field>
          <Field label={`Width: ${selected.width}pt`}><input type="range" min={1} max={12} value={selected.width} onChange={(e) => onUpdate({ width: Number(e.target.value) })} className="w-full accent-orange-600 dark:accent-orange-400" /></Field>
        </>
      )}
      {selected.kind === "image" && <p className="text-xs text-zinc-500 dark:text-zinc-400">Drag to move. Drag the corner handle to resize (the shape stays in proportion).</p>}
    </div>
  );
}

/* ================================================================ TOOL */

type EditResult = { bytes: Uint8Array; name: string; warnings: string[]; png?: Blob };

export function EditTool() {
  const [session, setSession] = useState<EditorSession | null>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<EditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { state, run } = useProcessor();

  const onFiles = async (files: File[]) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const file = files[0];
      const isImage = /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
      if (isImage) {
        const bmp = await createImageBitmap(file);
        const imageWidth = bmp.width;
        bmp.close();
        const bytes = await imagesToPdf([file], { pageSize: "fit", margin: 0 }, () => undefined);
        setSession({ name: file.name, bytes, objects: [], customs: [], imageWidth });
      } else {
        const info = await inspectPdf(file);
        if (info.locked) throw new Error("This PDF is password-protected. Unlock it first (Protect & Unlock), then edit it.");
        setSession({ name: file.name, bytes: info.bytes, objects: [], customs: [] });
      }
      setOpen(true);
    } catch (e) {
      setError(friendlyError(e, "Couldn't open that file."));
    } finally {
      setLoading(false);
    }
  };

  const finish = async (objects: EditObj[], customs: CustomFont[], opts: { flatten: boolean }) => {
    if (!session) return;
    setSession({ ...session, objects, customs });
    setOpen(false);
    setError(null);
    try {
      const out = await run("Applying your edits…", async (report) => {
        report(0.1, "Applying your edits…");
        const built = await buildEditedPdf(session.bytes, objects, customs);
        let bytes = built.bytes;
        if (opts.flatten) {
          const pages = Array.from(
            new Set(objects.filter((o) => (o.kind === "text" && o.cover) || (o.kind === "rect" && o.variant === "whiteout")).map((o) => o.page)),
          );
          bytes = await flattenPages(bytes, pages, (f, l) => report(0.2 + f * 0.7, l));
        }
        let png: Blob | undefined;
        if (session.imageWidth) {
          report(0.92, "Creating image");
          const doc = await openPdf(bytes);
          try {
            const page = await doc.getPage(1);
            const w = page.getViewport({ scale: 1 }).width;
            const { canvas } = await renderPageToCanvas(doc, 1, session.imageWidth / w, 6000);
            png = await canvasToBlob(canvas, "image/png");
            releaseCanvas(canvas);
          } finally {
            closePdf(doc);
          }
        }
        return { bytes, warnings: built.warnings, png };
      });
      setResult({ ...out, name: session.name });
    } catch (e) {
      setError(friendlyError(e, "Couldn't apply the edits. Please try again."));
      setOpen(true);
    }
  };

  if (state.running) return <ProcessingPanel state={state} />;

  if (open && session) {
    // Rendered in a portal: the tool area is animated (CSS transform), which would break position: fixed.
    return createPortal(<Editor key={`${session.name}-${session.bytes.byteLength}`} session={session} onCancel={() => { setOpen(false); setSession(null); }} onDone={finish} />, document.body);
  }

  if (result && session) {
    const base = baseName(result.name);
    return (
      <ResultCard
        title="Your edited file is ready"
        subtitle="Created on this device. Nothing was uploaded."
        stats={[
          { label: "Changes", value: String(session.objects.length) },
          { label: "Format", value: result.png ? "PDF + PNG" : "PDF" },
          { label: "File size", value: formatBytes(result.bytes.byteLength) },
        ]}
        downloadLabel="Download PDF"
        onDownload={() => downloadBlob(toBlob(result.bytes, "application/pdf"), `${base}-edited.pdf`)}
        onReset={() => { setResult(null); setSession(null); }}
        resetLabel="Edit another file"
      >
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {result.png && <button type="button" className={btnSecondary} onClick={() => downloadBlob(result.png as Blob, `${base}-edited.png`)}>Download as PNG image</button>}
          <button type="button" className={btnSecondary} onClick={() => { setResult(null); setOpen(true); }}>Keep editing</button>
        </div>
        {result.warnings.length > 0 && (
          <p className="mt-4 text-center text-xs text-amber-700 dark:text-amber-300">Some characters ({result.warnings.slice(0, 8).join(" ")}) aren&apos;t available in the standard fonts and were replaced with &quot;?&quot;.</p>
        )}
      </ResultCard>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {loading ? (
        <Card className="flex items-center justify-center gap-3 py-16 text-zinc-600 dark:text-zinc-300">
          <Loader2 className="h-6 w-6 animate-spin" /> Opening your file…
        </Card>
      ) : (
        <DropZone
          accept=".pdf,application/pdf,.png,.jpg,.jpeg,.webp,image/*"
          acceptLabel="PDF or image files"
          onFiles={onFiles}
          icon={PencilLine}
          title="Drop a PDF or image to edit"
          subtitle="Change text, add text, hide or highlight parts, draw, sign and insert images. Scanned pages and photos work too (text recognition)."
        />
      )}
      <ul className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-3 dark:text-zinc-300">
        <li className="rounded-xl bg-zinc-100/80 p-4 dark:bg-white/5"><b className="block text-zinc-900 dark:text-white">Real text</b>Click a line and type. Font, size and colour are matched automatically.</li>
        <li className="rounded-xl bg-zinc-100/80 p-4 dark:bg-white/5"><b className="block text-zinc-900 dark:text-white">Scans and images</b>Press Scan text to find the words, then edit them. Works best on a plain background.</li>
        <li className="rounded-xl bg-zinc-100/80 p-4 dark:bg-white/5"><b className="block text-zinc-900 dark:text-white">Private</b>Everything, including text recognition, runs in your browser.</li>
      </ul>
    </div>
  );
}
