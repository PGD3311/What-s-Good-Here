import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

describe('DishListItem description preview', () => {
  it('renders description line when description is non-null', () => {
    renderItem({
      dish_id: 'd1',
      dish_name: 'Lobster Roll',
      restaurant_name: 'Coast Cafe',
      category: 'lobster roll',
      avg_rating: 8.4,
      total_votes: 12,
      description: 'Hot lobster meat, drawn butter, split-top bun',
    })
    expect(screen.getByText(/hot lobster meat, drawn butter, split-top bun/i)).toBeInTheDocument()
    expect(screen.getByTestId('dish-description-preview')).toBeInTheDocument()
  })

  it('omits description line when description is null', () => {
    renderItem({
      dish_id: 'd1',
      dish_name: 'Lobster Roll',
      restaurant_name: 'Coast Cafe',
      category: 'lobster roll',
      avg_rating: 8.4,
      total_votes: 12,
      description: null,
    })
    expect(screen.queryByTestId('dish-description-preview')).not.toBeInTheDocument()
  })

  it('omits description line when description is undefined', () => {
    renderItem({
      dish_id: 'd1',
      dish_name: 'Lobster Roll',
      restaurant_name: 'Coast Cafe',
      category: 'lobster roll',
      avg_rating: 8.4,
      total_votes: 12,
    })
    expect(screen.queryByTestId('dish-description-preview')).not.toBeInTheDocument()
  })

  it('omits description line when description is empty/whitespace string', () => {
    renderItem({
      dish_id: 'd1',
      dish_name: 'Lobster Roll',
      restaurant_name: 'Coast Cafe',
      category: 'lobster roll',
      description: '   ',
    })
    expect(screen.queryByTestId('dish-description-preview')).not.toBeInTheDocument()
  })
})
