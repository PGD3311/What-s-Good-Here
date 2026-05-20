import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DishHero } from './DishHero'

afterEach(cleanup)

const BASE_DISH = {
  dish_id: 'd-1',
  dish_name: 'Atria’s Crispy Wok Fired Calamari',
  restaurant_id: 'r-1',
  restaurant_name: 'Atria',
  restaurant_town: 'Edgartown',
  category: 'appetizer',
  price: 25,
  avg_rating: 8.7,
  total_votes: 6,
}

function renderHero(dish, { allPhotos = [], isVariant = false, parentDish = null } = {}) {
  return render(
    <MemoryRouter>
      <DishHero dish={dish} allPhotos={allPhotos} isVariant={isVariant} parentDish={parentDish} />
    </MemoryRouter>
  )
}

describe('DishHero — ingredients drop-down', () => {
  it('renders the ingredients toggle when description is present', () => {
    renderHero({
      ...BASE_DISH,
      description: 'Watercress, preserved lemon, sambal aioli, fragrant herbs',
    })
    expect(screen.getByTestId('hero-ingredients-toggle')).toBeInTheDocument()
    expect(screen.queryByTestId('hero-dish-description')).not.toBeInTheDocument()
  })

  it('tapping the toggle reveals the description inline', () => {
    renderHero({
      ...BASE_DISH,
      description: 'Watercress, preserved lemon, sambal aioli, fragrant herbs',
    })
    fireEvent.click(screen.getByTestId('hero-ingredients-toggle'))
    expect(screen.getByTestId('hero-dish-description')).toBeInTheDocument()
    expect(
      screen.getByText(/watercress, preserved lemon, sambal aioli, fragrant herbs/i)
    ).toBeInTheDocument()
  })

  it('tapping the toggle a second time collapses the description', () => {
    renderHero({ ...BASE_DISH, description: 'tomato, basil, mozzarella' })
    const toggle = screen.getByTestId('hero-ingredients-toggle')
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(screen.queryByTestId('hero-dish-description')).not.toBeInTheDocument()
  })

  it('toggle reflects aria-expanded state', () => {
    renderHero({ ...BASE_DISH, description: 'anchovy, lemon, breadcrumb' })
    const toggle = screen.getByTestId('hero-ingredients-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('omits the toggle entirely when description is null', () => {
    renderHero({ ...BASE_DISH, description: null })
    expect(screen.queryByTestId('hero-ingredients-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('hero-dish-description')).not.toBeInTheDocument()
  })

  it('omits the toggle when description is whitespace only', () => {
    renderHero({ ...BASE_DISH, description: '   ' })
    expect(screen.queryByTestId('hero-ingredients-toggle')).not.toBeInTheDocument()
  })
})
