import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfileGrid } from './ProfileGrid'

function setup(props) {
  return render(<MemoryRouter><ProfileGrid {...props} /></MemoryRouter>)
}

const RATINGS = [
  { dish_id: 'd1', dish_name: 'Old', restaurant_name: 'R', rating_10: 7, voted_at: '2026-01-01' },
  { dish_id: 'd2', dish_name: 'New', restaurant_name: 'R', rating_10: 9, voted_at: '2026-06-01' },
  { dish_id: 'd3', dish_name: 'Unrated', restaurant_name: 'R', rating_10: null, voted_at: '2026-06-02' },
]

describe('ProfileGrid', () => {
  it('shows the empty state when there are no rated items', () => {
    setup({ ratings: [], photoMap: {}, emptyTitle: 'Nothing yet', emptySubtitle: 'Go rate' })
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
  })

  it('excludes null-rating items', () => {
    setup({ ratings: RATINGS, photoMap: {} })
    expect(screen.queryByText('Unrated')).toBeNull()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Old')).toBeInTheDocument()
  })

  it('renders newest first', () => {
    setup({ ratings: RATINGS, photoMap: {} })
    const tiles = screen.getAllByTestId('grid-tile')
    expect(tiles[0].getAttribute('data-dish-id')).toBe('d2')
  })

  it('overrides the tile photo with the user own photo map', () => {
    setup({ ratings: [{ dish_id: 'd1', dish_name: 'X', restaurant_name: 'R', rating_10: 8, voted_at: '2026-06-01', photo_url: 'SHARED' }], photoMap: { d1: 'MINE' } })
    expect(screen.getByRole('img').getAttribute('src')).toBe('MINE')
  })

  it('renders skeletons while loading', () => {
    setup({ ratings: [], photoMap: {}, loading: true })
    expect(screen.getAllByTestId('grid-skeleton').length).toBeGreaterThan(0)
  })

  it('paginates: shows 30, reveals more on Show more', () => {
    const many = Array.from({ length: 31 }, (_, i) => ({
      dish_id: 'd' + i, dish_name: 'Dish ' + i, restaurant_name: 'R', rating_10: 8,
      voted_at: '2026-06-' + String((i % 28) + 1).padStart(2, '0'),
    }))
    setup({ ratings: many, photoMap: {} })
    expect(screen.getAllByTestId('grid-tile').length).toBe(30)
    fireEvent.click(screen.getByText('Show more'))
    expect(screen.getAllByTestId('grid-tile').length).toBe(31)
  })

  it('resets pagination to the first page when resetKey changes', () => {
    const makeRatings = (prefix) => Array.from({ length: 31 }, (_, i) => ({
      dish_id: prefix + i, dish_name: 'Dish ' + i, restaurant_name: 'R', rating_10: 8,
      voted_at: '2026-06-' + String((i % 28) + 1).padStart(2, '0'),
    }))
    const { rerender } = setup({ ratings: makeRatings('a'), photoMap: {}, resetKey: 'userA' })
    fireEvent.click(screen.getByText('Show more'))
    expect(screen.getAllByTestId('grid-tile').length).toBe(31)
    // Swap to a different user's ratings, SAME length, new resetKey -> must re-cap to 30
    rerender(
      <MemoryRouter><ProfileGrid ratings={makeRatings('b')} photoMap={{}} resetKey="userB" /></MemoryRouter>
    )
    expect(screen.getAllByTestId('grid-tile').length).toBe(30)
  })
})
