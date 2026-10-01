import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'

/**
 * Placeholder for a sidebar section that isn't built yet — says so plainly,
 * previews what's coming, and points to where the user can get it today.
 */
export function ComingSoon({
  icon: Icon,
  title,
  blurb,
  upcoming,
  meanwhile,
}: {
  icon: LucideIcon
  title: string
  blurb: string
  upcoming: string[]
  meanwhile: { href: string; label: string; note: string }[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 animate-fade-in">
        <span className="relative flex size-10 items-center justify-center rounded-xl bg-foreground text-background shadow-[0_2px_8px_-3px_hsl(var(--shadow-color)/0.4)]">
          <span className="absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
          <Icon size={18} />
        </span>
        <div>
          <h1 className="flex items-center gap-2 font-serif text-[1.5rem] font-medium tracking-tight">
            {title}
            <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-muted-foreground ring-1 ring-border/70">
              Soon
            </span>
          </h1>
          <p className="text-[13px] text-muted-foreground">{blurb}</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <h2 className="font-serif text-[17px] font-medium tracking-tight">We&apos;re building this — check back soon.</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Here&apos;s what this page will do:</p>
        <ul className="mt-3 flex flex-col gap-2">
          {upcoming.map((u) => (
            <li key={u} className="flex gap-2.5 text-[13.5px]">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
              {u}
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">In the meantime</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {meanwhile.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border/60 transition-colors hover:bg-accent/55"
              >
                <span>
                  <span className="block text-[13.5px] font-medium">{m.label}</span>
                  <span className="block text-[12px] text-muted-foreground">{m.note}</span>
                </span>
                <ArrowUpRight
                  size={15}
                  className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
