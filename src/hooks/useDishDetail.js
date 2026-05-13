import { useState, useEffect, useRef, useCallback } from 'react'
import { capture } from '../lib/analytics'
import { logger } from '../utils/logger'
import { dishesApi } from '../api/dishesApi'
import { followsApi } from '../api/followsApi'
import { dishPhotosApi } from '../api/dishPhotosApi'
import { votesApi } from '../api/votesApi'
import { ErrorTypes, createClassifiedError } from '../utils/errorHandler'

/**
 * Transform raw dish data from API to component format
 */
function transformDish(data) {
  return {
    dish_id: data.id,
    dish_name: data.name,
    restaurant_id: data.restaurant_id,
    restaurant_name: data.restaurants?.name || 'Unknown',
    restaurant_town: data.restaurants?.town,
    restaurant_address: data.restaurants?.address,
    restaurant_lat: data.restaurants?.lat,
    restaurant_lng: data.restaurants?.lng,
    category: data.category,
    price: data.price,
    photo_url: data.photo_url,
    total_votes: data.total_votes || 0,
    avg_rating: data.avg_rating,
    parent_dish_id: data.parent_dish_id,
    has_variants: data.has_variants,
    value_percentile: data.value_percentile,
    website_url: data.restaurants?.website_url,
    order_url: data.restaurants?.order_url,
    toast_slug: data.restaurants?.toast_slug,
    restaurant_phone: data.restaurants?.phone,
  }
}

/**
 * All data fetching for the Dish detail page.
 * Returns dish data, variants, photos, reviews, friends votes, and handlers.
 */
export function useDishDetail(dishId, user) {
  const [dish, setDish] = useState(null)
  const [loading, setLoading] = useState(true)
  // error is null | classified Error (with .type from ErrorTypes). The page
  // distinguishes NOT_FOUND from transient failures so users see "Try again"
  // instead of a fake "Dish not found" when Supabase is just slow or down.
  const [error, setError] = useState(null)
  const [refetchKey, setRefetchKey] = useState(0)
  const refetchDish = useCallback(() => setRefetchKey(k => k + 1), [])

  // Variant state
  const [variants, setVariants] = useState([])
  const [parentDish, setParentDish] = useState(null)
  const [isVariant, setIsVariant] = useState(false)

  // Photo state
  const [photoUploaded, setPhotoUploaded] = useState(null)
  const [featuredPhoto, setFeaturedPhoto] = useState(null)
  const [communityPhotos, setCommunityPhotos] = useState([])
  const [allPhotos, setAllPhotos] = useState([])

  // Social state
  const [friendsVotes, setFriendsVotes] = useState([])
  const [friendsCompat, setFriendsCompat] = useState({})

  // Reviews state
  const [reviews, setReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [smartSnippet, setSmartSnippet] = useState(null)

  // Lazy-load evidence — only fetch when user scrolls near it
  const [shouldLoadEvidence, setShouldLoadEvidence] = useState(false)
  const evidenceSentinelRef = useRef(null)

  const observerCallback = useCallback(function (entries) {
    if (entries[0].isIntersecting) {
      setShouldLoadEvidence(true)
    }
  }, [])

  useEffect(function () {
    var el = evidenceSentinelRef.current
    if (!el || shouldLoadEvidence) return
    var observer = new IntersectionObserver(observerCallback, {
      rootMargin: '200px',
    })
    observer.observe(el)
    return function () { observer.disconnect() }
  }, [dish, shouldLoadEvidence, observerCallback])

  // Fetch dish data
  useEffect(() => {
    if (!dishId) return
    let cancelled = false

    // Reset state between dish navigations
    setFriendsVotes([])
    setFriendsCompat({})
    setReviews([])
    setReviewsLoading(false)
    setSmartSnippet(null)
    setFeaturedPhoto(null)
    setCommunityPhotos([])
    setAllPhotos([])
    setVariants([])
    setParentDish(null)
    setIsVariant(false)

    const fetchDish = async () => {
      try {
        setLoading(true)
        setError(null)
        setShouldLoadEvidence(false)

        const data = await dishesApi.getDishById(dishId)
        if (cancelled) return
        const transformedDish = transformDish(data)
        setDish(transformedDish)

        capture('dish_viewed', {
          dish_id: transformedDish.dish_id,
          dish_name: transformedDish.dish_name,
          restaurant_id: transformedDish.restaurant_id,
          restaurant_name: transformedDish.restaurant_name,
          category: transformedDish.category,
          price: transformedDish.price,
          avg_rating: transformedDish.avg_rating,
          total_votes: transformedDish.total_votes,
        })
      } catch (err) {
        if (cancelled) return
        logger.error('Error fetching dish:', err)
        // dishesApi.getDishById throws `new Error('Dish not found')` only
        // when the row genuinely doesn't exist. Everything else (network,
        // RLS, server) goes through createClassifiedError. Preserve that
        // distinction so the page can offer retry vs hard 404.
        const classified = err.type ? err : createClassifiedError(err)
        if (err.message === 'Dish not found') {
          classified.type = ErrorTypes.NOT_FOUND
        }
        setError(classified)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDish()
    return () => { cancelled = true }
  }, [dishId, refetchKey])

  // Fetch variant data
  useEffect(() => {
    if (!dish) {
      setVariants([])
      setParentDish(null)
      setIsVariant(false)
      return
    }
    let cancelled = false

    const fetchVariantData = async () => {
      if (dish.has_variants) {
        try {
          const variantData = await dishesApi.getVariants(dish.dish_id || dish.id)
          if (cancelled) return
          setVariants(variantData)
          setIsVariant(false)
          setParentDish(null)
        } catch (err) {
          if (cancelled) return
          logger.error('Failed to fetch variants:', err)
          setVariants([])
        }
      } else if (dish.parent_dish_id) {
        try {
          const [siblings, parent] = await Promise.all([
            dishesApi.getSiblingVariants(dish.dish_id || dish.id),
            dishesApi.getParentDish(dish.dish_id || dish.id),
          ])
          if (cancelled) return
          setVariants(siblings)
          setParentDish(parent)
          setIsVariant(true)
        } catch (err) {
          if (cancelled) return
          logger.error('Failed to fetch sibling variants:', err)
          setVariants([])
          setParentDish(null)
        }
      } else {
        setVariants([])
        setParentDish(null)
        setIsVariant(false)
      }
    }

    fetchVariantData()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dish?.dish_id, dish?.id, dish?.has_variants, dish?.parent_dish_id])

  // Fetch photos, reviews, friends votes — deferred until user scrolls near evidence
  useEffect(() => {
    if (!dishId || !shouldLoadEvidence) return
    let cancelled = false

    const fetchSecondaryData = async () => {
      setReviewsLoading(true)

      const [photosResult, reviewsResult, friendsResult, snippetResult] = await Promise.allSettled([
        Promise.all([
          dishPhotosApi.getFeaturedPhoto(dishId),
          dishPhotosApi.getCommunityPhotos(dishId),
          dishPhotosApi.getAllVisiblePhotos(dishId),
        ]),
        votesApi.getReviewsForDish(dishId, { limit: 20 }),
        user ? followsApi.getFriendsVotesForDish(dishId) : Promise.resolve([]),
        votesApi.getSmartSnippetForDish(dishId),
      ])

      if (cancelled) {
        setReviewsLoading(false)
        return
      }

      if (photosResult.status === 'fulfilled') {
        const [featured, community, all] = photosResult.value
        setFeaturedPhoto(featured)
        setCommunityPhotos(community)
        setAllPhotos(all)
      } else {
        logger.error('Failed to fetch photos:', photosResult.reason)
      }

      if (reviewsResult.status === 'fulfilled') {
        setReviews(reviewsResult.value)
      } else {
        logger.error('Failed to fetch reviews:', reviewsResult.reason)
        setReviews([])
      }
      setReviewsLoading(false)

      if (friendsResult.status === 'fulfilled') {
        setFriendsVotes(friendsResult.value)
      } else {
        logger.error('Failed to fetch friends votes:', friendsResult.reason)
        setFriendsVotes([])
      }

      if (snippetResult.status === 'fulfilled') {
        setSmartSnippet(snippetResult.value)
      } else {
        logger.error('Failed to fetch smart snippet:', snippetResult.reason)
      }
    }

    fetchSecondaryData()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishId, user, shouldLoadEvidence])

  // Fetch taste compatibility for each friend who voted
  useEffect(() => {
    if (!user || friendsVotes.length === 0) {
      setFriendsCompat({})
      return
    }
    let cancelled = false

    async function fetchCompat() {
      try {
        const results = await Promise.allSettled(
          friendsVotes.map(fv => followsApi.getTasteCompatibility(fv.user_id))
        )
        if (cancelled) return
        const compatMap = {}
        friendsVotes.forEach((fv, i) => {
          if (results[i].status === 'fulfilled' && results[i].value?.compatibility_pct != null) {
            compatMap[fv.user_id] = results[i].value.compatibility_pct
          }
        })
        setFriendsCompat(compatMap)
      } catch (err) {
        if (cancelled) return
        logger.error('Failed to fetch friends compatibility:', err)
      }
    }

    fetchCompat()
    return () => { cancelled = true }
  }, [user, friendsVotes])

  // Handlers
  const handlePhotoUploaded = async (photo) => {
    setPhotoUploaded(photo)
    try {
      const [featured, community, all] = await Promise.all([
        dishPhotosApi.getFeaturedPhoto(dishId),
        dishPhotosApi.getCommunityPhotos(dishId),
        dishPhotosApi.getAllVisiblePhotos(dishId),
      ])
      setFeaturedPhoto(featured)
      setCommunityPhotos(community)
      setAllPhotos(all)
    } catch (error) {
      logger.error('Failed to refresh photos after upload:', error)
    }
  }

  const handleVote = async () => {
    // allSettled (not Promise.all) so a single failed sub-fetch doesn't
    // discard the others. Matches fetchSecondaryData's pattern above.
    const [dishResult, reviewsResult, snippetResult] = await Promise.allSettled([
      dishesApi.getDishById(dishId),
      votesApi.getReviewsForDish(dishId, { limit: 20 }),
      votesApi.getSmartSnippetForDish(dishId),
    ])
    if (dishResult.status === 'fulfilled') {
      setDish(transformDish(dishResult.value))
    } else {
      logger.error('Failed to refresh dish after vote:', dishResult.reason)
    }
    if (reviewsResult.status === 'fulfilled') {
      setReviews(reviewsResult.value)
    } else {
      logger.error('Failed to refresh reviews after vote:', reviewsResult.reason)
    }
    if (snippetResult.status === 'fulfilled') {
      setSmartSnippet(snippetResult.value)
    } else {
      logger.error('Failed to refresh smart snippet after vote:', snippetResult.reason)
    }
  }

  const clearPhotoUploaded = () => setPhotoUploaded(null)

  return {
    // Core data
    dish,
    loading,
    error,

    // Variants
    variants,
    parentDish,
    isVariant,

    // Photos
    photoUploaded,
    featuredPhoto,
    communityPhotos,
    allPhotos,

    // Social
    friendsVotes,
    friendsCompat,

    // Reviews
    reviews,
    reviewsLoading,
    smartSnippet,

    // Evidence lazy-load
    shouldLoadEvidence,
    evidenceSentinelRef,

    // Handlers
    handlePhotoUploaded,
    handleVote,
    clearPhotoUploaded,
    refetchDish,
  }
}
