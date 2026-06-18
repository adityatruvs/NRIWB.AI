import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
        <ThemeProvider>
          <CurrencyProvider>
            <AccountsProvider>
              <TopNav />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto">
                  <div className="mx-auto w-full max-w-[1600px] px-6 py-8 sm:px-8 lg:px-12">
                    {children}
                  </div>
                </main>
              </div>
            </AccountsProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
