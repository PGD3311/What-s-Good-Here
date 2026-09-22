import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MIN_VOTES_FOR_RANKING } from '../../constants/app'

const authState = { user: null }
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../Auth/LoginModal', () => ({ LoginModal: ({ isOpen }) => (isOpen ? <div data-testid="login-modal" /> : null) }))
const addStagedDishes = vi.fn()
vi.mock('../../api/menuScanApi', () => ({ menuScanApi: { addStagedDishes: (...a) => addStagedDishes(...a) } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../lib/analytics', () => ({ capture: vi.fn() }))

import { XRayResults } from './XRayResults'

afterEach(cleanup)
beforeEach(() => { authState.user = null; addStagedDishes.mockReset() })

const result = {
  restaurant: { id: 'r1', name: 'The Galley' },
  best: { dishId: 'd1', name: 'Hot Lobster Roll', avgRating: 9.4, totalVotes: 12 },
  extraction_id: 'ext-1',
  summary: { matched: 2, addable: 1, total: 3 },
  sections: [{ name: 'Mains', items: [
    { name: 'Hot Lobster Roll', price: 34, match: { dishId: 'd1', avgRating: 9.4, totalVotes: 12 }, addable: false },
    { name: 'Fried Clams', price: 22, match: { dishId: 'd2', avgRating: 9.1, totalVotes: 2 }, addable: false },
    { name: 'Crab Cakes', price: 24, match: null, addable: true },
  ]}],
}

function renderResults(r = result) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><XRayResults result={r} photoUrl={null} /></MemoryRouter></QueryClientProvider>)
}

describe('XRayResults', () => {
  it('renders dishes in printed-menu order with the three rating states', () => {
    renderResults()
    const rows = screen.getAllByRole('button').filter(b => /Lobster|Clams|Crab/.test(b.textContent))
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
    renderResults()
    expect(screen.getByText('9.4').getAttribute('style')).toContain('--color-green-deep')
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
    renderResults(boundary)
    const nums = screen.getAllByText('8.5')
    expect(nums[0].getAttribute('style')).toContain('--color-green-deep')
    expect(nums[1].getAttribute('style')).toContain('--color-text-secondary')
  })
})

describe('XRayResults — "Not in the app yet", one tap', () => {
  it('lists the addable dishes; a guest is asked to sign in and nothing is written', () => {
    renderResults()
    const section = screen.getByTestId('xray-addable')
    expect(section).toHaveTextContent('Not in the app yet')
    expect(section).toHaveTextContent('Crab Cakes')
    fireEvent.click(screen.getByRole('button', { name: /sign in to add these/i }))
    expect(screen.getByTestId('login-modal')).toBeInTheDocument()
    expect(addStagedDishes).not.toHaveBeenCalled()
  })

  it('logged in: "Add these N" commits by extraction id using the SERVER staged count, then reads as added', async () => {
    authState.user = { id: 'u1' }
    addStagedDishes.mockResolvedValue({ inserted: 1, updated: 0, skipped: 0 })
    // summary.addable is authoritative (staged array length), not the flag count
    renderResults({ ...result, summary: { ...result.summary, addable: 1 } })
    fireEvent.click(screen.getByRole('button', { name: /add these 1/i }))
    await waitFor(() => expect(addStagedDishes).toHaveBeenCalledWith({ extractionId: 'ext-1', count: 1 }))
    await waitFor(() => expect(screen.getByTestId('xray-addable')).toHaveTextContent('Added to the map'))
    expect(screen.queryByRole('button', { name: /add these/i })).not.toBeInTheDocument()
  })

  it('no section at all when everything on the menu is already in the app', () => {
    renderResults({ ...result, extraction_id: null, summary: { matched: 3, addable: 0, total: 3 },
      sections: [{ name: 'Mains', items: result.sections[0].items.map(i => ({ ...i, addable: false })) }] })
    expect(screen.queryByTestId('xray-addable')).not.toBeInTheDocument()
  })
})
