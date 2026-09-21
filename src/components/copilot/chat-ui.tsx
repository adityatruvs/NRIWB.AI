'use client'

/**
 * Shared presentational bits for any copilot surface — the full Copilot page and
 * the inline "Add with AI" panel on Accounts both render assistant replies the
 * same way. Kept dumb and stateless so there's one markdown renderer, not two.
 */

import { CopilotLogo } from '@/components/ui/logos'
import { cn } from '@/lib/utils'

/** Minimal rich-text renderer: paragraphs, **bold**, and "•" bullets. */
export function Rich({ text }: { text: string }) {
  const blocks = text.split('\n').filter((l) => l.length > 0)
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((line, i) => {
        const bullet = line.trim().startsWith('•')
        const content = bullet ? line.trim().slice(1).trim() : line
        return (
          <p key={i} className={cn(bullet && 'flex gap-2 pl-1')}>
            {bullet && <span className="text-muted-foreground">•</span>}
            <span>{renderBold(content)}</span>
          </p>
        )
      })}
    </div>
  )
}

export function renderBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export function AssistantAvatar() {
  return (
    <span className="ai-chip relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg shadow-[0_2px_8px_-2px_rgba(80,120,255,0.5)]">
      <span className="absolute inset-0 rounded-lg shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
      <CopilotLogo size={14} />
    </span>
  )
}

export function Typing() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border/60 bg-muted/60 px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot size-1.5 rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}
