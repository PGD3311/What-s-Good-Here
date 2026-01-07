import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function RestaurantSearch({ selectedRestaurant, onSelectRestaurant, onClearRestaurant }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [restaurants, setRestaurants] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  // Fetch all restaurants on mount
  useEffect(() => {
    async function fetchRestaurants() {
      const { data } = await supabase
        .from('restaurants')
        .select('id, name')
        .order('name')

      setRestaurants(data || [])
    }
    fetchRestaurants()
  }, [])

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter restaurants based on search query
  const filteredRestaurants = restaurants
    .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 5)

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
    setShowDropdown(e.target.value.length > 0)
  }

  const handleSelectRestaurant = (restaurant) => {
    onSelectRestaurant(restaurant)
    setSearchQuery('')
    setShowDropdown(false)
  }

  const handleClear = () => {
    onClearRestaurant()
    setSearchQuery('')
    setShowDropdown(false)
  }

  return (
    <div ref={searchRef} className="bg-white border-b border-neutral-200 py-3 px-4">
      <div className="relative">
        {/* Search Input */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <span className="text-lg">🔍</span>
          </div>

          <input
            type="text"
            placeholder={selectedRestaurant ? selectedRestaurant.name : "Search restaurants..."}
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.length > 0 && setShowDropdown(true)}
            className="
              w-full
              pl-11 pr-12 py-3
              bg-neutral-50
              border-2 border-neutral-200
              rounded-xl
              text-sm font-medium text-neutral-900
              placeholder:text-neutral-400
              focus:outline-none focus:border-orange-400 focus:bg-white
              transition-all
            "
          />

          {/* Clear button */}
          {selectedRestaurant && (
            <button
              onClick={handleClear}
              className="
                absolute right-3 top-1/2 -translate-y-1/2
                w-6 h-6
                flex items-center justify-center
                rounded-full
                bg-neutral-200 hover:bg-neutral-300
                text-neutral-600 hover:text-neutral-900
                transition-colors
                focus-ring
              "
            >
              <span className="text-sm font-bold">✕</span>
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {showDropdown && filteredRestaurants.length > 0 && (
          <div className="
            absolute top-full left-0 right-0 mt-2 z-30
            bg-white
            border-2 border-neutral-200
            rounded-xl
            shadow-xl
            overflow-hidden
          ">
            {filteredRestaurants.map((restaurant) => (
              <button
                key={restaurant.id}
                onClick={() => handleSelectRestaurant(restaurant)}
                className="
                  w-full px-4 py-3
                  text-left text-sm font-medium
                  text-neutral-900
                  hover:bg-orange-50
                  transition-colors
                  border-b border-neutral-100 last:border-b-0
                "
              >
                {restaurant.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected restaurant indicator */}
      {selectedRestaurant && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 border border-orange-300 rounded-full">
            <span className="text-xs font-semibold text-orange-900">
              Filtering: {selectedRestaurant.name}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
