import { useState } from 'react'
import { useLocation } from '../hooks/useLocation'
import { useDishes } from '../hooks/useDishes'
import { LocationPicker } from '../components/LocationPicker'
import { CategoryFilter } from '../components/CategoryFilter'
import { DishFeed } from '../components/DishFeed'
import { LoginModal } from '../components/Auth/LoginModal'
import { RestaurantSearch } from '../components/RestaurantSearch'

export function Home() {
  const { location, radius, setRadius, loading: locationLoading, error: locationError } = useLocation()
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [loginModalOpen, setLoginModalOpen] = useState(false)

  const { dishes, loading: dishesLoading, error: dishesError, refetch } = useDishes(
    location,
    radius,
    selectedCategory,
    selectedRestaurant?.id
  )

  const handleVote = () => {
    // Refetch dishes to get updated vote counts
    refetch()
  }

  const handleLoginRequired = () => {
    setLoginModalOpen(true)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header with beautiful design */}
      <header className="relative bg-white border-b border-neutral-200 overflow-hidden">
        {/* Decorative gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 opacity-50" />

        {/* Decorative pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        <div className="relative px-4 py-6">
          <div className="max-w-4xl mx-auto">
            {/* Logo and Title */}
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <span className="text-2xl">🍽️</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-neutral-900 font-serif leading-none">
                  What's Good Here
                </h1>
                <p className="text-sm text-neutral-600 mt-1 font-medium">
                  Discover the best dishes, skip the rest
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Location Picker */}
      <LocationPicker
        radius={radius}
        onRadiusChange={setRadius}
        location={location}
        error={locationError}
      />

      {/* Restaurant Search */}
      <RestaurantSearch
        selectedRestaurant={selectedRestaurant}
        onSelectRestaurant={setSelectedRestaurant}
        onClearRestaurant={() => setSelectedRestaurant(null)}
      />

      {/* Category Filter */}
      <CategoryFilter
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {/* Dish Feed */}
      <main>
        <DishFeed
          dishes={dishes}
          loading={locationLoading || dishesLoading}
          error={dishesError}
          onVote={handleVote}
          onLoginRequired={handleLoginRequired}
          selectedRestaurant={selectedRestaurant}
        />
      </main>

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />
    </div>
  )
}
