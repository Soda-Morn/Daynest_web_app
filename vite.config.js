/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = fileURLToPath(new URL('.', import.meta.url))

/** Files from public/ that belong in the offline precache. */
function publicFiles() {
  const dir = join(root, 'public')
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (!name.endsWith('.svg') || name === 'favicon.svg') out.push(p)
    }
  }
  walk(dir)
  return out
}

/**
 * Generates /sw.js at build time from src/pwa/service-worker.js, injecting
 * the exact list of emitted files and a content hash as the cache version.
 * Any change to code, styles, fonts or icons produces a new version, which
 * triggers the in-app "update available" flow and old-cache cleanup.
 */
function daynestServiceWorker() {
  return {
    name: 'daynest-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256')
      const urls = new Set(['/', '/index.html'])
      for (const [fileName, item] of Object.entries(bundle)) {
        if (fileName.endsWith('.map')) continue
        // Only the Latin font subsets are precached; extended/Vietnamese
        // subsets are cached the first time a page actually needs them.
        if (fileName.endsWith('.woff2') && !/-latin-(?:wght|opsz)-/.test(fileName)) continue
        urls.add('/' + fileName)
        hash.update(fileName)
        hash.update(item.type === 'chunk' ? item.code : item.source)
      }
      for (const file of publicFiles()) {
        const url = '/' + relative(join(root, 'public'), file).split('\\').join('/')
        urls.add(url)
        hash.update(url)
        hash.update(readFileSync(file))
      }
      urls.delete('/')
      const template = readFileSync(join(root, 'src/pwa/service-worker.js'), 'utf8')
      hash.update(template) // worker logic changes must also rotate the cache
      const version = hash.digest('hex').slice(0, 12)
      const source = template
        .replace("const VERSION = '__DAYNEST_VERSION__'", `const VERSION = ${JSON.stringify(version)}`)
        .replace('const PRECACHE = __DAYNEST_PRECACHE__', `const PRECACHE = ${JSON.stringify([...urls].sort())}`)
      if (/^const (VERSION|PRECACHE) = (?:'__|__)/m.test(source)) this.error('Service worker placeholders were not replaced')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [vue(), daynestServiceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5181, strictPort: true },
  preview: { port: 4181, strictPort: true },
  build: { target: 'es2022' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
})
