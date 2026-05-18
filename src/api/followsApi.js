import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { sanitizeSearchQuery } from '../utils/sanitize'
import { logger } from '../utils/logger'

/**
 * Shared paginated follows query.
 * @param {string} userId - User ID
 * @param {'followers'|'following'} direction - Which direction to query
 * @param {Object} options
 * @param {number} options.limit - Page size (default 20)
 * @param {string|null} options.cursor - Cursor for pagination
 * @returns {Promise<{users: Array, hasMore: boolean}>}
 */
async function _paginateFollows(userId, direction, { limit = 20, cursor = null } = {}) {
  const isFollowers = direction === 'followers'
  const filterCol = isFollowers ? 'followed_id' : 'follower_id'
  const selectCol = isFollowers ? 'follower_id' : 'followed_id'

  let query = supabase
    .from('follows')
    .select(`${selectCol}, created_at`)
    .eq(filterCol, userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: followData, error: followError } = await query

  if (followError) {
    throw createClassifiedError(followError)
  }

  if (!followData || followData.length === 0) {
    return { users: [], hasMore: false }
  }

  const hasMore = followData.length > limit
  const results = hasMore ? followData.slice(0, limit) : followData

  const userIds = results.map(f => f[selectCol])
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, follower_count')
    .in('id', userIds)

  if (profileError) {
    logger.warn('Error fetching follower profiles:', profileError)
    // Continue without profile data
  }

  const profileMap = {}
  ;(profiles || []).forEach(p => { profileMap[p.id] = p })

  const users = results.map(f => ({
    id: f[selectCol],
    display_name: profileMap[f[selectCol]]?.display_name || 'Anonymous',
    avatar_url: profileMap[f[selectCol]]?.avatar_url || null,
    follower_count: profileMap[f[selectCol]]?.follower_count || 0,
    followed_at: f.created_at,
  }))

  return { users, hasMore }
}

/**
 * Server-side ranked search of a user's followers/following list.
 * Uses search_user_follows RPC with (display_name, id) cursor pagination.
 * @param {string} userId - User whose follow list to search
 * @param {'followers'|'following'} direction - Which side of the follows table
 * @param {Object} options
 * @param {string} options.query - Raw user-typed query
 * @param {{display_name: string, id: string}|null} options.cursor - Cursor from prior page
 * @param {number} options.limit - Page size (default 20)
 * @returns {Promise<{users: Array, hasMore: boolean}>}
 */
async function _searchFollows(userId, direction, { query, cursor = null, limit = 20 } = {}) {
  try {
    if (!query?.trim()) return { users: [], hasMore: false }
    const sanitized = sanitizeSearchQuery(query, 50)
    // After sanitization, % and _ become \% / \_. If the only "content" is escape
    // sequences (no real searchable characters), there's nothing to match — bail
    // out before hitting the RPC. Strip escaped LIKE/ILIKE metachars to check.
    const searchable = sanitized.replace(/\\[%_\\]/g, '')
    if (!sanitized || !searchable) return { users: [], hasMore: false }
    // Min 2 chars (matches searchUsers convention). Single-char queries are
    // ambiguous and don't benefit from the trigram index — degrade to scan.
    if (searchable.length < 2) return { users: [], hasMore: false }

    const { data, error } = await supabase.rpc('search_user_follows', {
      p_user_id: userId,
      p_direction: direction,
      p_query: sanitized,
      p_cursor_name: cursor?.display_name || null,
      p_cursor_id: cursor?.id || null,
      p_limit: limit + 1,
    })
    if (error) throw createClassifiedError(error)

    const rows = data || []
    const hasMore = rows.length > limit
    const users = (hasMore ? rows.slice(0, limit) : rows).map(r => ({
      id: r.id,
      display_name: r.display_name || 'Anonymous',
      avatar_url: r.avatar_url || null,
      follower_count: r.follower_count || 0,
      followed_at: r.followed_at,
    }))
    return { users, hasMore }
  } catch (error) {
    logger.error('searchFollows error:', error)
    throw error.type ? error : createClassifiedError(error)
  }
}

/**
 * Follows API - Social connections
 */

export const followsApi = {
  /**
   * Follow a user
   * @param {string} followedId - User ID to follow
   * @returns {Promise<void>}
   * @throws {Error} Not authenticated, self-follow, or API error
   */
  async follow(followedId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('Not authenticated')
    }

    if (user.id === followedId) {
      throw new Error('Cannot follow yourself')
    }

    const { error } = await supabase
      .from('follows')
      .insert({
        follower_id: user.id,
        followed_id: followedId,
      })

    if (error) {
      // Handle duplicate follow gracefully - not an error
      if (error.code === '23505') {
        return // Already following, success
      }
      throw createClassifiedError(error)
    }
  },

  /**
   * Unfollow a user
   * @param {string} followedId - User ID to unfollow
   * @returns {Promise<void>}
   * @throws {Error} Not authenticated or API error
   */
  async unfollow(followedId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('Not authenticated')
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('followed_id', followedId)

    if (error) {
      throw createClassifiedError(error)
    }
  },

  /**
   * Check if current user follows another user
   * @param {string} followedId - User ID to check
   * @returns {Promise<boolean>}
   */
  async isFollowing(followedId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('followed_id', followedId)
      .maybeSingle()

    if (error) {
      logger.error('Error checking follow status:', error)
      throw createClassifiedError(error)
    }

    return !!data
  },

  /**
   * Batch-check which of the given user IDs the current user follows.
   * @param {string[]} userIds
   * @returns {Promise<Set<string>>}
   */
  async getFollowStatuses(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return new Set()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return new Set()

      const { data, error } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', user.id)
        .in('followed_id', userIds)

      if (error) throw createClassifiedError(error)
      return new Set((data || []).map(r => r.followed_id))
    } catch (error) {
      logger.error('getFollowStatuses error:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get followers of a user with cursor-based pagination.
   * When options.searchQuery is provided, routes to ranked server-side search
   * (search_user_follows RPC); otherwise returns recency-ordered followers.
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @param {number} options.limit - Max results per page (default 20)
   * @param {string|{display_name: string, id: string}} options.cursor - Recency mode: created_at timestamp of last item. Search mode: {display_name, id} of last item.
   * @param {string} options.searchQuery - Optional query to filter the follow list
   * @returns {Promise<{users: Array, hasMore: boolean}>}
   */
  async getFollowers(userId, options) {
    // String-presence check (not truthy) so callers can signal "search mode,
    // empty input" by passing searchQuery: '' (a typed-then-cleared input
    // box should not silently fall back to the unfiltered list).
    // Explicit undefined/null still falls through to recency pagination —
    // useful for hooks that conditionally build options objects.
    if (options && typeof options.searchQuery === 'string') {
      return _searchFollows(userId, 'followers', {
        query: options.searchQuery,
        cursor: options.cursor,
        limit: options.limit,
      })
    }
    return _paginateFollows(userId, 'followers', options)
  },

  /**
   * Get users that a user follows with cursor-based pagination.
   * When options.searchQuery is provided, routes to ranked server-side search
   * (search_user_follows RPC); otherwise returns recency-ordered following list.
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @param {number} options.limit - Max results per page (default 20)
   * @param {string|{display_name: string, id: string}} options.cursor - Recency mode: created_at timestamp of last item. Search mode: {display_name, id} of last item.
   * @param {string} options.searchQuery - Optional query to filter the follow list
   * @returns {Promise<{users: Array, hasMore: boolean}>}
   */
  async getFollowing(userId, options) {
    if (options && typeof options.searchQuery === 'string') {
      return _searchFollows(userId, 'following', {
        query: options.searchQuery,
        cursor: options.cursor,
        limit: options.limit,
      })
    }
    return _paginateFollows(userId, 'following', options)
  },

  /**
   * Get follow counts for a user (counted live from follows table)
   * @param {string} userId - User ID
   * @returns {Promise<{followers: number, following: number}>}
   */
  async getFollowCounts(userId) {
    // Count followers and following in parallel (independent queries)
    const [
      { count: followerCount, error: followerError },
      { count: followingCount, error: followingError },
    ] = await Promise.all([
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('followed_id', userId),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId),
    ])

    if (followerError || followingError) {
      logger.error('Error fetching follow counts:', followerError || followingError)
      throw createClassifiedError(followerError || followingError)
    }

    return {
      followers: followerCount || 0,
      following: followingCount || 0,
    }
  },

  /**
   * Get taste compatibility between current user and another user
   * @param {string} otherUserId - The other user's ID
   * @returns {Promise<{shared_dishes: number, avg_difference: number, compatibility_pct: number|null}>}
   */
  async getTasteCompatibility(otherUserId) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { shared_dishes: 0, avg_difference: null, compatibility_pct: null }

      const { data, error } = await supabase
        .rpc('get_taste_compatibility', {
          p_user_id: user.id,
          p_other_user_id: otherUserId,
        })

      if (error) {
        logger.error('Error fetching taste compatibility:', error)
        throw createClassifiedError(error)
      }

      // RPC returns an array with one row
      return data?.[0] || { shared_dishes: 0, avg_difference: null, compatibility_pct: null }
    } catch (err) {
      logger.error('Unexpected error in getTasteCompatibility:', err)
      throw err
    }
  },

  /**
   * Batch taste compatibility for a list of friends. One RPC for the whole
   * friends-here surface so the per-friend chip renders without N+1.
   * @param {string[]} friendIds - Array of user IDs
   * @returns {Promise<Map<string, { shared_dishes: number, compatibility_pct: number|null }>>}
   */
  async getTasteCompatibilityForFriends(friendIds) {
    if (!Array.isArray(friendIds) || friendIds.length === 0) return new Map()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return new Map()

      const { data, error } = await supabase
        .rpc('get_taste_compatibility_for_friends', {
          p_user_id: user.id,
          p_friend_ids: friendIds,
        })

      if (error) {
        logger.error('Error fetching batch taste compatibility:', error)
        throw createClassifiedError(error)
      }

      const map = new Map()
      ;(data || []).forEach(row => {
        map.set(row.user_id, {
          shared_dishes: row.shared_dishes,
          compatibility_pct: row.compatibility_pct,
        })
      })
      return map
    } catch (err) {
      logger.error('Unexpected error in getTasteCompatibilityForFriends:', err)
      throw err
    }
  },

  /**
   * Get friends (people you follow) who voted on dishes at a restaurant
   * @param {string} restaurantId - Restaurant ID
   * @returns {Promise<Array>}
   */
  async getFriendsVotesForRestaurant(restaurantId) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .rpc('get_friends_votes_for_restaurant', {
          p_user_id: user.id,
          p_restaurant_id: restaurantId,
        })

      if (error) {
        logger.error('Error fetching friends votes for restaurant:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (err) {
      logger.error('Unexpected error in getFriendsVotesForRestaurant:', err)
      throw err
    }
  },

  /**
   * Get friends (people you follow) who voted on a dish
   * @param {string} dishId - Dish ID
   * @returns {Promise<Array>}
   */
  async getFriendsVotesForDish(dishId) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .rpc('get_friends_votes_for_dish', {
          p_user_id: user.id,
          p_dish_id: dishId,
        })

      if (error) {
        logger.error('Error fetching friends votes:', error)
        throw createClassifiedError(error)
      }

      return data || []
    } catch (err) {
      logger.error('Unexpected error in getFriendsVotesForDish:', err)
      throw err
    }
  },

  /**
   * Search users by name
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Promise<Array>}
   */
  async searchUsers(query, limit = 10) {
    try {
      if (!query?.trim() || query.length < 2) return []

      // Sanitize query to prevent SQL injection via LIKE patterns (defense in
      // depth — the RPC also trims and the ILIKE pattern itself is parameterized).
      const sanitized = sanitizeSearchQuery(query, 50)
      if (!sanitized || sanitized.length < 2) return []

      // Server-side ranked search. Joins follower counts inline and orders
      // before LIMIT, so the top-N really is the top-N by follower count.
      // Prior client-side approach pre-limited the substring match and then
      // sorted in JS — a high-follower user could be invisible if 20+ low-
      // follower users alphabetically preceded them.
      const { data, error } = await supabase.rpc('search_users_with_followers', {
        p_query: sanitized,
        p_limit: limit,
      })

      if (error) {
        logger.error('Error searching users:', error)
        throw createClassifiedError(error)
      }

      // RPC returns rows shaped exactly as the consumer expects: id,
      // display_name, avatar_url, follower_count.
      return data || []
    } catch (err) {
      logger.error('Unexpected error in searchUsers:', err)
      throw err
    }
  },

  /**
   * Get a user's public profile data
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>}
   */
  async getUserProfile(userId) {
    // Run all independent queries in parallel for faster loading
    const [
      profileResult,
      followerResult,
      followingResult,
      votesResult,
      badgesResult,
    ] = await Promise.all([
      // 1. Get basic profile info. maybeSingle so a stale share link to a
      // deleted user returns null cleanly instead of an unhandled PGRST116.
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', userId)
        .maybeSingle(),
      // 2. Get follower count
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('followed_id', userId),
      // 3. Get following count
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId),
      // 4. Get votes with dish info (includes data for stats calculation)
      supabase
        .from('votes')
        .select(`
          rating_10,
          created_at,
          dishes (
            id,
            name,
            photo_url,
            category,
            avg_rating,
            restaurants (
              id,
              name
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      // 5. Get badges
      supabase.rpc('get_user_badges', { p_user_id: userId, p_public_only: false }),
    ])

    // Check for profile error or not-found. Callers (UserProfile page)
    // surface "user not found" UI from a null return.
    if (profileResult.error || !profileResult.data) {
      return null
    }

    const profile = profileResult.data
    profile.follower_count = followerResult.count || 0
    profile.following_count = followingResult.count || 0

    // Calculate stats from votes (no separate query needed).
    // Rating-only display — the Worth-It/Avoid split retired with the binary vote.
    const voteList = votesResult.data || []
    const totalVotes = voteList.length
    const ratedVotes = voteList.filter(v => v.rating_10 != null)
    const avgRating = ratedVotes.length > 0
      ? Math.round((ratedVotes.reduce((sum, v) => sum + v.rating_10, 0) / ratedVotes.length) * 10) / 10
      : null

    const badges = badgesResult.data || []

    // Map badge_key to key for consistency with UI
    const mappedBadges = badges.map(b => ({
      key: b.badge_key,
      name: b.name,
      subtitle: b.subtitle,
      description: b.description,
      icon: b.icon,
      unlocked_at: b.unlocked_at,
    }))

    return {
      ...profile,
      stats: {
        total_votes: totalVotes,
        avg_rating: avgRating,
      },
      recent_votes: voteList.map(v => ({
        rating: v.rating_10,
        voted_at: v.created_at,
        dish: v.dishes ? {
          id: v.dishes.id,
          name: v.dishes.name,
          photo_url: v.dishes.photo_url,
          category: v.dishes.category,
          avg_rating: v.dishes.avg_rating,
          restaurant_name: v.dishes.restaurants?.name,
          restaurant_id: v.dishes.restaurants?.id,
        } : null,
      })),
      badges: mappedBadges,
    }
  },
}
