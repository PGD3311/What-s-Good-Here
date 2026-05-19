import { useNavigate } from 'react-router-dom'
import { DIETARY_TAG_LABELS, DIETARY_DISCLAIMER, ALLOWED_DIETARY_TAGS } from '../../constants/dietaryTags'
import { serializeDietParam } from '../../utils/dietUrlParams'

/**
 * DishDescription — the "what's in this?" block on the dish detail page.
 *
 * Renders three optional surfaces, in order:
 *   1. The ingredient/preparation description (terse, ≤80 chars, Sonnet extracted)
 *   2. A row of tappable dietary tag pills (Vegan, Vegetarian, etc.)
 *   3. An allergen disclaimer (only when at least one tag is shown)
 *
 * Each surface is null-safe — the whole block returns null when the dish
 * has no description AND no dietary tags, so dishes that haven't been
 * backfilled yet render the page exactly as before.
 *
 * Tapping a tag pill navigates to `/?diet=<tag>` so the homepage list
 * filters to that restriction.
 */
export function DishDescription({ description, dietaryTags }) {
  var navigate = useNavigate()

  var hasDescription = typeof description === 'string' && description.trim().length > 0
  var tags = Array.isArray(dietaryTags)
    ? dietaryTags.filter(function (t) { return ALLOWED_DIETARY_TAGS.indexOf(t) !== -1 })
    : []
  var hasTags = tags.length > 0

  if (!hasDescription && !hasTags) return null

  function handleTagClick(tag) {
    navigate('/?diet=' + serializeDietParam([tag]))
  }

  return (
    <section
      aria-label="Dish description and dietary tags"
      style={{
        margin: '12px 16px 8px',
        padding: '16px 18px',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-divider)',
        borderRadius: '14px',
      }}
    >
      {hasDescription ? (
        <p
          style={{
            margin: 0,
            fontFamily: 'Outfit, sans-serif',
            fontSize: '15px',
            fontWeight: 500,
            lineHeight: 1.45,
            color: 'var(--color-text-primary)',
            letterSpacing: '0.005em',
          }}
        >
          {description.trim()}
        </p>
      ) : null}

      {hasTags ? (
        <div
          aria-label="Dietary tags"
          data-testid="dietary-tag-pills"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: hasDescription ? '14px' : 0,
          }}
        >
          {tags.map(function (tag) {
            var label = DIETARY_TAG_LABELS[tag] || tag
            return (
              <button
                key={tag}
                type="button"
                onClick={function () { handleTagClick(tag) }}
                aria-label={'Filter homepage by ' + label}
                style={{
                  padding: '6px 12px',
                  background: 'var(--color-primary-muted)',
                  border: '1.5px solid var(--color-primary)',
                  borderRadius: '999px',
                  color: 'var(--color-primary)',
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 700,
                  fontSize: '12px',
                  letterSpacing: '0.02em',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      ) : null}

      {hasTags ? (
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flex: '0 0 auto',
              width: 16,
              height: 16,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1.5px solid var(--color-text-tertiary)',
              color: 'var(--color-text-tertiary)',
              fontSize: '10px',
              fontWeight: 700,
              fontFamily: 'Outfit, sans-serif',
              lineHeight: 1,
              marginTop: '1px',
            }}
          >
            i
          </span>
          <p
            style={{
              margin: 0,
              fontFamily: 'Outfit, sans-serif',
              fontSize: '11px',
              lineHeight: 1.45,
              color: 'var(--color-text-tertiary)',
            }}
          >
            {DIETARY_DISCLAIMER}
          </p>
        </div>
      ) : null}
    </section>
  )
}
