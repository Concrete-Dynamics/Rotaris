## A main window added after a notice was published does not show it

Found 2026-10-14 by fin43 (`fin43-notices-and-config`) while building `notice-proof` section 6c (PD-WORKSPACE-005 revision 2,
OQ-262). Not repaired: outside the task that found it.

A notice is an application notice, shown in every open main window from main's one notice store (ADR-0049; PD-WORKSPACE-005
"raised once and shown in every open main window"). Main publishes it on channel 4 (`notice:current`) to the windows attached
at that moment, and a renderer learns the current notice only from that channel (`bridge.onNotice` in
`apps/desktop/src/renderer/shell.ts`); nothing hands a window the notice already current when it is created. So a main window
added after the publication shows no notice while every older window still shows it, until the next publication.

Measured: the first draft of section 6c opened `atlas-billing`, whose background setup failed and raised "Project setup did
not finish: atlas-billing" in that window, then added a second window on another project with `workspace.choose`
(`newWindow: true`). The second window's notice slot read `null` for 15 s while the first still showed the banner. The
section was reordered so the banner is raised after both windows exist.

## Specs

ADR-0049 (one notice store, the current notice shown in every main window) and PD-WORKSPACE-005 ("shown in every open main
window"); REQ-NOTIFY-024 (one notice is current). REQ-NOTIFY-024's "nothing is queued, restored or re-presented" speaks of a
replaced notice, not of the current one in a window that did not exist when it was published; this note reads the current
notice as owed to every main window open while it is current.

## Relevant files

- `apps/desktop/src/main/notices.ts` — `createNoticeStore`: `set` broadcasts on channel 4 at publication only.
- `apps/desktop/src/main/index.ts` — `relay.broadcast(CHANNEL.noticeCurrent, …)`, the store's `broadcast` dependency.
- `apps/desktop/src/renderer/shell.ts` — `bridge.onNotice`, the only way a window learns the current notice.
- `apps/desktop/scripts/notice-proof.mjs` — section 6c, whose header records why its windows open in the order they do.

## Outcome

*Repaired 2026-10-14 by fin44 (`fin44-notice-reach`).* A window now asks for the notice that was current before it existed.
After it registers for channel 4, every renderer sends the new command `notice.current` once (`apps/desktop/src/renderer/shell.ts`).
Main answers after the store's chain has applied every publication accepted before the question (`notices.settled()`), in
channel 4's own shape (`apps/desktop/src/main/commands/shell.ts`). The renderer seeds its store with the answer
(`NoticeState.seed`, `packages/ui-core/src/notice.ts`) only while no channel-4 publication has reached it: any change after
the answer is published on the channel, so a publication that arrived first is never older than what it would overwrite.

Confirmed first by tests that failed without the repair: `packages/ui-core/src/notice.test.ts` (a store seeded from the answer
holds the current notice; a publication that arrived first wins; an answer that does not parse seeds nothing), and
`apps/desktop/src/main/commands/shell.test.ts` (`notice.current` waits for the chain, then answers the current notice).

`pnpm notice-proof` section 6d shows it in the built app. REQ-NOTIFY-031's notice is published while windows A and B exist. A
then switches to a third project, and the replacement window, built after the publication, shows that notice with its "Open the
session" action. With the renderer's request taken out and the app rebuilt, the same step failed as this note recorded:
"the current notice in the window built after its publication did not hold within 15000 ms; last seen null". With the
request back, it passed. Section 6c keeps its window order, which this defect had forced, and its header points here. The cost
PD-WORKSPACE-005 revision 3 named for this defect, "the added window does not show the banner", is marked lapsed in that
directive.
