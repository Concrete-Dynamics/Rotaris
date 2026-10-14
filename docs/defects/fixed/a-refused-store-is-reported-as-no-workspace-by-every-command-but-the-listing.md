## A refused store is reported as "no workspace" by every command but the listing

While the open of a workspace's store is refused and held as `workspace.store-missing` (a place that exists and holds no
store, REQ-SESSION-202) or `workspace.store-displaced` (OQ-266), the window keeps its workspace folder and has no workspace
identifier. `session.list` answers the held refusal (fin43), but every other workspace-scoped command gates on the
identifier alone and answers `workspace.none` — "Open a workspace before starting a run", "Open a workspace before reading
its configuration", "Open a workspace first" — although a workspace is open in that window. The composer's start therefore
says no workspace is open, not that the session store could not be opened, and nothing was started. Noticed 2026-10-14 by
fin44 while building OQ-281's ruling ("every workspace-scoped refusal in that window states the held condition").

## Specs

`REQ-SESSION-202`: no session in that workspace starts "(REQ-SESSION-198, REQ-SESSION-089, REQ-EVENTS-084)", and "what is
reported MUST say what was actually found". `REQ-SESSION-089`: a record that cannot be opened refuses the run as a pre-run
failure "conveying … that nothing was started, which store could not be opened". OQ-281, ruled 2026-10-14 under R-072.

## Relevant files

- `apps/desktop/src/main/commands/session.ts` — `session.start`'s `workspace.none` gate.
- `apps/desktop/src/main/commands/{config,git,hooks,improvements,library,mcp,skills,workspace}.ts` — the other gates.
- `apps/desktop/src/main/commands/library.ts` — `session.list`, the one gate that answers the held refusal.
- `apps/desktop/src/main/index.ts` — `runCommand`, the one path every command answer leaves by.

## Outcome — repaired 2026-10-14 (fin44, `fin44-store-resolution`; OQ-281 ruled under R-072)

`session.start` (`apps/desktop/src/main/commands/session.ts`), in a window whose store the open refused, answers the held
refusal's code with "Nothing was started: the session store for this workspace could not be opened" and the workspace service's
own detail naming the place and that the store is not in it, asking the run host nothing (REQ-SESSION-089, REQ-SESSION-202).
Every other gate is covered in one place: `runCommand` (`apps/desktop/src/main/index.ts`) passes each answer through
`answerUnderHeldRefusal` (`apps/desktop/src/main/store-notice.ts`), which turns a `workspace.none` refusal in a window with no
workspace identifier, while a refusal is held for its workspace, into that refusal — so a gate added later is covered too.
Pinned by `apps/desktop/src/main/commands/session.test.ts` and `apps/desktop/src/main/held-refusal.test.ts` (red before the
repair: "Open a workspace before starting a run", and no mapping), and in the built app by `pnpm store-resolution-proof`'s
launch B (`session.start` and `config.read` both state the condition).
