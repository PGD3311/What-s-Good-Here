/**
 * HeartIcon — favorites toggle icon. Filled when active (favorited),
 * outline when not.
 */
export function HeartIcon({ size = 20, className = '', active = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={'inline-block transition-colors duration-150 ' + className}
      fill={active ? 'var(--color-primary)' : 'none'}
      stroke={active ? 'var(--color-primary)' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
