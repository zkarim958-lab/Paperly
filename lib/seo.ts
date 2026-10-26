/*
 * SEO CONTENT FOR EVERY LANDING PAGE (server-safe: no React, no browser APIs).
 *
 * One landing page per search intent ("merge pdf", "pdf to jpg", "unlock pdf"...).
 * Each page opens the matching tool (and, where it makes sense, the matching
 * mode) so a visitor can act immediately, and carries its own unique title,
 * description, headings, how-to steps, tips and FAQs. Unique copy per page is
 * what keeps these from being treated as duplicate or "doorway" pages.
 *
 * To add a page: add an entry to LANDINGS. The route (app/[slug]/page.tsx),
 * the sitemap, the footer links and the "related tools" blocks all pick it up.
 */

import { BRAND } from "@/lib/site";
import { TOOLS_LANDINGS } from "@/lib/seo-tools";

/**
 * Static copy below writes the brand as "{site}". It is replaced with the name
 * saved in the admin panel at render time (see applySite in lib/site.ts).
 */
const SITE_NAME = BRAND;

export type ToolId =
  | "edit"
  | "merge"
  | "compress"
  | "split"
  | "pdf-to-images"
  | "images-to-pdf"
  | "protect"
  | "rotate"
  | "reorder"
  | "pdf-to-word"
  | "word-to-pdf"
  | "pdf-to-excel"
  | "excel-to-pdf"
  | "pdf-to-ppt"
  | "code-to-pdf";

export type Landing = {
  slug: string;
  toolId: ToolId;
  /** Preselects a mode inside the tool (PDF to Images format, Protect/Unlock tab). */
  initial?: { format?: "png" | "jpg"; mode?: "protect" | "unlock" | "rotate" | "reorder" | "delete" | "python" | "notebook" };
  /** Short label used in link lists. */
  name: string;
  /** <title> without the site-name suffix (the layout template adds " | SiteName"). */
  title: string;
  description: string;
  keywords: string[];
  h1: string;
  lead: string;
  /** Long-form body: heading + paragraphs. */
  sections: { h: string; p: string[] }[];
  steps: string[];
  tips: string[];
  faqs: { q: string; a: string }[];
  /** Slugs shown in the "related tools" block. */
  related: string[];
};

/** The landing page that the sidebar / quick-nav links to for each tool. */
export const TOOL_HOME: Record<ToolId, string> = {
  edit: "edit-pdf",
  merge: "merge-pdf",
  compress: "compress-pdf",
  split: "split-pdf",
  "pdf-to-images": "pdf-to-images",
  "images-to-pdf": "images-to-pdf",
  protect: "protect-pdf",
  rotate: "rotate-pdf",
  reorder: "reorder-pdf",
  "pdf-to-word": "pdf-to-word",
  "word-to-pdf": "word-to-pdf",
  "pdf-to-excel": "pdf-to-excel",
  "excel-to-pdf": "excel-to-pdf",
  "pdf-to-ppt": "pdf-to-ppt",
  "code-to-pdf": "python-to-pdf",
};

const BASE_LANDINGS: Landing[] = [
  /* ------------------------------------------------------------------ edit */
  {
    slug: "edit-pdf",
    toolId: "edit",
    name: "Edit PDF",
    title: "Edit PDF Online Free: Change Text, No Upload",
    description:
      "Edit a PDF in your browser: change text, add text, whiteout, highlight, draw and insert images. Works on scanned pages too. Free, private, no upload.",
    keywords: ["edit pdf", "edit pdf online free", "change text in pdf", "pdf editor no upload", "edit scanned pdf", "private pdf editor"],
    h1: "Edit a PDF online for free: change text, add images, fix scanned pages",
    lead: `${SITE_NAME} is a PDF editor that runs entirely in your browser. Click a line to change it, add new text, cover or highlight parts of a page, draw, and drop in images. Nothing is uploaded.`,
    sections: [
      {
        h: "How editing existing text works",
        p: [
          "Choose Edit text and click the line you want to change. The editor detects the line, samples the background and text colour, covers the old words and writes the new ones at the same position, size and baseline. Pick the closest font, or upload the original .ttf or .otf file for an exact match.",
          "Plain backgrounds give the cleanest result. On photos or gradients a faint patch can remain around the edited line, so check the page at full zoom before you share it.",
        ],
      },
      {
        h: "Removing the old text for good",
        p: [
          "Covering text does not delete it from the file underneath. When you press Done, keep \"Permanently remove the old text\" ticked and the edited pages are converted to images, so the original words cannot be selected or copied. Use this for anything you send to other people.",
        ],
      },
    ],
    steps: [
      "Drop in a PDF (or a photo of a page).",
      "Pick Edit text, Add text, Whiteout, Highlight, Box, Draw or Image and click the page.",
      "Press Done, choose whether to remove the old text permanently, and download.",
    ],
    tips: [
      "Zoom in before editing small print.",
      "Use Undo and Redo freely. Your original file is never changed.",
      "Keep the permanent-removal option on before sharing an edited file.",
    ],
    faqs: [
      { q: "Can I edit the text in any PDF?", a: "Yes for PDFs with real text: click a line and type. Pages that are only pictures need Scan text first, which reads the page with OCR so the words become editable." },
      { q: "Will the edited text look the same as the original?", a: "It matches the original size, colour and position. The font is chosen from standard fonts, so for an exact match upload the original font file. Plain backgrounds look best." },
      { q: "Is it safe to edit confidential documents?", a: "Your file is processed on your own device and is not uploaded to our servers, so contracts and ID documents stay with you." },
    ],
    related: ["ocr-pdf", "merge-pdf", "compress-pdf", "protect-pdf"],
  },
  {
    slug: "ocr-pdf",
    toolId: "edit",
    name: "Edit scanned PDF (OCR)",
    title: "Edit Scanned PDF & Image Text with OCR, Free",
    description:
      "Turn a scanned PDF or a photo of a page into editable text with built-in OCR. Fix typos in scans and change words inside images. Free, runs in your browser.",
    keywords: ["edit scanned pdf", "ocr pdf free", "edit text in image", "scanned book pdf editor", "scan to editable pdf", "pdf ocr online no upload"],
    h1: "Edit a scanned PDF or text inside an image with OCR",
    lead: "Scanned books, photographed pages and image-only PDFs have no real text to click. Press Scan text and the page is read with OCR on your device, so each line becomes an editable box.",
    sections: [
      {
        h: "What OCR does here",
        p: [
          "Optical character recognition reads the pixels of a scanned page and finds each line of text with its position. The editor turns every recognised line into a box you can edit: change a word, fix a typo or update a date, and the new text is written at the same size in a matching colour.",
          "English, Spanish, French, German, Italian and Portuguese are available. Choose the language of the page before you scan for the best accuracy.",
        ],
      },
      {
        h: "Getting good results from a scan",
        p: [
          "A straight, well-lit scan at 200 to 300 DPI reads best. Skewed or blurry pages produce more recognition mistakes, so review the scanned lines before editing. The recognition engine is downloaded once, the first time you use Scan text, and everything after that runs on your device.",
        ],
      },
    ],
    steps: [
      "Open the scanned PDF or image in the editor.",
      "Choose your language and press Scan text on the page.",
      "Click a recognised line, edit it, then press Done and download.",
    ],
    tips: [
      "Pick the page language before scanning.",
      "Straight, high-resolution scans give the best recognition.",
      "Keep \"Permanently remove the old text\" on for the final file.",
    ],
    faqs: [
      { q: "Can I edit text inside a photo or screenshot?", a: "Yes. Open the image, press Scan text, and edit the recognised lines. Export the result as a PDF or as a PNG at the original size." },
      { q: "Does OCR make the PDF searchable?", a: "The edited lines are written as real text, but finished pages can be flattened to images for privacy. If you need a fully searchable scan, leave the flatten option off." },
      { q: "Is my scanned document uploaded for OCR?", a: "No. Recognition runs in your browser. The OCR engine and language data are downloaded once from a content delivery network, but your document never leaves your device." },
    ],
    related: ["edit-pdf", "images-to-pdf", "compress-pdf", "pdf-to-images"],
  },

  /* ----------------------------------------------------------------- merge */
  {
    slug: "merge-pdf",
    toolId: "merge",
    name: "Merge PDF",
    title: "Merge PDF Files Online Free, No Upload",
    description:
      "Combine PDF files into one document in your browser. Drag to reorder, merge as many files as you need, no sign-up, no watermark, nothing uploaded.",
    keywords: ["merge pdf", "combine pdf files", "join pdf online", "merge pdf free no upload", "pdf merger"],
    h1: "Merge PDF files online for free, without uploading them",
    lead: `${SITE_NAME} combines several PDF files into a single document right inside your browser. Add your files, drag the cards into order and download one clean PDF.`,
    sections: [
      {
        h: "Join PDFs in the order you want",
        p: [
          "Every file appears as a card with a preview of its first page, its page count and its size. Drag a card, or use the arrows, to set the order. The merged document follows that order exactly, and every page keeps its original size and orientation.",
          "It works for joining scanned pages, combining chapters, bundling application documents or putting invoices together before you email them.",
        ],
      },
      {
        h: "Private by design",
        p: ["Because the merge runs on your own device, contracts, invoices and reports are never sent to a server. There is no file-size limit from us, only your device's memory."],
      },
    ],
    steps: ["Add two or more PDFs.", "Drag the cards into the order you want.", "Press Merge PDFs and download the combined file."],
    tips: ["Remove a file with the cross on its card.", "Password-protected files must be unlocked first.", "Very large merges are faster on a laptop than a phone."],
    faqs: [
      { q: "How many PDFs can I merge at once?", a: "There is no limit set by us. The practical limit is your device's memory, so dozens of ordinary files are fine." },
      { q: "Will merging reduce the quality?", a: "No. Pages are copied into the new document as they are, so text stays selectable and images are not recompressed." },
      { q: "Can I merge a password-protected PDF?", a: "Unlock it first with the Unlock PDF tool using the correct password, then merge the unlocked copy." },
    ],
    related: ["split-pdf", "compress-pdf", "images-to-pdf", "edit-pdf"],
  },

  /* -------------------------------------------------------------- compress */
  {
    slug: "compress-pdf",
    toolId: "compress",
    name: "Compress PDF",
    title: "Compress PDF Online: Reduce File Size Free",
    description:
      "Make a PDF smaller for email and upload limits. Choose Extreme, Recommended or High quality and see the new size before you download. Private, no upload.",
    keywords: ["compress pdf", "reduce pdf size", "make pdf smaller", "pdf compressor online", "compress pdf under 1mb", "shrink pdf"],
    h1: "Compress a PDF online to fit email and upload limits",
    lead: "Choose Extreme, Recommended or High quality and the PDF is shrunk on your device. You see the before and after size and only download if you are happy with it.",
    sections: [
      {
        h: "How PDF compression works",
        p: [
          "Standard compression redraws each page as an optimised image at the level you choose and rebuilds the PDF. That gives very large savings for scans and photo-heavy files, which is where most of the weight in a PDF comes from.",
          "If you need the text to stay searchable and selectable, tick Keep text selectable. The savings are smaller, but the document structure is preserved.",
        ],
      },
      {
        h: "Getting under a size limit",
        p: ["Start with Recommended. If the file is still too large for an email attachment or a job-portal upload, run it again on Extreme. If the result is not smaller than the original, the original is offered instead so you never end up with a bigger file."],
      },
    ],
    steps: ["Add your PDF.", "Pick Extreme, Recommended or High quality.", "Compare the sizes and download the smaller file."],
    tips: ["Scans and image-heavy files shrink the most.", "Text-only PDFs are usually small already.", "Use Keep text selectable if you need search and copy."],
    faqs: [
      { q: "How much smaller will my PDF get?", a: "Scans and photo-heavy PDFs often drop by more than half. Files that are mostly text are already small and shrink less." },
      { q: "Will I lose quality?", a: "Extreme trades some sharpness for size, Recommended is a balance, and High quality keeps pages crisp. You can preview the size and try another level." },
      { q: "Is the text still selectable afterwards?", a: "With standard compression, no, because pages become images. Turn on Keep text selectable to preserve it, with smaller savings." },
    ],
    related: ["merge-pdf", "split-pdf", "pdf-to-images", "protect-pdf"],
  },

  /* ----------------------------------------------------------------- split */
  {
    slug: "split-pdf",
    toolId: "split",
    name: "Split PDF",
    title: "Split PDF Online: Separate Pages Free, No Upload",
    description:
      "Split a PDF into separate pages or smaller files. Select pages from thumbnails or type ranges like 1-3, 5, 8-10. Free, private and runs in your browser.",
    keywords: ["split pdf", "separate pdf pages", "split pdf into pages", "divide pdf", "pdf splitter online"],
    h1: "Split a PDF into separate pages or smaller documents",
    lead: "See every page as a thumbnail, click the ones you want, or type a range. Save the selection as one new PDF, or as one PDF per page in a ZIP.",
    sections: [
      {
        h: "Two ways to choose pages",
        p: [
          "Click thumbnails for a visual selection, or type a range such as 1-3, 5, 8-10. The two stay in sync, and quick buttons select all, odd or even pages.",
          "Use it to pull one form out of a long document, remove cover pages, or share only the relevant section of a report.",
        ],
      },
      {
        h: "Your original stays untouched",
        p: ["Splitting creates new files and never modifies the one you opened. It all happens on your device, so the document is not uploaded anywhere."],
      },
    ],
    steps: ["Add your PDF.", "Select pages with thumbnails or a range.", "Export as one PDF, or one PDF per page in a ZIP."],
    tips: ["Odd and Even are useful for double-sided scans.", "An invalid range is flagged before you export.", "The ZIP option names each file by page number."],
    faqs: [
      { q: "How do I split a PDF into single pages?", a: "Select all pages and choose the option to save each selected page as its own PDF. You get a ZIP with one file per page." },
      { q: "Can I split by page range?", a: "Yes. Type ranges like 1-3, 5, 8-10 and the matching thumbnails are selected automatically." },
      { q: "Does splitting change the pages?", a: "No. Pages are copied as they are, with text, images and links intact." },
    ],
    related: ["extract-pdf-pages", "merge-pdf", "compress-pdf", "pdf-to-images"],
  },
  {
    slug: "extract-pdf-pages",
    toolId: "split",
    name: "Extract PDF pages",
    title: "Extract Pages from a PDF Online, Free & Private",
    description:
      "Pull specific pages out of a PDF into a new file, or delete the pages you do not want by keeping the rest. Select by thumbnail or range. No upload.",
    keywords: ["extract pages from pdf", "pull pages out of pdf", "remove pages from pdf", "delete pdf pages", "save selected pdf pages"],
    h1: "Extract pages from a PDF, or remove the ones you do not need",
    lead: "Need only pages 4 to 7 of a long report, or everything except the cover? Select the pages you want to keep and save them as a new PDF in one step.",
    sections: [
      {
        h: "Keep what you need, drop the rest",
        p: [
          "To remove pages, select all of the pages you want to keep and extract them. The result is a new PDF without the pages you left out, which is the simplest way to delete a cover page, a blank sheet or an appendix.",
          "Ranges such as 2-5, 9 work as you would expect, and the thumbnails show exactly what will be in the new file.",
        ],
      },
      {
        h: "Share only the relevant section",
        p: ["Extracting a section is a good way to send a single chapter, a signed page or one invoice from a larger file without exposing the rest of the document."],
      },
    ],
    steps: ["Add your PDF.", "Click the pages to keep, or type a range.", "Press Extract pages and download the new PDF."],
    tips: ["Use All, then deselect pages to remove a few.", "Check the thumbnails before exporting.", "The original document is never changed."],
    faqs: [
      { q: "How do I delete pages from a PDF?", a: "Select every page except the ones you want to delete, then extract. The new file contains only the pages you kept." },
      { q: "Can I extract non-consecutive pages?", a: "Yes. Type something like 1, 4, 9-12 or click the thumbnails you want in any order of selection." },
      { q: "Do extracted pages keep their formatting?", a: "Yes. Pages are copied directly, so fonts, images and layout are unchanged." },
    ],
    related: ["split-pdf", "merge-pdf", "compress-pdf", "edit-pdf"],
  },

  /* --------------------------------------------------------- PDF to images */
  {
    slug: "pdf-to-images",
    toolId: "pdf-to-images",
    name: "PDF to Images",
    title: "PDF to Image Converter: Pages to PNG or JPG",
    description:
      "Convert every page of a PDF into an image. Pick PNG or JPG and Standard, High or Maximum quality, then download a ZIP. Free and private, no upload.",
    keywords: ["pdf to image", "convert pdf to images", "pdf pages to pictures", "pdf to image converter", "export pdf pages as images"],
    h1: "Convert PDF pages to images in your browser",
    lead: "Turn each page of a PDF into a sharp PNG or a compact JPG. Download pages one by one, or all together as a ZIP.",
    sections: [
      {
        h: "Choose format and resolution",
        p: [
          "PNG is lossless and keeps text crisp, which is ideal for slides, diagrams and screenshots. JPG makes smaller files and lets you set the quality. Standard, High and Maximum correspond to roughly 108, 144 and 216 DPI.",
          "Handy for social posts, thumbnails, presentations, or inserting a single page into another document.",
        ],
      },
      {
        h: "Large pages are handled safely",
        p: ["Very large pages are scaled to a size your browser can draw, so big posters and maps still convert without freezing the tab. Everything is rendered on your device."],
      },
    ],
    steps: ["Add your PDF.", "Choose PNG or JPG and a quality level.", "Download pages individually or as one ZIP."],
    tips: ["Maximum quality is best for printing.", "Click any preview to download only that page.", "Use JPG for photo-heavy pages and PNG for text."],
    faqs: [
      { q: "What resolution are the exported images?", a: "Roughly 108, 144 or 216 DPI depending on the quality you pick. Choose Maximum for print." },
      { q: "Can I convert only some pages?", a: "Download single pages by clicking their preview, or use Split & Extract first to keep only the pages you need." },
      { q: "Is anything uploaded?", a: "No. Pages are rendered in your browser and the ZIP is created on your device." },
    ],
    related: ["pdf-to-jpg", "pdf-to-png", "images-to-pdf", "split-pdf"],
  },
  {
    slug: "pdf-to-jpg",
    toolId: "pdf-to-images",
    initial: { format: "jpg" },
    name: "PDF to JPG",
    title: "PDF to JPG Converter Online, Free & Private",
    description:
      "Convert PDF pages to JPG images in your browser. Adjust quality and resolution, then download a ZIP. No upload, no sign-up, no watermark.",
    keywords: ["pdf to jpg", "convert pdf to jpg", "pdf to jpeg", "pdf to jpg free", "pdf page to jpg"],
    h1: "Convert PDF to JPG online for free",
    lead: "Make a compact JPG from every page of your PDF. JPG is the right pick for photos, scans and anything you want to email or post.",
    sections: [
      {
        h: "Why choose JPG",
        p: [
          "JPG files are small and open everywhere, which makes them perfect for sharing pages in chat apps, email and social media. Set the quality to balance file size against sharpness.",
          "For pages that are mostly text or line art, PNG keeps edges cleaner. You can switch format at any time before downloading.",
        ],
      },
    ],
    steps: ["Add your PDF.", "Keep JPG selected and pick a resolution.", "Download single pages or the whole ZIP."],
    tips: ["Lower JPG quality for smaller files.", "Use Maximum resolution for print.", "Switch to PNG for sharp text."],
    faqs: [
      { q: "How do I convert a PDF to JPG?", a: "Add the PDF, make sure JPG is selected, choose a quality and download. Each page becomes its own JPG." },
      { q: "Is the JPG quality good enough to print?", a: "Yes. Choose Maximum quality for roughly 216 DPI output, which prints well at common sizes." },
      { q: "Will the converted files have a watermark?", a: "No. There is no watermark and no sign-up." },
    ],
    related: ["pdf-to-png", "pdf-to-images", "jpg-to-pdf", "compress-pdf"],
  },
  {
    slug: "pdf-to-png",
    toolId: "pdf-to-images",
    initial: { format: "png" },
    name: "PDF to PNG",
    title: "PDF to PNG Converter: Lossless Images, Free",
    description:
      "Convert PDF pages to crisp PNG images in your browser. Lossless quality for text and diagrams, up to about 216 DPI. Free, private, no upload.",
    keywords: ["pdf to png", "convert pdf to png", "pdf to png high quality", "pdf to png free", "pdf page to png"],
    h1: "Convert PDF to PNG online with lossless quality",
    lead: "PNG keeps text and line art perfectly sharp, so it is the best format for slides, diagrams, screenshots and anything with fine detail.",
    sections: [
      {
        h: "When PNG is the better choice",
        p: [
          "PNG does not lose quality when saved, so lettering and thin lines stay crisp even when zoomed in. Files are larger than JPG, which is the trade-off for perfect edges.",
          "Choose Maximum quality, about 216 DPI, when you plan to print the image or place it in a design.",
        ],
      },
    ],
    steps: ["Add your PDF.", "Keep PNG selected and choose a resolution.", "Download pages one by one or as a ZIP."],
    tips: ["Use PNG for text, charts and logos.", "Use JPG instead if file size matters more.", "Click a preview to save a single page."],
    faqs: [
      { q: "Is PNG better than JPG for PDFs?", a: "For text-heavy pages and diagrams, yes, because PNG is lossless. For photos, JPG gives much smaller files." },
      { q: "Can I get a transparent background?", a: "Pages are rendered on a white background, the way they look in a PDF viewer." },
      { q: "Does it work on a phone?", a: "Yes, on any modern browser. Very large PDFs convert faster on a computer." },
    ],
    related: ["pdf-to-jpg", "pdf-to-images", "png-to-pdf", "split-pdf"],
  },

  /* --------------------------------------------------------- images to PDF */
  {
    slug: "images-to-pdf",
    toolId: "images-to-pdf",
    name: "Images to PDF",
    title: "Images to PDF Converter: Photos to One PDF",
    description:
      "Combine photos and scans into one PDF. Reorder images, pick A4, US Letter or fit-to-image pages and set margins. Free, private, nothing is uploaded.",
    keywords: ["images to pdf", "photos to pdf", "convert images to pdf", "combine pictures into pdf", "image to pdf converter"],
    h1: "Convert images to a single PDF online",
    lead: "Combine photos and scans into one tidy PDF. Reorder the images, choose a page size and margins, and download the result.",
    sections: [
      {
        h: "Page size and margins",
        p: [
          "Choose A4 (common in the UK and Australia), US Letter (US and Canada), or fit-to-image so each page matches its picture exactly. Set margins and the way each image fits the page.",
          "Photos taken on a phone are rotated correctly automatically, so portrait shots do not end up sideways.",
        ],
      },
      {
        h: "Good for scans and receipts",
        p: ["It is a quick way to send a multi-page scan, a signed form photographed on your phone, or a set of receipts as a single file. JPG, PNG, WebP, GIF and BMP images are supported."],
      },
    ],
    steps: ["Add your images.", "Drag to reorder and pick page size and margins.", "Press Create PDF and download."],
    tips: ["A4 suits the UK and Australia; Letter suits the US and Canada.", "Fit-to-image avoids white borders.", "Compress the PDF afterwards if it is large."],
    faqs: [
      { q: "Which image formats can I use?", a: "JPG, PNG, WebP, GIF and BMP." },
      { q: "Can I change the order of the pictures?", a: "Yes. Drag the cards or use the arrows before creating the PDF." },
      { q: "Will the PDF be too large to email?", a: "If it is, run it through Compress PDF to reduce the size." },
    ],
    related: ["jpg-to-pdf", "png-to-pdf", "merge-pdf", "compress-pdf"],
  },
  {
    slug: "jpg-to-pdf",
    toolId: "images-to-pdf",
    name: "JPG to PDF",
    title: "JPG to PDF Converter Online, Free & Private",
    description:
      "Turn JPG photos into a PDF in your browser. Combine several pictures, reorder them and choose A4 or Letter. No upload, no sign-up, no watermark.",
    keywords: ["jpg to pdf", "convert jpg to pdf", "jpeg to pdf", "photo to pdf", "multiple jpg to one pdf"],
    h1: "Convert JPG to PDF online for free",
    lead: "Make a PDF from one JPG or a whole set of them. Perfect for photographed documents, scanned pages and receipts.",
    sections: [
      {
        h: "From phone photos to a clean PDF",
        p: [
          "Take a photo of each page, add them here, put them in order and download one PDF that anyone can open. Orientation from your phone is respected automatically.",
          "Pick A4 or US Letter for a standard document, or fit-to-image to keep each picture at its own proportions.",
        ],
      },
    ],
    steps: ["Add one or more JPG files.", "Reorder and choose page size.", "Create the PDF and download it."],
    tips: ["Good light makes better document photos.", "Use fit-to-image for photos, A4 or Letter for forms.", "Compress afterwards for email."],
    faqs: [
      { q: "How do I convert several JPGs into one PDF?", a: "Add all the files, arrange them in order and create the PDF. Every image becomes a page." },
      { q: "Do my photos get uploaded?", a: "No. The PDF is built in your browser." },
      { q: "Can I convert JPEG as well as JPG?", a: "Yes, they are the same format." },
    ],
    related: ["png-to-pdf", "images-to-pdf", "merge-pdf", "compress-pdf"],
  },
  {
    slug: "png-to-pdf",
    toolId: "images-to-pdf",
    name: "PNG to PDF",
    title: "PNG to PDF Converter Online, Free & Private",
    description:
      "Convert PNG images and screenshots into a PDF in your browser. Combine multiple images, set page size and margins. No upload and no watermark.",
    keywords: ["png to pdf", "convert png to pdf", "screenshot to pdf", "multiple png to one pdf", "png to pdf free"],
    h1: "Convert PNG to PDF online for free",
    lead: "Combine screenshots, diagrams and exported graphics into a single PDF. PNG quality is kept as it is.",
    sections: [
      {
        h: "Screenshots and graphics",
        p: [
          "PNG images are embedded without extra loss, so text in screenshots and lines in diagrams stay sharp. Put several images into one document, or make each page match its image with fit-to-image.",
          "Choose A4 or US Letter with margins when the PDF will be printed or submitted as a form.",
        ],
      },
    ],
    steps: ["Add your PNG files.", "Arrange them and choose a page size.", "Create the PDF and download it."],
    tips: ["Fit-to-image keeps screenshots at exact proportions.", "Add margins for printing.", "Run Compress PDF if the file is large."],
    faqs: [
      { q: "Will PNG transparency be kept?", a: "Transparent areas appear on a white page in the PDF." },
      { q: "Can I mix PNG and JPG in one PDF?", a: "Yes. You can add different image types together." },
      { q: "Is there a limit on the number of images?", a: "No limit from us. Your device's memory is the only practical limit." },
    ],
    related: ["jpg-to-pdf", "images-to-pdf", "pdf-to-png", "merge-pdf"],
  },

  /* ------------------------------------------------------ protect / unlock */
  {
    slug: "protect-pdf",
    toolId: "protect",
    initial: { mode: "protect" },
    name: "Protect PDF",
    title: "Password Protect a PDF Online, Free & Private",
    description:
      "Add a password to a PDF and control printing, copying and editing. Encryption happens in your browser, so your file and password are never uploaded.",
    keywords: ["protect pdf with password", "password protect pdf", "encrypt pdf", "lock pdf", "add password to pdf free"],
    h1: "Password-protect a PDF in your browser",
    lead: "Set a password so only people who know it can open your PDF, and choose whether they may print, copy or edit it. The password never leaves your device.",
    sections: [
      {
        h: "Choose a strong password",
        p: [
          "A password is only as strong as it is hard to guess. Use a long phrase that you do not use anywhere else; the strength meter shows how you are doing. Share the password through a different channel than the file.",
          "You can also set permissions for printing, copying and editing for people who open the document.",
        ],
      },
      {
        h: "Private by design",
        p: ["The document and the password are processed on your device and are not sent to us. That also means we cannot recover a forgotten password, so store it somewhere safe."],
      },
    ],
    steps: ["Add your PDF.", "Enter and confirm a password and choose permissions.", "Press Protect and download the locked file."],
    tips: ["Use a long, unique password.", "Do not send the password in the same message as the file.", "Keep an unprotected backup in a safe place."],
    faqs: [
      { q: "Can you recover a forgotten PDF password?", a: "No. The password never reaches us, so it cannot be recovered. Keep a copy of the original file." },
      { q: "Is the PDF really encrypted?", a: "Yes. The file is encrypted with the PDF standard security handler on your device. Choose a long password because strength depends on it." },
      { q: "Can I stop people printing or copying?", a: "You can set those permissions. They are honoured by most PDF software, but a password to open the file is the stronger protection." },
    ],
    related: ["unlock-pdf", "merge-pdf", "compress-pdf", "edit-pdf"],
  },
  {
    slug: "unlock-pdf",
    toolId: "protect",
    initial: { mode: "unlock" },
    name: "Unlock PDF",
    title: "Unlock PDF Online: Remove a Known Password",
    description:
      "Remove the password from a PDF you own when you know the password. Get an unprotected copy in your browser. Free, private, nothing is uploaded.",
    keywords: ["unlock pdf", "remove pdf password", "decrypt pdf", "remove password from pdf", "open protected pdf"],
    h1: "Unlock a PDF when you know its password",
    lead: "Enter the correct password and get a copy of the PDF that opens without one. This works only for files you have the right to open.",
    sections: [
      {
        h: "What unlocking does",
        p: [
          "With the correct password the tool opens the file, redraws the pages into a new PDF without the password or the print and copy restrictions, and lets you download it. Because the pages are redrawn, text in the unlocked copy is not selectable.",
          "A wrong password is reported immediately, so you do not wait for a long process to fail.",
        ],
      },
      {
        h: "Only for files you may open",
        p: ["This tool cannot guess or crack a forgotten password, and it is not meant to bypass protection on documents you have no right to open."],
      },
    ],
    steps: ["Add the protected PDF.", "Type the password.", "Download the unlocked copy."],
    tips: ["Passwords are case-sensitive.", "Unlock before merging or splitting a protected file.", "Keep the unlocked copy somewhere private."],
    faqs: [
      { q: "Can you unlock a PDF without the password?", a: "No. The tool needs the correct password and does not crack passwords." },
      { q: "Why is the text not selectable in the unlocked file?", a: "The pages are redrawn to remove the restrictions, so text becomes part of the page image." },
      { q: "Is my password sent anywhere?", a: "No. It is used on your device only and is not transmitted or stored." },
    ],
    related: ["protect-pdf", "merge-pdf", "split-pdf", "compress-pdf"],
  },
];

export const LANDINGS: Landing[] = [...BASE_LANDINGS, ...TOOLS_LANDINGS];

export const LANDING_BY_SLUG: Record<string, Landing> = Object.fromEntries(LANDINGS.map((l) => [l.slug, l]));

export function landingPath(slug: string) {
  return `/${slug}`;
}

/** Absolute URL helper for structured data and the sitemap. */
export function absoluteUrl(path: string, base: string) {
  return `${base.replace(/\/$/, "")}${path === "/" ? "" : path}`;
}

/* Full FAQ list shown on the home page (also used for its FAQ structured data). */
export const HOME_FAQS = [
  {
    q: "Can I edit text in a PDF, including a scanned book or an image?",
    a: "Yes. For PDFs with real text, open Edit PDF, choose Edit text and click a line. For scanned pages or text inside images, press Scan text: the page is read with OCR on your device and the recognised lines become editable. The result looks best on plain backgrounds, and matching a book's exact font needs you to upload that font file. Right-to-left scripts such as Arabic and Urdu aren't supported yet.",
  },
  {
    q: "When I edit text, is the old text really gone?",
    a: "Editing covers the old words and writes new ones on top, which can leave the original text underneath. When you finish, keep \"Permanently remove the old text\" ticked and the edited pages are converted to images so nothing can be copied out from under the edit.",
  },
  {
    q: "Are my files really private?",
    a: "Yes. All processing happens in your browser using JavaScript. Your PDFs and images are not uploaded to our servers. You can confirm this by watching the Network tab in your browser's developer tools while you use a tool.",
  },
  {
    q: "How do I merge PDF files without uploading them?",
    a: "Open Merge PDF, drop in two or more files, drag the cards into the order you want and press Merge PDFs. The combined file is created on your device and downloaded straight away.",
  },
  {
    q: "How does PDF compression work, and will I lose quality?",
    a: "Standard compression redraws every page as a JPEG at the level you choose and rebuilds the PDF. This gives large savings for scans and image-heavy files, but text becomes part of the picture and is no longer selectable. Turn on Keep text selectable for a lighter optimization that preserves text, with smaller savings.",
  },
  {
    q: "How do I extract specific pages from a PDF?",
    a: "Open Split & Extract, click the page thumbnails you want or type a range like 1-3, 5, then press Extract pages. You can also save each selected page as its own PDF in a ZIP.",
  },
  {
    q: "What resolution are the images when I convert a PDF to JPG or PNG?",
    a: "You can choose roughly 108, 144 or 216 DPI. PNG is lossless and best for text. JPG makes smaller files and lets you set the quality.",
  },
  {
    q: "How secure is the PDF password protection?",
    a: "The password is applied on your device using the PDF standard security handler, and neither the password nor the file is sent anywhere. Protection is only as strong as the password, so choose a long, unique one. We can't recover a forgotten password.",
  },
  {
    q: "Can you unlock a PDF if I forgot the password?",
    a: "No. The Unlock tool needs the correct password. It then creates a copy without the password or print/copy restrictions by redrawing the pages, so text in the copy is not selectable.",
  },
  {
    q: "Is there a file size limit?",
    a: "There is no limit imposed by us because nothing is uploaded. The practical limit is your device's memory. Very large files, especially with Compress or PDF to Images, can take longer on phones.",
  },
  {
    q: "Which browsers are supported?",
    a: "Recent versions of Chrome, Edge, Firefox and Safari on desktop and mobile. If something looks broken, update your browser first.",
  },
];

/** Three site-wide answers appended to every landing page's own FAQs. */
export const COMMON_FAQS = HOME_FAQS.filter((f) => /really private|file size limit|browsers are supported/.test(f.q));

export function landingFaqs(l: Landing) {
  return [...l.faqs, ...COMMON_FAQS];
}
