export type AccountType =
  | "checking"
  | "savings"
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
  | "other"

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