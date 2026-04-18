import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'

export const blocksApi = {
  async blockUser(blockedId) {
    try {
      if (!blockedId) {
        throw new Error('User to block is required')
      }

      const { data, error } = await supabase.rpc('block_user', {
        p_blocked_id: blockedId,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Could not block this user')
      }

      return { success: true }
    } catch (error) {
      logger.error('blocksApi.blockUser failed:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async unblockUser(blockedId) {
    try {
      if (!blockedId) {
        throw new Error('User to unblock is required')
      }

      const { data, error } = await supabase.rpc('unblock_user', {
        p_blocked_id: blockedId,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Could not unblock this user')
      }

      return { success: true }
    } catch (error) {
      logger.error('blocksApi.unblockUser failed:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getMyBlocks() {
    try {
      const { data, error } = await supabase.rpc('get_my_blocks')

      if (error) {
        throw createClassifiedError(error)
      }

      return (data || []).map((row) => ({
        blockedId: row.blocked_id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        blockedAt: row.blocked_at,
      }))
    } catch (error) {
      logger.error('blocksApi.getMyBlocks failed:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
