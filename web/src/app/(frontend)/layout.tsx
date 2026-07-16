import React from 'react'
import Link from 'next/link'
import { STIX_Two_Text, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './styles.css'
import { SITE_URL, SITE_NAME } from '@/lib/site'

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
    'Machine Learning and Knowledge Discovery group at INESC-ID: publications, people, projects and opportunities.',
}

const NAV = [
  { href: '/research', label: 'Research' },
  { href: '/map', label: 'Map' },
  { href: '/publications', label: 'Publications' },
  { href: '/people', label: 'People' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/news', label: 'News' },
  { href: '/search', label: 'Search' },
]

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
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
            <nav className="site-nav">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div>
              <strong>Machine Learning and Knowledge Discovery</strong>
              <p>INESC-ID · Rua Alves Redol 9, 1000-029 Lisboa, Portugal</p>
            </div>
            <div className="site-footer-links">
              <Link href="/publications">Publications</Link>
              <Link href="/opportunities">Open thesis topics</Link>
              <a href="/admin">Member sign in</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
