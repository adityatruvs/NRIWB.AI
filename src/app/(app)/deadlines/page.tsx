import { CalendarClock } from 'lucide-react'
import { ComingSoon } from '@/components/ComingSoon'

export default function DeadlinesPage() {
  return (
    <ComingSoon
      icon={CalendarClock}
      title="Deadlines"
      blurb="Every filing date across both countries, with countdowns"
      upcoming={[
        'A personal calendar of US and India filing dates: FBAR, India ITR, US estimated tax and more.',
        'Countdown timers, so nothing sneaks up on you.',
        'Reminders tied to your own accounts, like needing Form 15CA before a transfer.',
      ]}
      meanwhile={[
        { href: '/', label: 'Needs attention on your dashboard', note: 'What needs doing now, based on your accounts' },
        { href: '/copilot', label: 'Ask the AI Copilot', note: 'e.g. “When is FBAR due?”' },
      ]}
    />
  )
}
