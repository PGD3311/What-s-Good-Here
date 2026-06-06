import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/dishPhotosApi', () => ({
  dishPhotosApi: { getUserPhotoMap: vi.fn(() => Promise.resolve({ d1: 'p1' })) },
}))

import { useUserDishPhotos } from './useUserDishPhotos'
import { dishPhotosApi } from '../api/dishPhotosApi'

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useUserDishPhotos', () => {
  it('returns {} and does not query when disabled', () => {
    const { result } = renderHook(() => useUserDishPhotos(null, []), { wrapper })
    expect(result.current).toEqual({})
    expect(dishPhotosApi.getUserPhotoMap).not.toHaveBeenCalled()
  })

  it('returns the photo map when enabled', async () => {
    const { result } = renderHook(() => useUserDishPhotos('u1', ['d1']), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ d1: 'p1' }))
  })
})
