/**
 * Search Suggestions - Contextual recommendations when no results found
 *
 * Maps search terms to related suggestions that exist in our database.
 * Suggestions should be things we actually have data for.
 */

// Related terms mapping - lowercase keys
const RELATED_TERMS = {
  // Asian cuisines
  ramen: ['chowder', 'soup', 'pho', 'noodles'],
  pho: ['chowder', 'soup', 'ramen', 'noodles'],
  noodles: ['pasta', 'ramen', 'pho'],
  thai: ['curry', 'noodles', 'rice'],
  chinese: ['noodles', 'rice', 'dumplings'],
  japanese: ['sushi', 'ramen', 'teriyaki'],
  korean: ['bbq', 'rice', 'tacos'],
  vietnamese: ['pho', 'banh mi', 'sandwiches'],

  // Soups & warm dishes
  soup: ['chowder', 'stew', 'ramen'],
  stew: ['chowder', 'soup', 'pot pie'],
  bisque: ['chowder', 'soup', 'lobster roll'],

  // Mexican & Latin
  burrito: ['tacos', 'quesadilla', 'bowl'],
  enchilada: ['tacos', 'burrito', 'quesadilla'],
  nachos: ['tacos', 'quesadilla', 'appetizers'],
  guac: ['tacos', 'nachos', 'appetizers'],

  // Italian
  lasagna: ['pasta', 'italian', 'pizza'],
  ravioli: ['pasta', 'italian'],
  gnocchi: ['pasta', 'italian'],
  risotto: ['pasta', 'italian', 'rice'],

  // Proteins
  chicken: ['wings', 'tendys', 'sandwich'],
  beef: ['steak', 'burgers', 'tacos'],
  pork: ['bbq', 'sandwich', 'tacos'],
  lamb: ['burgers', 'steak', 'gyro'],
  fish: ['seafood', 'fish and chips', 'tacos'],
  shrimp: ['seafood', 'tacos', 'pasta'],
  crab: ['seafood', 'lobster roll', 'crab cakes'],
  scallops: ['seafood', 'pasta'],

  // Breakfast items
  eggs: ['breakfast', 'omelette', 'benedict'],
  pancakes: ['breakfast', 'french toast', 'waffles'],
  waffles: ['breakfast', 'pancakes', 'french toast'],
  omelette: ['breakfast', 'eggs', 'benedict'],
  bacon: ['breakfast', 'burgers', 'sandwich'],

  // Sandwiches & handhelds
  sub: ['sandwiches', 'hoagie', 'wrap'],
  hoagie: ['sandwiches', 'sub', 'wrap'],
  wrap: ['sandwiches', 'burrito', 'salads'],
  gyro: ['sandwiches', 'wrap', 'lamb'],

  // Snacks & sides
  fries: ['appetizers', 'burgers', 'wings'],
  'onion rings': ['appetizers', 'fries', 'burgers'],
  'mozzarella sticks': ['appetizers', 'fries'],

  // Desserts
  'ice cream': ['dessert', 'sundae', 'milkshake'],
  cake: ['dessert', 'pie', 'cheesecake'],
  pie: ['dessert', 'cake', 'cheesecake'],
  brownie: ['dessert', 'cake', 'ice cream'],

  // Drinks
  coffee: ['breakfast', 'cafe', 'espresso'],
  smoothie: ['acai', 'juice', 'breakfast'],
  cocktail: ['cocktails', 'bar', 'martini'],

  // Catch-all cuisine types
  indian: ['curry', 'naan', 'rice'],
  greek: ['gyro', 'salads', 'lamb'],
  mediterranean: ['salads', 'gyro', 'hummus'],
  bbq: ['ribs', 'brisket', 'pulled pork'],

  // Common misspellings & variations
  ceasar: ['salads', 'caesar', 'chicken'],
  cesar: ['salads', 'caesar', 'chicken'],
  philly: ['cheesesteak', 'sandwiches', 'steak'],
  cheesesteak: ['sandwiches', 'steak', 'philly'],
}

// Default suggestions when we can't find anything related
const DEFAULT_SUGGESTIONS = ['pizza', 'burgers', 'seafood', 'tacos']

/**
 * Get related search suggestions based on a search term
 * @param {string} searchTerm - The term the user searched for
 * @returns {string[]} - Array of 3-4 related suggestions
 */
export function getRelatedSuggestions(searchTerm) {
  if (!searchTerm) return DEFAULT_SUGGESTIONS

  const term = searchTerm.toLowerCase().trim()

  // Direct match
  if (RELATED_TERMS[term]) {
    return RELATED_TERMS[term].slice(0, 4)
  }

  // Partial match - check if search term contains or is contained by any key
  for (const [key, suggestions] of Object.entries(RELATED_TERMS)) {
    if (term.includes(key) || key.includes(term)) {
      return suggestions.slice(0, 4)
    }
  }

  // No match - return defaults
  return DEFAULT_SUGGESTIONS
}

/**
 * Check if we have related suggestions for a term
 * @param {string} searchTerm
 * @returns {boolean}
 */
export function hasRelatedSuggestions(searchTerm) {
  if (!searchTerm) return false
  const term = searchTerm.toLowerCase().trim()

  if (RELATED_TERMS[term]) return true

  for (const key of Object.keys(RELATED_TERMS)) {
    if (term.includes(key) || key.includes(term)) {
      return true
    }
  }

  return false
}
