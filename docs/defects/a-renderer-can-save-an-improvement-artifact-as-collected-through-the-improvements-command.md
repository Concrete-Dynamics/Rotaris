## A renderer can save an improvement artifact as collected through the improvements command

`CommandRequestSchema`'s `improvements` member carries `ImprovementCommandSchema` whole, and main's handler
(`apps/desktop/src/main/commands/improvements.ts`, the `'improvements'` entry) relays the command to the workspace service
verbatim. So a renderer can send `{ kind: 'improvements', command: { action: 'save-collected', artifact } }` and have an
artifact of its own making stored as if the analyst had collected it, or send `record-applied` or `prepare` for an artifact
the user never applied. Every legitimate `save-collected` comes from main itself, after the analyst's pass (ADR-0065,
`apps/desktop/src/main/improvements.ts`); no surface sends one. The service validates the artifact's shape, so the payload
is not unchecked, but its provenance is: the record would claim a collection that never ran. Noticed on 2026-11-01 while
bounding every command field (OQ-467, hardening plan bundle D1), which held this member to `FREE_TEXT_MAX` as JSON and
changed nothing else about it.

## Specs

No requirement says which improvement actions a window may ask for. REQ-SHELL-020 and ADR-0044 make main the filter of
what a renderer asks, and ADR-0065 / ADR-0061 make the collected artifact the analyst's output, saved by main; the
envelope admits more than any surface needs. Whether the renderer's member should be narrowed to the actions a surface
sends (`list`, `get`, `history`, `approved`, `review`, `edit`, `delete`, the rollback pair) is a question for the
record, not a repair this note makes.

## Relevant files

- `packages/contracts/src/commands.ts` — the `improvements` member, `jsonBounded(ImprovementCommandSchema)`.
- `packages/contracts/src/improvements.ts` — `ImprovementCommandSchema`, the twelve actions, `save-collected`'s `artifact: z.unknown()`.
- `apps/desktop/src/main/commands/improvements.ts` — the relay of `req.command` to the workspace service.
- `apps/desktop/src/main/improvements.ts` — main's own `save-collected`, the one legitimate sender.
- `apps/desktop/src/workspace-service/improvements.ts` — the service's `save-collected` case.
