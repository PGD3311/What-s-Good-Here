import { supabase } from '../lib/supabase'
import { logger } from '../utils/logger'
import { createClassifiedError } from '../utils/errorHandler'
import { validateUserContent } from '../lib/reviewBlocklist'

function validateContentField(value, label) {
  const contentError = validateUserContent(value, label)
  if (contentError) throw new Error(contentError)
}

export const localListsApi = {
  async getForHomepage(viewerId) {
    try {
      const params = viewerId ? { p_viewer_id: viewerId } : {}
      const { data, error } = await supabase.rpc('get_local_lists_for_homepage', params)
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local lists for homepage:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getConsensus() {
    try {
      const { data, error } = await supabase.rpc('get_local_picks_consensus')
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local picks consensus:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getCurators() {
    try {
      const { data, error } = await supabase.rpc('get_local_picks_curators')
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local picks curators:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async searchPicks(query) {
    try {
      const trimmed = (query || '').trim()
      if (!trimmed) return []
      const { data, error } = await supabase.rpc('search_local_picks', { p_query: trimmed })
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to search local picks:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getByUser(userId) {
    try {
      const { data, error } = await supabase.rpc('get_local_list_by_user', { target_user_id: userId })
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch local list for user:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getCuratorInviteDetails(token) {
    try {
      const { data, error } = await supabase.rpc('get_curator_invite_details', { p_token: token })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Failed to fetch curator invite details:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async acceptCuratorInvite(token) {
    try {
      const { data, error } = await supabase.rpc('accept_curator_invite', { p_token: token })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Failed to accept curator invite:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getMyList() {
    try {
      const { data, error } = await supabase.rpc('get_my_local_list')
      if (error) throw createClassifiedError(error)
      return data || []
    } catch (error) {
      logger.error('Failed to fetch my local list:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async addDishToMyList(dishId) {
    try {
      const { data, error } = await supabase.rpc('add_dish_to_my_local_list', { p_dish_id: dishId })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Failed to add dish to my local list:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async saveMyList({ tagline, items }) {
    try {
      validateContentField(tagline, 'Curator tagline')
      for (const item of (items || [])) {
        validateContentField(item.note, 'Local list note')
      }

      const { data, error } = await supabase.rpc('save_my_local_list', {
        p_tagline: tagline || null,
        p_items: JSON.stringify(items),
      })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('Failed to save local list:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
