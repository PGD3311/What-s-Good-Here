import { supabase } from '../lib/supabase'
import { checkDishCreateRateLimit } from '../lib/rateLimiter'
import { validateUserContent } from '../lib/reviewBlocklist'
import { createClassifiedError, ErrorTypes } from '../utils/errorHandler'
import { logger } from '../utils/logger'

async function checkDishCreateRateLimitOnce() {
  const clientRateLimit = checkDishCreateRateLimit()
  if (!clientRateLimit.allowed) {
    throw new Error(clientRateLimit.message)
  }

  const { data: rateCheck, error: rateError } = await supabase.rpc('check_dish_create_rate_limit')
  if (rateError) {
    throw createClassifiedError(rateError)
  }
  if (rateCheck && !rateCheck.allowed) {
    const err = new Error(rateCheck.message || 'Too many dishes created. Please wait.')
    err.type = 'RATE_LIMIT'
    throw err
  }
}

function validateContentField(value, label) {
  const contentError = validateUserContent(value, label)
  if (contentError) throw new Error(contentError)
}

export const restaurantManagerApi = {
  /**
   * Get the restaurant the current user manages (if any)
   * If user manages multiple, returns the first one.
   * @returns {Promise<{restaurant: Object, role: string}|null>}
   */
  async getMyRestaurant() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data, error } = await supabase
        .from('restaurant_managers')
        .select(`
          role,
          restaurants (
            id,
            name,
            address,
            town,
            phone,
            website_url,
            facebook_url,
            instagram_url
          )
        `)
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (error) {
        logger.error('Error fetching manager status:', error)
        throw createClassifiedError(error)
      }

      if (!data) return null

      return {
        restaurant: data.restaurants,
        role: data.role,
      }
    } catch (error) {
      logger.error('Error in getMyRestaurant:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Create an invite link for a restaurant (admin only)
   * @param {string} restaurantId
   * @returns {Promise<{token: string, expiresAt: string}>}
   */
  async createInvite(restaurantId) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw createClassifiedError(new Error('Not authenticated'))

      const { data, error } = await supabase
        .from('restaurant_invites')
        .insert({
          restaurant_id: restaurantId,
          created_by: user.id,
        })
        .select('token, expires_at')
        .single()

      if (error) {
        logger.error('Error creating invite:', error)
        throw createClassifiedError(error)
      }

      return { token: data.token, expiresAt: data.expires_at }
    } catch (error) {
      logger.error('Error in createInvite:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all invites for a restaurant (admin only)
   * @param {string} restaurantId
   * @returns {Promise<Array>}
   */
  async getInvitesForRestaurant(restaurantId) {
    try {
      const { data, error } = await supabase
        .from('restaurant_invites')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error fetching invites:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error in getInvitesForRestaurant:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all managers for a restaurant (admin only)
   * @param {string} restaurantId
   * @returns {Promise<Array>}
   */
  async getManagersForRestaurant(restaurantId) {
    try {
      const { data, error } = await supabase
        .from('restaurant_managers')
        .select(`
          id,
          role,
          accepted_at,
          user_id,
          profiles:user_id (display_name)
        `)
        .eq('restaurant_id', restaurantId)

      if (error) {
        logger.error('Error fetching managers:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error in getManagersForRestaurant:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Remove a manager (admin only)
   * @param {string} managerId
   */
  async removeManager(managerId) {
    try {
      const { error } = await supabase
        .from('restaurant_managers')
        .delete()
        .eq('id', managerId)

      if (error) {
        logger.error('Error removing manager:', error)
        throw createClassifiedError(error)
      }
    } catch (error) {
      logger.error('Error in removeManager:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Update restaurant contact/social info (manager)
   * @param {string} restaurantId
   * @param {Object} updates - { phone, website_url, facebook_url, instagram_url }
   * @returns {Promise<Object>}
   */
  async updateRestaurantInfo(restaurantId, updates) {
    try {
      const allowed = {}
      if (updates.phone !== undefined) allowed.phone = updates.phone?.trim() || null
      if (updates.website_url !== undefined) allowed.website_url = updates.website_url?.trim() || null
      if (updates.facebook_url !== undefined) allowed.facebook_url = updates.facebook_url?.trim() || null
      if (updates.instagram_url !== undefined) allowed.instagram_url = updates.instagram_url?.trim() || null

      const { data, error } = await supabase
        .from('restaurants')
        .update(allowed)
        .eq('id', restaurantId)
        .select('id, name, phone, website_url, facebook_url, instagram_url')
        .single()

      if (error) {
        logger.error('Error updating restaurant info:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in updateRestaurantInfo:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get invite details (public, no auth required)
   * @param {string} token
   * @returns {Promise<{valid: boolean, restaurantName?: string, expiresAt?: string, error?: string}>}
   */
  async getInviteDetails(token) {
    try {
      const { data, error } = await supabase.rpc('get_invite_details', { p_token: token })

      if (error) {
        logger.error('Error fetching invite details:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in getInviteDetails:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Accept a restaurant invite (requires auth)
   * @param {string} token
   * @returns {Promise<{success: boolean, restaurantId?: string, restaurantName?: string, error?: string}>}
   */
  async acceptInvite(token) {
    try {
      const { data, error } = await supabase.rpc('accept_restaurant_invite', { p_token: token })

      if (error) {
        logger.error('Error accepting invite:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in acceptInvite:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all dishes for a restaurant (manager view)
   * @param {string} restaurantId
   * @returns {Promise<Array>}
   */
  async getRestaurantDishes(restaurantId) {
    try {
      const { data, error } = await supabase
        .from('dishes')
        .select('id, name, category, price, photo_url, total_votes')
        .eq('restaurant_id', restaurantId)
        .order('category')
        .order('name')

      if (error) {
        logger.error('Error fetching restaurant dishes:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error in getRestaurantDishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Add a dish to a restaurant (manager)
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async addDish({ restaurantId, name, description, category, price, photoUrl }) {
    try {
      validateContentField(name, 'Dish name')
      validateContentField(description, 'Dish description')
      await checkDishCreateRateLimitOnce()

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
        .single()

      if (error) {
        logger.error('Error adding dish:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in addDish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Update a dish (manager)
   * @param {string} dishId
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async updateDish(dishId, { name, description, price, photoUrl, category }) {
    try {
      const updates = {}
      if (name !== undefined) {
        validateContentField(name, 'Dish name')
        updates.name = name.trim()
      }
      if (description !== undefined) {
        validateContentField(description, 'Dish description')
      }
      if (price !== undefined) updates.price = price != null && price !== '' ? parseFloat(price) : null
      if (photoUrl !== undefined) updates.photo_url = photoUrl?.trim() || null
      if (category !== undefined) updates.category = category.toLowerCase()

      const { data, error } = await supabase
        .from('dishes')
        .update(updates)
        .eq('id', dishId)
        .select()
        .single()

      if (error) {
        logger.error('Error updating dish:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in updateDish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all specials for a restaurant (active + inactive for managers)
   * @param {string} restaurantId
   * @returns {Promise<Array>}
   */
  async getRestaurantSpecials(restaurantId) {
    try {
      const { data, error } = await supabase
        .from('specials')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error fetching restaurant specials:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error in getRestaurantSpecials:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Create a special (manager)
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async createSpecial({ restaurantId, dealName, description, price, expiresAt }) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw createClassifiedError(new Error('Not authenticated'))

      validateContentField(dealName, 'Special name')
      validateContentField(description, 'Special description')

      const { data, error } = await supabase
        .from('specials')
        .insert({
          restaurant_id: restaurantId,
          deal_name: dealName,
          description,
          price: price ? parseFloat(price) : null,
          expires_at: expiresAt || null,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        logger.error('Error creating special:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in createSpecial:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Update a special (manager)
   * Whitelists fields to prevent arbitrary column updates.
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async updateSpecial(id, updates) {
    try {
      const allowed = {}
      if (updates.deal_name !== undefined) {
        validateContentField(updates.deal_name, 'Special name')
        allowed.deal_name = updates.deal_name
      }
      if (updates.description !== undefined) {
        validateContentField(updates.description, 'Special description')
        allowed.description = updates.description
      }
      if (updates.price !== undefined) allowed.price = updates.price
      if (updates.expires_at !== undefined) allowed.expires_at = updates.expires_at
      if (updates.is_active !== undefined) allowed.is_active = updates.is_active

      const { data, error } = await supabase
        .from('specials')
        .update(allowed)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Error updating special:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in updateSpecial:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Deactivate a special (soft delete)
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async deactivateSpecial(id) {
    return this.updateSpecial(id, { is_active: false })
  },

  /**
   * Get all events for a restaurant (active + inactive for managers)
   * @param {string} restaurantId
   * @returns {Promise<Array>}
   */
  async getRestaurantEvents(restaurantId) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('is_active', { ascending: false })
        .order('event_date', { ascending: true })

      if (error) {
        logger.error('Error fetching restaurant events:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error in getRestaurantEvents:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Create an event (manager)
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async createEvent({ restaurantId, eventName, description, eventDate, startTime, endTime, eventType, recurringPattern, recurringDayOfWeek }) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw createClassifiedError(new Error('Not authenticated'))

      validateContentField(eventName, 'Event name')
      validateContentField(description, 'Event description')

      const { data, error } = await supabase
        .from('events')
        .insert({
          restaurant_id: restaurantId,
          event_name: eventName,
          description,
          event_date: eventDate,
          start_time: startTime || null,
          end_time: endTime || null,
          event_type: eventType,
          recurring_pattern: recurringPattern || null,
          recurring_day_of_week: recurringDayOfWeek != null ? recurringDayOfWeek : null,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        logger.error('Error creating event:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in createEvent:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Update an event (manager)
   * Whitelists fields to prevent arbitrary column updates.
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async updateEvent(id, updates) {
    try {
      const allowed = {}
      if (updates.event_name !== undefined) {
        validateContentField(updates.event_name, 'Event name')
        allowed.event_name = updates.event_name
      }
      if (updates.description !== undefined) {
        validateContentField(updates.description, 'Event description')
        allowed.description = updates.description
      }
      if (updates.event_date !== undefined) allowed.event_date = updates.event_date
      if (updates.start_time !== undefined) allowed.start_time = updates.start_time
      if (updates.end_time !== undefined) allowed.end_time = updates.end_time
      if (updates.event_type !== undefined) allowed.event_type = updates.event_type
      if (updates.recurring_pattern !== undefined) allowed.recurring_pattern = updates.recurring_pattern
      if (updates.recurring_day_of_week !== undefined) allowed.recurring_day_of_week = updates.recurring_day_of_week
      if (updates.is_active !== undefined) allowed.is_active = updates.is_active

      const { data, error } = await supabase
        .from('events')
        .update(allowed)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Error updating event:', error)
        throw createClassifiedError(error)
      }

      return data
    } catch (error) {
      logger.error('Error in updateEvent:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Deactivate an event (soft delete)
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async deactivateEvent(id) {
    return this.updateEvent(id, { is_active: false })
  },

  /**
   * Parse menu text using AI Edge Function
   * @param {string} text - Raw menu text (pasted or extracted from PDF)
   * @param {string} restaurantName - Restaurant name for context
   * @returns {Promise<Array<{name: string, category: string, price: number|null}>>}
   */
  async parseMenuText(text, restaurantName) {
    try {
      const { data, error } = await supabase.functions.invoke('parse-menu', {
        body: { text, restaurant_name: restaurantName },
      })

      if (error) {
        logger.error('Error parsing menu:', error)
        throw createClassifiedError(error)
      }

      return data?.dishes || []
    } catch (error) {
      logger.error('Error in parseMenuText:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Bulk add dishes to a restaurant (single batch insert)
   * @param {string} restaurantId
   * @param {Array<{name: string, category: string, price: number|null}>} dishes
   * @returns {Promise<Array>}
   */
  async bulkAddDishes(restaurantId, dishes) {
    try {
      for (const dish of dishes) {
        validateContentField(dish.name, 'Dish name')
        validateContentField(dish.description, 'Dish description')
        await checkDishCreateRateLimitOnce()
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw createClassifiedError(new Error('Not authenticated'))

      const rows = dishes.map(d => ({
        restaurant_id: restaurantId,
        name: d.name.trim(),
        category: d.category.toLowerCase(),
        price: d.price != null && d.price !== '' ? parseFloat(d.price) : null,
        created_by: user.id,
      }))

      const { data, error } = await supabase
        .from('dishes')
        .insert(rows)
        .select()

      if (error) {
        logger.error('Error bulk adding dishes:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error in bulkAddDishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Delete a dish (hard delete, RLS protects non-managers)
   * @param {string} dishId
   */
  async deleteDish(dishId) {
    try {
      // { count: 'exact' } makes the server return affected row count so we
      // can distinguish "deleted" from "RLS silently blocked" (0 rows).
      const { error, count } = await supabase
        .from('dishes')
        .delete({ count: 'exact' })
        .eq('id', dishId)

      if (error) {
        logger.error('Error deleting dish:', error)
        throw createClassifiedError(error)
      }
      if (count === 0) {
        // RLS rejected: manager-scoped delete requires total_votes = 0
        const err = new Error(
          "This dish has community ratings and can't be removed. Contact support if it needs to be taken down."
        )
        err.type = ErrorTypes.UNAUTHORIZED
        throw err
      }
    } catch (error) {
      logger.error('Error in deleteDish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
