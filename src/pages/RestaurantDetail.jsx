import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { capture } from '../lib/analytics'
import { useAuth } from '../context/AuthContext'
import { ReportModal } from '../components/ReportModal'
import { PlaceAttributions } from '../components/PlaceAttributions'
import { logger } from '../utils/logger'
import { getUserMessage } from '../utils/errorHandler'
import { shareOrCopy } from '../utils/share'
import { sanitizeUrl } from '../utils/sanitize'
import { openExternalLink } from '../utils/openExternalLink'
import { restaurantsApi } from '../api/restaurantsApi'
import { placesApi } from '../api/placesApi'
import { votesApi } from '../api/votesApi'
import { followsApi } from '../api/followsApi'
import { useLocationContext } from '../context/LocationContext'
import { useDishes } from '../hooks/useDishes'
import { useFavorites } from '../hooks/useFavorites'
import { LoginModal } from '../components/Auth/LoginModal'
import { RestaurantDishes, RestaurantMenu, MenuImportStatus } from '../components/restaurants'
import { useMenuImportStatus } from '../hooks/useMenuImportStatus'
import { useNearbyRestaurant } from '../hooks/useNearbyRestaurant'
import { useRestaurantSpecials } from '../hooks/useSpecials'
import { useRestaurantEvents } from '../hooks/useEvents'
import { SpecialCard } from '../components/SpecialCard'
import { EventCard } from '../components/EventCard'

export function RestaurantDetail() {
  const { restaurantId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { location, radius } = useLocationContext()

  const [restaurant, setRestaurant] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const [activeTab, setActiveTab] = useState(null) // null = auto-detect
  const [dishSearchQuery, setDishSearchQuery] = useState('')
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [friendsVotesByDish, setFriendsVotesByDish] = useState({})
  const [expandedReview, setExpandedReview] = useState(null)

  // Fetch restaurant by ID
  useEffect(() => {
    if (!restaurantId) return

    let cancelled = false
    setLoadingRestaurant(true)
    setFetchError(null)

    restaurantsApi.getById(restaurantId)
      .then(data => {
        if (!cancelled) {
          setRestaurant(data)
          capture('restaurant_viewed', {
            restaurant_id: data.id,
            restaurant_name: data.name,
            restaurant_address: data.address,
          })
        }
      })
      .catch(err => {
        if (!cancelled) {
          logger.error('Failed to fetch restaurant:', err)
          setFetchError(err)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRestaurant(false)
      })

    return () => { cancelled = true }
  }, [restaurantId])

  // Fetch dishes for this restaurant
  const { dishes, loading: dishesLoading, error: dishesError, refetch } = useDishes(
    location, radius, null, restaurantId
  )

  // Poll menu import status and auto-refetch dishes when a job completes
  const { status: importStatus } = useMenuImportStatus(restaurantId)
  const prevImportStatus = useRef(importStatus)
  useEffect(() => {
    if (prevImportStatus.current === 'processing' && importStatus === 'completed') {
      refetch()
    }
    prevImportStatus.current = importStatus
  }, [importStatus, refetch])

  // Compute WGH Food Score — aggregated from dish ratings
  var ratedDishes = (dishes || []).filter(function (d) { return d.avg_rating != null && (d.total_votes || 0) > 0 })
  var totalVotes = ratedDishes.reduce(function (sum, d) { return sum + (d.total_votes || 0) }, 0)
  var wghFoodScore = null
  if (ratedDishes.length > 0) {
    var avgRating = ratedDishes.reduce(function (sum, d) { return sum + Number(d.avg_rating) }, 0) / ratedDishes.length
    wghFoodScore = avgRating.toFixed(1)
  }

  var [reportTarget, setReportTarget] = useState(null)

  // Fetch review snippets for "What People Are Saying"
  var [reviewSnippets, setReviewSnippets] = useState([])
  useEffect(function () {
    if (!restaurantId) return
    setReviewSnippets([])
    votesApi.getReviewsForRestaurant(restaurantId, { limit: 5 })
      .then(setReviewSnippets)
      .catch(function (err) {
        logger.error('Failed to fetch restaurant reviews:', err)
      })
  }, [restaurantId])

  // Fetch Google rating if restaurant has a google_place_id
  var [googleRating, setGoogleRating] = useState(null)
  var [placeAttributions, setPlaceAttributions] = useState([])
  useEffect(function () {
    setGoogleRating(null)
    setPlaceAttributions([])
    if (!restaurant || !restaurant.google_place_id) return
    placesApi.getDetails(restaurant.google_place_id)
      .then(function (details) {
        if (details && details.googleRating) {
          setGoogleRating({ rating: details.googleRating, count: details.googleReviewCount })
        }
        if (details && Array.isArray(details.attributions)) {
          setPlaceAttributions(details.attributions)
        }
      })
      .catch(function (err) {
        logger.error('Failed to fetch Google rating:', err)
      })
  }, [restaurant])

  // Auto-detect best default tab: Menu if no votes yet, Top Rated if votes exist
  useEffect(() => {
    if (activeTab !== null || dishesLoading || !dishes) return
    const hasVotes = dishes.some(d => (d.total_votes || 0) > 0)
    const hasMenuSections = dishes.some(d => d.menu_section)
    setActiveTab(hasVotes ? 'top' : (hasMenuSections ? 'menu' : 'top'))
  }, [dishes, dishesLoading, activeTab])

  const { isFavorite, toggleFavorite } = useFavorites(user?.id)

  // Check if user is physically near this restaurant
  const { nearbyRestaurant } = useNearbyRestaurant()
  const isHere = nearbyRestaurant?.id === restaurantId

  // Fetch specials and events for this restaurant
  const { specials } = useRestaurantSpecials(restaurantId)
  const { events } = useRestaurantEvents(restaurantId)
  var showRateYourMeal = !dishesLoading && (dishes?.length || 0) > 0 && (activeTab || 'top') === 'top'

  // Fetch friend votes
  useEffect(() => {
    if (!restaurantId || !user) {
      setFriendsVotesByDish({})
      return
    }

    let cancelled = false

    async function fetchFriendsVotes() {
      try {
        const votes = await followsApi.getFriendsVotesForRestaurant(restaurantId)
        if (cancelled) return
        const byDish = {}
        votes.forEach(vote => {
          if (!byDish[vote.dish_id]) {
            byDish[vote.dish_id] = []
          }
          byDish[vote.dish_id].push(vote)
        })
        setFriendsVotesByDish(byDish)
      } catch (err) {
        logger.error('Failed to fetch friends votes for restaurant:', err)
        if (!cancelled) setFriendsVotesByDish({})
      }
    }

    fetchFriendsVotes()
    return () => { cancelled = true }
  }, [restaurantId, user])

  const handleVote = () => {
    refetch()
  }

  const handleLoginRequired = () => {
    setLoginModalOpen(true)
  }

  const handleToggleFavorite = async (dishId) => {
    if (!user) {
      setLoginModalOpen(true)
      return
    }
    try {
      await toggleFavorite(dishId)
    } catch (error) {
      logger.error('Failed to toggle favorite:', error)
    }
  }

  // Loading state
  if (loadingRestaurant) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <div className="px-4 py-6 space-y-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full" style={{ background: 'var(--color-surface-elevated)' }} />
            <div>
              <div className="h-5 w-40 rounded" style={{ background: 'var(--color-surface-elevated)' }} />
              <div className="h-3 w-24 rounded mt-2" style={{ background: 'var(--color-surface-elevated)' }} />
            </div>
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl" style={{ background: 'var(--color-card)' }} />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center px-4">
          <p role="alert" className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>
            {getUserMessage(fetchError, 'loading this restaurant')}
          </p>
          <button
            onClick={() => navigate('/restaurants')}
            className="px-4 py-2 text-sm font-medium rounded-lg"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            Back to Restaurants
          </button>
        </div>
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center px-4">
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Restaurant not found
          </p>
          <button
            onClick={() => navigate('/restaurants')}
            className="px-4 py-2 text-sm font-medium rounded-lg"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            Back to Restaurants
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-40" style={{ background: 'var(--color-bg)' }}>
      <h1 className="sr-only">{restaurant.name}</h1>

      {/* Sticky header with back button */}
      <div
        className="sticky top-0 z-20 px-4 py-3"
        style={{
          background: 'var(--color-bg)',
          boxShadow: 'none',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/restaurants')}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h2
              className="font-bold truncate"
              style={{
                fontFamily: "'Amatic SC', cursive",
                color: 'var(--color-text-primary)',
                fontSize: '32px',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              {restaurant.name}
            </h2>
            <p className="font-medium" style={{ color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
              {dishesLoading ? '…' : `${dishes.length} dish${dishes.length === 1 ? '' : 'es'}`}
              {restaurant.distance_miles != null && (
                <span> · {restaurant.distance_miles} mi away</span>
              )}
            </p>
            {/* Scores row */}
            {(wghFoodScore || googleRating) && (
              <div className="flex items-center gap-4" style={{ marginTop: '6px' }}>
                {wghFoodScore && (
                  <div className="flex items-center gap-1.5">
                    <span style={{
                      fontSize: '18px',
                      fontWeight: 800,
                      color: 'var(--color-rating)',
                    }}>
                      {wghFoodScore}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      WGH · {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                    </span>
                  </div>
                )}
                {googleRating && (
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: '14px' }}>⭐</span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                    }}>
                      {googleRating.rating}
                    </span>
                    <span
                      style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}
                      aria-label={`Google Maps rating${googleRating.count ? ` based on ${googleRating.count} reviews` : ''}`}
                    >
                      Google Maps{googleRating.count ? ' · ' + googleRating.count : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
            {placeAttributions.length > 0 && (
              <PlaceAttributions attributions={placeAttributions} className="mt-1.5" />
            )}
          </div>
          <button
            onClick={async () => {
              const result = await shareOrCopy({
                url: `${window.location.origin}/restaurants/${restaurantId}`,
                title: restaurant.name,
                text: `Check out ${restaurant.name} on What's Good Here!`,
              })
              capture('restaurant_shared', { restaurant_id: restaurantId, method: result.method })
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }}
            aria-label="Share restaurant"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* What People Are Saying — horizontal swipeable row */}
      {reviewSnippets.length > 0 && (
        <div className="pt-2 pb-3">
          <h3
            className="font-semibold mb-2 px-4"
            style={{
              fontFamily: "'Amatic SC', cursive",
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: 'var(--color-text-primary)',
            }}
          >
            What People Are Saying
          </h3>
          <div
            className="flex gap-2 overflow-x-auto px-4"
            style={{
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {reviewSnippets.map(function (review, i) {
              var isExpanded = expandedReview === i
              var canReport = user && review.id && review.user_id && review.user_id !== user.id
              return (
                <div key={i} className="relative flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
                  <button
                    onClick={function () { setExpandedReview(isExpanded ? null : i) }}
                    className="text-left transition-all"
                    style={{
                      width: isExpanded ? '320px' : '280px',
                      padding: '10px 14px',
                      paddingRight: canReport ? '36px' : '14px',
                      background: 'var(--color-card)',
                      borderRadius: '12px',
                      border: isExpanded ? '1.5px solid var(--color-accent-gold)' : '1px solid var(--color-divider)',
                    }}
                  >
                    <p style={{
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                      fontStyle: 'italic',
                      lineHeight: 1.4,
                      margin: 0,
                      display: isExpanded ? 'block' : '-webkit-box',
                      WebkitLineClamp: isExpanded ? undefined : 2,
                      WebkitBoxOrient: isExpanded ? undefined : 'vertical',
                      overflow: isExpanded ? 'visible' : 'hidden',
                    }}>
                      &ldquo;{review.review_text}&rdquo;
                    </p>
                    <p style={{
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                      marginTop: '4px',
                    }}>
                      on <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{review.dish_name}</span>
                      {review.rating != null && (
                        <span> · <span style={{ fontWeight: 700, color: 'var(--color-rating)' }}>{review.rating}</span></span>
                      )}
                    </p>
                  </button>
                  {canReport && (
                    <button
                      type="button"
                      onClick={function (e) {
                        e.stopPropagation()
                        setReportTarget({ type: 'review', id: review.id })
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full"
                      aria-label="Report review"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Restaurant Details Card */}
      <div className="px-4 py-4 relative" style={{ background: 'var(--color-bg)' }}>
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px"
          style={{
            width: '90%',
            background: 'linear-gradient(90deg, transparent, var(--color-divider), transparent)',
          }}
        />
        <div className="space-y-3">
          {/* Contact info row — Directions, Phone, Website, etc. */}
          {(restaurant.address || restaurant.phone || restaurant.website_url || restaurant.facebook_url || restaurant.instagram_url) && (
            <div className="flex items-center gap-3 flex-wrap">
              {restaurant.address && (
                <a
                  href={restaurant.lat && restaurant.lng
                    ? `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`
                    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(restaurant.address)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => openExternalLink(e, e.currentTarget.href)}
                  className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--color-accent-gold)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                  </svg>
                  Directions
                </a>
              )}
              {restaurant.phone && (
                <a
                  href={`tel:${restaurant.phone}`}
                  className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--color-accent-gold)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                  </svg>
                  {restaurant.phone}
                </a>
              )}
              {sanitizeUrl(restaurant.website_url) && (
                <a
                  href={sanitizeUrl(restaurant.website_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => openExternalLink(e, e.currentTarget.href)}
                  className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--color-accent-gold)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                  Website
                </a>
              )}
              {sanitizeUrl(restaurant.facebook_url) && (
                <a
                  href={sanitizeUrl(restaurant.facebook_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => openExternalLink(e, e.currentTarget.href)}
                  className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--color-accent-gold)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                  </svg>
                  Facebook
                </a>
              )}
              {sanitizeUrl(restaurant.instagram_url) && (
                <a
                  href={sanitizeUrl(restaurant.instagram_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => openExternalLink(e, e.currentTarget.href)}
                  className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--color-accent-gold)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  Instagram
                </a>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Tab Switcher */}
      <div className="px-4 pt-4">
        <div
          className="flex rounded-xl p-1"
          style={{
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-divider)',
          }}
          role="tablist"
          aria-label="Restaurant view"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            const next = (activeTab || 'top') === 'top' ? 'menu' : 'top'
            setActiveTab(next)
            requestAnimationFrame(() => {
              document.getElementById('restaurant-tab-' + next)?.focus()
            })
          }}
        >
          <button
            role="tab"
            aria-selected={(activeTab || 'top') === 'top'}
            aria-controls="restaurant-tab-panel"
            id="restaurant-tab-top"
            tabIndex={(activeTab || 'top') === 'top' ? 0 : -1}
            onClick={() => setActiveTab('top')}
            className="flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all"
            style={{
              background: (activeTab || 'top') === 'top' ? 'var(--color-primary)' : 'transparent',
              color: (activeTab || 'top') === 'top' ? 'white' : 'var(--color-text-secondary)',
              boxShadow: 'none',
            }}
          >
            Top Rated
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'menu'}
            aria-controls="restaurant-tab-panel"
            id="restaurant-tab-menu"
            tabIndex={activeTab === 'menu' ? 0 : -1}
            onClick={() => setActiveTab('menu')}
            className="flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all"
            style={{
              background: activeTab === 'menu' ? 'var(--color-primary)' : 'transparent',
              color: activeTab === 'menu' ? 'white' : 'var(--color-text-secondary)',
              boxShadow: activeTab === 'menu' ? '0 2px 8px -2px rgba(200, 90, 84, 0.4)' : 'none',
            }}
          >
            Menu
          </button>
        </div>
        <div
          className="mt-3 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent-gold), transparent)' }}
        />
      </div>

      {/* Menu import status — shown only when no dishes yet */}
      {!dishesLoading && (
        <MenuImportStatus restaurantId={restaurantId} dishCount={dishes?.length ?? 0} />
      )}

      {/* Dish Content */}
      <div
        role="tabpanel"
        id="restaurant-tab-panel"
        aria-labelledby={(activeTab || 'top') === 'top' ? 'restaurant-tab-top' : 'restaurant-tab-menu'}
      >
      {(activeTab || 'top') === 'top' ? (
        <RestaurantDishes
          dishes={dishes}
          loading={dishesLoading}
          error={dishesError}
          onVote={handleVote}
          onLoginRequired={handleLoginRequired}
          isFavorite={isFavorite}
          onToggleFavorite={handleToggleFavorite}
          user={user}
          searchQuery={dishSearchQuery}
          friendsVotesByDish={friendsVotesByDish}
        />
      ) : (
        <RestaurantMenu
          dishes={dishes}
          loading={dishesLoading}
          error={dishesError}
          searchQuery={dishSearchQuery}
          menuSectionOrder={restaurant?.menu_section_order || []}
        />
      )}
      </div>

      {/* Happening Here - Specials & Events (hidden until Launch 2.0 — stale scraped data) */}
      {false && (specials.length > 0 || events.length > 0) && (
        <div className="px-4 py-4">
          <div
            className="mb-3 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--color-divider), transparent)' }}
          />
          <h3
            className="font-semibold mb-3"
            style={{ fontFamily: "'Amatic SC', cursive", fontSize: '24px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--color-text-primary)' }}
          >
            Happening Here
          </h3>
          <div className="space-y-3">
            {specials.map((special) => (
              <SpecialCard
                key={`special-${special.id}`}
                special={{ ...special, restaurants: restaurant }}
                promoted={special.is_promoted}
              />
            ))}
            {events.map((event) => (
              <EventCard
                key={`event-${event.id}`}
                event={{ ...event, restaurants: restaurant }}
                promoted={event.is_promoted}
              />
            ))}
          </div>
        </div>
      )}

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />

      {/* Sticky bottom action bar */}
      <div
        className="fixed left-0 right-0 z-30 px-4 pt-3 pb-3"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom))',
          background: 'var(--color-bg)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
        }}
      >
        <div className="flex gap-2">
          {(restaurant.toast_slug || sanitizeUrl(restaurant.order_url)) && (
            <a
              href={restaurant.toast_slug ? 'https://order.toasttab.com/online/' + restaurant.toast_slug : sanitizeUrl(restaurant.order_url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openExternalLink(e, e.currentTarget.href)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
              style={{
                background: 'var(--color-accent-orange)',
                color: 'var(--color-bg)',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
              </svg>
              Order Now
            </a>
          )}
          {showRateYourMeal && (
            <button
              onClick={function () {
                if (!user) {
                  setLoginModalOpen(true)
                  return
                }

                navigate('/restaurants/' + restaurantId + '/rate')
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-text-on-primary)',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m6.75 2.25A8.25 8.25 0 1 1 5.25 12a8.25 8.25 0 0 1 16.5 0Z" />
              </svg>
              Rate Your Meal
            </button>
          )}
        </div>
      </div>
      <ReportModal
        isOpen={!!reportTarget}
        onClose={function () { setReportTarget(null) }}
        target={reportTarget}
      />
    </div>
  )
}
