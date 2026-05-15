import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useVote } from '../hooks/useVote'
import { votesApi } from '../api/votesApi'

// Mock the API - must match the import path in useVote.js
vi.mock('../api/votesApi', () => ({
  votesApi: {
    submitVote: vi.fn(),
    getUserVotes: vi.fn(),
    deleteVote: vi.fn(),
  },
}))

// useVote now uses useQueryClient to invalidate cached queries after a
// successful vote. Tests need a QueryClientProvider around the rendered hook.
// Using createElement (instead of JSX) so this file stays .test.js — no
// rename or build-config change needed.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useVote Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('submitVote', () => {
    it('calls votesApi.submitVote with positional args minus wouldOrderAgain', async () => {
      votesApi.submitVote.mockResolvedValueOnce({ success: true })

      const { result } = renderHook(() => useVote(), { wrapper: makeWrapper() })

      let response
      await act(async () => {
        response = await result.current.submitVote('dish-1', 8.5, 'great review', null, null, null, null)
      })

      expect(response.success).toBe(true)
      expect(votesApi.submitVote).toHaveBeenCalledWith({
        dishId: 'dish-1',
        rating10: 8.5,
        reviewText: 'great review',
        purityData: null,
        jitterData: null,
        jitterScore: null,
        badgeHash: null,
      })
    })

    it('should handle vote submission errors', async () => {
      const error = new Error('Not authenticated')
      votesApi.submitVote.mockRejectedValueOnce(error)

      const { result } = renderHook(() => useVote(), { wrapper: makeWrapper() })

      let response
      await act(async () => {
        response = await result.current.submitVote('dish-1', 8)
      })

      expect(response.success).toBe(false)
      expect(response.error).toBe('Not authenticated')
      expect(result.current.error).toBe('Not authenticated')
    })

    it('should set submitting state correctly', async () => {
      // Use a deferred promise so we can control when the API resolves
      let resolveApi
      const apiPromise = new Promise(resolve => {
        resolveApi = () => resolve({ success: true })
      })
      votesApi.submitVote.mockReturnValueOnce(apiPromise)

      const { result } = renderHook(() => useVote(), { wrapper: makeWrapper() })

      expect(result.current.submitting).toBe(false)

      // Start the submission but don't await it yet
      let submitPromise
      act(() => {
        submitPromise = result.current.submitVote('dish-1', 8)
      })

      // Now submitting should be true (API hasn't resolved yet)
      expect(result.current.submitting).toBe(true)

      // Resolve the API and wait for the submission to complete
      await act(async () => {
        resolveApi()
        await submitPromise
      })

      // After the promise resolves, submitting should be false
      expect(result.current.submitting).toBe(false)
    })

    it('should handle votes without an explicit rating', async () => {
      votesApi.submitVote.mockResolvedValueOnce({ success: true })

      const { result } = renderHook(() => useVote(), { wrapper: makeWrapper() })

      await act(async () => {
        await result.current.submitVote('dish-1')
      })

      expect(votesApi.submitVote).toHaveBeenCalledWith({
        dishId: 'dish-1',
        rating10: undefined,
        reviewText: null,
        purityData: null,
        jitterData: null,
        jitterScore: null,
        badgeHash: null,
      })
    })

    it('invalidates dependent query caches on success', async () => {
      votesApi.submitVote.mockResolvedValueOnce({ success: true })

      // Build a wrapper backed by a known QueryClient so we can spy on it.
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const wrapper = ({ children }) =>
        createElement(QueryClientProvider, { client: queryClient }, children)

      const { result } = renderHook(() => useVote(), { wrapper })

      await act(async () => {
        await result.current.submitVote('dish-1', 9)
      })

      // All keys vote outcomes depend on. Regressions here would let
      // rankings, profile stats, or community averages drift stale until
      // manual refetch.
      const invalidatedKeys = invalidateSpy.mock.calls.map(([arg]) => arg.queryKey[0])
      expect(invalidatedKeys).toEqual(
        expect.arrayContaining(['dishes', 'dish', 'userVotes', 'allDishes', 'communityAvgs'])
      )
    })

    it('does NOT invalidate caches when the API rejects', async () => {
      votesApi.submitVote.mockRejectedValueOnce(new Error('boom'))

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const wrapper = ({ children }) =>
        createElement(QueryClientProvider, { client: queryClient }, children)

      const { result } = renderHook(() => useVote(), { wrapper })

      await act(async () => {
        await result.current.submitVote('dish-1', 9)
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })
  })

  describe('getUserVotes', () => {
    it('should fetch user votes successfully', async () => {
      const mockVotes = {
        'dish-1': { wouldOrderAgain: true, rating10: 8 },
        'dish-2': { wouldOrderAgain: false, rating10: 4 },
      }
      votesApi.getUserVotes.mockResolvedValueOnce(mockVotes)

      const { result } = renderHook(() => useVote(), { wrapper: makeWrapper() })

      let votes
      await act(async () => {
        votes = await result.current.getUserVotes()
      })

      expect(votes).toEqual(mockVotes)
      expect(votesApi.getUserVotes).toHaveBeenCalled()
    })

    it('should return empty object on error', async () => {
      votesApi.getUserVotes.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useVote(), { wrapper: makeWrapper() })

      let votes
      await act(async () => {
        votes = await result.current.getUserVotes()
      })

      expect(votes).toEqual({})
    })
  })
})
