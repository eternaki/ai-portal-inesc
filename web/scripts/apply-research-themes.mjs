/**
 * Set the research themes from the group's own mission statement.
 *
 * Run:  pnpm themes:apply                     (dry run, writes a report)
 *       THEMES_APPLY=1 pnpm themes:apply:apply
 *
 * The four themes that came with the seed dump — "Machine Learning for Health",
 * "Bioinformatics & Computational Biology", "Trustworthy & Interpretable AI",
 * "Natural Language Processing" — were invented during development. They had no
 * descriptions and nothing linked to them, and the group's site has no themes
 * section at all: its home page states the mission in prose.
 *
 * So the three named there become the themes, in the group's own words:
 *
 *   "...to advance the state of the art in machine learning and its applications,
 *    in medical imaging, natural language processing and sequential decision
 *    making. Areas of interest include learning theory, deep learning,
 *    convolutional neural networks, computer vision, reinforcement learning,
 *    supervised and self-supervised learning, attention and self-attention
 *    mechanisms, and computational biology, among others."
 *
 * Every term in a description below is lifted from that second sentence. Which
 * term sits under which theme is an editorial grouping, not something the source
 * states — it is left deliberately obvious so the supervisor can correct it in the
 * admin, which is the whole point of the field being editable.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const apply = process.env.THEMES_APPLY === '1'

const paragraph = (text) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: [{ type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 }],
      },
    ],
  },
})

const THEMES = [
  {
    name: 'Medical imaging',
    description: 'Computer vision and convolutional neural networks applied to clinical data.',
  },
  {
    name: 'Natural language processing',
    description: 'Attention and self-attention mechanisms, supervised and self-supervised learning.',
  },
  {
    name: 'Sequential decision making',
    description: 'Reinforcement learning and the learning theory behind it.',
  },
]

async function run() {
  const payload = await getPayload({ config })

  const existing = (await payload.find({ collection: 'research-themes', limit: 100, depth: 0 })).docs
  const wanted = new Set(THEMES.map((theme) => theme.name.toLowerCase()))

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    created: [],
    updated: [],
    removed: [],
    keptBecauseLinked: [],
    errors: [],
  }

  for (const theme of existing) {
    if (wanted.has(theme.name.toLowerCase())) continue

    // Nothing currently links to a theme, but that can change the moment somebody
    // uses the field. Deleting a theme a dissertation or project points at would
    // silently strip that association, so check before removing.
    // The field is `themes` on both collections, not `researchThemes` — a wrong
    // name here would not error, it would return zero and delete a linked theme.
    const [byDissertation, byProject] = await Promise.all([
      payload.count({ collection: 'dissertations', where: { themes: { equals: theme.id } } }),
      payload.count({ collection: 'projects', where: { themes: { equals: theme.id } } }),
    ])
    const links = byDissertation.totalDocs + byProject.totalDocs
    if (links > 0) {
      report.keptBecauseLinked.push({ id: theme.id, name: theme.name, links })
      continue
    }

    try {
      if (apply) await payload.delete({ collection: 'research-themes', id: theme.id })
      report.removed.push({ id: theme.id, name: theme.name })
    } catch (err) {
      report.errors.push({ name: theme.name, message: String(err?.message ?? err) })
    }
  }

  for (const theme of THEMES) {
    const found = existing.find((row) => row.name.toLowerCase() === theme.name.toLowerCase())
    const data = { name: theme.name, description: paragraph(theme.description) }
    try {
      if (found) {
        if (apply) await payload.update({ collection: 'research-themes', id: found.id, data })
        report.updated.push({ id: found.id, name: theme.name })
      } else {
        if (apply) await payload.create({ collection: 'research-themes', data })
        report.created.push({ name: theme.name })
      }
    } catch (err) {
      report.errors.push({ name: theme.name, message: String(err?.message ?? err) })
    }
  }

  const reportPath = path.join(repoRoot, 'reports', `research-themes-${apply ? 'apply' : 'dry-run'}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.created.length} created, ${report.updated.length} updated, ` +
      `${report.removed.length} removed, ${report.keptBecauseLinked.length} kept (linked), ` +
      `${report.errors.length} errors`,
  )
  for (const row of report.removed) console.log(`  - ${row.name}`)
  for (const row of report.created) console.log(`  + ${row.name}`)
  for (const row of report.keptBecauseLinked) console.log(`  ! kept ${row.name}: ${row.links} link(s)`)
  console.log(`report → ${reportPath}`)
}

await run()
