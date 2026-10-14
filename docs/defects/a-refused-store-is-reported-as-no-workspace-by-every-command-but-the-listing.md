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
