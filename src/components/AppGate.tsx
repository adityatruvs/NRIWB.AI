import Link from "next/link";
import { Plus } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import Onboarding from "@/components/Onboarding";
import TopNav from "@/components/TopNav";
import Sidebar from "@/components/Sidebar";

// Renders for signed-in users only (nested inside <Show when="signed-in">).
// Until the profile is complete we show onboarding; after that, the dashboard.
export default async function AppGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const meta = (user?.privateMetadata ?? {}) as { onboardingComplete?: boolean };

  if (!meta.onboardingComplete) {
    return (
      <Onboarding
        firstName={user?.firstName ?? ""}
        lastName={user?.lastName ?? ""}
        email={user?.primaryEmailAddress?.emailAddress ?? ""}
      />
    );
  }

  return (
    <>
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-6 py-8 sm:px-8 lg:px-12">
            <div className="mb-6 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Welcome back,{" "}
                <span className="font-medium text-foreground">
                  {user?.firstName}
                </span>
              </p>
              <div className="flex items-center gap-3">
                <Link
                  href="/plaid"
                  className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.75} />
                  Connect account
                </Link>
                <UserButton />
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
