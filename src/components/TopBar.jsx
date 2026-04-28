import { NotificationBell } from './NotificationBell'
import { SettingsDropdown } from './SettingsDropdown'
import { Seal } from './Seal'

/**
 * TopBar - Brand anchor with Seal mark, settings gear, and notification bell
 */
export function TopBar() {
  return (
    <div className="top-bar">
      <div className="top-bar-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 12px' }}>
        {/* Spacer for symmetry — keeps Seal optically centered */}
        <div style={{ width: '60px' }} />

        <Seal
          size={36}
          showRing={false}
          plateColor="var(--color-surface)"
          monoColor="var(--color-primary)"
          ariaLabel="What's Good Here"
        />

        {/* Settings + Notifications grouped right */}
        <div className="flex items-center">
          <SettingsDropdown />
          <NotificationBell />
        </div>
      </div>
    </div>
  )
}
