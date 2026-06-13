import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { XRayResults } from './XRayResults'
import { MIN_VOTES_FOR_RANKING } from '../../constants/app'

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
  it('renders dishes in printed-menu order with the three rating states', () => {
    render(<MemoryRouter><XRayResults result={result} photoUrl={null} /></MemoryRouter>)
    const rows = screen.getAllByRole('button')
    // menu order preserved — no reordering of winners to the top
    expect(rows[0]).toHaveTextContent('Hot Lobster Roll')
    expect(rows[1]).toHaveTextContent('Fried Clams')
    expect(rows[2]).toHaveTextContent('Crab Cakes')
    expect(screen.getByText('9.4')).toBeInTheDocument()  // rated: colored number
    expect(screen.getByText('9.1')).toBeInTheDocument()  // early: muted number, no count
    expect(screen.queryByText(/vote/i)).not.toBeInTheDocument()  // vote counts dropped
    expect(screen.getByText('+')).toBeInTheDocument()    // unrated: invitation
    expect(screen.getByText('The Galley')).toBeInTheDocument()
  })

  it('rated dish shows the site rating color; early dish is muted gray', () => {
    render(<MemoryRouter><XRayResults result={result} photoUrl={null} /></MemoryRouter>)
    // rated (12 votes, 9.4) → green-deep, the site's >=8 color
    expect(screen.getByText('9.4').getAttribute('style')).toContain('--color-green-deep')
    // early (2 votes) → muted secondary, NOT a rating color
    expect(screen.getByText('9.1').getAttribute('style')).toContain('--color-text-secondary')
  })

  it('the rated/early boundary tracks MIN_VOTES_FOR_RANKING', () => {
    const boundary = {
      ...result,
      sections: [{ name: 'Mains', items: [
        { name: 'Just Rated', price: 10, match: { dishId: 'b1', avgRating: 8.5, totalVotes: MIN_VOTES_FOR_RANKING } },
        { name: 'Still Early', price: 10, match: { dishId: 'b2', avgRating: 8.5, totalVotes: MIN_VOTES_FOR_RANKING - 1 } },
      ]}],
    }
    render(<MemoryRouter><XRayResults result={boundary} photoUrl={null} /></MemoryRouter>)
    const nums = screen.getAllByText('8.5')
    // first (at threshold) is rated → colored; second (below) is early → gray
    expect(nums[0].getAttribute('style')).toContain('--color-green-deep')
    expect(nums[1].getAttribute('style')).toContain('--color-text-secondary')
  })
})
