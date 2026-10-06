/**
 * Real, dated US ↔ India filing deadlines relative to today, so the AI never
 * guesses the date or calls something overdue that isn't. Pure + testable.
 *
 * US dates that land on a weekend move to the Monday (federal holidays aren't
 * modelled). India dates don't roll.
 */

export interface DatedDeadline {
  /** YYYY-MM-DD. */
  date: string
  country: 'US' | 'IN'
  title: string
  note: string
  daysAway: number
}

/** YYYY-MM-DD in UTC. */
const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

function usDue(y: number, m: number, d: number): Date {
  const date = utc(y, m, d)
  const dow = date.getUTCDay()
  if (dow === 6) date.setUTCDate(date.getUTCDate() + 2)
  if (dow === 0) date.setUTCDate(date.getUTCDate() + 1)
  return date
}

/** Every deadline that falls in calendar year `y`. */
function deadlinesIn(y: number): Omit<DatedDeadline, 'daysAway'>[] {
  const us = (m: number, d: number, title: string, note: string) => ({ date: iso(usDue(y, m, d)), country: 'US' as const, title, note })
  const india = (m: number, d: number, title: string, note: string) => ({ date: iso(utc(y, m, d)), country: 'IN' as const, title, note })
  return [
    us(1, 15, `US estimated tax — Q4 ${y - 1}`, 'Form 1040-ES, if you owe tax not covered by withholding'),
    india(3, 15, `India advance tax — final instalment, FY ${y - 1}-${String(y).slice(2)}`, 'If India tax due exceeds ₹10,000 after TDS'),
    us(4, 15, `US tax return for ${y - 1} (Form 1040, with Form 8938 / 8621)`, 'Extendable to Oct 15 with Form 4868'),
    us(4, 15, `FBAR (FinCEN 114) for ${y - 1}`, `Original due date; automatically extended to Oct 15, ${y} — no form needed`),
    us(4, 15, `US estimated tax — Q1 ${y}`, 'Form 1040-ES'),
    india(6, 15, `India advance tax — 1st instalment, FY ${y}-${String(y + 1).slice(2)}`, 'If India tax due exceeds ₹10,000 after TDS'),
    us(6, 15, `US estimated tax — Q2 ${y}`, 'Form 1040-ES'),
    india(7, 31, `India income tax return (ITR), FY ${y - 1}-${String(y).slice(2)}`, 'Non-audit filers; dates are sometimes extended by notification'),
    india(9, 15, `India advance tax — 2nd instalment, FY ${y}-${String(y + 1).slice(2)}`, 'If India tax due exceeds ₹10,000 after TDS'),
    us(9, 15, `US estimated tax — Q3 ${y}`, 'Form 1040-ES'),
    us(10, 15, `FBAR (FinCEN 114) for ${y - 1} — extended deadline`, 'Final date under the automatic extension'),
    us(10, 15, `US tax return for ${y - 1} — extended deadline`, 'Only if Form 4868 was filed by Apr 15'),
    india(12, 15, `India advance tax — 3rd instalment, FY ${y}-${String(y + 1).slice(2)}`, 'If India tax due exceeds ₹10,000 after TDS'),
    india(12, 31, `India belated / revised ITR, FY ${y - 1}-${String(y).slice(2)}`, 'Last date to file late or revise'),
  ]
}

/** Deadlines from today through `days` ahead, soonest first. */
export function upcomingDeadlines(now: Date, days = 365): DatedDeadline[] {
  const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  const y = today.getUTCFullYear()
  return [...deadlinesIn(y), ...deadlinesIn(y + 1)]
    .map((d) => ({ ...d, daysAway: Math.round((Date.parse(d.date) - today.getTime()) / 86_400_000) }))
    .filter((d) => d.daysAway >= 0 && d.daysAway <= days)
    .sort((a, b) => a.daysAway - b.daysAway)
}

/** "Monday, October 5, 2026" for a YYYY-MM-DD or Date, in UTC. */
export function longDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** The browser's local date as YYYY-MM-DD (sent to the AI routes as `today`). */
export const localDay = (d: Date = new Date()) => d.toLocaleDateString('en-CA')

/**
 * Today for the prompt: the browser's local date when it sent one that's within
 * a day of the server's (time zones), else the server's UTC date.
 */
export function resolveToday(clientDay: unknown, serverNow: Date = new Date()): Date {
  if (typeof clientDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(clientDay)) {
    const d = new Date(`${clientDay}T00:00:00Z`)
    const serverDay = Date.UTC(serverNow.getUTCFullYear(), serverNow.getUTCMonth(), serverNow.getUTCDate())
    if (!Number.isNaN(d.getTime()) && Math.abs(d.getTime() - serverDay) <= 86_400_000) return d
  }
  return serverNow
}

/** The prompt block: today's date and the dated deadlines in the next 12 months. */
export function datePromptBlock(today: Date): string {
  const lines = upcomingDeadlines(today)
    .map((d) => `- ${d.date} (in ${d.daysAway} day${d.daysAway === 1 ? '' : 's'}) [${d.country}] ${d.title} — ${d.note}`)
    .join('\n')
  return `Today is ${longDate(today)} (${iso(today)}).

Upcoming filing deadlines (next 12 months, computed from today):
${lines}`
}

/** Short FBAR due line for this year's balances, e.g. "2026 FBAR due Apr 15, 2027 (ext. Oct 15)". */
export function fbarDueMeta(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  return `${y} FBAR due Apr 15, ${y + 1} (ext. Oct 15)`
}
