'use client'

import { useRouter } from 'next/navigation'

import { LOCALE_COOKIE, localeNames, locales, type Locale } from '@/i18n/config'

// Language toggle. Writes the NEXT_LOCALE cookie and refreshes so Server
// Components re-render with the chosen locale. Client-side because it sets a
// cookie and triggers navigation; it holds no translatable copy itself.
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter()

  const choose = (locale: Locale) => {
    if (locale === current) return
    // One year; Lax so ordinary navigations keep sending it.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <div className="locale-switcher" role="group" aria-label="Language / Idioma">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => choose(locale)}
          aria-pressed={locale === current}
          title={localeNames[locale]}
          className={locale === current ? 'active' : ''}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
