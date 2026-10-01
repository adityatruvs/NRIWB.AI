import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Sidebar reads the path (active item) and the FX rate (footer) — nothing else.
const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/context/CurrencyContext', () => ({ useCurrency: () => ({ rate: 83.5 }) }))

import CompliancePage from '@/app/(app)/compliance/page'
import DeadlinesPage from '@/app/(app)/deadlines/page'
import Sidebar from '@/components/Sidebar'
import { promptsFor } from '@/components/copilot/CopilotLauncher'

// Regression: Compliance and Deadlines linked to "/" (the dashboard), with no
// sign they weren't built. They now have real routes with a placeholder page.
//
// Real vs demo data: the two modes differ only in what the Accounts / Goals /
// Budget contexts load. These render with NO data providers at all — a
// component that read user data would throw ("must be used within …") — so
// they render identically for a real user and in demo mode.

/** Anchor hrefs in rendered HTML, in order. */
const hrefs = (html: string) => [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1])

/** The rendered <a> for a sidebar item, by its label. */
function sidebarLink(html: string, label: string): string {
  const a = [...html.matchAll(/<a\b[\s\S]*?<\/a>/g)].map((m) => m[0]).find((x) => x.includes(`>${label}<`))
  if (!a) throw new Error(`no sidebar link for ${label}`)
  return a
}

describe.each([
  { name: 'Compliance', Page: CompliancePage, preview: 'FBAR' },
  { name: 'Deadlines', Page: DeadlinesPage, preview: 'filing dates' },
])('$name placeholder page', ({ name, Page, preview }) => {
  const html = renderToStaticMarkup(<Page />)

  it('says the feature is coming, instead of showing the dashboard', () => {
    expect(html).toContain(`>${name}<`)
    expect(html).toContain('Soon')
    expect(html).toContain('We&#x27;re building this — check back soon.')
    expect(html).toContain(preview)
  })

  it('points to where the user can get this today', () => {
    expect(hrefs(html)).toEqual(['/', '/copilot'])
  })
})

describe('Sidebar', () => {
  beforeEach(() => {
    nav.pathname = '/'
  })

  it('links Compliance and Deadlines to their own pages, with a Soon badge', () => {
    const html = renderToStaticMarkup(<Sidebar />)
    for (const [label, href] of [['Compliance', '/compliance'], ['Deadlines', '/deadlines']]) {
      const a = sidebarLink(html, label)
      expect(a).toContain(`href="${href}"`)
      expect(a).toContain('Soon')
    }
    // Built pages carry no badge.
    expect(sidebarLink(html, 'Goals')).not.toContain('Soon')
  })

  it('no sidebar item other than Dashboard points at the dashboard any more', () => {
    const html = renderToStaticMarkup(<Sidebar />)
    expect(hrefs(html).filter((h) => h === '/')).toHaveLength(1)
  })

  it.each([
    ['/compliance', 'Compliance'],
    ['/deadlines', 'Deadlines'],
  ])('highlights the current item on %s', (path, label) => {
    nav.pathname = path
    const html = renderToStaticMarkup(<Sidebar />)
    expect(sidebarLink(html, label)).toContain('bg-brand') // the active indicator bar
    expect(sidebarLink(html, 'Dashboard')).not.toContain('bg-brand')
  })
})

describe('floating Copilot on the placeholder pages', () => {
  it('suggests questions about the topic the page is for', () => {
    expect(promptsFor('/compliance')).toContain('Are my India mutual funds PFICs?')
    expect(promptsFor('/deadlines')).toContain('When is FBAR due?')
    expect(promptsFor('/')).toContain('What needs my attention this month?')
  })
})
