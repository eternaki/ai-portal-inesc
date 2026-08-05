'use client'

import React, { useState } from 'react'

// Wraps the (server-rendered) nav links + locale switcher. On desktop this is
// visually inert (`display: contents`); below the nav breakpoint it becomes a
// hamburger-triggered dropdown panel. See .nav-toggle / .nav-panel in styles.css.
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>
      <div className={`nav-panel${open ? ' open' : ''}`} onClick={() => setOpen(false)}>
        {children}
      </div>
    </>
  )
}
