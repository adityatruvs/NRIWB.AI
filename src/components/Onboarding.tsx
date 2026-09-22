"use client";

import { useState } from "react";
import { ChevronDown, Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  US_IMMIGRATION_STATUSES,
  US_STATES,
  INDIA_TAX_RESIDENCY,
  PLANNING_HORIZONS,
  US_FILING_STATUSES,
  YES_NO_UNSURE,
  FILES_TAXES_IN,
  INCOME_RANGES,
  NET_WORTH_RANGES,
  RISK_TOLERANCES,
  GOAL_OPTIONS,
  HOLDING_OPTIONS,
  MARITAL_STATUSES,
  type Option,
} from "@/lib/onboarding";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const NOW_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => NOW_YEAR - 18 - i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MOVE_YEARS = Array.from({ length: NOW_YEAR - 1949 }, (_, i) => NOW_YEAR - i);

const inputCls =
  "w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelCls = "mb-1.5 block text-[13px] font-medium";

const STEPS = ["Identity & residency", "Tax & finances", "Goals & family"];

/* ── Small field primitives ───────────────────────────────────────────────── */

function Select({
  value,
  onChange,
  children,
  required,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  required?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        required={required}
        className={cn(inputCls, "cursor-pointer appearance-none pr-9", !value && "text-muted-foreground")}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
      />
    </div>
  );
}

/** Small ⓘ button that reveals a short explanation on click (tap-friendly). */
function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label="More information"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Info size={13} />
      </button>
      {open && (
        <span className="absolute left-1/2 top-6 z-30 w-60 -translate-x-1/2 rounded-lg border border-border bg-card p-2.5 text-[12px] font-normal leading-relaxed text-muted-foreground shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

/** A field label with an optional ⓘ hint. */
function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className={cn(labelCls, "flex items-center")}>
      {label}
      {hint && <InfoHint text={hint} />}
    </label>
  );
}

/** Labeled dropdown built from an Option[] list. */
function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  required,
  className,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel label={label} hint={hint} />
      <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </div>
  );
}

/** Segmented control for small option sets (2–4). */
function Segmented({
  label,
  value,
  onChange,
  options,
  className,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel label={label} hint={hint} />
      <div
        className="grid gap-1.5 rounded-xl bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-lg px-2 py-2 text-[13px] font-medium transition",
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Multi-select chip grid. */
function MultiChips({
  label,
  values,
  onToggle,
  options,
  className,
}: {
  label: string;
  values: string[];
  onToggle: (v: string) => void;
  options: Option[];
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
                active
                  ? "border-brand bg-brand/10 text-foreground"
                  : "border-input text-muted-foreground hover:border-brand/40 hover:text-foreground",
              )}
            >
              {active && <Check size={13} className="text-brand" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── The wizard ───────────────────────────────────────────────────────────── */

const initialForm = {
  firstName: "",
  lastName: "",
  dobMonth: "",
  dobDay: "",
  dobYear: "",
  // Step 1
  countryOfResidence: "",
  usImmigrationStatus: "",
  usState: "",
  yearMovedToUs: "",
  indiaTaxResidency: "",
  indiaDaysCurrentYear: "",
  planningHorizon: "",
  // Step 2
  usFilingStatus: "",
  hasSsnOrItin: "",
  hasPan: "",
  filesTaxesIn: "",
  foreignAccountsOver10k: "",
  ownsForeignFunds: "",
  incomeRange: "",
  netWorthRange: "",
  riskTolerance: "",
  lrsUsedUsd: "",
  // Step 3
  goals: [] as string[],
  holdings: [] as string[],
  targetRetirementAge: "",
  maritalStatus: "",
  numChildren: "",
  supportsParentsIndia: "",
  sendsRemittances: "",
  monthlyRemittanceUsd: "",
  phone: "",
  occupation: "",
  employer: "",
};

type Form = typeof initialForm;

export default function Onboarding({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    ...initialForm,
    firstName: firstName || "",
    lastName: lastName || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setInput = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k: "goals" | "holdings") => (v: string) =>
    setForm((f) => {
      const cur = f[k];
      return { ...f, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const isUsResident = form.countryOfResidence === "US";

  function validateStep1(): string {
    if (!form.firstName.trim() || !form.lastName.trim()) return "Please enter your first and last name.";
    if (!form.dobMonth || !form.dobDay || !form.dobYear) return "Please enter your full date of birth.";
    if (!form.countryOfResidence) return "Select your country of residence.";
    if (!form.usImmigrationStatus) return "Select your U.S. immigration status.";
    if (!form.indiaTaxResidency) return "Select your India tax-residency status.";
    return "";
  }

  function next() {
    setError("");
    if (step === 0) {
      const err = validateStep1();
      if (err) return setError(err);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setError("");
    const err = validateStep1();
    if (err) {
      setStep(0);
      return setError(err);
    }

    const dateOfBirth = `${form.dobYear}-${String(Number(form.dobMonth) + 1).padStart(2, "0")}-${String(
      Number(form.dobDay),
    ).padStart(2, "0")}`;

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          dateOfBirth,
          yearMovedToUs: form.yearMovedToUs || null,
          indiaDaysCurrentYear: form.indiaDaysCurrentYear || 0,
          lrsUsedUsd: form.lrsUsedUsd || 0,
          targetRetirementAge: form.targetRetirementAge || null,
          numChildren: form.numChildren || null,
          monthlyRemittanceUsd: form.monthlyRemittanceUsd || null,
        }),
      });
      if (res.ok) {
        // Hard navigation so the server re-reads the (now complete) profile.
        window.location.assign("/");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    // Scroll + centering MUST be on separate elements. The outer div is the
    // scroll container (fixed h-screen since html/body are locked to 100vh); the
    // inner min-h-full wrapper centers the card when it fits and simply grows —
    // scrolling the outer — when the card is taller than the viewport. (Putting
    // centering on the scroll container itself clips the overflow and won't scroll.)
    <div className="relative h-screen overflow-y-auto">
      <div aria-hidden className="hero-mesh" />

      <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
        <div className="card-surface relative w-full max-w-2xl animate-scale-in overflow-hidden">
        <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0" />

        <div className="px-7 pb-1 pt-9 sm:px-10">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip h-8 w-8 text-sm font-bold">N</span>
            <span className="text-sm font-semibold tracking-tight">NRIWB</span>
          </div>
          <h1 className="mt-6 font-serif text-[1.75rem] font-medium tracking-tight">
            Set up your profile
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A few details so we can tailor your cross-border net worth and the right
            US↔India compliance checks. This stays private to you.
          </p>

          {/* Step progress */}
          <div className="mt-6 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-1 flex-col gap-1.5">
                <div
                  className={cn(
                    "h-1 rounded-full transition-colors",
                    i <= step ? "bg-brand" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] font-medium transition-colors",
                    i === step ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {i + 1}. {s}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-7 pb-9 pt-7 sm:px-10">
          {/* ── Step 1 — Identity & residency ──────────────────────────── */}
          {step === 0 && (
            <div className="animate-fade-in">
              <p className="eyebrow mb-3">Your details</p>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>First name</label>
                  <input className={inputCls} value={form.firstName} onChange={setInput("firstName")} required autoComplete="given-name" placeholder="e.g. Priya" />
                </div>
                <div>
                  <label className={labelCls}>Last name</label>
                  <input className={inputCls} value={form.lastName} onChange={setInput("lastName")} required autoComplete="family-name" placeholder="e.g. Sharma" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Email</label>
                  <input className={cn(inputCls, "cursor-not-allowed bg-muted/50 text-muted-foreground")} value={email} readOnly />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Date of birth</label>
                  <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-3">
                    <Select aria-label="Birth month" value={form.dobMonth} onChange={(e) => set("dobMonth")(e.target.value)} required>
                      <option value="" disabled>Month</option>
                      {MONTHS.map((m, i) => (<option key={m} value={i}>{m}</option>))}
                    </Select>
                    <Select aria-label="Birth day" value={form.dobDay} onChange={(e) => set("dobDay")(e.target.value)} required>
                      <option value="" disabled>Day</option>
                      {DAYS.map((d) => (<option key={d} value={d}>{d}</option>))}
                    </Select>
                    <Select aria-label="Birth year" value={form.dobYear} onChange={(e) => set("dobYear")(e.target.value)} required>
                      <option value="" disabled>Year</option>
                      {YEARS.map((y) => (<option key={y} value={y}>{y}</option>))}
                    </Select>
                  </div>
                </div>
              </div>

              <div className="my-7 border-t border-border/60" />
              <p className="eyebrow mb-3">Residency &amp; immigration</p>
              <div className="flex flex-col gap-4">
                <Segmented label="Country of residence" value={form.countryOfResidence} onChange={set("countryOfResidence")} options={COUNTRIES} />
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                  <SelectField
                    label="U.S. immigration status"
                    value={form.usImmigrationStatus}
                    onChange={set("usImmigrationStatus")}
                    options={US_IMMIGRATION_STATUSES}
                    placeholder="Select your status…"
                    required
                    hint="Your visa or residency type in the U.S. This affects how you're taxed — e.g. F-1/J-1 holders are often non-resident aliens with different filing rules."
                  />
                  <SelectField
                    label="India tax-residency status"
                    value={form.indiaTaxResidency}
                    onChange={set("indiaTaxResidency")}
                    options={INDIA_TAX_RESIDENCY}
                    placeholder="Select…"
                    required
                    hint="NRI = spent under 182 days in India. RNOR is a transitional status for returning NRIs where foreign income stays untaxed in India. Not sure? Pick that and we'll help."
                  />
                  {isUsResident && (
                    <>
                      <SelectField label="U.S. state" value={form.usState} onChange={set("usState")} options={US_STATES} placeholder="Select state…" hint="Where you're a tax resident. State income tax varies a lot (e.g. none in TX/FL, high in CA/NY)." />
                      <SelectField label="Year you moved to the U.S." value={form.yearMovedToUs} onChange={set("yearMovedToUs")} options={MOVE_YEARS.map((y) => ({ value: String(y), label: String(y) }))} placeholder="Select year…" />
                    </>
                  )}
                  <div>
                    <FieldLabel label="Days spent in India this year" hint="Total days you've physically been in India this financial year. Crossing 182 can make India tax your worldwide income — we track this for you." />
                    <input type="number" min={0} max={366} className={inputCls} value={form.indiaDaysCurrentYear} onChange={setInput("indiaDaysCurrentYear")} placeholder="e.g. 45" />
                  </div>
                  <SelectField label="Long-term plan" value={form.planningHorizon} onChange={set("planningHorizon")} options={PLANNING_HORIZONS} placeholder="Select…" />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2 — Tax & finances ────────────────────────────────── */}
          {step === 1 && (
            <div className="animate-fade-in flex flex-col gap-4">
              <p className="eyebrow mb-1">Tax profile</p>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <SelectField label="U.S. filing status" value={form.usFilingStatus} onChange={set("usFilingStatus")} options={US_FILING_STATUSES} placeholder="Select…" />
                <SelectField label="Where you file taxes" value={form.filesTaxesIn} onChange={set("filesTaxesIn")} options={FILES_TAXES_IN} placeholder="Select…" />
              </div>
              <Segmented label="Do you have a U.S. SSN or ITIN?" value={form.hasSsnOrItin} onChange={set("hasSsnOrItin")} options={YES_NO_UNSURE} hint="Your U.S. taxpayer ID — needed to file U.S. taxes and forms like FBAR. We don't ask for the number itself." />
              <Segmented label="Do you have an India PAN?" value={form.hasPan} onChange={set("hasPan")} options={YES_NO_UNSURE} hint="PAN is India's Permanent Account Number — the tax ID tied to your Indian accounts and filings." />
              <Segmented label="Foreign financial accounts over $10k combined?" value={form.foreignAccountsOver10k} onChange={set("foreignAccountsOver10k")} options={YES_NO_UNSURE} hint="If all your non-U.S. bank/financial accounts together ever topped $10,000 this year, you likely must file an FBAR (FinCEN 114). We'll flag it." />
              <Segmented label="Do you own foreign mutual funds or ETFs?" value={form.ownsForeignFunds} onChange={set("ownsForeignFunds")} options={YES_NO_UNSURE} hint="Non-U.S. mutual funds/ETFs (most Indian MFs) are usually 'PFICs' under U.S. tax law and need Form 8621 — worth flagging early." />

              <div className="my-3 border-t border-border/60" />
              <p className="eyebrow mb-1">Finances</p>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <SelectField label="Annual household income" value={form.incomeRange} onChange={set("incomeRange")} options={INCOME_RANGES} placeholder="Select range…" />
                <SelectField label="Approximate net worth" value={form.netWorthRange} onChange={set("netWorthRange")} options={NET_WORTH_RANGES} placeholder="Select range…" />
              </div>
              <Segmented label="Investment risk tolerance" value={form.riskTolerance} onChange={set("riskTolerance")} options={RISK_TOLERANCES} hint="How much ups-and-downs you're comfortable with. This drives the Portfolio Analyzer's suggested stock/bond mix." />
              <div className="sm:max-w-xs">
                <FieldLabel label="Money moved OUT of India this year (USD)" hint="India's Liberalized Remittance Scheme (LRS) caps money you send OUT of India — e.g. repatriating funds — at $250,000/year. Leave 0 if that's not you. (This is different from money you send TO India.)" />
                <input type="number" min={0} className={inputCls} value={form.lrsUsedUsd} onChange={setInput("lrsUsedUsd")} placeholder="0" />
                <p className="mt-1 text-xs text-muted-foreground">Optional · against the $250,000/yr LRS cap. Leave 0 if unsure.</p>
              </div>
            </div>
          )}

          {/* ── Step 3 — Goals & family ────────────────────────────────── */}
          {step === 2 && (
            <div className="animate-fade-in flex flex-col gap-5">
              <p className="text-[13px] text-muted-foreground">
                Optional — these tailor your goals, retirement projection, and the portfolio analyzer. You can skip and add them later.
              </p>
              <MultiChips label="Your top financial goals" values={form.goals} onToggle={toggle("goals")} options={GOAL_OPTIONS} />
              <MultiChips label="What you currently hold" values={form.holdings} onToggle={toggle("holdings")} options={HOLDING_OPTIONS} />

              <div className="my-2 border-t border-border/60" />
              <p className="eyebrow mb-1">Family &amp; planning</p>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Target retirement age</label>
                  <input type="number" min={40} max={90} className={inputCls} value={form.targetRetirementAge} onChange={setInput("targetRetirementAge")} placeholder="e.g. 60" />
                </div>
                <div>
                  <label className={labelCls}>Number of children</label>
                  <input type="number" min={0} max={20} className={inputCls} value={form.numChildren} onChange={setInput("numChildren")} placeholder="0" />
                </div>
              </div>
              <Segmented label="Marital status" value={form.maritalStatus} onChange={set("maritalStatus")} options={MARITAL_STATUSES} />
              <Segmented label="Financially supporting parents in India?" value={form.supportsParentsIndia} onChange={set("supportsParentsIndia")} options={YES_NO_UNSURE} />
              <Segmented label="Do you send money to India regularly?" value={form.sendsRemittances} onChange={set("sendsRemittances")} options={YES_NO_UNSURE} />
              {form.sendsRemittances === "yes" && (
                <div className="sm:max-w-xs">
                  <FieldLabel label="Roughly how much per month? (USD)" hint="A rough monthly average is fine — we don't need an exact figure. Easier to recall than a yearly total." />
                  <input type="number" min={0} className={inputCls} value={form.monthlyRemittanceUsd} onChange={setInput("monthlyRemittanceUsd")} placeholder="e.g. 1,000" />
                </div>
              )}

              <div className="my-2 border-t border-border/60" />
              <p className="eyebrow mb-1">Contact <span className="font-normal lowercase tracking-normal">· optional</span></p>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Phone</label>
                  <input type="tel" className={inputCls} value={form.phone} onChange={setInput("phone")} autoComplete="tel" placeholder="+1 (555) 000-0000" />
                </div>
                <div>
                  <label className={labelCls}>Occupation</label>
                  <input className={inputCls} value={form.occupation} onChange={setInput("occupation")} placeholder="Software Engineer" />
                </div>
                <div>
                  <label className={labelCls}>Employer</label>
                  <input className={inputCls} value={form.employer} onChange={setInput("employer")} placeholder="Acme Inc." />
                </div>
              </div>
            </div>
          )}

          {error && <p className="mt-5 text-sm text-danger">{error}</p>}

          {/* Nav */}
          <div className="mt-8 flex items-center gap-3">
            {step > 0 && (
              <button type="button" onClick={back} disabled={submitting} className="btn-ghost rounded-xl px-4 py-3 text-sm font-medium">
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="btn-primary ml-auto rounded-xl px-5 py-3 text-sm font-medium">
                Continue
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={submitting} className="btn-primary ml-auto rounded-xl px-5 py-3 text-sm font-medium disabled:opacity-60">
                {submitting ? "Saving…" : "Finish & go to dashboard"}
              </button>
            )}
          </div>
          {step === STEPS.length - 1 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Next, you&apos;ll connect your first account.
            </p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
