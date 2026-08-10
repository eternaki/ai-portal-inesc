'use client'

import React, { useSyncExternalStore } from 'react'

// The real source of truth for the theme is the `data-theme` attribute that the
// inline script in layout.tsx sets before paint (no light->dark flash). That
// makes the DOM an external store, so we read it with useSyncExternalStore
// instead of mirroring it into state from an effect: no duplicated state, and
// the server render (which has no document) stays honest by returning null.
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function getSnapshot(): 'light' | 'dark' {
  return (document.documentElement.dataset.theme as 'dark' | undefined) || 'light'
}

// Unknown until hydration — matches the previous initial state.
function getServerSnapshot(): 'light' | 'dark' | null {
  return null
}

export function ThemeToggle({ light, dark }: { light: string; dark: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    window.localStorage.setItem('mlkd-theme', next)
    listeners.forEach((notify) => notify())
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? light : dark}
      title={theme === 'dark' ? light : dark}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M20.4 14.7A8.6 8.6 0 1 1 9.3 3.6a7 7 0 0 0 11.1 11.1Z"
          />
        </svg>
      )}
    </button>
  )
}
