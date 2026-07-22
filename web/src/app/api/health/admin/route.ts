import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

type CheckStatus = 'ready' | 'warning' | 'error' | 'not_configured' | 'unknown'

type HealthCheck = {
  id: string
  label: string
  status: CheckStatus
  detail: string
  hint?: string
  metrics?: Record<string, number | string | boolean | null>
}

const PUBLISHED = { status: { equals: 'published' } }

type CollectionSlug =
  | 'members'
  | 'publications'
  | 'projects'
  | 'thesis-topics'
  | 'software'
  | 'news'
  | 'events'

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function normalizeLlmStatus(data: Record<string, unknown>): HealthCheck {
  const status = String(data?.status || 'unknown')
  if (status === 'ready') {
    const provider = typeof data.provider === 'string' ? data.provider : null
    const model = typeof data.model === 'string' ? data.model : null
    return {
      id: 'llm',
      label: 'Chatbot / LLM',
      status: 'ready',
      detail: `${provider || 'provider'} / ${model || 'model'} configured`,
      metrics: {
        provider,
        model,
        credentialsConfigured: Boolean(data.credentialsConfigured),
      },
    }
  }

  const error =
    data?.error && typeof data.error === 'object' ? (data.error as Record<string, unknown>) : {}
  const code =
    typeof error.code === 'string'
      ? error.code
      : status === 'not_configured'
        ? 'LLM_NOT_CONFIGURED'
        : 'LLM_UNKNOWN'
  return {
    id: 'llm',
    label: 'Chatbot / LLM',
    status: status === 'not_configured' ? 'not_configured' : 'warning',
    detail: typeof error.message === 'string' ? error.message : 'Language model is not ready',
    hint: typeof error.hint === 'string' ? error.hint : `Check provider configuration (${code}).`,
    metrics: { code },
  }
}

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || (user.role !== 'admin' && user.role !== 'editor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const checks: HealthCheck[] = []

  try {
    const [members, publications, projects, thesisTopics, software, news, events] =
      await Promise.all([
        payload.count({ collection: 'members' }),
        payload.count({ collection: 'publications', where: PUBLISHED }),
        payload.count({ collection: 'projects' }),
        payload.count({ collection: 'thesis-topics' }),
        payload.count({ collection: 'software' }),
        payload.count({ collection: 'news' }),
        payload.count({ collection: 'events' }),
      ])

    const counts: Record<CollectionSlug, number> = {
      members: members.totalDocs,
      publications: publications.totalDocs,
      projects: projects.totalDocs,
      'thesis-topics': thesisTopics.totalDocs,
      software: software.totalDocs,
      news: news.totalDocs,
      events: events.totalDocs,
    }

    checks.push({
      id: 'database',
      label: 'Database',
      status: 'ready',
      detail: 'Payload can read the PostgreSQL database.',
      metrics: counts,
    })

    const emptyCore = counts.members === 0 || counts.publications === 0
    checks.push({
      id: 'data',
      label: 'Core data',
      status: emptyCore ? 'warning' : 'ready',
      detail: emptyCore
        ? 'Members or published publications are empty.'
        : 'Main public data is available.',
      hint: emptyCore ? 'Run the local seed/rebuild command before demos.' : undefined,
      metrics: counts,
    })

    const publicationDocs = await payload.find({
      collection: 'publications',
      where: PUBLISHED,
      limit: 1000,
      depth: 0,
    })
    let linkedAuthorRows = 0
    let unlinkedAuthorRows = 0
    for (const publication of publicationDocs.docs) {
      for (const author of publication.authors || []) {
        if (author.member) linkedAuthorRows += 1
        else unlinkedAuthorRows += 1
      }
    }
    checks.push({
      id: 'member_publication_links',
      label: 'Member-publication links',
      status: linkedAuthorRows > 0 || counts.publications === 0 ? 'ready' : 'warning',
      detail:
        linkedAuthorRows > 0
          ? `${linkedAuthorRows} author rows are linked to MLKD member profiles.`
          : 'No publication authors are linked to member profiles yet.',
      hint:
        linkedAuthorRows > 0
          ? undefined
          : 'Run npm --prefix web run publications:link-members:apply.',
      metrics: { linkedAuthorRows, unlinkedAuthorRows },
    })
  } catch (error) {
    checks.push({
      id: 'database',
      label: 'Database',
      status: 'error',
      detail: 'Payload could not read the database.',
      hint: error instanceof Error ? error.message : 'Check DATABASE_URL and migrations.',
    })
  }

  const aiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000'
  const token = process.env.AI_SERVICE_TOKEN

  try {
    const health = await fetchJson(`${aiUrl}/health`, { signal: AbortSignal.timeout(5000) })
    checks.push({
      id: 'ai_service',
      label: 'AI service',
      status: health.ok && health.data?.status === 'ok' ? 'ready' : 'error',
      detail:
        health.ok && health.data?.status === 'ok'
          ? 'AI service is reachable.'
          : `AI service returned HTTP ${health.status}.`,
      hint: process.env.AI_SERVICE_URL
        ? undefined
        : 'AI_SERVICE_URL is not set; using http://localhost:8000.',
      metrics: { urlConfigured: Boolean(process.env.AI_SERVICE_URL) },
    })
  } catch {
    checks.push({
      id: 'ai_service',
      label: 'AI service',
      status: 'error',
      detail: 'AI service is not reachable.',
      hint: `Check whether the AI service is running at ${aiUrl}.`,
      metrics: { urlConfigured: Boolean(process.env.AI_SERVICE_URL) },
    })
  }

  try {
    const llm = await fetchJson(`${aiUrl}/health/llm`, { signal: AbortSignal.timeout(5000) })
    checks.push(normalizeLlmStatus(llm.data))
  } catch {
    checks.push({
      id: 'llm',
      label: 'Chatbot / LLM',
      status: 'unknown',
      detail: 'Could not read LLM readiness.',
      hint: 'The AI service must be reachable before chatbot readiness can be checked.',
    })
  }

  if (!token) {
    checks.push({
      id: 'embeddings',
      label: 'Embeddings',
      status: 'unknown',
      detail: 'Embedding health requires AI_SERVICE_TOKEN.',
      hint: 'Set AI_SERVICE_TOKEN so the dashboard can call the maintenance report.',
      metrics: { tokenConfigured: false },
    })
  } else {
    try {
      const maintenance = await fetchJson(`${aiUrl}/maintenance/report?check_links=false`, {
        headers: { 'X-Service-Token': token },
        signal: AbortSignal.timeout(30000),
      })
      const missing = Number(maintenance.data?.summary?.missing_embeddings || 0)
      const published = Number(maintenance.data?.published_total || 0)
      checks.push({
        id: 'embeddings',
        label: 'Embeddings',
        status: missing === 0 ? 'ready' : 'warning',
        detail:
          missing === 0
            ? 'Published publications have embeddings.'
            : `${missing} published publication(s) are missing embeddings.`,
        hint: missing === 0 ? undefined : 'Run the embedding/reindex pipeline.',
        metrics: { missingEmbeddings: missing, publishedPublications: published },
      })
    } catch {
      checks.push({
        id: 'embeddings',
        label: 'Embeddings',
        status: 'unknown',
        detail: 'Could not read the AI maintenance report.',
        hint: 'Check AI_SERVICE_TOKEN and the AI service maintenance endpoint.',
        metrics: { tokenConfigured: true },
      })
    }
  }

  const severity: Record<CheckStatus, number> = {
    ready: 0,
    not_configured: 1,
    warning: 1,
    unknown: 1,
    error: 2,
  }
  const worst = checks.reduce<CheckStatus>(
    (current, check) => (severity[check.status] > severity[current] ? check.status : current),
    'ready',
  )

  return NextResponse.json({
    status: worst,
    generatedAt: new Date().toISOString(),
    checks,
  })
}
