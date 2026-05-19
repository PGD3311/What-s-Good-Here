import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { dishesApi } from './dishesApi'

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

import { supabase } from '../lib/supabase'

describe('dishesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getRankedDishes', () => {
    it('should call rpc with correct parameters', async () => {
      const mockData = [
        { dish_id: '1', dish_name: 'Lobster Roll', avg_rating: 9.2 },
        { dish_id: '2', dish_name: 'Clam Chowder', avg_rating: 8.8 },
      ]
      supabase.rpc.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await dishesApi.getRankedDishes({
        lat: 41.3925,
        lng: -70.6444,
        radiusMiles: 10,
        category: 'seafood',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('get_ranked_dishes', {
        user_lat: 41.3925,
        user_lng: -70.6444,
        radius_miles: 10,
        filter_category: 'seafood',
        filter_town: null,
        filter_dietary_tags: null,
      })
      expect(result).toEqual(mockData)
    })

    it('should use null category when not provided', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null })

      await dishesApi.getRankedDishes({
        lat: 41.3925,
        lng: -70.6444,
        radiusMiles: 10,
      })

      expect(supabase.rpc).toHaveBeenCalledWith('get_ranked_dishes', {
        user_lat: 41.3925,
        user_lng: -70.6444,
        radius_miles: 10,
        filter_category: null,
        filter_town: null,
        filter_dietary_tags: null,
      })
    })

    it('passes filter_dietary_tags to the RPC when provided', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null })

      await dishesApi.getRankedDishes({
        lat: 41.45,
        lng: -70.56,
        radiusMiles: 25,
        dietaryTags: ['vegan', 'gluten_free'],
      })

      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_ranked_dishes',
        expect.objectContaining({
          filter_dietary_tags: ['vegan', 'gluten_free'],
        })
      )
    })

    it('sends filter_dietary_tags as null when dietaryTags is empty array', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null })

      await dishesApi.getRankedDishes({
        lat: 41.45,
        lng: -70.56,
        radiusMiles: 25,
        dietaryTags: [],
      })

      const callArg = supabase.rpc.mock.calls[0][1]
      expect(callArg.filter_dietary_tags).toBeNull()
    })

    it('sends filter_dietary_tags as null when dietaryTags is undefined', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: [], error: null })

      await dishesApi.getRankedDishes({
        lat: 41.45,
        lng: -70.56,
        radiusMiles: 25,
      })

      const callArg = supabase.rpc.mock.calls[0][1]
      expect(callArg.filter_dietary_tags).toBeNull()
    })

    it('should return empty array when data is null', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: null, error: null })

      const result = await dishesApi.getRankedDishes({
        lat: 41.3925,
        lng: -70.6444,
        radiusMiles: 10,
      })

      expect(result).toEqual([])
    })

    it('should throw classified error on database error', async () => {
      const dbError = { message: 'Database connection failed', code: 'PGRST301' }
      supabase.rpc.mockResolvedValueOnce({ data: null, error: dbError })

      await expect(dishesApi.getRankedDishes({
        lat: 41.3925,
        lng: -70.6444,
        radiusMiles: 10,
      })).rejects.toThrow('Database connection failed')
    })

    it('should include error type in thrown error', async () => {
      const dbError = { message: 'Connection error', code: 'PGRST301' }
      supabase.rpc.mockResolvedValueOnce({ data: null, error: dbError })

      try {
        await dishesApi.getRankedDishes({
          lat: 41.3925,
          lng: -70.6444,
          radiusMiles: 10,
        })
      } catch (error) {
        expect(error.type).toBeDefined()
      }
    })
  })

  describe('getAllSearchable', () => {
    function mockDishesPage(rows) {
      const rangeMock = vi.fn().mockResolvedValue({ data: rows, error: null })
      const orderMock = vi.fn().mockReturnValue({ range: rangeMock })
      const selectMock = vi.fn().mockReturnValue({ order: orderMock })
      supabase.from.mockReturnValue({ select: selectMock })
      return { selectMock, rangeMock }
    }

    it('selects description and dietary_tags in the query', async () => {
      const { selectMock } = mockDishesPage([])
      await dishesApi.getAllSearchable()

      const selectArg = selectMock.mock.calls[0][0]
      expect(selectArg).toContain('description')
      expect(selectArg).toContain('dietary_tags')
    })

    it('maps description and dietary_tags onto the result rows', async () => {
      mockDishesPage([
        {
          id: 'd1',
          name: 'Lobster Roll',
          category: 'lobster roll',
          tags: ['classic'],
          photo_url: null,
          price: 28,
          avg_rating: 8.4,
          total_votes: 12,
          value_score: null,
          value_percentile: null,
          description: 'Hot lobster meat, drawn butter, split-top bun',
          dietary_tags: ['dairy_free'],
          restaurants: {
            id: 'r1',
            name: 'Coast Cafe',
            is_open: true,
            cuisine: 'Seafood',
            town: 'Oak Bluffs',
            lat: 41.45,
            lng: -70.56,
            address: '1 Circuit Ave',
            phone: null,
            website_url: null,
            toast_slug: null,
            order_url: null,
          },
        },
      ])

      const result = await dishesApi.getAllSearchable()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'd1',
        description: 'Hot lobster meat, drawn butter, split-top bun',
        dietary_tags: ['dairy_free'],
      })
    })

    it('defaults dietary_tags to empty array and description to null when DB returns nullish', async () => {
      mockDishesPage([
        {
          id: 'd2',
          name: 'Mystery Dish',
          category: 'entree',
          tags: null,
          photo_url: null,
          price: null,
          avg_rating: null,
          total_votes: null,
          value_score: null,
          value_percentile: null,
          description: null,
          dietary_tags: null,
          restaurants: {
            id: 'r2',
            name: 'Test Restaurant',
            is_open: true,
            cuisine: null,
            town: null,
            lat: 0,
            lng: 0,
            address: null,
            phone: null,
            website_url: null,
            toast_slug: null,
            order_url: null,
          },
        },
      ])

      const result = await dishesApi.getAllSearchable()
      expect(result[0].description).toBeNull()
      expect(result[0].dietary_tags).toEqual([])
    })
  })

  describe('getDishesForRestaurant', () => {
    it('should call rpc with restaurant ID', async () => {
      const mockData = [
        { id: '1', name: 'Fish Tacos', avg_rating: 9.2 },
        { id: '2', name: 'Nachos', avg_rating: 7.8 },
      ]
      supabase.rpc.mockResolvedValueOnce({ data: mockData, error: null })

      const result = await dishesApi.getDishesForRestaurant({
        restaurantId: 'rest-123',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('get_restaurant_dishes', {
        p_restaurant_id: 'rest-123',
      })
      expect(result).toEqual(mockData)
    })

    it('should return empty array when no dishes found', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: null, error: null })

      const result = await dishesApi.getDishesForRestaurant({
        restaurantId: 'rest-123',
      })

      expect(result).toEqual([])
    })

    it('should throw classified error on failure', async () => {
      const dbError = { message: 'Restaurant not found' }
      supabase.rpc.mockResolvedValueOnce({ data: null, error: dbError })

      await expect(dishesApi.getDishesForRestaurant({
        restaurantId: 'invalid-id',
      })).rejects.toThrow('Restaurant not found')
    })
  })

  describe('getVariants', () => {
    it('should call rpc with parent dish ID', async () => {
      const mockVariants = [
        { id: 'v1', name: 'Small Pizza' },
        { id: 'v2', name: 'Large Pizza' },
      ]
      supabase.rpc.mockResolvedValueOnce({ data: mockVariants, error: null })

      const result = await dishesApi.getVariants('parent-dish-1')

      expect(supabase.rpc).toHaveBeenCalledWith('get_dish_variants', {
        p_parent_dish_id: 'parent-dish-1',
      })
      expect(result).toEqual(mockVariants)
    })

    it('should return empty array when no variants', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: null, error: null })

      const result = await dishesApi.getVariants('parent-dish-1')

      expect(result).toEqual([])
    })

    it('should throw classified error on failure', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC failed' } })

      await expect(dishesApi.getVariants('parent-dish-1')).rejects.toThrow('RPC failed')
    })
  })

  describe('hasVariants', () => {
    it('should return true when dish has variants', async () => {
      const selectChain = {
        eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
      }
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(selectChain),
      })

      const result = await dishesApi.hasVariants('dish-1')

      expect(result).toBe(true)
    })

    it('should return false when dish has no variants', async () => {
      const selectChain = {
        eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
      }
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(selectChain),
      })

      const result = await dishesApi.hasVariants('dish-1')

      expect(result).toBe(false)
    })

    it('should return false on error (graceful degradation)', async () => {
      const selectChain = {
        eq: vi.fn().mockResolvedValue({ count: null, error: { message: 'Error' } }),
      }
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(selectChain),
      })

      const result = await dishesApi.hasVariants('dish-1')

      expect(result).toBe(false)
    })
  })

  describe('getParentDish', () => {
    it('should return null when dish has no parent', async () => {
      const selectChain = {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { parent_dish_id: null }, error: null }),
      }
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue(selectChain),
      })

      const result = await dishesApi.getParentDish('dish-1')

      expect(result).toBeNull()
    })

    it('should return parent dish info when exists', async () => {
      const mockParent = {
        id: 'parent-1',
        name: 'Pizza',
        category: 'Italian',
        restaurant_id: 'rest-1',
        restaurants: { id: 'rest-1', name: 'Pizzeria' },
      }

      let callCount = 0
      supabase.from.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { parent_dish_id: 'parent-1' }, error: null }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockParent, error: null }),
          }),
        }
      })

      const result = await dishesApi.getParentDish('child-dish-1')

      expect(result).toEqual(mockParent)
    })

    it('should return null on error (graceful degradation)', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        }),
      })

      const result = await dishesApi.getParentDish('dish-1')

      expect(result).toBeNull()
    })
  })

  describe('getSiblingVariants', () => {
    it('should return empty array when dish has no parent', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { parent_dish_id: null }, error: null }),
        }),
      })

      const result = await dishesApi.getSiblingVariants('dish-1')

      expect(result).toEqual([])
    })

    it('should call getVariants with parent ID when dish has parent', async () => {
      const mockVariants = [{ id: 'v1' }, { id: 'v2' }]

      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { parent_dish_id: 'parent-1' }, error: null }),
        }),
      })
      supabase.rpc.mockResolvedValueOnce({ data: mockVariants, error: null })

      const result = await dishesApi.getSiblingVariants('child-1')

      expect(supabase.rpc).toHaveBeenCalledWith('get_dish_variants', {
        p_parent_dish_id: 'parent-1',
      })
      expect(result).toEqual(mockVariants)
    })
  })

  describe('getDishById', () => {
    it('should fetch dish with restaurant info and vote stats from dish columns', async () => {
      const mockDish = {
        id: 'dish-1',
        name: 'Lobster Roll',
        category: 'seafood',
        restaurants: {
          id: 'rest-1',
          name: "Nancy's",
          address: '123 Main St',
          lat: 41.39,
          lng: -70.64,
          cuisine: 'Seafood',
        },
      }
      // First call: get dish (avg_rating and total_votes are pre-computed columns)
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { ...mockDish, avg_rating: 8, total_votes: 3 }, error: null }),
        }),
      })
      // Second call: hasVariants count query
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      })

      const result = await dishesApi.getDishById('dish-1')

      expect(result.total_votes).toBe(3)
      expect(result.avg_rating).toBe(8)
      expect(result.has_variants).toBe(false)
      // Binary-derived field is gone.
      expect(result).not.toHaveProperty('yes_votes')
    })

    it('should handle dish with no votes', async () => {
      const mockDish = { id: 'dish-1', name: 'New Dish', avg_rating: null, total_votes: 0, restaurants: {} }

      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockDish, error: null }),
        }),
      })
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      })

      const result = await dishesApi.getDishById('dish-1')

      expect(result.total_votes).toBe(0)
      expect(result.avg_rating).toBeNull()
      expect(result).not.toHaveProperty('yes_votes')
    })

    it('should throw error when dish not found', async () => {
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      })

      await expect(dishesApi.getDishById('invalid-id')).rejects.toThrow()
    })
  })
})
