import { useState, useMemo, useEffect } from 'react'
import { MIN_VOTES_FOR_RANKING } from '../../constants/app'
import { DishListItem } from '../DishListItem'
import { SectionHeader } from '../SectionHeader'
import { FriendVisitsModal } from './FriendVisitsModal'
import { FriendsHereListModal } from './FriendsHereListModal'

const TOP_DISHES_COUNT = 5

// Restaurant dishes component - Job #2: "What should I order?"
export function RestaurantDishes({ dishes, loading, error, searchQuery = '', friendsVotesByDish = {}, tasteCompatByFriend = {}, restaurantName = '' }) {
  const [showAllDishes, setShowAllDishes] = useState(false)
  const [friendsListOpen, setFriendsListOpen] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState(null)

  // Close any open friends modals when the restaurant context changes,
  // so a stale selectedFriend from the previous restaurant can't render
  // against this restaurant's name.
  useEffect(() => {
    setFriendsListOpen(false)
    setSelectedFriend(null)
  }, [restaurantName])

  // Filter and sort dishes
  const sortedDishes = useMemo(() => {
    if (!dishes?.length) return { top: [], rest: [], filtered: false }

    // Filter by search query if provided
    let filteredDishes = dishes
    const query = searchQuery.toLowerCase().trim()
    if (query) {
      filteredDishes = dishes.filter(d =>
        (d.dish_name || '').toLowerCase().includes(query) ||
        (d.category || '').toLowerCase().includes(query)
      )
    }

    const sorted = [...filteredDishes].sort((a, b) => {
      const aRanked = (a.total_votes || 0) >= MIN_VOTES_FOR_RANKING
      const bRanked = (b.total_votes || 0) >= MIN_VOTES_FOR_RANKING
      // Ranked dishes first
      if (aRanked && !bRanked) return -1
      if (!aRanked && bRanked) return 1
      // Then by granular rating score (avg_rating)
      const aRating = a.avg_rating || 0
      const bRating = b.avg_rating || 0
      if (bRating !== aRating) return bRating - aRating
      // Tie-breaker: vote count, then alphabetical
      const voteDiff = (b.total_votes || 0) - (a.total_votes || 0)
      if (voteDiff !== 0) return voteDiff
      return (a.dish_name || '').localeCompare(b.dish_name || '')
    })

    return {
      top: sorted.slice(0, TOP_DISHES_COUNT),
      rest: sorted.slice(TOP_DISHES_COUNT),
      filtered: query.length > 0,
      totalMatches: filteredDishes.length,
    }
  }, [dishes, searchQuery])

  const rankedCount = dishes?.filter(d => (d.total_votes || 0) >= MIN_VOTES_FOR_RANKING).length || 0

  // Aggregate friends-here data: one row per friend with their full visit list.
  // dish_count + avg_rating power the list view; votes power the per-friend popup.
  const friendsHere = useMemo(() => {
    const byFriend = new Map()
    Object.values(friendsVotesByDish).forEach(votes => {
      votes.forEach(v => {
        let entry = byFriend.get(v.user_id)
        if (!entry) {
          entry = {
            user_id: v.user_id,
            display_name: v.display_name,
            avatar_url: v.avatar_url,
            votes: [],
          }
          byFriend.set(v.user_id, entry)
        }
        entry.votes.push(v)
      })
    })
    return Array.from(byFriend.values()).map(f => {
      const ratings = f.votes
        .map(v => Number(v.rating_10))
        .filter(r => Number.isFinite(r))
      const avg = ratings.length
        ? ratings.reduce((s, r) => s + r, 0) / ratings.length
        : null
      const compat = tasteCompatByFriend[f.user_id] || null
      return {
        ...f,
        dish_count: f.votes.length,
        avg_rating: avg,
        compatibility_pct: compat?.compatibility_pct ?? null,
        shared_dishes: compat?.shared_dishes ?? 0,
      }
    })
  }, [friendsVotesByDish, tasteCompatByFriend])

  const uniqueFriends = friendsHere.length

  const handleSelectFriend = (friend) => {
    setFriendsListOpen(false)
    setSelectedFriend(friend)
  }

  const handleCloseVisits = () => setSelectedFriend(null)
  const handleCloseList = () => setFriendsListOpen(false)
  const handleOpenList = () => setFriendsListOpen(true)

  if (loading) {
    return (
      <div className="px-4 py-6" role="status" aria-label="Loading dishes">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl animate-pulse"
              style={{ background: 'var(--color-surface)', border: '2px solid var(--color-divider)' }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--color-primary)' }}>{error?.message || error}</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-5">
      {/* Section Header */}
      <div className="mb-5">
        <SectionHeader
          title={sortedDishes.filtered
            ? `Results for "${searchQuery}"`
            : rankedCount > 0
              ? "What's Good Here"
              : 'Help decide what to order here'
          }
          subtitle={sortedDishes.filtered
            ? `${sortedDishes.totalMatches} ${sortedDishes.totalMatches === 1 ? 'dish' : 'dishes'} found`
            : rankedCount > 0
              ? `Top picks based on ${rankedCount} rated ${rankedCount === 1 ? 'dish' : 'dishes'}`
              : 'Vote on dishes to shape the rankings'
          }
          level="h3"
        />
      </div>

      {/* Friends banner — tap avatar = open that friend's visits popup;
          tap the rest of the row = open the full friends-here list. */}
      {uniqueFriends > 0 && (
        <div
          className="mb-4 rounded-xl flex items-center"
          style={{
            background: 'var(--color-surface-elevated)',
            border: '1.5px solid var(--color-primary)',
          }}
        >
          {/* Stacked avatars (tappable per-friend) */}
          <div className="flex -space-x-2 flex-shrink-0 pl-3.5 py-3">
            {friendsHere.slice(0, 3).map((friend, i) => (
              <button
                type="button"
                key={friend.user_id}
                onClick={() => setSelectedFriend(friend)}
                aria-label={`See what ${friend.display_name || 'friend'} ordered`}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden active:scale-95 transition-transform"
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-text-on-primary, white)',
                  boxShadow: '0 0 0 2px var(--color-surface-elevated)',
                  zIndex: 3 - i,
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                {friend.avatar_url ? (
                  <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <span>{friend.display_name?.charAt(0).toUpperCase() || '?'}</span>
                )}
              </button>
            ))}
          </div>
          {/* Rest of row (tappable → opens friends list) */}
          <button
            type="button"
            onClick={handleOpenList}
            className="flex-1 flex items-center justify-between gap-2 pl-3 pr-3.5 py-3 text-left active:bg-black/5"
            style={{ cursor: 'pointer', background: 'transparent', border: 'none' }}
          >
            <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {uniqueFriends} {uniqueFriends === 1 ? 'friend has' : 'friends have'} been here
            </p>
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="var(--color-text-tertiary)"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Top Dishes */}
      {sortedDishes.top.length > 0 ? (
        <div>
          {sortedDishes.top.map((dish, index) => (
            <DishListItem
              key={dish.dish_id}
              dish={dish}
              rank={index + 1}
              showPhoto
              isLast={index === sortedDishes.top.length - 1}
            />
          ))}
        </div>
      ) : (
        <div
          className="py-10 text-center rounded-xl"
          style={{
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <p className="font-bold" style={{ color: 'var(--color-text-tertiary)', fontSize: '14px' }}>
            {sortedDishes.filtered
              ? `No dishes matching "${searchQuery}"`
              : 'No dishes at this restaurant yet'
            }
          </p>
          {sortedDishes.filtered ? (
            <p className="mt-1.5 font-medium" style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
              Try a different search term
            </p>
          ) : (
            <p className="mt-1 font-medium" style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
              No dishes ranked yet
            </p>
          )}
        </div>
      )}

      {/* More Dishes */}
      {sortedDishes.rest.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowAllDishes(!showAllDishes)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold card-press"
            style={{
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-card-border)',
              fontSize: '13px',
            }}
          >
            {showAllDishes ? 'Show less' : `See ${sortedDishes.rest.length} more dishes`}
            <svg
              className={`w-4 h-4 transition-transform ${showAllDishes ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAllDishes && (
            <div className="mt-4">
              {sortedDishes.rest.map((dish, index) => (
                <DishListItem
                  key={dish.dish_id}
                  dish={dish}
                  rank={TOP_DISHES_COUNT + index + 1}
                  showPhoto
                  isLast={index === sortedDishes.rest.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {friendsListOpen && (
        <FriendsHereListModal
          friends={friendsHere}
          restaurantName={restaurantName}
          onSelectFriend={handleSelectFriend}
          onClose={handleCloseList}
        />
      )}

      {selectedFriend && (
        <FriendVisitsModal
          friend={selectedFriend}
          votes={selectedFriend.votes}
          restaurantName={restaurantName}
          onClose={handleCloseVisits}
        />
      )}
    </div>
  )
}
