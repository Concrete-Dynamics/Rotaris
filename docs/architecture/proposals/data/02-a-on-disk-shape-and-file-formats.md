# Architecture proposals — DATA slice — A. On-disk shape and file formats

Part 2 of 25 of [the data proposal](../data.md), which indexes every part.

## A. On-disk shape and file formats

**A1 — The workspace scope is a directory literally named `.rotaris` at the workspace root, and its
internal layout is fixed. (hard)**
`REQ-CONFIG-001`, `REQ-CONFIG-010`, `REQ-GIT-005`, `REQ-GIT-019`, and the `Data & Formats` layouts of
domains 06, 14 and 15 fix, between them: `sessions/<session-id>/`, `worktrees/` (subpath
configurable, `REQ-GIT-073`/`REQ-CONFIG-068`), `worktrees/integrations/<integration-id>/`
(`REQ-GIT-130`), `requirements/worktrees/<unit-dir>/` (fixed, named by **no** configuration key —
`REQ-GIT-137`, `REQ-GIT-138`, `REQ-CONFIG-194`), `requirements/` for delivery records (subpath
configurable, `REQ-CONFIG-192`), `improvement_artifacts/` and its `history/` subtree
(`REQ-LIBRARY-042`, `REQ-LIBRARY-049`), `persona_memory/<persona>.md` (`REQ-LIBRARY-150`),
`plugins/*.py`, `tools/`, `agents.yaml`, `models.yml`, `secrets.yaml`, `rotaris-prompts.json`
(`REQ-LIBRARY-138`) and `integration.lock` (`REQ-GIT-128`).
`REQ-CONFIG-058` withdraws directory adoption outright: the directory is addressed by its current
name only and a directory under any other name is left untouched. There is no migration path to
design and no configurable root.

**A2 — `.rotaris` exclusion is a first-component, case-insensitive, name-based test that never
follows links. (hard)**
`REQ-GIT-003`. The test is applied to the path as the tree names it; a symlink or junction is an
ordinary entry at its own path and its target is never read, written or deleted. `.Rotaris/` and
`.ROTARIS/` are excluded exactly as `.rotaris/` is. Consequences the specification enumerates:
cleanliness (`REQ-GIT-014`), capture (`REQ-GIT-034`), restore (`REQ-GIT-040`), drift
(`REQ-GIT-056`), the Git view's diff totals (`REQ-GIT-105`, `REQ-GIT-107`), and both
base-cleanliness gates (`REQ-GIT-127`, `REQ-GIT-133`). This forbids any path filter implemented by
resolving real paths, and it forbids reusing a gitignore matcher — gitignored paths are excluded
separately and by a different rule (`REQ-GIT-034`, `REQ-GIT-035`).

**A3 — There are three separate per-user stores and they are not interchangeable. (hard)**
(1) The per-user **configuration** directory — `~/.config/rotaris/`,
`~/Library/Application Support/rotaris/`, `%LOCALAPPDATA%\rotaris\rotaris\` (`REQ-CONFIG-001`) —
holding `agents.yaml`, `models.yml`, `secrets.yaml`, `project_settings.yaml`, `tools/`.
(2) The per-user **data** directory, a *different* directory (`REQ-CONFIG-010`, `REQ-CONFIG-011`),
holding provider credentials and `setup/state.json` (`REQ-CONFIG-397`).
(3) The per-user **preference store**, platform-standard for organisation/application pair
`Rotaris`/`Rotaris` (`REQ-SHELL-006`), whose key set is closed and whose keys are slash-namespaced.
`REQ-CONFIG-463`, `REQ-GIT-153` and `REQ-LIBRARY`'s configuration section all state the disjointness
in the same terms: **no key of the layered YAML surface is ever read from or written to the
preference store, and no preference key ever appears in a YAML file.** Domains 06 and 14 mint no
preference key of their own; they rely on `interface/worktreeCleanupPrompt` (`REQ-CONFIG-405`) and
on the pane-layout keys of `REQ-SHELL-069`.
The preference store's *physical path and on-disk encoding are explicitly free* (`REQ-SHELL-006`) —
the only observable obligations are the location convention, no elevation, outside every workspace,
absent-is-not-an-error, and survive-a-restart.
*Reconciled with the code, 2026-09-29 (R-067):* the product resolved (1) on Windows as
`%LOCALAPPDATA%\rotaris\config\` until this date, and the process view spelled that answer; both now spell
`REQ-CONFIG-001`'s `%LOCALAPPDATA%\rotaris\rotaris\`, and (2) stays the sibling `%LOCALAPPDATA%\rotaris\data\`
([the note](../../../defects/fixed/the-windows-global-configuration-directory-is-not-the-one-req-config-001-spells.md)).
On Windows that directory is also the one the preference store's platform-standard `Rotaris\Rotaris` root names, the
filesystem folding case. What this assumption separates is keys and files — `REQ-SHELL-006` leaves the store's path
free — so the two share a directory and no file, and neither reads what the other writes.

**A4 — The traceability store lives in the user's own repository, not under `.rotaris/`. (hard)**
`REQ-TRACE-001` (default `docs/requirements`, repository-relative and configurable),
`REQ-TRACE-004` (four plain-text bookkeeping artifacts at the store root), `REQ-TRACE-039` (the
generated symbol artifact under `src/`, implementation and test roots), `REQ-TRACE-040` (the layout
configuration is `rotaris-traceability.json` **at the repository root and nowhere else**; no key,
preference or surface renames it or nominates a second location). The requirement documents are the
project's own versioned artifacts. The product reads and, under two named actions only, writes
them — it does not own them and keeps no second copy (`REQ-TRACE-275`: the description is rendered
from the source, "there is no second requirement repository").

**A5 — Every persisted format is fixed, and every one of them is a file a person can open.
(hard)**
YAML: `agents.yaml`, `models.yml`, `secrets.yaml`, `project_settings.yaml` (`REQ-CONFIG-015`
through `REQ-CONFIG-024`, `REQ-CONFIG-199`).
JSON: improvement artifacts and their history, 2-space indent (`REQ-LIBRARY-042`, `REQ-LIBRARY-049`);
`rotaris-prompts.json`, 2-space indent plus trailing newline (`REQ-LIBRARY-138`);
`proposed-requirements.json` in a run's artifact directory (`REQ-TRACE-427`);
`rotaris-traceability.json` (`REQ-TRACE-013`, `REQ-TRACE-040`); the two lock files
(`REQ-GIT-020`, `REQ-GIT-128`); `setup/state.json` (`REQ-CONFIG-397`); `metadata.json`
(`REQ-GIT-018`); session-artifact records and `index.json` (`REQ-LIBRARY-087`).
JSONL, append-only: `timeline.jsonl`, `issues.json`, the evidence streams and `events.jsonl`
(`REQ-GIT-048`, `REQ-GIT-062`, and domains 07 and 20).
Markdown: requirement documents (`REQ-TRACE-001`), artifact sidecars with YAML frontmatter
(`REQ-LIBRARY-090`), persona memory (`REQ-LIBRARY-150`).
TSV: the retired-identifier log (`REQ-TRACE-131`).
Plain text: the three debt baselines (`REQ-TRACE-118` to `REQ-TRACE-120`).
Generated source: the requirement-symbol module (`REQ-TRACE-051` to `REQ-TRACE-059`).
Git objects and refs: checkpoints and improvement checkpoints (`REQ-GIT-029`, `REQ-LIBRARY-067`).

**A6 — No requirement anywhere in the specification names a database, a table, an index, a query,
or a schema migration. (hard, by exhaustion)**
A search of all twenty-one domain documents for `sqlite`, `database`, `SQL`, `b-tree` and `index
file` returns exactly two kinds of hit: Git's own on-disk index, which `REQ-GIT-004` and
`REQ-GIT-030` require to be left byte-identical, and `REQ-STARTUP-087`'s promise that nothing is
registered with an OS package database. The only versioning concept the specification defines is
`schema_version` as a **field written into each record** (`REQ-CONFIG-192`, `REQ-SESSION-013`,
`REQ-EVENTS` envelope), read forward-compatibly and never migrated in place. This is not silence
that leaves the question open; it is a complete enumeration of persisted state in which every entry
is a document.

**A7 — UTF-8, LF, and byte-stability across platforms are contractual for the traceability
artifacts. (hard)**
`REQ-TRACE-006` (read UTF-8 with replacement, normalise CRLF and lone CR to LF *before* parsing or
hashing), `REQ-TRACE-059` (deterministic generation: ascending order, LF, UTF-8, trailing newline —
generating from a reversed input list produces byte-identical output), `REQ-TRACE-126`,
`REQ-TRACE-137`, `REQ-TRACE-495`. `REQ-CONFIG-462` fixes UTF-8 for configuration files, accepts and
discards a BOM, and makes an undecodable primary file fatal with its own distinct message.
`REQ-EVENTS-090` fixes LF for the event store on every platform.

**A8 — Sort order is byte order, everywhere, by requirement. (hard)**
`REQ-GIT-057` fixes ascending path order as ascending byte order of the path's UTF-8 encoding,
"deterministic and independent of locale and of platform", and applies it to the whole of domain 06.
`REQ-TRACE-005` sorts the store scan by repository-relative POSIX path string; `REQ-TRACE-494`
requires every ordered output to be explicitly sorted and enumerates each one. `REQ-LIBRARY-045`
sorts artifact ids lexicographically by file stem; `REQ-LIBRARY-046` names covering artifacts in
ascending lexicographic order. No locale-aware collation may be used anywhere in this slice.
