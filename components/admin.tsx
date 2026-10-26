"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AD_SLOT_KEYS, AD_SLOT_LABELS, type AdSlotKey } from "@/lib/site";
import { btnPrimary, btnSecondary, cx, inputClass } from "@/components/ui";

/*
 * ADMIN PANEL (/admin). Edits the site name, logo, tagline, SEO basics,
 * contact and legal details and the AdSense IDs. Talks to /api/admin/*.
 */

type Form = {
  siteName: string;
  tagline: string;
  siteUrl: string;
  homeTitle: string;
  homeDescription: string;
  googleSiteVerification: string;
  contactEmail: string;
  operatorName: string;
  operatorAddress: string;
  operatorCountry: string;
  adsenseClient: string;
  adSlots: Record<AdSlotKey, string>;
  useGoogleCmp: boolean;
};

type Loaded = { settings: Form; hasLogo: boolean; logo: string; defaults: Form; storage: "supabase" | "redis" | "file" };

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
  let data = {} as T & { error?: string };
  try {
    data = await r.json();
  } catch {
    /* no body */
  }
  return { ok: r.ok, status: r.status, data };
}

/** Resize to at most 256px and return a PNG data URL (keeps transparency). */
async function fileToLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Could not read that image."));
      i.src = url;
    });
    const scale = Math.min(1, 256 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Shell({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#14110f]">
      <header className="border-b border-zinc-200/70 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/60">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <p className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">Admin panel</p>
          <div className="flex items-center gap-3 text-sm">
            <a href="/" className="font-medium text-zinc-700 hover:underline dark:text-zinc-300">View site</a>
            {onLogout && (
              <button type="button" onClick={onLogout} className="font-medium text-zinc-700 hover:underline dark:text-zinc-300">
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{title}</h2>
      {hint && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-zinc-900 dark:text-white">{label}</label>
      {children}
      {help && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{help}</p>}
    </div>
  );
}

export function AdminApp({ configured }: { configured: boolean }) {
  const [state, setState] = useState<"loading" | "login" | "ready">("loading");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [logo, setLogo] = useState<string | null>(null); // data URL currently shown
  const [logoDirty, setLogoDirty] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await api<Loaded>("/api/admin/settings");
    if (r.status === 401) return setState("login");
    if (!r.ok) {
      setMsg({ kind: "err", text: r.data.error ?? "Could not load settings." });
      return setState("login");
    }
    setLoaded(r.data);
    setForm(r.data.settings);
    setLogo(r.data.hasLogo ? r.data.logo : null);
    setLogoDirty(false);
    setState("ready");
  }, []);

  useEffect(() => {
    if (configured) void load();
  }, [configured, load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await api<object>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "err", text: r.data.error ?? "Could not sign in." });
    setPassword("");
    await load();
  };

  const logout = async () => {
    await api("/api/admin/logout", { method: "POST" });
    setState("login");
    setForm(null);
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { ...form };
    if (logoDirty) body.logo = logo;
    const r = await api<object>("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "err", text: r.data.error ?? "Could not save." });
    setMsg({ kind: "ok", text: "Saved. The live site updates within about a minute (reload the page to see it)." });
    setLogoDirty(false);
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLogo(await fileToLogo(file));
      setLogoDirty(true);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not use that image." });
    }
  };

  if (!configured) {
    return (
      <Shell>
        <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-6 dark:border-white/10 dark:bg-white/[0.04]">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Set up the admin panel</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            The admin panel is switched off until you choose a password. Add this to your environment (<code>.env.local</code> locally, or your host&apos;s environment variables), then restart or redeploy:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-100 p-4 text-sm text-zinc-800 dark:bg-white/5 dark:text-zinc-200">ADMIN_PASSWORD=choose-a-long-password</pre>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Use at least 8 characters. Never share it or put it in code.</p>
        </div>
      </Shell>
    );
  }

  if (state === "loading") return <Shell><p className="text-sm text-zinc-500">Loading…</p></Shell>;

  if (state === "login" || !form || !loaded) {
    return (
      <Shell>
        <form onSubmit={login} className="mx-auto max-w-sm rounded-2xl border border-zinc-200/70 bg-white/80 p-6 dark:border-white/10 dark:bg-white/[0.04]">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Sign in</h1>
          <label htmlFor="admin-pw" className="mt-5 block text-sm font-semibold text-zinc-900 dark:text-white">Password</label>
          <input id="admin-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={cx(inputClass, "mt-1")} autoFocus />
          {msg && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{msg.text}</p>}
          <button type="submit" disabled={busy || !password} className={cx(btnPrimary, "mt-5 w-full")}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </Shell>
    );
  }

  const d = loaded.defaults;
  return (
    <Shell onLogout={logout}>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Site settings</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Changes go live for every visitor. Storage: {loaded.storage === "supabase" ? "Supabase" : loaded.storage === "redis" ? "Upstash Redis" : "a file on the server (.data/settings.json)"}.
      </p>

      <div className="mt-6 space-y-6">
        <Section title="Brand" hint="Shown in the header, footer, page titles, legal pages and search results.">
          <Field id="siteName" label="Site name" help="Used everywhere the brand appears, including the SEO text on every tool page.">
            <input id="siteName" className={inputClass} value={form.siteName} maxLength={60} onChange={(e) => set("siteName", e.target.value)} />
          </Field>
          <Field id="tagline" label="Footer tagline">
            <input id="tagline" className={inputClass} value={form.tagline} maxLength={200} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <div>
            <p className="mb-1 text-sm font-semibold text-zinc-900 dark:text-white">Logo</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="Current logo" className="h-14 w-14 object-contain" />
                ) : (
                  <span className="text-xs text-zinc-500">Default</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="logo-file" onChange={(e) => void pickLogo(e.target.files?.[0])} />
                <button type="button" className={btnSecondary} onClick={() => fileRef.current?.click()}>Upload logo</button>
                {logo && (
                  <button type="button" className={btnSecondary} onClick={() => { setLogo(null); setLogoDirty(true); }}>
                    Remove logo
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">A square PNG with a transparent background works best. It is resized to 256 px and also used as the browser-tab icon.</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Header preview</p>
            <div className="flex items-center gap-2.5">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-10 w-10 rounded-xl object-contain" />
              ) : (
                <span className="h-10 w-10 rounded-xl accent3d" />
              )}
              <span className="text-lg font-bold text-zinc-900 dark:text-white">{form.siteName || "Site name"}</span>
            </div>
          </div>
        </Section>

        <Section title="Search and sharing (SEO)">
          <Field id="siteUrl" label="Website address" help="Your real domain, for example https://pageforge.com. Used in the sitemap, canonical links and social cards.">
            <input id="siteUrl" className={inputClass} value={form.siteUrl} placeholder={d.siteUrl} onChange={(e) => set("siteUrl", e.target.value)} />
          </Field>
          <Field id="homeTitle" label="Home page title" help={`${form.homeTitle.length}/60 recommended. Shown in Google results.`}>
            <input id="homeTitle" className={inputClass} value={form.homeTitle} maxLength={120} onChange={(e) => set("homeTitle", e.target.value)} />
          </Field>
          <Field id="homeDescription" label="Home page description" help={`${form.homeDescription.length}/160 recommended.`}>
            <textarea id="homeDescription" rows={3} className={inputClass} value={form.homeDescription} maxLength={320} onChange={(e) => set("homeDescription", e.target.value)} />
          </Field>
          <Field id="gsv" label="Google Search Console verification code" help="From Search Console > Add property > HTML tag. Paste only the content=&quot;…&quot; value.">
            <input id="gsv" className={inputClass} value={form.googleSiteVerification} onChange={(e) => set("googleSiteVerification", e.target.value)} />
          </Field>
        </Section>

        <Section title="Contact and legal" hint="Shown on the Privacy Policy, Terms, About and Contact pages. GDPR requires naming who runs the site.">
          <Field id="contactEmail" label="Contact email">
            <input id="contactEmail" type="email" className={inputClass} value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </Field>
          <Field id="operatorName" label="Business or owner name">
            <input id="operatorName" className={inputClass} value={form.operatorName} onChange={(e) => set("operatorName", e.target.value)} />
          </Field>
          <Field id="operatorAddress" label="Address (optional)">
            <input id="operatorAddress" className={inputClass} value={form.operatorAddress} onChange={(e) => set("operatorAddress", e.target.value)} />
          </Field>
          <Field id="operatorCountry" label="Country (used for governing law)">
            <input id="operatorCountry" className={inputClass} value={form.operatorCountry} onChange={(e) => set("operatorCountry", e.target.value)} />
          </Field>
        </Section>

        <Section title="Google AdSense" hint="Leave the publisher ID empty to show no ads. Ads load only after the visitor's consent where the law requires it.">
          <Field id="adsenseClient" label="Publisher ID" help="Looks like ca-pub-1234567890123456.">
            <input id="adsenseClient" className={inputClass} value={form.adsenseClient} placeholder="ca-pub-…" onChange={(e) => set("adsenseClient", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {AD_SLOT_KEYS.map((k) => (
              <Field key={k} id={`slot-${k}`} label={AD_SLOT_LABELS[k]}>
                <input id={`slot-${k}`} inputMode="numeric" className={inputClass} value={form.adSlots[k]} placeholder="Ad unit ID (numbers)" onChange={(e) => set("adSlots", { ...form.adSlots, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-4 dark:border-white/10">
            <input type="checkbox" checked={form.useGoogleCmp} onChange={(e) => set("useGoogleCmp", e.target.checked)} className="mt-1 h-5 w-5 accent-orange-600 dark:accent-orange-400" />
            <span>
              <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Use Google&apos;s consent message</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">Turn on only after enabling it in AdSense &gt; Privacy &amp; messaging. The built-in cookie banner is then hidden.</span>
            </span>
          </label>
        </Section>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-900/95">
          <button type="button" onClick={save} disabled={busy} className={btnPrimary}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          {msg && (
            <p role={msg.kind === "err" ? "alert" : "status"} className={cx("text-sm", msg.kind === "err" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
              {msg.text}
            </p>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          To change the admin password, edit ADMIN_PASSWORD in your environment and redeploy. Everyone is signed out when it changes.
        </p>
      </div>
    </Shell>
  );
}
