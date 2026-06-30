export type AccountType =
  | "checking"
  | "savings"
  | "cd"
  | "bond"
  | "brokerage"
  | "401k"
  | "ira"
  | "roth_ira"
  | "real_estate"
  | "nre"
  | "nro"
  | "fcnr"
  | "fd"
  | "mutual_fund"
  | "property"
  | "gold"
  | "vehicle"
  | "notes_receivable"
  | "other"
  // ── Liabilities (debts) ──
  | "notes_payable"
  | "mortgage"
  | "heloc"
  | "home_loan"
  | "auto_loan"
  | "student_loan"
  | "education_loan"
  | "personal_loan"
  | "credit_card"
  | "other_debt"

export type AccountCountry = "US" | "IN"

export type AccountSource = "manual" | "plaid" | "setu" | "pdf_upload"

export interface AccountRow {
  id: string
  userId: string
  nickname: string
  institution: string
  accountType: AccountType
  country: AccountCountry
  balanceUsd: number
  balanceInr: number
  currency: string
  isManual: boolean
  source: AccountSource
  isPfic: boolean
  plaidAccountId: string | null
  setuConsentId: string | null
  lastSyncedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface NetWorthSummary {
  totalUsd: number
  usTotalUsd: number
  indiaTotalUsd: number
  byAssetClass: {
    usBanks: number
    usInvestments: number
    usRetirement: number
    usRealEstate: number
    indiaNreNro: number
    indiaFd: number
    indiaMf: number
    indiaProperty: number
    indiaGold: number
  }
  fxRate: number
  asOf: Date
}

export type CurrencyMode = "usd" | "inr" | "inr_lakhs"