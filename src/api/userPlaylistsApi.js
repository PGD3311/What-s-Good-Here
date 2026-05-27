import { supabase } from '../lib/supabase'
import { logger } from '../utils/logger'
import { createClassifiedError } from '../utils/errorHandler'
import { validateUserContent } from '../lib/reviewBlocklist'
import {
  checkPlaylistCreateRateLimit,
  checkPlaylistItemAddRateLimit,
  checkPlaylistFollowRateLimit,
} from '../lib/rateLimiter'

// "Too many" is the magic phrase classifyError() uses to tag RATE_LIMIT.
function rateLimitError(retryAfterMs) {
  const secs = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return new Error(`Too many requests — try again in ${secs}s`)
}

function contentError(msg) {
  const e = new Error(msg)
  e.type = 'VALIDATION'
  return e
}

export const userPlaylistsApi = {
  async create({ title, description, isPublic }) {
    const rl = checkPlaylistCreateRateLimit()
    if (!rl.allowed) throw rateLimitError(rl.retryAfterMs)
    const titleErr = validateUserContent(title, 'Playlist title')
    if (titleErr) throw contentError(titleErr)
    if (description) {
      const descErr = validateUserContent(description, 'Description')
      if (descErr) throw contentError(descErr)
    }
    try {
      const { data, error } = await supabase.rpc('create_user_playlist', {
        p_title: title,
        p_description: description ?? null,
        p_is_public: isPublic ?? true,
      })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('userPlaylistsApi.create:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async update(id, { title, description, isPublic } = {}) {
    if (title != null) {
      const titleErr = validateUserContent(title, 'Playlist title')
      if (titleErr) throw contentError(titleErr)
    }
    if (description) {
      const descErr = validateUserContent(description, 'Description')
      if (descErr) throw contentError(descErr)
    }
    try {
      const { data, error } = await supabase.rpc('update_user_playlist', {
        p_id: id,
        p_title: title ?? null,
        p_description: description ?? null,
        p_is_public: isPublic ?? null,
      })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('userPlaylistsApi.update:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async remove(id) {
    try {
      const { error } = await supabase.rpc('delete_user_playlist', { p_id: id })
      if (error) throw createClassifiedError(error)
    } catch (error) {
      logger.error('userPlaylistsApi.remove:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async addDish(playlistId, dishId, note) {
    const rl = checkPlaylistItemAddRateLimit()
    if (!rl.allowed) throw rateLimitError(rl.retryAfterMs)
    if (note) {
      const noteErr = validateUserContent(note, 'Note')
      if (noteErr) throw contentError(noteErr)
    }
    try {
      const { data, error } = await supabase.rpc('add_dish_to_playlist', {
        p_playlist_id: playlistId,
        p_dish_id: dishId,
        p_note: note ?? null,
      })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('userPlaylistsApi.addDish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async cloneLocalList(curatorUserId) {
    if (!curatorUserId) throw contentError('Missing curator')
    const rl = checkPlaylistCreateRateLimit()
    if (!rl.allowed) throw rateLimitError(rl.retryAfterMs)
    try {
      const { data, error } = await supabase.rpc('clone_local_list_to_playlist', {
        p_curator_user_id: curatorUserId,
      })
      if (error) throw createClassifiedError(error)
      const row = Array.isArray(data) ? data[0] : data
      return {
        playlistId: row?.playlist_id,
        copiedCount: row?.copied_count ?? 0,
        slug: row?.slug,
        title: row?.title,
      }
    } catch (error) {
      logger.error('userPlaylistsApi.cloneLocalList:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async removeDish(playlistId, dishId) {
    try {
      const { error } = await supabase.rpc('remove_dish_from_playlist', {
        p_playlist_id: playlistId,
        p_dish_id: dishId,
      })
      if (error) throw createClassifiedError(error)
    } catch (error) {
      logger.error('userPlaylistsApi.removeDish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async reorder(playlistId, orderedDishIds) {
    try {
      const { error } = await supabase.rpc('reorder_playlist_items', {
        p_playlist_id: playlistId,
        p_ordered_dish_ids: orderedDishIds,
      })
      if (error) throw createClassifiedError(error)
    } catch (error) {
      logger.error('userPlaylistsApi.reorder:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async updateItemNote(playlistId, dishId, note) {
    if (note) {
      const noteErr = validateUserContent(note, 'Note')
      if (noteErr) throw contentError(noteErr)
    }
    try {
      const { data, error } = await supabase.rpc('update_playlist_item_note', {
        p_playlist_id: playlistId,
        p_dish_id: dishId,
        p_note: note ?? null,
      })
      if (error) throw createClassifiedError(error)
      return data
    } catch (error) {
      logger.error('userPlaylistsApi.updateItemNote:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async follow(playlistId) {
    const rl = checkPlaylistFollowRateLimit()
    if (!rl.allowed) throw rateLimitError(rl.retryAfterMs)
    try {
      const { error } = await supabase.rpc('follow_playlist', { p_playlist_id: playlistId })
      if (error) throw createClassifiedError(error)
    } catch (error) {
      logger.error('userPlaylistsApi.follow:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async unfollow(playlistId) {
    try {
      const { error } = await supabase.rpc('unfollow_playlist', { p_playlist_id: playlistId })
      if (error) throw createClassifiedError(error)
    } catch (error) {
      logger.error('userPlaylistsApi.unfollow:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getDetail(id) {
    try {
      const { data, error } = await supabase.rpc('get_playlist_detail', { p_playlist_id: id })
      if (error) throw createClassifiedError(error)
      return data?.[0] ?? null
    } catch (error) {
      logger.error('userPlaylistsApi.getDetail:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getByUser(userId) {
    try {
      const { data, error } = await supabase.rpc('get_user_playlists', { p_user_id: userId })
      if (error) throw createClassifiedError(error)
      return data ?? []
    } catch (error) {
      logger.error('userPlaylistsApi.getByUser:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getFollowed() {
    try {
      const { data, error } = await supabase.rpc('get_followed_playlists')
      if (error) throw createClassifiedError(error)
      return data ?? []
    } catch (error) {
      logger.error('userPlaylistsApi.getFollowed:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getDishMembership(dishId) {
    try {
      const { data, error } = await supabase.rpc('get_dish_playlist_membership', { p_dish_id: dishId })
      if (error) throw createClassifiedError(error)
      return data ?? []
    } catch (error) {
      logger.error('userPlaylistsApi.getDishMembership:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}
