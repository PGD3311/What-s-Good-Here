import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useRestaurantManager } from '../hooks/useRestaurantManager'
import { restaurantManagerApi } from '../api/restaurantManagerApi'
import { logger } from '../utils/logger'
import { getUserMessage } from '../utils/errorHandler'
import { SpecialsManager, DishesManager, EventsManager, RestaurantInfoEditor } from '../components/restaurant-admin'

export function ManageRestaurant() {
  const navigate = useNavigate()
  const { loading: authLoading } = useAuth()
  const { isManager, restaurant, loading: managerLoading } = useRestaurantManager()

  const [activeTab, setActiveTab] = useState('specials')
  const [specials, setSpecials] = useState([])
  const [dishes, setDishes] = useState([])
  const [events, setEvents] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [message, setMessage] = useState(null)

  // Fetch restaurant data when we know the restaurant
  useEffect(() => {
    if (!restaurant?.id) return

    let cancelled = false

    async function fetchData() {
      setDataLoading(true)
      try {
        const [specialsData, dishesData, eventsData] = await Promise.all([
          restaurantManagerApi.getRestaurantSpecials(restaurant.id),
          restaurantManagerApi.getRestaurantDishes(restaurant.id),
          restaurantManagerApi.getRestaurantEvents(restaurant.id),
        ])
        if (cancelled) return
        setSpecials(specialsData)
        setDishes(dishesData)
        setEvents(eventsData)
      } catch (error) {
        if (cancelled) return
        logger.error('Error fetching restaurant data:', error)
        setMessage({ type: 'error', text: 'Failed to load restaurant data' })
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [restaurant?.id])

  // Specials handlers
  async function handleAddSpecial(params) {
    try {
      const newSpecial = await restaurantManagerApi.createSpecial(params)
      setSpecials(prev => [newSpecial, ...prev])
      setMessage({ type: 'success', text: 'Special added!' })
    } catch (error) {
      logger.error('Error adding special:', error)
      setMessage({ type: 'error', text: `Failed to add special: ${getUserMessage(error, 'adding special')}` })
    }
  }

  async function handleUpdateSpecial(id, updates) {
    try {
      const updated = await restaurantManagerApi.updateSpecial(id, updates)
      setSpecials(prev => prev.map(s => s.id === id ? updated : s))
      setMessage({ type: 'success', text: 'Special updated!' })
    } catch (error) {
      logger.error('Error updating special:', error)
      setMessage({ type: 'error', text: `Failed to update: ${getUserMessage(error, 'updating special')}` })
    }
  }

  async function handleDeactivateSpecial(id) {
    try {
      const updated = await restaurantManagerApi.deactivateSpecial(id)
      setSpecials(prev => prev.map(s => s.id === id ? updated : s))
      setMessage({ type: 'success', text: 'Special deactivated' })
    } catch (error) {
      logger.error('Error deactivating special:', error)
      setMessage({ type: 'error', text: `Failed to deactivate: ${getUserMessage(error, 'deactivating special')}` })
    }
  }

  // Dishes handlers
  async function handleAddDish(params) {
    try {
      const newDish = await restaurantManagerApi.addDish(params)
      setDishes(prev => [...prev, newDish].slice().sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name)))
      setMessage({ type: 'success', text: 'Dish added!' })
    } catch (error) {
      logger.error('Error adding dish:', error)
      setMessage({ type: 'error', text: `Failed to add dish: ${getUserMessage(error, 'adding dish')}` })
    }
  }

  async function handleUpdateDish(dishId, updates) {
    try {
      const updated = await restaurantManagerApi.updateDish(dishId, updates)
      setDishes(prev => prev.map(d => d.id === dishId ? updated : d))
      setMessage({ type: 'success', text: 'Dish updated!' })
    } catch (error) {
      logger.error('Error updating dish:', error)
      setMessage({ type: 'error', text: `Failed to update: ${getUserMessage(error, 'updating dish')}` })
    }
  }

  // Bulk add dishes handler
  async function handleBulkAddDishes(dishesArray) {
    try {
      const newDishes = await restaurantManagerApi.bulkAddDishes(restaurant.id, dishesArray)
      setDishes(prev => [...prev, ...newDishes].slice().sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name)))
      setMessage({ type: 'success', text: `${newDishes.length} dishes added!` })
    } catch (error) {
      logger.error('Error bulk adding dishes:', error)
      setMessage({ type: 'error', text: `Failed to add dishes: ${getUserMessage(error, 'adding dishes')}` })
    }
  }

  // Delete dish handler
  async function handleDeleteDish(dishId) {
    try {
      await restaurantManagerApi.deleteDish(dishId)
      setDishes(prev => prev.filter(d => d.id !== dishId))
      setMessage({ type: 'success', text: 'Dish removed' })
    } catch (error) {
      logger.error('Error deleting dish:', error)
      setMessage({ type: 'error', text: `Failed to remove dish: ${getUserMessage(error, 'removing dish')}` })
    }
  }

  // Restaurant info handler
  async function handleUpdateInfo(updates) {
    try {
      await restaurantManagerApi.updateRestaurantInfo(restaurant.id, updates)
      setMessage({ type: 'success', text: 'Restaurant info updated!' })
    } catch (error) {
      logger.error('Error updating restaurant info:', error)
      setMessage({ type: 'error', text: `Failed to update: ${getUserMessage(error, 'updating restaurant info')}` })
    }
  }

  // Events handlers
  async function handleAddEvent(params) {
    try {
      const newEvent = await restaurantManagerApi.createEvent(params)
      setEvents(prev => [newEvent, ...prev])
      setMessage({ type: 'success', text: 'Event added!' })
    } catch (error) {
      logger.error('Error adding event:', error)
      setMessage({ type: 'error', text: `Failed to add event: ${getUserMessage(error, 'adding event')}` })
    }
  }

  async function handleUpdateEvent(id, updates) {
    try {
      const updated = await restaurantManagerApi.updateEvent(id, updates)
      setEvents(prev => prev.map(e => e.id === id ? updated : e))
      setMessage({ type: 'success', text: 'Event updated!' })
    } catch (error) {
      logger.error('Error updating event:', error)
      setMessage({ type: 'error', text: `Failed to update: ${getUserMessage(error, 'updating event')}` })
    }
  }

  async function handleDeactivateEvent(id) {
    try {
      const updated = await restaurantManagerApi.deactivateEvent(id)
      setEvents(prev => prev.map(e => e.id === id ? updated : e))
      setMessage({ type: 'success', text: 'Event deactivated' })
    } catch (error) {
      logger.error('Error deactivating event:', error)
      setMessage({ type: 'error', text: `Failed to deactivate: ${getUserMessage(error, 'deactivating event')}` })
    }
  }

  // Loading states
  if (authLoading || managerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--color-primary)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  // Access denied
  if (!isManager) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-surface)' }}>
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--color-danger-rgb), 0.2)' }}>
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Access Denied
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            You don't have permission to manage a restaurant. Ask an admin for an invite link.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-xl font-semibold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <header className="px-4 py-4 border-b" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-divider)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {restaurant.name}
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Restaurant Manager</p>
          </div>
        </div>
      </header>

      {/* Message */}
      {message && (
        <div className="mx-4 mt-4">
          <div
            className="p-3 rounded-lg text-sm font-medium"
            style={message.type === 'error'
              ? { background: 'rgba(var(--color-danger-rgb), 0.15)', color: 'var(--color-danger)' }
              : { background: 'rgba(var(--color-success-rgb), 0.15)', color: 'var(--color-success)' }
            }
          >
            {message.text}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pt-4">
        <div className="flex gap-2 mb-4">
          {['specials', 'events', 'menu', 'info'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all"
              style={activeTab === tab
                ? { background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }
                : { background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }
              }
            >
              {tab === 'specials' ? `Specials${!dataLoading && specials.filter(s => s.is_active).length ? ` (${specials.filter(s => s.is_active).length})` : ''}` : tab === 'events' ? `Events${!dataLoading && events.filter(e => e.is_active).length ? ` (${events.filter(e => e.is_active).length})` : ''}` : tab === 'menu' ? `Menu${!dataLoading && dishes.length ? ` (${dishes.length})` : ''}` : 'Info'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4">
        {dataLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--color-surface-elevated)' }} />
            ))}
          </div>
        ) : activeTab === 'specials' ? (
          <SpecialsManager
            restaurantId={restaurant.id}
            specials={specials}
            onAdd={handleAddSpecial}
            onUpdate={handleUpdateSpecial}
            onDeactivate={handleDeactivateSpecial}
          />
        ) : activeTab === 'events' ? (
          <EventsManager
            restaurantId={restaurant.id}
            events={events}
            onAdd={handleAddEvent}
            onUpdate={handleUpdateEvent}
            onDeactivate={handleDeactivateEvent}
          />
        ) : activeTab === 'menu' ? (
          <DishesManager
            restaurantId={restaurant.id}
            dishes={dishes}
            onAdd={handleAddDish}
            onUpdate={handleUpdateDish}
            onDelete={handleDeleteDish}
            onBulkAdd={handleBulkAddDishes}
            restaurantName={restaurant.name}
          />
        ) : (
          <RestaurantInfoEditor
            restaurant={restaurant}
            onUpdate={handleUpdateInfo}
          />
        )}
      </div>
    </div>
  )
}
