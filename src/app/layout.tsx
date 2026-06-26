import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import "./globals.css";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { AccountsProvider } from "@/context/AccountsContext";
import { GoalsProvider } from "@/context/GoalsContext";
import { BudgetProvider } from "@/context/BudgetContext";
import { ThemeProvider } from "@/context/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Refined transitional serif for large display headings — gives the warm,
// editorial "Anthropic" feel in place of the usual all-sans tech look.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
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
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full`}
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
                <BudgetProvider>
                  <GoalsProvider>{children}</GoalsProvider>
                </BudgetProvider>
              </AccountsProvider>
            </CurrencyProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
