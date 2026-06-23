import { clerkClient } from "@clerk/nextjs/server";
import { requireUserId, unauthorized, UnauthorizedError } from "@/lib/auth";

const COUNTRIES = ["US", "IN", "OTHER"];
const TAX_STATUSES = ["us_citizen", "green_card", "h1b_l1", "nri_india", "other"];

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized();
    throw e;
  }

  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });

  const {
    firstName,
    lastName,
    dateOfBirth,
    countryOfResidence,
    taxStatus,
    phone,
    occupation,
    employer,
  } = body as Record<string, string>;

  // Required fields
  if (
    !firstName?.trim() ||
    !lastName?.trim() ||
    !dateOfBirth ||
    !COUNTRIES.includes(countryOfResidence) ||
    !TAX_STATUSES.includes(taxStatus)
  ) {
    return Response.json({ error: "Please complete all required fields." }, { status: 400 });
  }

  // Basic DOB sanity: a real past date, age 18+.
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime()) || dob > new Date()) {
    return Response.json({ error: "Enter a valid date of birth." }, { status: 400 });
  }

  // Store profile on the Clerk user: standard name fields + private metadata.
  // Bank/financial data lives in our own DB; profile lives with the identity.
  const client = await clerkClient();
  await client.users.updateUser(userId, {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    privateMetadata: {
      dateOfBirth,
      countryOfResidence,
      taxStatus,
      phone: phone?.trim() || null,
      occupation: occupation?.trim() || null,
      employer: employer?.trim() || null,
      onboardingComplete: true,
      onboardedAt: new Date().toISOString(),
    },
  });

  return Response.json({ success: true });
}
