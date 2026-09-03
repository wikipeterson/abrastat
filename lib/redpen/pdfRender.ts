// Renders each page of an uploaded PDF to an ImageData at a fixed dpi (spec §03: 200dpi
// grayscale — rendered as full RGBA here since canvas doesn't do grayscale directly;
// otsu.ts's toGrayscale collapses it). Entirely client-side via pdfjs-dist, dynamically
// imported so it's only pulled into the bundle when someone actually opens Scan and grade.

export interface RenderedPage {
  page: number
  imageData: ImageData
}

export async function renderPdfPages(
  file: File,
  dpi: number,
  onProgress?: (page: number, total: number) => void,
): Promise<RenderedPage[]> {
  const pdfjsLib = await import('pdfjs-dist')
  // Served as plain static files from public/pdfjs/ (scripts/copy-pdfjs-assets.mjs, run on
  // every dev/build), not resolved via new URL(..., import.meta.url) — the worker resolves its
  // own sibling imports (codec WASM/fallbacks) at runtime relative to its own URL, which only
  // works if those siblings are actually deployed alongside it, and a bundler-processed worker
  // reference doesn't guarantee that. wasmUrl is required explicitly too: pdf.js defaults it to
  // null, which (silently) builds the broken path "null" + "jbig2_nowasm_fallback.js" instead
  // of failing loudly — that's what was corrupting scanned pages before this fix.
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'

  const data = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data, wasmUrl: '/pdfjs/' }).promise
  const scale = dpi / 72 // PDF user space is 72dpi by definition

  const pages: RenderedPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Could not get a 2D canvas context to render the PDF.')

    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    pages.push({ page: i, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) })
    onProgress?.(i, doc.numPages)
  }
  return pages
}
