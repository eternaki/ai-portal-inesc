# People profiles: a page per person, a card that only identifies

Date: 2026-08-11
Status: approved by the user ("делай"), implementation pending

## 1. Why

The People page renders 113 cards, each carrying the member's links and a
"Recent publications" block. The result is a wall: finding a person means reading
past everyone else's bibliography. Nothing on that page is a destination — a
member has no address of their own, which also makes the self-edit feature the
brief asks for pointless, because there is no page to edit *toward*.

Two changes: the card shrinks to what identifies a person, and the detail moves to
a page of their own.

## 2. Why the pages will look sparse, and why that is not a reason to skip them

Measured 2026-08-11:

| Publications per member | Members |
|---|---|
| 0 | 81 |
| 1–5 | 25 |
| 6–20 | 5 |
| 21–100 | 1 |
| 100+ | 1 |

No member has a bio. 92 have a LinkedIn link, 15 an ORCID, 56 a photo.

That looks like an argument against per-person pages. It is not, because the
emptiness is ours, not theirs: **all 252 publications in the database have the
same person as an author.** The `ingest` pipeline pulls works by OpenAlex author
id, and exactly one member has one — the group leader. We downloaded one
bibliography and called it the group's. A PhD student who publishes without their
supervisor is invisible to us.

So a person page is not a page with nothing on it; it is the place the missing
data belongs once it arrives. Designing around today's gap would freeze the gap.

**Follow-up work this exposes** (not part of this spec): give members OpenAlex ids
— ORCID resolves to one automatically, and 7 of 11 PhD students have an ORCID —
then re-run `ingest`. Until then the site tells a visitor that one person wrote
everything the group has produced.

## 3. Data fix: link eight co-authors we already hold

Within the existing corpus, eight members appear as authors but are not linked,
because publications carry the academic form of the name and our records do not:

| Our record | Author name on publications | Rows |
|---|---|---|
| Alexandre Francisco | Alexandre P. Francisco | 14 |
| Sara Madeira | Sara C. Madeira | 11 |
| Alexandra Carvalho | Alexandra M. Carvalho | 9 |
| Pedro Monteiro | Pedro T. Monteiro | 8 |
| André Martins | André L. Martins | 3 |
| Nuno Mendes | Nuno D. Mendes | 3 |
| Pedro Stralen | Pedro Van Stralen | 1 |
| Clara Pereira | Clara Martins Pereira | 1 |

Linked through an **explicit allowlist of these eight pairs**, not by loosening the
existing linker's rules. `publications:link-members` currently reports 0 linkable
rows and 2 ambiguous, and it is right to: the author "Gonçalo Oliveira" matches
both our `Gonçalo Oliveira` and our `Gonçalo Goulart Oliveira`. A rule loose enough
to catch the eight is loose enough to attribute someone else's paper, and a
misattributed publication is worse than a missing one. That pair stays unlinked.

Side observation for the roster work: three of the eight are filed as `alumni` and
three as `msc`, while co-authoring 3–14 papers each. The role errors go beyond the
42 the reconciliation already found.

## 4. The list page

`/people` keeps its grouping (Active by role, then Suspended, then Completed) and
its grid. Each card becomes: photo or initials, name, role label. The links row and
the "Recent publications" block are removed. The whole card is a link to
`/people/[slug]`.

A member whose `slug` is empty is rendered as a non-linking card rather than
linking to a broken URL.

## 5. The person page

`/people/[slug]`, a Server Component, `force-dynamic`, following the shape of
`publications/[slug]/page.tsx`.

- Photo (or initials) at a larger size, name, role badge, and the membership status
  when it is not `active`.
- Research interests, then bio when present.
- The links row, honouring the existing per-link visibility toggles
  (`showLinkedIn`, `showORCID`, …) exactly as the current card does. Reuse the
  existing `PersonLinks` logic rather than rewriting it.
- **Publications** — every one, newest first, rendered with `PubRow`, paginated at
  25 with the pager already used on `/publications` and `/dissertations`. One member
  has 252; a single page of them is not readable.
- **Dissertations** — two lists: supervised by this member, and authored by them.
  Both come from the collection built in the previous stage.
- `JsonLd` Person, with `sameAs` from the same visible links the page shows.
- `notFound()` for an unknown slug.

Empty sections are simply absent; no "no publications yet" placeholder, which only
draws attention to the gap.

## 6. Anchor migration

Every `/people#<slug>` link becomes `/people/<slug>`:

- `web/src/components/PubRow.tsx`
- `web/src/components/DissertationRow.tsx`
- `web/src/components/MemberAvatarStack.tsx`
- `web/src/app/(frontend)/publications/[slug]/page.tsx`
- `web/src/app/(frontend)/dissertations/[slug]/page.tsx`
- `web/src/app/(frontend)/search/page.tsx` (the `members` entity link)
- `ai/app/rag/retriever.py` if it emits a people URL

The `id={slug}` anchors on the list page's cards are no longer needed once nothing
links to them.

## 7. Sitemap

Person pages are added for every member. A profile carrying a photo, a name, a role
and a link is a legitimate entity page, not thin content, and 56 of them already
have photos.

## 8. i18n

New keys in `web/src/i18n/messages.ts`, in **both** `en` and `pt`: the person page
title pattern, section headings for publications and for the two dissertation
lists, and the pager labels. No visible string is hardcoded.

## 9. Out of scope

- Name search on `/people`. The wall is the reason for this redesign, but a search
  box is a separate decision and the user has asked that search be left alone for
  now.
- Giving members OpenAlex ids and re-running `ingest` (see §2).
- **Correcting member roles or membership statuses. Ruled out by the user on
  2026-08-11: that work belongs to the supervisor.** The evidence in this spec —
  members filed as `alumni` or `msc` while co-authoring 3–14 papers — is recorded
  so he can act on it, not so we can.
