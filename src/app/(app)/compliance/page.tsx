import { ShieldCheck } from 'lucide-react'
import { ComingSoon } from '@/components/ComingSoon'

export default function CompliancePage() {
  return (
    <ComingSoon
      icon={ShieldCheck}
      title="Compliance"
      blurb="Your US ↔ India reporting status in one place"
      upcoming={[
        'An FBAR, FATCA and LRS status panel: green when you’re fine, amber when something needs doing.',
        'The peak combined balance of your India accounts through the year, tracked against the $10,000 FBAR threshold.',
        'India mutual funds flagged as PFICs, with what Form 8621 means for your US return.',
      ]}
      meanwhile={[
        { href: '/', label: 'Needs attention on your dashboard', note: 'FBAR and PFIC flags from your linked accounts' },
        { href: '/copilot', label: 'Ask the AI Copilot', note: 'Plain-English answers on FBAR, FATCA, PFIC and NRE/NRO' },
      ]}
    />
  )
}
