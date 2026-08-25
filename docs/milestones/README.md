# Milestones

A **milestone** is a declared bundle of epics and requirements that ships as one
release. It has a long-lived integration branch; feature work merges there
instead of into `master`, and the branch reaches `master` — and is deleted —
only when its gate passes. That merge is what cuts the release.

This directory is **process documentation for the team building Rotaris**. It is
not part of the product specification:

| Layer | Lives in | Carries requirement ids? |
| --- | --- | --- |
| The Rotaris product — what the app does for its users | `src/rotaris_core/`, `apps/rotaris/`, specified by [`docs/requirements/`](../requirements/README.md) | Yes. `@traces`/`@verifies`, build-breaking. |
| How we build Rotaris — this directory, `AGENTS.md`, `.github/`, `devtools/` | here | No. ReqToCode never sees it. |

A milestone *names* epics and SWRs, because those are what we are shipping.
Naming product vocabulary does not make a milestone part of the product. Nothing
in `src/` or `apps/` knows a milestone exists, and nothing here is enforced by
`reqtocode check`.

Membership deliberately does **not** live in requirement frontmatter. Adding a
`milestone:` field to a requirement file would change its `content_hash`, rewrite
its row in the generated `swr.py`, churn the shrink-only baselines, and — in a
multi-id spec file such as `2300-traceability.md`, which declares 38 ids —
conflict with every sibling agent working in that file. Keeping membership out
here costs nothing and avoids all of it.

## The files

| File | What it is |
| --- | --- |
| `TEMPLATE.md` | Copy-paste skeleton for a new milestone |
| `M<n>-<slug>.md` | One milestone |

## Frontmatter

| Field | Values | Meaning |
| --- | --- | --- |
| `milestone` | `M<n>`, unique, stable | The id. Matches the filename. |
| `title` | free text | Short label; becomes the tracking PR title and the release name |
| `status` | `planned` \| `active` \| `released` \| `abandoned` | Lifecycle |
| `branch` | `milestone/m<n>-<slug>` | The integration branch. Must match the filename. |
| `target-version` | `X.Y.Z` | The stable version this milestone releases as. No prerelease suffix — alphas cut along the way carry their own. |
| `opened` | `YYYY-MM-DD` | When the milestone was declared |
| `epics` | list of `SWR-<block>` | Member epics. Each expands to every requirement its index file declares plus everything in its folder. |
| `requirements` | list of `SWR-<n>` | Individual member requirements, for ids whose host epic is not in scope |
| `excludes` | list of `SWR-<n>` | Ids an epic pulls in that are explicitly deferred out of this milestone |
| `released-version`, `released-on` | version, date | Required once `status: released` |

**Epic expansion is by file location, never by number range.** An epic owns the
ids declared by `<block>-<epic-slug>.md` plus everything in `<block>-<epic-slug>/`.
The hundreds-blocks are *not* a reliable grouping: 2900 and 3700 are shared
overflow pools whose ids live in half a dozen different epics. This is the same
rule the product's own store adapter applies
(`rotaris_core.requirements.sources.reqtocode.epic_index_for`), and a test pins
the two implementations together.

Members resolve to `expand(epics) ∪ requirements − excludes − deprecated`.

**A requirement in no milestone is normal.** That is how a bug fix goes straight
to `master`. The tool answers `master` for it and nothing complains.

## Working on a milestone

Ask the tool which branch your work belongs on — never assume:

```bash
uv run python devtools/milestone.py branch-for SWR-2901
# -> milestone/m1-event-store
uv run python devtools/milestone.py branch-for SWR-3728
# -> master
```

Then follow [AGENTS.md § Workflow](../../AGENTS.md#workflow--worktree-merge) as
usual, with that branch as your base and merge target instead of `master`.

## Closing one

```bash
uv run python devtools/milestone.py gate M1 --tests-passed
```

The gate is green only when every member requirement is `approved`, ReqToCode is
clean, no requirement text has drifted from its code, both manifests carry
`target-version`, `origin/master` is already merged in, and the full suite passed
on this head. See `devtools/README.md` for the whole list and how the tests
verdict is supplied.

Then merge to `master`, tag `v<target-version>`, delete the branch, and set the
manifest to `status: released` with `released-version` and `released-on`.
