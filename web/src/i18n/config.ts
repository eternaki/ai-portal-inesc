// Site UI localization. Supported languages: English and Portuguese (pt-PT).
// The active locale is stored in the NEXT_LOCALE cookie and read per request by
// Server Components (see ./server). No Russian ever appears in the UI.
export const locales = ['en', 'pt'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

// Native language names for the switcher, and the Intl locale used for dates.
export const localeNames: Record<Locale, string> = { en: 'English', pt: 'Português' }
export const dateLocale: Record<Locale, string> = { en: 'en-GB', pt: 'pt-PT' }

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}
