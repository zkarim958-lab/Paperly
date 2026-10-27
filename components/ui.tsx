"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CONSENT_KEY, readConsent, saveConsent, useAdsMode, useAdsterraOk } from "@/components/consent";
import { useSite } from "@/components/site-context";
import { splitBanner, type AdSlotKey } from "@/lib/site";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Moon,
  RotateCcw,
  Sun,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatBytes, type ReportFn } from "@/lib/pdf";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ styles */

export const btnPrimary =
  "btn3d inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40 disabled:pointer-events-none disabled:opacity-50";

export const btnSecondary =
  "btn3d-sec inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold text-zinc-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40 disabled:pointer-events-none disabled:opacity-50 dark:text-zinc-200";

export const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white/80 px-4 py-3 text-base text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-orange-600 dark:focus:border-orange-400 focus:ring-4 focus:ring-orange-500/30 dark:focus:ring-orange-400/30 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "card3d rounded-2xl border p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss message" className="rounded-lg p-1 hover:bg-red-100 dark:hover:bg-red-500/20">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- theme */

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage can be blocked (private mode); the toggle still works */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white/70 text-zinc-700 shadow-sm backdrop-blur transition hover:scale-105 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

/* --------------------------------------------------------------- AdSense */

/**
 * ADSENSE SETUP (3 steps)
 *  1. Open /admin and paste your publisher ID (ca-pub-XXXXXXXXXXXXXXXX).
 *     The layout then loads Google's adsbygoogle.js once for the whole site.
 *  2. In AdSense > Ads > By ad unit, create one "Display ad" per placement
 *     below and paste each unit's numeric ID into the matching /admin field.
 *     (NEXT_PUBLIC_AD_SLOT_* environment variables still work as defaults.)
 *  3. Add your ads.txt (public/ads.txt) so Google can verify the domain.
 */
const SHOW_PLACEHOLDERS =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS === "1";


/** Placement names. The numeric AdSense unit IDs are set in the admin panel (/admin). */
export const AD_SLOTS: Record<AdSlotKey, AdSlotKey> = {
  leaderboard: "leaderboard",
  skyLeft: "skyLeft",
  skyRight: "skyRight",
  processing: "processing",
  result: "result",
  footer: "footer",
  belowTools: "belowTools",
};

type AdsArray = unknown[] & { requestNonPersonalizedAds?: number };
export { CONSENT_KEY };

type AdSlotProps = {
  slot: AdSlotKey;
  /** Short description shown in the dev placeholder, e.g. "728x90 leaderboard". */
  hint: string;
  /** Reserved height in px. Reserving space prevents layout shift (CLS). */
  minHeight: number;
  format?: "auto" | "rectangle" | "vertical" | "horizontal";
  className?: string;
};

/** One Adsterra banner, isolated in a sandboxed iframe so its global settings never clash with other banners or touch the site. */
function AdsterraBanner({ banner, className }: { banner: { key: string; w: number; h: number; src: string }; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / banner.w) || 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [banner.w]);
  const doc =
    `<!doctype html><html><body style="margin:0;overflow:hidden"><script>atOptions={'key':'${banner.key}','format':'iframe','height':${banner.h},'width':${banner.w},'params':{}};</script>` +
    `<script src="${banner.src}"></script></body></html>`;
  return (
    <aside aria-label="Advertisement" className={cx("w-full", className)}>
      <p className="mb-1 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">Advertisement</p>
      <div ref={box} className="mx-auto w-full overflow-hidden" style={{ maxWidth: banner.w, height: banner.h * scale }}>
        <iframe
          title="Advertisement"
          srcDoc={doc}
          width={banner.w}
          height={banner.h}
          scrolling="no"
          loading="lazy"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          style={{ border: 0, display: "block", transformOrigin: "0 0", transform: `scale(${scale})` }}
        />
      </div>
    </aside>
  );
}

export function AdSlot({ slot: slotKey, hint, minHeight, format = "auto", className }: AdSlotProps) {
  const ref = useRef<HTMLModElement>(null);
  const mode = useAdsMode();
  const astOk = useAdsterraOk();
  const site = useSite();
  const astRaw = site.adsterra?.banners?.[slotKey] ?? "";
  const ast = astRaw ? splitBanner(astRaw) : null;
  const ADSENSE_CLIENT = site.adsenseClient;
  const slot = site.adSlots[slotKey] ?? "";
  // No ad (and no reserved space) until the visitor's region/consent allows ads.
  const live = !ast && Boolean(ADSENSE_CLIENT && slot && mode !== "off");

  useEffect(() => {
    if (!live) return;
    const el = ref.current;
    // Guard: React Strict Mode runs effects twice in dev, and AdSense throws
    // if the same <ins> element is filled twice.
    if (!el || el.getAttribute("data-adsbygoogle-status")) return;
    try {
      const w = window as unknown as { adsbygoogle?: AdsArray };
      w.adsbygoogle = (w.adsbygoogle ?? []) as AdsArray;
      // Non-personalised unless the visitor accepted personalised ads (see components/consent.tsx).
      if (mode === "npa") w.adsbygoogle.requestNonPersonalizedAds = 1;
      w.adsbygoogle.push({});
    } catch {
      /* ad blockers can make this throw; the page must keep working */
    }
  }, [live, mode]);

  // An Adsterra banner set for this placement takes it over (shown only after consent).
  if (ast) return astOk ? <AdsterraBanner banner={ast} className={className} /> : null;
  if (!live && !(SHOW_PLACEHOLDERS && (!ADSENSE_CLIENT || !slot))) return null;

  return (
    <aside aria-label="Advertisement" className={cx("w-full", className)}>
      <p className="mb-1 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
        Advertisement
      </p>
      <div style={{ minHeight }} className="flex w-full items-center justify-center overflow-hidden">
        {live ? (
          /* ---- REAL AD UNIT: this is the markup Google expects ---- */
          <ins
            ref={ref}
            className="adsbygoogle"
            style={{ display: "block", width: "100%", minHeight }}
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={slot}
            data-ad-format={format}
            data-full-width-responsive="true"
          />
        ) : (
          <div
            style={{ minHeight }}
            className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-100/60 px-3 text-center text-xs font-medium text-zinc-500 dark:border-white/15 dark:bg-white/[0.03] dark:text-zinc-400"
          >
            Ad slot: {hint}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------- consent */

export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const USE_GOOGLE_CMP = useSite().useGoogleCmp;

  useEffect(() => {
    // With Google's certified consent message in use, it replaces this banner.
    if (USE_GOOGLE_CMP) return;
    if (!readConsent()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener("open-cookie-settings", reopen);
    return () => window.removeEventListener("open-cookie-settings", reopen);
  }, [USE_GOOGLE_CMP]);

  const save = (value: "all" | "necessary") => {
    saveConsent(value);
    setOpen(false);
  };

  if (!open) return null;

  /*
   * COMPLIANCE NOTES
   *  - Both choices have the same look and weight (GDPR/ePrivacy guidance).
   *  - Nothing advertising-related loads until a choice allows it; see
   *    components/consent.tsx for the rules per region.
   *  - For the UK/EEA, Google requires a certified CMP. Turn on AdSense
   *    "Privacy & messaging" and set NEXT_PUBLIC_USE_GOOGLE_CMP=true to use it.
   */
  return (
    <div
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-desc"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl animate-fade-up rounded-xl border border-zinc-200 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:inset-x-6 sm:bottom-6 dark:border-white/10 dark:bg-zinc-900/95"
    >
      <h2 id="cookie-title" className="text-base font-semibold text-zinc-900 dark:text-white">
        Your privacy, your choice
      </h2>
      <p id="cookie-desc" className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        Your files never leave your device. We use Google AdSense to show ads that keep these tools free, and its cookies
        may be used to personalise them. Accept to allow personalised ads, or reject to opt out (in the UK and EU, that
        means no ads are loaded). You can change this at any time from &quot;Cookie settings&quot; in the footer.{" "}
        <a href="/privacy" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-300">
          Privacy policy
        </a>
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => save("necessary")} className={btnSecondary}>
          Reject non-essential
        </button>
        <button type="button" onClick={() => save("all")} className={btnSecondary}>
          Accept all
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dropzone */

export function DropZone({
  accept,
  acceptLabel,
  multiple = false,
  onFiles,
  title,
  subtitle,
  icon: Icon,
  compact = false,
}: {
  accept: string;
  acceptLabel: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accepts = useMemo(() => accept.split(",").map((s) => s.trim().toLowerCase()), [accept]);

  const isAccepted = useCallback(
    (f: File) =>
      accepts.some((a) =>
        a.startsWith(".")
          ? f.name.toLowerCase().endsWith(a)
          : a.endsWith("/*")
            ? f.type.startsWith(a.slice(0, -1))
            : f.type === a,
      ),
    [accepts],
  );

  const handle = useCallback(
    (list: FileList | File[]) => {
      const files = Array.from(list);
      const good = files.filter(isAccepted);
      const skipped = files.length - good.length;
      setNotice(skipped > 0 ? `${skipped} file${skipped > 1 ? "s" : ""} skipped. Only ${acceptLabel} are supported here.` : null);
      if (good.length) onFiles(multiple ? good : good.slice(0, 1));
    },
    [acceptLabel, isAccepted, multiple, onFiles],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
        className={cx(
          "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40",
          compact ? "px-6 py-8" : "px-6 py-14 sm:py-20 xl:py-28",
          over
            ? "scale-[1.01] border-orange-600 dark:border-orange-400 bg-zinc-500/70 dark:bg-white/10"
            : "border-zinc-300 bg-white/50 hover:border-zinc-300 hover:bg-zinc-500/40 dark:border-white/15 dark:bg-white/[0.03] dark:hover:border-white/25 dark:hover:bg-white/5",
        )}
      >
        <div
          className={cx(
            "flex items-center justify-center rounded-2xl accent3d text-white shadow-lg shadow-orange-900/10 transition group-hover:scale-110",
            compact ? "h-14 w-14" : "h-20 w-20 animate-floaty motion-reduce:animate-none",
          )}
        >
          <Icon className={compact ? "h-7 w-7" : "h-10 w-10"} aria-hidden />
        </div>
        <p className={cx("mt-5 font-semibold text-zinc-900 dark:text-white", compact ? "text-base" : "text-xl sm:text-2xl")}>
          {over ? "Drop to add" : title}
        </p>
        <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        <span className={cx(btnPrimary, "pointer-events-none mt-6", compact && "!px-5 !py-3 !text-sm")}>
          <Upload className="h-5 w-5" aria-hidden />
          {multiple ? "Select files" : "Select file"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files) handle(e.target.files);
            e.target.value = ""; // allow picking the same file again
          }}
        />
      </div>
      {notice && (
        <p role="status" className="mt-3 text-center text-sm text-amber-700 dark:text-amber-300">
          {notice}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- sortable */

/** Drag-to-reorder wrapper (mouse). Touch users get the arrow buttons instead. */
export function SortableItem({
  index,
  onReorder,
  children,
  className,
}: {
  index: number;
  onReorder: (from: number, to: number) => void;
  children: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData("text/plain");
        if (raw === "") return; // a file dragged in from the desktop, not a card
        const from = Number(raw);
        if (!Number.isNaN(from)) onReorder(from, index);
      }}
      className={cx(
        "transition duration-200",
        over && "scale-[1.03] ring-4 ring-orange-500/40 dark:ring-orange-400/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- processing */

export type ProcessState = { running: boolean; progress: number; label: string };

/** Minimum time the progress screen stays up, in ms. Set to 0 to disable. */
export const MIN_PROCESS_MS = 3000;

/**
 * Runs a task while showing a progress bar. The bar follows the REAL progress
 * reported by the task, but never finishes before MIN_PROCESS_MS so that the
 * in-processing ad gets a fair viewable window even for tiny files.
 */
export function useProcessor() {
  const [state, setState] = useState<ProcessState>({ running: false, progress: 0, label: "" });

  const run = useCallback(async <T,>(label: string, task: (report: ReportFn) => Promise<T>): Promise<T> => {
    const start = performance.now();
    let real = 0;
    setState({ running: true, progress: 0, label });
    const timer = window.setInterval(() => {
      const timeFraction = MIN_PROCESS_MS > 0 ? Math.min((performance.now() - start) / MIN_PROCESS_MS, 1) : 1;
      const shown = Math.min(real, timeFraction, 0.99);
      setState((s) => ({ ...s, progress: Math.round(shown * 100) }));
    }, 60);
    try {
      const result = await task((fraction, nextLabel) => {
        real = Math.max(real, Math.min(fraction, 1));
        if (nextLabel) setState((s) => ({ ...s, label: nextLabel }));
      });
      real = 1;
      const remaining = MIN_PROCESS_MS - (performance.now() - start);
      if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining + 120));
      setState({ running: true, progress: 100, label: "Done" });
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      return result;
    } finally {
      window.clearInterval(timer);
      setState((s) => ({ ...s, running: false }));
    }
  }, []);

  return { state, run };
}

export function ProcessingPanel({ state, detail }: { state: ProcessState; detail?: string }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="py-10 sm:py-14">
        <div role="status" aria-live="polite" className="mx-auto max-w-xl text-center">
          <p className="text-lg font-semibold text-zinc-900 sm:text-xl dark:text-white">{state.label || "Working…"}</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Everything is happening on your device. Please keep this tab open.</p>
          <div
            className="relative mt-8 h-4 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.progress}
          >
            <div
              className="relative h-full rounded-full accent3d transition-[width] duration-150 ease-out"
              style={{ width: `${Math.max(state.progress, 3)}%` }}
            >
              <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent motion-reduce:animate-none" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">{state.progress}%</p>
          {detail && <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-300">{detail}</p>}
        </div>
      </Card>
      {/* ---- AD PLACEMENT 3: in-processing native slot (next to the progress bar) ---- */}
      <AdSlot slot={AD_SLOTS.processing} hint="300x250 in-processing" format="rectangle" minHeight={250} />
    </div>
  );
}

/* ------------------------------------------------------------------ result */

export function ResultCard({
  title,
  subtitle,
  highlight,
  stats,
  downloadLabel,
  onDownload,
  onReset,
  resetLabel = "Start over",
  children,
}: {
  title: string;
  subtitle?: string;
  highlight?: string;
  stats: { label: string; value: string }[];
  downloadLabel: string;
  onDownload: () => void;
  onReset: () => void;
  resetLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <Card className="animate-fade-up">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-9 w-9" aria-hidden />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-1 max-w-lg text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
          {highlight && (
            <p className="mt-5 text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-6xl">
              {highlight}
            </p>
          )}
          <dl className="mt-6 grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-zinc-100/80 px-4 py-3 dark:bg-white/5">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{s.label}</dt>
                <dd className="mt-0.5 text-base font-semibold text-zinc-900 dark:text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row">
            <button type="button" onClick={onDownload} className={cx(btnPrimary, "sm:min-w-[240px]")}>
              <Download className="h-5 w-5" aria-hidden />
              {downloadLabel}
            </button>
            <button type="button" onClick={onReset} className={btnSecondary}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              {resetLabel}
            </button>
          </div>
        </div>
        {children}
      </Card>
      {/*
        ---- AD PLACEMENT 3b: result slot ----
        Kept ~32px away from the Download button on purpose. AdSense policy
        forbids ads placed so close to interactive controls that people may
        click them by accident, so don't tighten this gap.
      */}
      <AdSlot slot={AD_SLOTS.result} hint="300x250 after result" format="rectangle" minHeight={250} className="mx-auto max-w-[336px] sm:max-w-[728px]" />
    </div>
  );
}

export function FileHeader({
  thumb,
  name,
  size,
  pages,
  onChange,
}: {
  thumb: string | null;
  name: string;
  size: number;
  pages?: number;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={`First page of ${name}`} className="h-24 w-[4.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white object-cover shadow-sm dark:border-white/10" />
      ) : (
        <div className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs text-zinc-500 dark:border-white/10 dark:bg-white/5">PDF</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-zinc-900 dark:text-white" title={name}>{name}</p>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
          {formatBytes(size)}
          {pages ? ` · ${pages} page${pages > 1 ? "s" : ""}` : ""}
        </p>
        <button type="button" onClick={onChange} className="mt-2 text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-300">
          Choose a different file
        </button>
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{children}</h3>;
}
