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

describe('DishListItem description toggle', () => {
  it('shows an "ingredients" toggle when description is non-null', () => {
    renderItem({
      ...BASE,
      description: 'Hot lobster meat, drawn butter, split-top bun',
    })
    expect(screen.getByTestId('dish-description-toggle')).toBeInTheDocument()
    // Collapsed by default — description body is not rendered yet.
    expect(screen.queryByTestId('dish-description-preview')).not.toBeInTheDocument()
  })

  it('tapping the toggle reveals the description inline', () => {
    renderItem({
      ...BASE,
      description: 'Hot lobster meat, drawn butter, split-top bun',
    })
    fireEvent.click(screen.getByTestId('dish-description-toggle'))
    expect(screen.getByTestId('dish-description-preview')).toBeInTheDocument()
    expect(screen.getByText(/hot lobster meat, drawn butter, split-top bun/i)).toBeInTheDocument()
  })

  it('tapping the toggle a second time collapses the description', () => {
    renderItem({
      ...BASE,
      description: 'Hot lobster meat, drawn butter',
    })
    const toggle = screen.getByTestId('dish-description-toggle')
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(screen.queryByTestId('dish-description-preview')).not.toBeInTheDocument()
  })

  it('toggle reflects aria-expanded state', () => {
    renderItem({
      ...BASE,
      description: 'Anchovy, lemon, breadcrumb',
    })
    const toggle = screen.getByTestId('dish-description-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('clicking the toggle does NOT navigate to the dish (stopPropagation)', () => {
    let cardClicks = 0
    renderItem(
      { ...BASE, description: 'Some ingredients' },
      { onClick: () => { cardClicks++ } }
    )
    fireEvent.click(screen.getByTestId('dish-description-toggle'))
    expect(cardClicks).toBe(0)
  })

  it('keyboard-activating the toggle does NOT bubble Enter/Space to the card', () => {
    let cardClicks = 0
    renderItem(
      { ...BASE, description: 'Some ingredients' },
      { onClick: () => { cardClicks++ } }
    )
    const toggle = screen.getByTestId('dish-description-toggle')
    fireEvent.keyDown(toggle, { key: 'Enter' })
    fireEvent.keyDown(toggle, { key: ' ' })
    expect(cardClicks).toBe(0)
  })

  it('omits the toggle entirely when description is null', () => {
    renderItem({ ...BASE, description: null })
    expect(screen.queryByTestId('dish-description-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dish-description-preview')).not.toBeInTheDocument()
  })

  it('omits the toggle when description is undefined', () => {
    renderItem({ ...BASE })
    expect(screen.queryByTestId('dish-description-toggle')).not.toBeInTheDocument()
  })

  it('omits the toggle when description is whitespace only', () => {
    renderItem({ ...BASE, description: '   ' })
    expect(screen.queryByTestId('dish-description-toggle')).not.toBeInTheDocument()
  })
})

describe('DishListItem accessibility — no nested interactive controls', () => {
  it('outer container is NOT a button (no role="button" or tabIndex)', () => {
    renderItem({ ...BASE, description: null })
    const outer = document.querySelector('[data-dish-id="' + BASE.dish_id + '"]')
    expect(outer).not.toBeNull()
    expect(outer.getAttribute('role')).toBeNull()
    expect(outer.getAttribute('tabindex')).toBeNull()
  })

  it('dish name is a real <button> for keyboard navigation', () => {
    renderItem({ ...BASE, description: null })
    const dishNameButton = screen.getByRole('button', { name: BASE.dish_name })
    expect(dishNameButton.tagName).toBe('BUTTON')
  })

  it('clicking the dish name button navigates without double-firing the parent', () => {
    let clicks = 0
    renderItem(
      { ...BASE, description: null },
      { onClick: () => { clicks++ } }
    )
    const dishNameButton = screen.getByRole('button', { name: BASE.dish_name })
    fireEvent.click(dishNameButton)
    expect(clicks).toBe(1)
  })
})
