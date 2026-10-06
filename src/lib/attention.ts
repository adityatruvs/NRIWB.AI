/**
 * One answer to "do I need to act?" for every surface (header pill, KPI cards,
 * Needs attention). The rule-based compliance items decide the obligations; the
 * AI list only adds to them, so an empty or stale AI result can never make the
 * dashboard say "all clear" while the header says otherwise. Pure + testable.
 */

import type { ComplianceItem, ComplianceLevel } from '@/lib/portfolio'

const RANK: Record<ComplianceLevel, number> = { ok: 0, attention: 1, overdue: 2 }

const maxLevel = (a: ComplianceLevel, b: ComplianceLevel) => (RANK[a] >= RANK[b] ? a : b)

/** Short names for the header, e.g. "Action needed: FBAR, PFIC". */
const SHORT: Record<string, string> = { fbar: 'FBAR', pfic: 'PFIC', fatca: 'FATCA' }

/** The rule items that need action (anything not `ok`). */
export const flaggedRules = (rules: ComplianceItem[]) => rules.filter((r) => r.level !== 'ok')

/**
 * The Needs attention list: every flagged rule item, plus the AI's items. When
 * the AI covered the same topic its wording is kept but the rule's level wins.
 * AI-only items are capped at `attention`: the model can't know a deadline was
 * missed, so only a rule may say "overdue". Most urgent first; flagged rules lead
 * within a level so a top-N cut never drops an obligation the header names.
 */
export function attentionItems(rules: ComplianceItem[], ai: ComplianceItem[] | null): ComplianceItem[] {
  const flagged = flaggedRules(rules)
  // The AI's repeats on one topic come back as "pfic-2", "pfic-3": same topic.
  const topic = (key: string) => key.replace(/-\d+$/, '')
  const aiByTopic = new Map<string, ComplianceItem>()
  for (const it of ai ?? []) if (!aiByTopic.has(topic(it.key))) aiByTopic.set(topic(it.key), it)
  const required = flagged.map((r) => {
    const a = aiByTopic.get(r.key)
    return a ? { ...a, key: r.key, href: a.href ?? r.href, level: r.level } : r
  })
  // A rule topic (FBAR, PFIC, FATCA) is the rule's call alone: when its rule is ok,
  // an AI item on it isn't listed, so the list always matches the header.
  const ruleTopics = new Set(rules.map((r) => r.key))
  const extra = (ai ?? [])
    .filter((it) => !ruleTopics.has(topic(it.key)) && it.level !== 'ok')
    .map((it) => (it.level === 'overdue' ? { ...it, level: 'attention' as const } : it))
  return [...required, ...extra].sort((a, b) => RANK[b.level] - RANK[a.level])
}

export interface ComplianceSummary {
  level: ComplianceLevel
  /** "All clear", "Action needed: FBAR, PFIC", "Overdue: FBAR". */
  label: string
}

/** The header pill, from the same rule items the dashboard shows. */
export function complianceSummary(rules: ComplianceItem[]): ComplianceSummary {
  const flagged = flaggedRules(rules)
  if (flagged.length === 0) return { level: 'ok', label: 'All clear' }
  const level = flagged.reduce<ComplianceLevel>((acc, r) => maxLevel(acc, r.level), 'ok')
  const names = flagged.map((r) => SHORT[r.key] ?? r.title)
  return { level, label: `${level === 'overdue' ? 'Overdue' : 'Action needed'}: ${names.join(', ')}` }
}
