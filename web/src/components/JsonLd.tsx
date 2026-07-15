import React from 'react'

// Структурированные данные schema.org (пункт E ТЗ: structured metadata).
// Контент приходит из CMS/OpenAlex (недоверенный) — экранируем `<`, чтобы
// строка вроде "</script>" в заголовке статьи не вырвалась из тега (XSS).
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

export const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'ResearchOrganization',
  name: 'Machine Learning and Knowledge Discovery Group',
  alternateName: 'MLKD',
  parentOrganization: {
    '@type': 'ResearchOrganization',
    name: 'INESC-ID',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Rua Alves Redol 9',
      postalCode: '1000-029',
      addressLocality: 'Lisboa',
      addressCountry: 'PT',
    },
  },
}
