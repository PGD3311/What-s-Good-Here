import { logger } from '../../utils/logger'

// Reversibility boundary: the ONLY image renderer. Swap this module's body
// (e.g. to a DOM-snapshot impl) without touching any call site. v1 = canvas,
// chosen for robustness inside the iOS WKWebView and zero dependencies.

const SIZE = 1080

// Brand colors read from CSS vars so the card stays theme-driven (rebrand = one file).
function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
  } catch {
    return fallback
  }
}

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return
  try {
    await Promise.all([
      document.fonts.load("700 72px 'Amatic SC'"),
      document.fonts.load("800 72px 'Outfit'"),
    ])
    await document.fonts.ready
  } catch (err) {
    logger.warn('Share card font load failed; using fallback fonts:', err)
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fillTruncated(ctx, text, x, y, maxWidth) {
  let t = String(text == null ? '' : text)
  if (ctx.measureText(t).width <= maxWidth) {
    ctx.fillText(t, x, y)
    return
  }
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  ctx.fillText(t + '…', x, y)
}

/**
 * Render a 1080x1080 share card to a PNG File. Pure visual output — verified
 * manually in-browser / on-device (canvas is not implemented in jsdom).
 * @param {{title:string, byline:string, emojis?:string[], topItems?:string[], footerUrl?:string}} data
 * @returns {Promise<{file:File, blob:Blob}>}
 */
export async function renderShareCardToFile({ title, byline, emojis = [], topItems = [], footerUrl = 'wghapp.com' }) {
  await ensureFonts()

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  const bg = token('--color-bg', '#F0ECE8')
  const gold = token('--color-accent-gold', '#C48A12')
  const textPrimary = token('--color-text-primary', '#1A1A1A')
  const textSecondary = token('--color-text-secondary', '#555555')
  // Emoji-tile fills read from brand tokens (hex = off-DOM fallback only).
  const tileColors = [
    token('--color-accent-gold', '#C48A12'),
    token('--color-primary', '#E4440A'),
    token('--color-medal-bronze', '#B07340'),
    token('--color-rating', '#16A34A'),
  ]

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Wordmark: WHAT'S GOOD HERE (GOOD in gold)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = "700 56px 'Amatic SC', cursive"
  ctx.fillStyle = textSecondary
  ctx.fillText("WHAT'S ", 80, 120)
  const w1 = ctx.measureText("WHAT'S ").width
  ctx.fillStyle = gold
  ctx.fillText('GOOD', 80 + w1, 120)
  const w2 = ctx.measureText('GOOD').width
  ctx.fillStyle = textSecondary
  ctx.fillText(' HERE', 80 + w1 + w2, 120)

  // 2x2 emoji tiles
  const tile = 150
  const gap = 16
  const ox = 80
  const oy = 180
  for (let i = 0; i < 4; i++) {
    const x = ox + (i % 2) * (tile + gap)
    const y = oy + Math.floor(i / 2) * (tile + gap)
    ctx.fillStyle = tileColors[i]
    roundRect(ctx, x, y, tile, tile, 18)
    ctx.fill()
    ctx.font = '88px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emojis[i] || '🍽️', x + tile / 2, y + tile / 2 + 4)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Title
  const titleY = oy + 2 * tile + gap + 96
  ctx.fillStyle = textPrimary
  ctx.font = "800 72px 'Outfit', sans-serif"
  fillTruncated(ctx, title, 80, titleY, SIZE - 160)

  // Byline
  ctx.fillStyle = textSecondary
  ctx.font = "500 34px 'Outfit', sans-serif"
  fillTruncated(ctx, byline, 80, titleY + 52, SIZE - 160)

  // Top 3 items
  ctx.fillStyle = textPrimary
  ctx.font = "600 38px 'Outfit', sans-serif"
  let ly = titleY + 132
  for (let i = 0; i < Math.min(3, topItems.length); i++) {
    fillTruncated(ctx, '▸ ' + topItems[i], 80, ly, SIZE - 160)
    ly += 58
  }

  // Footer
  ctx.fillStyle = gold
  ctx.font = "700 32px 'Outfit', sans-serif"
  ctx.fillText(footerUrl, 80, SIZE - 72)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), 'image/png', 0.95)
  })
  const file = new File([blob], 'wgh-share.png', { type: 'image/png' })
  return { file, blob }
}
