/**
 * Renders the SVG brand sources in public/icons to the PNG sizes the PWA
 * manifest and iOS need, using a locally installed Chromium browser in
 * headless mode (no extra npm dependency).
 *
 *   node scripts/generate-icons.mjs
 *   BROWSER=/path/to/chrome node scripts/generate-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const browser = candidates.find((p) => existsSync(p))
if (!browser) throw new Error('No Chromium browser found. Set BROWSER=/path/to/chrome.')

const jobs = [
  { src: 'icons/icon.svg', out: 'icons/icon-192.png', size: 192 },
  { src: 'icons/icon.svg', out: 'icons/icon-512.png', size: 512 },
  { src: 'icons/maskable.svg', out: 'icons/maskable-512.png', size: 512 },
  { src: 'icons/maskable.svg', out: 'icons/apple-touch-icon.png', size: 180 },
]

const tmp = mkdtempSync(join(tmpdir(), 'daynest-icons-'))
try {
  for (const job of jobs) {
    // Wrap in a page with no margins so the SVG fills the viewport exactly.
    const page = join(tmp, 'page.html')
    const svgUrl = pathToFileURL(join(root, 'public', job.src)).href
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent"><img src="${svgUrl}" width="${job.size}" height="${job.size}" style="display:block"></body></html>`)
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--window-size=${job.size},${job.size}`,
      `--screenshot=${join(root, 'public', job.out)}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore' })
    console.log(`✓ ${job.out} (${job.size}×${job.size})`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
