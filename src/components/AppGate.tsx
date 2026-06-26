import { currentUser } from "@clerk/nextjs/server";
import Onboarding from "@/components/Onboarding";
import TopNav from "@/components/TopNav";
import Sidebar from "@/components/Sidebar";
import { ProfileProvider } from "@/context/ProfileContext";

// Renders for signed-in users only (nested inside <Show when="signed-in">).
// Until the profile is complete we show onboarding; after that, the dashboard.
export default async function AppGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const meta = (user?.privateMetadata ?? {}) as {
    onboardingComplete?: boolean;
    dateOfBirth?: string;
    countryOfResidence?: string;
    taxStatus?: string;
  };

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
    <ProfileProvider
      dateOfBirth={meta.dateOfBirth ?? null}
      countryOfResidence={meta.countryOfResidence ?? null}
      taxStatus={meta.taxStatus ?? null}
    >
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-6 py-8 sm:px-8 lg:px-12">
            {children}
          </div>
        </main>
      </div>
    </ProfileProvider>
  );
}
