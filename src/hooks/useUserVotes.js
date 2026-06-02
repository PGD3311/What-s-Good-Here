import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { votesApi } from '../api/votesApi'
import { logger } from '../utils/logger'
import { computeRatingStyle, computeStandoutPicks } from '../utils/foodStats'

/**
 * Transform raw vote data to dish format
 */
function transformVote(vote) {
  if (!vote.dishes) return null
  return {
    dish_id: vote.dishes.id,
    dish_name: vote.dishes.name,
    category: vote.dishes.category,
    price: vote.dishes.price,
    photo_url: vote.dishes.photo_url,
    restaurant_name: vote.dishes.restaurants?.name,
    rating_10: vote.rating_10,
    review_text: vote.review_text || null,
    community_avg: vote.dishes.avg_rating,
    total_votes: vote.dishes.total_votes,
    voted_at: vote.created_at,
  }
}

/**
 * Map raw votes to the normalized rated-item shape computeStandoutPicks expects.
 * Skips unrated votes; carries the fields the Food Story render reads. The
 * Best Find / Hottest Take math itself lives in utils/foodStats.js.
 */
function votesToRatedItems(votes) {
  const items = []
  for (const vote of votes) {
    if (vote.rating_10 == null) continue
    items.push({
      dish_id: vote.dishes.id,
      dish_name: vote.dishes.name,
      category: vote.dishes.category,
      restaurant_id: vote.dishes.restaurants?.id,
      restaurant_name: vote.dishes.restaurants?.name,
      userRating: vote.rating_10,
    })
  }
  return items
}

/**
 * Compute category comparison from user votes and community averages
 */
function computeCategoryComparison(data, communityAvgs) {
  const MIN_COMMUNITY_VOTES = 3
  const MIN_DISHES_PER_CATEGORY = 2

  // Group votes by category
  const catGroups = {}
  for (const vote of data) {
    if (vote.rating_10 == null) continue
    const cat = vote.dishes.category
    if (!cat) continue
    if (!catGroups[cat]) catGroups[cat] = []
    catGroups[cat].push(vote)
  }

  const result = {}
  for (const [cat, votes] of Object.entries(catGroups)) {
    // Only include dishes with enough community data
    const withCommunity = votes.filter(v => {
      const c = communityAvgs[v.dishes.id]
      return c && c.count >= MIN_COMMUNITY_VOTES
    })

    if (withCommunity.length < MIN_DISHES_PER_CATEGORY) continue

    const userAvg = withCommunity.reduce((sum, v) => sum + v.rating_10, 0) / withCommunity.length
    const communityAvg = withCommunity.reduce((sum, v) => sum + communityAvgs[v.dishes.id].avg, 0) / withCommunity.length

    result[cat] = {
      userAvg,
      communityAvg,
      difference: userAvg - communityAvg,
    }
  }

  return result
}

/**
 * Calculate stats from votes data
 */
function calculateStats(data) {
  const totalVotes = data.length

  // Real review count = votes that carried written review text. Distinct from
  // jitter_profiles.review_count, which only increments when a review was
  // long enough to emit a keystroke-rhythm sample. The two diverge for short
  // reviews — see HeroIdentityCard for the user-facing split.
  const reviewCount = data.filter(v => v.review_text && v.review_text.trim().length > 0).length

  // Average rating
  const ratingsWithValue = data.filter(v => v.rating_10 != null)
  const avgRating = ratingsWithValue.length > 0
    ? ratingsWithValue.reduce((sum, v) => sum + v.rating_10, 0) / ratingsWithValue.length
    : null

  // Category counts
  const categoryCounts = {}
  data.forEach(v => {
    const cat = v.dishes?.category
    if (cat) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    }
  })
  const topCategory = Object.entries(categoryCounts).length > 0
    ? Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null

  // Top categories: categories with 3+ votes, sorted by count, top 2-3
  const topCategories = Object.entries(categoryCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat)

  // Rating variance (std dev of ratings)
  const ratingVariance = ratingsWithValue.length > 1
    ? Math.sqrt(
        ratingsWithValue.reduce((sum, v) => sum + Math.pow(v.rating_10 - avgRating, 2), 0) / ratingsWithValue.length
      )
    : 0

  // Rating style
  const ratingStyle = computeRatingStyle(avgRating, ratingVariance)

  // Category concentration (Herfindahl index)
  const catValues = Object.values(categoryCounts)
  const catTotal = catValues.reduce((a, b) => a + b, 0)
  const categoryConcentration = catTotal > 0
    ? catValues.reduce((sum, c) => sum + Math.pow(c / catTotal, 2), 0)
    : 0

  // Favorite restaurant (most votes) + visit count + id (for linking)
  const restaurantCounts = {}
  const restaurantIdByName = {}
  data.forEach(v => {
    const name = v.dishes.restaurants?.name
    const id = v.dishes.restaurants?.id
    if (name) {
      restaurantCounts[name] = (restaurantCounts[name] || 0) + 1
      if (id && !restaurantIdByName[name]) restaurantIdByName[name] = id
    }
  })
  const restaurantsSorted = Object.entries(restaurantCounts).sort((a, b) => b[1] - a[1])
  const favoriteRestaurant = restaurantsSorted.length > 0 ? restaurantsSorted[0][0] : null
  const favoriteRestaurantCount = restaurantsSorted.length > 0 ? restaurantsSorted[0][1] : 0
  const favoriteRestaurantId = favoriteRestaurant ? restaurantIdByName[favoriteRestaurant] : null

  // Count unique restaurants
  const uniqueRestaurants = Object.keys(restaurantCounts).length

  // Recent meals — last 3 rated dishes, most recent first
  const recentMeals = data
    .filter(v => v.rating_10 != null)
    .slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3)
    .map(v => ({
      dish_name: v.dishes.name,
      restaurant_name: v.dishes.restaurants?.name,
      rating: v.rating_10,
      category: v.dishes.category,
      voted_at: v.created_at,
    }))

  return {
    totalVotes,
    reviewCount,
    avgRating,
    ratingVariance,
    categoryConcentration,
    topCategory,
    topCategories,
    ratingStyle,
    favoriteRestaurant,
    favoriteRestaurantCount,
    favoriteRestaurantId,
    uniqueRestaurants,
    categoryCounts,
    recentMeals,
  }
}

const DEFAULT_STATS = {
  totalVotes: 0,
  reviewCount: 0,
  avgRating: null,
  ratingVariance: 0,
  categoryConcentration: 0,
  topCategory: null,
  topCategories: [],
  ratingStyle: null,
  favoriteRestaurant: null,
  favoriteRestaurantCount: 0,
  favoriteRestaurantId: null,
  uniqueRestaurants: 0,
  categoryCounts: {},
  recentMeals: [],
  dishesHelpedRank: 0,
  categoryComparison: {},
  standoutPicks: {},
}

const sortByRecency = (a, b) => {
  const aTime = new Date(a.voted_at || 0).getTime()
  const bTime = new Date(b.voted_at || 0).getTime()
  return bTime - aTime
}

export function useUserVotes(userId) {
  // Primary query: fetch votes + helped count in parallel
  const {
    data: primaryData,
    isLoading: primaryLoading,
    error: primaryError,
    refetch,
  } = useQuery({
    queryKey: ['userVotes', userId],
    queryFn: async () => {
      const [votes, helpedCount] = await Promise.all([
        votesApi.getDetailedVotesForUser(userId),
        votesApi.getDishesHelpedRank(userId),
      ])
      return { votes, helpedCount }
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  useEffect(() => {
    if (primaryError) logger.error('Error fetching user votes:', primaryError)
  }, [primaryError])

  const votes = primaryData?.votes || []
  const helpedCount = primaryData?.helpedCount || 0

  // Single "My Ratings" feed, sorted most-recent-first.
  const ratedDishes = useMemo(
    () => votes.map(transformVote).filter(Boolean).sort(sortByRecency),
    [votes]
  )

  // Derive base stats from raw votes
  const baseStats = useMemo(
    () => votes.length > 0 ? calculateStats(votes) : null,
    [votes]
  )

  // Extract rated dish IDs for community averages query
  const ratedDishIds = useMemo(
    () => votes.filter(v => v.rating_10 != null).map(v => v.dishes.id),
    [votes]
  )

  // Dependent query: community averages (only runs when we have rated dish IDs)
  const { data: communityAvgs, error: communityError } = useQuery({
    queryKey: ['communityAvgs', ratedDishIds],
    queryFn: () => votesApi.getCommunityAvgsForDishes(ratedDishIds),
    enabled: ratedDishIds.length > 0,
    staleTime: 1000 * 60 * 30, // 30 minutes (matches old COMMUNITY_CACHE_TTL)
  })

  useEffect(() => {
    if (communityError) logger.error('Error fetching community averages:', communityError)
  }, [communityError])

  // Final stats: merge base stats + community-dependent comparisons
  const stats = useMemo(() => {
    if (!baseStats) return DEFAULT_STATS

    const categoryComparison = communityAvgs
      ? computeCategoryComparison(votes, communityAvgs)
      : {}
    const standoutPicks = communityAvgs
      ? computeStandoutPicks(votesToRatedItems(votes), communityAvgs)
      : {}

    return {
      ...baseStats,
      dishesHelpedRank: helpedCount,
      categoryComparison,
      standoutPicks,
    }
  }, [baseStats, communityAvgs, votes, helpedCount])

  return {
    votes,
    ratedDishes,
    stats,
    loading: userId ? primaryLoading : false,
    refetch,
  }
}
