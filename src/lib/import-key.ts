/**
 * Identity + dedupe for statement imports.
 *
 * No single identifier works across statement types (ISIN names an instrument,
 * not a holding; bank deposits have none), so the key depends on the asset's
 * structure, which the extraction step classifies first:
 *
 *   folio_fund          folio + instrument id (ISIN)        e.g. India mutual funds
 *   custodial_security  account number + instrument id      funds/ETFs/bonds at a custodian
 *   deposit             account number (+ institution)      savings, FDs, NRE/NRO/FCNR
 *
 * The parts are stored on `Holding.details` (see HoldingDetails) and compared
 * here — pure functions, no I/O — so the same logic runs in the review panel
 * and the tests. Stocks are out of scope and never reach this module.
 */

import type { Holding, HoldingDetails } from '@/lib/portfolio'

export const IMPORT_ASSET_TYPES = ['folio_fund', 'custodial_security', 'deposit', 'other'] as const
export type ImportAssetType = (typeof IMPORT_ASSET_TYPES)[number]

/** The identity parts extracted from a statement row. */
export interface ImportIdentity {
  assetType: ImportAssetType
  institution: string
  folio?: string
  accountRef?: string
  instrumentId?: string
}

export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Account / folio numbers: case, punctuation, whitespace and leading zeros don't matter. */
export function normalizeRef(s: string | undefined | null): string | undefined {
  if (!s) return undefined
  const ref = s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '')
  return ref || undefined
}

/**
 * Bank / custodian account numbers. Statements often print only the tail ("XXXX1234",
 * "ending 1234"), and a tail alone can't tell two accounts apart — so a masked or very
 * short number is stored as `*1234` and is only ever a weak (confirm-first) match.
 */
export function normalizeAccountRef(s: string | undefined | null): string | undefined {
  if (!s) return undefined
  const masked = /[*•●#]|X{2,}/i.test(s)
  const cleaned = s.toUpperCase().replace(/X{2,}|[*•●#]/g, '').replace(/[^A-Z0-9]/g, '')
  if (!cleaned) return undefined
  if (masked || cleaned.length <= 4) return `*${cleaned}`
  return cleaned.replace(/^0+/, '') || undefined
}

export const isMaskedRef = (ref: string | undefined) => !!ref?.startsWith('*')

/** How two account refs relate: identical full numbers, a masked tail that fits, or no relation. */
function refRelation(a: string | undefined, b: string | undefined): 'exact' | 'masked' | 'none' {
  if (!a || !b) return 'none'
  if (a === b && !isMaskedRef(a)) return 'exact'
  if (!isMaskedRef(a) && !isMaskedRef(b)) return 'none'
  const ta = a.replace(/^\*/, '')
  const tb = b.replace(/^\*/, '')
  return ta.endsWith(tb) || tb.endsWith(ta) ? 'masked' : 'none'
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/**
 * One canonical instrument id. A US/CA ISIN is just country prefix + 9-char
 * CUSIP + check digit, so those collapse to the CUSIP core and match a
 * statement that only prints the CUSIP. Other ISINs stay as ISINs; SEDOL last.
 */
export function normalizeInstrumentId(ids: { isin?: string; cusip?: string; sedol?: string }): string | undefined {
  const isin = ids.isin?.toUpperCase().replace(/\s/g, '')
  if (isin && ISIN_RE.test(isin)) {
    return isin.startsWith('US') || isin.startsWith('CA') ? `CUSIP:${isin.slice(2, 11)}` : `ISIN:${isin}`
  }
  const cusip = ids.cusip?.toUpperCase().replace(/\s/g, '')
  if (cusip && /^[A-Z0-9]{9}$/.test(cusip)) return `CUSIP:${cusip}`
  const sedol = ids.sedol?.toUpperCase().replace(/\s/g, '')
  if (sedol && /^[A-Z0-9]{7}$/.test(sedol)) return `SEDOL:${sedol}`
  return undefined
}

/** Fallback id for a folio fund whose statement shows no ISIN — a weak match. */
export function nameInstrumentId(name: string): string | undefined {
  const n = normalizeText(name)
  return n ? `NAME:${n}` : undefined
}

/**
 * The DB-level uniqueness key — a last line of defence behind `findMatch`, so even a
 * racing double-import can't create two rows for the same holding. Null when there's
 * not enough to identify the holding. Institution is left out of folio funds (the
 * ISIN already pins the AMC) so a respelled AMC name can't dodge the constraint.
 */
export function buildImportKey(id: ImportIdentity): string | null {
  const inst = normalizeText(id.institution)
  switch (id.assetType) {
    case 'folio_fund':
      // A weak NAME id isn't certain enough to forbid a second row at the DB level.
      return id.folio && id.instrumentId && !isWeakId(id.instrumentId) ? `ff|${id.folio}|${id.instrumentId}` : null
    case 'custodial_security':
      return id.accountRef && id.instrumentId && !isMaskedRef(id.accountRef)
        ? `cs|${inst}|${id.accountRef}|${id.instrumentId}`
        : null
    default:
      // A masked tail can't uniquely identify an account, so it never gets a DB key.
      return id.accountRef && !isMaskedRef(id.accountRef)
        ? `${id.assetType === 'deposit' ? 'dp' : 'ot'}|${inst}|${id.accountRef}`
        : null
  }
}

const isWeakId =(id: string | undefined) => !!id?.startsWith('NAME:')

/** Pull the identity parts off a stored holding. Pre-key imports fall back to their nickname. */
export function identityOf(h: Holding): Partial<ImportIdentity> & { legacy?: boolean } {
  const d: HoldingDetails = h.details ?? {}
  if (d.assetType) {
    return {
      assetType: d.assetType,
      institution: h.institution,
      folio: d.folio,
      accountRef: d.accountRef,
      instrumentId: d.instrumentId,
    }
  }
  // Legacy CAS import: the folio only exists inside the nickname, "Scheme (Folio 123)".
  if (h.source === 'pdf_upload') {
    const m = h.nickname.match(/^(.*)\(Folio ([^)]+)\)\s*$/)
    if (m) {
      return { assetType: 'folio_fund', institution: h.institution, folio: normalizeRef(m[2]), instrumentId: nameInstrumentId(m[1]), legacy: true }
    }
  }
  return {}
}

export type MatchResult =
  /** Same holding — safe to update in place. */
  | { kind: 'match'; holding: Holding }
  /** Probably the same holding, but the key is weak — the user must confirm. */
  | { kind: 'confirm'; holding: Holding }
  | { kind: 'new' }

/** Find the existing holding a statement row refers to, if any. */
export function findMatch(incoming: ImportIdentity, holdings: Holding[]): MatchResult {
  const inst = normalizeText(incoming.institution)
  let weak: Holding | undefined

  for (const h of holdings) {
    if (h.kind === 'liability') continue
    const ex = identityOf(h)
    if (!ex.assetType) continue
    const sameInst = normalizeText(h.institution) === inst

    // The model can classify one holding differently between uploads (folio fund vs custodial
    // security, deposit vs other). The number + instrument still line up, so offer it as a
    // probable match instead of silently adding a duplicate.
    if (ex.assetType !== incoming.assetType) {
      const rel = refRelation(incoming.folio ?? incoming.accountRef, ex.folio ?? ex.accountRef)
      const sameInstrument = (incoming.instrumentId ?? '') === (ex.instrumentId ?? '')
      if (rel !== 'none' && sameInstrument && (incoming.instrumentId || sameInst)) weak ??= h
      continue
    }

    if (incoming.assetType === 'folio_fund') {
      if (!incoming.folio || ex.folio !== incoming.folio) continue
      if (incoming.instrumentId && ex.instrumentId === incoming.instrumentId) {
        // A name-only id, or a legacy row, can't be trusted blindly.
        if (isWeakId(incoming.instrumentId) || ex.legacy) weak ??= h
        else return { kind: 'match', holding: h }
      } else if (!incoming.instrumentId || !ex.instrumentId || isWeakId(incoming.instrumentId) !== isWeakId(ex.instrumentId)) {
        // Same folio, but one side has an ISIN and the other doesn't (the model dropped it, or
        // the old row never had one) — probably the same fund. Two different ISINs in one
        // folio are two schemes, so those fall through as not a match.
        weak ??= h
      }
    } else if (incoming.assetType === 'custodial_security') {
      if (!incoming.instrumentId || ex.instrumentId !== incoming.instrumentId) continue
      const rel = refRelation(incoming.accountRef, ex.accountRef)
      if (rel === 'exact') {
        if (sameInst) return { kind: 'match', holding: h }
        weak ??= h
      } else if (rel === 'masked' || (!incoming.accountRef && sameInst)) {
        weak ??= h // a masked tail, or no account number at all: same instrument at the same place
      }
    } else {
      const rel = refRelation(incoming.accountRef, ex.accountRef)
      if (rel === 'none') continue
      if (rel === 'exact' && sameInst) return { kind: 'match', holding: h }
      weak ??= h // masked numbers collide across banks, or the institution was spelled differently
    }
  }
  return weak ? { kind: 'confirm', holding: weak } : { kind: 'new' }
}

export type DateOutcome = 'newer' | 'same' | 'older'

/** How an incoming statement date compares with what the holding already reflects. */
export function compareStatementDate(incoming: string, existing: string | undefined): DateOutcome {
  if (!existing) return 'newer' // nothing recorded yet (manual or legacy) — the statement wins
  if (incoming > existing) return 'newer'
  return incoming === existing ? 'same' : 'older'
}

/** A real, non-future YYYY-MM-DD date; anything else is treated as "no date found". */
export function validStatementDate(s: unknown, today: Date = new Date()): string | undefined {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return undefined
  return s > today.toISOString().slice(0, 10) ? undefined : s
}
