import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { userPlaylistsApi } from '../../api/userPlaylistsApi'
import { useAuth } from '../../context/AuthContext'
import { capture } from '../../lib/analytics'
import { getUserMessage } from '../../utils/errorHandler'

/**
 * SaveLocalListButton — clone a curator's Local List into the viewer's playlists.
 * Logged-out viewers are redirected to /login with a return URL.
 *
 * Props:
 *   curatorUserId   - the curator whose list we're saving
 *   curatorName     - display name (for toast + share text)
 */
export function SaveLocalListButton({ curatorUserId, curatorName }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (!user) {
      navigate('/login?next=' + encodeURIComponent('/locals/' + curatorUserId))
      return
    }
    if (pending) return
    setPending(true)
    try {
      const result = await userPlaylistsApi.cloneLocalList(curatorUserId)
      capture('local_list_cloned', {
        curator_id: curatorUserId,
        copied_count: result.copiedCount,
      })
      toast.success('Saved ' + result.copiedCount + ' dishes', { duration: 2500 })
      navigate('/playlist/' + result.playlistId)
    } catch (error) {
      toast.error(getUserMessage(error, 'saving this list'))
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--color-primary)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: pending ? 'wait' : 'pointer',
        opacity: pending ? 0.5 : 1,
      }}
    >
      {pending ? 'Saving…' : 'Save to my list'}
    </button>
  )
}
