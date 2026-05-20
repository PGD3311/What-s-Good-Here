import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LocalsPicksBanner } from './LocalsPicksBanner'

// Stub Seal so the banner renders without depending on its internal SVG details.
vi.mock('../Seal', () => ({
  Seal: () => <div data-testid="seal-mock" />,
}))

const mockCurators = vi.fn()
vi.mock('../../hooks/useLocalPicksCurators', () => ({
  useLocalPicksCurators: () => mockCurators(),
}))

afterEach(() => {
  cleanup()
  mockCurators.mockReset()
})

function renderBanner() {
  return render(
    <MemoryRouter>
      <LocalsPicksBanner />
    </MemoryRouter>
  )
}

describe('LocalsPicksBanner — curator avatars', () => {
  it('renders nothing when loading', () => {
    mockCurators.mockReturnValue({ curators: [], loading: true })
    const { container } = renderBanner()
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when there are no curators', () => {
    mockCurators.mockReturnValue({ curators: [], loading: false })
    const { container } = renderBanner()
    expect(container.firstChild).toBeNull()
  })

  it('renders curator avatar images when avatar_url is present', () => {
    mockCurators.mockReturnValue({
      curators: [
        { user_id: 'u1', display_name: 'Maya', avatar_url: 'https://cdn/avatars/maya.jpg', item_count: 5 },
        { user_id: 'u2', display_name: 'Sam', avatar_url: 'https://cdn/avatars/sam.jpg', item_count: 3 },
      ],
      loading: false,
    })
    renderBanner()
    const imgs = document.querySelectorAll('img[src^="https://cdn/avatars/"]')
    expect(imgs.length).toBe(2)
  })

  it('falls back to an initial chip when a curator has no avatar_url', () => {
    mockCurators.mockReturnValue({
      curators: [
        { user_id: 'u1', display_name: 'Lucy', avatar_url: null, item_count: 4 },
      ],
      loading: false,
    })
    renderBanner()
    expect(screen.getByText('L')).toBeInTheDocument()
  })

  it('shows a +N overflow chip when there are more curators than MAX_VISIBLE', () => {
    mockCurators.mockReturnValue({
      curators: [
        { user_id: 'a', display_name: 'A', avatar_url: 'https://cdn/a.jpg', item_count: 1 },
        { user_id: 'b', display_name: 'B', avatar_url: 'https://cdn/b.jpg', item_count: 1 },
        { user_id: 'c', display_name: 'C', avatar_url: 'https://cdn/c.jpg', item_count: 1 },
        { user_id: 'd', display_name: 'D', avatar_url: 'https://cdn/d.jpg', item_count: 1 },
        { user_id: 'e', display_name: 'E', avatar_url: 'https://cdn/e.jpg', item_count: 1 },
        { user_id: 'f', display_name: 'F', avatar_url: 'https://cdn/f.jpg', item_count: 1 },
      ],
      loading: false,
    })
    renderBanner()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders "?" placeholder when display_name and avatar_url are both missing', () => {
    mockCurators.mockReturnValue({
      curators: [
        { user_id: 'u1', display_name: null, avatar_url: null, item_count: 1 },
      ],
      loading: false,
    })
    renderBanner()
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('does not show an overflow chip when curators ≤ MAX_VISIBLE', () => {
    mockCurators.mockReturnValue({
      curators: [
        { user_id: 'a', display_name: 'A', avatar_url: 'https://cdn/a.jpg', item_count: 1 },
        { user_id: 'b', display_name: 'B', avatar_url: 'https://cdn/b.jpg', item_count: 1 },
      ],
      loading: false,
    })
    renderBanner()
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
  })
})
