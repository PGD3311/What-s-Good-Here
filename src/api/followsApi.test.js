import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { followsApi } from './followsApi'

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

import { supabase } from '../lib/supabase'

describe('followsApi', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.resetAllMocks() })

  describe('getFollowStatuses', () => {
    it('returns empty Set when userIds is empty (no auth or DB call)', async () => {
      const result = await followsApi.getFollowStatuses([])
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
      expect(supabase.auth.getUser).not.toHaveBeenCalled()
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('returns empty Set when userIds is not an array (defensive guard)', async () => {
      const result = await followsApi.getFollowStatuses(null)
      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
      expect(supabase.auth.getUser).not.toHaveBeenCalled()
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('returns empty Set when not authenticated (no DB call)', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
      const result = await followsApi.getFollowStatuses(['a', 'b'])
      expect(result.size).toBe(0)
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('returns Set of followed IDs for authenticated user', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
      const inMock = vi.fn().mockResolvedValue({
        data: [{ followed_id: 'a' }, { followed_id: 'c' }],
        error: null,
      })
      const eqMock = vi.fn().mockReturnValue({ in: inMock })
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
      supabase.from.mockReturnValue({ select: selectMock })

      const result = await followsApi.getFollowStatuses(['a', 'b', 'c'])

      expect(supabase.from).toHaveBeenCalledWith('follows')
      expect(selectMock).toHaveBeenCalledWith('followed_id')
      expect(eqMock).toHaveBeenCalledWith('follower_id', 'me')
      expect(inMock).toHaveBeenCalledWith('followed_id', ['a', 'b', 'c'])
      expect(result.has('a')).toBe(true)
      expect(result.has('b')).toBe(false)
      expect(result.has('c')).toBe(true)
    })

    it('throws classified error on supabase query error', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
      const inMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX' } })
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inMock }) })
      })

      // Must surface a classified error (CLAUDE §1.2) — assert .type is present
      // so a regression to plain `throw error` is caught.
      await expect(followsApi.getFollowStatuses(['a'])).rejects.toMatchObject({
        type: expect.any(String),
      })
    })

    it('throws classified error when auth.getUser itself rejects', async () => {
      // Transport-level auth failure must not be swallowed as "anonymous user"
      // — the catch block classifies and re-throws.
      supabase.auth.getUser.mockRejectedValue(new Error('network unreachable'))

      await expect(followsApi.getFollowStatuses(['a'])).rejects.toMatchObject({
        type: expect.any(String),
      })
    })
  })
})
