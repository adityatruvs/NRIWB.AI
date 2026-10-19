import { connection } from "next/server";
import { Show } from "@clerk/nextjs";
import LandingAuth from "@/components/LandingAuth";
import AppGate from "@/components/AppGate";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { getFxSnapshot } from "@/lib/fx";

// Auth gate for the application routes. Signed-out visitors get the marketing
// + auth landing; signed-in users get the onboarding/dashboard shell.
// Public routes (e.g. /privacy) live outside this group so they render for
// everyone, including Plaid's reviewers who have no account.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every number in the app uses the live USD/INR rate from the first render:
  // read it per request (never baked in at build), then the client keeps polling.
  await connection();
  // No rate at all (live API down and none ever saved): the provider waits for one.
  const fx = await getFxSnapshot().catch(() => null);
  return (
    <>
      <Show when="signed-out">
        <LandingAuth />
      </Show>
      <Show when="signed-in">
        {/* Only the signed-in app needs a rate: sign-in never waits on one. */}
        <CurrencyProvider initialRate={fx?.rate} initialUpdatedAt={fx?.updatedAt ?? null}>
          <AppGate>{children}</AppGate>
        </CurrencyProvider>
      </Show>
    </>
  );
}
