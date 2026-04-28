import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { notificationsApi } from '../api/notificationsApi'
import { logger } from '../utils/logger'

/**
 * Notification bell icon with dropdown
 */
export function NotificationBell() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [notifications, setNotifications] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  // Fetch unread count via React Query with polling
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount', user?.id],
    queryFn: () => notificationsApi.getUnreadCount(),
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 30000,
  })

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape' && showDropdown) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showDropdown])

  // Fetch notifications when dropdown opens
  const handleBellClick = async () => {
    if (!user) {
      navigate('/login')
      return
    }

    setShowDropdown(!showDropdown)

    if (!showDropdown) {
      setLoading(true)
      try {
        const data = await notificationsApi.getNotifications(20)
        setNotifications(data)
        // Mark that we've viewed these notifications - they'll be deleted when dropdown closes
        if (data.length > 0) {
          queryClient.setQueryData(['notifications', 'unreadCount', user?.id], 0)
        }
      } catch (err) {
        logger.error('Failed to fetch notifications:', err)
      } finally {
        setLoading(false)
      }
    }
  }

  // Delete notifications when dropdown closes
  useEffect(() => {
    if (!showDropdown && notifications.length > 0) {
      // Delete from database and clear local state
      const deleteNotifications = async () => {
        try {
          await notificationsApi.deleteAll()
          queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] })
        } catch (err) {
          logger.error('Failed to delete notifications:', err)
        }
      }
      deleteNotifications()
      setNotifications([])
    }
  }, [showDropdown, notifications.length])

  // Handle clicking a notification
  const handleNotificationClick = (notification) => {
    setShowDropdown(false)
    if (notification.type === 'follow' && notification.data?.follower_id) {
      navigate(`/user/${notification.data.follower_id}`)
    }
  }

  // Format time ago
  const timeAgo = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    // Guard against invalid dates
    if (isNaN(date.getTime())) return ''
    const now = new Date()
    const seconds = Math.floor((now - date) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (!user) return null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        onClick={handleBellClick}
        className="relative p-2 rounded-full transition-all duration-150 active:scale-95 active:opacity-80"
        style={{ color: 'var(--color-surface)' }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={showDropdown}
        aria-haspopup="true"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] flex items-center justify-center text-xs font-bold rounded-full px-1 shadow-lg"
            style={{ background: 'var(--color-red)', color: '#FFFFFF' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div
          role="menu"
          aria-label="Notifications menu"
          className="fixed top-14 right-4 w-80 max-h-96 overflow-y-auto rounded-xl shadow-xl border z-50"
          style={{ background: 'var(--color-surface-elevated)', borderColor: 'var(--color-divider)' }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 border-b font-semibold"
            style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-divider)' }}
          >
            Notifications
          </div>

          {/* Content */}
          {loading ? (
            <div className="py-8 flex justify-center" role="status">
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--color-divider)', borderTopColor: 'var(--color-primary)' }}
                aria-hidden="true"
              />
              <span className="sr-only">Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center">
              <div className="text-3xl mb-2">🔔</div>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                No notifications yet
              </p>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  role="menuitem"
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left transition-all duration-150 active:scale-[0.98] active:opacity-80 border-b last:border-b-0"
                  style={{
                    borderColor: 'var(--color-divider)',
                    background: notification.read ? 'transparent' : 'var(--color-surface-elevated)',
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
                    style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
                  >
                    {notification.type === 'follow'
                      ? notification.data?.follower_name?.charAt(0).toUpperCase() || '?'
                      : '🔔'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {notification.type === 'follow' ? (
                        <>
                          <span className="font-semibold">{notification.data?.follower_name || 'Someone'}</span>
                          {' started following you'}
                        </>
                      ) : (
                        'New notification'
                      )}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                      {timeAgo(notification.created_at)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!notification.read && (
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0 mt-2"
                      style={{ background: 'var(--color-primary)' }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
