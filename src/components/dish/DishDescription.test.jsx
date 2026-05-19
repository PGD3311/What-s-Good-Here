import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { DishDescription } from './DishDescription'

afterEach(cleanup)

function renderWithRouter(ui, { route = '/dish/abc' } = {}) {
  function LocationProbe() {
    var loc = useLocation()
    return <div data-testid="location">{loc.pathname + loc.search}</div>
  }
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="*" element={<><div>{ui}</div><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('DishDescription', () => {
  it('returns null when both description and dietaryTags are absent', () => {
    const { container } = renderWithRouter(
      <DishDescription description={null} dietaryTags={[]} />
    )
    expect(container.querySelector('section')).toBeNull()
  })

  it('renders description when present, no pill row when tags empty', () => {
    renderWithRouter(
      <DishDescription
        description="Hot lobster meat, drawn butter, split-top bun"
        dietaryTags={[]}
      />
    )
    expect(screen.getByText(/hot lobster meat, drawn butter, split-top bun/i)).toBeInTheDocument()
    expect(screen.queryByTestId('dietary-tag-pills')).not.toBeInTheDocument()
  })

  it('renders pill row + disclaimer when tags non-empty', () => {
    renderWithRouter(
      <DishDescription description={null} dietaryTags={['vegan', 'gluten_free']} />
    )
    expect(screen.getByRole('button', { name: /filter homepage by vegan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /filter homepage by gluten-free/i })).toBeInTheDocument()
    expect(screen.getByText(/menu labels/i)).toBeInTheDocument()
  })

  it('drops tags outside the allowed list', () => {
    renderWithRouter(
      <DishDescription description={null} dietaryTags={['vegan', 'paleo', 'keto']} />
    )
    expect(screen.getByRole('button', { name: /filter homepage by vegan/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /paleo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /keto/i })).not.toBeInTheDocument()
  })

  it('tag pill click navigates to /?diet=<tag>', () => {
    renderWithRouter(
      <DishDescription description={null} dietaryTags={['vegan']} />
    )
    fireEvent.click(screen.getByRole('button', { name: /filter homepage by vegan/i }))
    expect(screen.getByTestId('location').textContent).toBe('/?diet=vegan')
  })

  it('omits disclaimer when no tags are rendered', () => {
    renderWithRouter(
      <DishDescription description="Just ingredients" dietaryTags={[]} />
    )
    expect(screen.queryByText(/menu labels/i)).not.toBeInTheDocument()
  })
})
