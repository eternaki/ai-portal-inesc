# Legacy-site parity: dissertations, roster truth, and section-scoped search

Date: 2026-08-10
Status: approved (design), implementation staged
Supersedes: nothing. Replaces the "merge Events + Reading Groups" idea, which was
reverted at the supervisor's request.

## 1. Why

The portal replaces the group's existing site at <https://mlkd.idss.inesc-id.pt>.
The supervisor asked us to keep that site's sections intact. An audit of both sites
found three gaps and one factual error:

- **Dissertations do not exist here.** The legacy site carries 59 of them across
  three lifecycle stages (13 open, 7 ongoing, 39 finished). This is the single
  largest missing section.
- **Open positions do not exist here.** Legacy has a section for paid research jobs.
- ~~**Nobody has a photo.**~~ **DONE** — 55 of 113 members now carry the photo the legacy site has for them.
- **42 members are shown as active MSc students whom the group lists as alumni.**
  The People page currently makes a false claim about the group's composition.

Guiding rule agreed with the user: **lose nothing from the legacy site, but we may
add on top, and we may reorganise inside a section when the legacy arrangement is
plainly illogical.**

## 2. Decisions that shape everything else

| Decision | Rationale |
|---|---|
| `thesis-topics` becomes `dissertations` | The collection already models the same lifecycle (open/assigned/completed ≙ New/Ongoing/Finished) and already holds 2 rows. Renaming beats duplicating. |
| `/opportunities` is deleted outright, no redirect | The portal is not deployed anywhere (`SITE_URL` unset, `docs/DEPLOY.md` is placeholders), so no external link can break. Internal links are updated in place. |
| `/research` is deleted; themes move to the homepage | 4 themes, all with empty descriptions, 1 member link, 0 key publications. The page only looked populated because it silently fell back to semantic search over the theme *name*. The legacy site has no such section either — it states the mission in a paragraph on the homepage. |
| ~~No global search page; each list page searches its own content~~ **REVERSED 2026-08-10** | The user decided to leave search exactly as it is for now and revisit it later. `/search` and the header magnifier stay; no per-section search inputs are added. The only search change in this work is renaming the `thesis-topics` entity type to `dissertations`, which is forced by the collection rename. |
| Events and Reading Groups stay separate | Supervisor's explicit request. Recorded in `web/CLAUDE.md` so it is not "cleaned up" later. |

### Resulting navigation

```
People · Publications · Dissertations · News · Events · Reading Groups · Open positions
```

The magnifier stays in the header (see the reversed search decision above), so this
is seven items plus the search icon. The order mirrors the legacy site (Team first,
Open positions last); News is our addition, slotted with the other "what's happening"
sections. Two labels are long ("Reading Groups", "Open positions"), so the row lands
near the 1240px hamburger breakpoint — measure it in the browser during
implementation and raise the breakpoint if it wraps.

`/research` disappearing leaves three fields on `research-themes` rendering nowhere:
`members`, `keyPublications` and (partly) `description`. Keep `name`, `slug` and
`description` — the description becomes the caption under each homepage tile — and
drop the other two. A field an editor fills that appears on no page is exactly the
maintenance trap the brief warns about.

## 3. Dissertations

### 3.1 Collection

`thesis-topics` → `dissertations`. A migration renames the table, its `_rels`
companion and the `payload_locked_documents_rels` column, and remaps the status enum
`open → open`, `assigned → ongoing`, `completed → finished`. Both existing rows are
`open` today, so they survive unchanged. The migration is reversible.

| Field | Type | Notes |
|---|---|---|
| `title` | text, required | |
| `slug` | text | detail page address |
| `status` | select `open` / `ongoing` / `finished` | renamed from open/assigned/completed to match the supervisor's vocabulary |
| `level` | select MSc / PhD | kept — PhD dissertations do occur |
| `supervisors` | array `{ name: text, member?: relationship }` | |
| `author` | group `{ name: text, member?: relationship }` | empty for `open` |
| `description` | richText | source contains real `<p>`, `<ol>`, `<li>` |
| `requisites` | richText | |
| `fenixUrl` | text | link to the defended thesis |
| `themes` | relationship | existing field, kept |

**Why names are text with an optional member link, not a plain relationship.** Of 37
dissertation authors on the legacy site, 17 match a member exactly and 20 do not —
some are spelling variants (`João Marques Cardoso` vs our `João Marques`), some are
students we simply do not have. A hard relationship would drop the author on 20 of
those 37. This is the pattern `Publications.authors` already uses: the
bibliographic fact always renders, the profile link appears when we can resolve it.

**Why `requisites` is its own field but `notes` and `external cooperation` are not.**
"Requisites" appears in 12 of the 13 open topics (the thirteenth has no abstract at
all) and is what a student uses to decide whether to apply, so it earns a styled
block. "Notes" and "External cooperation" appear in about half and live as prose
inside the description; promoting them would
make the editor face fields that are usually empty.

**Deliberately omitted:** `references` (part of the description in the source) and
`year` (the legacy site records no defence year for any entry, so there is nothing
to populate it from).

### 3.2 Pages

- `/dissertations` — three sections (Open → Ongoing → Finished), chips for stage and
  level, paginated from the start. Row: title, author, supervisors, stage badge.
- `/dissertations/[slug]` — full description, Requisites block, supervisors linked to
  profiles where resolvable, author, Fenix button for finished work.

The legacy `finished` page is a single 133 KB document with 39 full abstracts inline.
Splitting list from detail follows the pattern publications already use, and honours
the user's framing that a dissertation is a publication in another format.

Once dissertations have their own URLs, one adapter in `ai/app/entities.py` makes
them semantically searchable alongside papers.

### 3.3 Importer

`ai/app/pipelines/import_dissertations.py`, `--dry-run` by default, report written to
`web/reports/`.

Source markup is regular across all three legacy pages — `.thesis-topic-link`
(href + title), `.thesis-topic-text`, `.thesis-topic-abstract`:

| Page | Count | Author | Fenix link |
|---|---|---|---|
| new | 13 | no | no |
| ongoing | 7 | yes | no |
| finished | 39 (38 + 1 variant) | yes | yes |

Parsing rules:

- The attribution line is `Supervised by A [and B] [and authored by X]`. Split on
  ` and authored by ` first, then split supervisors on ` and `.
- The `new` and `finished` pages each have one entry using `.thesis-topic-no-abstract-*`
  class names. The parser must accept both variants or it silently drops them; the
  first count of the `new` page missed exactly this and read 12 instead of 13.
- Description HTML converts to Lexical richText.
- People are resolved against `members` by normalised name; unresolved names are
  stored as text and listed in the report.

Idempotent: matching is on **title**, which is unique across all 59 entries. `fenixUrl`
is deliberately NOT a key — only 30 of 59 entries carry one, and the source reuses a
single URL for two different works (an open topic points at someone else's defended
thesis). The first implementation keyed on `fenixUrl` and silently overwrote one
record; the importer now reports duplicated Fenix URLs instead, as a defect list to
hand back to the group. Trade-off accepted: renaming a dissertation upstream would
create a second row rather than update the first.

The apply switch is the env var `DISSERTATIONS_APPLY=1`, compared as a strict string.
`payload run` does not forward unknown command-line flags to the script, so the
`--apply` flag the plan originally specified never arrived.

## 4. Member photos — DONE

`web/scripts/import-member-photos.mjs`, dry-run by default; apply with
`MEMBER_PHOTOS_APPLY=1`.

Parses the legacy team page (`.member-image` / `.member-name` / `.member-title`),
downloads each photo, uploads it to Payload Media and links it to the member.

**Result: 55 of 113 members now have a photo.** The remainder are honest gaps, not
failures:

| Outcome | Count | Detail |
|---|---|---|
| uploaded | 55 | |
| weak match, skipped | 1 | `Arlindo Oliveira` ↔ our `Arlindo L. Oliveira` |
| not in our database | 2 | `Vincente Silvestre`, `Oleksander S.` |
| duplicate legacy entry | 1 | `Gonçalo Oliveira` is listed twice, under two photo files |

**Matching uses two signals.** Displayed names are sometimes abbreviated (`R.
Barbulescu`) while the photo filename carries the full name
(`RuxandraBarbulescu.jpg`). Matching on both recovers those cases.

**A first+last match is reported, never acted on** — attaching the wrong face to a
profile is worse than an initials avatar. `MEMBER_PHOTOS_INCLUDE_WEAK=1` lets an
operator accept them after reading the report, which keeps that judgement with a
person. This is why the group leader's own photo is still missing.

**One member never gets two photos in a run.** The first pass silently overwrote
Gonçalo Oliveira's link and orphaned a Media row (since removed); the importer now
reports the duplicate instead.

**LinkedIn is not a source.** Profile pages are behind authentication, photos are
served as signed `media.licdn.com` URLs, and automated collection breaches their
user agreement. Members without a legacy photo keep the initials avatar and can
upload their own through the existing profile self-edit.

The name matcher is shared with the roster reconciliation
(`web/scripts/lib/member-matcher.mjs`) so one set of rules governs both.

## 5. Roster reconciliation — REPORT PRODUCED, NO CHANGES MADE

`web/scripts/reconcile-roster.mjs` — **read-only, produces a report, changes
nothing.** Run it with `pnpm roster:reconcile`; the output lives at
`web/reports/roster-reconciliation.json`.

Measured by `pnpm roster:reconcile` (read-only) against the legacy team page,
which lists **59** people — 14 current, 45 alumni:

| Outcome | Count |
|---|---|
| status mismatch — ours `msc/active`, theirs `alumni/completed` | **42** |
| agree | 14 |
| fuzzy match, needs a human | 1 (`Arlindo Oliveira` ↔ `Arlindo L. Oliveira`, roles agree) |
| on the legacy site only | 2 (`Vincente Silvestre`, `Oleksander S.`) |
| in our database only | 57 (45 active MSc, 11 alumni, 1 suspended) |

Every single mismatch is the same one: we call someone an active MSc student, the
group calls them an alumnus. There is no second pattern.

Put together: we present **87** people as active MSc students. 42 are provably
alumni by the group's own site; the other 45 do not appear on it at all.

Root cause: `web/data/mlkd-members-roster-update.json` declares `role: msc,
membershipStatus: active` for 87 people — evidently everyone who ever wrote a thesis
with the group, not the current cohort.

The report groups people into: status mismatch, present here but not on the legacy
site (47 MSc), present there but not here, and a separate "fuzzy match, needs a
human" list. **Nobody is deleted and no status is changed automatically** — the user
confirmed all these people belong to the group; only their stage is wrong, and
deciding each case is his and the supervisor's call.

## 6. Open positions

New collection `open-positions`: `title`, `slug`, `kind` (PhD / Postdoc / Researcher
/ Internship), `status` (open / closed), `deadline` (optional), `applyUrl`,
`description`, `contactEmail`. Public page shows `open` only; closed entries stay for
the record.

Page `/open-positions`. The empty state is the **normal** state — the group posts a
position roughly once a year — so it is designed, not a dashed `.empty` box: a short
"no open positions right now" with a contact route.

The legacy page currently reads "Currently, there are no open positions" while
linking a live vacancy. Deriving the empty state from the data instead of hand-typed
copy makes that contradiction impossible here.

## 7. Publications: histogram filter

Replaces the 35 year chips that wrap to three rows.

One series (publications per year), so **one hue**, no legend. Selection is carried
by a secondary channel — an outline ring plus a visible year label — and non-selected
bars drop to neutral grey when a filter is active. Encoding selection as a second
blue was tried and rejected: in dark mode the lightness band is L 0.48–0.67, and two
blues inside it either fail the normal-vision separation floor (ΔE 11.8 against a
minimum of 15) or fall below the chroma floor.

Validated with `dataviz/scripts/validate_palette.js`:

| Mode | Bar | Surface | Result |
|---|---|---|---|
| light | `#2553a5` | `#f6f7f4` | all checks pass |
| dark | `#6b93e2` | `#10131a` | all checks pass |

Marks: thin bars, 4px rounded top, 2px gap, no gridlines. Labels only at the scale
ends and on the selected year — never a number on every bar. Each bar is an
`<a href="/publications?year=YYYY">`, so the filter works with **no client-side JS**;
the hit area spans the full ~32px cell, not the bar width, so narrow years remain
clickable. A collapsed year/count table ships alongside, because a value must not be
reachable by hover alone.

Publication type stays as chips — four options is what chips are for.

## 8. Section-scoped search — DEFERRED

Originally this section replaced the global `/search` page with a search input on
`/publications`, `/dissertations` and `/people`. **The user cancelled it on
2026-08-10:** search stays exactly as it is and will be reconsidered on its own
later. Nothing here is implemented.

The one unavoidable exception is mechanical: `search/page.tsx` references the
`thesis-topics` collection, which the rename removes, so its entity type and result
link change to `dissertations`. Behaviour is unchanged.

Noted for whenever this is revisited: `/people` renders 113 cards with no way to
find anyone, which is the strongest argument for a per-section search.

## 9. Staging

Independent pieces, in this order:

1. ~~**Dissertations**~~ — **DONE** (61 records live: 15 open, 7 ongoing, 39 finished).
2. ~~**Roster reconciliation report**~~ — **DONE**, read-only; 42 status mismatches found.
3. ~~**Member photos**~~ — **DONE**, 55 imported.
4. **Publications histogram + `/research` removal + nav reorder** — the front-end
   pass. (`/opportunities` goes with stage 1; scoped search is deferred.)
5. **Open positions** — smallest, least urgent.

Each stage gets its own implementation plan.

## 10. Out of scope

- Migrating legacy Projects (9) and the reading-group log (since Mar 2022) — deferred
  by the user; `/projects` and `/software` stay as they are.
- Running `summarize` — no LLM key available.
- Backfilling `originalUrl` — the pipeline is written and dry-run clean (251/251
  resolved) but blocked on an empty `PAYLOAD_API_KEY`.
