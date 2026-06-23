"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";

// Brand-aligned beam colors (literal — SVG stop-color can't read CSS vars).
const US_COLOR = "#4f7bf0";
const INDIA_COLOR = "#18b07a";
const BRAND_COLOR = "#6f5bf0";

const US_BANKS = ["Chase", "Fidelity", "Vanguard"];
const INDIA_BANKS = ["HDFC", "SBI", "ICICI"];

const BASE = 1_284_500;

const Node = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; className?: string; accent?: "us" | "india" }
>(({ children, className, accent }, ref) => (
  <div
    ref={ref}
    className={cn(
      "z-10 flex items-center justify-center rounded-xl border bg-card px-3 py-2 text-xs font-medium shadow-sm",
      "card-hover",
      accent === "us" && "border-us/30",
      accent === "india" && "border-india/30",
      className,
    )}
  >
    <span
      className={cn(
        "mr-1.5 h-1.5 w-1.5 rounded-full",
        accent === "us" ? "bg-us" : "bg-india",
      )}
    />
    {children}
  </div>
));
Node.displayName = "Node";

export default function CrossBorderBeams() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const usRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const inRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  const [nw, setNw] = useState(0);

  // Count up on mount, then drift gently to feel live.
  useEffect(() => {
    setNw(BASE);
    const id = setInterval(() => {
      setNw(BASE + Math.round((Math.random() - 0.4) * 3200));
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const usUsd = Math.round(nw * 0.62);
  const inUsd = nw - usUsd;

  return (
    <div
      ref={containerRef}
      className="card-surface relative mx-auto grid w-full max-w-5xl grid-cols-3 items-center gap-4 overflow-hidden p-6 sm:gap-8 sm:p-10"
    >
      <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0" />
      <div aria-hidden className="hero-mesh" />

      {/* US column */}
      <div className="flex flex-col items-start gap-4 sm:gap-6">
        <span className="eyebrow ml-1 text-us">United States</span>
        {US_BANKS.map((b, i) => (
          <Node key={b} ref={usRefs[i]} accent="us">
            {b}
          </Node>
        ))}
      </div>

      {/* Hub */}
      <div className="flex flex-col items-center">
        <div
          ref={hubRef}
          className="z-10 flex h-20 w-20 flex-col items-center justify-center rounded-2xl text-primary-foreground shadow-lg sm:h-24 sm:w-24"
          style={{
            background:
              "linear-gradient(140deg, #4f7bf0 0%, #6f5bf0 52%, #18b07a 100%)",
          }}
        >
          <span className="text-2xl font-bold tracking-tight">N</span>
          <span className="text-[10px] font-medium opacity-90">NRIWB</span>
        </div>

        <div className="mt-5 text-center">
          <p className="eyebrow">Total net worth</p>
          <NumberFlow
            value={nw}
            format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
            className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl"
          />
          {/* US / India split */}
          <div className="mx-auto mt-3 flex h-1.5 w-36 overflow-hidden rounded-full bg-muted sm:w-44">
            <div className="bg-us" style={{ width: "62%" }} />
            <div className="bg-india" style={{ width: "38%" }} />
          </div>
          <div className="mt-2 flex justify-center gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span className="text-us">
              <NumberFlow value={usUsd} format={{ notation: "compact", style: "currency", currency: "USD" }} /> US
            </span>
            <span className="text-india">
              <NumberFlow value={inUsd} format={{ notation: "compact", style: "currency", currency: "USD" }} /> IN
            </span>
          </div>
        </div>
      </div>

      {/* India column */}
      <div className="flex flex-col items-end gap-4 sm:gap-6">
        <span className="eyebrow mr-1 text-india">India</span>
        {INDIA_BANKS.map((b, i) => (
          <Node key={b} ref={inRefs[i]} accent="india">
            {b}
          </Node>
        ))}
      </div>

      {/* Beams: US → hub */}
      {usRefs.map((ref, i) => (
        <AnimatedBeam
          key={`us-${i}`}
          containerRef={containerRef}
          fromRef={ref}
          toRef={hubRef}
          curvature={(i - 1) * 28}
          gradientStartColor={US_COLOR}
          gradientStopColor={BRAND_COLOR}
          duration={4}
          delay={i * 0.4}
        />
      ))}
      {/* Beams: India → hub */}
      {inRefs.map((ref, i) => (
        <AnimatedBeam
          key={`in-${i}`}
          containerRef={containerRef}
          fromRef={ref}
          toRef={hubRef}
          reverse
          curvature={(i - 1) * 28}
          gradientStartColor={INDIA_COLOR}
          gradientStopColor={BRAND_COLOR}
          duration={4}
          delay={i * 0.4 + 0.2}
        />
      ))}
    </div>
  );
}
