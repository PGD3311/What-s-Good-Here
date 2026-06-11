import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { XRayResults } from './XRayResults'

const result = {
  restaurant: { id: 'r1', name: 'The Galley' },
  best: { dishId: 'd1', name: 'Hot Lobster Roll', avgRating: 9.4, totalVotes: 12 },
  summary: { matched: 2, ingested: 1, total: 3 },
  sections: [{ name: 'Mains', items: [
    { name: 'Hot Lobster Roll', price: 34, match: { dishId: 'd1', avgRating: 9.4, totalVotes: 12 }, ingested: false },
    { name: 'Fried Clams', price: 22, match: { dishId: 'd2', avgRating: 9.1, totalVotes: 2 }, ingested: false },
    { name: 'Crab Cakes', price: 24, match: null, ingested: true },
  ]}],
}

describe('XRayResults', () => {
  it('ranks each section: rated by rating first, early next, unrated last', () => {
    const shuffled = {
      ...result,
      sections: [{ name: 'Mains', items: [
        { name: 'Crab Cakes', price: 24, match: null, ingested: true },
        { name: 'Fried Clams', price: 22, match: { dishId: 'd2', avgRating: 9.1, totalVotes: 2 }, ingested: false },
        { name: 'Hot Lobster Roll', price: 34, match: { dishId: 'd1', avgRating: 9.4, totalVotes: 12 }, ingested: false },
      ]}],
    }
    render(<MemoryRouter><XRayResults result={shuffled} photoUrl={null} /></MemoryRouter>)
    const rows = screen.getAllByRole('button')
    expect(rows[0]).toHaveTextContent('Hot Lobster Roll')
    expect(rows[1]).toHaveTextContent('Fried Clams')
    expect(rows[2]).toHaveTextContent('Crab Cakes')
  })

  it('renders all three verdict tiers', () => {
    render(<MemoryRouter><XRayResults result={result} photoUrl={null} /></MemoryRouter>)
    expect(screen.getByText('9.4')).toBeInTheDocument()
    expect(screen.getByText(/9\.1 · 2 votes/)).toBeInTheDocument()
    expect(screen.getByText(/be the first/)).toBeInTheDocument()
    expect(screen.getByText(/★/)).toBeInTheDocument()
    expect(screen.getByText('The Galley')).toBeInTheDocument()
  })
})
