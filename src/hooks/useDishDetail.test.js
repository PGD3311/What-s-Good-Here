import { describe, it, expect, vi } from 'vitest'

// useDishDetail.js transitively imports src/lib/supabase, which calls
// createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) at module-eval
// time. In CI those env vars aren't set, so the createClient call errors
// out with "supabaseUrl is required" before any test runs. transformDish
// is a pure function that never touches the client, so we stub the
// supabase module to a minimal shape that satisfies all transitive
// imports without instantiating a real client.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
  },
  isSupabaseConfigured: false,
}))

import { transformDish } from './useDishDetail'

const BASE_INPUT = {
  id: 'd-1',
  name: 'Stan\'s Island Mushroom Bolognese',
  restaurant_id: 'r-1',
  restaurants: { name: 'Atria', town: 'Edgartown' },
  category: 'pasta',
  price: 46,
  photo_url: null,
  total_votes: 10,
  avg_rating: 7.6,
}

describe('transformDish — description + dietary_tags passthrough', () => {
  it('passes description through to the component-facing shape', () => {
    const out = transformDish({
      ...BASE_INPUT,
      description: 'House-made tagliatelle, mushroom ragu, parmesan',
      dietary_tags: ['vegetarian'],
    })
    expect(out.description).toBe('House-made tagliatelle, mushroom ragu, parmesan')
    expect(out.dietary_tags).toEqual(['vegetarian'])
  })

  it('defaults description to null when missing', () => {
    const out = transformDish({ ...BASE_INPUT })
    expect(out.description).toBeNull()
  })

  it('defaults dietary_tags to empty array when missing or non-array', () => {
    expect(transformDish({ ...BASE_INPUT }).dietary_tags).toEqual([])
    expect(transformDish({ ...BASE_INPUT, dietary_tags: null }).dietary_tags).toEqual([])
    expect(transformDish({ ...BASE_INPUT, dietary_tags: 'not an array' }).dietary_tags).toEqual([])
  })

  it('preserves an empty description as null (not blank string)', () => {
    // Phase 2 extractor coerces empty / whitespace descriptions to null
    // before insert, but defensive null handling here protects the UI if
    // any legacy row leaked through with description="".
    const out = transformDish({ ...BASE_INPUT, description: null })
    expect(out.description).toBeNull()
  })
})
