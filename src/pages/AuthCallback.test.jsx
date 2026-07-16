import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthCallback } from './AuthCallback'
import { authApi } from '../api/authApi'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../api/authApi', () => ({
  authApi: { exchangeCodeForSession: vi.fn() },
}))

function renderCallback(search) {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <AuthCallback />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('AuthCallback', () => {
  it('navigates to next on successful exchange', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({ error: null })
    renderCallback('?code=abc&type=signup&next=%2Flocals%2Fxyz')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/locals/xyz', { replace: true })
    })
  })

  it('carries next into cross-device state when the verifier is missing (returned error)', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'code verifier not found' },
    })
    renderCallback('?code=abc&type=signup&next=%2Flocals%2Fxyz')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/cross-device', {
        replace: true,
        state: { type: 'signup', next: '/locals/xyz' },
      })
    })
  })

  it('carries next into cross-device state when the verifier is missing (thrown error)', async () => {
    authApi.exchangeCodeForSession.mockRejectedValue(new Error('code verifier not found'))
    renderCallback('?code=abc&type=signup&next=%2Flocals%2Fxyz')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/cross-device', {
        replace: true,
        state: { type: 'signup', next: '/locals/xyz' },
      })
    })
  })

  it('passes null next to cross-device when no next param is present', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'code verifier not found' },
    })
    renderCallback('?code=abc&type=signup')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/cross-device', {
        replace: true,
        state: { type: 'signup', next: null },
      })
    })
  })

  it('preserves query and hash in next', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'code verifier not found' },
    })
    renderCallback(`?code=abc&type=signup&next=${encodeURIComponent('/dish/123?q=foo#bar')}`)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/cross-device', {
        replace: true,
        state: { type: 'signup', next: '/dish/123?q=foo#bar' },
      })
    })
  })

  it('rejects a protocol-relative next and passes null to cross-device', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'code verifier not found' },
    })
    renderCallback(`?code=abc&type=signup&next=${encodeURIComponent('//evil.example.com/path')}`)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/cross-device', {
        replace: true,
        state: { type: 'signup', next: null },
      })
    })
  })

  it('rejects a next pointing back at /auth/callback (loop prevention)', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'code verifier not found' },
    })
    renderCallback(`?code=abc&type=signup&next=${encodeURIComponent('/auth/callback?type=signup')}`)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/cross-device', {
        replace: true,
        state: { type: 'signup', next: null },
      })
    })
  })

  it('rejects a cross-origin next and passes null to cross-device', async () => {
    authApi.exchangeCodeForSession.mockResolvedValue({
      error: { message: 'code verifier not found' },
    })
    renderCallback(`?code=abc&type=signup&next=${encodeURIComponent('https://evil.example.com/phish')}`)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/cross-device', {
        replace: true,
        state: { type: 'signup', next: null },
      })
    })
  })
})
