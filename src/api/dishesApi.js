import { supabase } from '../lib/supabase'
import { checkDishCreateRateLimit } from '../lib/rateLimiter'
import { createClassifiedError } from '../utils/errorHandler'

import { validateUserContent } from '../lib/reviewBlocklist'
import { logger } from '../utils/logger'


/**
 * Dishes API - Centralized data fetching for dishes
 */

export const dishesApi = {
  /**
   * Get ranked dishes by location with optional filters
   * @param {Object} params
   * @param {number} params.lat - User latitude
   * @param {number} params.lng - User longitude
   * @param {number} params.radiusMiles - Search radius in miles
   * @param {string|null} params.category - Optional category filter
   * @returns {Promise<Array>} Array of ranked dishes
   * @throws {Error} With classified error type
   */
  async getRankedDishes({ lat, lng, radiusMiles, category = null }) {
    try {
      const { data, error } = await supabase.rpc('get_ranked_dishes', {
        user_lat: lat,
        user_lng: lng,
        radius_miles: radiusMiles === 0 ? 25000 : radiusMiles,
        filter_category: category,
        filter_town: null,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching ranked dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get dishes for a specific restaurant with vote data
   * Sorted by avg_rating DESC for "Most loved here" ranking
   * @param {Object} params
   * @param {string} params.restaurantId - Restaurant ID
   * @returns {Promise<Array>} Array of dishes with vote stats
   * @throws {Error} With classified error type
   */
  async getDishesForRestaurant({ restaurantId }) {
    try {
      const { data, error } = await supabase.rpc('get_restaurant_dishes', {
        p_restaurant_id: restaurantId,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching restaurant dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get trending dishes (most votes in last 7 days)
   * @param {number} limit - Max results (default 10)
   * @returns {Promise<Array>} Trending dishes with vote counts
   */
  async getTrending(limit = 10) {
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const since = sevenDaysAgo.toISOString()

      // Get votes from last 7 days grouped by dish
      const { data: recentVotes, error: votesError } = await supabase
        .from('votes')
        .select('dish_id')
        .gte('created_at', since)
        .limit(5000)

      if (votesError) {
        throw createClassifiedError(votesError)
      }

      if (!recentVotes?.length) return []

      // Count votes per dish
      const voteCounts = {}
      for (const v of recentVotes) {
        voteCounts[v.dish_id] = (voteCounts[v.dish_id] || 0) + 1
      }

      // Filter dishes with at least 2 recent votes
      const trendingIds = Object.entries(voteCounts)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id)

      if (!trendingIds.length) return []

      // Fetch dish details
      const { data: dishes, error: dishError } = await supabase
        .from('dishes')
        .select(`
          id, name, category, photo_url, avg_rating,
          restaurants!inner ( id, name, town, is_open )
        `)
        .in('id', trendingIds)
        .eq('restaurants.is_open', true)

      if (dishError) {
        throw createClassifiedError(dishError)
      }

      let results = (dishes || [])
        .filter(d => d.restaurants)
        .map(d => ({
          dish_id: d.id,
          dish_name: d.name,
          category: d.category,
          photo_url: d.photo_url,
          avg_rating: d.avg_rating,
          total_votes: voteCounts[d.id] || 0,
          recent_votes: voteCounts[d.id] || 0,
          restaurant_id: d.restaurants.id,
          restaurant_name: d.restaurants.name,
          restaurant_town: d.restaurants.town,
        }))

      // Sort by recent votes descending
      results.sort((a, b) => b.recent_votes - a.recent_votes)

      return results.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching trending dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get recently added dishes
   * @param {number} limit - Max results (default 10)
   * @param {string|null} town - Optional town filter
   * @returns {Promise<Array>} Recently added dishes
   */
  async getRecent(limit = 10, town = null) {
    try {
      const { data, error } = await supabase
        .from('dishes')
        .select(`
          id, name, category, photo_url, avg_rating, created_at,
          restaurants!inner ( id, name, town, is_open )
        `)
        .eq('restaurants.is_open', true)
        .order('created_at', { ascending: false })
        .limit(town ? limit * 3 : limit)

      if (error) {
        throw createClassifiedError(error)
      }

      let results = (data || [])
        .filter(d => d.restaurants)
        .map(d => ({
          dish_id: d.id,
          dish_name: d.name,
          category: d.category,
          photo_url: d.photo_url,
          avg_rating: d.avg_rating,
          created_at: d.created_at,
          restaurant_id: d.restaurants.id,
          restaurant_name: d.restaurants.name,
          restaurant_town: d.restaurants.town,
        }))

      if (town) {
        results = results.filter(d => d.restaurant_town === town)
      }

      return results.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching recent dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get dishes with restaurant coordinates for map display
   * Fetches ALL dishes (open or closed), client filters by distance
   * @param {Object} params
   * @param {string|null} params.town - Optional town filter
   * @param {string|null} params.category - Optional category filter
   * @returns {Promise<Array>} Dishes with restaurant lat/lng
   */
  async getMapDishes({ town = null, category = null } = {}) {
    try {
      let query = supabase
        .from('dishes')
        .select(`
          id, name, category, avg_rating, total_votes, price, photo_url,
          restaurants!inner (
            id, name, lat, lng, town, address, is_open,
            phone, website_url, toast_slug, order_url
          )
        `)
        .order('avg_rating', { ascending: false, nullsFirst: false })
        .limit(500)

      if (town) {
        query = query.eq('restaurants.town', town)
      }

      if (category) {
        query = query.ilike('category', category)
      }

      const { data, error } = await query

      if (error) throw createClassifiedError(error)

      return (data || [])
        .filter(d => d.restaurants?.lat && d.restaurants?.lng)
        .map(d => ({
          dish_id: d.id,
          dish_name: d.name,
          category: d.category,
          avg_rating: d.avg_rating,
          total_votes: d.total_votes || 0,
          price: d.price,
          photo_url: d.photo_url,
          restaurant_id: d.restaurants.id,
          restaurant_name: d.restaurants.name,
          restaurant_lat: d.restaurants.lat,
          restaurant_lng: d.restaurants.lng,
          restaurant_town: d.restaurants.town,
          restaurant_address: d.restaurants.address,
          restaurant_is_open: d.restaurants.is_open,
          restaurant_phone: d.restaurants.phone,
          website_url: d.restaurants.website_url,
          toast_slug: d.restaurants.toast_slug,
          order_url: d.restaurants.order_url,
        }))
    } catch (error) {
      logger.error('Error fetching map dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all dishes with search-relevant fields for client-side caching.
   * Returns a flat array (restaurant data denormalized into each dish).
   * ~300 rows, ~50KB. Cached by React Query in useAllDishes hook.
   * @returns {Promise<Array>} All dishes with restaurant metadata
   */
  async getAllSearchable() {
    try {
      const { data, error } = await supabase
        .from('dishes')
        .select(`
          id, name, category, tags, photo_url, price,
          avg_rating, total_votes, value_score, value_percentile,
          restaurants!inner (
            id, name, is_open, cuisine, town, lat, lng,
            address, phone, website_url, toast_slug, order_url
          )
        `)
        .order('avg_rating', { ascending: false, nullsFirst: false })

      if (error) throw createClassifiedError(error)

      return (data || [])
        .filter(d => d.restaurants)
        .map(d => ({
          id: d.id,
          name: d.name,
          category: d.category,
          tags: d.tags || [],
          photo_url: d.photo_url,
          price: d.price,
          avg_rating: d.avg_rating,
          total_votes: d.total_votes || 0,
          value_score: d.value_score,
          value_percentile: d.value_percentile,
          restaurant_id: d.restaurants.id,
          restaurant_name: d.restaurants.name,
          restaurant_is_open: d.restaurants.is_open,
          restaurant_cuisine: d.restaurants.cuisine,
          restaurant_town: d.restaurants.town,
          restaurant_lat: d.restaurants.lat,
          restaurant_lng: d.restaurants.lng,
          restaurant_address: d.restaurants.address,
          restaurant_phone: d.restaurants.phone,
          website_url: d.restaurants.website_url,
          toast_slug: d.restaurants.toast_slug,
          order_url: d.restaurants.order_url,
        }))
    } catch (error) {
      logger.error('Error fetching all searchable dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Subscribe to all changes on the dishes table via Supabase Realtime.
   * Fires `onChange()` for every INSERT/UPDATE/DELETE row event.
   * Returns an unsubscribe function — call it on unmount to remove the channel.
   *
   * Used by useAllDishes to invalidate its cache automatically — every dish
   * write (manual creation, menu-refresh cron, admin, restaurant cascade
   * delete) refreshes the search cache without per-call invalidation.
   *
   * @param {() => void} onChange - Called for every dish row change
   * @returns {() => void} Unsubscribe — call to remove the channel
   */
  subscribeToChanges(onChange) {
    const channelName = 'dishes-changes-' + Math.random().toString(36).slice(2, 10)
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dishes' },
        onChange
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  },

  /**
   * Get variants for a parent dish
   * @param {string} parentDishId - Parent dish ID
   * @returns {Promise<Array>} Array of variant dishes with vote stats
   * @throws {Error} With classified error type
   */
  async getVariants(parentDishId) {
    try {
      const { data, error } = await supabase.rpc('get_dish_variants', {
        p_parent_dish_id: parentDishId,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching dish variants:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Check if a dish has variants
   * @param {string} dishId - Dish ID to check
   * @returns {Promise<boolean>} True if dish has variants
   */
  async hasVariants(dishId) {
    try {
      const { count, error } = await supabase
        .from('dishes')
        .select('id', { count: 'exact', head: true })
        .eq('parent_dish_id', dishId)

      if (error) {
        logger.error('Error checking for variants:', error)
        return false
      }

      return count > 0
    } catch (error) {
      logger.error('Error checking for variants:', error)
      return false
    }
  },

  /**
   * Get parent dish info for a variant
   * @param {string} dishId - Child dish ID
   * @returns {Promise<Object|null>} Parent dish info or null if no parent
   */
  async getParentDish(dishId) {
    try {
      // First get the dish to find its parent_dish_id
      const { data: dish, error: dishError } = await supabase
        .from('dishes')
        .select('parent_dish_id')
        .eq('id', dishId)
        .maybeSingle()

      if (dishError || !dish?.parent_dish_id) {
        return null
      }

      // Get parent dish info
      const { data: parent, error: parentError } = await supabase
        .from('dishes')
        .select(`
          id,
          name,
          category,
          restaurant_id,
          restaurants (
            id,
            name
          )
        `)
        .eq('id', dish.parent_dish_id)
        .maybeSingle()

      if (parentError) {
        logger.error('Error fetching parent dish:', parentError)
        return null
      }

      return parent
    } catch (error) {
      logger.error('Error getting parent dish:', error)
      return null
    }
  },

  /**
   * Get sibling variants for a dish (other variants of the same parent)
   * @param {string} dishId - Dish ID
   * @returns {Promise<Array>} Array of sibling variant dishes
   */
  async getSiblingVariants(dishId) {
    try {
      // First get the dish to find its parent_dish_id
      const { data: dish, error: dishError } = await supabase
        .from('dishes')
        .select('parent_dish_id')
        .eq('id', dishId)
        .maybeSingle()

      if (dishError || !dish?.parent_dish_id) {
        return []
      }

      // Get all variants of this parent (including the current dish)
      return this.getVariants(dish.parent_dish_id)
    } catch (error) {
      logger.error('Error getting sibling variants:', error)
      return []
    }
  },

  /**
   * Get a single dish by ID with vote stats
   * Uses pre-computed avg_rating and total_votes from dishes table (maintained by trigger).
   * @param {string} dishId - Dish ID
   * @returns {Promise<Object>} Dish object with vote stats
   * @throws {Error} With classified error type
   */
  async getDishById(dishId) {
    try {
      // Fetch dish with restaurant info (including cuisine) and parent info
      const { data: dish, error: dishError } = await supabase
        .from('dishes')
        .select(`
          *,
          parent_dish_id,
          display_order,
          restaurants (
            id,
            name,
            address,
            lat,
            lng,
            cuisine,
            town,
            phone,
            website_url,
            toast_slug,
            order_url
          )
        `)
        .eq('id', dishId)
        .maybeSingle()

      if (dishError) {
        throw createClassifiedError(dishError)
      }

      if (!dish) {
        throw new Error('Dish not found')
      }

      // Check variants. Binary yes_votes count was removed with the binary-vote
      // signal — avg_rating + total_votes (pre-computed by trigger) are the
      // canonical stats now.
      const hasVariantsResult = await this.hasVariants(dishId)

      return {
        ...dish,
        has_variants: hasVariantsResult,
      }
    } catch (error) {
      logger.error('Error fetching dish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Create a new dish (any authenticated user)
   * @param {Object} params - Dish data
   * @returns {Promise<Object>} Created dish
   */
  async create({ restaurantId, name, category, price }) {
    try {
      // Content moderation
      const contentError = validateUserContent(name, 'Dish name')
      if (contentError) throw new Error(contentError)

      const clientRateLimit = checkDishCreateRateLimit()
      if (!clientRateLimit.allowed) {
        throw new Error(clientRateLimit.message)
      }

      // Check rate limit first
      const { data: rateCheck, error: rateError } = await supabase.rpc('check_dish_create_rate_limit')
      if (rateError) throw createClassifiedError(rateError)
      if (rateCheck && !rateCheck.allowed) {
        const err = new Error(rateCheck.message || 'Too many dishes created. Please wait.')
        err.type = 'RATE_LIMIT'
        throw err
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw createClassifiedError(new Error('Not authenticated'))

      const { data, error } = await supabase
        .from('dishes')
        .insert({
          restaurant_id: restaurantId,
          name,
          category,
          price: price || null,
          created_by: user.id,
        })
        .select('id, name, category, price, restaurant_id')
        .single()

      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Error creating dish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
