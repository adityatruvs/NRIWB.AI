import { MOCK_USER_ID } from "./user"
import type { AccountType, AccountSource } from "@/types/accounts"

// Approximate USD/INR rate used for seeding mock data
// Real rate is fetched live from ExchangeRate-API
const SEED_RATE = 83.5

interface MockAccount {
  userId: string
  nickname: string
  institution: string
  accountType: AccountType
  country: "US" | "IN"
  balanceUsd: number
  balanceInr: number
  currency: string
  isManual: boolean
  source: AccountSource
  isPfic: boolean
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  // ── US Accounts ──────────────────────────────────────────────────────────
  {
    userId: MOCK_USER_ID,
    nickname: "Chase Checking",
    institution: "Chase",
    accountType: "checking",
    country: "US",
    balanceUsd: 12500,
    balanceInr: 12500 * SEED_RATE,
    currency: "USD",
    isManual: true,
    source: "manual",
    isPfic: false,
  },
  {
    userId: MOCK_USER_ID,
    nickname: "Fidelity Brokerage",
    institution: "Fidelity",
    accountType: "brokerage",
    country: "US",
    balanceUsd: 150000,
    balanceInr: 150000 * SEED_RATE,
    currency: "USD",
    isManual: true,
    source: "manual",
    isPfic: false,
  },
  {
    userId: MOCK_USER_ID,
    nickname: "Vanguard 401(k)",
    institution: "Vanguard",
    accountType: "401k",
    country: "US",
    balanceUsd: 280000,
    balanceInr: 280000 * SEED_RATE,
    currency: "USD",
    isManual: true,
    source: "manual",
    isPfic: false,
  },
  {
    userId: MOCK_USER_ID,
    nickname: "Primary Home (Bay Area)",
    institution: "Real Estate",
    accountType: "real_estate",
    country: "US",
    balanceUsd: 250000, // equity only (value minus mortgage)
    balanceInr: 250000 * SEED_RATE,
    currency: "USD",
    isManual: true,
    source: "manual",
    isPfic: false,
  },

  // ── India Accounts ────────────────────────────────────────────────────────
  {
    userId: MOCK_USER_ID,
    nickname: "HDFC NRE FD",
    institution: "HDFC Bank",
    accountType: "nre",
    country: "IN",
    balanceUsd: 4500000 / SEED_RATE, // ₹45L
    balanceInr: 4500000,
    currency: "INR",
    isManual: true,
    source: "manual",
    isPfic: false,
  },
  {
    userId: MOCK_USER_ID,
    nickname: "SBI NRO Savings",
    institution: "SBI",
    accountType: "nro",
    country: "IN",
    balanceUsd: 800000 / SEED_RATE, // ₹8L
    balanceInr: 800000,
    currency: "INR",
    isManual: true,
    source: "manual",
    isPfic: false,
  },
  {
    userId: MOCK_USER_ID,
    nickname: "HDFC Mutual Fund",
    institution: "HDFC AMC",
    accountType: "mutual_fund",
    country: "IN",
    balanceUsd: 1800000 / SEED_RATE, // ₹18L
    balanceInr: 1800000,
    currency: "INR",
    isManual: true,
    source: "manual",
    isPfic: true, // India MFs are PFICs — flag immediately
  },
  {
    userId: MOCK_USER_ID,
    nickname: "SBI Fixed Deposit",
    institution: "SBI",
    accountType: "fd",
    country: "IN",
    balanceUsd: 1200000 / SEED_RATE, // ₹12L
    balanceInr: 1200000,
    currency: "INR",
    isManual: true,
    source: "manual",
    isPfic: false,
  },
]
