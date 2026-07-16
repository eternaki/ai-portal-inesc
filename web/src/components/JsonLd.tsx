import React from 'react'

// schema.org structured data (brief section E: structured metadata).
// Content comes from the CMS/OpenAlex (untrusted) — escape `<` so a string like
// "</script>" in a paper title cannot break out of the tag (XSS).
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
