import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { usePlaylistDetail } from '../hooks/usePlaylistDetail'
import { usePlaylistMutations } from '../hooks/usePlaylistMutations'
import { useAuth } from '../context/AuthContext'
import { PlaylistCover } from '../components/playlists/PlaylistCover'
import { PlaylistOwnerMenu } from '../components/playlists/PlaylistOwnerMenu'
import { getCategoryNeonImage, categoryEmojiFor } from '../constants/categories'
import { AddDishSearchSheet } from '../components/playlists/AddDishSearchSheet'
import { capture } from '../lib/analytics'
import { shareOrCopy } from '../utils/share'

export function Playlist() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { playlist, loading, error } = usePlaylistDetail(id)
  const { follow, unfollow, removeDish } = usePlaylistMutations()
  const [searchSheetOpen, setSearchSheetOpen] = useState(false)

  const items = playlist?.items || []
  const existingDishIds = useMemo(() => items.map((i) => i.dish_id), [items])

  useEffect(() => {
    if (playlist) {
      capture('playlist_detail_viewed', {
        playlist_id: id,
        is_owner: playlist.is_owner,
        from_share_url: !document.referrer || !document.referrer.includes(window.location.host),
      })
    }
  }, [id, playlist?.playlist_id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="animate-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
        <div style={{ fontSize: 64 }}>⚠️</div>
        <h1 style={{ fontFamily: "'Amatic SC', cursive", fontSize: 32, marginTop: 12, color: 'var(--color-text-primary)' }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 8, textAlign: 'center' }}>
          {error.message || 'Could not load this playlist. Please try again.'}
        </p>
        <button onClick={function () { window.location.reload() }} style={{ color: 'var(--color-accent-gold)', marginTop: 16, background: 'none', border: 'none', fontWeight: 700 }}>
          Retry
        </button>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
        <div style={{ fontSize: 64 }}>🔒</div>
        <h1 style={{ fontFamily: "'Amatic SC', cursive", fontSize: 32, marginTop: 12, color: 'var(--color-text-primary)' }}>
          Playlist not found
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 8, textAlign: 'center' }}>
          This playlist may be private or no longer exists.
        </p>
        <Link to="/" style={{ color: 'var(--color-accent-gold)', marginTop: 16 }}>Go home</Link>
      </div>
    )
  }

  var covers = (playlist.cover_categories || []).slice(0, 4)
  var coverPhotos = items.slice(0, 4).map(function (item) { return item.photo_url || null })

  var toggleFollow = function () {
    if (!user) { navigate('/login'); return }
    if (playlist.is_followed) {
      unfollow.mutate(id)
    } else {
      follow.mutate(id)
      capture('playlist_followed', { playlist_id: id, creator_id: playlist.owner_id })
    }
  }

  var handleShare = function () {
    shareOrCopy({
      url: window.location.href,
      title: playlist.title,
      text: playlist.title + ' — a food playlist on What\'s Good Here',
    })
    capture('playlist_shared', { playlist_id: id, share_target: 'native_or_clipboard' })
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 80, background: 'var(--color-bg)' }}>
      {/* Header with cover gradient */}
      <div style={{ padding: 20, background: 'linear-gradient(180deg, var(--color-primary) 0%, var(--color-bg) 100%)' }}>
        <div className="flex justify-center">
          <PlaylistCover coverCategories={covers} coverPhotos={coverPhotos} size={240} />
        </div>
        <h1
          style={{
            fontFamily: "'Amatic SC', cursive",
            fontSize: 42,
            lineHeight: 1,
            marginTop: 16,
            color: 'var(--color-text-primary)',
            textAlign: 'center',
          }}
        >
          {playlist.title}
        </h1>
        {playlist.description && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginTop: 8, fontSize: 14 }}>
            {playlist.description}
          </p>
        )}
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, textAlign: 'center' }}>
          by{' '}
          <Link to={`/user/${playlist.owner_id}`} style={{ fontWeight: 700, color: 'var(--color-text-primary)', textDecoration: 'none' }}>
            {playlist.owner_display_name || 'Unknown'}
          </Link>
          {' · '}{playlist.item_count} {playlist.item_count === 1 ? 'dish' : 'dishes'}
          {playlist.follower_count > 0 && ` · ${playlist.follower_count} followers`}
        </div>
        <div className="flex justify-center gap-3" style={{ marginTop: 16 }}>
          {!playlist.is_owner && (
            <button
              onClick={toggleFollow}
              disabled={follow.isPending || unfollow.isPending}
              style={{
                padding: '10px 24px',
                background: playlist.is_followed ? 'transparent' : 'var(--color-text-primary)',
                color: playlist.is_followed ? 'var(--color-text-primary)' : '#fff',
                border: playlist.is_followed ? '1.5px solid var(--color-text-primary)' : 'none',
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {playlist.is_followed ? 'Following' : 'Follow'}
            </button>
          )}
          <button
            onClick={handleShare}
            style={{
              padding: '10px 24px',
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-divider)',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            Share
          </button>
          {playlist.is_owner && <PlaylistOwnerMenu playlist={playlist} />}
        </div>
      </div>

      {/* Owner: Add dishes button */}
      {playlist.is_owner && (
        <div style={{ padding: '12px 20px 0' }}>
          <button
            onClick={function () { setSearchSheetOpen(true) }}
            className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-primary)',
              border: '1.5px solid var(--color-primary)',
            }}
          >
            <span style={{ fontSize: 18 }}>+</span> Add dishes
          </button>
        </div>
      )}

      {/* Dish list */}
      {items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🥄</div>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>No dishes yet</p>
          {playlist.is_owner && (
            <button
              onClick={function () { setSearchSheetOpen(true) }}
              style={{ color: 'var(--color-accent-gold)', marginTop: 8, background: 'none', border: 'none', fontWeight: 700 }}
            >
              Search for dishes to add
            </button>
          )}
        </div>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map(function (item) {
            return (
              <li
                key={item.dish_id}
                style={{
                  padding: '12px 20px',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-divider)',
                }}
              >
                <div style={{ width: 24, color: 'var(--color-text-tertiary)', fontSize: 13, fontWeight: 700 }}>
                  {item.position}
                </div>
                <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--color-category-strip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, overflow: 'hidden' }}>
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : getCategoryNeonImage(item.category) ? (
                    <img src={getCategoryNeonImage(item.category)} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
                  ) : (
                    categoryEmojiFor(item.category)
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={'/dish/' + item.dish_id} style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {item.dish_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      {item.restaurant_name}
                    </div>
                  </Link>
                  {item.note && (
                    <div style={{
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                      marginTop: 4,
                      borderLeft: '2px solid var(--color-primary)',
                      paddingLeft: 8,
                      fontStyle: 'italic',
                    }}>
                      {item.note}
                    </div>
                  )}
                </div>
                {item.avg_rating != null && (
                  <div style={{ fontSize: 14, color: 'var(--color-rating)', fontWeight: 700 }}>
                    {Number(item.avg_rating).toFixed(1)}
                  </div>
                )}
                {playlist.is_owner && (
                  <button
                    onClick={function (e) {
                      e.stopPropagation()
                      removeDish.mutate({ playlistId: id, dishId: item.dish_id })
                    }}
                    aria-label={'Remove ' + item.dish_name}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'transparent', border: '1.5px solid var(--color-divider)',
                      color: 'var(--color-text-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0, marginLeft: 4,
                    }}
                  >
                    &times;
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <AddDishSearchSheet
        isOpen={searchSheetOpen}
        onClose={function () { setSearchSheetOpen(false) }}
        playlistId={id}
        existingDishIds={existingDishIds}
      />
    </div>
  )
}
