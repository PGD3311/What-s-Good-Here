import { TAG_SYNONYMS } from '../constants/tags'

/**
 * Client-side dish search — pure function, no side effects.
 * Replaces the 4-level Supabase API fallback ladder with instant local filtering.
 *
 * @param {Array} dishes - Cached array of dish objects
 * @param {string} query - User search query
 * @param {Object} [options] - Optional filters
 * @param {number} [options.limit=10] - Max results to return
 * @returns {Array} Matching dishes in output shape, sorted by relevance then rating
 */

const STOP_WORDS = new Set([
  'food', 'foods', 'the', 'a', 'an', 'and', 'or', 'for', 'of', 'at', 'to',
  'on', 'best', 'good', 'great', 'near', 'me', 'find', 'get', 'want',
  'looking', 'something', 'whats', "what's", 'is', 'some',
])

const MISSPELLINGS = {
  'indiana': 'indian',
  'indain': 'indian',
  'italien': 'italian',
  'italain': 'italian',
  'mexcian': 'mexican',
  'maxican': 'mexican',
  'chineese': 'chinese',
  'chinease': 'chinese',
  'japaneese': 'japanese',
  'japenese': 'japanese',
  'thia': 'thai',
  'tai': 'thai',
  'ceasar': 'caesar',
  'ceaser': 'caesar',
}

function normalizeToken(token) {
  const lower = token.toLowerCase().trim()
  return MISSPELLINGS[lower] || lower
}

function tokenize(query) {
  if (!query || typeof query !== 'string') return []
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(normalizeToken)
    .filter(t => t.length > 0 && !STOP_WORDS.has(t))
}

function expandTokenTags(tokens) {
  const tagIds = new Set()
  for (let i = 0; i < tokens.length; i++) {
    const synonyms = TAG_SYNONYMS[tokens[i]]
    if (synonyms) {
      for (let j = 0; j < synonyms.length; j++) {
        tagIds.add(synonyms[j])
      }
    }
  }
  return tagIds
}

function scoreDish(dish, tokens, normalizedPhrase, expandedTags) {
  const dishName = (dish.name || '').toLowerCase()
  const dishCategory = (dish.category || '').toLowerCase()
  const dishCuisine = (dish.restaurant_cuisine || '').toLowerCase()
  const dishRestaurant = (dish.restaurant_name || '').toLowerCase()
  const dishDescription = (dish.description || '').toLowerCase()
  const dishTags = dish.tags || []

  // Exact phrase in name: 100
  if (tokens.length > 1 && dishName.includes(normalizedPhrase)) {
    return 100
  }

  // All tokens in name: 80
  const allInName = tokens.every(t => dishName.includes(t))
  if (allInName && tokens.length > 0) {
    return 80
  }

  // All tokens match restaurant name: 70 — searching "Right Fork" surfaces
  // all dishes from The Right Fork. Lower than dish-name match so direct
  // hits rank first, but high enough to beat category/tag matches.
  if (dishRestaurant && tokens.every(t => dishRestaurant.includes(t)) && tokens.length > 0) {
    return 70
  }

  // All tokens across name + category: 60
  const allInNameOrCategory = tokens.every(
    t => dishName.includes(t) || dishCategory.includes(t)
  )
  if (allInNameOrCategory && tokens.length > 0) {
    return 60
  }

  // All tokens match restaurant cuisine: 50
  if (dishCuisine && tokens.every(t => dishCuisine.includes(t)) && tokens.length > 0) {
    return 50
  }

  // Description match (ingredient): 45
  // Single token → substring contains. Multi-token → require the joined
  // phrase as a substring so "fried chicken" doesn't match a description
  // like "fried tofu, chicken broth" where both tokens appear but unrelated.
  // Ranked below name+category (60) so direct identifiers win, above
  // tag-synonym (40) since ingredient matches are a more specific signal.
  if (dishDescription && tokens.length > 0) {
    const phraseHit = tokens.length === 1
      ? dishDescription.includes(tokens[0])
      : dishDescription.includes(normalizedPhrase)
    if (phraseHit) return 45
  }

  // Tag overlap with synonym expansion: 40
  // For multi-word queries, also require at least one token in name or category
  const dishTagSet = new Set(dishTags.map(t => (typeof t === 'string' ? t.toLowerCase() : '')))
  if (expandedTags.size > 0) {
    let overlap = 0
    expandedTags.forEach(tag => {
      if (dishTagSet.has(tag)) overlap++
    })
    if (overlap > 0) {
      if (tokens.length > 1) {
        // Multi-word: need at least one token in name or category too
        const anyInNameOrCat = tokens.some(
          t => dishName.includes(t) || dishCategory.includes(t)
        )
        if (anyInNameOrCat) return 40
      } else {
        return 40
      }
    }
  }

  // Direct tag match (token matches a tag ID on the dish): 35
  if (tokens.some(t => dishTagSet.has(t))) {
    return 35
  }

  // Single token partial match on name: 20
  if (tokens.length === 1 && dishName.includes(tokens[0])) {
    return 20
  }

  return 0
}

function toOutputShape(dish) {
  return {
    dish_id: dish.id,
    dish_name: dish.name,
    category: dish.category,
    tags: dish.tags || [],
    photo_url: dish.photo_url || null,
    price: dish.price ?? null,
    value_score: dish.value_score ?? null,
    value_percentile: dish.value_percentile ?? null,
    total_votes: dish.total_votes ?? 0,
    avg_rating: dish.avg_rating ?? 0,
    restaurant_id: dish.restaurant_id,
    restaurant_name: dish.restaurant_name,
    restaurant_cuisine: dish.restaurant_cuisine || null,
    restaurant_town: dish.restaurant_town || null,
    restaurant_lat: dish.restaurant_lat ?? null,
    restaurant_lng: dish.restaurant_lng ?? null,
    restaurant_is_open: dish.restaurant_is_open ?? true,
  }
}

export function searchDishes(dishes, query, options = {}) {
  if (!dishes || !Array.isArray(dishes)) return []

  const tokens = tokenize(query)
  if (tokens.length === 0) return []

  const limit = options.limit ?? 10
  const normalizedPhrase = tokens.join(' ')
  const expandedTags = expandTokenTags(tokens)

  const scored = []

  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i]

    // Skip closed restaurants
    if (dish.restaurant_is_open === false) continue

    const score = scoreDish(dish, tokens, normalizedPhrase, expandedTags)
    if (score > 0) {
      scored.push({ dish, score })
    }
  }

  // Sort: score desc, then avg_rating desc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.dish.avg_rating || 0) - (a.dish.avg_rating || 0)
  })

  return scored.slice(0, limit).map(s => toOutputShape(s.dish))
}
