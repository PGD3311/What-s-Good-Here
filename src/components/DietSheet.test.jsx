import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DietSheet } from './DietSheet'

const labels = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
  nut_free: 'Nut-free',
}
const allowed = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free']

afterEach(cleanup)

describe('DietSheet', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <DietSheet open={false} allowed={allowed} labels={labels} onApply={() => {}} onClose={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('starts with provided initial selection', () => {
    render(
      <DietSheet open initial={['vegan']} allowed={allowed} labels={labels} onApply={() => {}} onClose={() => {}} />
    )
    expect(screen.getByRole('checkbox', { name: /vegan/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: /vegetarian/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('Reset clears all selections without committing', () => {
    const onApply = vi.fn()
    render(
      <DietSheet
        open
        initial={['vegan', 'gluten_free']}
        allowed={allowed}
        labels={labels}
        onApply={onApply}
        onClose={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(screen.getByRole('checkbox', { name: /vegan/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: /gluten-free/i })).toHaveAttribute('aria-checked', 'false')
    // Reset does not commit — Apply must be tapped to emit
    expect(onApply).not.toHaveBeenCalled()
  })

  it('Apply emits the current selection and closes', () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(
      <DietSheet
        open
        initial={[]}
        allowed={allowed}
        labels={labels}
        onApply={onApply}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /vegan/i }))
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onApply).toHaveBeenCalledWith(['vegan'])
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles a tile off when tapped twice', () => {
    render(
      <DietSheet open initial={['vegan']} allowed={allowed} labels={labels} onApply={() => {}} onClose={() => {}} />
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /vegan/i }))
    expect(screen.getByRole('checkbox', { name: /vegan/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('renders the disclaimer when provided', () => {
    render(
      <DietSheet
        open
        allowed={allowed}
        labels={labels}
        disclaimer="Always confirm with the restaurant."
        onApply={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.getByText(/always confirm with the restaurant\./i)).toBeInTheDocument()
  })

  it('Close button calls onClose without committing', () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(
      <DietSheet
        open
        initial={['vegan']}
        allowed={allowed}
        labels={labels}
        onApply={onApply}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /close dietary preferences/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('omits the disclaimer block when prop is empty', () => {
    render(
      <DietSheet
        open
        allowed={allowed}
        labels={labels}
        disclaimer=""
        onApply={() => {}}
        onClose={() => {}}
      />
    )
    expect(screen.queryByText(/allergen/i)).not.toBeInTheDocument()
  })
})
