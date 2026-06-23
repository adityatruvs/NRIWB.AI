"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

const fieldCls =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
const labelCls = "mb-1.5 block text-xs font-medium text-muted-foreground";

export default function Onboarding({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: firstName || "",
    lastName: lastName || "",
    dateOfBirth: "",
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
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        // Re-evaluate the server gate → onboarding complete → dashboard.
        router.refresh();
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

        <div className="px-7 pb-2 pt-9 sm:px-10">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip h-8 w-8 text-sm font-bold">N</span>
            <span className="text-sm font-semibold tracking-tight">NRIWB</span>
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Tell us about yourself
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A few details so we can tailor your cross-border net worth and the
            right US↔India compliance checks. This stays private to you.
          </p>
        </div>

        <form onSubmit={onSubmit} className="px-7 pb-9 pt-6 sm:px-10">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>First name *</label>
              <input
                className={fieldCls}
                value={form.firstName}
                onChange={set("firstName")}
                required
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className={labelCls}>Last name *</label>
              <input
                className={fieldCls}
                value={form.lastName}
                onChange={set("lastName")}
                required
                autoComplete="family-name"
              />
            </div>

            <div>
              <label className={labelCls}>Email</label>
              <input
                className={`${fieldCls} cursor-not-allowed text-muted-foreground`}
                value={email}
                readOnly
                disabled
              />
            </div>
            <div>
              <label className={labelCls}>Date of birth *</label>
              <input
                type="date"
                className={fieldCls}
                value={form.dateOfBirth}
                onChange={set("dateOfBirth")}
                required
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>

            <div>
              <label className={labelCls}>Country of residence *</label>
              <select
                className={fieldCls}
                value={form.countryOfResidence}
                onChange={set("countryOfResidence")}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tax / visa status *</label>
              <select
                className={fieldCls}
                value={form.taxStatus}
                onChange={set("taxStatus")}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {TAX_STATUSES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                className={fieldCls}
                value={form.phone}
                onChange={set("phone")}
                autoComplete="tel"
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <div>
                <label className={labelCls}>Occupation</label>
                <input
                  className={fieldCls}
                  value={form.occupation}
                  onChange={set("occupation")}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className={labelCls}>Employer</label>
                <input
                  className={fieldCls}
                  value={form.employer}
                  onChange={set("employer")}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-7 w-full rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-60"
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
