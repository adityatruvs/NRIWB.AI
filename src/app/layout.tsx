import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import "./globals.css";
import LandingAuth from "@/components/LandingAuth";
import TopNav from "@/components/TopNav";
import Sidebar from "@/components/Sidebar";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { AccountsProvider } from "@/context/AccountsContext";
import { ThemeProvider } from "@/context/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NRIWB — Cross-border wealth, unified",
  description:
    "One screen for everything you own across the US and India — net worth, multi-currency, and built-in FBAR, FATCA & PFIC compliance for NRIs.",
};

// Set the theme class before paint to avoid a flash of the wrong theme.
// Defaults to light — dark is only applied when the user explicitly chose it.
const themeScript = `
(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-full flex-col bg-background text-foreground">
        <div aria-hidden className="page-aurora" />
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ThemeProvider>
            <CurrencyProvider>
              <AccountsProvider>
                <Show when="signed-out">
                  <LandingAuth />
                </Show>
                <Show when="signed-in">
                  <TopNav />
                  <div className="flex flex-1 overflow-hidden">
                    <Sidebar />
                    <main className="flex-1 overflow-y-auto">
                      <div className="mx-auto w-full max-w-[1600px] px-6 py-8 sm:px-8 lg:px-12">
                        <div className="mb-4 flex justify-end">
                          <UserButton />
                        </div>
                        {children}
                      </div>
                    </main>
                  </div>
                </Show>
              </AccountsProvider>
            </CurrencyProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
