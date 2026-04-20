// WGH Icon System v2.0 — Flat vector food icons
// Consistent outline weight, flat color fills, transparent backgrounds
// See ICON-SPEC.md for the full system spec
import { getDishNameIcon as getDishNameIconFn } from '../../constants/categories'

const categoryIcons = {
  // === BROWSE CATEGORIES (19 of 23 have icons) ===
  pizza: '/categories/icons/pizza.png',
  burger: '/categories/icons/burger.png',
  wings: '/categories/icons/wings.png',
  breakfast: '/categories/icons/breakfast.png',
  'lobster roll': '/categories/icons/lobster-roll.png',  chowder: '/categories/icons/chowder.png',
  steak: '/categories/icons/steak.png',
  sandwich: '/categories/icons/sandwich.png',
  salad: '/categories/icons/salad.png',
  taco: '/categories/icons/taco.png',
  pasta: '/categories/icons/pasta.png',
  seafood: '/categories/icons/seafood.png',
  sushi: '/categories/icons/sushi.png',             // salmon pink tones, not straight coral
  tendys: '/categories/icons/tendys.png',
  dessert: '/categories/icons/dessert.png',         // cake layers have orange variation
  fish: '/categories/icons/fish.png',
  clams: '/categories/icons/clams.png',             // basket has yellow-orange hatching
  chicken: '/categories/icons/chicken.png',
  pork: '/categories/icons/pork.png',
  'ice cream': '/categories/icons/ice-cream.png',
  // Missing poster icons: oysters, coffee, cocktails (use SVG fallback)

  // === SUB-CATEGORIES ===
  'fried chicken': '/categories/icons/fried-chicken.png', // grittier texture, slightly off-coral
  'breakfast sandwich': '/categories/icons/breakfast-sandwich.png', // egg yolk is yellow-orange
  soup: '/categories/icons/soup.png',
  fries: '/categories/icons/fries.png',
  ribs: '/categories/icons/ribs.png',               // coleslaw has green/yellow tones
  quesadilla: '/categories/icons/quesadilla.png',   // mostly cream/tan, minimal coral
  bruschetta: '/categories/icons/bruschetta.png',    // bread is yellow-orange
  burrito: '/categories/icons/burrito.png',          // mostly black/white, coral only in filling
  calamari: '/categories/icons/calamari.png',
  crab: '/categories/icons/crab.png',
  curry: '/categories/icons/curry.png',
  'eggs-benedict': '/categories/icons/eggs-benedict.png', // english muffin is tan/cream
  'fish-and-chips': '/categories/icons/fish-and-chips.png',
  'fish-sandwich': '/categories/icons/fish-sandwich.png', // grittier texture, slightly off-coral
  lobster: '/categories/icons/lobster.png',          // more orange than coral
  mussels: '/categories/icons/mussels.png',          // bowl is bright orange, not coral
  'onion rings': '/categories/icons/onion-rings.png',
  pancakes: '/categories/icons/pancakes.png',
  scallops: '/categories/icons/scallops.png',
  shrimp: '/categories/icons/shrimp.png',
  veggies: '/categories/icons/veggies.png',
  waffles: '/categories/icons/waffles.png',
  wrap: '/categories/icons/wrap.png',                // mostly cream/white, coral only in spots
}

// Inline SVG fallbacks — only for categories with NO poster icon
const svgFallbacks = {}

// Default icon for unknown categories
const defaultIcon = (
  <path d="M24 6C14 6 6 14 6 24s8 18 18 18 18-8 18-18S34 6 24 6zm-2 10h4v2h4v4h-4v2h-4v-2h-4v-4h4v-2zm-2 14h8v4h-8v-4z" />
)

/**
 * CategoryIcon — renders a coral flat food icon
 * Uses webp coral icons when available, falls back to inline SVG
 * @param {string} categoryId - category key (e.g. 'pizza', 'burger')
 * @param {string} dishName - optional dish name (unused for now, kept for API compat)
 * @param {number} size - icon size in px (default 32)
 * @param {string} color - fill color for SVG fallback (default 'currentColor')
 */
export function CategoryIcon({ categoryId, dishName, size = 32, color = 'currentColor' }) {
  var key = categoryId?.toLowerCase()
  // Try dish-name-specific icon first, then category icon
  var iconSrc = getDishNameIconFn(dishName) || categoryIcons[key]

  // Prefer webp/image icon when available
  if (iconSrc) {
    return (
      <img
        src={iconSrc + (iconSrc.includes('?') ? '' : '?v=4')}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }}
        aria-hidden="true"
        onError={function (e) { e.target.style.display = 'none' }}
      />
    )
  }

  // Fall back to inline SVG
  var icon = svgFallbacks[key] || defaultIcon
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill={color}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {icon}
    </svg>
  )
}

/**
 * Check if a category has an icon (webp or SVG)
 */
export function hasCategoryIcon(categoryId) {
  const key = categoryId?.toLowerCase()
  return !!(categoryIcons[key] || svgFallbacks[key])
}

/**
 * Get icon image path for a category.
 * Used by Leaflet map pins (raw HTML, not React).
 * Returns webp path if available, null otherwise.
 */
export function getCategoryIconSrc(categoryId) {
  var key = categoryId ? categoryId.toLowerCase() : ''
  var src = categoryIcons[key] || null
  return src ? src + '?v=4' : null
}

// Keep old name for backwards compatibility with RestaurantMap
export var getPosterIconSrc = getCategoryIconSrc
