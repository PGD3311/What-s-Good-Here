import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
import { supabase } from '../lib/supabase'
import { menuScanApi } from './menuScanApi'

describe('menuScanApi.addStagedDishes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('commits every staged index — the client never sends dish fields', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { inserted: 3, updated: 0, skipped: 0 }, error: null })
    const r = await menuScanApi.addStagedDishes({ extractionId: 'ext-1', count: 3 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('commit-menu-dishes', {
      body: { extraction_id: 'ext-1', includes: [0, 1, 2], price_overrides: {} },
    })
    expect(r.inserted).toBe(3)
  })

  it('refuses without an extraction id (guest scan) or with nothing to add', async () => {
    await expect(menuScanApi.addStagedDishes({ extractionId: null, count: 2 })).rejects.toThrow(/sign in/i)
    await expect(menuScanApi.addStagedDishes({ extractionId: 'ext-1', count: 0 })).rejects.toThrow(/nothing/i)
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it("surfaces the server's message on failure", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { context: { json: () => Promise.resolve({ error: 'Extraction expired' }) } } })
    await expect(menuScanApi.addStagedDishes({ extractionId: 'ext-1', count: 1 })).rejects.toThrow(/expired/i)
  })
})
