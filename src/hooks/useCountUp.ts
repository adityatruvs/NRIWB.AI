'use client'

import { useEffect, useRef, useState } from 'react'

const easeOutExpo = (t: number) =>
  t === 1 ? 1 : 1 - Math.pow(2, -10 * t)

/**
 * Animates a numeric value toward `target` whenever `target` changes.
 * Returns the current (interpolated) value for formatting by the caller.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || fromRef.current === target) {
      fromRef.current = target
      setValue(target)
      return
    }

    const from = fromRef.current
    const delta = target - from
    let start: number | null = null

    const tick = (ts: number) => {
      if (start === null) start = ts
      const t = Math.min((ts - start) / duration, 1)
      setValue(from + delta * easeOutExpo(t))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = target
    }
  }, [target, duration])

  return value
}
