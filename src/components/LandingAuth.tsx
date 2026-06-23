"use client";

import { useState } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";
import {
  LineChart,
  ArrowLeftRight,
  ShieldCheck,
  Sparkles,
  Lock,
} from "lucide-react";

// Flatten Clerk's own card chrome so the form sits inside our panel seamlessly.
// Unknown element keys are ignored, so this is safe across Clerk versions.
const FLAT_CLERK = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0",
    card: "shadow-none border-0 bg-transparent",
  },
} as const;

const FEATURES = [
  {
    icon: LineChart,
    title: "One unified net worth",
    body: "Everything you own across the US and India — checking, brokerage, 401(k), NRE/NRO, FDs, property — on a single screen, in $ and ₹.",
  },
  {
    icon: ArrowLeftRight,
    title: "Multi-currency, live FX",
    body: "Balances convert automatically at live exchange rates, so your true picture never depends on which currency you think in.",
  },
  {
    icon: ShieldCheck,
    title: "Built-in NRI compliance",
    body: "FBAR (FinCEN 114), FATCA / Form 8938 and PFIC exposure are tracked as your balances move — no spreadsheets, no surprises at tax time.",
  },
  {
    icon: Sparkles,
    title: "AI wealth copilot",
    body: "Ask about repatriation, the 182-day rule, DTAA or PFIC elections — answered against your real portfolio, in plain English.",
  },
  {
    icon: Lock,
    title: "Bank-grade security",
    body: "Banks connect through Plaid, access tokens are encrypted at rest, and your financial data is visible only to you.",
  },
];

export default function LandingAuth() {
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");

  return (
    <div className="relative flex min-h-screen flex-1 overflow-y-auto">
      <div aria-hidden className="hero-mesh" />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-10 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-12">
        {/* ── Left: the pitch ─────────────────────────────────────────── */}
        <section className="flex flex-col justify-center">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip h-9 w-9 text-base font-bold">N</span>
            <span className="text-lg font-semibold tracking-tight">NRIWB</span>
          </div>

          <p className="eyebrow mt-10">For NRIs building wealth in two countries</p>

          <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            All your wealth,{" "}
            <span className="text-gradient-brand">across borders</span> — finally
            on one screen.
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-[1.05rem] leading-relaxed text-muted-foreground">
            NRIWB unifies what you own in the United States and India into a
            single, live net-worth view — with US↔India tax compliance built in,
            so nothing slips through the cracks between two systems.
          </p>

          <ul className="stagger mt-9 flex flex-col gap-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="icon-chip mt-0.5 h-9 w-9">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <div>
                  <p className="font-medium leading-snug">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-us" /> United States
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-india" /> India
            </span>
            <span className="text-border">·</span>
            <span>Connections via Plaid</span>
            <span className="text-border">·</span>
            <span>Encrypted at rest</span>
          </div>
        </section>

        {/* ── Right: the auth card ────────────────────────────────────── */}
        <section className="flex flex-col items-center lg:items-end">
          <div className="card-surface w-full max-w-md animate-scale-in overflow-hidden p-1.5">
            <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0 rounded-t-[inherit]" />

            <div className="px-6 pb-5 pt-7 text-center">
              <h2 className="text-xl font-semibold tracking-tight">
                {mode === "sign-up"
                  ? "Create your account"
                  : "Welcome back"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "sign-up"
                  ? "Start tracking your cross-border net worth in minutes."
                  : "Sign in to your unified wealth dashboard."}
              </p>
            </div>

            {/* Segmented toggle */}
            <div className="mx-6 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setMode("sign-up")}
                aria-pressed={mode === "sign-up"}
                className={`rounded-md px-3 py-1.5 transition ${
                  mode === "sign-up"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setMode("sign-in")}
                aria-pressed={mode === "sign-in"}
                className={`rounded-md px-3 py-1.5 transition ${
                  mode === "sign-in"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign in
              </button>
            </div>

            <div className="flex justify-center px-2 pb-4 pt-3">
              {mode === "sign-up" ? (
                <SignUp routing="hash" appearance={FLAT_CLERK} />
              ) : (
                <SignIn routing="hash" appearance={FLAT_CLERK} />
              )}
            </div>
          </div>

          <p className="mt-4 max-w-md text-center text-xs leading-relaxed text-muted-foreground lg:text-right">
            NRIWB is informational and does not provide tax, legal, or investment
            advice. By continuing you agree to our terms and privacy policy.
          </p>
        </section>
      </div>
    </div>
  );
}
