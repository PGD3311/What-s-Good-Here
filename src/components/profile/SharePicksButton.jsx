import { shareOrCopy, canonicalShareUrl } from '../../utils/share'
import { capture } from '../../lib/analytics'
import { toast } from 'sonner'

/**
 * SharePicksButton — generates a location-filtered profile link and shares it.
 *
 * Props:
 *   userId   - current user's ID
 *   userName - display name for share text
 *   location - optional location slug for filtering (e.g. 'marthas-vineyard')
 */
export function SharePicksButton({ userId, userName, location }) {
  var handleShare = async function () {
    var path = '/user/' + userId
    if (location) {
      path += '?location=' + encodeURIComponent(location)
    }
    var url = canonicalShareUrl(path)

    var result = await shareOrCopy({
      url: url,
      title: (userName || 'My') + "'s picks on What's Good Here",
      text: 'Check out ' + (userName || 'my') + "'s food picks on What's Good Here!",
    })

    capture('share_picks', {
      user_id: userId,
      location: location || 'all',
      method: result.method,
      success: result.success,
    })

    // shareOrCopy returns 'native_capacitor' or 'web_share' for OS share sheets
    // (which have their own UI feedback) — toast only for clipboard fallbacks.
    if (result.success && result.method !== 'native_capacitor' && result.method !== 'web_share') {
      toast.success('Link copied!', { duration: 2000 })
    }
  }

  return (
    <button
      onClick={handleShare}
      className="px-5 py-2 rounded-full font-semibold transition-all hover:opacity-90 active:scale-[0.97]"
      style={{
        background: 'var(--color-primary)',
        color: 'var(--color-text-on-primary)',
        fontSize: '13px',
      }}
    >
      Share My Picks
    </button>
  )
}
