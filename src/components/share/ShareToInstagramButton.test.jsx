import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Flip the flag per-test via a hoisted holder the mock getter reads.
const h = vi.hoisted(() => ({ flag: false }))
vi.mock('../../constants/features', () => ({
  FEATURES: { get IG_SHARE_ENABLED() { return h.flag } },
}))
// Keep canvas out of jsdom — the renderer is verified manually.
vi.mock('./renderShareCardToFile', () => ({
  renderShareCardToFile: vi.fn().mockResolvedValue({ file: {}, blob: {} }),
}))

import { ShareToInstagramButton } from './ShareToInstagramButton'

const data = { title: 'Best Bites', byline: 'by Denis · 12 dishes', emojis: [], topItems: [], footerUrl: 'wghapp.com' }

describe('ShareToInstagramButton', () => {
  beforeEach(() => { h.flag = false })

  it('renders nothing when the flag is off', () => {
    const { container } = render(<ShareToInstagramButton surface="playlist" id="1" url="u" cardData={data} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the button when the flag is on', () => {
    h.flag = true
    render(<ShareToInstagramButton surface="playlist" id="1" url="u" cardData={data} />)
    expect(screen.getByRole('button', { name: /share to instagram/i })).toBeTruthy()
  })
})
