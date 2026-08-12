'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const SELECTOR = '.card, .person-card, .news-card, .attach-card, .pub-item, .event-row'

// Fades/lifts cards in as they enter the viewport. Runs once globally (mounted
// in the root layout) rather than per-page — the alternative is wrapping every
// card list in its own observer, which doesn't scale across this many pages.
// Re-runs on pathname change to pick up cards on the page just navigated to
// (App Router swaps content without remounting this component).
export function ScrollReveal() {
  const pathname = usePathname()

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const reveal = (el: Element) => el.classList.add('reveal-visible')

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target)
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    )

    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (el.classList.contains('reveal-visible') || el.classList.contains('reveal-pending')) return
      const rect = el.getBoundingClientRect()
      // Already on screen at mount (e.g. above the fold) — show immediately,
      // no point animating content the user sees on first paint.
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        reveal(el)
      } else {
        el.classList.add('reveal-pending')
        observer.observe(el)
      }
    })

    return () => observer.disconnect()
  }, [pathname])

  return null
}
