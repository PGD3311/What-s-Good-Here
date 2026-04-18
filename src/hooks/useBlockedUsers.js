import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { capture } from '../lib/analytics'
import { blocksApi } from '../api/blocksApi'
import { useAuth } from '../context/AuthContext'
import { getUserMessage } from '../utils/errorHandler'

export function useBlockedUsers() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id

  const { data: blocks = [], isLoading: loading } = useQuery({
    queryKey: ['blocks', userId],
    queryFn: () => blocksApi.getMyBlocks(),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  })

  const isBlocked = useCallback(
    (otherUserId) => blocks.some((b) => b.blockedId === otherUserId),
    [blocks]
  )

  const invalidateBlockDependent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['blocks', userId] })
    // RLS/view filters in Supabase change what these queries return based
    // on the blocks list — invalidate them so stale blocked-user content
    // clears out of the UI. Keys below match the actual query keys in use
    // across the app; non-React-Query surfaces (follower lists,
    // friends-votes fetched via useState in useDishDetail) will refresh on
    // their next mount.
    queryClient.invalidateQueries({ queryKey: ['dishes'] })
    queryClient.invalidateQueries({ queryKey: ['dish'] })
    queryClient.invalidateQueries({ queryKey: ['localLists'] })
    queryClient.invalidateQueries({ queryKey: ['localList'] })
    queryClient.invalidateQueries({ queryKey: ['followCounts'] })
  }, [queryClient, userId])

  const blockMutation = useMutation({
    mutationFn: (blockedId) => blocksApi.blockUser(blockedId),
    onSuccess: () => {
      invalidateBlockDependent()
    },
  })

  const unblockMutation = useMutation({
    mutationFn: (blockedId) => blocksApi.unblockUser(blockedId),
    onSuccess: () => {
      invalidateBlockDependent()
    },
  })

  const blockUser = async (blockedId) => {
    if (!userId) return { error: 'You must be logged in to block users' }
    try {
      await blockMutation.mutateAsync(blockedId)
      capture('user_blocked', { blocked_user_id: blockedId })
      toast.success('User blocked')
      return { error: null }
    } catch (err) {
      // Prefer the specific RPC message (e.g. "Cannot block yourself",
      // rate-limit text) over the generic fallback.
      toast.error(err.message || getUserMessage(err, 'blocking user'))
      return { error: err.message }
    }
  }

  const unblockUser = async (blockedId) => {
    if (!userId) return { error: 'You must be logged in to unblock users' }
    try {
      await unblockMutation.mutateAsync(blockedId)
      capture('user_unblocked', { unblocked_user_id: blockedId })
      toast.success('User unblocked')
      return { error: null }
    } catch (err) {
      toast.error(err.message || getUserMessage(err, 'unblocking user'))
      return { error: err.message }
    }
  }

  return {
    blocks,
    loading: userId ? loading : false,
    isBlocked,
    blockUser,
    unblockUser,
    blocking: blockMutation.isPending,
    unblocking: unblockMutation.isPending,
  }
}
