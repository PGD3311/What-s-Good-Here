import { describe, it, expect, vi, beforeEach } from 'vitest'

// The query chain is: select -> eq -> in('status', ...) -> in('dish_id', batch)
// The FIRST .in (status) returns the builder; the SECOND .in (dish_id) is the
// terminal call that resolves the query (data Promise). Each chunk calls the
// chain fresh, so supabase.from returns a fresh builder per call.

var statusInArgs = []
var dishInArgs = []
var fromCalls = 0

function makeBuilder() {
  var builder = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.in = vi.fn((column, value) => {
    if (column === 'status') {
      statusInArgs.push(value)
      return builder
    }
    // terminal: column === 'dish_id'
    dishInArgs.push(value)
    var rows = value.map(id => ({
      dish_id: id,
      photo_url: 'p_' + id,
      status: 'community',
    }))
    return Promise.resolve({ data: rows, error: null })
  })
  return builder
}

var selectSpy = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      fromCalls += 1
      var builder = makeBuilder()
      // wrap select so we can assert it was/wasn't called overall
      var origSelect = builder.select
      builder.select = vi.fn((...args) => {
        selectSpy(...args)
        return origSelect(...args)
      })
      return builder
    }),
  },
}))

import { dishPhotosApi } from './dishPhotosApi'
import { supabase } from '../lib/supabase'

describe('dishPhotosApi.getUserPhotoMap', () => {
  beforeEach(() => {
    statusInArgs = []
    dishInArgs = []
    fromCalls = 0
    selectSpy.mockClear()
    supabase.from.mockClear()
  })

  it('returns {} for empty inputs without querying', async () => {
    expect(await dishPhotosApi.getUserPhotoMap(null, [])).toEqual({})
    expect(await dishPhotosApi.getUserPhotoMap('u1', [])).toEqual({})
    expect(selectSpy).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('maps dish_id -> photo_url for a small input (one batch)', async () => {
    var map = await dishPhotosApi.getUserPhotoMap('u1', ['d1', 'd2'])
    expect(map).toEqual({ d1: 'p_d1', d2: 'p_d2' })
    // one batch -> one builder
    expect(supabase.from).toHaveBeenCalledTimes(1)
    // status allowlist filter used
    expect(statusInArgs[0]).toEqual(['featured', 'community'])
    // dish_id filter used with the batch
    expect(dishInArgs[0]).toEqual(['d1', 'd2'])
  })

  it('chunks 200 dish ids into two batches (150 + 50) and merges results', async () => {
    var ids = []
    for (var i = 0; i < 200; i += 1) {
      ids.push('d' + i)
    }
    var map = await dishPhotosApi.getUserPhotoMap('u1', ids)

    // ran twice -> two builders
    expect(supabase.from).toHaveBeenCalledTimes(2)
    // chunk sizes 150 and 50
    expect(dishInArgs.length).toBe(2)
    expect(dishInArgs[0].length).toBe(150)
    expect(dishInArgs[1].length).toBe(50)
    // status allowlist used on every chunk
    expect(statusInArgs).toEqual([
      ['featured', 'community'],
      ['featured', 'community'],
    ])
    // merged map has entries from both batches
    expect(Object.keys(map).length).toBe(200)
    expect(map.d0).toBe('p_d0')
    expect(map.d149).toBe('p_d149')
    expect(map.d150).toBe('p_d150')
    expect(map.d199).toBe('p_d199')
  })
})
