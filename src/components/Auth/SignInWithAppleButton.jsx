import { forwardRef } from 'react'

/**
 * Sign in with Apple button — designed to Apple HIG proportions.
 *
 * Apple's HIG requires specific styling for SIWA buttons (logo proportions,
 * system font, weight 500, exact black/white). Hand-drawn buttons that
 * deviate are a known App Store rejection risk.
 *
 * Reference: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
 *
 * Auth flow stays on Supabase — this is just the rendering.
 *
 * Compliance-critical styling (background, color, height, font, weight) is
 * applied as inline styles and intentionally NOT overridable by callers — the
 * component spreads only safe pass-through props (data-*, aria-*, etc.) and
 * does NOT spread arbitrary `style` or `className` overrides. If a caller
 * needs custom layout treatment, ship a separate variant rather than letting
 * the call site mutate Apple's required styling.
 *
 * Logo SVG note: the inline path below is a widely-used reproduction of
 * Apple's logo, accurate to Apple's published shape. Apple Design Resources
 * also provides the official logo asset for download (Sketch/Figma); if a
 * reviewer ever flags the asset source specifically, swap this path for the
 * downloaded Apple Design Resources artwork.
 */
export const SignInWithAppleButton = forwardRef(function SignInWithAppleButton(
  { onClick, disabled = false, label = 'Continue with Apple', dataTestId },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={dataTestId}
      className="w-full flex items-center justify-center gap-2.5 px-6 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
      style={{
        background: '#000000',
        color: '#FFFFFF',
        minHeight: 44,
        height: 50,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro", "Helvetica Neue", Arial, sans-serif',
        fontWeight: 500,
        fontSize: 17,
        letterSpacing: '-0.01em',
      }}
    >
      <svg
        aria-hidden="true"
        width="18"
        height="22"
        viewBox="0 0 170 170"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M150.37,130.25c-2.45,5.66-5.35,10.87-8.71,15.66c-4.58,6.53-8.33,11.05-11.22,13.56c-4.48,4.12-9.28,6.23-14.42,6.35c-3.69,0-8.14-1.05-13.32-3.18c-5.197-2.12-9.973-3.17-14.34-3.17c-4.58,0-9.492,1.05-14.746,3.17c-5.262,2.13-9.501,3.24-12.742,3.35c-4.929,0.21-9.842-1.96-14.746-6.52c-3.13-2.73-7.045-7.41-11.735-14.04c-5.032-7.08-9.169-15.29-12.41-24.65c-3.471-10.11-5.211-19.9-5.211-29.378c0-10.857,2.346-20.221,7.045-28.068c3.693-6.303,8.606-11.275,14.755-14.925s12.793-5.51,19.948-5.629c3.915,0,9.049,1.211,15.429,3.591c6.362,2.388,10.447,3.599,12.238,3.599c1.339,0,5.877-1.416,13.57-4.239c7.275-2.618,13.415-3.702,18.445-3.275c13.63,1.1,23.87,6.473,30.68,16.153c-12.19,7.386-18.22,17.731-18.1,31.002c0.11,10.337,3.86,18.939,11.23,25.769c3.34,3.17,7.07,5.62,11.22,7.36C152.55,125.31,151.54,127.84,150.37,130.25z M119.11,7.24c0,8.102-2.96,15.667-8.86,22.669c-7.12,8.324-15.732,13.134-25.071,12.375c-0.119-0.972-0.188-1.995-0.188-3.07c0-7.778,3.386-16.102,9.399-22.908c3.002-3.446,6.82-6.311,11.45-8.597c4.62-2.252,8.99-3.497,13.1-3.71C119.02,5.095,119.11,6.17,119.11,7.24z" />
      </svg>
      {label}
    </button>
  )
})
