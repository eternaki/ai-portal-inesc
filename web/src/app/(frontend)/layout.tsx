import React from 'react'
import Link from 'next/link'
import './styles.css'

export const metadata = {
  title: {
    default: 'MLKD — Machine Learning and Knowledge Discovery @ INESC-ID',
    template: '%s | MLKD @ INESC-ID',
  },
  description:
    'Machine Learning and Knowledge Discovery group at INESC-ID: publications, people, projects and opportunities.',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="site-logo">
            MLKD
          </Link>
          <nav>
            <Link href="/publications">Publications</Link>
            <Link href="/people">People</Link>
            <Link href="/search">Search</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          Machine Learning and Knowledge Discovery group · INESC-ID Lisboa
        </footer>
      </body>
    </html>
  )
}
