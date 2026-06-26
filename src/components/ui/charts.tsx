'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

/* ──────────────────────────────────────────────────────────────────────────
   Sparkline — smooth area + line, used for net-worth trend.
   Pass `labels` (+ optional `format`) to enable a hover crosshair + tooltip.
   ────────────────────────────────────────────────────────────────────────── */
export function Sparkline({
  data,
  labels,
  format,
  color = 'var(--brand)',
  height = 56,
  fill = false,
  className,
}: {
  data: number[]
  labels?: string[]
  format?: (v: number) => string
  color?: string
  height?: number
  /** Stretch to fill the parent's height instead of using a fixed height. */
  fill?: boolean
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const w = 240
  const h = height
  const pad = 4
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (d - min) / range) * (h - pad * 2)
    return [x, y] as const
  })

  const line = smoothPath(pts)
  const area = `${line} L ${pts[pts.length - 1][0]},${h} L ${pts[0][0]},${h} Z`
  const interactive = !!labels

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))))
  }

  return (
    <div
      className={cn('relative w-full', fill && 'h-full', className)}
      style={fill ? undefined : { height }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${id})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <line
            x1={pts[hover][0]}
            y1={0}
            x2={pts[hover][0]}
            y2={h}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
        {hover !== null && (
          <circle
            cx={pts[hover][0]}
            cy={pts[hover][1]}
            r="3.5"
            fill={color}
            stroke="var(--card)"
            strokeWidth="1.5"
          />
        )}
      </svg>
      {hover !== null && labels && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
          style={{
            left: `${Math.max(9, Math.min(91, (pts[hover][0] / w) * 100))}%`,
            top: -6,
          }}
        >
          <div className="whitespace-nowrap rounded-lg border border-border/70 bg-popover px-2.5 py-1.5 text-center shadow-[0_4px_12px_-2px_hsl(var(--shadow-color)/0.15)]">
            <p className="tabular-nums text-xs font-semibold tabular-nums">
              {format ? format(data[hover]) : data[hover].toLocaleString()}
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground">{labels[hover]}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Donut — multi-segment ring with a centre label slot.
   Pass `activeIndex` + `onHover` to cross-link with an external legend:
   the active segment thickens and glows while the rest dim, and hovering
   the ring itself reports the segment under the pointer.
   ────────────────────────────────────────────────────────────────────────── */
export function Donut({
  segments,
  size = 132,
  thickness = 14,
  children,
  gap = 0.02,
  activeIndex = null,
  onHover,
}: {
  segments: { value: number; color: string }[]
  size?: number
  thickness?: number
  gap?: number
  children?: React.ReactNode
  activeIndex?: number | null
  onHover?: (index: number | null) => void
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  let offset = 0

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {segments.map((seg, i) => {
          const frac = seg.value / total
          const len = Math.max(frac - gap, 0) * c
          const dash = `${len} ${c - len}`
          const isActive = activeIndex === i
          const isDimmed = activeIndex !== null && activeIndex !== i
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={isActive ? thickness + 3 : thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset * c}
              strokeLinecap="round"
              opacity={isDimmed ? 0.25 : 1}
              onPointerEnter={onHover ? () => onHover(i) : undefined}
              onPointerLeave={onHover ? () => onHover(null) : undefined}
              style={{
                transition:
                  'stroke-dasharray 0.7s cubic-bezier(0.16,1,0.3,1), stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1), stroke-width 0.2s ease, opacity 0.2s ease, filter 0.2s ease',
                filter: isActive
                  ? `drop-shadow(0 0 6px color-mix(in oklch, ${seg.color} 65%, transparent))`
                  : undefined,
                cursor: onHover ? 'pointer' : undefined,
              }}
            />
          )
          offset += frac
          return el
        })}
      </svg>
      {children && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {children}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Gauge — 240° arc, used for the FBAR threshold meter
   ────────────────────────────────────────────────────────────────────────── */
export function Gauge({
  value, // 0..1 (can exceed 1, clamped visually)
  color = 'var(--warning)',
  size = 150,
  thickness = 12,
  label,
  sublabel,
}: {
  value: number
  color?: string
  size?: number
  thickness?: number
  label?: React.ReactNode
  sublabel?: React.ReactNode
}) {
  const start = 150 // degrees
  const sweep = 240
  const clamped = Math.max(0, Math.min(value, 1))
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2

  const arc = (frac: number) => {
    const a0 = (start * Math.PI) / 180
    const a1 = ((start + sweep * frac) * Math.PI) / 180
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = sweep * frac > 180 ? 1 : 0
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
  }

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size * 0.78 }}>
      <svg width={size} height={size} className="absolute top-0">
        <path d={arc(1)} fill="none" stroke="var(--muted)" strokeWidth={thickness} strokeLinecap="round" />
        <path
          d={arc(clamped)}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          style={{ transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: '38%' }}>
        {label}
        {sublabel}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   RadialProgress — full ring, used for residency day counter
   ────────────────────────────────────────────────────────────────────────── */
export function RadialProgress({
  value, // 0..1
  color = 'var(--brand)',
  size = 120,
  thickness = 10,
  children,
}: {
  value: number
  color?: string
  size?: number
  thickness?: number
  children?: React.ReactNode
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(value, 1))

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   ProgressBar — linear, used for goals & split bars
   ────────────────────────────────────────────────────────────────────────── */
export function ProgressBar({
  value, // 0..1
  color = 'var(--brand)',
  track = 'var(--muted)',
  className,
  height = 8,
}: {
  value: number
  color?: string
  track?: string
  className?: string
  height?: number
}) {
  return (
    <div
      className={cn('overflow-hidden rounded-full', className)}
      style={{ background: track, height }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(value, 1)) * 100}%`,
          background: color,
          transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
        }}
      />
    </div>
  )
}

/* ── helpers ──────────────────────────────────────────────────────────────── */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    const cx = (p0[0] + p1[0]) / 2
    d += ` C ${cx},${p0[1]} ${cx},${p1[1]} ${p1[0]},${p1[1]}`
  }
  return d
}
