import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CuratorChecklist } from './CuratorChecklist'

describe('CuratorChecklist', () => {
  it('renders all three step labels when nothing is done', () => {
    render(<CuratorChecklist hasDish={false} hasBio={false} isPublished={false} />)
    expect(screen.getByText('Add a dish')).toBeTruthy()
    expect(screen.getByText('Write your bio')).toBeTruthy()
    expect(screen.getByText('Publish your list')).toBeTruthy()
  })

  it('shows step numbers for pending steps', () => {
    const { container } = render(<CuratorChecklist hasDish={false} hasBio={false} isPublished={false} />)
    expect(container.textContent).toContain('1')
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('3')
  })

  it('renders a check (svg) for a done step instead of its number', () => {
    const { container } = render(<CuratorChecklist hasDish={true} hasBio={false} isPublished={false} />)
    // one step done -> at least one svg check rendered
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('returns null when all three steps are done', () => {
    const { container } = render(<CuratorChecklist hasDish={true} hasBio={true} isPublished={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('contains no emoji characters', () => {
    const { container } = render(<CuratorChecklist hasDish={false} hasBio={true} isPublished={false} />)
    // Surrogate-pair range covers emoji; the checklist must stay text-only.
    expect(/[\uD800-\uDBFF]/.test(container.textContent)).toBe(false)
  })
})
