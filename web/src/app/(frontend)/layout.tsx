import React from 'react'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { STIX_Two_Text, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './styles.css'
import { SITE_URL, SITE_NAME } from '@/lib/site'
import { getDictionary, getLocale } from '@/i18n/server'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { ChatWidget } from '@/components/ChatWidget'
import { MobileNav } from '@/components/MobileNav'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ScrollReveal } from '@/components/ScrollReveal'

// Runs before paint so there is no light→dark flash on load; falls back to the
// OS preference when the visitor hasn't chosen explicitly yet.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('mlkd-theme');
    if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  } catch (e) {}
})();
`

// Typography: STIX Two Text — the typeface of scientific journals (the site is
// set in the same font as the papers it indexes); Plex Sans/Mono — UI and data.
const serif = STIX_Two_Text({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
})
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
})

export const metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
  },
  title: {
    default: 'MLKD — Machine Learning and Knowledge Discovery @ INESC-ID',
    template: '%s | MLKD @ INESC-ID',
  },
  description:
    'Machine Learning and Knowledge Discovery group at INESC-ID: publications, people, dissertations and events.',
}

// Section list mirrors the group's existing site (mlkd.idss.inesc-id.pt), which the
// supervisor asked us to preserve — Events and Reading Groups stay separate.
// The map is not a section of its own (it is a view of publications), so it is
// reached from Research/Publications, and search is the icon at the end of the row.
const NAV = [
  { href: '/people', key: 'people' },
  { href: '/publications', key: 'publications' },
  { href: '/dissertations', key: 'dissertations' },
  { href: '/news', key: 'news' },
  { href: '/events', key: 'events' },
  { href: '/reading-groups', key: 'readingGroups' },
] as const

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const locale = await getLocale()
  const t = await getDictionary()

  // Feature flag: the chatbot can be turned off from the admin (ai-settings).
  const payload = await getPayload({ config })
  const aiSettings = await payload.findGlobal({ slug: 'ai-settings' }).catch(() => null)
  const chatEnabled = aiSettings?.features?.enableChatbot !== false

  return (
    <html
      lang={locale}
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="site-logo">
              <span className="site-logo-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <circle cx="5" cy="17" r="2.4" fill="var(--cobalt)" />
                  <circle cx="17" cy="5" r="2.4" fill="var(--cobalt)" />
                  <circle cx="19" cy="18" r="1.7" fill="var(--amber)" />
                  <path d="M5 17 L17 5 M17 5 L19 18" stroke="var(--ink-40)" strokeWidth="1" />
                </svg>
              </span>
              <span>
                <strong>MLKD</strong>
                <small>INESC-ID · Lisboa</small>
              </span>
            </Link>
            <MobileNav openLabel={t.nav.openMenu} closeLabel={t.nav.closeMenu}>
              <nav className="site-nav">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {t.nav[item.key]}
                  </Link>
                ))}
                <Link className="site-nav-search" href="/search" aria-label={t.nav.search}>
                  <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
                    <circle
                      cx="8.5"
                      cy="8.5"
                      r="5.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <path
                      d="M12.7 12.7 L17 17"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="site-nav-search-label">{t.nav.search}</span>
                </Link>
                <LocaleSwitcher current={locale} />
                <ThemeToggle light={t.theme.light} dark={t.theme.dark} />
              </nav>
            </MobileNav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div className="site-footer-brand">
              <span className="site-logo-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <circle cx="5" cy="17" r="2.4" fill="var(--cobalt)" />
                  <circle cx="17" cy="5" r="2.4" fill="var(--cobalt)" />
                  <circle cx="19" cy="18" r="1.7" fill="var(--amber)" />
                  <path d="M5 17 L17 5 M17 5 L19 18" stroke="var(--ink-40)" strokeWidth="1" />
                </svg>
              </span>
              <div>
                <strong>Machine Learning and Knowledge Discovery</strong>
                <p>INESC-ID · Rua Alves Redol 9, 1000-029 Lisboa, Portugal</p>
              </div>
            </div>
            <div className="site-footer-links">
              <Link href="/publications">{t.nav.publications}</Link>
              <Link href="/dissertations">{t.nav.dissertations}</Link>
              <Link href="/map">{t.nav.map}</Link>
              <Link href="/dissertations?status=open">{t.footer.openThesis}</Link>
              <Link href="/admin">{t.footer.signIn}</Link>
            </div>
            <p className="site-credit">{t.footer.credit}</p>
          </div>
        </footer>
        {chatEnabled && <ChatWidget t={t.chat} />}
        <ScrollReveal />
      </body>
    </html>
  )
}
