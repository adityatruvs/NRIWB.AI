"use client";

import { useState } from "react";
import { motion, type Variants } from "motion/react";
import { SignIn, SignUp } from "@clerk/nextjs";
import {
  LineChart,
  ArrowLeftRight,
  ShieldCheck,
  Sparkles,
  Lock,
} from "lucide-react";
import CrossBorderBeams from "@/components/CrossBorderBeams";
import BankMarquee from "@/components/BankMarquee";

// Flatten Clerk's own card chrome so the form sits inside our panel seamlessly.
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
    body: "Checking, brokerage, 401(k), NRE/NRO, FDs, property — across the US and India, in $ and ₹, on one screen.",
  },
  {
    icon: ArrowLeftRight,
    title: "Multi-currency, live FX",
    body: "Balances convert at live rates, so your real picture never depends on which currency you think in.",
  },
  {
    icon: ShieldCheck,
    title: "Built-in NRI compliance",
    body: "FBAR (FinCEN 114), FATCA / Form 8938 and PFIC exposure tracked as your balances move.",
  },
  {
    icon: Sparkles,
    title: "AI wealth copilot",
    body: "Ask about repatriation, the 182-day rule, DTAA or PFIC elections — answered against your real portfolio.",
  },
  {
    icon: Lock,
    title: "Bank-grade security",
    body: "Banks connect through Plaid, access tokens are encrypted at rest, and your data is visible only to you.",
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

export default function LandingAuth() {
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");

  return (
    <div className="relative flex min-h-screen flex-1 flex-col overflow-y-auto">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="relative">
        <div aria-hidden className="hero-mesh" />
        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-12 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-12">
          {/* Left: the pitch */}
          <motion.section
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col justify-center"
          >
            <motion.div variants={item} className="flex items-center gap-2.5">
              <span className="icon-chip h-9 w-9 text-base font-bold">N</span>
              <span className="text-lg font-semibold tracking-tight">NRIWB</span>
            </motion.div>

            <motion.p variants={item} className="eyebrow mt-10">
              For NRIs building wealth in two countries
            </motion.p>

            <motion.h1
              variants={item}
              className="mt-3 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl"
            >
              All your wealth,{" "}
              <span className="text-gradient-brand-animated">across borders</span>{" "}
              — finally on one screen.
            </motion.h1>

            <motion.p
              variants={item}
              className="mt-5 max-w-xl text-pretty text-[1.05rem] leading-relaxed text-muted-foreground"
            >
              NRIWB unifies what you own in the United States and India into a
              single, live net-worth view — with US↔India tax compliance built
              in, so nothing slips through the cracks between two systems.
            </motion.p>

            <motion.ul variants={item} className="mt-8 flex flex-col gap-2.5">
              {FEATURES.slice(0, 3).map(({ icon: Icon, title }) => (
                <li key={title} className="flex items-center gap-2.5 text-sm">
                  <span className="icon-chip h-7 w-7">
                    <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                  </span>
                  <span className="font-medium">{title}</span>
                </li>
              ))}
            </motion.ul>

            <motion.div
              variants={item}
              className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
            >
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
            </motion.div>
          </motion.section>

          {/* Right: the auth card */}
          <section className="flex flex-col items-center lg:items-end">
            <div className="card-surface w-full max-w-md animate-scale-in overflow-hidden p-1.5">
              <span
                aria-hidden
                className="gradient-hairline absolute inset-x-0 top-0 rounded-t-[inherit]"
              />
              <div className="px-6 pb-5 pt-7 text-center">
                <h2 className="text-xl font-semibold tracking-tight">
                  {mode === "sign-up" ? "Create your account" : "Welcome back"}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {mode === "sign-up"
                    ? "Start tracking your cross-border net worth in minutes."
                    : "Sign in to your unified wealth dashboard."}
                </p>
              </div>

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
              NRIWB is informational and does not provide tax, legal, or
              investment advice. By continuing you agree to our terms and privacy
              policy.
            </p>
          </section>
        </div>
      </div>

      {/* ── Cross-border live diagram ─────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto w-full max-w-7xl px-6 py-12 sm:px-8 lg:px-12"
      >
        <div className="mb-8 text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Two countries. Every account.{" "}
            <span className="text-gradient-brand">One number.</span>
          </h2>
        </div>
        <CrossBorderBeams />
      </motion.section>

      {/* ── Feature grid ──────────────────────────────────────────────── */}
      <motion.section
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-6 pb-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-3 lg:px-12"
      >
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <motion.div
            key={title}
            variants={item}
            className="card-surface card-hover p-6"
          >
            <span className="icon-chip mb-4 h-10 w-10">
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <p className="font-medium">{title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
          </motion.div>
        ))}
      </motion.section>

      {/* ── Bank marquee ──────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:px-8 lg:px-12">
        <BankMarquee />
      </section>
    </div>
  );
}
