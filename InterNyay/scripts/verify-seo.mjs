import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const dist = path.join(process.cwd(), 'dist')
const env = Object.fromEntries(
  (existsSync('.env') ? await readFile('.env', 'utf8') : '')
    .split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].replace(/^["']|["']$/g, '')])
)
const siteUrl = (process.env.VITE_SITE_URL || env.VITE_SITE_URL || '').replace(/\/+$/, '')
const failures = []

const html = await readFile(path.join(dist, 'index.html'), 'utf8')
if (html.includes('__SITE_URL__')) failures.push('index.html still contains the __SITE_URL__ placeholder')
if (!/<div id="root">\s*<[^>]+>/.test(html)) failures.push('the landing page was not pre-rendered into index.html')
if (!/<h1[\s>]/.test(html)) failures.push('index.html has no h1 in the pre-rendered content')
if (siteUrl && !html.includes(`<link rel="canonical" href="${siteUrl}/"`)) failures.push(`canonical link is not ${siteUrl}/`)
if (!/<meta name="description" content="[^"]{50,}"/.test(html)) failures.push('meta description is missing or too short')

const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
if (!ld.length) failures.push('no JSON-LD block found')
for (const [, body] of ld) {
  try { JSON.parse(body) } catch { failures.push('a JSON-LD block is not valid JSON') }
}

for (const file of ['robots.txt', 'sitemap.xml', '404.html']) {
  if (!existsSync(path.join(dist, file))) failures.push(`dist/${file} is missing`)
}
if (existsSync(path.join(dist, 'robots.txt'))) {
  const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8')
  if (!/^Sitemap:\s*https:\/\//m.test(robots)) failures.push('robots.txt has no https Sitemap line')
}

if (failures.length) {
  console.error('\nSEO check failed:\n' + failures.map(f => `  - ${f}`).join('\n') + '\n')
  process.exit(1)
}
console.log('SEO check passed: pre-rendered landing page, canonical, JSON-LD, robots.txt and sitemap.xml are in place')
