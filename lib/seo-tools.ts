/*
 * Landing pages for the document-conversion and page-organising tools.
 * Kept in its own file so lib/seo.ts stays readable. Pure data, no imports of
 * values (only a type), so it is safe on the server.
 */
import type { Landing } from "@/lib/seo";

export const TOOLS_LANDINGS: Landing[] = [
  /* ---------------------------------------------------------------- rotate */
  {
    slug: "rotate-pdf",
    toolId: "rotate",
    initial: { mode: "rotate" },
    name: "Rotate PDF",
    title: "Rotate PDF Pages Online, Free & Private",
    description: "Rotate one page or a whole PDF by 90, 180 or 270 degrees and save it permanently. Works in your browser, nothing is uploaded.",
    keywords: ["rotate pdf", "rotate pdf pages", "rotate pdf permanently", "fix sideways pdf", "turn pdf upside down", "rotate scanned pdf"],
    h1: "Rotate PDF pages and save the result for good",
    lead: "Fix sideways or upside-down pages in a few clicks. Rotate single pages or the whole document, then download a PDF that stays rotated everywhere.",
    sections: [
      {
        h: "A permanent rotation, not just a viewer setting",
        p: [
          "Most PDF viewers let you turn a page for your own screen, but the file opens the old way next time. This tool writes the rotation into the PDF itself, so the pages are correct in every viewer, on every phone, and when printed.",
          "Each page has its own left and right buttons, and there are buttons to turn every page at once. That helps when a batch of scans came out of the feeder sideways, or when only a few landscape pages are wrong.",
        ],
      },
      {
        h: "Quality is untouched",
        p: ["Pages are not redrawn or recompressed. The tool only changes the page rotation value, so text stays selectable and images keep their quality. The file size stays almost the same."],
      },
    ],
    steps: ["Drop in your PDF.", "Use the arrows under a page, or rotate all pages at once.", "Press Rotate and download."],
    tips: ["Check each thumbnail before saving.", "Combine with Reorder PDF to fix the page order in one go.", "Run Compress PDF afterwards if the scan is large."],
    faqs: [
      { q: "Will the rotation stay when I send the PDF to someone else?", a: "Yes. The rotation is saved inside the file, so it opens the right way up in any viewer." },
      { q: "Can I rotate only some pages?", a: "Yes. Rotate individual pages with their own buttons and leave the others as they are." },
      { q: "Does rotating reduce quality?", a: "No. Pages are not re-rendered, only their rotation is changed." },
    ],
    related: ["reorder-pdf", "delete-pdf-pages", "split-pdf", "merge-pdf"],
  },

  /* --------------------------------------------------------------- reorder */
  {
    slug: "reorder-pdf",
    toolId: "reorder",
    initial: { mode: "reorder" },
    name: "Reorder PDF",
    title: "Reorder PDF Pages Online: Drag and Drop, Free",
    description: "Rearrange PDF pages by dragging thumbnails into a new order. Move, reverse and save. Private, in your browser, no upload.",
    keywords: ["reorder pdf", "rearrange pdf pages", "change page order pdf", "organize pdf", "move pages in pdf", "sort pdf pages"],
    h1: "Reorder PDF pages by dragging them into place",
    lead: "See every page as a thumbnail, drag it where it belongs and save a new PDF in the order you want. Nothing leaves your device.",
    sections: [
      {
        h: "Drag, or use the arrows",
        p: [
          "Drag any page card onto another position to move it. If you prefer buttons, or you are on a phone, every card has earlier and later arrows. Reverse order flips the whole document, which fixes scans that were fed back to front.",
          "The page number printed on each card is the original page number, so you always know where a page came from, even after several moves.",
        ],
      },
      {
        h: "Organise in one pass",
        p: ["The same screen can rotate and remove pages. Fix the order, turn a sideways page and drop a blank one, then save once. The original file is never changed."],
      },
    ],
    steps: ["Add your PDF.", "Drag pages into the order you want.", "Press Save new order and download."],
    tips: ["Use Reverse order for back-to-front scans.", "Zoom out your browser for long documents.", "Merge several files first, then reorder the combined PDF."],
    faqs: [
      { q: "Is there a limit on the number of pages?", a: "No limit from us. Very long documents take longer to show thumbnails on a phone." },
      { q: "Does reordering change the quality?", a: "No. Pages are copied as they are into a new file in the new order." },
      { q: "Can I move a page to the end?", a: "Yes. Drag it to the last position or press the later arrow repeatedly." },
    ],
    related: ["rotate-pdf", "delete-pdf-pages", "merge-pdf", "split-pdf"],
  },

  /* ---------------------------------------------------------------- delete */
  {
    slug: "delete-pdf-pages",
    toolId: "reorder",
    initial: { mode: "delete" },
    name: "Delete PDF Pages",
    title: "Delete Pages from a PDF Online, Free & Private",
    description: "Remove unwanted pages from a PDF: click the bin on each page you don't need and download the rest. No upload, no watermark.",
    keywords: ["delete pdf pages", "remove pages from pdf", "delete page from pdf", "remove blank pages pdf", "cut pages from pdf"],
    h1: "Delete pages from a PDF without uploading it",
    lead: "Spot the pages you don't need, mark them with the bin and save a clean PDF with only the pages you want to keep.",
    sections: [
      {
        h: "See before you delete",
        p: [
          "Every page is shown as a thumbnail, so you can recognise blank scans, cover sheets and duplicate pages at a glance. A removed page is greyed out and can be restored until you save.",
          "The file you download contains only the kept pages. Your original is untouched on your device.",
        ],
      },
      {
        h: "Delete, or extract?",
        p: ["If you only want to keep a few pages out of many, Split & Extract is faster: type a range like 1-3, 7. Use this page when you want to throw away a few and keep the rest."],
      },
    ],
    steps: ["Add your PDF.", "Press the bin on each unwanted page.", "Press Delete pages and download."],
    tips: ["Restore a page with the undo button.", "Delete blank scan pages to shrink the file.", "Rotate or reorder in the same session."],
    faqs: [
      { q: "Can I get a deleted page back?", a: "Before saving, yes: press the undo button. After saving, use your original file." },
      { q: "Will the other pages change?", a: "No. The remaining pages are copied exactly as they are." },
      { q: "Can I delete many pages quickly?", a: "Mark each page with the bin. For long ranges, Split & Extract with a page range is quicker." },
    ],
    related: ["split-pdf", "extract-pdf-pages", "reorder-pdf", "rotate-pdf"],
  },

  /* ------------------------------------------------------------ pdf to word */
  {
    slug: "pdf-to-word",
    toolId: "pdf-to-word",
    name: "PDF to Word",
    title: "PDF to Word Converter Online: Free, No Upload",
    description: "Convert a PDF to an editable Word .docx in your browser. Text, headings and layout are rebuilt. Private, free, no sign-up.",
    keywords: ["pdf to word", "pdf to docx", "convert pdf to word free", "pdf to word no upload", "pdf to word converter online", "edit pdf in word"],
    h1: "Convert PDF to Word (.docx) in your browser",
    lead: "Turn a PDF into an editable Word document without uploading it anywhere. Paragraphs, headings and alignment are rebuilt from the page so you can start editing right away.",
    sections: [
      {
        h: "How the conversion works",
        p: [
          "The tool reads the text of every page together with its position, size and boldness, then groups the lines into paragraphs. Larger or bold lines keep their weight, centred lines stay centred, and columns separated by wide gaps are lined up with tab stops. The result is saved as a standard .docx that opens in Word, Google Docs and LibreOffice.",
          "Because your file never leaves the browser, it is a good choice for contracts, CVs and anything private.",
        ],
      },
      {
        h: "What to expect",
        p: [
          "This is a text and layout reconstruction, not a pixel-perfect copy. Pictures and vector graphics are not copied into the Word file, and complex layouts such as multi-column magazines or tables with merged cells come out as plain paragraphs and tabs. For exact fidelity use a desktop converter; for quickly getting editable text out of a PDF this is fast and private.",
        ],
      },
    ],
    steps: ["Drop in your PDF.", "Tick OCR if the pages are scans.", "Press Convert to Word and download the .docx."],
    tips: ["Text-based PDFs convert best.", "Proofread numbers and names after conversion.", "For scans, choose the document language before running OCR."],
    faqs: [
      { q: "Are images kept in the Word file?", a: "No. Text and layout are rebuilt, but pictures and graphics are not copied over." },
      { q: "Does it work on scanned PDFs?", a: "Yes, with OCR switched on. Scanned pages are read on your device, and you should proofread the result." },
      { q: "Will the fonts match?", a: "Fonts are mapped to Arial, Times New Roman or Courier New based on the original style, so exact typefaces can differ." },
      { q: "Is my PDF uploaded?", a: "No. The conversion happens in your browser." },
    ],
    related: ["scanned-pdf-to-word", "pdf-to-excel", "pdf-to-ppt", "edit-pdf"],
  },
  {
    slug: "scanned-pdf-to-word",
    toolId: "pdf-to-word",
    name: "Scanned PDF to Word",
    title: "Scanned PDF to Word with OCR, Free & Private",
    description: "Turn a scanned PDF or photo-based PDF into editable Word text with OCR that runs in your browser. Six languages. No upload.",
    keywords: ["scanned pdf to word", "ocr pdf to word", "image pdf to word", "convert scanned pdf to editable word", "pdf scan to docx"],
    h1: "Convert a scanned PDF to editable Word text (OCR)",
    lead: "Scans are pictures of text, so a normal converter finds nothing to extract. Switch on OCR and the words are read from the page image on your device, then rebuilt as a Word file.",
    sections: [
      {
        h: "OCR in your browser",
        p: [
          "When Read scanned pages is on, only the pages without selectable text are processed, so mixed documents stay fast. The text engine runs locally and downloads its language data the first time you use a language, which can take a moment on a slow connection.",
          "English, Spanish, French, German, Italian and Portuguese are available. Pick the language of the document for the best accuracy.",
        ],
      },
      {
        h: "Get the best results",
        p: ["Straight, well-lit scans at 200 to 300 DPI give the cleanest text. Handwriting, very small print and heavy noise reduce accuracy, so always proofread the output, especially numbers, names and dates."],
      },
    ],
    steps: ["Drop in the scanned PDF.", "Turn on Read scanned pages and choose the language.", "Convert and download the Word file."],
    tips: ["Rotate sideways scans first with Rotate PDF.", "Proofread numbers and names.", "Use a clear scan: 200 to 300 DPI."],
    faqs: [
      { q: "Which languages are supported?", a: "English, Spanish, French, German, Italian and Portuguese. Right-to-left scripts are not supported yet." },
      { q: "Why is the first run slow?", a: "The OCR engine downloads language data once. After that it is cached by your browser." },
      { q: "Is the scan uploaded for OCR?", a: "No. The image is read on your device. Only the OCR engine files are downloaded from a CDN." },
    ],
    related: ["pdf-to-word", "ocr-pdf", "edit-pdf", "pdf-to-excel"],
  },

  /* ------------------------------------------------------------ word to pdf */
  {
    slug: "word-to-pdf",
    toolId: "word-to-pdf",
    name: "Word to PDF",
    title: "Word to PDF Converter Online: Free, No Upload",
    description: "Convert a Word .docx to PDF in your browser. Headings, lists, tables and pictures are kept. Free, private, no watermark.",
    keywords: ["word to pdf", "docx to pdf", "convert word to pdf free", "doc to pdf online", "word to pdf no upload", "save word as pdf"],
    h1: "Convert Word (.docx) to PDF without uploading it",
    lead: "Drop in a .docx and get a PDF with the same headings, lists, tables and pictures. The file is converted in your browser and never sent to a server.",
    sections: [
      {
        h: "What is kept",
        p: [
          "Paragraph styles, bold, italic and underline, colours, bullet and numbered lists, tables with borders, images and page size are read from the document and laid out again as PDF pages. Text wraps and justifies like the original.",
          "Because the PDF is built on your device, you can convert contracts, letters and reports that you would not want to hand to an online service.",
        ],
      },
      {
        h: "Honest limits",
        p: [
          "The PDF uses the standard PDF fonts, so characters outside Western European Latin text, such as Arabic, Urdu or Chinese, appear as question marks and the tool tells you which. Headers, footers, text boxes, footnotes and some graphics are simplified or skipped. Old .doc files are not supported; save them as .docx first.",
        ],
      },
    ],
    steps: ["Drop in your .docx file.", "Press Convert to PDF.", "Download the PDF."],
    tips: ["Save old .doc files as .docx first.", "Check the page breaks on long documents.", "Use Compress PDF if you have large images."],
    faqs: [
      { q: "Does it support .doc files?", a: "No, only .docx. Open an old .doc in Word or LibreOffice and save it as .docx." },
      { q: "Will my fonts be kept?", a: "Fonts are matched to the standard PDF fonts (Helvetica, Times, Courier). The look is close but not identical." },
      { q: "Can it convert Arabic or Urdu text?", a: "Not yet. Characters outside Western Latin text are replaced with question marks, and the tool warns you." },
    ],
    related: ["pdf-to-word", "excel-to-pdf", "merge-pdf", "compress-pdf"],
  },

  /* ----------------------------------------------------------- pdf to excel */
  {
    slug: "pdf-to-excel",
    toolId: "pdf-to-excel",
    name: "PDF to Excel",
    title: "PDF to Excel Converter Online: Tables to .xlsx, Free",
    description: "Convert PDF tables to an Excel .xlsx spreadsheet in your browser. Numbers become real numbers. Private, no upload, no sign-up.",
    keywords: ["pdf to excel", "pdf to xlsx", "convert pdf table to excel", "pdf to excel free", "extract table from pdf", "pdf to spreadsheet"],
    h1: "Convert PDF tables to Excel (.xlsx) in your browser",
    lead: "Pull the rows and columns out of a PDF into a real spreadsheet. Numbers, percentages and currency are stored as numbers so formulas work straight away.",
    sections: [
      {
        h: "How tables are found",
        p: [
          "The tool reads the position of every piece of text and groups it into rows by baseline, then into columns by the gaps between words. Values like 1,250.50, 12% or $9.99 are converted to numbers with the right format, while codes with leading zeros are kept as text.",
          "Choose one sheet per page to keep every page's columns separate, or everything on one sheet for a single long table that runs across pages.",
        ],
      },
      {
        h: "Works best on real tables",
        p: ["Statements, invoices, price lists and exported reports convert well. Tables that rely on drawn lines without clear gaps, merged cells and multi-line cells may need tidying in Excel. Scanned tables need OCR switched on and a proofread."],
      },
    ],
    steps: ["Drop in your PDF.", "Choose one sheet per page or one sheet in total.", "Convert and download the .xlsx."],
    tips: ["Use one sheet per page first.", "Check columns on the first rows.", "Turn on OCR for scanned statements."],
    faqs: [
      { q: "Are numbers real numbers in Excel?", a: "Yes. Numbers, percentages and currency amounts are saved as numeric cells." },
      { q: "Can it read scanned tables?", a: "Yes, with OCR on. Always check the numbers afterwards." },
      { q: "Why are two columns joined?", a: "If words sit very close together the tool treats them as one cell. You can split the column in Excel with Text to Columns." },
    ],
    related: ["excel-to-pdf", "pdf-to-word", "csv-to-pdf", "ocr-pdf"],
  },
  {
    slug: "excel-to-pdf",
    toolId: "excel-to-pdf",
    name: "Excel to PDF",
    title: "Excel to PDF Converter Online: Free, No Upload",
    description: "Convert an Excel .xlsx workbook to PDF in your browser. Dates, currency and bold text are kept; wide sheets are split. Private and free.",
    keywords: ["excel to pdf", "xlsx to pdf", "convert excel to pdf free", "spreadsheet to pdf", "excel to pdf no upload", "xls to pdf"],
    h1: "Convert Excel (.xlsx) to PDF, all in your browser",
    lead: "Print every sheet of a workbook to PDF without sending the numbers to anyone. Number, date and currency formatting is kept, and wide sheets are scaled or split across pages.",
    sections: [
      {
        h: "Made for readable pages",
        p: [
          "Each sheet starts on a new page with its name. Numbers, dates, percentages and currency use the cell formatting from Excel, bold text is kept, and columns are widened so values never wrap into each other. Gridlines can be switched on or off.",
          "Choose A4 or US Letter. Sheets wider than the page are scaled down to a readable size or continue on the next page.",
        ],
      },
      {
        h: "Limits",
        p: ["Charts, images inside sheets and conditional formatting are not drawn. Old .xls files are not supported, so save them as .xlsx first. The standard PDF fonts are used, so non-Latin text shows as question marks."],
      },
    ],
    steps: ["Drop in your .xlsx file.", "Choose page size and gridlines.", "Convert and download the PDF."],
    tips: ["Gridlines make dense tables easier to read.", "Hide helper columns in Excel first.", "Use CSV to PDF for plain exports."],
    faqs: [
      { q: "Does it support .xls?", a: "Only .xlsx and .csv. Save older .xls files as .xlsx first." },
      { q: "Are charts included?", a: "Not yet. Cell values and formatting are converted, but charts and pictures are not drawn." },
      { q: "Are formulas shown?", a: "The calculated values are printed, as in Excel." },
    ],
    related: ["pdf-to-excel", "csv-to-pdf", "word-to-pdf", "merge-pdf"],
  },
  {
    slug: "csv-to-pdf",
    toolId: "excel-to-pdf",
    name: "CSV to PDF",
    title: "CSV to PDF Converter Online: Free & Private",
    description: "Turn a CSV file into a neat PDF table in your browser. Choose page size and gridlines. No upload, no sign-up.",
    keywords: ["csv to pdf", "convert csv to pdf", "csv to pdf table", "csv file to pdf free", "print csv as pdf"],
    h1: "Convert a CSV file to a PDF table",
    lead: "Open any comma-separated file as a clean, paged PDF table with a bold header row and optional gridlines. The data stays on your device.",
    sections: [
      {
        h: "From raw data to a readable page",
        p: [
          "CSV files are awkward to share because everyone opens them differently. A PDF looks the same for everybody. Quoted fields, commas inside quotes and line breaks inside cells are handled, and numeric columns are aligned.",
          "Wide data is scaled or split across pages automatically so nothing is cut off.",
        ],
      },
    ],
    steps: ["Drop in your .csv file.", "Choose A4 or Letter and gridlines.", "Convert and download the PDF."],
    tips: ["Remove empty trailing columns first.", "Use Letter for US printing.", "Merge several CSV PDFs with Merge PDF."],
    faqs: [
      { q: "Which delimiters work?", a: "Commas, which is the standard CSV format." },
      { q: "Is there a row limit?", a: "No limit from us. Very large files take longer and use more memory." },
      { q: "Can I convert Excel files too?", a: "Yes, use Excel to PDF for .xlsx workbooks." },
    ],
    related: ["excel-to-pdf", "pdf-to-excel", "merge-pdf", "compress-pdf"],
  },

  /* ------------------------------------------------------------- pdf to ppt */
  {
    slug: "pdf-to-ppt",
    toolId: "pdf-to-ppt",
    name: "PDF to PowerPoint",
    title: "PDF to PowerPoint (PPT) Converter Online, Free",
    description: "Convert a PDF to a PowerPoint .pptx in your browser: pages as slides, as pictures or as editable text boxes. Private, no upload.",
    keywords: ["pdf to ppt", "pdf to powerpoint", "pdf to pptx", "convert pdf to ppt free", "pdf to slides", "pdf to powerpoint no upload"],
    h1: "Convert PDF to PowerPoint (.pptx) in your browser",
    lead: "Turn every PDF page into a slide. Keep the exact look with page pictures, or get editable text boxes at the original positions.",
    sections: [
      {
        h: "Two ways to convert",
        p: [
          "Pages as pictures puts a high-quality image of each page on its own slide, so the slide looks exactly like the PDF. It works for scans and designs, but the text cannot be edited.",
          "Editable text boxes places each line of text on the slide at its original position, size and weight, so you can change wording in PowerPoint. Photos and graphics are not included in this mode.",
        ],
      },
      {
        h: "Slide size follows the page",
        p: ["The slide size matches the first page of the PDF, so slides from a landscape presentation fill the screen and portrait documents become portrait slides."],
      },
    ],
    steps: ["Drop in your PDF.", "Choose pictures or editable text.", "Convert and download the .pptx."],
    tips: ["Use pictures for exported slides.", "Use text mode when you need to change wording.", "Combine both: keep the picture slide and copy text from the other file."],
    faqs: [
      { q: "Will it keep animations?", a: "No. A PDF does not contain animations, so none can be restored." },
      { q: "Can I edit the text?", a: "Yes, in the editable text mode. In picture mode the slide is an image." },
      { q: "Does it work for scans?", a: "Picture mode works for scans directly. For editable text from scans, turn on OCR in text mode." },
    ],
    related: ["pdf-to-word", "pdf-to-images", "pdf-to-excel", "compress-pdf"],
  },

  /* -------------------------------------------------------- python / ipynb */
  {
    slug: "python-to-pdf",
    toolId: "code-to-pdf",
    initial: { mode: "python" },
    name: "Python to PDF",
    title: "Python to PDF: Convert .py Code to PDF Online, Free",
    description: "Convert Python .py files to a PDF with syntax highlighting and line numbers in your browser. Also works for other code files. Private.",
    keywords: ["python to pdf", "py to pdf", "convert python code to pdf", "code to pdf", "python file to pdf", "source code to pdf"],
    h1: "Convert Python code to PDF with syntax highlighting",
    lead: "Hand in an assignment, share a script or archive code as a PDF. Keywords, strings, comments and numbers are coloured, and line numbers keep your pages easy to refer to.",
    sections: [
      {
        h: "Made for printing and submitting",
        p: [
          "The PDF uses a monospaced font on a light grey code block, with optional line numbers so that teachers and reviewers can say 'line 42'. Long lines wrap instead of running off the page, and you choose A4 or Letter and the font size.",
          "Other languages work too: JavaScript, TypeScript, Java, C, C++, C#, Go, Rust, SQL, shell and more get generic highlighting of strings, comments, numbers and keywords.",
        ],
      },
      {
        h: "Private by design",
        p: ["Your code is read and drawn in your browser. Nothing is uploaded, which matters for coursework and company code."],
      },
    ],
    steps: ["Drop in your .py file.", "Pick page size, font size and line numbers.", "Convert and download the PDF."],
    tips: ["Smaller fonts fit more per page.", "Turn off line numbers for clean excerpts.", "Use Merge PDF to combine several files."],
    faqs: [
      { q: "Can I convert several files at once?", a: "Convert each file, then combine the PDFs with Merge PDF." },
      { q: "Are non-English comments supported?", a: "Western European Latin characters are. Other scripts appear as question marks because only standard PDF fonts are used." },
      { q: "Is the code uploaded?", a: "No. It is processed in your browser." },
    ],
    related: ["ipynb-to-pdf", "word-to-pdf", "merge-pdf", "compress-pdf"],
  },
  {
    slug: "ipynb-to-pdf",
    toolId: "code-to-pdf",
    initial: { mode: "notebook" },
    name: "Jupyter Notebook to PDF",
    title: "Jupyter Notebook (.ipynb) to PDF Online, Free",
    description: "Convert a Jupyter .ipynb notebook to PDF in your browser, with code, markdown, outputs and charts. No nbconvert, LaTeX or upload needed.",
    keywords: ["ipynb to pdf", "jupyter notebook to pdf", "convert ipynb to pdf online", "notebook to pdf", "jupyter to pdf no latex", "colab notebook to pdf"],
    h1: "Convert a Jupyter notebook (.ipynb) to PDF online",
    lead: "No nbconvert, no LaTeX, no install. Drop the notebook and get a PDF with markdown, code cells, text outputs and embedded charts, all made on your device.",
    sections: [
      {
        h: "What ends up in the PDF",
        p: [
          "Markdown cells become headings, paragraphs and lists. Code cells are shown with the familiar In [n] label and syntax colours. Text results, print output and error messages appear below the cell, and PNG or JPEG outputs such as matplotlib charts are placed in the page.",
          "You can hide the code and print only the narrative and results, or hide outputs and print only the code.",
        ],
      },
      {
        h: "Works with Colab downloads too",
        p: ["Download your notebook as .ipynb from Jupyter, JupyterLab, VS Code or Google Colab and drop it in. Interactive widgets, HTML tables and LaTeX equations are not rendered; their plain-text fallback is shown when the notebook contains one."],
      },
    ],
    steps: ["Drop in the .ipynb file.", "Choose to include code and outputs.", "Convert and download the PDF."],
    tips: ["Run all cells before downloading so outputs are saved.", "Hide code for reports.", "Use Compress PDF if charts make it large."],
    faqs: [
      { q: "Do I need LaTeX or nbconvert?", a: "No. The conversion is done in your browser." },
      { q: "Are charts included?", a: "Yes, when the notebook stores them as PNG or JPEG images, which is the default for matplotlib." },
      { q: "Are HTML tables and equations shown?", a: "Not as rendered output. The plain text version of the output is used when available." },
    ],
    related: ["python-to-pdf", "word-to-pdf", "merge-pdf", "compress-pdf"],
  },
];
