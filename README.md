# PageForge: free, private, browser-based PDF toolkit

Next.js 15 (App Router) + TypeScript + Tailwind CSS. Every file is processed in the visitor's browser. Nothing is uploaded.

Tools: **Edit PDF** (text, scans/images via OCR), Merge, Compress, Split & Extract, PDF to Images, Images to PDF, Protect & Unlock.

## Run it

```bash
npm install
cp .env.example .env.local     # fill in later; works with everything empty
npm run dev                    # http://localhost:3000
npm run typecheck && npm run build
```

Dependencies: `next`, `react`, `react-dom`, `pdf-lib`, `pdf-lib-plus-encrypt`, `pdfjs-dist` (pinned to 4.10.x), `jszip`, `lucide-react`, `@pdf-lib/fontkit` (custom fonts), `tesseract.js` (OCR); dev: `typescript`, `tailwindcss@3`, `postcss`, `autoprefixer`, `@types/*`.

## Project map

| File | What it does |
| --- | --- |
| `app/page.tsx` | Home page (server): opens Edit PDF, adds structured data |
| `app/[slug]/page.tsx` | One landing page per search intent (14 pages), generated from `lib/seo.ts`: unique title, description, canonical, JSON-LD |
| `lib/seo.ts` | All landing-page copy (H1, intro, steps, tips, FAQs, related links). **Edit or add pages here.** |
| `components/home.tsx` | App shell (client): header, hero, sidebar/mobile tabs, 3-column ad layout, SEO sections, FAQ, footer |
| `components/consent.tsx` | Consent rules + AdSense loader (ads load only when region/consent allow) |
| `app/sitemap.ts`, `app/robots.ts` | `/sitemap.xml` and `/robots.txt`, built from the landing list |
| `app/opengraph-image.tsx`, `app/icon.svg` | Social share card and favicon |
| `components/editor.tsx` | Edit PDF tool: full-screen editor (tools, overlay, properties, OCR, export) |
| `lib/editor.ts` | Editor engine: edit objects, page-rotation geometry, text detection, colour sampling, export |
| `lib/ocr.ts` | tesseract.js adapter (OCR lines to editable boxes) |
| `components/tools.tsx` | The other six tools (UI + state) |
| `components/ui.tsx` | Drop zone, progress bar, result card, **AdSlot**, cookie banner, theme toggle |
| `lib/pdf.ts` | Client-side PDF engine (pdf-lib + pdf.js), commented step by step |
| `app/layout.tsx` | Metadata, theme-flash prevention, **AdSense script loader** |
| `app/privacy`, `app/terms`, `app/contact` | Policy pages AdSense reviewers look for |

## Turning on AdSense

1. Set `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-...` and `NEXT_PUBLIC_SITE_URL`.
2. In AdSense, create one display ad unit per placement and paste the IDs into `NEXT_PUBLIC_AD_SLOT_*`.
3. Put your publisher line in `public/ads.txt`.
4. Replace `contact@example.com` (`NEXT_PUBLIC_CONTACT_EMAIL`) and review the policy pages.

Placements (search for `AD PLACEMENT` in the code): 1) left and right sticky skyscrapers on screens 1536px and wider, 2) leaderboard under the header, 3) in-processing slot next to the progress bar and a result slot below the download card, 4) banner above the footer, 5) responsive unit right below the tool workspace (`NEXT_PUBLIC_AD_SLOT_BELOW_TOOLS`). With no client ID set, slots show dashed placeholders in development and render nothing in production. Space is reserved for each slot to avoid layout shift.

Policy notes: keep ads away from buttons (the result ad is deliberately about 32px below the Download button). For UK/EEA visitors Google requires a certified consent platform (TCF); use AdSense "Privacy & messaging" there. The built-in banner is a simple choice that sets non-personalised ads. `MIN_PROCESS_MS` in `components/ui.tsx` controls the minimum progress time (3 s); set it to 0 to disable.

## Behaviour you should know about

- **Compress** redraws pages as JPEGs, so text stops being selectable (there is a "Keep text selectable" mode with smaller savings). If the result is not smaller, the original is offered instead.
- **Unlock** needs the correct password and redraws pages into an unprotected PDF, so text in the copy is not selectable.
- **Protect** uses `pdf-lib-plus-encrypt`. Check which cipher your installed version uses (RC4 vs AES) and its README for the exact `encrypt()` options before advertising a specific strength.
- pdf.js 4.x needs a reasonably recent browser (Chrome/Edge 119+, Safari 17.4+, Firefox 121+).

## How the editor works (and its limits)

- Edits are overlay objects in page coordinates; the original PDF is only rewritten on **Done** (pdf-lib draws the objects onto it).
- **Edit text** = find the line (pdf.js text layer, or OCR for scans) → sample background/ink colour → cover the old text → draw the new text at the same baseline and size.
- Covering does **not** delete the old text from the file. The Done dialog offers "Permanently remove the old text", which turns edited pages into images. Keep it on for anything you share.
- Font matching is approximate (Helvetica/Times/Courier by name). Users can upload a .ttf/.otf to match exactly.
- Not supported yet: Arabic/Urdu/Hebrew (shaping and right-to-left), rotated or vertical text, re-flowing paragraphs, form-field editing, deleting/reordering pages inside the editor (use Merge/Split).
- OCR downloads ~10 MB of engine and language data from a CDN on first use; self-host it with `NEXT_PUBLIC_TESSERACT_BASE`.

## SEO and landing pages

- Pages: `/edit-pdf`, `/ocr-pdf`, `/merge-pdf`, `/compress-pdf`, `/split-pdf`, `/extract-pdf-pages`, `/pdf-to-images`, `/pdf-to-jpg`, `/pdf-to-png`, `/images-to-pdf`, `/jpg-to-pdf`, `/png-to-pdf`, `/protect-pdf`, `/unlock-pdf`, plus `/about`, `/privacy`, `/terms`, `/contact`. Each landing opens the right tool (and mode: JPG/PNG, Protect/Unlock) and has its own copy.
- Sidebar, quick-nav cards, "related tools" and footer are real links, so crawlers can follow them. `/sitemap.xml` and `/robots.txt` are generated automatically.
- Set `NEXT_PUBLIC_SITE_URL` to the real domain before deploying (used for canonical URLs, the sitemap and structured data). After deploying, submit `https://your-domain/sitemap.xml` in Google Search Console.
- Add a page: add an entry to `LANDINGS` in `lib/seo.ts`. Keep each page's copy genuinely different (thin or duplicate pages hurt rankings).

## Privacy, GDPR and consent

- Fill in `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_OPERATOR_ADDRESS`, `NEXT_PUBLIC_OPERATOR_COUNTRY` and `NEXT_PUBLIC_CONTACT_EMAIL`: the Privacy Policy and Terms name the controller from these.
- The AdSense script is injected by `components/consent.tsx`, not hard-coded. Europe (by browser time zone): no ads and no ad cookies until "Accept all". Elsewhere: non-personalised ads by default, personalised only after "Accept all". Global Privacy Control is honoured. Withdrawing consent reloads the page.
- A time zone is only a heuristic. For UK/EEA traffic, enable Google's certified message (AdSense > Privacy & messaging) and set `NEXT_PUBLIC_USE_GOOGLE_CMP=true`; the built-in banner then hides and "Cookie settings" opens Google's message.
- OCR downloads its engine from a CDN (disclosed in the policy). Self-host it with `NEXT_PUBLIC_TESSERACT_BASE` to avoid any third-party request.
- Have a lawyer review the policy pages for your situation; they are a solid starting point, not legal advice.


## Admin panel (/admin)

Edit the site name, logo, footer tagline, home-page SEO title/description, Google Search Console code, contact and legal details and every AdSense ID without touching code.

1. Set `ADMIN_PASSWORD` (8+ characters) in your environment and redeploy.
2. Open `https://your-domain.com/admin` and sign in.
3. Where settings are stored:
   - **Supabase (free, recommended):** create a project, open SQL Editor and run:
     ```sql
     create table if not exists site_settings (key text primary key, value jsonb not null);
     alter table site_settings enable row level security;  -- no policies: only the server key can read/write
     ```
     then set `SUPABASE_URL` (Project URL) and `SUPABASE_SERVICE_ROLE_KEY` (Settings > API > service_role). Keep that key server-side only.
   - **Vercel / serverless (Upstash alternative):** add a free Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Vercel KV variable names work too). Without it saving fails, because the disk is read-only.
   - **VPS / your own server:** nothing to add. Settings are written to `.data/settings.json` (back this folder up and keep it out of git).

How it works: the login is a signed httpOnly, SameSite=Strict cookie; changing `ADMIN_PASSWORD` signs everyone out. The logo is resized in the browser to 256 px and served from `/api/logo`; it is also the browser-tab icon. The SEO copy on every tool page uses `{site}` internally and is filled with your site name at render time. `/admin` and `/api/` are blocked in robots.txt and `noindex`.

## Tools added in this version

Rotate PDF, Reorder PDF (and delete pages), PDF to Word, PDF to Excel, PDF to PowerPoint, Word to PDF, Excel/CSV to PDF, Python and Jupyter notebook to PDF. Each has its own SEO landing page(s) in `lib/seo-tools.ts` (rotate-pdf, reorder-pdf, delete-pdf-pages, pdf-to-word, scanned-pdf-to-word, word-to-pdf, pdf-to-excel, excel-to-pdf, csv-to-pdf, pdf-to-ppt, python-to-pdf, ipynb-to-pdf); the sitemap and footer pick them up automatically.

Honest limits: Word/Excel/code to PDF use the standard PDF fonts, so non-Latin text (Arabic, Urdu, Chinese) shows as "?"; `.doc`/`.xls`/`.ppt` are not read. PDF to Word/Excel/PPT rebuild text and layout from where the text sits; images and vector graphics are not copied into Word/Excel, and scans need OCR (six Latin-script languages).

## Deploy on Cloudflare (free) + Supabase

Uses OpenNext for Cloudflare (`open-next.config.ts`, `wrangler.jsonc`). Not tested on a live Cloudflare account yet, so expect to fix small things on the first deploy.

1. Create a free Cloudflare account. Install Node 20+ and run `npm install`, then `npx wrangler login`.
2. Create the cache bucket (Cloudflare may ask you to enable R2 and add a card; the free allowance is included): `npx wrangler r2 bucket create pageforge-cache`
3. Create Supabase and the `site_settings` table (see "Admin panel").
4. Create `.env.local` with the public values used at build time (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`, ...). Never put secrets in it.
5. Add the secrets to the deployed Worker (not to git):
   ```
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   (If it says the Worker does not exist yet, run step 6 first, then add the secrets and run `npm run deploy` again.)
6. `npm run deploy` builds and publishes to `https://pageforge.<your-subdomain>.workers.dev`. Test with `npm run preview` first if you like.
7. Custom domain: Cloudflare dashboard > Workers & Pages > pageforge > Settings > Domains & Routes > Add > Custom domain (the domain must use Cloudflare DNS). Then update the site address in /admin.
8. Optional auto-deploy: connect the GitHub repo under Workers & Pages > Create > Import a repository. Build command `npx opennextjs-cloudflare build`, deploy command `npx opennextjs-cloudflare deploy`, and add the `NEXT_PUBLIC_*` values as build variables.

Free-plan limits to know: 100,000 Worker requests a day and 10 ms CPU per request (static pages are served from assets, which helps). If you see error 1102 (CPU exceeded) or 1027 (daily limit), the paid Workers plan ($5/month) lifts both. Admin changes reach visitors within about a minute.
