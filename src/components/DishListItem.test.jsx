import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DishListItem } from './DishListItem'

afterEach(cleanup)

function renderItem(dish, extra = {}) {
  return render(
    <MemoryRouter>
      <DishListItem dish={dish} {...extra} />
    </MemoryRouter>
  )
}

const BASE = {
  dish_id: 'd1',
  dish_name: 'Lobster Roll',
  restaurant_name: 'Coast Cafe',
  category: 'lobster roll',
  avg_rating: 8.4,
  total_votes: 12,
}

describe('DishListItem — description belongs on the detail page, not the card', () => {
  it('does NOT render any ingredients toggle on the card, even when description is present', () => {
    renderItem({
      ...BASE,
      description: 'Hot lobster meat, drawn butter, split-top bun',
    })
    expect(screen.queryByTestId('dish-description-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dish-description-preview')).not.toBeInTheDocument()
  })

  it('does NOT render the description text on the card, even when present', () => {
    renderItem({
      ...BASE,
      description: 'Hot lobster meat, drawn butter, split-top bun',
    })
    expect(screen.queryByText(/hot lobster meat/i)).not.toBeInTheDocument()
  })

  it('renders normally when description is null', () => {
    renderItem({ ...BASE, description: null })
    expect(screen.getByText(BASE.dish_name)).toBeInTheDocument()
    expect(screen.queryByTestId('dish-description-toggle')).not.toBeInTheDocument()
  })
})

describe('DishListItem accessibility — no nested interactive controls', () => {
  it('outer container is NOT a button (no role="button" or tabIndex)', () => {
    renderItem({ ...BASE })
    const outer = document.querySelector('[data-dish-id="' + BASE.dish_id + '"]')
    expect(outer).not.toBeNull()
    expect(outer.getAttribute('role')).toBeNull()
    expect(outer.getAttribute('tabindex')).toBeNull()
  })

  it('dish name is a real <button> for keyboard navigation', () => {
    renderItem({ ...BASE })
    const dishNameButton = screen.getByRole('button', { name: BASE.dish_name })
    expect(dishNameButton.tagName).toBe('BUTTON')
  })

  it('clicking the dish name button navigates without double-firing the parent', () => {
    let clicks = 0
    renderItem(
      { ...BASE },
      { onClick: () => { clicks++ } }
    )
    const dishNameButton = screen.getByRole('button', { name: BASE.dish_name })
    fireEvent.click(dishNameButton)
    expect(clicks).toBe(1)
  })
})

describe('DishListItem hideRestaurantName', () => {
  it('hides the restaurant name when hideRestaurantName is true', () => {
    renderItem({ ...BASE }, { hideRestaurantName: true })
    expect(screen.queryByText(BASE.restaurant_name)).not.toBeInTheDocument()
  })

  it('still shows the restaurant name by default', () => {
    renderItem({ ...BASE })
    expect(screen.getByText(BASE.restaurant_name)).toBeInTheDocument()
  })

  it('hides the meta line entirely when restaurant is hidden and no price/distance', () => {
    // hideRestaurantName + no best_value sort + no showDistance = empty meta line.
    // It should NOT render an empty <div>/<p>.
    const { container } = renderItem({ ...BASE }, { hideRestaurantName: true })
    // The restaurant text was the only content of the meta line; with it gone,
    // a hidden line means no occurrence of the muted tertiary-color <p>.
    expect(screen.queryByText(BASE.restaurant_name)).not.toBeInTheDocument()
    // Sanity — dish name still renders.
    expect(screen.getByRole('button', { name: BASE.dish_name })).toBeInTheDocument()
  })

  it('still renders the meta line with distance even when restaurant is hidden', () => {
    renderItem(
      { ...BASE, distance_miles: 0.3 },
      { hideRestaurantName: true, showDistance: true }
    )
    expect(screen.queryByText(BASE.restaurant_name)).not.toBeInTheDocument()
    expect(screen.getByText(/0\.3 mi/)).toBeInTheDocument()
  })
})
