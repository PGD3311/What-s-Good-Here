import { DishCard } from './DishCard'

export function DishFeed({ dishes, loading, error, onVote, onLoginRequired, selectedRestaurant }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="relative w-20 h-20 mb-6">
          {/* Animated food icon */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 animate-pulse" />
          <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
            <span className="text-3xl">🍽️</span>
          </div>
        </div>
        <p className="text-lg font-semibold text-neutral-700">Finding delicious dishes...</p>
        <p className="text-sm text-neutral-500 mt-2">This won't take long</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-16">
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <h3 className="text-lg font-bold text-red-900 mb-2">
            Unable to load dishes
          </h3>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors focus-ring"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (dishes.length === 0) {
    return (
      <div className="px-4 py-20">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
            <span className="text-4xl">🔍</span>
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-3 font-serif">
            No dishes found
          </h3>
          <p className="text-neutral-600 mb-6 max-w-sm mx-auto">
            Try increasing your search radius or changing category filters to discover more options
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/30 focus-ring"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      {/* Results count */}
      <div className="mb-6">
        <p className="text-sm font-medium text-neutral-600">
          {selectedRestaurant ? (
            <>
              <span className="text-neutral-900 font-bold">{dishes.length}</span>{' '}
              {dishes.length === 1 ? 'dish' : 'dishes'} at{' '}
              <span className="text-neutral-900 font-bold">{selectedRestaurant.name}</span>
            </>
          ) : (
            <>
              Found <span className="text-neutral-900 font-bold">{dishes.length}</span>{' '}
              {dishes.length === 1 ? 'dish' : 'dishes'}
            </>
          )}
        </p>
      </div>

      {/* Dish cards with stagger animation */}
      <div className="space-y-6">
        {dishes.map((dish) => (
          <DishCard
            key={dish.dish_id}
            dish={dish}
            onVote={onVote}
            onLoginRequired={onLoginRequired}
          />
        ))}
      </div>

      {/* Footer */}
      {dishes.length > 0 && (
        <div className="mt-12 pt-8 border-t border-neutral-200 text-center">
          <p className="text-sm text-neutral-500 mb-2">
            That's all the dishes within your radius
          </p>
          <p className="text-xs text-neutral-400">
            Try increasing your search radius to see more options
          </p>
        </div>
      )}
    </div>
  )
}
