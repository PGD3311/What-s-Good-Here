import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CuratorOnboardingSplash } from './CuratorOnboardingSplash'

describe('CuratorOnboardingSplash', () => {
  it('renders the three onboarding point titles', () => {
    render(<CuratorOnboardingSplash onDismiss={() => {}} />)
    expect(screen.getByText('Pick your Top 10')).toBeTruthy()
    expect(screen.getByText('Rate before you add')).toBeTruthy()
    expect(screen.getByText('Tell them who you are')).toBeTruthy()
  })

  it('renders a dismiss CTA and calls onDismiss when tapped', () => {
    const onDismiss = vi.fn()
    render(<CuratorOnboardingSplash onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('Start building'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('is a labelled modal dialog', () => {
    render(<CuratorOnboardingSplash onDismiss={() => {}} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('contains no emoji characters', () => {
    const { container } = render(<CuratorOnboardingSplash onDismiss={() => {}} />)
    expect(/[\uD800-\uDBFF]/.test(container.textContent)).toBe(false)
  })
})
