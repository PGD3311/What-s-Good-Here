import { describe, it, expect, vi, beforeEach } from 'vitest'

var captured = {}
function makeBuilder() {
  var b = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn((col, val) => { captured[col] = val; return b })
  b.not = vi.fn(() => b)
  b.neq = vi.fn((col, val) => { captured[col] = val; return b })
  b.order = vi.fn(() => b)
  b.range = vi.fn((from, to) => { captured.range = [from, to]; return Promise.resolve({ data: [], error: null }) })
  b.in = vi.fn(() => Promise.resolve({ data: [], error: null }))
  return b
}
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(() => makeBuilder()) } }))
vi.mock('../utils/errorHandler', () => ({ createClassifiedError: (e) => e }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { votesApi } from './votesApi'

describe('votesApi.getReviewsForUser', () => {
  beforeEach(() => { captured = {} })

  it('defaults to a 500-row range and excludes ai_estimated', async () => {
    await votesApi.getReviewsForUser('u1')
    expect(captured.range).toEqual([0, 499])
    expect(captured.source).toBe('ai_estimated')
  })
})
