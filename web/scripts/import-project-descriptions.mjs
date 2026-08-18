/**
 * Fill in project descriptions from each project's own funding record.
 *
 * Run:  pnpm projects:descriptions                 (dry run, writes a report)
 *       PROJECT_DESCRIPTIONS_APPLY=1 pnpm projects:descriptions:apply
 *
 * All nine projects arrived from the group's legacy projects page, which lists an
 * acronym, a principal investigator, the years and the funder — and nothing else.
 * With no description, a project's entire searchable text is its acronym: "ILU" is
 * three characters, and embeds to a point near nothing. Projects scored 0.28-0.29
 * against the chat's 0.40 floor, so no question could ever surface one, and
 * "what projects is the group involved in?" answered that it had found nothing
 * while nine sat in the database.
 *
 * Each description below is written from that project's own public funding record
 * — CORDIS for the EU grants, the infrastructure's own site, the group's own
 * project page — and `source` names it. Nothing here is inferred from the acronym.
 *
 * Five projects are deliberately absent: ILU, INTAKE, NEURONREDUCE, PRECISE and
 * DeepPathCOVIDx are FCT/ANI grants with no public record I could find, and the
 * group's own pages carry no text about them. Writing a plausible summary of a
 * research project nobody can check is exactly what this codebase refuses to let
 * the language model do; it would be no better done by hand. They need a sentence
 * from someone who worked on them — then add them here.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'
import config from '@payload-config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '..')

const apply = process.env.PROJECT_DESCRIPTIONS_APPLY === '1'

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

const DESCRIPTIONS = [
  {
    title: 'OLISSIPO',
    source: 'https://cordis.europa.eu/project/id/951970',
    text:
      'OLISSIPO — Fostering Computational Biology Research and Innovation in Lisbon. ' +
      'A Horizon 2020 Twinning action coordinated by INESC-ID with EMBL Heidelberg, ' +
      'INRIA Lyon and ETH Zurich, aimed at building a critical mass at the interface ' +
      'of computer science and health research. Work was organised around single-cell ' +
      'data analysis and simulation, mathematical modelling of interactions between ' +
      'cells and communities, phylogenetic inference by Bayesian and combinatorial ' +
      'methods, and translational bioinformatics with data management and software ' +
      'development.',
  },
  {
    title: 'EXCELERATE',
    source: 'https://cordis.europa.eu/project/id/676559',
    text:
      'ELIXIR-EXCELERATE — Fast-track ELIXIR implementation and drive early user ' +
      'exploitation across the life sciences. A Horizon 2020 research-infrastructure ' +
      'project coordinated by EMBL across 53 partners, accelerating the early ' +
      'implementation of ELIXIR, Europe’s distributed infrastructure for biological ' +
      'information. It consolidated data services for academia and industry, built ' +
      'bioinformatics capacity and training across Europe, and put in place the ' +
      'management processes a large distributed infrastructure needs — so that ' +
      'life-science data becomes findable, accessible, interoperable and reusable.',
  },
  {
    title: 'BioData',
    source: 'https://biodata.pt/',
    text:
      'BioData.pt — the Portuguese distributed research infrastructure for life and ' +
      'health data, and the national node of ELIXIR. It brings together life-science ' +
      'research and innovation organisations across Portugal, providing data-management ' +
      'practice, computing facilities, training and consulting, and connecting academic ' +
      'research with the agrofood, forestry, sea and health sectors.',
  },
  {
    title: 'PRELUNA',
    source: 'https://mlkd.idss.inesc-id.pt/preluna-home.html',
    text:
      'PRELUNA — Precise and Efficient Learning using Attention Mechanisms. The project ' +
      'works on attention-based machine learning, with medical imaging as its main ' +
      'application: raising the quality of care where medical specialists are scarce. ' +
      'The same methods carry over to fire surveillance, Earth imaging and ' +
      'environmental monitoring.',
  },
]

async function run() {
  const payload = await getPayload({ config })
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    updated: [],
    skippedHasDescription: [],
    notFound: [],
    missingSource: [],
    errors: [],
  }

  const { docs: all } = await payload.find({ collection: 'projects', limit: 200, depth: 0 })
  const byTitle = new Map(all.map((doc) => [doc.title.toLowerCase(), doc]))

  for (const entry of DESCRIPTIONS) {
    const project = byTitle.get(entry.title.toLowerCase())
    if (!project) {
      report.notFound.push(entry.title)
      continue
    }
    // Never overwrite a description a human wrote. This importer exists because
    // the field was empty; once it is not, the field belongs to the editor.
    if (project.description) {
      report.skippedHasDescription.push(entry.title)
      continue
    }
    try {
      if (apply) {
        await payload.update({
          collection: 'projects',
          id: project.id,
          data: { description: paragraph(entry.text) },
        })
      }
      report.updated.push({ title: entry.title, source: entry.source, chars: entry.text.length })
    } catch (err) {
      report.errors.push({ title: entry.title, message: String(err?.message ?? err) })
    }
  }

  // Name what is still empty, so the gap stays visible instead of looking done.
  for (const project of all) {
    const covered = DESCRIPTIONS.some((d) => d.title.toLowerCase() === project.title.toLowerCase())
    if (!covered && !project.description) report.missingSource.push(project.title)
  }

  const reportPath = path.join(repoRoot, 'reports', `project-descriptions-${report.mode}.json`)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(
    `${report.mode}: ${report.updated.length} described, ` +
      `${report.skippedHasDescription.length} already had text, ${report.errors.length} errors`,
  )
  for (const row of report.updated) console.log(`  + ${row.title}  (${row.chars} chars, ${row.source})`)
  if (report.missingSource.length > 0) {
    console.log(`  still empty, no public record found: ${report.missingSource.join(', ')}`)
  }
  console.log(`report → ${reportPath}`)
}

await run()
