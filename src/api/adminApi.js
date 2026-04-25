import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { sanitizeSearchQuery } from '../utils/sanitize'
import { logger } from '../utils/logger'

/**
 * Admin API - Centralized data mutations for admin operations
 *
 * SECURITY: All write operations (insert/update/delete) are protected by
 * Row Level Security (RLS) in Supabase. Only users in the `admins` table
 * can perform these operations. The client-side admin check is for UI only.
 */

export const adminApi = {
  /**
   * Check if current user is an admin (database check, not client-side)
   * This matches the RLS is_admin() function in Supabase
   * @returns {Promise<boolean>} True if user is admin
   */
  async isAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const { data, error } = await supabase
        .from('admins')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) {
        logger.error('Error checking admin status:', error)
        return false
      }

      return !!data
    } catch (error) {
      logger.error('Error checking admin status:', error)
      return false
    }
  },

  /**
   * Get recent dishes
   * @param {number} limit - Number of recent dishes to fetch
   * @returns {Promise<Array>} Array of recent dishes
   */
  async getRecentDishes(limit = 10) {
    try {
      const { data, error } = await supabase
        .from('dishes')
        .select(`
          id,
          name,
          category,
          price,
          created_at,
          restaurants (name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching recent dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Add a new dish
   * @param {Object} params
   * @param {string} params.restaurantId - Restaurant ID
   * @param {string} params.name - Dish name
   * @param {string} params.category - Dish category
   * @param {number|null} params.price - Dish price
   * @param {string|null} params.photoUrl - Dish photo URL
   * @returns {Promise<Object>} Created dish object
   */
  async addDish({ restaurantId, name, category, price, photoUrl }) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw createClassifiedError(new Error('Not authenticated'))

      const { data, error } = await supabase
        .from('dishes')
        .insert({
          restaurant_id: restaurantId,
          name: name.trim(),
          category: category.toLowerCase(),
          price: price != null && price !== '' ? parseFloat(price) : null,
          photo_url: photoUrl?.trim() || null,
          created_by: user.id,
        })
        .select()

      if (error) {
        throw createClassifiedError(error)
      }

      return data?.[0] || null
    } catch (error) {
      logger.error('Error adding dish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Delete a dish
   * @param {string} dishId - Dish ID
   * @returns {Promise<Object>} Success status
   */
  async deleteDish(dishId) {
    try {
      const { error } = await supabase
        .from('dishes')
        .delete()
        .eq('id', dishId)

      if (error) {
        throw createClassifiedError(error)
      }

      return { success: true }
    } catch (error) {
      logger.error('Error deleting dish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Update an existing dish
   * @param {string} dishId - Dish ID
   * @param {Object} params
   * @param {string} params.restaurantId - Restaurant ID
   * @param {string} params.name - Dish name
   * @param {string} params.category - Dish category
   * @param {number|null} params.price - Dish price
   * @param {string|null} params.photoUrl - Dish photo URL
   * @returns {Promise<Object>} Updated dish object
   */
  async updateDish(dishId, { restaurantId, name, category, price, photoUrl }) {
    try {
      const { data, error } = await supabase
        .from('dishes')
        .update({
          restaurant_id: restaurantId,
          name: name.trim(),
          category: category.toLowerCase(),
          price: price != null && price !== '' ? parseFloat(price) : null,
          photo_url: photoUrl?.trim() || null,
        })
        .eq('id', dishId)
        .select()

      if (error) {
        throw createClassifiedError(error)
      }

      return data?.[0] || null
    } catch (error) {
      logger.error('Error updating dish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Mint a curator invite link (admin-only RPC).
   * @returns {Promise<{ success: boolean, token?: string, expires_at?: string, error?: string }>}
   */
  async createCuratorInvite() {
    try {
      const { data, error } = await supabase.rpc('create_curator_invite')
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Error minting curator invite:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Search dishes by name
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Array of matching dishes
   */
  async searchDishes(query, limit = 20) {
    if (!query?.trim()) return []

    // Sanitize query to prevent SQL injection via LIKE patterns
    const sanitized = sanitizeSearchQuery(query, 50)
    if (!sanitized) return []

    try {
      const { data, error } = await supabase
        .from('dishes')
        .select(`
          id,
          name,
          category,
          price,
          photo_url,
          restaurant_id,
          restaurants (id, name)
        `)
        .ilike('name', `%${sanitized}%`)
        .order('name')
        .limit(limit)

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error searching dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
