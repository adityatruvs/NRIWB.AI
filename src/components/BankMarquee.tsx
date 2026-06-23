"use client";

import { Marquee } from "@/components/ui/marquee";

const BANKS: { name: string; country: "us" | "india" }[] = [
  { name: "Chase", country: "us" },
  { name: "Fidelity", country: "us" },
  { name: "Vanguard", country: "us" },
  { name: "Charles Schwab", country: "us" },
  { name: "Bank of America", country: "us" },
  { name: "HDFC Bank", country: "india" },
  { name: "State Bank of India", country: "india" },
  { name: "ICICI Bank", country: "india" },
  { name: "Axis Bank", country: "india" },
  { name: "Kotak Mahindra", country: "india" },
];

export default function BankMarquee() {
  return (
    <div className="relative w-full">
      <p className="mb-4 text-center text-sm text-muted-foreground">
        Securely connects with the banks and brokerages you already use
      </p>
      <Marquee pauseOnHover className="[--duration:32s]">
        {BANKS.map((b) => (
          <div
            key={b.name}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium whitespace-nowrap"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                b.country === "us" ? "bg-us" : "bg-india"
              }`}
            />
            {b.name}
          </div>
        ))}
      </Marquee>
      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
