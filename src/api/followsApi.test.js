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

  describe('searchFollows via getFollowers/getFollowing', () => {
    it('returns empty result for empty query', async () => {
      const result = await followsApi.getFollowers('user-1', { searchQuery: '' })
      expect(result).toEqual({ users: [], hasMore: false })
    })

    it('returns empty result for whitespace-only query', async () => {
      const result = await followsApi.getFollowing('user-1', { searchQuery: '   ' })
      expect(result).toEqual({ users: [], hasMore: false })
    })

    it('returns empty result when sanitizer strips everything (e.g. %%)', async () => {
      const result = await followsApi.getFollowers('user-1', { searchQuery: '%%' })
      expect(result).toEqual({ users: [], hasMore: false })
    })

    it('calls RPC with correct args and maps rows for followers direction', async () => {
      supabase.rpc.mockResolvedValue({
        data: [
          { id: 'a', display_name: 'Alice', avatar_url: null, follower_count: 5, followed_at: '2026-01-01' },
          { id: 'b', display_name: 'Bob', avatar_url: 'x.jpg', follower_count: 0, followed_at: '2026-01-02' },
        ],
        error: null,
      })

      const result = await followsApi.getFollowers('user-1', { searchQuery: 'al', limit: 1 })

      expect(supabase.rpc).toHaveBeenCalledWith('search_user_follows', expect.objectContaining({
        p_user_id: 'user-1',
        p_direction: 'followers',
        p_query: 'al',
        p_cursor_name: null,
        p_cursor_id: null,
        p_limit: 2, // limit + 1 for hasMore detection
      }))
      expect(result.users).toHaveLength(1)
      expect(result.users[0].id).toBe('a')
      expect(result.users[0].display_name).toBe('Alice')
      expect(result.hasMore).toBe(true)
    })

    it('calls RPC with following direction when invoked via getFollowing', async () => {
      supabase.rpc.mockResolvedValue({ data: [], error: null })
      await followsApi.getFollowing('user-1', { searchQuery: 'al' })
      expect(supabase.rpc).toHaveBeenCalledWith('search_user_follows', expect.objectContaining({
        p_direction: 'following',
      }))
    })

    it('passes through cursor object as p_cursor_name + p_cursor_id', async () => {
      supabase.rpc.mockResolvedValue({ data: [], error: null })
      await followsApi.getFollowers('user-1', {
        searchQuery: 'al',
        cursor: { display_name: 'Anna', id: 'cursor-id' },
      })
      expect(supabase.rpc).toHaveBeenCalledWith('search_user_follows', expect.objectContaining({
        p_cursor_name: 'Anna',
        p_cursor_id: 'cursor-id',
      }))
    })

    it('throws classified error on RPC failure', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom', code: '42883' } })
      await expect(followsApi.getFollowers('user-1', { searchQuery: 'al' }))
        .rejects.toMatchObject({ type: expect.any(String) })
    })

    it('falls back to recency cursor when searchQuery is absent', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        lt: vi.fn().mockReturnThis(),
      }
      supabase.from.mockReturnValue(chain)

      await followsApi.getFollowers('user-1')

      expect(supabase.rpc).not.toHaveBeenCalled()
      expect(supabase.from).toHaveBeenCalledWith('follows')
    })
  })
})
