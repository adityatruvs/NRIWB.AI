'use client'

import { createContext, useContext, useMemo } from 'react'

/**
 * The slice of the user's onboarding profile the client needs. `dateOfBirth`
 * lives in Clerk private metadata (server-only), so AppGate reads it on the
 * server and seeds this provider — that's how `age` becomes available to
 * client features like the Analyzer without an extra round-trip.
 */
interface ProfileContextValue {
  /** ISO date string (YYYY-MM-DD) or null if not yet onboarded. */
  dateOfBirth: string | null
  countryOfResidence: string | null
  taxStatus: string | null
  /** Days spent in India this year — from ComplianceData; powers the residency KPI. */
  indiaDaysCurrentYear: number | null
  /** conservative | moderate | aggressive — powers the analyzer's recommended split. */
  riskTolerance: string | null
  /** Whole years, derived live from `dateOfBirth`. Null if unknown. */
  age: number | null
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

/** Whole-year age from an ISO date of birth. Returns null on bad/empty input. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 130 ? age : null
}

export function ProfileProvider({
  dateOfBirth = null,
  countryOfResidence = null,
  taxStatus = null,
  indiaDaysCurrentYear = null,
  riskTolerance = null,
  children,
}: {
  dateOfBirth?: string | null
  countryOfResidence?: string | null
  taxStatus?: string | null
  indiaDaysCurrentYear?: number | null
  riskTolerance?: string | null
  children: React.ReactNode
}) {
  const value = useMemo<ProfileContextValue>(
    () => ({
      dateOfBirth,
      countryOfResidence,
      taxStatus,
      indiaDaysCurrentYear,
      riskTolerance,
      age: ageFromDob(dateOfBirth),
    }),
    [dateOfBirth, countryOfResidence, taxStatus, indiaDaysCurrentYear, riskTolerance],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

/**
 * Read the onboarding profile. Returns safe nulls when used outside a provider
 * (the profile is optional context, never a hard dependency).
 */
export function useProfile(): ProfileContextValue {
  return (
    useContext(ProfileContext) ?? {
      dateOfBirth: null,
      countryOfResidence: null,
      taxStatus: null,
      indiaDaysCurrentYear: null,
      riskTolerance: null,
      age: null,
    }
  )
}
