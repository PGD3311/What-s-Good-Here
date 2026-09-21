import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/dishesApi', () => ({
  dishesApi: {
    getDishesForRestaurant: vi.fn(() => Promise.resolve([
      { dish_id: 'd-roll', dish_name: "Nancy's Roll", category: 'sushi' },
      { dish_id: 'd-clams', dish_name: 'Whole Belly Clams', category: 'seafood' },
      { dish_id: 'd-banana', dish_name: 'Dirty Banana', category: 'cocktails' },
    ])),
  },
}))

import { PhotoMismatchSheet } from './PhotoMismatchSheet'

afterEach(cleanup)

const PENDING = { pending: true, dishId: 'd-clams', fileName: 'u/d-clams.jpg', publicUrl: 'https://x/p.jpg', mismatch: { seen: 'sushi rolls' } }

function renderSheet(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const p = { pending: PENDING, dishName: 'Whole Belly Clams', restaurantId: 'r-1', restaurantName: "Nancy's", onConfirm: vi.fn(), onReassign: vi.fn(), onDiscard: vi.fn(), ...props }
  render(<QueryClientProvider client={qc}><PhotoMismatchSheet {...p} /></QueryClientProvider>)
  return p
}

describe('PhotoMismatchSheet — asks, never rejects', () => {
  it('names what the model saw and what the user picked, and offers "yes, add it"', () => {
    const p = renderSheet()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/sushi rolls/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /yes.*whole belly clams/i }))
    expect(p.onConfirm).toHaveBeenCalled()
  })

  it('"different dish" reveals the restaurant menu minus the current dish; picking one reassigns', async () => {
    const p = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /different dish/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /nancy's roll/i })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^whole belly clams$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /nancy's roll/i }))
    expect(p.onReassign).toHaveBeenCalledWith(expect.objectContaining({ dish_id: 'd-roll' }))
  })

  it('filters the menu as you type', async () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /different dish/i }))
    await waitFor(() => screen.getByRole('button', { name: /nancy's roll/i }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'banana' } })
    expect(screen.queryByRole('button', { name: /nancy's roll/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dirty banana/i })).toBeInTheDocument()
  })

  it('"don\'t add" discards', () => {
    const p = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /don.t add/i }))
    expect(p.onDiscard).toHaveBeenCalled()
  })
})
