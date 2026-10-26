import { currentUser } from "@clerk/nextjs/server";
import Onboarding, { type OnboardingForm } from "@/components/Onboarding";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) return null;

  const meta = user.privateMetadata as Record<string, unknown>;
  const compliance = await prisma.complianceData.findUnique({ where: { userId: user.id } });

  const text = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  const numText = (v: unknown) => (typeof v === "number" ? String(v) : "");
  const list = (k: string) =>
    Array.isArray(meta[k]) ? (meta[k] as unknown[]).filter((x): x is string => typeof x === "string") : [];

  // Stored as YYYY-MM-DD; the form's month select is 0-indexed.
  const [y, m, d] = text("dateOfBirth").split("-").map(Number);
  const hasDob = Boolean(y && m && d);

  const initial: Partial<OnboardingForm> = {
    dobYear: hasDob ? String(y) : "",
    dobMonth: hasDob ? String(m - 1) : "",
    dobDay: hasDob ? String(d) : "",
    countryOfResidence: text("countryOfResidence"),
    usImmigrationStatus: text("usImmigrationStatus") || text("taxStatus"),
    usState: text("usState"),
    yearMovedToUs: numText(meta.yearMovedToUs),
    indiaTaxResidency: text("indiaTaxResidency"),
    indiaDaysCurrentYear: numText(compliance?.indiaDaysCurrentYear),
    planningHorizon: text("planningHorizon"),
    usFilingStatus: text("usFilingStatus"),
    hasSsnOrItin: text("hasSsnOrItin"),
    hasPan: text("hasPan"),
    filesTaxesIn: text("filesTaxesIn"),
    foreignAccountsOver10k: text("foreignAccountsOver10k"),
    ownsForeignFunds: text("ownsForeignFunds"),
    incomeRange: text("incomeRange"),
    netWorthRange: text("netWorthRange"),
    riskTolerance: text("riskTolerance"),
    lrsUsedUsd: numText(compliance?.lrsUsedUsd),
    goals: list("goals"),
    holdings: list("holdings"),
    targetRetirementAge: numText(meta.targetRetirementAge),
    maritalStatus: text("maritalStatus"),
    numChildren: numText(meta.numChildren),
    supportsParentsIndia: text("supportsParentsIndia"),
    sendsRemittances: text("sendsRemittances"),
    monthlyRemittanceUsd: numText(meta.monthlyRemittanceUsd),
    phone: text("phone"),
    occupation: text("occupation"),
    employer: text("employer"),
  };

  return (
    <Onboarding
      mode="edit"
      firstName={user.firstName ?? ""}
      lastName={user.lastName ?? ""}
      email={user.primaryEmailAddress?.emailAddress ?? ""}
      initial={initial}
    />
  );
}
