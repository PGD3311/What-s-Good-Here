import { supabase } from '../lib/supabase'
import { checkRestaurantCreateRateLimit } from '../lib/rateLimiter'
import { logger } from '../utils/logger'
import { sanitizeSearchQuery } from '../utils/sanitize'
import { createClassifiedError } from '../utils/errorHandler'
import { validateUserContent } from '../lib/reviewBlocklist'

/**
 * Restaurants API - Centralized data fetching for restaurants
 */

export const restaurantsApi = {
  /**
   * Get all restaurants with dish counts
   * @returns {Promise<Array>} Array of restaurants with dish counts
   */
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select(`
          id,
          name,
          address,
          lat,
          lng,
          is_open,
          town,
          cuisine,
          dishes (id, name, avg_rating, total_votes)
        `)
        .order('name')

      if (error) {
        throw createClassifiedError(error)
      }

      // Transform to include dish count, "known for" dish, and aggregate score
      return (data || []).map(r => {
        const dishList = r.dishes || []

        // Find highest-rated dish with 9.0+ rating and 10+ votes
        let knownFor = null
        dishList.forEach(d => {
          if ((d.avg_rating || 0) >= 9.0 && (d.total_votes || 0) >= 10) {
            if (!knownFor || d.avg_rating > knownFor.avg_rating) {
              knownFor = { name: d.name, rating: d.avg_rating }
            }
          }
        })

        // Compute aggregate restaurant score from dish ratings
        const ratedDishes = dishList.filter(d => d.avg_rating != null && (d.total_votes || 0) > 0)
        const totalVotes = ratedDishes.reduce((sum, d) => sum + (d.total_votes || 0), 0)
        const avgRating = ratedDishes.length > 0
          ? Number((ratedDishes.reduce((sum, d) => sum + Number(d.avg_rating), 0) / ratedDishes.length).toFixed(1))
          : null

        return {
          ...r,
          dishCount: dishList.length,
          knownFor,
          avg_rating: avgRating,
          total_votes: totalVotes,
          dishes: undefined,
        }
      })
    } catch (error) {
      logger.error('Error fetching restaurants:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get open restaurants
   * @returns {Promise<Array>} Array of open restaurants
   */
  async getOpen() {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, address')
        .eq('is_open', true)
        .order('name')

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching open restaurants:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Search restaurants by name
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Array of matching restaurants
   * @throws {Error} On API failure
   */
  async search(query, limit = 5) {
    if (!query?.trim()) return []

    // Sanitize query to prevent SQL injection via LIKE patterns
    const sanitized = sanitizeSearchQuery(query, 50)
    if (!sanitized) return []

    // Search by name first
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, address')
      .eq('is_open', true)
      .ilike('name', `%${sanitized}%`)
      .limit(limit)

    if (error) {
      logger.error('Error searching restaurants:', error)
      throw createClassifiedError(error)
    }

    // If no name matches and query has multiple words, try matching
    // individual words against name or address (e.g. "Anejo Falmouth")
    if ((!data || data.length === 0) && sanitized.includes(' ')) {
      const words = sanitized.split(/\s+/).filter(w => w.length >= 2)
      if (words.length > 0) {
        // Build an OR filter: name matches any word OR address matches any word
        const orFilters = words
          .map(w => `name.ilike.%${w}%,address.ilike.%${w}%`)
          .join(',')
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('restaurants')
          .select('id, name, address')
          .eq('is_open', true)
          .or(orFilters)
          .limit(limit)

        if (!fallbackError && fallbackData?.length > 0) {
          return fallbackData
        }
      }
    }

    return data || []
  },

  /**
   * Get a single restaurant by ID
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Restaurant object
   */
  /**
   * Get total restaurant count
   * @returns {Promise<number>} Total number of restaurants
   */
  async getCount() {
    try {
      const { count, error } = await supabase
        .from('restaurants')
        .select('id', { count: 'exact', head: true })

      if (error) throw createClassifiedError(error)
      return count || 0
    } catch (error) {
      logger.error('Error fetching restaurant count:', error)
      return 0
    }
  },

  /**
   * Create a new restaurant (any authenticated user)
   * @param {Object} params - Restaurant data
   * @returns {Promise<Object>} Created restaurant
   */
  async create({ name, address, lat, lng, town, cuisine, googlePlaceId, websiteUrl, menuUrl, facebookUrl, instagramUrl, phone, toastSlug, orderUrl }) {
    try {
      // Content moderation
      const contentError = validateUserContent(name, 'Restaurant name')
      if (contentError) throw new Error(contentError)

      const clientRateLimit = checkRestaurantCreateRateLimit()
      if (!clientRateLimit.allowed) {
        throw new Error(clientRateLimit.message)
      }

      // Check rate limit first
      const { data: rateCheck, error: rateError } = await supabase.rpc('check_restaurant_create_rate_limit')
      if (rateError) throw createClassifiedError(rateError)
      if (rateCheck && !rateCheck.allowed) {
        const err = new Error(rateCheck.message || 'Too many restaurants created. Please wait.')
        err.type = 'RATE_LIMIT'
        throw err
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw createClassifiedError(new Error('Not authenticated'))

      const { data, error } = await supabase
        .from('restaurants')
        .insert({
          name,
          address,
          lat,
          lng,
          town: town || null,
          cuisine: cuisine || null,
          google_place_id: googlePlaceId || null,
          website_url: websiteUrl || null,
          menu_url: menuUrl || null,
          facebook_url: facebookUrl || null,
          instagram_url: instagramUrl || null,
          phone: phone || null,
          toast_slug: toastSlug || null,
          order_url: orderUrl || null,
          created_by: user.id,
          is_open: true,
        })
        .select('id, name, address, lat, lng, town')
        .single()

      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Error creating restaurant:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Search nearby restaurants via RPC
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {number} radiusMeters - Search radius in meters
   * @returns {Promise<Array>} Nearby restaurants with distance
   */
  async searchNearby(lat, lng, radiusMeters = 150) {
    try {
      const { data, error } = await supabase.rpc('find_nearby_restaurants', {
        p_name: null,
        p_lat: lat,
        p_lng: lng,
        p_radius_meters: radiusMeters,
      })

      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Error searching nearby restaurants:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Find restaurant by Google Place ID (for duplicate detection)
   * @param {string} googlePlaceId - Google Place ID
   * @returns {Promise<Object|null>} Restaurant or null
   */
  async findByGooglePlaceId(googlePlaceId) {
    if (!googlePlaceId) return null

    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, address')
        .eq('google_place_id', googlePlaceId)
        .maybeSingle()

      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Error finding restaurant by place ID:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get restaurants within a radius, sorted by distance
   * @param {number} lat - User latitude
   * @param {number} lng - User longitude
   * @param {number} radiusMiles - Search radius in miles
   * @returns {Promise<Array>} Restaurants with distance_miles and dish_count
   */
  async getByDistance(lat, lng, radiusMiles = 5) {
    try {
      const { data, error } = await supabase.rpc('get_restaurants_within_radius', {
        p_lat: lat,
        p_lng: lng,
        p_radius_miles: radiusMiles === 0 ? 25000 : radiusMiles,
      })

      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Error fetching restaurants by distance:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getById(restaurantId) {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .single()

      if (error) {
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error fetching restaurant:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get recently added restaurants (last N days)
   * @param {number} limit - Max results
   * @param {number} days - How many days back to look
   * @returns {Promise<Array>} Array of recently added restaurants
   */
  async getRecentlyAdded(limit = 10, days = 14) {
    try {
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, town, cuisine, created_at')
        .eq('is_open', true)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching recently added restaurants:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
