import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DishListItem } from './DishListItem'

function renderTile(dish) {
  return render(
    <MemoryRouter>
      <DishListItem dish={dish} variant="grid" />
    </MemoryRouter>
  )
}

describe('DishListItem grid variant', () => {
  it('renders the food photo when photo_url is present', () => {
    renderTile({ dish_id: 'd1', dish_name: 'Tuna crudo', restaurant_name: 'The Port', rating_10: 9, photo_url: 'http://x/1.jpg' })
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('http://x/1.jpg')
    expect(screen.getByText('Tuna crudo')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('renders a rating-only card (no img, no emoji) when there is no photo or review', () => {
    renderTile({ dish_id: 'd2', dish_name: 'Lobster roll', restaurant_name: 'The Bite', rating_10: 10, photo_url: null })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Lobster roll')).toBeInTheDocument()
  })

  it('renders the review as a quote card when present without a photo', () => {
    renderTile({ dish_id: 'd3', dish_name: 'Fried oysters', restaurant_name: "Nancy's", rating_10: 8, photo_url: null, review_text: 'Crispy and briny' })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText(/Crispy and briny/)).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('exposes data-dish-id for dish navigation', () => {
    renderTile({ dish_id: 'd4', dish_name: 'X', restaurant_name: 'Y', rating_10: 7, photo_url: null })
    expect(screen.getByTestId('grid-tile').getAttribute('data-dish-id')).toBe('d4')
  })

  it('formats a decimal rating with one decimal place', () => {
    renderTile({ dish_id: 'd5', dish_name: 'X', restaurant_name: 'Y', rating_10: 8.5, photo_url: null })
    expect(screen.getByText('8.5')).toBeInTheDocument()
  })

  it('renders no rating label when rating is null', () => {
    renderTile({ dish_id: 'd6', dish_name: 'Solo', restaurant_name: 'Z', rating_10: null, photo_url: null })
    // dish still shows; rating numeral is empty
    expect(screen.getByText('Solo')).toBeInTheDocument()
    expect(screen.queryByText(/^\d/)).toBeNull()
  })

  it('shows the rating badge on photo tiles but not when rating is null', () => {
    const { rerender } = renderTile({ dish_id: 'p1', dish_name: 'A', restaurant_name: 'B', rating_10: 9, photo_url: 'http://x/p.jpg' })
    expect(screen.getByTestId('grid-rating-badge')).toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <DishListItem dish={{ dish_id: 'p2', dish_name: 'A', restaurant_name: 'B', rating_10: null, photo_url: 'http://x/p.jpg' }} variant="grid" />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('grid-rating-badge')).toBeNull()
  })

  it('shows the rating date in the corner', () => {
    renderTile({ dish_id: 'd7', dish_name: 'Dated', restaurant_name: 'R', rating_10: 8, photo_url: null, voted_at: '2026-06-01T12:00:00Z' })
    expect(screen.getByText('Jun 1')).toBeInTheDocument()
  })
})
