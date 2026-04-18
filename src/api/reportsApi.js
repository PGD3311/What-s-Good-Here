import { supabase } from '../lib/supabase'
import { createClassifiedError } from '../utils/errorHandler'
import { logger } from '../utils/logger'

const VALID_TARGET_TYPES = ['dish', 'review', 'photo', 'user']
const VALID_REASONS = [
  'spam',
  'hate_speech',
  'harassment',
  'misinformation',
  'inappropriate_content',
  'impersonation',
  'other',
]
const MAX_DETAILS_LENGTH = 500

export const reportsApi = {
  async submitReport({ targetType, targetId, reason, details = null }) {
    try {
      if (!VALID_TARGET_TYPES.includes(targetType)) {
        throw new Error('Invalid report target type')
      }
      if (!targetId) {
        throw new Error('Report target is required')
      }
      if (!VALID_REASONS.includes(reason)) {
        throw new Error('Please pick a reason')
      }
      if (details && details.length > MAX_DETAILS_LENGTH) {
        throw new Error(`Details must be ${MAX_DETAILS_LENGTH} characters or less`)
      }

      const { data, error } = await supabase.rpc('submit_report', {
        p_reported_type: targetType,
        p_reported_id: targetId,
        p_reason: reason,
        p_details: details && details.trim() ? details.trim() : null,
      })

      if (error) {
        throw createClassifiedError(error)
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Could not submit report')
      }

      return { success: true, reportId: data.report_id }
    } catch (error) {
      logger.error('reportsApi.submitReport failed:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },

  async getMyReports() {
    try {
      const { data, error } = await supabase.rpc('get_my_reports')

      if (error) {
        throw createClassifiedError(error)
      }

      return data || []
    } catch (error) {
      logger.error('reportsApi.getMyReports failed:', error)
      throw error.type ? error : createClassifiedError(error)
    }
  },
}

export const REPORT_TARGET_TYPES = VALID_TARGET_TYPES
export const REPORT_REASONS = VALID_REASONS
export const REPORT_DETAILS_MAX_LENGTH = MAX_DETAILS_LENGTH
