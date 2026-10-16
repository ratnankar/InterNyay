// Runs after `vite build` (see the "build" script in package.json): puts the landing page's HTML into dist/index.html.
//
// It is an extra, never a requirement: if anything here fails, the normal build in dist/ is left untouched and the build still succeeds
// (the site then works exactly as before, only search engines that skip JavaScript see less).
import { build } from 'vite'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const ssrDir = path.join(root, 'dist-ssr')
const indexFile = path.join(root, 'dist', 'index.html')
const MARK = '<div id="root"></div>'

async function main() {
  if (!existsSync(indexFile)) throw new Error('dist/index.html not found: run `vite build` first')
  const html = await readFile(indexFile, 'utf8')
  if (!html.includes(MARK)) throw new Error('dist/index.html has no empty root element (already pre-rendered?)')

  // Build the server entry (react-dom/server and react stay external, Node loads them from node_modules)
  await build({
    logLevel: 'warn',
    build: {
      ssr: 'src/entry-server.jsx',
      outDir: ssrDir,
      emptyOutDir: true,
      copyPublicDir: false,
      minify: false,
    },
  })

  const entry = path.join(ssrDir, 'entry-server.js')
  const { renderLanding } = await import(pathToFileURL(entry).href)
  const landing = renderLanding()
  if (!landing || landing.length < 500) throw new Error('the landing page rendered almost nothing')

  await writeFile(indexFile, html.replace(MARK, `<div id="root">${landing}</div>`))
  console.log(`Pre-rendered the landing page into dist/index.html (${Math.round(landing.length / 1024)} KB of HTML)`)
}

main()
  .catch(err => console.warn(`\nSkipped pre-rendering the landing page: ${err.message}\nThe normal build in dist/ is unchanged.\n`))
  .finally(() => rm(ssrDir, { recursive: true, force: true }).catch(() => {}))
