import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}))
vi.mock('../utils/imageAnalysis', () => ({ stripExifAndReencode: vi.fn((f) => Promise.resolve(f)) }))
vi.mock('../lib/rateLimiter', () => ({ checkPhotoUploadRateLimit: () => ({ allowed: true }) }))

import { supabase } from '../lib/supabase'
import { dishPhotosApi } from './dishPhotosApi'

const USER = { id: 'u-1' }
const PUBLIC = 'https://x.supabase.co/storage/v1/object/public/dish-photos/u-1/d-clams.jpg'

function makeStorage() {
  const bucket = {
    upload: vi.fn(() => Promise.resolve({ error: null })),
    getPublicUrl: vi.fn((name) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/dish-photos/${name}` } })),
    remove: vi.fn(() => Promise.resolve({ error: null })),
    move: vi.fn(() => Promise.resolve({ error: null })),
  }
  supabase.storage.from.mockReturnValue(bucket)
  return bucket
}
function makeTable() {
  const single = vi.fn(() => Promise.resolve({ data: { id: 'p-1', photo_url: PUBLIC }, error: null }))
  const select = vi.fn(() => ({ single }))
  const upsert = vi.fn(() => ({ select }))
  supabase.from.mockReturnValue({ upsert })
  return { upsert }
}
function file() { return new File(['x'], 'a.jpg', { type: 'image/jpeg' }) }

describe('dishPhotosApi — upload-time dish check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.auth.getUser.mockResolvedValue({ data: { user: USER } })
    supabase.rpc.mockResolvedValue({ data: { allowed: true }, error: null })
  })

  it('sends dish context to photo-moderate', async () => {
    makeStorage(); makeTable()
    supabase.functions.invoke.mockResolvedValue({ data: { is_food_photo: true, is_unsafe: false, dish_match: 'likely', seen: 'fried clams' }, error: null })
    await dishPhotosApi.uploadPhoto({ dishId: 'd-clams', file: file(), analysisResults: null, dishName: 'Whole Belly Clams', category: 'seafood', restaurantName: "Nancy's" })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('photo-moderate', {
      body: { photo_url: expect.stringContaining('u-1/d-clams.jpg'), dish_name: 'Whole Belly Clams', category: 'seafood', restaurant_name: "Nancy's" },
    })
  })

  it('on contradicts: holds the photo (no row, file kept) and returns a pending handle', async () => {
    const bucket = makeStorage(); const tbl = makeTable()
    supabase.functions.invoke.mockResolvedValue({ data: { is_food_photo: true, is_unsafe: false, dish_match: 'contradicts', seen: 'sushi rolls' }, error: null })
    const r = await dishPhotosApi.uploadPhoto({ dishId: 'd-clams', file: file(), analysisResults: { status: 'community' }, dishName: 'Whole Belly Clams' })
    expect(r.pending).toBe(true)
    expect(r.mismatch).toEqual({ seen: 'sushi rolls' })
    expect(r.fileName).toBe('u-1/d-clams.jpg')
    expect(r.dishId).toBe('d-clams')
    expect(tbl.upsert).not.toHaveBeenCalled()
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('on contradicts with allowMismatch: inserts normally (batch rating flow)', async () => {
    makeStorage(); const tbl = makeTable()
    supabase.functions.invoke.mockResolvedValue({ data: { is_food_photo: true, is_unsafe: false, dish_match: 'contradicts', seen: 'sushi rolls' }, error: null })
    const r = await dishPhotosApi.uploadPhoto({ dishId: 'd-clams', file: file(), analysisResults: null, dishName: 'Whole Belly Clams', allowMismatch: true })
    expect(r.pending).toBeUndefined()
    expect(tbl.upsert).toHaveBeenCalledTimes(1)
  })

  it('unclear / likely never hold the photo', async () => {
    makeStorage(); const tbl = makeTable()
    for (const dish_match of ['unclear', 'likely', undefined]) {
      supabase.functions.invoke.mockResolvedValue({ data: { is_food_photo: true, is_unsafe: false, dish_match }, error: null })
      const r = await dishPhotosApi.uploadPhoto({ dishId: 'd-clams', file: file(), analysisResults: null, dishName: 'Whole Belly Clams' })
      expect(r.pending).toBeUndefined()
    }
    expect(tbl.upsert).toHaveBeenCalledTimes(3)
  })

  it('confirmPendingPhoto inserts the row for the original dish', async () => {
    makeStorage(); const tbl = makeTable()
    const row = await dishPhotosApi.confirmPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-1/d-clams.jpg', publicUrl: PUBLIC, analysisResults: { status: 'community', qualityScore: 70 } })
    expect(row.id).toBe('p-1')
    expect(tbl.upsert).toHaveBeenCalledWith(expect.objectContaining({ dish_id: 'd-clams', user_id: 'u-1', photo_url: PUBLIC, status: 'community' }), { onConflict: 'dish_id,user_id' })
  })

  it('reassignPendingPhoto moves the file to the new dish path and inserts for that dish (no delete when the slot is free)', async () => {
    const bucket = makeStorage(); const tbl = makeTable()
    const row = await dishPhotosApi.reassignPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-1/d-clams.jpg', publicUrl: PUBLIC, analysisResults: null }, 'd-roll')
    expect(bucket.move).toHaveBeenCalledWith('u-1/d-clams.jpg', 'u-1/d-roll.jpg')
    expect(bucket.remove).not.toHaveBeenCalled()
    expect(tbl.upsert).toHaveBeenCalledWith(expect.objectContaining({ dish_id: 'd-roll', photo_url: expect.stringContaining('u-1/d-roll.jpg') }), expect.anything())
    expect(row.id).toBe('p-1')
  })

  it('reassignPendingPhoto only clears the destination when the move hits an existing file, then retries', async () => {
    const bucket = makeStorage(); makeTable()
    bucket.move
      .mockResolvedValueOnce({ error: { message: 'The resource already exists', statusCode: '409' } })
      .mockResolvedValueOnce({ error: null })
    await dishPhotosApi.reassignPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-1/d-clams.jpg', publicUrl: PUBLIC }, 'd-roll')
    expect(bucket.remove).toHaveBeenCalledWith(['u-1/d-roll.jpg'])
    expect(bucket.move).toHaveBeenCalledTimes(2)
  })

  it('refuses forged handles: foreign path, wrong slot for the dish, and never stores a handle-supplied URL', async () => {
    const bucket = makeStorage(); const tbl = makeTable()
    await expect(dishPhotosApi.reassignPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-2/d-clams.jpg', publicUrl: PUBLIC }, 'd-roll')).rejects.toThrow()
    await expect(dishPhotosApi.confirmPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-1/other.jpg', publicUrl: PUBLIC })).rejects.toThrow()
    await expect(dishPhotosApi.discardPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-1/d-roll.jpg' })).rejects.toThrow()
    expect(bucket.remove).not.toHaveBeenCalled()
    // valid slot, but a forged publicUrl — the row must use the derived URL
    await dishPhotosApi.confirmPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-1/d-clams.jpg', publicUrl: 'https://evil.example/x.jpg', analysisResults: { status: 'nonsense' } })
    const rec = tbl.upsert.mock.calls[0][0]
    expect(rec.photo_url).toContain('u-1/d-clams.jpg')
    expect(rec.photo_url).not.toContain('evil')
    expect(rec.status).toBe('community')
  })

  it('discardPendingPhoto removes the held file', async () => {
    const bucket = makeStorage()
    await dishPhotosApi.discardPendingPhoto({ pending: true, dishId: 'd-clams', fileName: 'u-1/d-clams.jpg' })
    expect(bucket.remove).toHaveBeenCalledWith(['u-1/d-clams.jpg'])
  })
})
