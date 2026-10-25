'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { Select } from '@base-ui/react/select'
import {
  Wallet,
  Search,
  Lightbulb,
  X,
  Link2,
  Plus,
  Inbox,
  FileText,
  Pencil,
  Trash2,
  AlertTriangle,
  CreditCard,
  Coins,
  Check,
  ChevronDown,
  Sparkles,
  RefreshCw,
  Clock,
  Zap,
  ChevronRight,
  ArrowUpDown,
  Landmark,
  TrendingUp,
  PiggyBank,
  Home,
  Users,
  Calculator,
  PencilLine,
  ListChecks,
} from 'lucide-react'
import { AccountsLogo } from '@/components/ui/logos'
import { useCurrency } from '@/context/CurrencyContext'
import { useAccounts } from '@/context/AccountsContext'
import { useGoals } from '@/context/GoalsContext'
import { formatAmount, formatUSD, formatINR } from '@/lib/currency'
import {
  netWorth,
  usdValue,
  isLiability,
  isSecurableAsset,
  isGoalFundingAccount,
  SECURABLE_ASSET_TYPES,
  loansSecuredBy,
  assetEquity,
  pficHoldings,
  TYPE_LABELS,
  RELATION_LABELS,
  ownershipLabel,
  type CoOwner,
  type Holding,
  type HoldingDetails,
  type Ownership,
  type OwnerRelation,
} from '@/lib/portfolio'
import { typeExpectedReturn } from '@/lib/allocation'
import {
  balancesFromEntry,
  detailSpec,
  entryAmount,
  entryCurrency,
  fromTypeChoice,
  mistypedFdScheme,
  typeChoice,
  typeChoiceLabel,
  typeChoicesFor,
  type TypeChoice,
} from '@/lib/account-details'
import { holdingChoice, retypeHolding } from '@/lib/quick-entry'
import { nameError, readAmount } from '@/lib/quick-entry'
import { ageInDays, freshnessOf, relativeAge, type Freshness } from '@/lib/freshness'
import { provenanceOf, CONFIDENCE_LABELS } from '@/lib/provenance'
import { rankStaleAccounts, rankPhrase, type RefreshSuggestion } from '@/lib/refresh-guidance'
import {
  categoryOf,
  sortHoldings,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  SORT_LABELS,
  type AccountCategory,
  type SortKey,
} from '@/lib/account-category'
import type { AccountType } from '@/types/accounts'
import { Card, CardHeader } from '@/components/ui/Card'
import { Donut } from '@/components/ui/charts'
import { Money } from '@/components/ui/Money'
import { Reveal } from '@/components/ui/Reveal'
import { AddAccountChooser } from '@/components/AddAccountChooser'
import { CasImportPanel } from '@/components/CasImportPanel'
import { AiAddDialog } from '@/components/copilot/AiAddPanel'
import { QuickEntry } from '@/components/accounts/QuickEntry'
import { AmountCell, TypeCell, cellCls, sheetCellCls } from '@/components/accounts/cells'
import { SearchParamsReader } from '@/components/SearchParamsReader'
import { ReconnectButton } from '@/components/ReconnectButton'
import { DebtSummaryCard } from '@/components/DebtSummary'
import { PrepayCalculator } from '@/components/PrepayCalculator'
import { cn } from '@/lib/utils'

type CountryFilter = 'all' | 'US' | 'IN'

const COUNTRY_META = {
  US: { flag: '🇺🇸', name: 'United States', color: 'var(--us)' },
  IN: { flag: '🇮🇳', name: 'India', color: 'var(--india)' },
} as const

export default function AccountsPage() {
  const { rate, mode } = useCurrency()
  const { holdings, loading, demo, hasLinked, addLinked, addManual, updateAccount, removeAccount, refresh, loadDemoData, exitDemo } =
    useAccounts()

  // Manual balance refresh — pulls live balances from linked banks via /api/plaid/sync.
  const [syncing, setSyncing] = useState(false)
  const [reauthNeeded, setReauthNeeded] = useState(false)
  async function handleRefresh() {
    if (syncing) return
    setSyncing(true)
    setReauthNeeded(false)
    try {
      const res = await fetch('/api/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate }),
      })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data.reauth) && data.reauth.length > 0) setReauthNeeded(true)
      await refresh()
    } catch (e) {
      console.error('Balance refresh failed:', e)
    } finally {
      setSyncing(false)
    }
  }

  // "Mark updated" — bump a manual account's lastSyncedAt to now (re-save as-is).
  const markUpdated = (h: Holding) => {
    if (h.id) updateAccount(h.id, { ...h, lastSyncedAt: new Date().toISOString() }, { confirmBalance: true })
  }

  // Sort key + collapsed category folders, both persisted so the layout sticks.
  const [sort, setSort] = useState<SortKey>('balance')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    try {
      const s = localStorage.getItem('nriwb:accounts-sort')
      if (s === 'balance' || s === 'name' || s === 'freshness') setSort(s)
      const c = localStorage.getItem('nriwb:accounts-collapsed')
      if (c) {
        const arr = JSON.parse(c)
        if (Array.isArray(arr)) setCollapsed(new Set(arr))
      }
    } catch {
      /* ignore */
    }
  }, [])
  // Only a choice made in the picker is remembered — a ?sort= deep link isn't.
  const chooseSort = useCallback((next: SortKey) => {
    setSort(next)
    try {
      localStorage.setItem('nriwb:accounts-sort', next)
    } catch {
      /* ignore */
    }
  }, [])
  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem('nriwb:accounts-collapsed', JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])
  const { goals } = useGoals()

  // accountId → name of the goal it funds, so each account shows where it's earmarked.
  const accountToGoal = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of goals) for (const id of g.linkedAccountIds ?? []) m.set(id, g.name)
    return m
  }, [goals])
  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)
  // Quick entry ("tell us what you have") replaces the sheet while it's open.
  const [entering, setEntering] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [draftCount, setDraftCount] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [justSaved, setJustSaved] = useState<{ ids: ReadonlySet<string>; count: number } | null>(null)
  const openEntry = useCallback(() => {
    setEntering(true)
    setConfirmLeave(false)
    window.scrollTo({ top: 0 })
  }, [])
  const leaveEntry = useCallback(
    (force = false) => {
      if (!force && draftCount > 0) {
        setConfirmLeave(true)
        return
      }
      setEntering(false)
      setConfirmLeave(false)
      setDraftCount(0)
    },
    [draftCount],
  )
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(null), 12000)
    return () => clearTimeout(t)
  }, [justSaved])
  const [importingCas, setImportingCas] = useState(false)
  const [editing, setEditing] = useState<Holding | null>(null)
  const [deleting, setDeleting] = useState<Holding | null>(null)
  const [prepayFor, setPrepayFor] = useState<Holding | null>(null)
  const [filter, setFilter] = useState<CountryFilter>('all')
  const [query, setQuery] = useState('')
  const [jurHover, setJurHover] = useState<number | null>(null) // 0 = US, 1 = India

  // Deep links (from Home "Needs attention", goal cards, the Copilot):
  //   ?focus=<id>   expand that row's folder, scroll to it, highlight it briefly
  //   ?country=IN   filter to one country       ?sort=stale  stalest first
  //   ?edit=<id>    open that account's edit dialog
  const [linkParams, setLinkParams] = useState<URLSearchParams | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  useEffect(() => {
    if (!linkParams || loading) return
    const country = linkParams.get('country')
    if (country === 'US' || country === 'IN') setFilter(country)
    if (linkParams.get('sort') === 'stale') setSort('freshness')
    const target = holdings.find((h) => h.id && h.id === linkParams.get('focus'))
    if (target?.id) {
      // Make sure the row is actually rendered: no hiding filter, folder open.
      setQuery('')
      if (country !== target.country) setFilter('all')
      const folder = `${target.country}:${categoryOf(target)}`
      setCollapsed((prev) => {
        if (!prev.has(folder)) return prev
        const next = new Set(prev)
        next.delete(folder)
        return next
      })
      setFocusedId(target.id)
    }
    // ?edit=<id> opens that account's edit dialog (e.g. "add the loan's rate").
    const toEdit = holdings.find((h) => h.id && h.id === linkParams.get('edit'))
    if (toEdit) setEditing(toEdit)
    if (linkParams.get('add') === '1') setEntering(true)
    if (linkParams.get('section') === 'debt') {
      requestAnimationFrame(() =>
        document.getElementById('debt-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    }
    setLinkParams(null) // handled — don't re-apply on every ledger change
  }, [linkParams, loading, holdings])
  useEffect(() => {
    if (!focusedId) return
    const raf = requestAnimationFrame(() =>
      document.getElementById(`acct-${focusedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
    const t = setTimeout(() => setFocusedId(null), 2000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [focusedId])

  const nw = netWorth(holdings, rate)
  // Highest-impact stale account to nudge the user to refresh first (age × size).
  const guidance = useMemo(() => rankStaleAccounts(holdings, rate), [holdings, rate])
  const usCount = holdings.filter((h) => h.country === 'US').length
  const inCount = holdings.filter((h) => h.country === 'IN').length
  const pfics = pficHoldings(holdings)

  // NRE/NRO optimizer
  const nro = holdings.filter((h) => h.country === 'IN' && h.accountType === 'nro')
  const nroInr = nro.reduce((s, h) => s + h.balanceInr, 0)
  const tdsSavingInr = Math.round(nroInr * 0.06 * 0.3) // ~6% interest taxed at 30% TDS

  // Filter + search
  const q = query.trim().toLowerCase()
  const visible = holdings.filter(
    (h) =>
      (filter === 'all' || h.country === filter) &&
      (q === '' ||
        h.nickname.toLowerCase().includes(q) ||
        h.institution.toLowerCase().includes(q) ||
        (TYPE_LABELS[h.accountType] ?? '').toLowerCase().includes(q)),
  )
  const groups = (['US', 'IN'] as const)
    .map((c) => ({ country: c, accounts: visible.filter((h) => h.country === c) }))
    .filter((g) => g.accounts.length > 0)

  const showInsights = (filter === 'all' || filter === 'IN') && (nro.length > 0 || pfics.length > 0)

  const tabs: { key: CountryFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: holdings.length },
    { key: 'US', label: '🇺🇸 US', count: usCount },
    { key: 'IN', label: '🇮🇳 India', count: inCount },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SearchParamsReader onParams={setLinkParams} />
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-[0_2px_8px_-3px_hsl(var(--shadow-color)/0.4)]">
            <AccountsLogo size={18} />
          </span>
          <div>
            <h1 className="font-serif text-[1.7rem] font-medium tracking-tight">
              {entering ? 'Add your accounts' : 'Accounts'}
            </h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              {entering
                ? 'Pick what you have in India and the US, fill in the amounts, and save them together.'
                : 'Everything you own and owe, across both countries'}
            </p>
          </div>
        </div>
        {entering ? (
          confirmLeave ? (
            <div role="alertdialog" aria-label="Discard unsaved accounts" className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">
                Discard {draftCount} unsaved line{draftCount === 1 ? '' : 's'}?
              </span>
              <button
                onClick={() => setConfirmLeave(false)}
                className="btn-ghost rounded-xl border border-border/70 px-3 py-2 font-medium"
              >
                Keep editing
              </button>
              <button
                onClick={() => leaveEntry(true)}
                className="rounded-xl bg-danger px-3 py-2 font-medium text-white hover:brightness-110"
              >
                Discard
              </button>
            </div>
          ) : (
            <button
              onClick={() => leaveEntry()}
              className="btn-ghost inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3.5 py-2 text-[13px] font-medium"
            >
              <X size={14} />
              {holdings.length ? 'Back to my accounts' : 'Close'}
            </button>
          )
        ) : (
          <button
            onClick={() => setChoosing(true)}
            className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium"
          >
            <Plus size={14} />
            Add account
          </button>
        )}
      </div>

      {demo && <DemoBanner onExit={exitDemo} />}

      {entering ? (
        <QuickEntry
          rate={rate}
          onSave={(list) => Promise.all(list.map((h) => addManual(h, { key: h.id })))}
          onDone={(saved) => {
            setEntering(false)
            setDraftCount(0)
            setFilter('all')
            setQuery('')
            setJustSaved({ ids: new Set(saved.flatMap((h) => (h.id ? [h.id] : []))), count: saved.length })
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          onMoreWays={() => setChoosing(true)}
          onDirtyChange={setDraftCount}
        />
      ) : loading ? (
        <LedgerSkeleton />
      ) : holdings.length === 0 ? (
        <EmptyLedger
          onAi={() => setAiOpen(true)}
          onManual={() => setAdding(true)}
          onSeveral={openEntry}
          onLinkOrImport={() => setChoosing(true)}
          onLoadDemo={loadDemoData}
        />
      ) : (
        <>
      {reauthNeeded && <ReauthBanner />}
      {justSaved && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-success/25 bg-success-muted/50 px-4 py-3 text-[13px] animate-fade-in"
        >
          <Check size={15} className="shrink-0 text-success" />
          <span>
            <span className="font-medium">
              Saved {justSaved.count} account{justSaved.count === 1 ? '' : 's'}.
            </span>{' '}
            <span className="text-muted-foreground">
              Your net worth is now{' '}
              <span className="font-semibold tabular-nums text-foreground">{formatUSD(nw.totalUsd)}</span>
              {' / '}
              <span className="font-semibold tabular-nums text-foreground">{formatINR(nw.totalUsd * rate)}</span>.
              They’re highlighted below; edit any cell to change a name, type or balance.
            </span>
          </span>
          <Link
            href="/accounts"
            onClick={() => document.getElementById('accounts-ledger')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="ml-auto font-semibold text-brand underline underline-offset-2"
          >
            View in Accounts
          </Link>
        </div>
      )}
      {/* ── Summary strip — three quiet figures + the split, one card ──── */}
      <Reveal delay={0.04}>
        <Card className="p-0 sm:p-0">
          {/* Assets − Less debt = Net worth — three explicit, equally-weighted figures */}
          <div className="grid grid-cols-3 divide-x divide-border/60">
            <EquationCell label="Assets" usd={nw.assetsUsd} />
            <EquationCell label="Less debt" usd={nw.liabilitiesUsd} op="−" tone="debt" />
            <EquationCell
              label="Net worth"
              usd={nw.totalUsd}
              op="="
              emphasis
              sub={`${holdings.length} account${holdings.length === 1 ? '' : 's'}`}
            />
          </div>

          {/* Cross-border split — the same net worth, seen by jurisdiction */}
          <div className="grid divide-y divide-border/60 border-t border-border/60 sm:grid-cols-[9rem_1fr_1fr] sm:divide-x sm:divide-y-0">
            <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-5">
              <Donut
                size={72}
                thickness={9}
                segments={[
                  { value: nw.usUsd, color: 'var(--us)' },
                  { value: nw.inUsd, color: 'var(--india)' },
                ]}
                activeIndex={jurHover}
                onHover={setJurHover}
              >
                {jurHover !== null ? (
                  <span
                    key={jurHover}
                    className="animate-fade-in tabular-nums text-[12px] font-bold tabular-nums"
                    style={{ color: jurHover === 0 ? 'var(--us)' : 'var(--india)' }}
                  >
                    {jurHover === 0 ? nw.usPct : nw.inPct}%
                  </span>
                ) : (
                  <span key="split" className="animate-fade-in tabular-nums text-[11px] font-bold tabular-nums text-muted-foreground">
                    {nw.usPct}/{nw.inPct}
                  </span>
                )}
              </Donut>
              <span className="text-[11px] font-medium text-muted-foreground">US / India</span>
            </div>
          <SummaryCell
            label="🇺🇸 United States"
            usd={nw.usUsd}
            sub={`${usCount} accounts · ${nw.usPct}%`}
            color="var(--us)"
            pct={nw.usPct}
            active={jurHover === 0}
            onEnter={() => setJurHover(0)}
            onLeave={() => setJurHover(null)}
          />
          <SummaryCell
            label="🇮🇳 India"
            usd={nw.inUsd}
            sub={`${inCount} accounts · ${nw.inPct}%`}
            color="var(--india)"
            pct={nw.inPct}
            active={jurHover === 1}
            onEnter={() => setJurHover(1)}
            onLeave={() => setJurHover(null)}
          />
          </div>
        </Card>
      </Reveal>

      {/* ── Toolbar: tabs + search ────────────────────────────────────── */}
      <Reveal delay={0.08} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-xl border border-border/70 bg-muted/60 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all duration-150',
                filter === t.key
                  ? 'bg-card text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px tabular-nums text-[10px] font-semibold tabular-nums',
                  filter === t.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <ArrowUpDown size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => chooseSort(e.target.value as SortKey)}
              aria-label="Sort accounts"
              className="h-9 cursor-pointer appearance-none rounded-xl border border-border/70 bg-card pl-7 pr-7 text-[13px] font-medium outline-none transition-colors hover:bg-accent/40 focus:border-brand/60"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
          {!demo && hasLinked && (
            <button
              onClick={handleRefresh}
              disabled={syncing}
              title="Pull the latest balances from your linked banks"
              className="btn-ghost inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-[13px] font-medium disabled:opacity-60"
            >
              <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
              {syncing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts…"
              className="h-9 w-56 rounded-xl border border-input bg-card pl-8.5 pr-3 text-[13px] shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand/60 focus:ring-[3px] focus:ring-brand/12 sm:w-64"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </Reveal>

      {/* ── Ledger + side rail ────────────────────────────────────────── */}
      <Reveal delay={0.12} className="grid items-start gap-6 2xl:grid-cols-[1fr_320px]">
        {/* Ledger */}
        <div id="accounts-ledger" className="flex min-w-0 scroll-mt-24 flex-col gap-6">
          {groups.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 py-14 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Inbox size={20} />
              </span>
              <p className="mt-1 text-sm font-medium">No accounts match “{query}”</p>
              <p className="text-[13px] text-muted-foreground">Try a different name, bank, or account type.</p>
            </Card>
          ) : (
            groups.map((g) => (
              <AccountGroup
                key={g.country}
                country={g.country}
                accounts={g.accounts}
                rate={rate}
                grandTotalUsd={nw.totalUsd}
                accountToGoal={accountToGoal}
                sort={sort}
                collapsed={collapsed}
                focusedId={focusedId}
                highlightIds={justSaved?.ids}
                onToggleCollapse={toggleCollapse}
                onUpdate={updateAccount}
                onEdit={setEditing}
                onDelete={setDeleting}
                onMarkUpdated={demo ? undefined : markUpdated}
                onReconnected={refresh}
                onPrepay={setPrepayFor}
              />
            ))
          )}
        </div>

        {/* Side rail — insights & intake, nothing else. Beside the sheet only when there's room for both. */}
        <div className="grid items-start gap-6 md:grid-cols-2 2xl:grid-cols-1">
          <DebtSummaryCard holdings={holdings} rate={rate} />
          {!demo && guidance.top && (
            <RefreshGuidanceCard
              top={guidance.top}
              syncing={syncing}
              onRefresh={handleRefresh}
              onEdit={() => setEditing(guidance.top!.holding)}
            />
          )}
          {showInsights && (
            <Card>
              <CardHeader title="Insights" subtitle="Ways to save & stay compliant" icon={<Lightbulb size={15} />} />
              <div className="flex flex-col gap-4">
                {nro.length > 0 && (
                  <InsightItem
                    icon={<Lightbulb size={14} />}
                    tone="warning"
                    title="Move NRO savings to NRE"
                  >
                    <span className="font-medium text-foreground">{formatINR(nroInr)}</span> in NRO earns interest
                    taxed at ~30% TDS. NRE interest is tax-free and repatriable — about{' '}
                    <span className="font-semibold text-success">{formatINR(tdsSavingInr)}/yr</span>
                    {mode === 'usd' ? ` (${formatUSD(tdsSavingInr / rate)})` : ''} saved.
                  </InsightItem>
                )}
                {pfics.length > 0 && (
                  <InsightItem
                    icon={<FileText size={14} />}
                    tone="danger"
                    title={`${pfics.length} PFIC filing${pfics.length > 1 ? 's' : ''} due`}
                  >
                    India mutual funds are PFICs under US tax law — each needs{' '}
                    <span className="font-medium text-foreground">Form 8621</span>. Ask Copilot about QEF vs
                    mark-to-market.
                  </InsightItem>
                )}
              </div>
            </Card>
          )}
        </div>
      </Reveal>
        </>
      )}

      {choosing && (
        <AddAccountChooser
          fxRate={rate}
          onLinked={addLinked}
          onManual={() => setAdding(true)}
          onImportCas={() => setImportingCas(true)}
          onAddSeveral={openEntry}
          onAddWithAi={() => setAiOpen(true)}
          onClose={() => setChoosing(false)}
        />
      )}
      {/* Always mounted, so a conversation survives closing and reopening the panel. */}
      <AiAddDialog open={aiOpen} onClose={() => setAiOpen(false)} />
      {importingCas && (
        <CasImportPanel onClose={() => setImportingCas(false)} onManual={() => setAdding(true)} />
      )}
      {adding && (
        <AccountDialog
          rate={rate}
          holdings={holdings}
          updateAccount={updateAccount}
          onClose={() => setAdding(false)}
          onSave={addManual}
        />
      )}
      {editing && (
        <AccountDialog
          rate={rate}
          holdings={holdings}
          updateAccount={updateAccount}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(h) => {
            if (editing.id) updateAccount(editing.id, h)
            setEditing(null)
          }}
        />
      )}
      {prepayFor && (
        <PrepayCalculator
          loan={prepayFor}
          holdings={holdings}
          rate={rate}
          onClose={() => setPrepayFor(null)}
          onEditLoan={() => {
            setEditing(prepayFor)
            setPrepayFor(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          account={deleting}
          rate={rate}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            if (deleting.id) removeAccount(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

/* ── Loading / empty / demo states ─────────────────────────────────────────── */

function LedgerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="h-28 animate-pulse bg-muted/40" />
      <Card className="h-64 animate-pulse bg-muted/40" />
    </div>
  )
}

/** Shown when the user has no accounts yet — the ways to add them, up front, or demo data. */
function EmptyLedger({
  onAi,
  onManual,
  onSeveral,
  onLinkOrImport,
  onLoadDemo,
}: {
  onAi: () => void
  onManual: () => void
  onSeveral: () => void
  onLinkOrImport: () => void
  onLoadDemo: () => void
}) {
  const ways = [
    {
      key: 'ai',
      icon: <Sparkles size={18} className="text-white" />,
      chip: 'ai-chip',
      title: 'Add with AI',
      text: 'Describe it — “my ICICI NRE FD, ₹40L at 7%” — and check what it fills in.',
      onClick: onAi,
    },
    {
      key: 'manual',
      icon: <PencilLine size={18} />,
      chip: 'bg-brand/10 text-brand ring-1 ring-brand/20',
      title: 'Add manually',
      text: 'Fill in one account with every detail: rate, maturity, ownership.',
      onClick: onManual,
    },
    {
      key: 'several',
      icon: <ListChecks size={18} />,
      chip: 'bg-brand/10 text-brand ring-1 ring-brand/20',
      title: 'Add several at once',
      text: 'Tick what you have from a checklist, type the amounts, save them together.',
      onClick: onSeveral,
    },
  ]
  return (
    <Reveal delay={0.04}>
      <Card className="flex flex-col items-center gap-5 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
          <Wallet size={22} />
        </span>
        <div>
          <h2 className="font-serif text-lg font-medium tracking-tight">Start your ledger</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Add what you own and owe — US or India — and everything else (net worth, allocation,
            compliance) builds from it.
          </p>
        </div>
        <div className="grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
          {ways.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={w.onClick}
              className={cn(
                'group flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand/45 hover:shadow-[0_8px_24px_-12px_hsl(var(--shadow-color)/0.35)]',
                w.key === 'ai' && 'ai-ring',
              )}
            >
              <span className={cn('flex size-9 items-center justify-center rounded-xl', w.chip)}>{w.icon}</span>
              <span className="flex items-center gap-1 text-[14px] font-semibold">
                {w.title}
                <ChevronRight
                  size={15}
                  className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </span>
              <span className="text-[12.5px] leading-snug text-muted-foreground">{w.text}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={onLinkOrImport}
            className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium"
          >
            <Link2 size={14} />
            Link a US bank or import a CAS statement
          </button>
          <button
            onClick={onLoadDemo}
            className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium"
          >
            <Sparkles size={14} />
            Load demo data
          </button>
        </div>
        <p className="-mt-2 text-[11px] text-muted-foreground/70">
          Demo data is a sample portfolio — it’s never saved to your account.
        </p>
      </Card>
    </Reveal>
  )
}

/** Shown after a sync when one or more linked banks need to be reconnected. */
function ReauthBanner() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/25 bg-warning-muted/40 px-4 py-3 text-[13px] animate-fade-in">
      <AlertTriangle size={15} className="shrink-0 text-warning" />
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">A bank needs reconnecting.</span> Its login expired, so those
        balances couldn’t refresh — reconnect it to resume syncing.
      </span>
    </div>
  )
}

/** Persistent banner while demo data is active, with a one-click exit back to real data. */
function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3 animate-fade-in">
      <p className="flex items-center gap-2 text-[13px] text-foreground">
        <Sparkles size={15} className="shrink-0 text-brand" />
        <span>
          <span className="font-medium">Viewing demo data</span> — a sample portfolio, not saved to your account.
        </span>
      </p>
      <button
        onClick={onExit}
        className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium"
      >
        <X size={13} />
        Exit demo
      </button>
    </div>
  )
}

/* ── Freshness indicators ──────────────────────────────────────────────────── */

/** Per-row age chip. Plaid rows read as auto-synced (⚡); manual rows as user-updated (●). */
function FreshnessPill({
  days,
  fresh,
  source,
}: {
  days: number | null
  fresh: Freshness
  source: Holding['source']
}) {
  if (days === null) return null
  const auto = source !== 'manual'
  const verb = auto ? 'Synced' : 'Updated'
  const tone = fresh === 'stale' ? 'text-warning' : fresh === 'aging' ? 'text-muted-foreground' : 'text-success'
  const dot = fresh === 'stale' ? 'bg-warning' : fresh === 'aging' ? 'bg-muted-foreground/50' : 'bg-success'
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-medium', tone)}
      title={`${verb} ${relativeAge(days)}${days > 0 ? ' ago' : ''}${auto ? ' · auto via Plaid' : ''}`}
    >
      {auto ? (
        <Zap size={10} className="shrink-0" />
      ) : (
        <span className={cn('size-1.5 shrink-0 rounded-full', dot)} />
      )}
      {relativeAge(days)}
    </span>
  )
}

/** Group-header rollup: "All live" when every synced row is fresh, else "N stale". */
function FreshnessSummary({ accounts }: { accounts: Holding[] }) {
  const known = accounts.filter((h) => h.lastSyncedAt)
  if (known.length === 0) return null
  const stale = known.filter((h) => freshnessOf(ageInDays(h.lastSyncedAt)) === 'stale').length
  if (stale === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-muted/70 px-2 py-0.5 text-[10.5px] font-semibold text-success ring-1 ring-success/20">
        <span className="size-1.5 rounded-full bg-success" />
        All live
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-muted/70 px-2 py-0.5 text-[10.5px] font-semibold text-warning ring-1 ring-warning/20">
      <AlertTriangle size={10} />
      {stale} stale
    </span>
  )
}

/** Nudge card: the single stale account whose refresh moves net worth most. */
function RefreshGuidanceCard({
  top,
  syncing,
  onRefresh,
  onEdit,
}: {
  top: RefreshSuggestion
  syncing: boolean
  onRefresh: () => void
  onEdit: () => void
}) {
  const h = top.holding
  const auto = h.source !== 'manual'
  return (
    <Card>
      <CardHeader title="Refresh first" subtitle="Your highest-impact stale account" icon={<Clock size={15} />} />
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Your <span className="font-medium text-foreground">{h.nickname}</span> is the{' '}
        <span className="font-medium text-foreground">{rankPhrase(top.ageRank, 'oldest')}</span> and{' '}
        <span className="font-medium text-foreground">{rankPhrase(top.sizeRank, 'largest')}</span> account, last{' '}
        {auto ? 'synced' : 'updated'}{' '}
        <span className="font-medium text-foreground">{relativeAge(top.days)} ago</span>. Refreshing it moves your net
        worth most.
      </p>
      <button
        onClick={auto ? onRefresh : onEdit}
        disabled={auto && syncing}
        className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium disabled:opacity-60"
      >
        {auto ? (
          <>
            <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
            {syncing ? 'Refreshing…' : 'Refresh now'}
          </>
        ) : (
          <>
            <Pencil size={13} />
            Update balance
          </>
        )}
      </button>
    </Card>
  )
}

/* ── Summary strip cells ───────────────────────────────────────────────────── */

/**
 * One figure of the Assets − Less debt = Net worth equation. Debt always renders
 * (even $0), tinted only when there's debt; the operator sits on the divider.
 */
function EquationCell({
  label,
  usd,
  op,
  tone,
  emphasis,
  sub,
}: {
  label: string
  usd: number
  op?: string
  tone?: 'debt'
  emphasis?: boolean
  sub?: string
}) {
  return (
    <div className="relative px-3 py-5 text-center sm:px-6">
      {op && (
        <span className="absolute left-0 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-card px-1 text-base font-light text-muted-foreground sm:block">
          {op}
        </span>
      )}
      <p className="text-[12px] font-medium text-muted-foreground sm:text-[13px]">{label}</p>
      <Money
        usd={usd}
        className={cn(
          'mt-1.5 block tabular-nums font-semibold leading-none tracking-tight tabular-nums',
          emphasis ? 'text-[1.35rem] sm:text-[1.9rem]' : 'text-[1.1rem] sm:text-[1.5rem]',
          tone === 'debt' && usd > 0 && 'text-danger',
        )}
      />
      {sub && <p className="mt-2 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function SummaryCell({
  label,
  usd,
  sub,
  color,
  pct,
  active,
  onEnter,
  onLeave,
}: {
  label: string
  usd: number
  sub: string
  color?: string
  pct?: number
  active?: boolean
  onEnter?: () => void
  onLeave?: () => void
}) {
  return (
    <div
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={cn('px-6 py-5 transition-colors duration-200', onEnter && 'cursor-pointer', active && 'bg-accent/40')}
    >
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <Money usd={usd} className="mt-1.5 block tabular-nums text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums" />
      <div className="mt-2 flex items-center gap-2">
        {color !== undefined && pct !== undefined && (
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: color,
                boxShadow: active ? `0 0 8px color-mix(in oklch, ${color} 70%, transparent)` : undefined,
              }}
            />
          </span>
        )}
        <p className="text-[13px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

/* ── Insight item ──────────────────────────────────────────────────────────── */

const INSIGHT_TONE = {
  warning: 'bg-warning-muted/80 text-warning ring-warning/20',
  danger: 'bg-danger-muted/80 text-danger ring-danger/20',
} as const

function InsightItem({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode
  tone: keyof typeof INSIGHT_TONE
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1', INSIGHT_TONE[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

/* ── Account group (country ledger) ────────────────────────────────────────── */

const CATEGORY_ICONS: Record<AccountCategory, React.ReactNode> = {
  banking: <Landmark size={14} />,
  investments: <TrendingUp size={14} />,
  retirement: <PiggyBank size={14} />,
  real_estate: <Home size={14} />,
  liabilities: <CreditCard size={14} />,
  other: <Coins size={14} />,
}

/**
 * Secured-loan context as an inline note, now that category folders replace the
 * old nested layout: an asset shows its equity-after-loans; a loan shows what it's
 * secured against.
 */
function securedNote(
  a: Holding,
  accounts: Holding[],
  rate: number,
  money: (usd: number) => string,
): string | undefined {
  if (!isLiability(a)) {
    if (a.id && loansSecuredBy(a.id, accounts).length > 0) {
      return `${money(assetEquity(a, accounts, rate))} equity`
    }
    return undefined
  }
  if (a.securedAgainstId) {
    const asset = accounts.find((x) => x.id === a.securedAgainstId)
    if (asset) return `secured by ${asset.nickname}`
  }
  return undefined
}

function AccountGroup({
  country,
  accounts,
  rate,
  grandTotalUsd,
  accountToGoal,
  sort,
  collapsed,
  focusedId,
  highlightIds,
  onToggleCollapse,
  onUpdate,
  onEdit,
  onDelete,
  onMarkUpdated,
  onReconnected,
  onPrepay,
}: {
  country: 'US' | 'IN'
  accounts: Holding[]
  rate: number
  grandTotalUsd: number
  /** accountId → name of the goal it funds (shown as a tag on the row). */
  accountToGoal: Map<string, string>
  sort: SortKey
  /** Set of collapsed folder keys ("US:banking"). */
  collapsed: ReadonlySet<string>
  /** Row to scroll to and highlight (from a ?focus= deep link). */
  focusedId: string | null
  /** Rows just added through quick entry, tinted for a moment. */
  highlightIds?: ReadonlySet<string>
  onToggleCollapse: (key: string) => void
  /** Save an inline edit (name, type or balance). */
  onUpdate: (id: string, h: Holding) => void
  /** Opens the full edit dialog (rates, maturity, ownership, links). */
  onEdit: (h: Holding) => void
  onDelete: (h: Holding) => void
  /** When set, manual rows can be marked freshly-updated. Omitted in demo mode. */
  onMarkUpdated?: (h: Holding) => void
  /** Called after a Reconnect finishes, to reload the ledger. */
  onReconnected: () => void
  /** Opens the prepay-vs-invest calculator for a loan. */
  onPrepay: (h: Holding) => void
}) {
  // Every figure in the card follows the currency view (USD / ₹ / lakhs-crore).
  const { mode } = useCurrency()
  const money = (usd: number) => formatAmount(usd, mode, rate)
  const { flag, name, color } = COUNTRY_META[country]
  const total = accounts.reduce((s, h) => s + usdValue(h, rate), 0)
  const share = grandTotalUsd > 0 ? Math.round((total / grandTotalUsd) * 100) : 0
  const assetsUsd = accounts.filter((h) => !isLiability(h)).reduce((s, h) => s + usdValue(h, rate), 0)
  const debtUsd = -accounts.filter(isLiability).reduce((s, h) => s + usdValue(h, rate), 0)
  // Group into category folders (Banking / Investments / … / Liabilities), each
  // sorted by the chosen key. Empty categories are dropped.
  const folders = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        rows: sortHoldings(
          accounts.filter((a) => categoryOf(a) === category),
          sort,
          rate,
        ),
      })).filter((f) => f.rows.length > 0),
    [accounts, sort, rate],
  )

  return (
    // A container, so the sheet lays out by its own width (sidebar and rail vary), not the window's.
    <Card className="@container overflow-hidden p-0 sm:p-0">
      {/* Group header */}
      <div
        className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5"
        style={{ background: `linear-gradient(90deg, color-mix(in oklch, ${color} 5%, var(--card)), var(--card) 65%)` }}
      >
        <span
          className="flex size-8 items-center justify-center rounded-xl text-base"
          style={{
            background: `color-mix(in oklch, ${color} 10%, var(--card))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 18%, transparent)`,
          }}
        >
          {flag}
        </span>
        <h2 className="text-[15px] font-semibold">{name}</h2>
        <span
          className="rounded-full px-2 py-0.5 tabular-nums text-[11px] font-bold tabular-nums"
          style={{ background: `color-mix(in oklch, ${color} 13%, transparent)`, color }}
        >
          {accounts.length}
        </span>
        <FreshnessSummary accounts={accounts} />
        <span className="ml-auto hidden text-[12px] text-muted-foreground @lg:inline">{share}% of net worth</span>
        <Money usd={total} className="ml-auto tabular-nums text-[15px] font-semibold tabular-nums @lg:ml-0" />
      </div>

      {/* Column heads — the sheet's columns, on wide screens */}
      <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.95fr)_7rem] items-center gap-3 border-b border-border/60 bg-muted/25 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground @2xl:grid">
        <span className="pl-11">Account</span>
        <span className="pl-3">Type</span>
        <span className="pr-3 text-right">Balance</span>
        <span className="sr-only">Actions</span>
      </div>

      {/* Category folders — collapsible, sorted, scale to 30+ rows */}
      <div>
        {folders.map(({ category, rows }) => {
          const key = `${country}:${category}`
          const open = !collapsed.has(key)
          const subtotal = rows.reduce((s, a) => s + usdValue(a, rate), 0)
          return (
            <div key={category} className="border-b border-border/40 last:border-b-0">
              <button
                onClick={() => onToggleCollapse(key)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 bg-muted/20 px-5 py-2.5 text-left transition-colors hover:bg-accent/30"
              >
                <ChevronRight
                  size={14}
                  className={cn('shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-90')}
                />
                <span className="flex size-5 items-center justify-center text-muted-foreground">
                  {CATEGORY_ICONS[category]}
                </span>
                <span className="text-[13px] font-semibold">{CATEGORY_LABELS[category]}</span>
                <span className="rounded-full bg-muted px-1.5 py-px tabular-nums text-[10px] font-bold tabular-nums text-muted-foreground">
                  {rows.length}
                </span>
                <Money usd={subtotal} className="ml-auto tabular-nums text-[13px] font-semibold tabular-nums" />
              </button>
              {open && (
                <div className="divide-y divide-border/40">
                  {rows.map((a) => (
                    <AccountRow
                      key={a.id ?? a.nickname}
                      a={a}
                      color={color}
                      rate={rate}
                      accountToGoal={accountToGoal}
                      note={securedNote(a, accounts, rate, money)}
                      focused={!!a.id && (a.id === focusedId || !!highlightIds?.has(a.id))}
                      onUpdate={onUpdate}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onMarkUpdated={onMarkUpdated}
                      onReconnected={onReconnected}
                      onPrepay={onPrepay}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reconciliation — assets − debt = this country's net worth */}
      {debtUsd > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 border-t border-border/60 bg-muted/25 px-5 py-2.5 text-[12px] text-muted-foreground">
          <span className="tabular-nums">{money(assetsUsd)} assets</span>
          <span>−</span>
          <span className="tabular-nums text-danger">{money(debtUsd)} debt</span>
          <span>=</span>
          <span className="tabular-nums font-semibold text-foreground">{money(total)} net worth</span>
        </div>
      )}
    </Card>
  )
}

/**
 * One account as a sheet row: account · type · balance · actions. Name, type and
 * balance are edited in place and saved when the cell is left; rates, maturity,
 * ownership and loan links live in the full edit dialog. A linked (Plaid)
 * balance is read-only: the bank sync sets it.
 */
function AccountRow({
  a,
  color,
  rate,
  accountToGoal,
  note,
  focused = false,
  onUpdate,
  onEdit,
  onDelete,
  onMarkUpdated,
  onReconnected,
  onPrepay,
}: {
  a: Holding
  color: string
  rate: number
  accountToGoal: Map<string, string>
  /** Optional trailing note on the meta line (e.g. equity / "secured by …"). */
  note?: string
  /** Briefly highlighted after a deep link lands on it, or right after it was added. */
  focused?: boolean
  onUpdate: (id: string, h: Holding) => void
  onEdit: (h: Holding) => void
  onDelete: (h: Holding) => void
  onMarkUpdated?: (h: Holding) => void
  onReconnected?: () => void
  onPrepay?: (h: Holding) => void
}) {
  const { mode } = useCurrency()
  const days = ageInDays(a.lastSyncedAt)
  const fresh = freshnessOf(days)
  const canMark = !!onMarkUpdated && a.source === 'manual'
  const liability = isLiability(a)
  const cur = entryCurrency(a.country, a.accountType)
  const linked = a.source !== 'manual'
  const [name, setName] = useState(a.nickname)
  useEffect(() => setName(a.nickname), [a.nickname])

  const choice = holdingChoice(a)
  const options = useMemo(() => {
    const list = typeChoicesFor(a.country, liability ? 'liability' : 'asset')
    return list.includes(choice) ? list : [choice, ...list]
  }, [a.country, liability, choice])

  const save = (next: Holding) => {
    if (a.id) onUpdate(a.id, next)
  }
  // The view currency differs from the account's own — show what it's worth in the view too.
  const showConverted = (mode === 'usd') !== (cur === 'USD')
  const details = detailSummary(a.details)

  return (
    <div
      id={a.id ? `acct-${a.id}` : undefined}
      className={cn(
        'group grid scroll-mt-24 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 px-4 py-2.5 transition-colors duration-500 hover:bg-accent/25 @2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.95fr)_7rem] @2xl:items-center @2xl:gap-3',
        // Colour stale rows so they stand out from fresh ones at a glance.
        fresh === 'stale' && 'bg-warning-muted/20',
        focused && 'bg-brand/10 ring-2 ring-inset ring-brand/40',
      )}
    >
      {/* Account: name (editable) + where it is and what's attached to it */}
      <div className="flex min-w-0 items-start gap-2.5">
        <Monogram institution={a.institution} color={color} />
        <div className="min-w-0 flex-1">
          <input
            value={name}
            maxLength={120}
            aria-label={`Name of ${a.nickname}`}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const t = name.trim()
              if (!t) setName(a.nickname)
              else if (t !== a.nickname) save({ ...a, nickname: t })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setName(a.nickname)
            }}
            className={cn(cellCls, sheetCellCls, '-ml-2 h-8 px-2 text-[14.5px] font-medium')}
          />
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted-foreground">
            <span className="truncate">
              {a.institution}
              {details ? ` · ${details}` : ''}
              {note ? ` · ${note}` : ''}
            </span>
            {a.isPfic && (
              <span className="shrink-0 rounded bg-warning/12 px-1 py-px text-[10px] font-bold uppercase text-warning ring-1 ring-warning/20">
                PFIC
              </span>
            )}
            <ProvenanceBadge holding={a} />
            {ownershipLabel(a) && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded bg-accent px-1.5 py-px text-[10.5px] font-medium text-accent-foreground/80 ring-1 ring-border/60"
                title={a.ownership === 'family' ? `Held in ${ownershipLabel(a)}’s name` : `Jointly held: ${ownershipLabel(a)}`}
              >
                <Users size={10} />
                {ownershipLabel(a)}
              </span>
            )}
            {a.id && accountToGoal.has(a.id) && isGoalFundingAccount(a) && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded bg-brand/10 px-1.5 py-px text-[10.5px] font-medium text-brand"
                title={`Funds your “${accountToGoal.get(a.id)}” goal`}
              >
                <Link2 size={10} />
                {accountToGoal.get(a.id)}
              </span>
            )}
            <FreshnessPill days={days} fresh={fresh} source={a.source} />
            {a.needsReauth && a.plaidItemId && (
              <ReconnectButton itemId={a.plaidItemId} rate={rate} onDone={onReconnected ?? (() => {})} />
            )}
          </p>
        </div>
      </div>

      <div className="col-span-2 grid grid-cols-2 gap-2 pl-[2.875rem] @2xl:contents">
        {/* Type */}
        <TypeCell
          value={choice}
          options={options}
          label={`Type of ${a.nickname}`}
          onChange={(t) => {
            if (t && t !== choice) save(retypeHolding(a, t))
          }}
          className={cn(sheetCellCls, 'h-9 text-[13.5px]')}
        />

        {/* Balance — in the account's own currency; its value in the chosen view below */}
        <div className="min-w-0 text-right">
          <AmountCell
            value={Math.round(entryAmount(a, rate) * 100) / 100}
            currency={cur}
            allowBlank={false}
            readOnly={linked}
            title={linked ? 'Synced from your bank — it refreshes on its own' : undefined}
            label={`${liability ? 'Amount owed on' : 'Balance of'} ${a.nickname}`}
            onCommit={(n) => {
              if (n != null) save({ ...a, ...balancesFromEntry(a.country, a.accountType, n, rate) })
            }}
            inlineSymbol
            className={cn(sheetCellCls, 'h-9 font-semibold', liability && 'text-danger')}
          />
          {showConverted && (
            <p className="mt-0.5 pr-3 text-[11px] tabular-nums text-muted-foreground">
              ≈ {liability ? '−' : ''}
              {formatAmount(Math.abs(usdValue(a, rate)), mode, rate)}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="col-start-2 row-start-1 flex items-center justify-end gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 @2xl:col-start-auto @2xl:row-start-auto @2xl:opacity-0 @2xl:group-hover:opacity-100">
        {onPrepay && liability && (
          <button
            onClick={() => onPrepay(a)}
            aria-label={`Prepay or invest: ${a.nickname}`}
            title="Prepay this loan or invest?"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Calculator size={13} />
          </button>
        )}
        {canMark && (
          <button
            onClick={() => onMarkUpdated!(a)}
            aria-label={`Mark ${a.nickname} updated`}
            title="Mark as updated today"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Clock size={13} />
          </button>
        )}
        <button
          onClick={() => onEdit(a)}
          aria-label={`Edit ${a.nickname}`}
          title="All details: rates, maturity, ownership, loans"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(a)}
          aria-label={`Delete ${a.nickname}`}
          title="Delete"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-muted hover:text-danger"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function Monogram({ institution, color }: { institution: string; color: string }) {
  const initials = institution
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold transition-transform group-hover:scale-105"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${color} 14%, var(--card)), color-mix(in oklch, ${color} 7%, var(--card)))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 22%, transparent)`,
        color,
      }}
    >
      {initials}
    </span>
  )
}

/**
 * Provenance + confidence badge on every row — where the number came from and how
 * much to trust it. Colour tracks confidence (green/neutral/amber), consistent with
 * the freshness pill; estimates carry a warning icon.
 */
function ProvenanceBadge({ holding }: { holding: Holding }) {
  const p = provenanceOf(holding)
  const styles: Record<typeof p.confidence, string> = {
    high: 'bg-success-muted/60 text-success ring-success/20',
    medium: 'bg-accent text-accent-foreground/80 ring-border/60',
    low: 'bg-warning-muted/70 text-warning ring-warning/20',
  }
  return (
    <span
      title={`${p.label} · ${CONFIDENCE_LABELS[p.confidence]}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium uppercase tracking-wide ring-1',
        styles[p.confidence],
      )}
    >
      {p.confidence === 'low' && <AlertTriangle size={9} className="shrink-0" />}
      {p.label}
    </span>
  )
}

/* ── Add / edit account dialog ─────────────────────────────────────────────── */

/** First type to default to for a given country + asset/liability kind. */
function firstType(country: 'US' | 'IN', kind: 'asset' | 'liability'): AccountType {
  if (kind === 'liability') return country === 'US' ? 'mortgage' : 'home_loan'
  return country === 'US' ? 'checking' : 'nre'
}

/** Polished account-type dropdown — portals out so it's never clipped by the modal. */
function TypeSelect({
  value,
  options,
  onChange,
  liability,
}: {
  value: TypeChoice
  options: TypeChoice[]
  onChange: (t: TypeChoice) => void
  liability: boolean
}) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as TypeChoice)}>
      <Select.Trigger
        className={cn(
          inputCls,
          'flex items-center justify-between gap-2 text-left data-[popup-open]:border-brand data-[popup-open]:bg-card data-[popup-open]:ring-[3px] data-[popup-open]:ring-brand/12',
        )}
      >
        <Select.Value>{(v) => typeChoiceLabel(v as TypeChoice)}</Select.Value>
        <Select.Icon className="shrink-0 text-muted-foreground transition-transform duration-200 data-[popup-open]:rotate-180">
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50 outline-none">
          <Select.Popup className="max-h-72 w-[var(--anchor-width)] origin-top overflow-y-auto overscroll-contain rounded-xl border border-border/80 bg-card p-1 shadow-[0_14px_44px_-14px_hsl(var(--shadow-color)/0.5)] outline-none animate-scale-in">
            {options.map((t) => (
              <Select.Item
                key={t}
                value={t}
                className={cn(
                  'flex cursor-pointer select-none items-center justify-between rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors',
                  liability
                    ? 'data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger data-[selected]:bg-danger/10 data-[selected]:font-medium data-[selected]:text-danger'
                    : 'data-[highlighted]:bg-success/10 data-[highlighted]:text-success data-[selected]:bg-success/10 data-[selected]:font-medium data-[selected]:text-success',
                )}
              >
                <Select.ItemText>{typeChoiceLabel(t)}</Select.ItemText>
                <Select.ItemIndicator className="shrink-0">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

/** "Secured against" picker for a loan — lists securable assets, plus "Not secured". */
function AssetSelect({
  value,
  assets,
  onChange,
}: {
  value: string | undefined
  assets: Holding[]
  onChange: (id: string | undefined) => void
}) {
  return (
    <Select.Root value={value ?? ''} onValueChange={(v) => onChange((v as string) || undefined)}>
      <Select.Trigger
        className={cn(
          inputCls,
          'flex items-center justify-between gap-2 text-left data-[popup-open]:border-brand data-[popup-open]:bg-card data-[popup-open]:ring-[3px] data-[popup-open]:ring-brand/12',
        )}
      >
        <Select.Value>{(v) => assets.find((a) => a.id === v)?.nickname ?? 'Not secured'}</Select.Value>
        <Select.Icon className="shrink-0 text-muted-foreground transition-transform duration-200 data-[popup-open]:rotate-180">
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50 outline-none">
          <Select.Popup className="max-h-72 w-[var(--anchor-width)] overflow-y-auto overscroll-contain rounded-xl border border-border/80 bg-card p-1 shadow-[0_14px_44px_-14px_hsl(var(--shadow-color)/0.5)] outline-none animate-scale-in">
            {[null, ...assets].map((a) => (
              <Select.Item
                key={a?.id ?? '__none'}
                value={a?.id ?? ''}
                className="flex cursor-pointer select-none items-center justify-between rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger data-[selected]:bg-danger/10 data-[selected]:font-medium data-[selected]:text-danger"
              >
                <Select.ItemText>
                  {a ? (
                    <>
                      {a.nickname}
                      <span className="text-muted-foreground"> · {TYPE_LABELS[a.accountType] ?? a.accountType}</span>
                    </>
                  ) : (
                    'Not secured'
                  )}
                </Select.ItemText>
                <Select.ItemIndicator className="shrink-0">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

const COMPOUNDING_LABELS: Record<NonNullable<HoldingDetails['compounding']>, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annually: 'Annually',
  maturity: 'At maturity',
}

const FCNR_CURRENCIES: NonNullable<HoldingDetails['depositCurrency']>[] = ['USD', 'GBP', 'EUR', 'CAD', 'AUD']

/**
 * Which detail fields surface for a given country × type. `isSgb` is passed in
 * because a Sovereign Gold Bond reveals interest + maturity that physical gold
 * doesn't. Returning plain booleans keeps the form's conditional rendering flat.
 */
/** Compact, human one-liner of a holding's populated details — for the row. */
function detailSummary(d: HoldingDetails | undefined): string | null {
  if (!d) return null
  const parts: string[] = []
  if (d.fdScheme) parts.push(d.fdScheme)
  if (d.isSgb) parts.push('SGB')
  if (d.depositCurrency) parts.push(d.depositCurrency)
  if (typeof d.interestRate === 'number') parts.push(`${d.interestRate}%`)
  if (typeof d.tdsRate === 'number') parts.push(`${d.tdsRate}% TDS`)
  if (d.maturityDate) {
    const dt = new Date(d.maturityDate + 'T00:00:00')
    if (!Number.isNaN(dt.getTime())) {
      parts.push(
        `matures ${dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      )
    }
  }
  return parts.length ? parts.join(' · ') : null
}

/** Close-on-Escape for modals. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

function AccountDialog({
  rate,
  holdings,
  updateAccount,
  initial,
  onClose,
  onSave,
}: {
  rate: number
  /** All holdings — used to offer/manage loan↔asset links. */
  holdings: Holding[]
  /** Persist a change to another holding (used to link/unlink secured loans). */
  updateAccount: (id: string, h: Holding) => void
  /** When set, the dialog edits this holding instead of creating a new one. */
  initial?: Holding
  onClose: () => void
  onSave: (h: Holding) => void
}) {
  const { mode } = useCurrency()
  const money = (usd: number) => formatAmount(usd, mode, rate)
  const isEdit = !!initial
  const [country, setCountry] = useState<'US' | 'IN'>(initial?.country ?? 'US')
  const [kind, setKind] = useState<'asset' | 'liability'>(initial && isLiability(initial) ? 'liability' : 'asset')
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'checking')
  const [amount, setAmount] = useState(() =>
    initial
      ? String(Number(entryAmount(initial, rate).toFixed(2)))
      : '',
  )
  // ── Instrument-specific detail fields (only some surface per country × type) ──
  const d0 = initial?.details
  const [interestRate, setInterestRate] = useState(d0?.interestRate != null ? String(d0.interestRate) : '')
  const [maturityDate, setMaturityDate] = useState(d0?.maturityDate ?? '')
  const [compounding, setCompounding] = useState<NonNullable<HoldingDetails['compounding']>>(d0?.compounding ?? 'quarterly')
  const [depositCurrency, setDepositCurrency] = useState<NonNullable<HoldingDetails['depositCurrency']>>(d0?.depositCurrency ?? 'USD')
  const [tdsRate, setTdsRate] = useState(d0?.tdsRate != null ? String(d0.tdsRate) : '')
  const [fdScheme, setFdScheme] = useState<NonNullable<HoldingDetails['fdScheme']>>(d0?.fdScheme ?? 'NRE')
  const [isSgb, setIsSgb] = useState(d0?.isSgb ?? false)
  const [minPayment, setMinPayment] = useState(d0?.minPayment != null ? String(d0.minPayment) : '')
  const [expReturn, setExpReturn] = useState(d0?.expectedReturn != null ? String(d0.expectedReturn) : '')
  // ── Ownership / title — whose name this is held in ──
  const [ownership, setOwnership] = useState<Ownership>(initial?.ownership ?? 'self')
  const [coOwners, setCoOwners] = useState<CoOwner[]>(initial?.coOwners ?? [])
  useEscape(onClose)

  const liability = kind === 'liability'
  // FCNR is held in foreign currency, so it's entered in dollars even in India.
  const cur = entryCurrency(country, accountType)
  // India FDs are offered per scheme (NRE / NRO Fixed Deposit) — see TypeChoice.
  const types = typeChoicesFor(country, kind)
  const spec = detailSpec(country, accountType, isSgb, fdScheme)
  // Named like an FD but typed as NRE/NRO Savings — suggest the FD choice (never auto-switched).
  const suggestedScheme = liability ? null : mistypedFdScheme({ country, accountType, nickname })
  // The same rules as quick entry: 40L / 1.2Cr / 95k / 1.5M, zero allowed, no negatives, 2 decimals, names to 60.
  const amountRead = readAmount(amount)
  const amountValue = amountRead.ok ? amountRead.value : null
  const nameProblem = nameError(nickname)
  const valid = nickname.trim() && !nameProblem && institution.trim() && amountValue != null

  // Asset-side loan linking — for any securable asset being edited (it has an id).
  const canSecure = SECURABLE_ASSET_TYPES.has(accountType)
  const editingAssetId = isEdit && !liability && canSecure ? initial?.id : undefined
  const loanOptions = editingAssetId ? holdings.filter((h) => isLiability(h) && h.id) : []
  const assetUsdNow = balancesFromEntry(country, accountType, amountValue ?? 0, rate).balanceUsd
  const linkedLoansUsd = loanOptions
    .filter((l) => l.securedAgainstId === editingAssetId)
    .reduce((s, l) => s + Math.abs(usdValue(l, rate)), 0)
  const equityPreview = assetUsdNow - linkedLoansUsd

  // Loan-side linking — what assets this loan can be secured against.
  const securableAssets = liability ? holdings.filter((h) => isSecurableAsset(h) && h.id) : []
  const [securedAgainstId, setSecuredAgainstId] = useState<string | undefined>(initial?.securedAgainstId)

  /** Collect only the detail fields that apply to this type and are filled in. */
  function buildDetails(): HoldingDetails | undefined {
    const det: HoldingDetails = {}
    if (spec.interestRate && interestRate.trim() !== '') det.interestRate = Number(interestRate)
    if (spec.maturityDate && maturityDate) det.maturityDate = maturityDate
    if (spec.compounding) det.compounding = compounding
    if (spec.depositCurrency) det.depositCurrency = depositCurrency
    if (spec.hasScheme) det.fdScheme = fdScheme
    if (spec.tdsRate && tdsRate.trim() !== '') det.tdsRate = Number(tdsRate)
    if (spec.minPayment && minPayment.trim() !== '') det.minPayment = Number(minPayment)
    if (spec.expectedReturn && expReturn.trim() !== '') det.expectedReturn = Number(expReturn)
    if (spec.goldToggle && isSgb) det.isSgb = true
    return Object.keys(det).length ? det : undefined
  }

  function submit() {
    if (!valid) return
    const amt = amountValue ?? 0
    const h: Holding = {
      id: initial?.id,
      nickname: nickname.trim(),
      institution: institution.trim(),
      accountType,
      country,
      ...balancesFromEntry(country, accountType, amt, rate),
      isPfic: !liability && country === 'IN' && accountType === 'mutual_fund',
      source: initial?.source ?? 'manual',
      kind,
      securedAgainstId: liability ? securedAgainstId : undefined,
      details: buildDetails(),
      ...(ownership !== 'self' && {
        ownership,
        coOwners: coOwners.map((c) => ({ ...c, name: c.name.trim() })),
      }),
    }
    onSave(h)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          'card-surface relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden p-0 ring-2 transition-shadow duration-500 animate-scale-in',
          liability ? 'ring-danger/60' : 'ring-success/60',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative shrink-0 border-b border-border/60 px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-colors duration-500',
                  liability ? 'bg-danger/12 text-danger ring-danger/20' : 'bg-success/12 text-success ring-success/20',
                )}
              >
                {liability ? <CreditCard size={19} /> : <Wallet size={19} />}
              </span>
              <div>
                <h2 className="font-serif text-[1.2rem] font-medium tracking-tight">
                  {isEdit ? 'Edit account' : liability ? 'Add a liability' : 'Add an account'}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isEdit ? `Update “${initial.nickname}”` : 'Track what you own or owe, in either country'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="btn-ghost -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-5">
          {/* Asset / Liability — sliding segmented selector (pill glides green↔red) */}
          <div>
            <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-muted/60 p-1.5">
              {(['asset', 'liability'] as const).map((k) => {
                const active = kind === k
                const isLia = k === 'liability'
                const Icon = isLia ? CreditCard : Coins
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setKind(k)
                      setAccountType(firstType(country, k))
                    }}
                    className="relative z-10 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-colors duration-200"
                  >
                    {active && (
                      <motion.span
                        layoutId="kindPill"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 -z-10 rounded-xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.3)]"
                        style={{ backgroundColor: isLia ? 'var(--danger)' : 'var(--success)' }}
                      />
                    )}
                    <Icon size={15} className={cn(active ? 'text-white' : 'text-muted-foreground')} />
                    <span className={cn(active ? 'text-white' : 'text-muted-foreground')}>
                      {isLia ? 'Liability' : 'Asset'}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
              {liability
                ? 'Something you owe — loans, credit cards, a mortgage.'
                : 'Something you own — cash, investments, property.'}
            </p>
          </div>

          {/* Country segmented */}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">Where is it held?</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/70 p-1">
              {(['US', 'IN'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCountry(c)
                    setAccountType(firstType(c, kind))
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
                    country === c
                      ? 'bg-card shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="text-sm leading-none">{c === 'US' ? '🇺🇸' : '🇮🇳'}</span>
                  {c === 'US' ? 'United States' : 'India'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nickname">
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={liability ? 'e.g. Chase Mortgage' : 'e.g. Chase Checking'} aria-invalid={nameProblem ? true : undefined} className={cn(inputCls, nameProblem && 'border-danger')} />
              {nameProblem && <p role="alert" className="mt-1.5 text-[11.5px] text-danger">{nameProblem}</p>}
            </Field>
            <Field label={liability ? 'Lender' : 'Institution'}>
              <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Chase" className={inputCls} />
            </Field>
          </div>
          <Field label="Type">
            <TypeSelect
              value={typeChoice(country, accountType, fdScheme)}
              options={types}
              onChange={(c) => {
                const next = fromTypeChoice(c)
                setAccountType(next.accountType)
                if (next.fdScheme) setFdScheme(next.fdScheme)
              }}
              liability={liability}
            />
            {suggestedScheme && (
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                Sounds like a fixed deposit.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setFdScheme(suggestedScheme)
                    setAccountType('fd')
                  }}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Use {suggestedScheme} Fixed Deposit
                </button>{' '}
                so it sits with your other FDs.
              </p>
            )}
            {spec.hasScheme && (
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                {fdScheme === 'NRE'
                  ? 'Interest is tax-free in India and fully repatriable — no TDS.'
                  : 'Interest is taxable in India — TDS applies.'}
              </p>
            )}
          </Field>
          <Field label={liability ? 'Amount owed' : 'Balance'}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground/80">
                {cur === 'USD' ? '$' : '₹'}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={cur === 'USD' ? 'e.g. 95k' : 'e.g. 40L'}
                aria-invalid={!amountRead.ok ? true : undefined}
                className={cn(inputCls, 'h-11 pl-8 text-base tabular-nums', !amountRead.ok && 'border-danger')}
              />
            </div>
            {!amountRead.ok && (
              <p role="alert" className="mt-1.5 text-[11.5px] text-danger">
                {amountRead.error}
              </p>
            )}
            {spec.depositCurrency && (
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                {depositCurrency === 'USD'
                  ? 'In US dollars, as the deposit is held.'
                  : `In US dollars: enter your ${depositCurrency} deposit's dollar value (we convert USD ↔ INR only).`}
              </p>
            )}
          </Field>
          {accountType === 'mutual_fund' && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-muted/60 px-3 py-2.5 text-[13px] leading-snug text-warning ring-1 ring-warning/20">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>India mutual funds are auto-flagged as PFIC (Form 8621).</span>
            </p>
          )}

          {/* ── Instrument details — only the fields this type actually has ──── */}
          {spec.any && (
            <div className="mt-1 flex flex-col gap-3.5 rounded-xl bg-muted/35 p-4 ring-1 ring-border/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Details
              </p>

              {spec.goldToggle && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSgb}
                    onChange={(e) => setIsSgb(e.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--brand)]"
                  />
                  <span className="text-[13px] leading-snug">
                    <span className="font-medium">Sovereign Gold Bond</span>
                    <span className="block text-muted-foreground">Earns interest and has a maturity date, unlike physical gold.</span>
                  </span>
                </label>
              )}

              {(spec.interestRate || spec.tdsRate || spec.minPayment) && (
                <div className="grid grid-cols-2 gap-3">
                  {spec.interestRate && (
                    <Field label={liability ? 'APR (%)' : 'Interest rate (%)'}>
                      <input
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        placeholder={liability ? 'e.g. 6.5' : 'e.g. 7.1'}
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                  {spec.tdsRate && (
                    <Field label="TDS withheld (%)">
                      <input
                        value={tdsRate}
                        onChange={(e) => setTdsRate(e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        placeholder="e.g. 30"
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                  {spec.minPayment && (
                    <Field label={`Min. payment (${cur})`}>
                      <input
                        value={minPayment}
                        onChange={(e) => setMinPayment(e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        placeholder="0"
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                </div>
              )}

              {spec.expectedReturn && (
                <Field label="Expected return (%)">
                  <input
                    value={expReturn}
                    onChange={(e) => setExpReturn(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    placeholder={`Default ${(typeExpectedReturn(accountType) * 100).toFixed(1)} — your estimate for projections`}
                    className={cn(inputCls, 'tabular-nums')}
                  />
                </Field>
              )}

              {(spec.maturityDate || spec.compounding) && (
                <div className="grid grid-cols-2 gap-3">
                  {spec.maturityDate && (
                    <Field label={liability ? 'Payoff date' : 'Maturity date'}>
                      <input
                        type="date"
                        value={maturityDate}
                        onChange={(e) => setMaturityDate(e.target.value)}
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                  {spec.compounding && (
                    <Field label="Compounding">
                      <select
                        value={compounding}
                        onChange={(e) => setCompounding(e.target.value as NonNullable<HoldingDetails['compounding']>)}
                        className={inputCls}
                      >
                        {(Object.keys(COMPOUNDING_LABELS) as (keyof typeof COMPOUNDING_LABELS)[]).map((k) => (
                          <option key={k} value={k}>
                            {COMPOUNDING_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              )}

              {spec.depositCurrency && (
                <Field label="Held in currency">
                  <select
                    value={depositCurrency}
                    onChange={(e) => setDepositCurrency(e.target.value as NonNullable<HoldingDetails['depositCurrency']>)}
                    className={inputCls}
                  >
                    {FCNR_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-muted-foreground">
                    FCNR deposits are held in foreign currency, not INR, so the balance is in dollars.
                  </span>
                </Field>
              )}
            </div>
          )}

          {/* ── Secured against — tie this loan to the asset it finances ── */}
          {liability && (
            <Field label="Secured against (optional)">
              {securableAssets.length > 0 ? (
                <AssetSelect value={securedAgainstId} assets={securableAssets} onChange={setSecuredAgainstId} />
              ) : (
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Add an asset (home, vehicle, gold, brokerage…) first, then you can secure this loan against it.
                </p>
              )}
            </Field>
          )}

          <OwnershipField
            ownership={ownership}
            coOwners={coOwners}
            liability={liability}
            onOwnershipChange={(o) => {
              setOwnership(o)
              // Seed one person so the list is never empty when it matters.
              if (o !== 'self' && coOwners.length === 0) {
                setCoOwners([{ name: '', relation: o === 'joint' ? 'spouse' : 'father' }])
              }
            }}
            onCoOwnersChange={setCoOwners}
          />

          {/* ── Linked loans — attach mortgages/HELOCs to this property for equity ── */}
          {editingAssetId && (
            <div className="flex flex-col gap-2.5 rounded-xl bg-muted/35 p-4 ring-1 ring-border/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Linked loans
                </p>
                {linkedLoansUsd > 0 && (
                  <span className="text-[12px] text-muted-foreground">
                    Equity{' '}
                    <span className="font-semibold text-foreground tabular-nums">{money(equityPreview)}</span>
                  </span>
                )}
              </div>
              {loanOptions.length === 0 ? (
                <p className="text-[12px] leading-snug text-muted-foreground">
                  No loans yet. Add a liability first, then come back here to secure it against this property.
                </p>
              ) : (
                loanOptions.map((loan) => {
                  const linked = loan.securedAgainstId === editingAssetId
                  const elsewhere = !linked && !!loan.securedAgainstId
                  return (
                    <label key={loan.id} className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={linked}
                        onChange={() =>
                          updateAccount(loan.id!, {
                            ...loan,
                            securedAgainstId: linked ? undefined : editingAssetId,
                          })
                        }
                        className="size-4 shrink-0 accent-[var(--danger)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {loan.nickname}
                        <span className="text-muted-foreground"> · {TYPE_LABELS[loan.accountType] ?? loan.accountType}</span>
                        {elsewhere && <span className="ml-1 text-[11px] text-muted-foreground">(linked elsewhere)</span>}
                      </span>
                      <span className="shrink-0 text-[12px] font-medium tabular-nums text-danger">
                        −{money(Math.abs(usdValue(loan, rate)))}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_2px_8px_-2px_rgba(0,0,0,0.25)] transition-all hover:brightness-110 active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
              liability ? 'bg-danger' : 'bg-success',
            )}
          >
            {!isEdit && <Plus size={14} />}
            {isEdit ? 'Save changes' : liability ? 'Add liability' : 'Add account'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Ownership / title ──────────────────────────────────────────────────────── */

const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: 'self', label: 'Just me' },
  { value: 'joint', label: 'Joint' },
  { value: 'family', label: 'Family member' },
]

const RELATIONS = Object.keys(RELATION_LABELS) as OwnerRelation[]

/**
 * Whose name the holding is in — self, joint (you + others), or a family member's
 * name alone. Feeds the future Legacy "who owns what" view.
 */
function OwnershipField({
  ownership,
  coOwners,
  liability,
  onOwnershipChange,
  onCoOwnersChange,
}: {
  ownership: Ownership
  coOwners: CoOwner[]
  liability: boolean
  onOwnershipChange: (o: Ownership) => void
  onCoOwnersChange: (c: CoOwner[]) => void
}) {
  const patch = (i: number, p: Partial<CoOwner>) =>
    onCoOwnersChange(coOwners.map((c, j) => (j === i ? { ...c, ...p } : c)))
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-muted/35 p-4 ring-1 ring-border/50">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          {liability ? 'Whose name is the loan in?' : 'Whose name is it in?'}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          What happens to it later depends on the name it’s held in.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-muted/70 p-1">
        {OWNERSHIP_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onOwnershipChange(o.value)}
            className={cn(
              'rounded-lg py-1.5 text-xs font-medium transition-all',
              ownership === o.value
                ? 'bg-card shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {ownership !== 'self' && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-muted-foreground">
            {ownership === 'joint' ? 'Held jointly with' : 'Held in the name of'}
          </p>
          {coOwners.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={c.relation}
                onChange={(e) => patch(i, { relation: e.target.value as OwnerRelation })}
                aria-label="Relation"
                className={cn(inputCls, 'w-32 shrink-0')}
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {RELATION_LABELS[r]}
                  </option>
                ))}
              </select>
              <input
                value={c.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                placeholder={c.relation === 'other' ? 'Name' : 'Name (optional)'}
                aria-label="Name"
                maxLength={80}
                className={cn(inputCls, 'min-w-0 flex-1')}
              />
              <button
                type="button"
                onClick={() => onCoOwnersChange(coOwners.filter((_, j) => j !== i))}
                aria-label="Remove person"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-muted hover:text-danger"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {coOwners.length < 10 && (
            <button
              type="button"
              onClick={() => onCoOwnersChange([...coOwners, { name: '', relation: 'other' }])}
              className="inline-flex items-center gap-1 self-start rounded-lg px-2 py-1 text-[12px] font-medium text-brand transition-colors hover:bg-brand/10"
            >
              <Plus size={13} />
              Add person
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Delete confirmation ───────────────────────────────────────────────────── */

function ConfirmDeleteDialog({
  account,
  rate,
  onCancel,
  onConfirm,
}: {
  account: Holding
  rate: number
  onCancel: () => void
  onConfirm: () => void
}) {
  useEscape(onCancel)
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="card-surface relative w-full max-w-sm overflow-hidden p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-muted/80 text-danger ring-1 ring-danger/20">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-medium tracking-tight">Remove this account?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{account.nickname}</span>{' '}
              ({account.institution} · {TYPE_LABELS[account.accountType] ?? account.accountType}) holding{' '}
              <Money usd={usdValue(account, rate)} className="tabular-nums font-semibold tabular-nums text-foreground" />{' '}
              will be removed from your net worth, compliance checks, and allocation.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-danger px-4 py-2 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_2px_8px_-2px_color-mix(in_oklch,var(--danger)_50%,transparent)] transition-all hover:brightness-110 active:translate-y-px"
          >
            Remove account
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.04)] outline-none transition-all placeholder:text-muted-foreground/70 focus:border-brand focus:bg-card focus:ring-[3px] focus:ring-brand/12'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
