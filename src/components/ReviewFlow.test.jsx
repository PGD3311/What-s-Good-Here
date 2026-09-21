import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const deletePhoto = vi.fn(() => Promise.resolve({ success: true }))
const submitVote = vi.fn(() => Promise.resolve({ success: true }))

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-dan' } }) }))
vi.mock('../hooks/useVote', () => ({ useVote: () => ({ submitVote, submitting: false }) }))
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: null, refetch: vi.fn() }) }))
vi.mock('../hooks/usePurityTracker', () => ({
  usePurityTracker: () => ({
    getPurity: () => null,
    getJitterProfile: () => null,
    attachToTextarea: () => {},
    reset: () => {},
  }),
}))
vi.mock('../utils/jitter-box', () => ({
  default: { attach: () => ({ detach() {}, reset() {}, score() { return null } }) },
}))
vi.mock('../api/jitterApi', () => ({ jitterApi: { attestReview: vi.fn() } }))
vi.mock('../api/votesApi', () => ({ votesApi: { getUserVoteForDish: vi.fn(() => Promise.resolve(null)) } }))
vi.mock('../api/dishPhotosApi', () => ({ dishPhotosApi: { deletePhoto: (...a) => deletePhoto(...a) } }))
vi.mock('../utils/haptics', () => ({ hapticLight: () => {}, hapticSuccess: () => {} }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
// Stand-in upload button: clicking it reports a successful upload.
vi.mock('./PhotoUploadButton', () => ({
  PhotoUploadButton: ({ onPhotoUploaded }) => (
    <button type="button" onClick={() => onPhotoUploaded({ id: 'p-1', photo_url: 'https://x/new.jpg' })}>
      mock-upload
    </button>
  ),
}))
vi.mock('./AddPhotoNudge', () => ({ AddPhotoNudge: () => null }))

import { ReviewFlow } from './ReviewFlow'

afterEach(() => { cleanup(); deletePhoto.mockClear(); submitVote.mockClear() })

const EXISTING = { id: 'p-1', photo_url: 'https://x/old.jpg' }

function renderFlow(props = {}) {
  return render(
    <MemoryRouter>
      <ReviewFlow
        dishId="d-1"
        dishName="Hot Lobster Roll"
        restaurantId="r-1"
        restaurantName="Grace Church"
        category="seafood"
        existingPhoto={EXISTING}
        {...props}
      />
    </MemoryRouter>
  )
}

describe('ReviewFlow — existing photo actions are independent of the rating', () => {
  it('Remove deletes the photo without submitting a rating', async () => {
    const onPhotoRemoved = vi.fn()
    renderFlow({ onPhotoRemoved })

    // Submit is disabled: no rating has been given.
    expect(screen.getByRole('button', { name: /submit rating/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }))
    // Two-tap confirm.
    fireEvent.click(screen.getByRole('button', { name: /remove\?/i }))

    await waitFor(() => expect(deletePhoto).toHaveBeenCalledWith('p-1'))
    expect(onPhotoRemoved).toHaveBeenCalled()
    expect(submitVote).not.toHaveBeenCalled()
  })

  it('Replace uploads over the existing photo and never deletes the row', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /^replace$/i }))
    fireEvent.click(screen.getByRole('button', { name: /mock-upload/i }))

    await screen.findByText(/photo added/i)
    expect(deletePhoto).not.toHaveBeenCalled()
  })

  it('has no Keep button — nothing is pending', () => {
    renderFlow()
    expect(screen.queryByRole('button', { name: /^keep$/i })).not.toBeInTheDocument()
  })
})
