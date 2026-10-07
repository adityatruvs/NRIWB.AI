/**
 * The /api/accounts contract: zod validation + the Holding <-> Account mapping.
 *
 * This module is intentionally pure (no Prisma, no request handling) so the route
 * handlers stay thin and this logic is unit-testable in isolation. The route layer
 * owns auth, per-user scoping, ownership checks, and the actual DB calls.
 *
 * `Holding` is the client-facing shape the whole app already reads (see
 * `@/lib/portfolio`). A DB `Account` row maps to exactly one `Holding`.
 */

import { z } from 'zod'
import { LIABILITY_TYPES, type CoOwner, type Holding, type HoldingDetails, type Ownership } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'
import { buildImportKey, type ImportIdentity } from '@/lib/import-key'

/**
 * Every account type, as a runtime tuple for zod. `satisfies` keeps it in lockstep
 * with the `AccountType` union — adding an invalid entry is a compile error, and
 * `accounts-api.test.ts` asserts it stays exhaustive against `TYPE_LABELS`.
 */
export const ACCOUNT_TYPES = [
  'checking', 'savings', 'cd', 'bond', 'brokerage', '401k', 'ira', 'roth_ira', 'real_estate',
  'nre', 'nro', 'fcnr', 'fd', 'mutual_fund', 'property', 'gold', 'vehicle', 'notes_receivable', 'other',
  'notes_payable', 'mortgage', 'heloc', 'home_loan', 'auto_loan', 'student_loan', 'education_loan',
  'personal_loan', 'credit_card', 'other_debt',
] as const satisfies readonly AccountType[]

const COUNTRIES = ['US', 'IN'] as const
const SOURCES = ['manual', 'plaid', 'setu', 'pdf_upload'] as const
const KINDS = ['asset', 'liability'] as const
const OWNERSHIPS = ['self', 'joint', 'family'] as const satisfies readonly Ownership[]
const RELATIONS = ['spouse', 'father', 'mother', 'sibling', 'child', 'other'] as const

/** One co-holder / title-holder. Name is optional for a named relation ("Father"). */
export const coOwnerSchema = z.object({
  name: z.string().trim().max(80).default(''),
  relation: z.enum(RELATIONS),
})

/** Instrument-specific details — mirrors `HoldingDetails`. Unknown keys are stripped. */
export const detailsSchema = z.object({
  interestRate: z.number().optional(),
  expectedReturn: z.number().optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'maturityDate must be YYYY-MM-DD').optional(),
  compounding: z.enum(['monthly', 'quarterly', 'half_yearly', 'annually', 'maturity']).optional(),
  depositCurrency: z.enum(['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'INR']).optional(),
  tdsRate: z.number().optional(),
  fdScheme: z.enum(['NRE', 'NRO']).optional(),
  isSgb: z.boolean().optional(),
  minPayment: z.number().optional(),
  assetType: z.enum(['folio_fund', 'custodial_security', 'deposit', 'other']).optional(),
  folio: z.string().max(64).optional(),
  accountRef: z.string().max(64).optional(),
  instrumentId: z.string().max(160).optional(),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'statementDate must be YYYY-MM-DD').optional(),
})

// Shared field definitions. `createAccountSchema` layers required-ness + defaults on
// top; `updateAccountSchema` makes every field optional (a PATCH touches a subset).
const baseFields = {
  nickname: z.string().trim().min(1, 'nickname is required').max(120),
  institution: z.string().trim().min(1, 'institution is required').max(120),
  accountType: z.enum(ACCOUNT_TYPES),
  country: z.enum(COUNTRIES),
  // Balances are stored as positive magnitudes for both assets and liabilities;
  // `usdValue()` applies the sign from `kind`. Both currencies travel together.
  balanceUsd: z.number().min(0, 'balanceUsd cannot be negative'),
  balanceInr: z.number().min(0, 'balanceInr cannot be negative'),
  isPfic: z.boolean(),
  source: z.enum(SOURCES),
  kind: z.enum(KINDS),
  // Nullable so a PATCH can explicitly clear the link / details (null), distinct
  // from "leave unchanged" (omitted / undefined).
  securedAgainstId: z.string().min(1).nullable(),
  details: detailsSchema.nullable(),
  ownership: z.enum(OWNERSHIPS),
  coOwners: z.array(coOwnerSchema).max(10).nullable(),
  plaidAccountId: z.string().min(1).nullable(),
}

export const createAccountSchema = z.object({
  ...baseFields,
  balanceUsd: baseFields.balanceUsd.default(0),
  balanceInr: baseFields.balanceInr.default(0),
  isPfic: baseFields.isPfic.default(false),
  source: baseFields.source.default('manual'),
  kind: baseFields.kind.default('asset'),
  securedAgainstId: baseFields.securedAgainstId.optional(),
  details: baseFields.details.optional(),
  ownership: baseFields.ownership.default('self'),
  coOwners: baseFields.coOwners.optional(),
  plaidAccountId: baseFields.plaidAccountId.optional(),
})

/**
 * PATCH: any subset of fields, no defaults (so omitted fields stay untouched).
 * `confirmBalance` isn't stored: it marks a "mark updated" (the user confirming
 * today's balance), which records a history snapshot even though nothing changed.
 * `allowOlder` isn't stored either: it lets a statement import overwrite a balance with
 * one from an older statement (see `isOlderStatement`).
 */
export const updateAccountSchema = z
  .object({ ...baseFields, confirmBalance: z.boolean(), allowOlder: z.boolean() })
  .partial()

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

/** The subset of a DB Account row this module reads. The Prisma `Account` satisfies it. */
export interface AccountRecord {
  id: string
  nickname: string
  institution: string
  accountType: string
  country: string
  balanceUsd: number
  balanceInr: number
  isPfic: boolean
  source: string
  kind: string
  securedAgainstId: string | null
  ownership: string
  coOwners: unknown
  details: unknown
  lastSyncedAt: Date | null
  importAssetType?: string | null
  folio?: string | null
  accountRef?: string | null
  instrumentId?: string | null
  statementDate?: string | null
}

type IdentityDetails = Pick<HoldingDetails, 'assetType' | 'folio' | 'accountRef' | 'instrumentId' | 'statementDate'>

function splitIdentity(details: HoldingDetails | null | undefined): {
  identity: IdentityDetails | undefined
  rest: HoldingDetails | undefined
} {
  if (!details) return { identity: undefined, rest: undefined }
  const { assetType, folio, accountRef, instrumentId, statementDate, ...rest } = details
  const identity = assetType ? { assetType, folio, accountRef, instrumentId, statementDate } : undefined
  return { identity, rest: cleanDetails(rest) }
}

function identityColumns(identity: IdentityDetails | undefined, institution: string) {
  if (!identity?.assetType) return {}
  const parts: ImportIdentity = { assetType: identity.assetType, institution, folio: identity.folio, accountRef: identity.accountRef, instrumentId: identity.instrumentId }
  return {
    importAssetType: identity.assetType,
    folio: identity.folio ?? null,
    accountRef: identity.accountRef ?? null,
    instrumentId: identity.instrumentId ?? null,
    statementDate: identity.statementDate ?? null,
    importKey: buildImportKey(parts),
  }
}

/** True when an incoming statement is older than the one a holding was last updated from. */
export function isOlderStatement(incoming: string | undefined, existing: string | null | undefined): boolean {
  return !!incoming && !!existing && incoming < existing
}

/** Drop undefined keys and re-validate; returns undefined when nothing meaningful is left. */
function cleanDetails(details: unknown): HoldingDetails | undefined {
  if (!details || typeof details !== 'object') return undefined
  const parsed = detailsSchema.safeParse(details)
  if (!parsed.success) return undefined
  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  return entries.length > 0 ? (Object.fromEntries(entries) as HoldingDetails) : undefined
}

/** Validate stored co-owners; `self` never carries any (they'd be meaningless). */
function cleanCoOwners(ownership: string, coOwners: unknown): CoOwner[] | undefined {
  if (ownership === 'self' || !Array.isArray(coOwners)) return undefined
  const parsed = z.array(coOwnerSchema).safeParse(coOwners)
  return parsed.success && parsed.data.length > 0 ? parsed.data : undefined
}

/** Native currency of the account — an FCNR deposit overrides its country default. */
function deriveCurrency(country: string, details: HoldingDetails | undefined): string {
  if (details?.depositCurrency) return details.depositCurrency
  return country === 'IN' ? 'INR' : 'USD'
}

/** A liability type is always a liability, whatever the caller passed for `kind`. */
function resolveKind(accountType: AccountType, kind: 'asset' | 'liability'): 'asset' | 'liability' {
  return LIABILITY_TYPES.has(accountType) ? 'liability' : kind
}

/** Map a DB row to the client `Holding` shape the rest of the app consumes. */
export function toHolding(row: AccountRecord): Holding {
  const holding: Holding = {
    id: row.id,
    nickname: row.nickname,
    institution: row.institution,
    accountType: row.accountType as AccountType,
    country: row.country as 'US' | 'IN',
    balanceUsd: row.balanceUsd,
    balanceInr: row.balanceInr,
    isPfic: row.isPfic,
    source: row.source as Holding['source'],
    kind: row.kind === 'liability' ? 'liability' : 'asset',
  }
  if (row.securedAgainstId) holding.securedAgainstId = row.securedAgainstId
  if (row.ownership === 'joint' || row.ownership === 'family') {
    holding.ownership = row.ownership
    const coOwners = cleanCoOwners(row.ownership, row.coOwners)
    if (coOwners) holding.coOwners = coOwners
  }
  const details: HoldingDetails = { ...cleanDetails(row.details) }
  if (row.importAssetType) {
    details.assetType = row.importAssetType as HoldingDetails['assetType']
    if (row.folio) details.folio = row.folio
    if (row.accountRef) details.accountRef = row.accountRef
    if (row.instrumentId) details.instrumentId = row.instrumentId
    if (row.statementDate) details.statementDate = row.statementDate
  }
  if (Object.keys(details).length > 0) holding.details = details
  // Serialize the Date to an ISO string — the client reads freshness off this.
  if (row.lastSyncedAt) holding.lastSyncedAt = row.lastSyncedAt.toISOString()
  return holding
}

/** Build the Prisma `create` payload from validated input, scoped to a user. */
export function toCreateData(input: CreateAccountInput, userId: string) {
  const kind = resolveKind(input.accountType, input.kind)
  const { identity, rest: details } = splitIdentity(input.details)
  return {
    ...identityColumns(identity, input.institution),
    userId,
    nickname: input.nickname,
    institution: input.institution,
    accountType: input.accountType,
    country: input.country,
    balanceUsd: input.balanceUsd,
    balanceInr: input.balanceInr,
    currency: deriveCurrency(input.country, details),
    isManual: input.source === 'manual',
    source: input.source,
    kind,
    isPfic: input.isPfic,
    // Only a liability can be secured against an asset; assets never carry the link.
    securedAgainstId: kind === 'liability' ? (input.securedAgainstId ?? null) : null,
    details: details ?? undefined,
    ownership: input.ownership,
    coOwners: cleanCoOwners(input.ownership, input.coOwners),
    plaidAccountId: input.plaidAccountId ?? null,
    // A manual write is the user telling us "this is current" — stamp freshness.
    lastSyncedAt: new Date(),
  }
}

/**
 * Build the Prisma `update` payload, touching only the keys the PATCH provided.
 * `details` may be `null` here to mean "clear it"; the route translates that to
 * Prisma's JSON-null sentinel. `lastSyncedAt` is always refreshed on an edit.
 */
export function toUpdateData(patch: UpdateAccountInput, existingInstitution = ''): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  if (patch.nickname !== undefined) data.nickname = patch.nickname
  if (patch.institution !== undefined) data.institution = patch.institution
  if (patch.country !== undefined) data.country = patch.country
  if (patch.balanceUsd !== undefined) data.balanceUsd = patch.balanceUsd
  if (patch.balanceInr !== undefined) data.balanceInr = patch.balanceInr
  if (patch.isPfic !== undefined) data.isPfic = patch.isPfic
  if (patch.plaidAccountId !== undefined) data.plaidAccountId = patch.plaidAccountId

  if (patch.source !== undefined) {
    data.source = patch.source
    data.isManual = patch.source === 'manual'
  }

  // Keep `kind` consistent with the type: switching to a liability type forces
  // liability; otherwise an explicit `kind` wins.
  if (patch.accountType !== undefined) {
    data.accountType = patch.accountType
    if (LIABILITY_TYPES.has(patch.accountType)) data.kind = 'liability'
  }
  if (patch.kind !== undefined && data.kind === undefined) data.kind = patch.kind

  if (patch.securedAgainstId !== undefined) data.securedAgainstId = patch.securedAgainstId

  // Co-owners only mean something alongside a non-self ownership; switching to
  // `self` clears them. `null` coOwners => clear (route maps to Prisma.DbNull).
  if (patch.ownership !== undefined) {
    data.ownership = patch.ownership
    if (patch.ownership === 'self') data.coOwners = null
  }
  if (patch.coOwners !== undefined && data.coOwners === undefined) {
    data.coOwners = patch.coOwners && patch.coOwners.length > 0 ? patch.coOwners : null
  }

  if (patch.details !== undefined) {
    // null => clear; an object => cleaned (an all-empty object also clears).
    const { identity, rest } = splitIdentity(patch.details)
    data.details = patch.details === null ? null : (rest ?? null)
    Object.assign(data, identityColumns(identity, patch.institution ?? existingInstitution))
  }

  if (Object.keys(data).length > 0) data.lastSyncedAt = new Date()
  return data
}

/** Flatten a ZodError into a short, human-readable message for a 400 response. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const path = i.path.join('.')
      return path ? `${path}: ${i.message}` : i.message
    })
    .join('; ')
}
