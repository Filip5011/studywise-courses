// Builds the phone app (src/mobile) into out/mobile, which Capacitor wraps as
// the Android app. The desktop's main-process code (repo, course progress,
// learning) runs in the page on sql.js; the pieces that need Node or Electron
// are swapped for phone versions here.

import { resolve, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, normalizePath, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const r = (p: string) => resolve(__dirname, p)
const pkg = JSON.parse(readFileSync(r('package.json'), 'utf8')) as { version: string }

/** Desktop modules replaced by phone versions, by file. */
const SWAPS: Record<string, string> = {
  [r('src/main/db/index.ts')]: r('src/mobile/db.ts'),
  [r('src/main/ai/index.ts')]: r('src/mobile/shims/ai.ts'),
  [r('src/main/paths.ts')]: r('src/mobile/shims/paths.ts'),
  [r('src/main/files.ts')]: r('src/mobile/shims/files.ts')
}

function swapDesktopModules(): Plugin {
  return {
    name: 'studywise-mobile-swaps',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null
      const base = resolve(dirname(importer.split('?')[0]), source)
      // Forward slashes, like every other module id: otherwise the bundle gets a second copy of the module.
      for (const cand of [base, `${base}.ts`, resolve(base, 'index.ts')]) if (SWAPS[cand]) return normalizePath(SWAPS[cand])
      return null
    }
  }
}

export default defineConfig({
  root: r('src/mobile'),
  base: './',
  plugins: [swapDesktopModules(), react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: [
      { find: '@shared', replacement: r('src/shared') },
      { find: '@renderer', replacement: r('src/renderer/src') },
      { find: /^(node:)?crypto$/, replacement: r('src/mobile/shims/node-crypto.ts') },
      { find: /^(node:)?fs$/, replacement: r('src/mobile/shims/node-fs.ts') },
      { find: /^(node:)?os$/, replacement: r('src/mobile/shims/node-os.ts') },
      { find: /^(node:)?path$/, replacement: r('src/mobile/shims/node-path.ts') },
      { find: /^electron$/, replacement: r('src/mobile/shims/electron.ts') },
      { find: /^pdf-parse$/, replacement: r('src/mobile/shims/pdf-parse.ts') }
    ]
  },
  build: {
    outDir: r('out/mobile'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000
  },
  server: { port: 5199, strictPort: true }
})
