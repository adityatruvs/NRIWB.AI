import { Show } from "@clerk/nextjs";
import LandingAuth from "@/components/LandingAuth";
import AppGate from "@/components/AppGate";

// Auth gate for the application routes. Signed-out visitors get the marketing
// + auth landing; signed-in users get the onboarding/dashboard shell.
// Public routes (e.g. /privacy) live outside this group so they render for
// everyone, including Plaid's reviewers who have no account.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Show when="signed-out">
        <LandingAuth />
      </Show>
      <Show when="signed-in">
        <AppGate>{children}</AppGate>
      </Show>
    </>
  );
}
