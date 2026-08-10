'use client'

import React, { useEffect, useRef, useState } from 'react'

// Counts from 0 to `value` once, when it first scrolls into view. Renders the
// final static text on the server (so it's correct without JS / in the
// initial paint) and only animates client-side after mount.
export function CountUp({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(value)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || started.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        const duration = 900
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const eased = 1 - (1 - t) ** 3
          setDisplay(Math.round(eased * value))
          if (t < 1) requestAnimationFrame(tick)
        }
        setDisplay(0)
        requestAnimationFrame(tick)
        observer.disconnect()
      },
      { threshold: 0.4 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  )
}
