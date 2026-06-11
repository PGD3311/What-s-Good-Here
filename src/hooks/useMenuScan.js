import { useMutation } from '@tanstack/react-query'
import { menuScanApi } from '../api/menuScanApi'
import { getUserMessage } from '../utils/errorHandler'

export function useMenuScan() {
  const mutation = useMutation({
    mutationFn: ({ restaurantId, base64, mediaType }) =>
      menuScanApi.scanMenu({ restaurantId, base64, mediaType }),
  })
  return {
    scan: mutation.mutateAsync,
    result: mutation.data || null,
    scanning: mutation.isPending,
    error: mutation.error ? { message: getUserMessage(mutation.error, 'scanning the menu') } : null,
    reset: mutation.reset,
  }
}
