import { describe, it, expect } from 'vitest'
import { searchDishes } from './dishSearch'

const makeDish = (overrides = {}) => ({
  id: overrides.id || 'dish-1',
  name: overrides.name || 'Lobster Roll',
  category: overrides.category || 'lobster roll',
  tags: overrides.tags || [],
  description: 'description' in overrides ? overrides.description : null,
  avg_rating: overrides.avg_rating ?? 8.5,
  total_votes: overrides.total_votes ?? 10,
  price: overrides.price ?? 18,
  photo_url: overrides.photo_url || null,
  value_score: overrides.value_score || null,
  value_percentile: overrides.value_percentile || null,
  restaurant_id: overrides.restaurant_id || 'rest-1',
  restaurant_name: overrides.restaurant_name || "Nancy's",
  restaurant_cuisine: overrides.restaurant_cuisine || 'Seafood',
  restaurant_town: overrides.restaurant_town || 'Oak Bluffs',
  restaurant_is_open: overrides.restaurant_is_open ?? true,
  restaurant_lat: overrides.restaurant_lat || 41.45,
  restaurant_lng: overrides.restaurant_lng || -70.56,
})

const DISHES = [
  makeDish({
    id: 'dish-1',
    name: 'Lobster Roll',
    category: 'lobster roll',
    tags: ['fresh', 'local-catch'],
    avg_rating: 9.2,
    total_votes: 45,
    price: 28,
    restaurant_name: "Nancy's",
    restaurant_town: 'Oak Bluffs',
  }),
  makeDish({
    id: 'dish-2',
    name: 'Margherita Pizza',
    category: 'pizza',
    tags: ['savory', 'shareable'],
    avg_rating: 8.8,
    total_votes: 30,
    price: 16,
    restaurant_id: 'rest-2',
    restaurant_name: 'Offshore Ale',
    restaurant_town: 'Oak Bluffs',
  }),
  makeDish({
    id: 'dish-3',
    name: 'Fried Chicken Sandwich',
    category: 'sandwich',
    tags: ['crispy', 'fried', 'handheld'],
    avg_rating: 8.5,
    total_votes: 22,
    price: 14,
    restaurant_id: 'rest-3',
    restaurant_name: 'Back Door Donuts',
    restaurant_town: 'Oak Bluffs',
  }),
  makeDish({
    id: 'dish-4',
    name: 'Poke Bowl',
    category: 'salad',
    tags: ['fresh', 'light', 'healthy'],
    avg_rating: 8.0,
    total_votes: 15,
    price: 20,
    restaurant_id: 'rest-4',
    restaurant_name: 'Net Result',
    restaurant_town: 'Vineyard Haven',
  }),
  makeDish({
    id: 'dish-5',
    name: 'Fish Tacos',
    category: 'taco',
    tags: ['fresh', 'handheld', 'local-catch'],
    avg_rating: 8.3,
    total_votes: 28,
    price: 15,
    restaurant_id: 'rest-5',
    restaurant_name: 'Lookout Tavern',
    restaurant_town: 'Oak Bluffs',
  }),
  makeDish({
    id: 'dish-6',
    name: 'Caesar Salad',
    category: 'salad',
    tags: ['fresh', 'light'],
    avg_rating: 7.5,
    total_votes: 12,
    price: 12,
    restaurant_id: 'rest-6',
    restaurant_name: 'Alchemy',
    restaurant_town: 'Edgartown',
  }),
  makeDish({
    id: 'dish-7',
    name: 'BBQ Ribs',
    category: 'steak',
    tags: ['smoky', 'grilled', 'comfort'],
    avg_rating: 9.0,
    total_votes: 35,
    price: 26,
    restaurant_id: 'rest-7',
    restaurant_name: 'Smoke House',
    restaurant_town: 'Vineyard Haven',
  }),
  makeDish({
    id: 'dish-8',
    name: 'Clam Chowder',
    category: 'chowder',
    tags: ['comfort', 'rich', 'local-catch'],
    avg_rating: 9.1,
    total_votes: 40,
    price: 10,
    restaurant_id: 'rest-8',
    restaurant_name: 'Art Cliff Diner',
    restaurant_town: 'Vineyard Haven',
  }),
  makeDish({
    id: 'dish-9',
    name: 'Pepperoni Pizza',
    category: 'pizza',
    tags: ['savory', 'shareable', 'comfort'],
    avg_rating: 7.8,
    total_votes: 18,
    price: 18,
    restaurant_id: 'rest-9',
    restaurant_name: 'Giordano\'s',
    restaurant_town: 'Oak Bluffs',
  }),
  makeDish({
    id: 'dish-10',
    name: 'Grilled Swordfish',
    category: 'fish',
    tags: ['grilled', 'fresh', 'local-catch'],
    avg_rating: 8.7,
    total_votes: 25,
    price: 32,
    restaurant_id: 'rest-10',
    restaurant_name: 'State Road',
    restaurant_town: 'West Tisbury',
    restaurant_is_open: false,
  }),
]

describe('searchDishes', () => {
  describe('empty/invalid queries', () => {
    it('returns [] for empty string', () => {
      expect(searchDishes(DISHES, '')).toEqual([])
    })

    it('returns [] for null query', () => {
      expect(searchDishes(DISHES, null)).toEqual([])
    })

    it('returns [] for undefined query', () => {
      expect(searchDishes(DISHES, undefined)).toEqual([])
    })

    it('returns [] for whitespace-only query', () => {
      expect(searchDishes(DISHES, '   ')).toEqual([])
    })

    it('returns [] for query with only stop words', () => {
      expect(searchDishes(DISHES, 'the best good food near me')).toEqual([])
    })

    it('returns [] when dishes array is empty', () => {
      expect(searchDishes([], 'lobster')).toEqual([])
    })

    it('returns [] when dishes array is null', () => {
      expect(searchDishes(null, 'lobster')).toEqual([])
    })
  })

  describe('single word match on dish name', () => {
    it('matches "lobster" to Lobster Roll', () => {
      const results = searchDishes(DISHES, 'lobster')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].dish_name).toBe('Lobster Roll')
    })

    it('matches case-insensitively', () => {
      const results = searchDishes(DISHES, 'LOBSTER')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].dish_name).toBe('Lobster Roll')
    })
  })

  describe('exact phrase multi-word match', () => {
    it('matches "fried chicken sandwich" exactly', () => {
      const results = searchDishes(DISHES, 'fried chicken sandwich')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].dish_name).toBe('Fried Chicken Sandwich')
    })

    it('exact phrase match ranks above partial match', () => {
      const results = searchDishes(DISHES, 'fried chicken sandwich')
      // Fried Chicken Sandwich should be first (exact phrase in name)
      expect(results[0].dish_name).toBe('Fried Chicken Sandwich')
    })
  })

  describe('multi-word query does NOT return unrelated dishes', () => {
    it('"fried chicken sandwich" does not return Poke Bowl', () => {
      const results = searchDishes(DISHES, 'fried chicken sandwich')
      const names = results.map(r => r.dish_name)
      expect(names).not.toContain('Poke Bowl')
    })

    it('"clam chowder" does not return pizza dishes', () => {
      const results = searchDishes(DISHES, 'clam chowder')
      const names = results.map(r => r.dish_name)
      expect(names).not.toContain('Margherita Pizza')
      expect(names).not.toContain('Pepperoni Pizza')
    })
  })

  describe('match by category', () => {
    it('"pizza" matches both pizza dishes', () => {
      const results = searchDishes(DISHES, 'pizza')
      const names = results.map(r => r.dish_name)
      expect(names).toContain('Margherita Pizza')
      expect(names).toContain('Pepperoni Pizza')
    })

    it('"chowder" matches Clam Chowder via category', () => {
      const results = searchDishes(DISHES, 'chowder')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].dish_name).toBe('Clam Chowder')
    })
  })

  describe('tag synonym expansion', () => {
    it('"healthy" matches dishes tagged fresh/light/healthy', () => {
      const results = searchDishes(DISHES, 'healthy')
      const names = results.map(r => r.dish_name)
      // Poke Bowl has all three tags: fresh, light, healthy
      expect(names).toContain('Poke Bowl')
    })

    it('"comfort" matches dishes tagged comfort', () => {
      const results = searchDishes(DISHES, 'comfort')
      const names = results.map(r => r.dish_name)
      expect(names).toContain('BBQ Ribs')
      expect(names).toContain('Clam Chowder')
    })
  })

  describe('misspelling normalization', () => {
    it('does not crash on misspelled input', () => {
      expect(() => searchDishes(DISHES, 'ceasar')).not.toThrow()
    })

    it('"ceasar" matches Caesar Salad', () => {
      const results = searchDishes(DISHES, 'ceasar')
      const names = results.map(r => r.dish_name)
      expect(names).toContain('Caesar Salad')
    })
  })

  describe('limit parameter', () => {
    it('defaults to 10 results max', () => {
      const results = searchDishes(DISHES, 'a')
      expect(results.length).toBeLessThanOrEqual(10)
    })

    it('respects custom limit', () => {
      const results = searchDishes(DISHES, 'pizza', { limit: 1 })
      expect(results.length).toBe(1)
    })
  })

  describe('sorting: exact matches rank above partial matches', () => {
    it('exact name phrase ranks above partial token matches', () => {
      const results = searchDishes(DISHES, 'fish tacos')
      expect(results[0].dish_name).toBe('Fish Tacos')
    })

    it('among same-score results, higher avg_rating ranks first', () => {
      // Both are pizza category, "pizza" in name → same score
      const results = searchDishes(DISHES, 'pizza')
      const pizzaResults = results.filter(r => r.category === 'pizza')
      expect(pizzaResults.length).toBe(2)
      // Margherita (8.8) should be above Pepperoni (7.8)
      expect(pizzaResults[0].dish_name).toBe('Margherita Pizza')
      expect(pizzaResults[1].dish_name).toBe('Pepperoni Pizza')
    })
  })

  describe('closed restaurants excluded', () => {
    it('does not return dishes from closed restaurants', () => {
      // Grilled Swordfish is at a closed restaurant
      const results = searchDishes(DISHES, 'swordfish')
      const names = results.map(r => r.dish_name)
      expect(names).not.toContain('Grilled Swordfish')
    })

    it('"grilled" does not include closed restaurant dishes', () => {
      const results = searchDishes(DISHES, 'grilled')
      const names = results.map(r => r.dish_name)
      expect(names).not.toContain('Grilled Swordfish')
    })
  })

  describe('output shape', () => {
    it('results have the correct output shape', () => {
      const results = searchDishes(DISHES, 'lobster')
      expect(results.length).toBeGreaterThanOrEqual(1)
      const result = results[0]

      expect(result).toHaveProperty('dish_id')
      expect(result).toHaveProperty('dish_name')
      expect(result).toHaveProperty('category')
      expect(result).toHaveProperty('tags')
      expect(result).toHaveProperty('photo_url')
      expect(result).toHaveProperty('price')
      expect(result).toHaveProperty('value_score')
      expect(result).toHaveProperty('value_percentile')
      expect(result).toHaveProperty('total_votes')
      expect(result).toHaveProperty('avg_rating')
      expect(result).toHaveProperty('restaurant_id')
      expect(result).toHaveProperty('restaurant_name')
      expect(result).toHaveProperty('restaurant_cuisine')
      expect(result).toHaveProperty('restaurant_town')
      expect(result).toHaveProperty('restaurant_lat')
      expect(result).toHaveProperty('restaurant_lng')
      expect(result).toHaveProperty('restaurant_is_open')
    })

    it('maps fields correctly from input dish', () => {
      const results = searchDishes(DISHES, 'lobster')
      const result = results[0]

      expect(result.dish_id).toBe('dish-1')
      expect(result.dish_name).toBe('Lobster Roll')
      expect(result.category).toBe('lobster roll')
      expect(result.avg_rating).toBe(9.2)
      expect(result.total_votes).toBe(45)
      expect(result.restaurant_name).toBe("Nancy's")
    })
  })

  describe('description matching', () => {
    const DISHES_WITH_DESC = [
      makeDish({
        id: 'd-anchovy',
        name: 'House Salad',
        category: 'salad',
        tags: [],
        description: 'Romaine, anchovy, lemon vinaigrette',
        avg_rating: 8.0,
        restaurant_name: 'Coast Cafe',
      }),
      makeDish({
        id: 'd-plain',
        name: 'Mystery Plate',
        category: 'entree',
        tags: [],
        description: null,
        avg_rating: 8.0,
        restaurant_name: 'Other Place',
      }),
    ]

    it('matches dishes by description ingredient', () => {
      const results = searchDishes(DISHES_WITH_DESC, 'anchovy')
      expect(results.map(r => r.dish_id)).toEqual(['d-anchovy'])
    })

    it('returns no match for query that only appears in a null description', () => {
      const results = searchDishes(
        [makeDish({ id: 'd-null', name: 'No Desc', description: null })],
        'anchovy'
      )
      expect(results).toEqual([])
    })

    it('does not crash on undefined description', () => {
      const dishes = [makeDish({ id: 'd-undef', name: 'Stew', description: undefined })]
      expect(() => searchDishes(dishes, 'anchovy')).not.toThrow()
    })

    it('multi-token query does not match unrelated tokens in same description', () => {
      const dishes = [
        makeDish({
          id: 'd-falsepos',
          name: 'Tofu Stir Fry',
          description: 'fried tofu, chicken broth, scallion',
          avg_rating: 8.0,
        }),
      ]
      const results = searchDishes(dishes, 'fried chicken')
      // "fried" and "chicken" both appear but as parts of separate ingredients;
      // word-boundary matching should reject this for the multi-token query
      expect(results).toEqual([])
    })

    it('description match does not outrank dish name match', () => {
      const dishes = [
        makeDish({
          id: 'd-named',
          name: 'Truffle Pasta',
          description: null,
          avg_rating: 7.0,
        }),
        makeDish({
          id: 'd-desc',
          name: 'Tagliatelle',
          description: 'house-made pasta, truffle, parmesan',
          avg_rating: 9.5,
        }),
      ]
      const results = searchDishes(dishes, 'truffle')
      expect(results[0].dish_id).toBe('d-named')
    })
  })

  describe('null/missing fields do not crash', () => {
    it('handles dish with null tags', () => {
      const dishes = [makeDish({ tags: null })]
      expect(() => searchDishes(dishes, 'lobster')).not.toThrow()
    })

    it('handles dish with undefined fields', () => {
      const dishes = [{
        id: 'dish-x',
        name: 'Mystery Dish',
        category: null,
        tags: undefined,
        avg_rating: null,
        total_votes: undefined,
        price: null,
        photo_url: null,
        value_score: null,
        value_percentile: null,
        restaurant_id: 'rest-x',
        restaurant_name: null,
        restaurant_cuisine: null,
        restaurant_town: null,
        restaurant_is_open: true,
        restaurant_lat: null,
        restaurant_lng: null,
      }]
      expect(() => searchDishes(dishes, 'mystery')).not.toThrow()
      const results = searchDishes(dishes, 'mystery')
      expect(results.length).toBe(1)
    })

    it('handles dish with empty string name', () => {
      const dishes = [makeDish({ name: '' })]
      expect(() => searchDishes(dishes, 'lobster')).not.toThrow()
    })
  })
})
