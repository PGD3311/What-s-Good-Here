import { useRef } from 'react'
import { playBiteSound } from '../lib/sounds'
import { getCategoryNeonImage } from '../constants/categories'

const BURGER_FALLBACK = '/categories/icons/burger.png'

export function FoodRatingSlider({ value, onChange, min = 0, max = 10, step = 0.1, category, unrated = false }) {
  const iconSrc = getCategoryNeonImage(category) || BURGER_FALLBACK
  const lastValue = useRef(value)
  const lastBiteSoundTime = useRef(0)

  // How much food is eaten (0 = full, 1 = fully eaten)
  const eatenPercent = unrated ? 0 : (value - min) / (max - min)

  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value)
    const diff = newValue - lastValue.current

    // Play bite sound when sliding up (throttled)
    if (diff > 0.3) {
      const now = Date.now()
      if (now - lastBiteSoundTime.current > 80) {
        playBiteSound()
        lastBiteSoundTime.current = now
      }
    }

    lastValue.current = newValue
    onChange(newValue)
  }

  return (
    <div className="space-y-4">
      {/* Food icon with eating effect */}
      <div className="relative flex justify-center items-center h-40">
        {/* Clean plate celebration at 10 */}
        {value >= 10 && (
          <div className="absolute inset-0 flex items-center justify-center animate-fadeIn">
            <img src="/empty-plate.webp" alt="Clean plate" className="w-16 h-16 animate-bounce rounded-full object-cover" />
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-2xl animate-pulse">✨</div>
            <div className="absolute top-6 left-1/4 text-xl animate-pulse" style={{ animationDelay: '0.2s' }}>✨</div>
            <div className="absolute top-6 right-1/4 text-xl animate-pulse" style={{ animationDelay: '0.4s' }}>✨</div>
          </div>
        )}

        {/* Flat icon with clip/eaten effect */}
        <div
          className="relative w-32 h-32 drop-shadow-lg transition-all duration-300"
          style={{
            transform: `scale(${value >= 10 ? 0 : 1 - eatenPercent * 0.3})`,
            opacity: value >= 10 ? 0 : 1,
          }}
        >
          <img
            src={iconSrc}
            alt=""
            className="w-full h-full object-contain transition-all duration-200"
            style={{
              clipPath: eatenPercent > 0.02
                ? `inset(0 ${eatenPercent * 85}% 0 0 round 0 8px 8px 0)`
                : 'none',
            }}
          />
        </div>

        {/* Rating display overlaid */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          {unrated ? (
            <span className="text-lg font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Tap to rate</span>
          ) : (
            <>
              <span className="text-4xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value.toFixed(1)}</span>
              <span className="text-xl" style={{ color: 'var(--color-text-tertiary)' }}>/10</span>
            </>
          )}
        </div>
      </div>

      {/* Label based on rating */}
      <div className="text-center">
        <span className="text-lg font-semibold" style={{ color: unrated ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
          {unrated ? 'Slide to rate' : getRatingLabel(value)}
        </span>
      </div>

      {/* Slider */}
      <div className="px-2">
        <label htmlFor="food-rating" className="sr-only">Rate this dish from 0 to 10</label>
        <input
          id="food-rating"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          aria-label={unrated ? 'Rate this dish from 0 to 10' : `Rating: ${value.toFixed(1)} out of 10. ${getRatingLabel(value)}`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={unrated ? 'Not rated yet' : `${value.toFixed(1)} out of 10: ${getRatingLabel(value)}`}
          className="rating-slider w-full h-3 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-9 [&::-webkit-slider-thumb]:h-9
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-xl
            [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:active:scale-95
            [&::-moz-range-thumb]:w-9 [&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:shadow-xl [&::-moz-range-thumb]:border-4
            [&::-moz-range-thumb]:cursor-pointer"
          style={{
            background: unrated
              ? 'var(--color-divider)'
              : 'linear-gradient(90deg, var(--color-red-light), var(--color-yellow), var(--color-emerald-light))',
          }}
        />
        <div className="flex justify-between text-xs mt-2 px-1" style={{ color: 'var(--color-text-tertiary)' }}>
          <span>0</span>
          <span>5</span>
          <span>10</span>
        </div>
      </div>
    </div>
  )
}

function getRatingLabel(value) {
  if (value >= 9.5) return "EXCELLENT Here"
  if (value >= 8.5) return "GREAT Here"
  if (value >= 7.5) return "GOOD Here"
  if (value >= 7) return "Pretty Good Here"
  if (value >= 6) return "Not Bad Here"
  if (value >= 0.1) return "Bad Here"
  return "🍽️ Slide to rate!"
}
