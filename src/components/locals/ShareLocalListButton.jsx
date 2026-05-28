import { toast } from 'sonner'
import { shareOrCopy, canonicalShareUrl } from '../../utils/share'
import { capture } from '../../lib/analytics'

/**
 * ShareLocalListButton — share a curator's Local List URL via OS share sheet
 * or clipboard fallback. Uses canonicalShareUrl so iOS Capacitor links resolve
 * to https://wghapp.com instead of the WhatsGoodHere:// scheme.
 *
 * Props:
 *   curatorUserId - the curator whose list we're sharing
 *   curatorName   - display name for share title/text
 */
export function ShareLocalListButton({ curatorUserId, curatorName }) {
  async function handleClick() {
    const url = canonicalShareUrl('/locals/' + curatorUserId)
    const name = curatorName || 'a local'
    const result = await shareOrCopy({
      url: url,
      title: name + "'s picks on What's Good Here",
      text: 'Check out ' + name + "'s Top 10 dishes on What's Good Here!",
    })
    capture('share_local_list', {
      curator_id: curatorUserId,
      method: result.method,
      success: result.success,
    })
    if (result.method === 'clipboard' || result.method === 'execCommand') {
      if (result.success) {
        toast.success('Link copied!', { duration: 2000 })
      } else {
        toast.error("Couldn't copy link — please try again", { duration: 3000 })
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--color-accent-gold)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      Share
    </button>
  )
}
