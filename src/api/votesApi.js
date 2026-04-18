import { supabase } from '../lib/supabase'
import { capture } from '../lib/analytics'
import { checkVoteRateLimit } from '../lib/rateLimiter'
import { containsBlockedContent } from '../lib/reviewBlocklist'
import { MAX_REVIEW_LENGTH } from '../constants/app'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'
import { jitterApi } from './jitterApi'

/**
 * Votes API - Centralized data fetching and mutation for votes
 */

async function getAuthenticatedUser() {
  var { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('You must be logged in to vote')
  }

  return user
}

async function checkVoteRateLimitOnce() {
  var clientRateLimit = checkVoteRateLimit()
  if (!clientRateLimit.allowed) {
    throw new Error(clientRateLimit.message)
  }

  var { data: serverRateLimit, error: rateLimitError } = await supabase
    .rpc('check_vote_rate_limit')

  if (rateLimitError) {
    logger.error('Vote rate limit check failed:', rateLimitError)
    throw new Error('Unable to verify vote limit. Please try again.')
  }

  if (serverRateLimit && !serverRateLimit.allowed) {
    throw new Error(serverRateLimit.message || 'Too many votes. Please wait.')
  }
}

function normalizeVotePayload({ dishId, rating10 = null, reviewText = null, purityData = null, jitterData = null, jitterScore = null, badgeHash = null }) {
  if (!dishId) {
    throw new Error('Dish is required')
  }

  if (rating10 != null && (rating10 < 0 || rating10 > 10)) {
    throw new Error('Rating must be between 0 and 10')
  }

  if (reviewText) {
    if (reviewText.length > MAX_REVIEW_LENGTH) {
      throw new Error(`Review is ${reviewText.length - MAX_REVIEW_LENGTH} characters over limit`)
    }

    if (containsBlockedContent(reviewText)) {
      throw new Error('Review contains inappropriate content. Please revise.')
    }
  }

  return {
    dishId,
    rating10,
    reviewText: reviewText?.trim() || null,
    purityData,
    jitterData,
    jitterScore,
    badgeHash,
  }
}

async function upsertVoteRecord({ userId, dishId, rating10, reviewText, purityData, jitterData, jitterScore, badgeHash }) {
  var { data: vote, error } = await supabase.rpc('submit_vote_atomic', {
    p_dish_id: dishId,
    p_user_id: userId,
    p_rating_10: rating10,
    p_review_text: reviewText,
    p_purity_score: purityData && purityData.purity != null ? purityData.purity : null,
    p_war_score: jitterScore && jitterScore.score != null ? jitterScore.score : null,
    p_badge_hash: badgeHash || null,
  })

  if (error) {
    throw createClassifiedError(error)
  }

  if (jitterData) {
    try {
      var sampleRow = {
        user_id: userId,
        sample_data: jitterData,
      }

      if (jitterScore) {
        sampleRow.liveness_score = jitterScore.score
        sampleRow.flags = jitterScore.flags
      }

      await supabase.from('jitter_samples').insert(sampleRow)
    } catch (jitterErr) {
      logger.warn('Jitter sample submission failed:', jitterErr)
    }
  }

  capture('rating_submitted', {
    dish_id: dishId,
    rating: rating10,
    has_review: !!reviewText,
  })

  return { success: true, vote }
}

export const votesApi = {
  /**
   * Submit or update a vote for a dish
   * @param {Object} params
   * @param {string} params.dishId - Dish ID
   * @param {number} params.rating10 - 1-10 rating (sole vote signal)
   * @param {string} params.reviewText - Optional review text (max 200 chars)
   * @returns {Promise<Object>} Success status
   */
  async submitVote({ dishId, rating10 = null, reviewText = null, purityData = null, jitterData = null, jitterScore = null, badgeHash = null }) {
    try {
      var user = await getAuthenticatedUser()
      await checkVoteRateLimitOnce()

      return await upsertVoteRecord({
        userId: user.id,
        ...normalizeVotePayload({
          dishId,
          rating10,
          reviewText,
          purityData,
          jitterData,
          jitterScore,
          badgeHash,
        }),
      })
    } catch (error) {
      logger.error('Error submitting vote:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Submit multiple votes sequentially with per-vote rate-limit checks
   * @param {Object} params
   * @param {Array<Object>} params.votes - Vote payloads matching submitVote shape
   * @returns {Promise<Object>} Submission result with count metadata
   */
  async submitBatchVotes({ votes }) {
    try {
      if (!Array.isArray(votes) || votes.length === 0) {
        throw new Error('Select at least one dish to rate')
      }

      var normalizedVotes = votes.map(function (vote) {
        return normalizeVotePayload(vote)
      })

      var user = await getAuthenticatedUser()

      var submittedDishIds = []

      for (var i = 0; i < normalizedVotes.length; i += 1) {
        try {
          await checkVoteRateLimitOnce()
          await upsertVoteRecord({
            userId: user.id,
            ...normalizedVotes[i],
          })
          submittedDishIds.push(normalizedVotes[i].dishId)
        } catch (error) {
          var classifiedError = error.type ? error : createClassifiedError(error)
          classifiedError.submittedCount = submittedDishIds.length
          classifiedError.submittedDishIds = submittedDishIds.slice()
          throw classifiedError
        }
      }

      return {
        success: true,
        submittedCount: submittedDishIds.length,
        submittedDishIds,
      }
    } catch (error) {
      logger.error('Error submitting batch votes:', error)

      if (error.type) {
        throw error
      }

      var classifiedError = createClassifiedError(error)
      if (error.submittedCount != null) {
        classifiedError.submittedCount = error.submittedCount
        classifiedError.submittedDishIds = error.submittedDishIds
      }
      throw classifiedError
    }
  },

  /**
   * Get all votes for the current user
   * @returns {Promise<Object>} Map of dish IDs to vote data
   */
  async getUserVotes() {
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return {}
      }

      var { data, error } = await supabase
        .from('votes')
        .select('dish_id, rating_10')
        .eq('user_id', user.id)

      if (error) {
        throw createClassifiedError(error)
      }

      // Return as a map for easy lookup
      return (data || []).reduce((acc, vote) => {
        acc[vote.dish_id] = {
          rating10: vote.rating_10,
        }
        return acc
      }, {})
    } catch (error) {
      logger.error('Error fetching user votes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get detailed votes for a user with dish and restaurant info
   * Limited to most recent 500 votes for performance
   * @param {string} userId - User ID
   * @param {number} limit - Max votes to fetch (default 500)
   * @returns {Promise<Array>} Array of votes with dish details
   */
  async getDetailedVotesForUser(userId, limit = 500) {
    try {
      if (!userId) {
        return []
      }

      var { data, error } = await supabase
        .from('votes')
        .select(`
          id,
          rating_10,
          review_text,
          created_at,
          dishes (
            id,
            name,
            category,
            price,
            photo_url,
            avg_rating,
            total_votes,
            restaurants (name, town)
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('Error fetching detailed votes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Delete a vote for a dish
   * @param {string} dishId - Dish ID
   * @returns {Promise<Object>} Success status
   */
  async deleteVote(dishId) {
    try {
      var { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('dish_id', dishId)
        .eq('user_id', user.id)

      if (error) {
        throw createClassifiedError(error)
      }

      return { success: true }
    } catch (error) {
      logger.error('Error deleting vote:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get count of ranked dishes (5+ votes) that a user has voted on
   * Uses dishes.total_votes instead of counting votes table (O(1) vs O(n))
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of dishes helped rank
   */
  async getDishesHelpedRank(userId) {
    try {
      if (!userId) {
        return 0
      }

      // Single query: get user's votes with dish total_votes via JOIN
      const { data, error } = await supabase
        .from('votes')
        .select('dish_id, dishes(total_votes)')
        .eq('user_id', userId)

      if (error) throw createClassifiedError(error)
      if (!data?.length) return 0

      // Count dishes with 5+ votes (using pre-computed total_votes)
      const rankedCount = data.filter(v => (v.dishes?.total_votes || 0) >= 5).length
      return rankedCount
    } catch (error) {
      logger.error('Error getting dishes helped rank:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all reviews for a dish with user info
   * @param {string} dishId - Dish ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of reviews with user info
   */
  async getReviewsForDish(dishId, { limit = 10, offset = 0 } = {}) {
    try {
      // Fetch reviews (votes.user_id -> auth.users, not profiles, so no direct join)
      const { data, error } = await supabase
        .from('public_votes')
        .select(`
          id,
          review_text,
          rating_10,
          review_created_at,
          user_id,
          source
        `)
        .eq('dish_id', dishId)
        .not('review_text', 'is', null)
        .neq('review_text', '')
        .order('review_created_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1)

      if (error) {
        logger.error('Error fetching reviews for dish:', error)
        throw createClassifiedError(error)
      }

      if (!data?.length) return []

      // Enrich with profile display names and jitter badges in parallel (independent queries)
      const userIds = [...new Set(data.map(v => v.user_id).filter(Boolean))]
      const [profileResult, jitterResult] = userIds.length
        ? await Promise.all([
            supabase.from('profiles').select('id, display_name').in('id', userIds),
            supabase.rpc('get_jitter_badges', { p_user_ids: userIds }),
          ])
        : [{ data: [] }, { data: [] }]
      if (profileResult.error) logger.warn('Error fetching reviewer profiles:', profileResult.error)
      if (jitterResult.error) logger.warn('Error fetching jitter badges:', jitterResult.error)
      const profiles = profileResult.data || []
      const jitterData = jitterResult.data || []
      const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))

      const jitterMap = {}
      if (jitterData) {
        for (const j of jitterData) {
          jitterMap[j.user_id] = j
        }
      }

      // Enrich reviews with profiles and trust badges
      return data.map(review => ({
        ...review,
        profiles: profileMap[review.user_id] || { id: review.user_id, display_name: null },
        trust_badge: review.source === 'ai_estimated'
          ? 'ai_estimated'
          : jitterApi.getTrustBadgeType(jitterMap[review.user_id] || null),
        jitter_profile: jitterMap[review.user_id] || null,
        verify_url: null,
      }))
    } catch (error) {
      logger.error('Error fetching reviews for dish:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get smart snippet for a dish (best review to show on card)
   * Priority: 9+ rated reviews first, then most recent
   * @param {string} dishId - Dish ID
   * @returns {Promise<Object|null>} Best review or null
   */
  async getSmartSnippetForDish(dishId) {
    try {
      // Fetch best review (no direct FK from votes -> profiles)
      const { data, error } = await supabase
        .from('public_votes')
        .select(`
          review_text,
          rating_10,
          review_created_at,
          user_id
        `)
        .eq('dish_id', dishId)
        .not('review_text', 'is', null)
        .neq('review_text', '')
        .order('rating_10', { ascending: false, nullsFirst: false })
        .order('review_created_at', { ascending: false, nullsFirst: false })
        .limit(1)

      if (error) {
        logger.error('Error fetching smart snippet:', error)
        return null // Graceful degradation
      }

      const review = data?.[0]
      if (!review) return null

      // Enrich with profile display name
      if (review.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('id', review.user_id)
          .maybeSingle()
        review.profiles = profile || { id: review.user_id, display_name: null }
      }

      return review
    } catch (error) {
      logger.error('Error fetching smart snippet:', error)
      return null // Graceful degradation - don't break the UI
    }
  },

  /**
   * Get community averages for a set of dishes
   * @param {string[]} dishIds - Array of dish IDs
   * @returns {Promise<Object>} Map of dish ID to { avg, count }
   */
  async getCommunityAvgsForDishes(dishIds) {
    try {
      if (!dishIds || dishIds.length === 0) return {}

      const { data, error } = await supabase
        .from('public_votes')
        .select('dish_id, rating_10')
        .in('dish_id', dishIds)
        .not('rating_10', 'is', null)

      if (error) {
        throw createClassifiedError(error)
      }

      // Aggregate client-side: group by dish_id, compute avg and count
      const grouped = {}
      for (const row of (data || [])) {
        if (!grouped[row.dish_id]) {
          grouped[row.dish_id] = { sum: 0, count: 0 }
        }
        grouped[row.dish_id].sum += row.rating_10
        grouped[row.dish_id].count += 1
      }

      const result = {}
      for (const [dishId, { sum, count }] of Object.entries(grouped)) {
        result[dishId] = { avg: sum / count, count }
      }
      return result
    } catch (error) {
      logger.error('Error fetching community averages:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get all reviews written by a user with dish info
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Array of reviews with dish info
   */
  /**
   * Get current user's ratings for specific dishes (for comparison on other profiles)
   * @param {string[]} dishIds - Array of dish IDs
   * @returns {Promise<Object>} Map of dish ID to rating_10
   */
  async getMyRatingsForDishes(dishIds) {
    try {
      if (!dishIds || dishIds.length === 0) return {}

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return {}

      const { data, error } = await supabase
        .from('votes')
        .select('dish_id, rating_10')
        .eq('user_id', user.id)
        .in('dish_id', dishIds)

      if (error) throw createClassifiedError(error)

      const ratingsMap = {}
      ;(data || []).forEach(v => { ratingsMap[v.dish_id] = v.rating_10 })
      return ratingsMap
    } catch (error) {
      logger.error('Error fetching my ratings for dishes:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  /**
   * Get review snippets across all dishes at a restaurant.
   * @param {string} restaurantId
   * @param {Object} options
   * @param {number} options.limit - Max results (default 5)
   * @param {string} options.sort - 'rating' (default) or 'newest'
   */
  async getReviewsForRestaurant(restaurantId, { limit = 5, sort = 'rating' } = {}) {
    try {
      if (!restaurantId) return []

      const { data: dishes, error: dishesError } = await supabase
        .from('dishes')
        .select('id, name, restaurant_id')
        .eq('restaurant_id', restaurantId)

      if (dishesError) {
        logger.error('Error fetching restaurant dishes for reviews:', dishesError)
        return []
      }

      const dishMap = Object.fromEntries((dishes || []).map(d => [d.id, d]))
      const dishIds = Object.keys(dishMap)
      if (dishIds.length === 0) return []

      let query = supabase
        .from('public_votes')
        .select(`
          id,
          review_text,
          rating_10,
          review_created_at,
          dish_id,
          user_id
        `)
        .in('dish_id', dishIds)
        .not('review_text', 'is', null)
        .neq('review_text', '')

      if (sort === 'newest') {
        query = query.order('review_created_at', { ascending: false, nullsFirst: false })
      } else {
        query = query.order('rating_10', { ascending: false, nullsFirst: false })
      }

      query = query.range(0, limit - 1)

      const { data, error } = await query

      if (error) {
        logger.error('Error fetching reviews for restaurant:', error)
        return []
      }

      return (data || []).map(function (v) {
        return {
          id: v.id,
          user_id: v.user_id,
          review_text: v.review_text,
          rating: v.rating_10,
          dish_name: dishMap[v.dish_id] ? dishMap[v.dish_id].name : '',
          dish_id: v.dish_id,
          created_at: v.review_created_at,
        }
      })
    } catch (error) {
      logger.error('Error fetching reviews for restaurant:', error)
      return []
    }
  },

  async getReviewsForUser(userId, { limit = 20, offset = 0 } = {}) {
    try {
      if (!userId) {
        return []
      }

      const { data, error } = await supabase
        .from('public_votes')
        .select(`
          id,
          review_text,
          rating_10,
          review_created_at,
          dish_id
        `)
        .eq('user_id', userId)
        .not('review_text', 'is', null)
        .neq('review_text', '')
        .order('review_created_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1)

      if (error) {
        logger.error('Error fetching reviews for user:', error)
        return []
      }

      if (!data?.length) return []

      const dishIds = [...new Set(data.map(review => review.dish_id).filter(Boolean))]
      const { data: dishes, error: dishesError } = dishIds.length
        ? await supabase
            .from('dishes')
            .select(`
              id,
              name,
              photo_url,
              category,
              price,
              restaurants (name, town)
            `)
            .in('id', dishIds)
        : { data: [], error: null }

      if (dishesError) {
        logger.warn('Error fetching dishes for user reviews:', dishesError)
      }

      const dishMap = Object.fromEntries((dishes || []).map(dish => [dish.id, dish]))
      return data.map(review => ({
        ...review,
        dishes: dishMap[review.dish_id] || null,
      }))
    } catch (error) {
      logger.error('Error fetching reviews for user:', error)
      return []
    }
  },
}
