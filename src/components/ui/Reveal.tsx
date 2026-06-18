'use client'

import { motion } from 'motion/react'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * Springy fade-and-rise entrance. Drop-in wrapper for sections/cards to give
 * the page a smooth, staggered reveal on mount.
 */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
  style,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}
