import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CrossDevicePkce from './CrossDevicePkce'
import { authApi } from '../api/authApi'

vi.mock('../api/authApi', () => ({
  authApi: {
    signInWithMagicLink: vi.fn().mockResolvedValue({ success: true }),
    resetPassword: vi.fn().mockResolvedValue({ success: true }),
  },
}))

function renderWithState(state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/auth/cross-device', state }]}>
      <CrossDevicePkce />
    </MemoryRouter>
  )
}

async function submitEmail(email = 'user@example.com') {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: email },
  })
  fireEvent.click(screen.getByRole('button', { name: /send new link/i }))
  await waitFor(() => {
    expect(screen.getByText(/a new link is on the way/i)).toBeInTheDocument()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authApi.signInWithMagicLink.mockResolvedValue({ success: true })
  authApi.resetPassword.mockResolvedValue({ success: true })
})

afterEach(cleanup)

describe('CrossDevicePkce', () => {
  it('threads next into the magic link return path', async () => {
    renderWithState({ type: 'signup', next: '/locals/xyz' })
    await submitEmail()

    expect(authApi.signInWithMagicLink).toHaveBeenCalledWith(
      'user@example.com',
      '/auth/callback?type=signup&next=%2Flocals%2Fxyz'
    )
  })

  it('passes null return path when there is no next', async () => {
    renderWithState({ type: 'signup' })
    await submitEmail()

    expect(authApi.signInWithMagicLink).toHaveBeenCalledWith('user@example.com', null)
  })

  it('passes null return path when there is no route state at all', async () => {
    renderWithState(undefined)
    await submitEmail()

    expect(authApi.signInWithMagicLink).toHaveBeenCalledWith('user@example.com', null)
  })

  it('uses resetPassword for recovery links', async () => {
    renderWithState({ type: 'recovery', next: '/locals/xyz' })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send new link/i }))

    await waitFor(() => {
      expect(authApi.resetPassword).toHaveBeenCalledWith('user@example.com')
    })
    expect(authApi.signInWithMagicLink).not.toHaveBeenCalled()
  })
})
