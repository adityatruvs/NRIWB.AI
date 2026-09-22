/**
 * Onboarding schema — the single source of truth for the sign-up wizard.
 *
 * Both the client form (components/Onboarding.tsx) and the server route
 * (api/onboarding) import these option lists + the validator, so the two can
 * never drift. Profile/identity fields are stored on the Clerk user
 * (privateMetadata); the two numeric compliance inputs (days in India, LRS used)
 * are written to the ComplianceData table so the dashboard reads real values.
 */

export interface Option {
  value: string
  label: string
}

/* ── Step 1 — Identity & residency ────────────────────────────────────────── */

export const COUNTRIES: Option[] = [
  { value: 'US', label: 'United States' },
  { value: 'IN', label: 'India' },
  { value: 'OTHER', label: 'Other' },
]

// Expanded from the original 5 — immigration status drives US *and* India tax
// treatment (e.g. F-1/J-1 are often non-resident aliens with no FBAR duty).
export const US_IMMIGRATION_STATUSES: Option[] = [
  { value: 'us_citizen', label: 'U.S. Citizen' },
  { value: 'green_card', label: 'Green Card / LPR' },
  { value: 'h1b', label: 'H-1B' },
  { value: 'h4', label: 'H-4 (dependent)' },
  { value: 'l1', label: 'L-1' },
  { value: 'l2', label: 'L-2 (dependent)' },
  { value: 'f1_opt', label: 'F-1 / OPT / STEM' },
  { value: 'j1', label: 'J-1' },
  { value: 'o1', label: 'O-1' },
  { value: 'e2_e3', label: 'E-2 / E-3' },
  { value: 'tn', label: 'TN' },
  { value: 'other', label: 'Other' },
]

// India tax-residency status — decides whether India taxes worldwide income.
// RNOR is a valuable transitional window worth surfacing.
export const INDIA_TAX_RESIDENCY: Option[] = [
  { value: 'nri', label: 'NRI — Non-Resident Indian' },
  { value: 'rnor', label: 'RNOR — Resident, Not Ordinarily Resident' },
  { value: 'resident', label: 'Resident of India' },
  { value: 'unsure', label: "Not sure — help me figure it out" },
]

export const PLANNING_HORIZONS: Option[] = [
  { value: 'stay_us', label: 'Staying in the U.S. long-term' },
  { value: 'return_india', label: 'Planning to return to India' },
  { value: 'undecided', label: 'Undecided' },
]

// U.S. states + DC (state tax context). Value = USPS code.
export const US_STATES: Option[] = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
].map((s) => ({ value: s, label: s }))

/* ── Step 2 — Tax & finances ──────────────────────────────────────────────── */

export const US_FILING_STATUSES: Option[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
  { value: 'hoh', label: 'Head of household' },
]

export const YES_NO_UNSURE: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
]

export const FILES_TAXES_IN: Option[] = [
  { value: 'us', label: 'U.S. only' },
  { value: 'india', label: 'India only' },
  { value: 'both', label: 'Both' },
]

export const INCOME_RANGES: Option[] = [
  { value: 'lt_50k', label: 'Under $50k' },
  { value: '50_100k', label: '$50k – $100k' },
  { value: '100_200k', label: '$100k – $200k' },
  { value: '200_500k', label: '$200k – $500k' },
  { value: 'gt_500k', label: 'Over $500k' },
  { value: 'prefer_not', label: 'Prefer not to say' },
]

export const NET_WORTH_RANGES: Option[] = [
  { value: 'lt_100k', label: 'Under $100k' },
  { value: '100_500k', label: '$100k – $500k' },
  { value: '500k_1m', label: '$500k – $1M' },
  { value: '1_5m', label: '$1M – $5M' },
  { value: 'gt_5m', label: 'Over $5M' },
  { value: 'prefer_not', label: 'Prefer not to say' },
]

export const RISK_TOLERANCES: Option[] = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
]

/* ── Step 3 — Goals & family ──────────────────────────────────────────────── */

export const GOAL_OPTIONS: Option[] = [
  { value: 'retirement', label: 'Retirement' },
  { value: 'education', label: "Child's education" },
  { value: 'property_us', label: 'Buy property (U.S.)' },
  { value: 'property_india', label: 'Buy property (India)' },
  { value: 'emergency', label: 'Emergency fund' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
]

export const HOLDING_OPTIONS: Option[] = [
  { value: 'us_bank', label: 'U.S. checking / savings' },
  { value: 'us_brokerage', label: 'U.S. brokerage' },
  { value: 'us_retirement', label: '401(k) / IRA' },
  { value: 'nre', label: 'NRE account' },
  { value: 'nro', label: 'NRO account' },
  { value: 'fcnr', label: 'FCNR account' },
  { value: 'india_fd', label: 'India fixed deposits' },
  { value: 'india_mf', label: 'India mutual funds' },
  { value: 'india_property', label: 'India property' },
  { value: 'gold', label: 'Gold' },
  { value: 'crypto', label: 'Crypto' },
]

export const MARITAL_STATUSES: Option[] = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'other', label: 'Prefer not to say' },
]

/* ── The stored profile shape (Clerk privateMetadata) ─────────────────────── */

export interface OnboardingProfile {
  // Identity
  firstName: string
  lastName: string
  dateOfBirth: string // ISO YYYY-MM-DD
  // Residency & immigration
  countryOfResidence: string
  usImmigrationStatus: string
  usState: string | null
  yearMovedToUs: number | null
  indiaTaxResidency: string
  planningHorizon: string | null
  // Tax
  usFilingStatus: string | null
  hasSsnOrItin: string | null
  hasPan: string | null
  filesTaxesIn: string | null
  foreignAccountsOver10k: string | null
  ownsForeignFunds: string | null
  // Finances
  incomeRange: string | null
  netWorthRange: string | null
  riskTolerance: string | null
  // Goals & family
  goals: string[]
  holdings: string[]
  targetRetirementAge: number | null
  maritalStatus: string | null
  numChildren: number | null
  supportsParentsIndia: string | null
  sendsRemittances: string | null
  // Contact (optional)
  phone: string | null
  occupation: string | null
  employer: string | null
}

/** The two numeric inputs that belong in the ComplianceData table, not metadata. */
export interface ComplianceInputs {
  /** Days spent in India this financial year — feeds the 182-day residency KPI. */
  indiaDaysCurrentYear: number
  /** LRS remitted from India this year (USD) — against the $250k/yr cap. */
  lrsUsedUsd: number
}

const has = (opts: Option[], v: unknown): v is string =>
  typeof v === 'string' && opts.some((o) => o.value === v)

/**
 * Validate + normalize a raw onboarding payload. Returns the profile + compliance
 * inputs on success, or an error string on the first failing required field.
 * Required: the Step-1 identity/residency fields; everything else is optional so
 * a user can skip ahead and complete their profile later.
 */
export function parseOnboarding(
  body: unknown,
): { profile: OnboardingProfile; compliance: ComplianceInputs } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body.' }
  const b = body as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const optStr = (opts: Option[], v: unknown) => (has(opts, v) ? (v as string) : null)
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : null
  }
  const strArr = (opts: Option[], v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => has(opts, x)) : []

  // Required (Step 1)
  const firstName = str(b.firstName)
  const lastName = str(b.lastName)
  if (!firstName || !lastName) return { error: 'Please enter your first and last name.' }

  const dateOfBirth = str(b.dateOfBirth)
  const dob = new Date(dateOfBirth)
  if (!dateOfBirth || Number.isNaN(dob.getTime()) || dob > new Date()) {
    return { error: 'Enter a valid date of birth.' }
  }

  if (!has(COUNTRIES, b.countryOfResidence)) {
    return { error: 'Select your country of residence.' }
  }
  if (!has(US_IMMIGRATION_STATUSES, b.usImmigrationStatus)) {
    return { error: 'Select your U.S. immigration status.' }
  }
  if (!has(INDIA_TAX_RESIDENCY, b.indiaTaxResidency)) {
    return { error: 'Select your India tax-residency status.' }
  }

  const yearMovedToUs = num(b.yearMovedToUs)
  const nowYear = new Date().getFullYear()
  const daysRaw = num(b.indiaDaysCurrentYear) ?? 0
  const indiaDaysCurrentYear = Math.min(366, Math.max(0, Math.round(daysRaw)))
  const lrsRaw = num(b.lrsUsedUsd) ?? 0
  const lrsUsedUsd = Math.max(0, Math.round(lrsRaw))

  const profile: OnboardingProfile = {
    firstName,
    lastName,
    dateOfBirth,
    countryOfResidence: b.countryOfResidence as string,
    usImmigrationStatus: b.usImmigrationStatus as string,
    usState: optStr(US_STATES, b.usState),
    yearMovedToUs:
      yearMovedToUs && yearMovedToUs >= 1950 && yearMovedToUs <= nowYear ? yearMovedToUs : null,
    indiaTaxResidency: b.indiaTaxResidency as string,
    planningHorizon: optStr(PLANNING_HORIZONS, b.planningHorizon),
    usFilingStatus: optStr(US_FILING_STATUSES, b.usFilingStatus),
    hasSsnOrItin: optStr(YES_NO_UNSURE, b.hasSsnOrItin),
    hasPan: optStr(YES_NO_UNSURE, b.hasPan),
    filesTaxesIn: optStr(FILES_TAXES_IN, b.filesTaxesIn),
    foreignAccountsOver10k: optStr(YES_NO_UNSURE, b.foreignAccountsOver10k),
    ownsForeignFunds: optStr(YES_NO_UNSURE, b.ownsForeignFunds),
    incomeRange: optStr(INCOME_RANGES, b.incomeRange),
    netWorthRange: optStr(NET_WORTH_RANGES, b.netWorthRange),
    riskTolerance: optStr(RISK_TOLERANCES, b.riskTolerance),
    goals: strArr(GOAL_OPTIONS, b.goals),
    holdings: strArr(HOLDING_OPTIONS, b.holdings),
    targetRetirementAge: (() => {
      const a = num(b.targetRetirementAge)
      return a && a >= 40 && a <= 90 ? Math.round(a) : null
    })(),
    maritalStatus: optStr(MARITAL_STATUSES, b.maritalStatus),
    numChildren: (() => {
      const c = num(b.numChildren)
      return c != null && c >= 0 && c <= 20 ? Math.round(c) : null
    })(),
    supportsParentsIndia: optStr(YES_NO_UNSURE, b.supportsParentsIndia),
    sendsRemittances: optStr(YES_NO_UNSURE, b.sendsRemittances),
    phone: str(b.phone) || null,
    occupation: str(b.occupation) || null,
    employer: str(b.employer) || null,
  }

  return { profile, compliance: { indiaDaysCurrentYear, lrsUsedUsd } }
}
