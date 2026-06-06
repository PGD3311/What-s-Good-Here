import { describe, it, expect, vi, beforeEach } from 'vitest'

var selectResult = { data: [], error: null }
var inMock = vi.fn(() => Promise.resolve(selectResult))
var neqMock = vi.fn(() => ({ in: inMock }))
var eqMock = vi.fn(() => ({ neq: neqMock }))
var selectMock = vi.fn(() => ({ eq: eqMock }))
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: selectMock })) },
}))

import { dishPhotosApi } from './dishPhotosApi'

describe('dishPhotosApi.getUserPhotoMap', () => {
  beforeEach(() => { selectResult = { data: [], error: null } })

  it('returns {} for empty inputs without querying', async () => {
    expect(await dishPhotosApi.getUserPhotoMap(null, [])).toEqual({})
    expect(await dishPhotosApi.getUserPhotoMap('u1', [])).toEqual({})
    expect(selectMock).not.toHaveBeenCalled()
  })

  it('maps dish_id -> photo_url for the given user', async () => {
    selectResult = {
      data: [
        { dish_id: 'd1', photo_url: 'http://x/1.jpg', status: 'featured' },
        { dish_id: 'd2', photo_url: 'http://x/2.jpg', status: 'community' },
      ],
      error: null,
    }
    var map = await dishPhotosApi.getUserPhotoMap('u1', ['d1', 'd2'])
    expect(map).toEqual({ d1: 'http://x/1.jpg', d2: 'http://x/2.jpg' })
    expect(eqMock).toHaveBeenCalledWith('user_id', 'u1')
    expect(neqMock).toHaveBeenCalledWith('status', 'hidden')
  })
})
