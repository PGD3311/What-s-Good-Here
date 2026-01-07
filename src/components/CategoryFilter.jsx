const CATEGORIES = [
  { id: null, label: 'All Dishes', emoji: '🍽️' },
  { id: 'burger', label: 'Burgers', emoji: '🍔' },
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'sushi', label: 'Sushi', emoji: '🍣' },
  { id: 'taco', label: 'Tacos', emoji: '🌮' },
  { id: 'wings', label: 'Wings', emoji: '🍗' },
  { id: 'lobster roll', label: 'Lobster Rolls', emoji: '🦞' },
  { id: 'fish', label: 'Fish', emoji: '🐟' },
  { id: 'chowder', label: 'Chowder', emoji: '🥣' },
  { id: 'apps', label: 'Apps', emoji: '🍴' },
  { id: 'fried chicken', label: 'Fried Chicken', emoji: '🍗' },
  { id: 'entree', label: 'Entrees', emoji: '🍖' },
]

export function CategoryFilter({ selectedCategory, onSelectCategory }) {
  return (
    <div className="sticky top-0 z-20 glass-header border-b border-neutral-200/60">
      <div className="relative">
        {/* Fade edges for scroll indication */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white/90 to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/90 to-transparent pointer-events-none z-10" />

        {/* Scrollable category chips */}
        <div className="overflow-x-auto scrollbar-hide smooth-scroll">
          <div className="flex gap-2 px-4 py-4 min-w-max">
            {CATEGORIES.map((category, index) => (
              <button
                key={category.id || 'all'}
                onClick={() => onSelectCategory(category.id)}
                className={`
                  px-5 py-2.5 rounded-full
                  font-semibold text-sm whitespace-nowrap
                  transition-all duration-200 ease-out
                  focus-ring
                  ${
                    selectedCategory === category.id
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 scale-105'
                      : 'bg-white text-neutral-700 border border-neutral-200 hover:border-orange-300 hover:bg-orange-50 shadow-sm'
                  }
                `}
                style={{
                  animationDelay: `${index * 0.03}s`,
                }}
              >
                <span className="mr-2 text-base">{category.emoji}</span>
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active category indicator text (optional) */}
      {selectedCategory && (
        <div className="px-4 pb-3 pt-1">
          <p className="text-xs text-neutral-500 font-medium">
            Showing {CATEGORIES.find(c => c.id === selectedCategory)?.label.toLowerCase() || 'all dishes'}
          </p>
        </div>
      )}
    </div>
  )
}
