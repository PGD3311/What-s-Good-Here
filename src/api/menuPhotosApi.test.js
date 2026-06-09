import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks (hoisted before imports) ---

vi.mock('../lib/supabase', () => {
  const storageMock = {
    from: vi.fn(),
  }
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      storage: storageMock,
      functions: {
        invoke: vi.fn(),
      },
    },
  }
})

vi.mock('../lib/rateLimiter', () => ({
  checkPhotoUploadRateLimit: vi.fn(),
}))

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// --- Imports (after mocks) ---

import { supabase } from '../lib/supabase'
import { checkPhotoUploadRateLimit } from '../lib/rateLimiter'
import { menuPhotosApi } from './menuPhotosApi'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal File-like object with a given name. */
function makeFile(name = 'menu.jpg') {
  return new File(['data'], name, { type: 'image/jpeg' })
}

/** Wire supabase.storage.from() to return a fluent upload/getPublicUrl mock. */
function mockStorageBucket({ uploadError = null, publicUrl = 'https://cdn.example.com/menu.jpg' } = {}) {
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl } })
  const upload = vi.fn().mockResolvedValue({ data: {}, error: uploadError })
  supabase.storage.from.mockReturnValue({ upload, getPublicUrl })
  return { upload, getPublicUrl }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('menuPhotosApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // uploadMenuPhotos
  // -------------------------------------------------------------------------

  describe('uploadMenuPhotos', () => {
    it('returns public URLs for each uploaded file', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'uid-123' } } })
      checkPhotoUploadRateLimit.mockReturnValue({ allowed: true })
      const { upload, getPublicUrl } = mockStorageBucket({
        publicUrl: 'https://cdn.example.com/menu.jpg',
      })

      const files = [makeFile('menu.jpg'), makeFile('menu2.jpg')]
      const result = await menuPhotosApi.uploadMenuPhotos('rest-abc', files)

      expect(result).toHaveLength(2)
      expect(result[0]).toBe('https://cdn.example.com/menu.jpg')
      expect(result[1]).toBe('https://cdn.example.com/menu.jpg')
      expect(upload).toHaveBeenCalledTimes(2)
      expect(getPublicUrl).toHaveBeenCalledTimes(2)
    })

    it('builds owner-first path: uid / restaurantId / timestamp-index.ext', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'uid-owner' } } })
      checkPhotoUploadRateLimit.mockReturnValue({ allowed: true })
      const { upload } = mockStorageBucket()

      await menuPhotosApi.uploadMenuPhotos('rest-xyz', [makeFile('photo.png')])

      // First argument to upload() is the storage path.
      const [[path]] = upload.mock.calls
      // Must start with uid / restaurantId /
      expect(path).toMatch(/^uid-owner\/rest-xyz\/\d+-0\.png$/)
    })

    it('uses upsert: false', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      checkPhotoUploadRateLimit.mockReturnValue({ allowed: true })
      const { upload } = mockStorageBucket()

      await menuPhotosApi.uploadMenuPhotos('rest-1', [makeFile()])

      const [, , opts] = upload.mock.calls[0]
      expect(opts).toMatchObject({ upsert: false })
    })

    it('throws a readable error when not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
      checkPhotoUploadRateLimit.mockReturnValue({ allowed: true })

      await expect(
        menuPhotosApi.uploadMenuPhotos('rest-1', [makeFile()])
      ).rejects.toThrow(/logged in/i)
    })

    it('throws the rate-limiter message when blocked', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      checkPhotoUploadRateLimit.mockReturnValue({
        allowed: false,
        message: 'Too many uploads. Please wait 42 seconds.',
      })

      await expect(
        menuPhotosApi.uploadMenuPhotos('rest-1', [makeFile()])
      ).rejects.toThrow(/Too many uploads/)
    })

    it('surfaces upload errors as classified errors', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      checkPhotoUploadRateLimit.mockReturnValue({ allowed: true })
      mockStorageBucket({ uploadError: { message: 'bucket not found' } })

      await expect(
        menuPhotosApi.uploadMenuPhotos('rest-1', [makeFile()])
      ).rejects.toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // extractFromPhotos
  // -------------------------------------------------------------------------

  describe('extractFromPhotos', () => {
    it('invokes extract-menu-from-photo with the correct body', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: {
          extraction_id: 'ext-001',
          dishes: [{ name: 'Lobster Roll', category: 'seafood', price: 28 }],
          menu_section_order: ['Starters', 'Mains'],
        },
        error: null,
      })

      const result = await menuPhotosApi.extractFromPhotos({
        restaurantId: 'rest-abc',
        restaurantName: 'The Chowder House',
        photoUrls: ['https://cdn.example.com/p1.jpg'],
      })

      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'extract-menu-from-photo',
        {
          body: {
            photo_urls: ['https://cdn.example.com/p1.jpg'],
            restaurant_id: 'rest-abc',
            restaurant_name: 'The Chowder House',
          },
        }
      )

      // Maps snake_case extraction_id → camelCase extractionId
      expect(result.extractionId).toBe('ext-001')
      expect(result.dishes).toHaveLength(1)
      expect(result.menu_section_order).toEqual(['Starters', 'Mains'])
    })

    it('defaults dishes and menu_section_order to empty arrays when absent', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { extraction_id: 'ext-002' },
        error: null,
      })

      const result = await menuPhotosApi.extractFromPhotos({
        restaurantId: 'r',
        restaurantName: 'R',
        photoUrls: [],
      })

      expect(result.dishes).toEqual([])
      expect(result.menu_section_order).toEqual([])
    })

    it('surfaces invoke errors', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'edge function crashed' },
      })

      await expect(
        menuPhotosApi.extractFromPhotos({ restaurantId: 'r', restaurantName: 'R', photoUrls: [] })
      ).rejects.toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // commitDishes
  // -------------------------------------------------------------------------

  describe('commitDishes', () => {
    it('invokes commit-menu-dishes with extraction_id, includes, and price_overrides', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { inserted: 5, updated: 1, skipped: 2 },
        error: null,
      })

      const result = await menuPhotosApi.commitDishes({
        extractionId: 'ext-001',
        includes: [0, 1, 3],
        priceOverrides: { 1: 14.5 },
      })

      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'commit-menu-dishes',
        {
          body: {
            extraction_id: 'ext-001',
            includes: [0, 1, 3],
            price_overrides: { 1: 14.5 },
          },
        }
      )

      expect(result).toEqual({ inserted: 5, updated: 1, skipped: 2 })
    })

    it('defaults price_overrides to an empty object when not provided', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { inserted: 2, updated: 0, skipped: 0 },
        error: null,
      })

      await menuPhotosApi.commitDishes({ extractionId: 'ext-002', includes: [0] })

      const [, { body }] = supabase.functions.invoke.mock.calls[0]
      expect(body.price_overrides).toEqual({})
    })

    it('does NOT include any dish text fields in the request body', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { inserted: 1, updated: 0, skipped: 0 },
        error: null,
      })

      await menuPhotosApi.commitDishes({
        extractionId: 'ext-003',
        includes: [0],
        priceOverrides: {},
      })

      const [, { body }] = supabase.functions.invoke.mock.calls[0]
      // The body must only carry id/selection/prices — no dish-name/category/description
      const allowedKeys = new Set(['extraction_id', 'includes', 'price_overrides'])
      for (const key of Object.keys(body)) {
        expect(allowedKeys.has(key)).toBe(true)
      }
    })

    it('surfaces invoke errors', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'service unavailable' },
      })

      await expect(
        menuPhotosApi.commitDishes({ extractionId: 'ext-err', includes: [] })
      ).rejects.toBeDefined()
    })
  })
})
