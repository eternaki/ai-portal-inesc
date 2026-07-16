import { cookies } from 'next/headers'

import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from './config'
import { messages, type Dictionary } from './messages'

// Read the active locale from the NEXT_LOCALE cookie. Falls back to the default
// when the cookie is missing or holds an unsupported value. All frontend pages
// are `dynamic = 'force-dynamic'`, so reading the cookie per request is fine.
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : defaultLocale
}

// The message dictionary for the active locale. `Dictionary` is derived from the
// English catalog, so TypeScript forces every locale to define the same keys.
export async function getDictionary(): Promise<Dictionary> {
  return messages[await getLocale()]
}
