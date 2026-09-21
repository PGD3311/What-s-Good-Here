import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { capture } from '../lib/analytics'
import { dishPhotosApi } from '../api/dishPhotosApi'
import { analyzeImage } from '../utils/imageAnalysis'
import { logger } from '../utils/logger'

/**
 * Hook for managing photo uploads for dishes
 */
export function useDishPhotos() {
  const queryClient = useQueryClient()
  const [analyzing, setAnalyzing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)
  const progressResetTimerRef = useRef(null)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (progressResetTimerRef.current) {
        clearTimeout(progressResetTimerRef.current)
      }
    }
  }, [])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['unratedDishes'] })

  const uploadMutation = useMutation({
    mutationFn: ({ dishId, file, analysisResults, context }) =>
      dishPhotosApi.uploadPhoto({ dishId, file, analysisResults, ...context }),
    onSuccess: (result) => {
      // A held (pending) photo has no row yet — nothing to refresh.
      if (!result?.pending) invalidate()
    },
  })
  // Resolutions for a held photo (see dishPhotosApi.uploadPhoto → pending).
  const confirmMutation = useMutation({ mutationFn: (pending) => dishPhotosApi.confirmPendingPhoto(pending), onSuccess: invalidate })
  const reassignMutation = useMutation({ mutationFn: ({ pending, toDishId }) => dishPhotosApi.reassignPendingPhoto(pending, toDishId), onSuccess: invalidate })
  const discardMutation = useMutation({ mutationFn: (pending) => dishPhotosApi.discardPendingPhoto(pending) })

  const deleteMutation = useMutation({
    mutationFn: (photoId) => dishPhotosApi.deletePhoto(photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unratedDishes'] })
    },
  })

  /**
   * @param {string} dishId
   * @param {File} file
   * @param {Object} [context] - { dishName, category, restaurantName, allowMismatch }
   *   With dishName, the upload runs the dish check; a clear contradiction
   *   returns `{ pending: true, mismatch: { seen }, ... }` instead of a row.
   */
  const uploadPhoto = useCallback(async (dishId, file, context = {}) => {
    setAnalyzing(true)
    setUploadProgress(0)
    setError(null)

    // Track upload attempt
    capture('photo_upload_attempt', {
      dish_id: dishId,
      file_size_bytes: file.size,
      mime_type: file.type,
    })

    try {
      // Step 1: Analyze the image
      const analysis = await analyzeImage(file)

      // If rejected by quality checks, don't upload
      if (analysis.status === 'rejected') {
        capture('photo_upload_rejected', {
          dish_id: dishId,
          reason: analysis.rejectReason,
          avg_brightness: analysis.avgBrightness,
          dark_pixel_pct: analysis.darkPixelPct,
          bright_pixel_pct: analysis.brightPixelPct,
          width: analysis.width,
          height: analysis.height,
          file_size_bytes: analysis.fileSize,
        })

        setError(analysis.rejectReason)
        return { rejected: true, reason: analysis.rejectReason }
      }

      // Step 2: Upload the photo with analysis results
      setAnalyzing(false)
      setUploadProgress(30)

      const result = await uploadMutation.mutateAsync({
        dishId,
        file,
        analysisResults: analysis,
        context,
      })

      if (result?.pending) {
        capture('photo_dish_mismatch', { dish_id: dishId, seen: result.mismatch?.seen || '' })
        setUploadProgress(100)
        return { ...result, analysisResults: analysis }
      }

      // Track accepted upload with full metrics
      capture('photo_upload_accepted', {
        dish_id: dishId,
        status: analysis.status,
        quality_score: analysis.qualityScore,
        avg_brightness: analysis.avgBrightness,
        dark_pixel_pct: analysis.darkPixelPct,
        bright_pixel_pct: analysis.brightPixelPct,
        width: analysis.width,
        height: analysis.height,
        file_size_bytes: analysis.fileSize,
      })

      setUploadProgress(100)
      return { ...result, analysisResults: analysis }
    } catch (err) {
      setError(err.message || 'Failed to upload photo')
      throw err
    } finally {
      setAnalyzing(false)
      // Reset progress after a short delay — clear previous timer to avoid leak
      if (progressResetTimerRef.current) clearTimeout(progressResetTimerRef.current)
      progressResetTimerRef.current = setTimeout(() => setUploadProgress(0), 500)
    }
  }, [uploadMutation])

  const getUserPhotoForDish = useCallback(async (dishId) => {
    try {
      return await dishPhotosApi.getUserPhotoForDish(dishId)
    } catch (err) {
      logger.error('Error getting user photo:', err)
      return null
    }
  }, [])

  const deletePhoto = useCallback(async (photoId) => {
    try {
      await deleteMutation.mutateAsync(photoId)
      return { success: true }
    } catch (err) {
      setError(err.message || 'Failed to delete photo')
      throw err
    }
  }, [deleteMutation])

  const confirmPendingPhoto = useCallback(async (pending) => {
    try {
      const row = await confirmMutation.mutateAsync(pending)
      capture('photo_dish_mismatch_resolved', { dish_id: pending.dishId, choice: 'confirm' })
      return { ...row, analysisResults: pending.analysisResults }
    } catch (err) {
      setError(err.message || 'Failed to add photo')
      throw err
    }
  }, [confirmMutation])

  const reassignPendingPhoto = useCallback(async (pending, toDishId) => {
    try {
      const row = await reassignMutation.mutateAsync({ pending, toDishId })
      capture('photo_dish_mismatch_resolved', { dish_id: pending.dishId, choice: 'reassign', to_dish_id: toDishId })
      return { ...row, analysisResults: pending.analysisResults }
    } catch (err) {
      setError(err.message || 'Failed to move photo')
      throw err
    }
  }, [reassignMutation])

  const discardPendingPhoto = useCallback(async (pending) => {
    try {
      await discardMutation.mutateAsync(pending)
      capture('photo_dish_mismatch_resolved', { dish_id: pending.dishId, choice: 'discard' })
    } catch (err) {
      // Orphaned file, not user-visible — log, don't block the UI.
      logger.error('discardPendingPhoto failed', err)
    }
  }, [discardMutation])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    uploadPhoto,
    confirmPendingPhoto,
    reassignPendingPhoto,
    discardPendingPhoto,
    resolvingPending: confirmMutation.isPending || reassignMutation.isPending || discardMutation.isPending,
    getUserPhotoForDish,
    deletePhoto,
    uploading: uploadMutation.isPending,
    analyzing,
    uploadProgress,
    error,
    clearError,
  }
}
