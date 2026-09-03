// RedPen's scan reader (lib/redpen/pdfRender.ts) renders uploaded PDFs client-side via
// pdfjs-dist. Its worker needs to be fetchable as a plain static file (not bundled — workers
// resolve their own sibling imports at runtime, which only works if those siblings are actually
// served alongside it), and some embedded-image codecs (JBIG2, OpenJPEG) need their WASM
// binaries + no-WASM JS fallbacks fetchable too, via an explicit `wasmUrl` passed to
// getDocument() — pdfjs-dist ships all of this in its own package, not under build/, so it has
// to be copied into public/ to be reachable at all. Without this, pdf.js silently fails to
// decode some scanned pages (an easy way to lose real answer data, not just an error message).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, 'public/pdfjs')
mkdirSync(outDir, { recursive: true })

const worker = resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
copyFileSync(worker, resolve(outDir, 'pdf.worker.min.mjs'))

const wasmDir = resolve(root, 'node_modules/pdfjs-dist/wasm')
for (const name of readdirSync(wasmDir)) {
  if (name.startsWith('LICENSE')) continue
  copyFileSync(resolve(wasmDir, name), resolve(outDir, name))
}
