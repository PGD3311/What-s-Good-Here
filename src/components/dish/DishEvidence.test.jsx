import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../jitter', () => ({
  TrustBadge: () => null,
  TrustSummary: () => null,
  JitterExplainer: () => null,
}))
vi.mock('../ReportModal', () => ({ ReportModal: () => null }))
vi.mock('../VariantPicker', () => ({ VariantSelector: () => null }))

import { DishEvidence } from './DishEvidence'

afterEach(cleanup)

const DISH = {
  dish_id: 'd-1',
  dish_name: 'Lobster Roll',
  restaurant_town: 'Edgartown',
  total_votes: 4,
}

const FRIEND_REVIEW = {
  id: 'v-1',
  user_id: 'u-oliver',
  rating_10: 10,
  review_text: 'Absolutely delicious',
  review_created_at: '2026-06-01T00:00:00Z',
  source: 'user',
  profiles: { id: 'u-oliver', display_name: 'Oliver Savenor' },
  trust_badge: null,
}

function renderEvidence(overrides = {}) {
  const props = {
    dish: DISH,
    dishId: 'd-1',
    user: { id: 'u-dan' },
    authLoading: false,
    priorVote: null,
    shouldLoadEvidence: true,
    evidenceSentinelRef: { current: null },
    friendsVotes: [],
    smartSnippet: null,
    allPhotos: [],
    communityPhotos: [],
    reviews: [],
    reviewsLoading: false,
    variants: [],
    isVariant: false,
    ...overrides,
  }
  return render(
    <MemoryRouter>
      <DishEvidence {...props} />
    </MemoryRouter>
  )
}

describe('DishEvidence — "no written reviews" empty state', () => {
  it('shows the empty state when there are votes but no written reviews anywhere', () => {
    renderEvidence()
    expect(screen.getByText(/No written reviews yet/)).toBeInTheDocument()
  })

  it('does NOT show the empty state when the only written review is the quote card', () => {
    renderEvidence({ reviews: [FRIEND_REVIEW], smartSnippet: FRIEND_REVIEW })
    expect(screen.getByText(/Absolutely delicious/)).toBeInTheDocument()
    expect(screen.queryByText(/No written reviews yet/)).not.toBeInTheDocument()
  })

  it('does NOT show the empty state when the only written review is from a friend', () => {
    renderEvidence({
      reviews: [FRIEND_REVIEW],
      friendsVotes: [{ user_id: 'u-oliver', rating_10: 10, display_name: 'Oliver Savenor' }],
    })
    expect(screen.queryByText(/No written reviews yet/)).not.toBeInTheDocument()
  })

  it("shows a friend's written review in the list when it is not the quote card", () => {
    const OTHER = { ...FRIEND_REVIEW, id: 'v-2', user_id: 'u-other', review_text: 'Best on the island', profiles: { id: 'u-other', display_name: 'Someone Else' } }
    renderEvidence({
      reviews: [OTHER, FRIEND_REVIEW],
      smartSnippet: OTHER,
      friendsVotes: [{ user_id: 'u-oliver', rating_10: 10, display_name: 'Oliver Savenor' }],
    })
    expect(screen.getByText(/Absolutely delicious/)).toBeInTheDocument()
  })
})
