import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HeroIdentityCard } from './HeroIdentityCard'

vi.mock('../../api/profileApi', () => ({ profileApi: { uploadAvatar: vi.fn() } }))

const BASE = {
  user: { email: 'a@b.com' },
  profile: { display_name: 'PGD', avatar_url: null, is_local_curator: false },
  stats: { totalVotes: 30, uniqueRestaurants: 16, reviewCount: 17 },
  followCounts: { followers: 7, following: 22 },
  editingName: false,
  newName: '',
  nameStatus: null,
  setEditingName: () => {},
  setNewName: () => {},
  setNameStatus: () => {},
  handleSaveName: () => {},
  setFollowListModal: () => {},
  isCurator: false,
  trustBadgeType: null,
  onAvatarUpdated: () => {},
}

function renderCard(overrides) {
  return render(
    <MemoryRouter>
      <HeroIdentityCard {...BASE} {...overrides} />
    </MemoryRouter>
  )
}

describe('HeroIdentityCard (Part 2)', () => {
  it('renders the name and two-tier stats', () => {
    renderCard()
    expect(screen.getByText('PGD')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('shows the Verified Human trust badge when trustBadgeType is human_verified', () => {
    renderCard({ trustBadgeType: 'human_verified' })
    expect(screen.getByText('Verified Human')).toBeInTheDocument()
  })

  it('shows the Trusted Reviewer badge when trustBadgeType is trusted_reviewer', () => {
    renderCard({ trustBadgeType: 'trusted_reviewer' })
    expect(screen.getByText('Trusted Reviewer')).toBeInTheDocument()
  })

  it('shows NO trust badge for building or null', () => {
    const { rerender } = renderCard({ trustBadgeType: 'building' })
    expect(screen.queryByText('Verified Human')).toBeNull()
    expect(screen.queryByText('Trusted Reviewer')).toBeNull()
    expect(screen.queryByText('Building trust')).toBeNull()
    rerender(<MemoryRouter><HeroIdentityCard {...BASE} trustBadgeType={null} /></MemoryRouter>)
    expect(screen.queryByText(/Verified Human|Trusted Reviewer|Building/)).toBeNull()
  })

  it('does not render the old Jitter reviews/rhythm box', () => {
    renderCard({ trustBadgeType: 'trusted_reviewer' })
    expect(screen.queryByText('reviews')).toBeNull()
    expect(screen.queryByText('rhythm')).toBeNull()
  })

  it('shows the curator Edit Top 10 pill linking to /my-list only when isCurator', () => {
    const { rerender } = renderCard({ isCurator: false })
    expect(screen.queryByText(/Edit Top 10/)).toBeNull()
    rerender(<MemoryRouter><HeroIdentityCard {...BASE} isCurator={true} /></MemoryRouter>)
    const link = screen.getByRole('link', { name: /Edit Top 10/ })
    expect(link.getAttribute('href')).toBe('/my-list')
  })

  it('does not render the trust badge while editing the name', () => {
    renderCard({ trustBadgeType: 'trusted_reviewer', editingName: true })
    expect(screen.queryByText('Trusted Reviewer')).toBeNull()
  })
})
