import { useEffect, useState } from 'react'

function sortDishes(arr) {
  return arr.slice().sort(function (a, b) {
    var aRating = a.avg_rating || 0
    var bRating = b.avg_rating || 0
    if (bRating !== aRating) return bRating - aRating

    var aVotes = a.total_votes || 0
    var bVotes = b.total_votes || 0
    if (bVotes !== aVotes) return bVotes - aVotes

    return (a.dish_name || '').localeCompare(b.dish_name || '')
  })
}

export function buildDishSections(dishes, menuSectionOrder, searchQuery) {
  var normalizedQuery = (searchQuery || '').toLowerCase().trim()
  var filteredDishes = (dishes || []).filter(function (dish) {
    if (!normalizedQuery) return true

    return (
      (dish.dish_name || '').toLowerCase().includes(normalizedQuery) ||
      (dish.category || '').toLowerCase().includes(normalizedQuery) ||
      (dish.menu_section || '').toLowerCase().includes(normalizedQuery)
    )
  })

  var groups = {}
  var uncategorized = []

  filteredDishes.forEach(function (dish) {
    var sectionName = dish.menu_section

    if (!sectionName) {
      uncategorized.push(dish)
      return
    }

    if (!groups[sectionName]) {
      groups[sectionName] = []
    }

    groups[sectionName].push(dish)
  })

  var orderedSectionNames = Object.keys(groups).slice().sort(function (a, b) {
    var aIndex = menuSectionOrder.indexOf(a)
    var bIndex = menuSectionOrder.indexOf(b)

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1

    return a.localeCompare(b)
  })

  var sections = orderedSectionNames.map(function (sectionName) {
    return {
      name: sectionName,
      dishes: sortDishes(groups[sectionName]),
    }
  })

  if (uncategorized.length > 0) {
    sections.push({
      name: 'Other',
      dishes: sortDishes(uncategorized),
    })
  }

  return sections
}

export function DishSelector({
  dishes,
  loading,
  error,
  menuSectionOrder,
  searchQuery,
  onSearchQueryChange,
  selectedDishIds,
  specialDishEnabled,
  specialDishName,
  onToggleDish,
  onSpecialToggle,
  onSpecialDishNameChange,
  onBack,
  onContinue,
}) {
  var [activeSection, setActiveSection] = useState(null)
  var sections = buildDishSections(dishes, menuSectionOrder, searchQuery)
  var selectedCount = Object.keys(selectedDishIds || {}).length + (specialDishEnabled && specialDishName.trim() ? 1 : 0)

  useEffect(function () {
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0].name)
      return
    }

    if (sections.length === 0) {
      setActiveSection(null)
      return
    }

    var stillExists = sections.some(function (section) { return section.name === activeSection })
    if (!stillExists) {
      setActiveSection(sections[0].name)
    }
  }, [sections, activeSection])

  var activeSectionData = sections.find(function (section) {
    return section.name === activeSection
  }) || sections[0] || null

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--color-bg)' }}>
      <div
        className="sticky top-0 z-20 px-4 py-3"
        style={{
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)' }}
            aria-label="Back to restaurant"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1
              className="font-bold"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--color-text-primary)',
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '0',
              }}
            >
              Rate Your Meal
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              Pick every dish you ate
            </p>
          </div>
        </div>

        <div
          className="mt-3 rounded-2xl px-3 py-2.5 flex items-center gap-2"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-divider)',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m0 0A7.95 7.95 0 1 0 5.4 5.4a7.95 7.95 0 0 0 11.25 11.25Z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={function (event) { onSearchQueryChange(event.target.value) }}
            placeholder="Search dishes or sections"
            className="w-full bg-transparent outline-none text-sm"
            style={{ color: 'var(--color-text-primary)' }}
          />
        </div>
      </div>

      {loading && (
        <div className="px-4 py-6 space-y-4">
          <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--color-surface)' }} />
          <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--color-surface)' }} />
        </div>
      )}

      {!loading && error && (
        <div className="px-4 pt-8 text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>
            {error?.message || error}
          </p>
        </div>
      )}

      {!loading && !error && sections.length === 0 && (
        <div className="px-4 pt-8">
          <div
            className="rounded-2xl px-5 py-8 text-center"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
            }}
          >
            <p className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              {searchQuery ? 'No dishes match that search' : 'No menu items yet'}
            </p>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              You can still add a special dish below.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && sections.length > 0 && (
        <div
          className="flex mx-3 my-4 rounded-2xl overflow-hidden"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-divider)',
            minHeight: '420px',
          }}
        >
          <nav
            className="flex-shrink-0 overflow-y-auto py-3"
            style={{
              width: '33%',
              background: 'var(--color-bg)',
              borderRight: '1px solid var(--color-divider)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            aria-label="Menu sections"
          >
            {sections.map(function (section) {
              var isActive = section.name === activeSectionData?.name
              return (
                <button
                  key={section.name}
                  onClick={function () { setActiveSection(section.name) }}
                  className="w-full text-left px-3.5 py-3 transition-all relative"
                  style={{
                    background: isActive ? 'var(--color-primary-muted)' : 'transparent',
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full"
                      style={{
                        height: '60%',
                        background: 'var(--color-primary)',
                      }}
                    />
                  )}
                  <span
                    className="block font-semibold leading-tight"
                    style={{
                      fontSize: '14px',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                    }}
                  >
                    {section.name}
                  </span>
                  <span
                    className="block mt-0.5 font-medium"
                    style={{
                      fontSize: '11px',
                      color: isActive ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                    }}
                  >
                    {section.dishes.length} {section.dishes.length === 1 ? 'item' : 'items'}
                  </span>
                </button>
              )
            })}
          </nav>

          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div
              className="sticky top-0 z-10 px-4 py-3"
              style={{
                background: 'linear-gradient(180deg, var(--color-surface) 85%, transparent)',
                borderBottom: '1px solid var(--color-divider)',
              }}
            >
              <h2
                className="font-bold"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--color-text-primary)',
                  fontSize: '17px',
                  fontWeight: 700,
                  letterSpacing: '0',
                }}
              >
                {activeSectionData?.name}
              </h2>
            </div>

            <div className="px-3 pb-4">
              {activeSectionData?.dishes.map(function (dish, index) {
                var isSelected = !!selectedDishIds[dish.dish_id]
                return (
                  <button
                    key={dish.dish_id}
                    onClick={function () { onToggleDish(dish) }}
                    className="w-full text-left px-2 py-3 rounded-xl transition-all active:scale-[0.98]"
                    style={{
                      borderBottom: index < activeSectionData.dishes.length - 1 ? '1px solid var(--color-divider)' : 'none',
                      background: isSelected ? 'var(--color-primary-muted)' : 'transparent',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          background: isSelected ? 'var(--color-primary)' : 'transparent',
                          border: isSelected ? 'none' : '1.5px solid var(--color-divider)',
                          color: isSelected ? 'var(--color-text-on-primary)' : 'var(--color-text-tertiary)',
                        }}
                      >
                        {isSelected ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold" style={{ color: 'var(--color-text-primary)', fontSize: '14px' }}>
                              {dish.dish_name}
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                              {dish.category || activeSectionData.name}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                              {dish.price ? '$' + Number(dish.price).toFixed(0) : '--'}
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                              {(dish.total_votes || 0) > 0 ? (dish.total_votes || 0) + ' votes' : 'No votes'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-24">
        <button
          onClick={onSpecialToggle}
          className="w-full rounded-2xl px-4 py-4 text-left transition-all active:scale-[0.99]"
          style={{
            background: specialDishEnabled ? 'var(--color-primary-muted)' : 'var(--color-surface)',
            border: specialDishEnabled ? '1px solid var(--color-primary)' : '1px solid var(--color-divider)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Special
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                Add a dish that wasn't on the menu
              </p>
            </div>
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: specialDishEnabled ? 'var(--color-primary)' : 'transparent',
                border: specialDishEnabled ? 'none' : '1.5px solid var(--color-divider)',
                color: 'var(--color-text-on-primary)',
              }}
            >
              {specialDishEnabled ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : null}
            </div>
          </div>
        </button>

        {specialDishEnabled && (
          <div
            className="mt-3 rounded-2xl px-4 py-4"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
            }}
          >
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              What was it?
            </label>
            <input
              type="text"
              value={specialDishName}
              onChange={function (event) { onSpecialDishNameChange(event.target.value) }}
              placeholder="Lobster special, chef's burger, secret pie..."
              className="w-full rounded-xl px-3 py-3 text-sm outline-none"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-divider)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
        )}
      </div>

      <div
        className="fixed left-0 right-0 z-30 px-4 pt-3 pb-3"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom))',
          background: 'var(--color-bg)',
          boxShadow: selectedCount > 0 ? '0 -4px 20px rgba(0,0,0,0.12)' : '0 -2px 12px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        {selectedCount > 0 && (
          <p
            className="text-center font-semibold mb-2"
            style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}
          >
            {selectedCount} dish{selectedCount === 1 ? '' : 'es'} selected — ready to rate!
          </p>
        )}
        <button
          onClick={onContinue}
          disabled={selectedCount === 0}
          className="w-full rounded-2xl py-3.5 font-bold text-sm transition-all"
          style={{
            background: selectedCount === 0 ? 'var(--color-surface-elevated)' : 'var(--color-primary)',
            color: selectedCount === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-on-primary)',
            opacity: selectedCount === 0 ? 0.7 : 1,
          }}
        >
          {selectedCount === 0
            ? 'Tap dishes you ate'
            : 'Rate ' + selectedCount + ' Dish' + (selectedCount === 1 ? '' : 'es') + ' →'}
        </button>
      </div>
    </div>
  )
}
