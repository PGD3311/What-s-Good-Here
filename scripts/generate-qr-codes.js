// Generates WGH-branded QR codes for marketing — wghapp.com URL, coral/cream
// palette, wgh wordmark embedded in the center. Outputs SVG variants to
// marketing/qr-codes/. PNG versions can be rendered from the SVGs via
// `qlmanage -t -s 2000 -o <dir> <svg>` (macOS) or any SVG-to-PNG tool.
//
// Usage: `npm run gen:qr` from the repo root.

import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(PROJECT_ROOT, 'marketing', 'qr-codes')
const ICON_PATH = path.join(PROJECT_ROOT, 'public', 'wgh-icon.png')

fs.mkdirSync(OUT_DIR, { recursive: true })

const iconBase64 = fs.readFileSync(ICON_PATH).toString('base64')
const iconDataUri = `data:image/png;base64,${iconBase64}`

// Brand tokens (from CLAUDE.md §4.7)
const CORAL = '#E4440A'   // --color-primary
const STONE = '#F0ECE8'   // --color-bg (warm stone)
const CREAM = '#F7F4F1'   // --color-surface
const DARK = '#1A1A1A'    // --color-text-primary

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Greedy word-wrap: pack words onto a line until they'd exceed maxChars,
// then start a new line. Caps at 2 lines for a clean two-deck caption.
function wrapCaption(text, maxChars) {
  const words = text.split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

async function makeQR({ url, filename, fg, bg, label, iconBg }) {
  // High error correction (~30%) lets us safely overlay the wgh mark
  // without breaking scannability. Margin 2 keeps the quiet zone tight.
  const baseSvg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    color: { dark: fg, light: bg },
    margin: 2,
  })

  // qrcode emits <svg ... viewBox="0 0 N N"> where N = module count + 2*margin.
  // Parse N so we can place the centered logo in viewBox units.
  const viewBoxMatch = baseSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
  if (!viewBoxMatch) {
    throw new Error('Could not parse viewBox from generated QR SVG')
  }
  const size = parseFloat(viewBoxMatch[1])

  const iconSize = size * 0.22
  const iconPos = (size - iconSize) / 2
  const pad = size * 0.012
  const radius = iconSize * 0.18
  const iconBgColor = iconBg || bg

  const overlay = `
  <rect x="${iconPos - pad}" y="${iconPos - pad}" width="${iconSize + pad * 2}" height="${iconSize + pad * 2}" rx="${radius}" ry="${radius}" fill="${iconBgColor}"/>
  <image href="${iconDataUri}" x="${iconPos}" y="${iconPos}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet"/>`

  let final = baseSvg.replace('</svg>', overlay + '\n</svg>')

  // Optional label below the QR (caption). Embeds an Outfit fallback so it
  // renders even without the webfont loaded. Long captions wrap to two lines
  // at the midpoint word break — single-line text wider than the QR gets
  // clipped by the viewBox.
  if (label) {
    const lines = wrapCaption(label, 22)
    const lineHeight = size * 0.085
    const labelHeight = size * 0.07 + lines.length * lineHeight + size * 0.04
    const newHeight = size + labelHeight
    final = final.replace(
      /viewBox="0 0 ([\d.]+) ([\d.]+)"/,
      `viewBox="0 0 ${size} ${newHeight}"`
    )
    final = final.replace(
      /<path fill="([^"]*)" d="M0 0h([\d.]+)v([\d.]+)H0z"\s*\/>/,
      `<path fill="$1" d="M0 0h${size}v${newHeight}H0z"/>`
    )
    const fontSize = lineHeight * 0.78
    const textTop = size + size * 0.07 + lineHeight * 0.78
    const tspans = lines.map((line, i) =>
      `<tspan x="${size / 2}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    ).join('')
    final = final.replace(
      '</svg>',
      `<text x="${size / 2}" y="${textTop}" text-anchor="middle" font-family="Outfit, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="${fg}">${tspans}</text>\n</svg>`
    )
  }

  fs.writeFileSync(path.join(OUT_DIR, filename), final)
}

const CAPTION = 'Scan here to find What’s Good Here on MV'

async function main() {

  // 1. Light: cream background, coral modules. Elegant. Business cards, menu inserts.
  await makeQR({
    url: 'https://wghapp.com',
    filename: 'wgh-qr-light.svg',
    fg: CORAL,
    bg: STONE,
  })

  // 2. Dark: coral background, near-black modules with cream icon plate.
  //    Bold. Stickers, posters, ferry placards.
  await makeQR({
    url: 'https://wghapp.com',
    filename: 'wgh-qr-dark.svg',
    fg: DARK,
    bg: CORAL,
    iconBg: CREAM,
  })

  // 3. Light + caption — same elegance, explicit prompt for first-time scanners.
  await makeQR({
    url: 'https://wghapp.com',
    filename: 'wgh-qr-light-captioned.svg',
    fg: CORAL,
    bg: STONE,
    label: CAPTION,
  })

  // 4. Dark + caption — bold placements with prompt.
  await makeQR({
    url: 'https://wghapp.com',
    filename: 'wgh-qr-dark-captioned.svg',
    fg: DARK,
    bg: CORAL,
    iconBg: CREAM,
    label: CAPTION,
  })

  console.log('Generated QR codes in:', OUT_DIR)
  fs.readdirSync(OUT_DIR).forEach(f => {
    const stats = fs.statSync(path.join(OUT_DIR, f))
    console.log(`  ${f}  (${(stats.size / 1024).toFixed(1)} KB)`)
  })
}

main().catch(err => {
  console.error(err)
  throw err
})
