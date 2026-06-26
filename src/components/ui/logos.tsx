/**
 * Bespoke product marks for NRIWB's core surfaces. Drawn with `currentColor`
 * so they inherit the tile's text color (white on the blue AI tiles, etc.).
 * More distinctive than generic icon-set glyphs — these read as feature logos.
 */

interface LogoProps {
  size?: number
  className?: string
}

/** AI Copilot — a polished two-point "intelligence spark". */
export function CopilotLogo({ size = 18, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2.8c.46 4.95 4.27 8.76 9.2 9.2-4.93.46-8.74 4.27-9.2 9.2-.46-4.93-4.27-8.74-9.2-9.2 4.93-.44 8.74-4.25 9.2-9.2Z"
        fill="currentColor"
      />
      <path
        d="M18.7 2.5c.16 1.62 1.43 2.89 3.05 3.05-1.62.16-2.89 1.43-3.05 3.05-.16-1.62-1.43-2.89-3.05-3.05 1.62-.16 2.89-1.43 3.05-3.05Z"
        fill="currentColor"
        opacity="0.65"
      />
    </svg>
  )
}

/** Analyzer — an allocation ring with one highlighted segment + core. */
export function AnalyzerLogo({ size = 18, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="7.6" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <path
        d="M12 4.4a7.6 7.6 0 0 1 6.58 11.4"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.3" fill="currentColor" />
    </svg>
  )
}

/** Accounts — three stacked layers (accounts aggregated across countries). */
export function AccountsLogo({ size = 18, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path d="M12 2.8 21 7.6 12 12.4 3 7.6 12 2.8Z" fill="currentColor" />
      <path
        d="M3.6 12.2 12 16.7 20.4 12.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <path
        d="M3.6 16.4 12 20.9 20.4 16.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.35"
      />
    </svg>
  )
}
