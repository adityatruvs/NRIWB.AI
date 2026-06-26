"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "IN", label: "India" },
  { value: "OTHER", label: "Other" },
];

const TAX_STATUSES = [
  { value: "us_citizen", label: "U.S. Citizen" },
  { value: "green_card", label: "Green Card holder" },
  { value: "h1b_l1", label: "H-1B / L-1 visa holder" },
  { value: "nri_india", label: "NRI — Resident of India" },
  { value: "other", label: "Other" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const NOW_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => NOW_YEAR - 18 - i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const inputCls =
  "w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-brand/15";
const labelCls = "mb-1.5 block text-[13px] font-medium";

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

export default function Onboarding({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const [form, setForm] = useState({
    firstName: firstName || "",
    lastName: lastName || "",
    dobMonth: "",
    dobDay: "",
    dobYear: "",
    countryOfResidence: "",
    taxStatus: "",
    phone: "",
    occupation: "",
    employer: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.dobMonth || !form.dobDay || !form.dobYear) {
      setError("Please enter your full date of birth.");
      return;
    }
    if (!form.countryOfResidence || !form.taxStatus) {
      setError("Please select your country and tax status.");
      return;
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
          firstName: form.firstName,
          lastName: form.lastName,
          dateOfBirth,
          countryOfResidence: form.countryOfResidence,
          taxStatus: form.taxStatus,
          phone: form.phone,
          occupation: form.occupation,
          employer: form.employer,
        }),
      });
      if (res.ok) {
        // Hard navigation so the server re-reads the (now complete) profile and
        // renders the dashboard — reliable and avoids any stale-metadata flash.
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
    <div className="relative flex min-h-screen flex-1 items-center justify-center overflow-y-auto px-6 py-12">
      <div aria-hidden className="hero-mesh" />

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
            A few details so we can tailor your cross-border net worth and the
            right US↔India compliance checks. This stays private to you.
          </p>
        </div>

        <form onSubmit={onSubmit} className="px-7 pb-9 pt-7 sm:px-10">
          {/* Your details */}
          <p className="eyebrow mb-3">Your details</p>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>First name</label>
              <input
                className={inputCls}
                value={form.firstName}
                onChange={set("firstName")}
                required
                autoComplete="given-name"
                placeholder="e.g. Priya"
              />
            </div>
            <div>
              <label className={labelCls}>Last name</label>
              <input
                className={inputCls}
                value={form.lastName}
                onChange={set("lastName")}
                required
                autoComplete="family-name"
                placeholder="e.g. Sharma"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Email</label>
              <input
                className={cn(inputCls, "cursor-not-allowed bg-muted/50 text-muted-foreground")}
                value={email}
                readOnly
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Date of birth</label>
              <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-3">
                <Select aria-label="Birth month" value={form.dobMonth} onChange={set("dobMonth")} required>
                  <option value="" disabled>Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </Select>
                <Select aria-label="Birth day" value={form.dobDay} onChange={set("dobDay")} required>
                  <option value="" disabled>Day</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </Select>
                <Select aria-label="Birth year" value={form.dobYear} onChange={set("dobYear")} required>
                  <option value="" disabled>Year</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {/* Residency & tax */}
          <div className="my-7 border-t border-border/60" />
          <p className="eyebrow mb-3">Residency &amp; tax</p>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelCls}>Country of residence</label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted p-1">
                {COUNTRIES.map((c) => {
                  const active = form.countryOfResidence === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, countryOfResidence: c.value }))
                      }
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={labelCls}>Tax / visa status</label>
              <Select value={form.taxStatus} onChange={set("taxStatus")} required aria-label="Tax status">
                <option value="" disabled>Select your status…</option>
                {TAX_STATUSES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Contact (optional) */}
          <div className="my-7 border-t border-border/60" />
          <p className="eyebrow mb-3">
            Contact <span className="font-normal lowercase tracking-normal">· optional</span>
          </p>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                className={inputCls}
                value={form.phone}
                onChange={set("phone")}
                autoComplete="tel"
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div>
              <label className={labelCls}>Occupation</label>
              <input
                className={inputCls}
                value={form.occupation}
                onChange={set("occupation")}
                placeholder="Software Engineer"
              />
            </div>
            <div>
              <label className={labelCls}>Employer</label>
              <input
                className={inputCls}
                value={form.employer}
                onChange={set("employer")}
                placeholder="Acme Inc."
              />
            </div>
          </div>

          {error && <p className="mt-5 text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-8 w-full rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Continue to dashboard"}
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Next, you&apos;ll connect your first account.
          </p>
        </form>
      </div>
    </div>
  );
}
