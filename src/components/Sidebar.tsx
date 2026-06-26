'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Wallet,
  Sparkles,
  PieChart,
  ShieldCheck,
  CalendarClock,
  Target,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
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
  { href: '/analyzer', label: 'Analyzer', icon: PieChart, live: true },
  { href: '/copilot', label: 'AI Copilot', icon: Sparkles, live: true },
]

const SECONDARY: NavItem[] = [
  { href: '/', label: 'Compliance', icon: ShieldCheck },
  { href: '/', label: 'Deadlines', icon: CalendarClock },
  { href: '/goals', label: 'Goals', icon: Target },
]

interface NavGroupDef {
  label: string
  items: NavItem[]
  /** Placeholder items (href '/') render muted/non-active in this group. */
  mutePlaceholders?: boolean
}

const GROUPS: NavGroupDef[] = [
  { label: 'Overview', items: PRIMARY },
  { label: 'Planning', items: SECONDARY, mutePlaceholders: true },
]

const GROUPS_STORAGE_KEY = 'nriwb:sidebar-groups'

export default function Sidebar() {
  const pathname = usePathname()
  const { rate } = useCurrency()
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.label, true])),
  )

  // Restore which groups are expanded after mount (localStorage is client-only,
  // so we keep the SSR/first-render state all-open to avoid a hydration mismatch).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUPS_STORAGE_KEY)
      if (saved) setOpenGroups((prev) => ({ ...prev, ...JSON.parse(saved) }))
    } catch {
      /* ignore */
    }
  }, [])

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-sm transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-[64px]' : 'w-[216px]',
      )}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-3 pt-5">
        {GROUPS.map((group, i) => (
          <div key={group.label}>
            {i > 0 && (
              <div className="my-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            )}
            <NavGroup
              group={group}
              pathname={pathname}
              collapsed={collapsed}
              open={openGroups[group.label] ?? true}
              onToggle={() => toggleGroup(group.label)}
            />
          </div>
        ))}
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
            <p className="mt-1 tabular-nums text-[15px] font-semibold tabular-nums tracking-tight">
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
        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-brand" />
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
        <span className="ai-chip ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          AI
        </span>
      )}
    </Link>
  )
}

function NavGroup({
  group,
  pathname,
  collapsed,
  open,
  onToggle,
}: {
  group: NavGroupDef
  pathname: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
}) {
  // When the whole sidebar is icon-only, groups are always shown (no headers).
  const showItems = collapsed || open
  return (
    <div>
      {!collapsed && (
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="group flex w-full items-center justify-between rounded-lg px-2.5 pb-1.5 pt-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="eyebrow !text-[11px] opacity-80 transition-opacity group-hover:opacity-100">
            {group.label}
          </span>
          <ChevronDown
            size={13}
            className={cn(
              'shrink-0 opacity-50 transition-all duration-200 group-hover:opacity-90',
              !open && '-rotate-90',
            )}
          />
        </button>
      )}
      <nav
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          showItems ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
          {group.items.map((item, i) => (
            <NavLink
              key={i}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              muted={group.mutePlaceholders && item.href === '/'}
            />
          ))}
        </div>
      </nav>
    </div>
  )
}
