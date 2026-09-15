## The `artifact_read` tool path filters sections with a stale private allow-list that omits `commands`

`packages/engine/src/artifacts/port.ts` holds a private `SECTION_NAMES` list —
`summary, key_findings, snippets, highlights, files` — and filters every `artifact_read` request's
`sections` argument through it. `PD-LIBRARY-001` widened the section vocabulary with `commands`
(`packages/contracts/src/artifacts.ts`, `ARTIFACT_SECTIONS`), and the tool schema in
`packages/agent-tools/src/tools/artifacts.ts` accepts `commands` — but the engine port does not, so a
filtered read for `commands` matches nothing, falls through to the unfiltered branch, and returns the
**full document** instead of the Commands section.

Found while planning the PD-LIBRARY-001 closeout: the existing unit test
(`store.sections(record, ['commands'])`) exercises the store directly and passes, so the drift is
invisible to the suite — the false green is on the *tool path*, which is the only path a model reaches.
The observable behaviour is a model asking for the command ledger and receiving the whole artifact,
which reads as success while carrying none of the filtering the request named.

## Specs

Contradicts `REQ-LIBRARY-099` as extended by `PD-LIBRARY-001`: the section filter is defined over
`ARTIFACT_SECTIONS`, whose single definition lives in `packages/contracts/src/artifacts.ts`; the port
holds a second, narrower copy instead of citing the vocabulary. The directive's own record
(`docs/product/directives.md`) describes the `artifact_read` section filter as part of the delivered
mechanism, so the delivered mechanism does not match its record.

Closeout review found the same pre-directive five-member wording in `REQ-TOOLS-148`. The directive
now extends that requirement too, and its back-pointer takes the widened vocabulary from
`REQ-LIBRARY-099` instead of creating another current definition.

## Relevant files

- `packages/engine/src/artifacts/port.ts` — `SECTION_NAMES`, the stale private copy; the repair is to
  filter against `ARTIFACT_SECTIONS` from `@rotaris/contracts` and delete the duplicate list.
- `packages/contracts/src/artifacts.ts` — `ARTIFACT_SECTIONS`, the single definition the port must use.
- `packages/agent-tools/src/tools/artifacts.ts` — the tool schema that already accepts `commands`,
  which is why the drift is invisible at the schema boundary.
- `packages/engine/src/artifacts/artifacts.test.ts` — the existing tests exercise `store.sections`
  directly; a regression through `artifactOps.read(ref, ['commands'])` is what pins the tool path.
- `docs/spec/05-tools-permissions-approvals.md` — `REQ-TOOLS-148` now carries the directive's
  extension and points to the Library-owned vocabulary.

## Repaired — 2026-09-14 (pointer)

The repair landed the same day the note was written, in commit `c6a691e`; its full account —
the port filtering against `ARTIFACT_SECTIONS` from `@rotaris/contracts`, the regression through
`artifactOps.read`, the sixth artifacts-proof launch driving the real filtered tool read in the
built app, and the record updates (first-executions, directives, views) — is the first-execution
note on [`PD-LIBRARY-001`](../product/directives.md#pd-library-001) and its row in
`docs/architecture/first-executions.md`. This section exists so the note itself, like every
other note in this directory, states that its defect is closed rather than leaving the repair
discoverable only from the directive's side.
