'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Wallet,
  Sparkles,
  ShieldCheck,
  CalendarClock,
  Target,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/context/CurrencyContext'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  live?: boolean
}

const PRIMARY: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/copilot', label: 'AI Copilot', icon: Sparkles, live: true },
]

const SECONDARY: NavItem[] = [
  { href: '/', label: 'Compliance', icon: ShieldCheck },
  { href: '/', label: 'Deadlines', icon: CalendarClock },
  { href: '/', label: 'Goals', icon: Target },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { rate } = useCurrency()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-sm transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[64px]' : 'w-[216px]',
      )}
    >
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-5">
        {!collapsed && <SectionLabel>Overview</SectionLabel>}
        <nav className="flex flex-col gap-1">
          {PRIMARY.map((item) => (
            <NavLink key={item.label} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </nav>

        <div className="my-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        {!collapsed && <SectionLabel>Planning</SectionLabel>}
        <nav className="flex flex-col gap-1">
          {SECONDARY.map((item, i) => (
            <NavLink key={i} item={item} pathname={pathname} collapsed={collapsed} muted />
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border/80 p-3">
        {!collapsed ? (
          <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card px-3 py-2.5 shadow-[0_1px_3px_hsl(var(--shadow-color)/0.06)]">
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--us)] via-[var(--brand)] to-[var(--india)] opacity-60"
            />
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">USD / INR</span>
              <span className="flex items-center gap-1 text-[12px] font-medium text-success">
                <span className="size-1.5 rounded-full bg-success animate-pulse-ring text-success" />
                live
              </span>
            </div>
            <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums tracking-tight">
              ₹{rate.toFixed(2)}
            </p>
          </div>
        ) : (
          <div className="flex justify-center">
            <span className="size-2 rounded-full bg-success" title={`USD/INR ₹${rate.toFixed(2)}`} />
          </div>
        )}

        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'mt-2 flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

function NavLink({
  item,
  pathname,
  collapsed,
  muted,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  muted?: boolean
}) {
  const active = pathname === item.href && !muted
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center rounded-xl py-2 text-sm transition-all duration-150',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        active
          ? 'bg-card font-medium text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06),0_2px_8px_-2px_hsl(var(--shadow-color)/0.08)] ring-1 ring-border/80'
          : 'text-muted-foreground hover:bg-accent/55 hover:text-foreground',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-[var(--us)] to-[var(--brand)]" />
      )}
      <Icon
        size={17}
        className={cn(
          'shrink-0 transition-transform duration-150 group-hover:scale-110',
          active && 'text-brand',
        )}
      />
      {!collapsed && <span className="ml-2.5 truncate">{item.label}</span>}
      {!collapsed && item.live && (
        <span className="ml-auto rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--india)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
          AI
        </span>
      )}
    </Link>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow px-2.5 pb-1.5 pt-1 !text-[11px] opacity-80">{children}</p>
}
