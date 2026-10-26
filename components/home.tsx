"use client";

/*
 * THE APP SHELL (client component).
 *
 * Rendered by app/page.tsx (home) and app/[slug]/page.tsx (one landing page
 * per search intent). The server pages supply metadata and structured data;
 * this component draws the header, hero, tool workspace, ads, SEO copy and
 * footer. Tool switching uses real links (/merge-pdf, /split-pdf ...) so every
 * tool has its own crawlable URL.
 */

import Link from "next/link";
import PdfBackdrop from "./pdf-backdrop";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ComponentType } from "react";
import {
  ChevronDown,
  Cpu,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileStack,
  FileText,
  Globe,
  ImagePlus,
  Layers,
  LockKeyhole,
  PencilLine,
  Presentation,
  ArrowUpDown,
  RotateCw,
  MousePointerClick,
  Scissors,
  Settings2,
  ShieldCheck,
  Shrink,
  Sparkles,
  Zap,
  Download,
  type LucideIcon,
} from "lucide-react";
import { AD_SLOTS, AdSlot, Card, CookieBanner, ThemeToggle, cx } from "@/components/ui";
import { openCookieSettings } from "@/components/consent";
import { useSite } from "@/components/site-context";
import { applySite } from "@/lib/site";
import { EditTool } from "@/components/editor";
import { CodeToPdfTool, ExcelToPdfTool, OrganizeTool, PdfToExcelTool, PdfToPptTool, PdfToWordTool, WordToPdfTool } from "@/components/convert-tools";
import {
  CompressTool,
  ImagesToPdfTool,
  MergeTool,
  PdfToImagesTool,
  ProtectTool,
  SplitTool,
} from "@/components/tools";
import { HOME_FAQS, LANDINGS, TOOL_HOME, landingFaqs, landingPath, type Landing, type ToolId } from "@/lib/seo";


/* ------------------------------------------------------------- tool catalog */

type ToolDef = {
  id: ToolId;
  name: string;
  short: string;
  icon: LucideIcon;
  group: string;
  Component: ComponentType<{ initial?: Landing["initial"] }>;
};

const G_EDIT = "Edit & organize";
const G_FROM = "Convert from PDF";
const G_TO = "Convert to PDF";
const G_SEC = "Security";

const TOOLS: ToolDef[] = [
  { id: "edit", name: "Edit PDF", short: "Edit text, scans and images", icon: PencilLine, group: G_EDIT, Component: EditTool },
  { id: "merge", name: "Merge PDF", short: "Combine files into one", icon: Layers, group: G_EDIT, Component: MergeTool },
  { id: "compress", name: "Compress PDF", short: "Make files smaller", icon: Shrink, group: G_EDIT, Component: CompressTool },
  { id: "split", name: "Split & Extract", short: "Pick the pages you need", icon: Scissors, group: G_EDIT, Component: SplitTool },
  { id: "rotate", name: "Rotate PDF", short: "Turn pages and save", icon: RotateCw, group: G_EDIT, Component: OrganizeTool },
  { id: "reorder", name: "Reorder PDF", short: "Rearrange or delete pages", icon: ArrowUpDown, group: G_EDIT, Component: OrganizeTool },
  { id: "pdf-to-images", name: "PDF to Images", short: "Export pages as PNG or JPG", icon: FileImage, group: G_FROM, Component: PdfToImagesTool },
  { id: "pdf-to-word", name: "PDF to Word", short: "Editable .docx, with OCR", icon: FileText, group: G_FROM, Component: PdfToWordTool },
  { id: "pdf-to-excel", name: "PDF to Excel", short: "Tables to .xlsx", icon: FileSpreadsheet, group: G_FROM, Component: PdfToExcelTool },
  { id: "pdf-to-ppt", name: "PDF to PPT", short: "Pages to .pptx slides", icon: Presentation, group: G_FROM, Component: PdfToPptTool },
  { id: "images-to-pdf", name: "Images to PDF", short: "Turn photos into a PDF", icon: ImagePlus, group: G_TO, Component: ImagesToPdfTool },
  { id: "word-to-pdf", name: "Word to PDF", short: "Convert .docx files", icon: FileText, group: G_TO, Component: WordToPdfTool },
  { id: "excel-to-pdf", name: "Excel to PDF", short: "Convert .xlsx and CSV", icon: FileSpreadsheet, group: G_TO, Component: ExcelToPdfTool },
  { id: "code-to-pdf", name: "Python & Jupyter to PDF", short: "Code and notebooks", icon: FileCode2, group: G_TO, Component: CodeToPdfTool },
  { id: "protect", name: "Protect & Unlock", short: "Add or remove a password", icon: LockKeyhole, group: G_SEC, Component: ProtectTool },
];

const GROUPS = [G_EDIT, G_FROM, G_TO, G_SEC];

/** Every tool link goes to that tool's own landing page, jumping straight to the workspace. */
const toolHref = (id: ToolId) => `${landingPath(TOOL_HOME[id])}#workspace`;

function isToolId(value: string): value is ToolId {
  return TOOLS.some((t) => t.id === value);
}

/* --------------------------------------------------------- shared SEO blocks */

const STEPS = [
  { icon: MousePointerClick, title: "1. Choose a tool", text: "Pick edit, merge, compress, split, convert or protect from the menu." },
  { icon: Settings2, title: "2. Add files and adjust", text: "Drop your files in, then set the order, pages or quality you want." },
  { icon: Download, title: "3. Download instantly", text: "Your result is made on your device and ready in seconds." },
];

const BENEFITS = [
  { icon: ShieldCheck, title: "Private by design", text: "Files are processed in your browser and never uploaded to a server. Open your browser's Network tab to verify." },
  { icon: Zap, title: "Fast, with no waiting", text: "No upload or download queues. Processing starts the moment you add a file." },
  { icon: Globe, title: "Works on any device", text: "Use it on Windows, Mac, Linux, iPhone, iPad and Android with a modern browser." },
  { icon: Sparkles, title: "No sign-up, no watermark", text: "Use every tool without an account, and your documents stay clean." },
  { icon: Cpu, title: "Powered by your device", text: "Modern browsers can do the heavy lifting, so big jobs run quickly on a decent laptop or phone." },
  { icon: FileStack, title: "Free to use", text: "Supported by unobtrusive ads so you never pay or log in." },
];

/** The logo from the admin panel, or the default icon. */
function SiteMark({ size }: { size: number }) {
  const { logoUrl, siteName } = useSite();
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-contain" />;
  }
  return (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-900/20 dark:bg-orange-500" aria-label={siteName}>
      <FileStack style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden />
    </span>
  );
}

/* ---------------------------------------------------------------- the page */

/** `landing` is undefined on the home page, which opens the Edit PDF tool. */
export default function ToolApp({ landing: rawLanding }: { landing?: Landing }) {
  const router = useRouter();
  const site = useSite();
  const SITE_NAME = site.siteName;
  // Static SEO copy says {site}; swap in the name configured in the admin panel.
  const landing = useMemo(() => (rawLanding ? applySite(rawLanding, SITE_NAME) : undefined), [rawLanding, SITE_NAME]);
  const allLandings = useMemo(() => applySite(LANDINGS, SITE_NAME), [SITE_NAME]);
  const byslug = useMemo(() => Object.fromEntries(allLandings.map((l) => [l.slug, l])) as Record<string, Landing>, [allLandings]);
  const toolId: ToolId = landing?.toolId ?? "edit";
  const tool = TOOLS.find((t) => t.id === toolId) ?? TOOLS[0];
  const ActiveTool = tool.Component;
  const faqs = useMemo(() => applySite(landing ? landingFaqs(landing) : HOME_FAQS, SITE_NAME), [landing, SITE_NAME]);

  // Old deep links such as /#compress now forward to that tool's own page.
  useEffect(() => {
    if (landing) return;
    const hash = window.location.hash.slice(1);
    if (isToolId(hash) && hash !== "edit") router.replace(toolHref(hash));
  }, [landing, router]);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <PdfBackdrop />

      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/60">
        <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40" aria-label={`${SITE_NAME} home`}>
            <SiteMark size={40} />
            <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{SITE_NAME}</span>
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-1 text-sm font-medium text-zinc-600 md:flex dark:text-zinc-300">
            <a href="#workspace" className="rounded-xl px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/10">Tools</a>
            <a href="#how-it-works" className="rounded-xl px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/10">How it works</a>
            <a href="#why-us" className="rounded-xl px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/10">Why us</a>
            <a href="#faq" className="rounded-xl px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/10">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white dark:border-white/15 dark:bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 sm:px-3 dark:text-zinc-200">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">100% Free &amp; Private (No Upload to Server)</span>
              <span className="sm:hidden">Private</span>
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ---- AD PLACEMENT 2: top leaderboard (728x90 desktop, responsive on mobile) ---- */}
      <div className="mx-auto mt-4 w-full max-w-[970px] px-4 sm:px-6">
        <AdSlot slot={AD_SLOTS.leaderboard} hint="728x90 leaderboard / responsive" format="horizontal" minHeight={90} />
      </div>

      <main>
        {/* -------------------------------------------------------------- hero */}
        <section className="mx-auto max-w-[1500px] px-4 pb-6 pt-10 sm:px-6 sm:pt-14 lg:pt-16" aria-labelledby="hero-title">
          <div className="flex flex-col gap-10 lg:gap-12">
            <div className="mx-auto max-w-4xl text-center">
              <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-4 py-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-300">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Your files never leave your device
              </p>
              <h1 id="hero-title" className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-white">
                {landing ? (
                  landing.h1
                ) : (
                  <>
                    Free PDF tools that run{" "}
                    <span className="text-orange-600 dark:text-orange-400">entirely in your browser</span>
                  </>
                )}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">
                {landing ? landing.lead : "Edit, merge, compress, split, convert and protect PDFs in seconds. No uploads, no sign-up, no watermarks."}
              </p>
              <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {["No file uploads", "No sign-up", "No watermarks", "Works on phone and PC"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-zinc-900 dark:text-white" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Quick-navigation cards (large screens). Phones use the chip bar below. */}
            <div className="hidden grid-cols-3 gap-4 sm:grid lg:grid-cols-4 xl:grid-cols-5">
              {TOOLS.map((t) => (
                <Link
                  key={t.id}
                  href={toolHref(t.id)}
                  className="group tilt3d card3d rounded-2xl border p-5 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/25"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl accent3d text-white shadow-md transition group-hover:scale-110 group-hover:rotate-3">
                    <t.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-zinc-900 dark:text-white">{t.name}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{t.short}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------- mobile/tablet tool tabs */}
        <div className="sticky top-16 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-zinc-950/70">
          <div role="tablist" aria-label="PDF tools" className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5 sm:px-6">
            {TOOLS.map((t) => (
              <Link
                key={t.id}
                role="tab"
                aria-selected={toolId === t.id}
                href={toolHref(t.id)}
                className={cx(
                  "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition active:scale-95",
                  toolId === t.id
                    ? "accent3d text-white shadow-md"
                    : "border border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200",
                )}
              >
                <t.icon className="h-4 w-4" aria-hidden />
                {t.name}
              </Link>
            ))}
          </div>
        </div>

        {/* --------------------------------- three-column shell: ads | app | ads */}
        <div className="mx-auto mt-6 grid w-full max-w-[1920px] grid-cols-1 gap-6 px-4 sm:px-6 2xl:grid-cols-[160px_minmax(0,1fr)_160px] 2xl:gap-8">
          {/* ---- AD PLACEMENT 1a: left sticky skyscraper (160x600), only on very wide screens ---- */}
          <div className="hidden 2xl:block">
            <div className="sticky top-24">
              <AdSlot slot={AD_SLOTS.skyLeft} hint="160x600 skyscraper" format="vertical" minHeight={600} />
            </div>
          </div>

          <div className="min-w-0">
            <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
              {/* Sidebar tool navigation (desktop) */}
              <aside className="hidden lg:block">
                <nav aria-label="PDF tools" className="sticky top-24 space-y-3">
                  <Card className="!p-3">
                    {GROUPS.map((g) => (
                      <div key={g} className="mb-2 last:mb-0">
                        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{g}</p>
                        <ul className="space-y-1">
                          {TOOLS.filter((t) => t.group === g).map((t) => (
                        <li key={t.id}>
                          <Link
                            href={toolHref(t.id)}
                            aria-current={toolId === t.id ? "page" : undefined}
                            className={cx(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40 dark:focus-visible:ring-orange-400/40",
                              toolId === t.id
                                ? "accent3d text-white shadow-lg shadow-orange-900/10"
                                : "text-zinc-700 hover:translate-x-1 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10",
                            )}
                          >
                            <t.icon className="h-5 w-5 shrink-0" aria-hidden />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">{t.name}</span>
                              <span className={cx("block truncate text-xs", toolId === t.id ? "text-white/75" : "text-zinc-500 dark:text-zinc-400")}>{t.short}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                        </ul>
                      </div>
                    ))}
                  </Card>
                  <div className="rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5 p-4 text-sm text-zinc-800 dark:text-zinc-200">
                    <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" aria-hidden /> 100% private</p>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">Files stay on your device and are never uploaded.</p>
                  </div>
                </nav>
              </aside>

              {/* Workspace */}
              <section id="workspace" aria-labelledby="tool-title" className="min-w-0 scroll-mt-32 lg:scroll-mt-24">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl accent3d text-white shadow-md">
                    <tool.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 id="tool-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{tool.name}</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{tool.short}. Free and private.</p>
                  </div>
                </div>
                <div key={tool.id} className="animate-fade-up">
                  <ActiveTool initial={landing?.initial} />
                </div>
              </section>
            </div>

            {/* ---- AD PLACEMENT 5: below the tool workspace (responsive display ad) ---- */}
            <div className="mx-auto mt-10 w-full max-w-[970px]">
              <AdSlot slot={AD_SLOTS.belowTools} hint="responsive display, below the tools" format="auto" minHeight={250} />
            </div>

            {/* Try another tool (extra dwell time, quick navigation) */}
            <section aria-labelledby="more-tools" className="mt-14">
              <h2 id="more-tools" className="mb-4 text-lg font-bold text-zinc-900 dark:text-white">Try another tool</h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {TOOLS.filter((t) => t.id !== toolId).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={toolHref(t.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200/70 bg-white/70 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <t.icon className="h-5 w-5 shrink-0 text-zinc-900 dark:text-zinc-300" aria-hidden />
                      <span className="text-sm font-semibold text-zinc-900 dark:text-white">{t.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {/* ---------------------------------- SEO: page-specific content */}
            {landing ? (
              <>
                <article className="mt-16 max-w-4xl" aria-label={`About ${landing.name}`}>
                  {landing.sections.map((sec) => (
                    <section key={sec.h} className="mb-8">
                      <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">{sec.h}</h2>
                      {sec.p.map((para) => (
                        <p key={para} className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">{para}</p>
                      ))}
                    </section>
                  ))}
                  <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">How to use {landing.name}</h2>
                  <ol className="mt-4 list-decimal space-y-2 pl-6 text-base text-zinc-600 dark:text-zinc-300">
                    {landing.steps.map((st) => (
                      <li key={st}>{st}</li>
                    ))}
                  </ol>
                  <ul className="mt-6 grid gap-2 sm:grid-cols-3">
                    {landing.tips.map((tip) => (
                      <li key={tip} className="rounded-xl bg-zinc-100/80 p-4 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-300">{tip}</li>
                    ))}
                  </ul>
                </article>

                <nav aria-labelledby="related-title" className="mt-14">
                  <h2 id="related-title" className="mb-4 text-lg font-bold text-zinc-900 dark:text-white">Related tools</h2>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {landing.related.map((slug) => {
                      const r = byslug[slug];
                      return r ? (
                        <li key={slug}>
                          <Link href={`${landingPath(slug)}#workspace`} className="block rounded-xl border border-zinc-200/70 bg-white/70 p-4 text-sm font-semibold text-zinc-900 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
                            {r.name}
                            <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">{r.h1}</span>
                          </Link>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </nav>
              </>
            ) : (
              <section aria-labelledby="all-tools-title" className="mt-16">
                <h2 id="all-tools-title" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">Every PDF tool you need, in one place</h2>
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {SITE_NAME} runs entirely in your browser, so your documents are never uploaded. Choose the job you want to do:
                </p>
                <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {allLandings.map((l) => (
                    <li key={l.slug}>
                      <Link href={`${landingPath(l.slug)}#workspace`} className="block h-full rounded-xl border border-zinc-200/70 bg-white/70 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-white/[0.04]">
                        <span className="block text-base font-semibold text-zinc-900 dark:text-white">{l.name}</span>
                        <span className="mt-1.5 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{l.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* -------------------------------------------- How it works */}
            <section id="how-it-works" aria-labelledby="how-title" className="mt-20 scroll-mt-24">
              <h2 id="how-title" className="text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">How it works</h2>
              <p className="mx-auto mt-2 max-w-2xl text-center text-zinc-600 dark:text-zinc-300">Three steps. No account, no waiting, no upload.</p>
              <ol className="mt-10 grid gap-6 md:grid-cols-3">
                {STEPS.map((s) => (
                  <li key={s.title}>
                    <Card className="h-full text-center transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl accent3d text-white shadow-lg shadow-orange-900/10">
                        <s.icon className="h-7 w-7" aria-hidden />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">{s.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{s.text}</p>
                    </Card>
                  </li>
                ))}
              </ol>
            </section>

            {/* ---------------------------------------------- Why choose us */}
            <section id="why-us" aria-labelledby="why-title" className="mt-20 scroll-mt-24">
              <h2 id="why-title" className="text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">Why people choose {SITE_NAME}</h2>
              <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {BENEFITS.map((b) => (
                  <li key={b.title}>
                    <Card className="h-full transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                      <b.icon className="h-7 w-7 text-zinc-900 dark:text-zinc-300" aria-hidden />
                      <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-white">{b.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{b.text}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>

            {/* -------------------------------------------------------- FAQ */}
            <section id="faq" aria-labelledby="faq-title" className="mt-20 scroll-mt-24">
              <h2 id="faq-title" className="text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">Frequently asked questions</h2>
              <div className="mx-auto mt-8 max-w-3xl space-y-3">
                {faqs.map((f) => (
                  <details key={f.q} className="group rounded-xl border border-zinc-200/70 bg-white/70 p-5 backdrop-blur-xl transition open:shadow-lg dark:border-white/10 dark:bg-white/[0.04]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-zinc-900 focus-visible:outline-none dark:text-white [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <ChevronDown className="h-5 w-5 shrink-0 text-zinc-500 transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          {/* ---- AD PLACEMENT 1b: right sticky skyscraper (160x600) ---- */}
          <div className="hidden 2xl:block">
            <div className="sticky top-24">
              <AdSlot slot={AD_SLOTS.skyRight} hint="160x600 skyscraper" format="vertical" minHeight={600} />
            </div>
          </div>
        </div>

        {/* ---- AD PLACEMENT 4: footer banner (above the footer) ---- */}
        <div className="mx-auto mt-16 w-full max-w-[970px] px-4 sm:px-6">
          <AdSlot slot={AD_SLOTS.footer} hint="970x90 footer banner / responsive" format="horizontal" minHeight={90} />
        </div>
      </main>

      {/* ------------------------------------------------------------ footer */}
      <footer className="mt-12 border-t border-zinc-200/70 bg-white/60 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/50">
        <div className="mx-auto grid max-w-[1500px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
              <SiteMark size={28} /> {SITE_NAME}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {site.tagline}
            </p>
          </div>
          <nav aria-label="Tools">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Tools</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {TOOLS.map((t) => (
                <li key={t.id}>
                  <Link href={toolHref(t.id)} className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-300">{t.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="All PDF tools">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">More tools</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {allLandings.filter((l) => !Object.values(TOOL_HOME).includes(l.slug)).map((l) => (
                <li key={l.slug}>
                  <Link href={`${landingPath(l.slug)}#workspace`} className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-300">{l.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li><a href="/privacy" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-300">Privacy Policy</a></li>
              <li><a href="/about" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-300">About</a></li>
              <li><a href="/terms" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-300">Terms of Service</a></li>
              <li><a href="/contact" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-300">Contact Us</a></li>
              <li>
                <button type="button" onClick={openCookieSettings} className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-300">
                  Cookie settings
                </button>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-zinc-200/70 py-5 text-center text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-500">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </footer>

      <CookieBanner />
    </div>
  );
}
