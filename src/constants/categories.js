// Centralized category definitions for the app
// Used for Browse shortcuts, category picker, fuzzy matching, and profile stats

// Browse shortcuts - curated high-frequency categories for Browse page
// Note: Categories are shortcuts, NOT containers. All dishes are searchable regardless of category.
export const BROWSE_CATEGORIES = [
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'burger', label: 'Burgers', emoji: '🍔' },
  { id: 'lobster roll', label: 'Lobster Rolls', emoji: '🦞' },
  { id: 'wings', label: 'Wings', emoji: '🍗' },
  { id: 'sushi', label: 'Sushi', emoji: '🍣' },
  { id: 'breakfast', label: 'Breakfast', emoji: '🍳' },
  { id: 'seafood', label: 'Seafood', emoji: '🦐' },
  { id: 'chowder', label: 'Chowder', emoji: '🍲' },
  { id: 'pasta', label: 'Pasta', emoji: '🍝' },
  { id: 'steak', label: 'Steak', emoji: '🥩' },
  { id: 'sandwich', label: 'Sandwiches', emoji: '🥪' },
  { id: 'salad', label: 'Salads', emoji: '🥗' },
  { id: 'taco', label: 'Tacos', emoji: '🌮' },
  { id: 'tendys', label: 'Tenders', emoji: '🍗' },
  { id: 'dessert', label: 'Desserts', emoji: '🍰' },
  { id: 'ice cream', label: 'Ice Cream', emoji: '🍦' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'clams', label: 'Clams', emoji: '🐚' },
  { id: 'chicken', label: 'Chicken', emoji: '🐔' },
  { id: 'pork', label: 'Pork', emoji: '🐷' },
]

// Main categories shown in category picker (singular labels)
export const MAIN_CATEGORIES = [
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'burger', label: 'Burger', emoji: '🍔' },
  { id: 'taco', label: 'Taco', emoji: '🌮' },
  { id: 'wings', label: 'Wings', emoji: '🍗' },
  { id: 'sushi', label: 'Sushi', emoji: '🍣' },
  { id: 'breakfast', label: 'Breakfast', emoji: '🍳' },
  { id: 'lobster roll', label: 'Lobster Roll', emoji: '🦞' },
  { id: 'chowder', label: 'Chowder', emoji: '🥣' },
  { id: 'pasta', label: 'Pasta', emoji: '🍝' },
  { id: 'steak', label: 'Steak', emoji: '🥩' },
  { id: 'sandwich', label: 'Sandwich', emoji: '🥪' },
  { id: 'salad', label: 'Salad', emoji: '🥗' },
  { id: 'seafood', label: 'Seafood', emoji: '🦐' },
  { id: 'tendys', label: 'Tenders', emoji: '🍗' },
  { id: 'dessert', label: 'Dessert', emoji: '🍰' },
  { id: 'ice cream', label: 'Ice Cream', emoji: '🍦' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'clams', label: 'Clams', emoji: '🐚' },
  { id: 'chicken', label: 'Chicken', emoji: '🐔' },
  { id: 'pork', label: 'Pork', emoji: '🐷' },
]

// All categories in the system (including sub-categories)
// Used for fuzzy matching when user types custom input
export const ALL_CATEGORIES = [
  ...MAIN_CATEGORIES,
  { id: 'pokebowl', label: 'Poke Bowl', emoji: '🥗' },
  { id: 'soup', label: 'Soup', emoji: '🍜' },
  { id: 'fries', label: 'Fries', emoji: '🍟' },
  { id: 'apps', label: 'Appetizers', emoji: '🍤' },
  { id: 'fried chicken', label: 'Fried Chicken', emoji: '🍗' },
  { id: 'entree', label: 'Entree', emoji: '🍽️' },
  { id: 'donuts', label: 'Donuts', emoji: '🍩' },
  { id: 'asian', label: 'Asian', emoji: '🥢' },
  { id: 'quesadilla', label: 'Quesadilla', emoji: '🫓' },
  { id: 'breakfast sandwich', label: 'Breakfast Sandwich', emoji: '🥯' },
  { id: 'ribs', label: 'Ribs', emoji: '🍖' },
  { id: 'sides', label: 'Sides', emoji: '🥦' },
  { id: 'duck', label: 'Duck', emoji: '🦆' },
  { id: 'lamb', label: 'Lamb', emoji: '🍖' },
  { id: 'bruschetta', label: 'Bruschetta', emoji: '🍞' },
  { id: 'burrito', label: 'Burrito', emoji: '🌯' },
  { id: 'calamari', label: 'Calamari', emoji: '🦑' },
  { id: 'crab', label: 'Crab', emoji: '🦀' },
  { id: 'curry', label: 'Curry', emoji: '🍛' },
  { id: 'lobster', label: 'Lobster', emoji: '🦞' },
  { id: 'mussels', label: 'Mussels', emoji: '🐚' },
  { id: 'onion rings', label: 'Onion Rings', emoji: '🧅' },
  { id: 'pancakes', label: 'Pancakes', emoji: '🥞' },
  { id: 'scallops', label: 'Scallops', emoji: '🐚' },
  { id: 'shrimp', label: 'Shrimp', emoji: '🦐' },
  { id: 'waffles', label: 'Waffles', emoji: '🧇' },
  { id: 'wrap', label: 'Wrap', emoji: '🌯' },
  { id: 'fish-and-chips', label: 'Fish & Chips', emoji: '🐟' },
  { id: 'fish-sandwich', label: 'Fish Sandwich', emoji: '🐟' },
  { id: 'eggs-benedict', label: 'Eggs Benedict', emoji: '🍳' },
  { id: 'veggies', label: 'Veggies', emoji: '🥦' },
  { id: 'pastry', label: 'Pastry', emoji: '🥐' },
]

// Fuzzy match a search term to existing categories
// Returns matching categories sorted by relevance
export function matchCategories(searchTerm) {
  if (!searchTerm || searchTerm.trim().length < 2) return []

  const term = searchTerm.toLowerCase().trim()

  return ALL_CATEGORIES
    .map(cat => {
      const id = cat.id.toLowerCase()
      const label = cat.label.toLowerCase()

      // Exact match scores highest
      if (id === term || label === term) {
        return { ...cat, score: 100 }
      }

      // Starts with term
      if (id.startsWith(term) || label.startsWith(term)) {
        return { ...cat, score: 80 }
      }

      // Contains term
      if (id.includes(term) || label.includes(term)) {
        return { ...cat, score: 60 }
      }

      // Check for partial word matches (e.g., "acai" -> no match, but "chicken" -> "fried chicken")
      const words = [...id.split(' '), ...label.split(' ')]
      if (words.some(word => word.startsWith(term))) {
        return { ...cat, score: 40 }
      }

      return { ...cat, score: 0 }
    })
    .filter(cat => cat.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // Return top 5 matches
}

// Get category by id
export function getCategoryById(id) {
  return ALL_CATEGORIES.find(cat => cat.id.toLowerCase() === id?.toLowerCase())
}

// Get emoji for a category id
export function getCategoryEmoji(id) {
  const category = getCategoryById(id)
  return category?.emoji || '🍽️'
}

// Flat illustrated food icons — WGH Icon System v3.0
// Bold dark outlines, warm flat fills, transparent backgrounds
// See ICON-SPEC.md for the full spec
const CATEGORY_IMAGES = {
  pizza: '/categories/icons/pizza.png',
  burger: '/categories/icons/burger.png',
  wings: '/categories/icons/wings.png',
  breakfast: '/categories/icons/breakfast.png',
  'lobster roll': '/categories/icons/lobster-roll.png',
  chowder: '/categories/icons/chowder.png',
  steak: '/categories/icons/steak.png',
  sandwich: '/categories/icons/sandwich.png',
  salad: '/categories/icons/salad.png',
  taco: '/categories/icons/taco.png',
  pasta: '/categories/icons/pasta.png',
  seafood: '/categories/icons/seafood.png',
  sushi: '/categories/icons/sushi.png',
  tendys: '/categories/icons/tendys.png',
  dessert: '/categories/icons/dessert.png',
  'ice cream': '/categories/icons/ice-cream.png',
  fish: '/categories/icons/fish.png',
  clams: '/categories/icons/clams.png',
  chicken: '/categories/icons/chicken.png',
  pork: '/categories/icons/pork.png',
  'fried chicken': '/categories/icons/fried-chicken.png',
  'breakfast sandwich': '/categories/icons/breakfast-sandwich.png',
  soup: '/categories/icons/soup.png',
  fries: '/categories/icons/fries.png',
  ribs: '/categories/icons/ribs.png',
  quesadilla: '/categories/icons/quesadilla.png',
  'fish-and-chips': '/categories/icons/fish-and-chips.png',
  'fish-sandwich': '/categories/icons/fish-sandwich.png',
  'eggs-benedict': '/categories/icons/eggs-benedict.png',
  veggies: '/categories/icons/veggies.png',
  bruschetta: '/categories/icons/bruschetta.png',
  burrito: '/categories/icons/burrito.png',
  calamari: '/categories/icons/calamari.png',
  crab: '/categories/icons/crab.png',
  curry: '/categories/icons/curry.png',
  lobster: '/categories/icons/lobster.png',
  mussels: '/categories/icons/mussels.png',
  'onion rings': '/categories/icons/onion-rings.png',
  pancakes: '/categories/icons/pancakes.png',
  scallops: '/categories/icons/scallops.png',
  shrimp: '/categories/icons/shrimp.png',
  waffles: '/categories/icons/waffles.png',
  wrap: '/categories/icons/wrap.png',
  pokebowl: '/categories/icons/pokebowl.png',
  'lobster benedict': '/categories/icons/eggs-benedict.png',
}

// Dish name keyword → icon mapping
// Order matters — first match wins. More specific keywords go first.
const DISH_NAME_ICON_RULES = [
  // Specific compound terms first
  { keyword: 'lobster roll', icon: '/categories/icons/lobster-roll.png' },
  { keyword: 'lobster benedict', icon: '/categories/icons/eggs-benedict.png' },
  { keyword: 'cod and chips', icon: '/categories/icons/fish-and-chips.png' },
  { keyword: 'cod & chips', icon: '/categories/icons/fish-and-chips.png' },
  { keyword: 'filet and chips', icon: '/categories/icons/fish-and-chips.png' },
  { keyword: 'filet & chips', icon: '/categories/icons/fish-and-chips.png' },
  { keyword: 'fish and chips', icon: '/categories/icons/fish-and-chips.png' },
  { keyword: 'fish & chips', icon: '/categories/icons/fish-and-chips.png' },
  { keyword: 'fish n chips', icon: '/categories/icons/fish-and-chips.png' },
  { keyword: "fish n' chips", icon: '/categories/icons/fish-and-chips.png' },
  { keyword: "fish 'n chips", icon: '/categories/icons/fish-and-chips.png' },
  { keyword: "fish 'n' chips", icon: '/categories/icons/fish-and-chips.png' },
  { keyword: 'fish sandwich', icon: '/categories/icons/fish-sandwich.png' },
  { keyword: 'fish taco', icon: '/categories/icons/fish.png' },
  { keyword: 'breakfast sandwich', icon: '/categories/icons/breakfast-sandwich.png' },
  { keyword: 'fried chicken', icon: '/categories/icons/fried-chicken.png' },
  { keyword: 'chicken tender', icon: '/categories/icons/tendys.png' },
  { keyword: 'chicken wing', icon: '/categories/icons/wings.png' },
  { keyword: 'onion ring', icon: '/categories/icons/onion-rings.png' },
  { keyword: 'poke bowl', icon: '/categories/icons/pokebowl.png' },
  { keyword: 'rice bowl', icon: '/categories/icons/pokebowl.png' },
  { keyword: 'eggs benedict', icon: '/categories/icons/eggs-benedict.png' },
  { keyword: 'ice cream', icon: '/categories/icons/ice-cream.png' },
  // Single keywords
  { keyword: 'benedict', icon: '/categories/icons/eggs-benedict.png' },
  { keyword: 'burrito', icon: '/categories/icons/burrito.png' },
  { keyword: 'wrap', icon: '/categories/icons/wrap.png' },
  { keyword: 'taco', icon: '/categories/icons/taco.png' },
  { keyword: 'burger', icon: '/categories/icons/burger.png' },
  { keyword: 'pizza', icon: '/categories/icons/pizza.png' },
  { keyword: 'sushi', icon: '/categories/icons/sushi.png' },
  { keyword: 'maki', icon: '/categories/icons/sushi.png' },
  { keyword: 'lobster', icon: '/categories/icons/lobster.png' },
  { keyword: 'steak', icon: '/categories/icons/steak.png' },
  { keyword: 'filet', icon: '/categories/icons/steak.png' },
  { keyword: 'ribeye', icon: '/categories/icons/steak.png' },
  { keyword: 'sirloin', icon: '/categories/icons/steak.png' },
  { keyword: 'pasta', icon: '/categories/icons/pasta.png' },
  { keyword: 'spaghetti', icon: '/categories/icons/pasta.png' },
  { keyword: 'linguine', icon: '/categories/icons/pasta.png' },
  { keyword: 'fettuccine', icon: '/categories/icons/pasta.png' },
  { keyword: 'penne', icon: '/categories/icons/pasta.png' },
  { keyword: 'rigatoni', icon: '/categories/icons/pasta.png' },
  { keyword: 'ravioli', icon: '/categories/icons/pasta.png' },
  { keyword: 'sandwich', icon: '/categories/icons/sandwich.png' },
  { keyword: 'sub', icon: '/categories/icons/sandwich.png' },
  { keyword: 'wing', icon: '/categories/icons/wings.png' },
  { keyword: 'chowder', icon: '/categories/icons/chowder.png' },
  { keyword: 'salad', icon: '/categories/icons/salad.png' },
  { keyword: 'pancake', icon: '/categories/icons/pancakes.png' },
  { keyword: 'waffle', icon: '/categories/icons/waffles.png' },
  { keyword: 'french toast', icon: '/categories/icons/breakfast.png' },
  { keyword: 'omelette', icon: '/categories/icons/breakfast.png' },
  { keyword: 'omelet', icon: '/categories/icons/breakfast.png' },
  { keyword: 'nacho', icon: '/categories/icons/nachos.png' },
  { keyword: 'quesadilla', icon: '/categories/icons/quesadilla.png' },
  { keyword: 'fries', icon: '/categories/icons/fries.png' },
  { keyword: 'calamari', icon: '/categories/icons/calamari.png' },
  { keyword: 'crab', icon: '/categories/icons/crab.png' },
  { keyword: 'crab cake', icon: '/categories/icons/crab.png' },
  { keyword: 'shrimp', icon: '/categories/icons/shrimp.png' },
  { keyword: 'scallop', icon: '/categories/icons/scallops.png' },
  { keyword: 'mussel', icon: '/categories/icons/mussels.png' },
  { keyword: 'clam', icon: '/categories/icons/clams.png' },
  { keyword: 'oyster', icon: '/categories/icons/clams.png' },
  { keyword: 'fish', icon: '/categories/icons/fish.png' },
  { keyword: 'salmon', icon: '/categories/icons/fish.png' },
  { keyword: 'tuna', icon: '/categories/icons/fish.png' },
  { keyword: 'cod', icon: '/categories/icons/fish.png' },
  { keyword: 'swordfish', icon: '/categories/icons/fish.png' },
  { keyword: 'halibut', icon: '/categories/icons/fish.png' },
  { keyword: 'mahi', icon: '/categories/icons/fish.png' },
  { keyword: 'rib', icon: '/categories/icons/ribs.png' },
  { keyword: 'pork', icon: '/categories/icons/pork.png' },
  { keyword: 'chicken', icon: '/categories/icons/chicken.png' },
  { keyword: 'curry', icon: '/categories/icons/curry.png' },
  { keyword: 'soup', icon: '/categories/icons/soup.png' },
  { keyword: 'bruschetta', icon: '/categories/icons/bruschetta.png' },
  { keyword: 'muffin', icon: '/categories/icons/dessert.png' },
  { keyword: 'scone', icon: '/categories/icons/dessert.png' },
  { keyword: 'croissant', icon: '/categories/icons/dessert.png' },
  { keyword: 'cake', icon: '/categories/icons/dessert.png' },
  { keyword: 'pie', icon: '/categories/icons/dessert.png' },
  { keyword: 'brownie', icon: '/categories/icons/dessert.png' },
  { keyword: 'cookie', icon: '/categories/icons/dessert.png' },
]

// Match a dish name to an icon based on keywords
export function getDishNameIcon(dishName) {
  if (!dishName) return null
  const lower = dishName.toLowerCase()
  for (var i = 0; i < DISH_NAME_ICON_RULES.length; i++) {
    if (lower.includes(DISH_NAME_ICON_RULES[i].keyword)) {
      return DISH_NAME_ICON_RULES[i].icon + '?v=4'
    }
  }
  return null
}

// Get category image path (light mode only)
export function getCategoryNeonImage(id) {
  if (!id) return null
  var src = CATEGORY_IMAGES[id.toLowerCase()] || null
  return src ? src + '?v=4' : null
}

// Preload category images for smooth Browse page loading
export function preloadCategoryImages() {
  Object.values(CATEGORY_IMAGES).forEach(src => {
    const img = new Image()
    img.src = src
  })
}

// Category display info - used for profile stats and tier display
// Maps category id to emoji and label
export const CATEGORY_INFO = {
  'pizza': { emoji: '🍕', label: 'Pizza' },
  'burger': { emoji: '🍔', label: 'Burgers' },
  'taco': { emoji: '🌮', label: 'Tacos' },
  'wings': { emoji: '🍗', label: 'Wings' },
  'sushi': { emoji: '🍣', label: 'Sushi' },
  'sandwich': { emoji: '🥪', label: 'Sandwiches' },
  'breakfast sandwich': { emoji: '🥯', label: 'Breakfast Sandwiches' },
  'pasta': { emoji: '🍝', label: 'Pasta' },
  'pokebowl': { emoji: '🥗', label: 'Poke' },
  'lobster roll': { emoji: '🦞', label: 'Lobster Rolls' },
  'seafood': { emoji: '🦐', label: 'Seafood' },
  'chowder': { emoji: '🍲', label: 'Chowder' },
  'soup': { emoji: '🍜', label: 'Soup' },
  'breakfast': { emoji: '🍳', label: 'Breakfast' },
  'salad': { emoji: '🥗', label: 'Salads' },
  'fries': { emoji: '🍟', label: 'Fries' },
  'tendys': { emoji: '🍗', label: 'Tenders' },
  'fried chicken': { emoji: '🍗', label: 'Fried Chicken' },
  'apps': { emoji: '🧆', label: 'Apps' },
  'entree': { emoji: '🥩', label: 'Entrees' },
  'steak': { emoji: '🥩', label: 'Steak' },
  'dessert': { emoji: '🍰', label: 'Desserts' },
  'ribs': { emoji: '🍖', label: 'Ribs' },
  'sides': { emoji: '🥦', label: 'Sides' },
  'duck': { emoji: '🦆', label: 'Duck' },
  'lamb': { emoji: '🍖', label: 'Lamb' },
  'pork': { emoji: '🐷', label: 'Pork' },
  'fish': { emoji: '🐟', label: 'Fish' },
  'chicken': { emoji: '🐔', label: 'Chicken' },
  'clams': { emoji: '🐚', label: 'Clams' },
  'oysters': { emoji: '🦪', label: 'Oysters' },
  'coffee': { emoji: '☕', label: 'Coffee' },
  'cocktails': { emoji: '🍸', label: 'Cocktails' },
  'ice cream': { emoji: '🍦', label: 'Ice Cream' },
  'bruschetta': { emoji: '🍞', label: 'Bruschetta' },
  'burrito': { emoji: '🌯', label: 'Burrito' },
  'calamari': { emoji: '🦑', label: 'Calamari' },
  'crab': { emoji: '🦀', label: 'Crab' },
  'curry': { emoji: '🍛', label: 'Curry' },
  'lobster': { emoji: '🦞', label: 'Lobster' },
  'mussels': { emoji: '🐚', label: 'Mussels' },
  'onion rings': { emoji: '🧅', label: 'Onion Rings' },
  'pancakes': { emoji: '🥞', label: 'Pancakes' },
  'scallops': { emoji: '🐚', label: 'Scallops' },
  'shrimp': { emoji: '🦐', label: 'Shrimp' },
  'waffles': { emoji: '🧇', label: 'Waffles' },
  'wrap': { emoji: '🌯', label: 'Wrap' },
  'fish-and-chips': { emoji: '🐟', label: 'Fish & Chips' },
  'fish-sandwich': { emoji: '🐟', label: 'Fish Sandwich' },
  'eggs-benedict': { emoji: '🍳', label: 'Eggs Benedict' },
  'veggies': { emoji: '🥦', label: 'Veggies' },
  'pastry': { emoji: '🥐', label: 'Pastries' },
}

// Get category info with fuzzy matching
// Handles case differences and strips trailing IDs/characters
export function getCategoryInfo(category) {
  if (!category) return { emoji: '🍽️', label: 'Food' }

  // Normalize: lowercase, trim, remove trailing IDs (e.g., "_abc123")
  const normalized = category.toLowerCase().trim().replace(/_[a-z0-9]+$/i, '')

  // Direct match
  if (CATEGORY_INFO[normalized]) {
    return CATEGORY_INFO[normalized]
  }

  // Try matching just the first word for compound categories
  const firstWord = normalized.split(/[\s&,]+/)[0]
  if (CATEGORY_INFO[firstWord]) {
    return CATEGORY_INFO[firstWord]
  }

  // Fallback: capitalize the normalized category name
  const fallbackLabel = normalized
    .split(/[\s_-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return { emoji: '🍽️', label: fallbackLabel }
}


// Derived emoji lookup for playlist covers, map pins, etc. Pulls from
// BROWSE_CATEGORIES and MAIN_CATEGORIES so any new category auto-flows.
export const CATEGORY_EMOJI = Object.fromEntries([
  ...BROWSE_CATEGORIES.map(c => [c.id, c.emoji]),
  ...MAIN_CATEGORIES.map(c => [c.id, c.emoji]),
])
export const DEFAULT_CATEGORY_EMOJI = '🍽️'

export function categoryEmojiFor(categoryId) {
  if (!categoryId) return DEFAULT_CATEGORY_EMOJI
  return CATEGORY_EMOJI[categoryId] || DEFAULT_CATEGORY_EMOJI
}
