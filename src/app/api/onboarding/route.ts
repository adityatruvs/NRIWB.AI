import { clerkClient } from "@clerk/nextjs/server";
import { requireUserId, unauthorized, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseOnboarding } from "@/lib/onboarding";

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized();
    throw e;
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOnboarding(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { profile, compliance } = parsed;

  // Profile / identity lives with the Clerk identity; financial data lives in our
  // own DB. Standard name fields promote to Clerk's first/last; everything else
  // goes in private (server-only) metadata.
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    firstName: profile.firstName,
    lastName: profile.lastName,
    privateMetadata: {
      dateOfBirth: profile.dateOfBirth,
      countryOfResidence: profile.countryOfResidence,
      // Kept for backward-compat with older reads that used `taxStatus`.
      taxStatus: profile.usImmigrationStatus,
      usImmigrationStatus: profile.usImmigrationStatus,
      usState: profile.usState,
      yearMovedToUs: profile.yearMovedToUs,
      indiaTaxResidency: profile.indiaTaxResidency,
      planningHorizon: profile.planningHorizon,
      usFilingStatus: profile.usFilingStatus,
      hasSsnOrItin: profile.hasSsnOrItin,
      hasPan: profile.hasPan,
      filesTaxesIn: profile.filesTaxesIn,
      foreignAccountsOver10k: profile.foreignAccountsOver10k,
      ownsForeignFunds: profile.ownsForeignFunds,
      incomeRange: profile.incomeRange,
      netWorthRange: profile.netWorthRange,
      riskTolerance: profile.riskTolerance,
      goals: profile.goals,
      holdings: profile.holdings,
      targetRetirementAge: profile.targetRetirementAge,
      maritalStatus: profile.maritalStatus,
      numChildren: profile.numChildren,
      supportsParentsIndia: profile.supportsParentsIndia,
      sendsRemittances: profile.sendsRemittances,
      monthlyRemittanceUsd: profile.monthlyRemittanceUsd,
      phone: profile.phone,
      occupation: profile.occupation,
      employer: profile.employer,
      onboardingComplete: true,
      onboardedAt: new Date().toISOString(),
    },
  });

  // The two numeric compliance inputs are the source of truth for the dashboard's
  // residency KPI + LRS tracking, so they live in the DB (scoped to the user).
  await prisma.complianceData.upsert({
    where: { userId },
    create: {
      userId,
      indiaDaysCurrentYear: compliance.indiaDaysCurrentYear,
      lrsUsedUsd: compliance.lrsUsedUsd,
    },
    update: {
      indiaDaysCurrentYear: compliance.indiaDaysCurrentYear,
      lrsUsedUsd: compliance.lrsUsedUsd,
    },
  });

  return Response.json({ success: true });
}
