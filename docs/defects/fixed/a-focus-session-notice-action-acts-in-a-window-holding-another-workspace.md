## A `focus-session` notice action acts in a window holding another workspace

Recorded 2026-10-14 by fin43 (`fin43-notices-and-config`) from the consortium's ruling of OQ-267 (step 8 (a)), and confirmed
on that branch by reading the path and by the tests named in the outcome.

`focus-session` carries a session id and no workspace (`packages/contracts/src/notices.ts`). Main raises it on REQ-NOTIFY-031's
and REQ-NOTIFY-032's notices for a session that is not on screen (`run-failure-notice.ts`) and on the durable-store
failure's "Reopen the session" (`recoveryFor('session.reopen')` in `apps/desktop/src/main/index.ts`), and every notice is
broadcast to every main window (`relay.broadcast(CHANNEL.noticeCurrent, …)`). With two main windows on two workspaces
(PD-SHELL-001), or after a switch since the notice was raised, the action can be activated in a window whose workspace's
store does not hold the session. That window then asks main to load it (`session.resume` with its own workspace id):

- the run host records the session as belonging to the asking window's workspace (`sessionRoots.set` in
  `apps/desktop/src/run-host/dispatch.ts`) **before** the engine refuses it, so a session live in the other workspace has its
  continuation lease taken against the wrong workspace's configuration from then on (`continuationLeaseForSession`);
- the engine refuses it (`no-session`: "No session exists under id …"), and main raises that refusal as an `error` notice,
  which replaces the notice the user pressed in the one slot (REQ-NOTIFY-024) with a report that reads as a fault.

## Specs

REQ-NOTIFY-044 (an action concerning an object carries its identity, and an action names its own target), REQ-NOTIFY-031 and
REQ-NOTIFY-032 (the "Open the session" action focuses the session the notice names), PD-SHELL-002 and PD-SHELL-001 (two main
windows on two workspaces; each window's session is its own workspace's).

## Relevant files

- `packages/contracts/src/notices.ts` — `focus-session { sessionId }`, no workspace.
- `apps/desktop/src/main/run-failure-notice.ts` — the REQ-NOTIFY-031/032 notices carrying it.
- `apps/desktop/src/main/index.ts` — `recoveryFor('session.reopen')`; the notice broadcast to every window.
- `apps/desktop/src/renderer/main.tsx` — `dispatchNoticeAction`'s `focus-session` arm → `openSession` → `session.resume`.
- `apps/desktop/src/main/commands/session.ts` — `session.resume` raises every refusal as an error notice.
- `apps/desktop/src/run-host/dispatch.ts` — `session.resume` writes `sessionRoots` before the engine's check.

## Outcome

*Repaired 2026-10-14 by fin43 (`fin43-notices-and-config`).* A `focus-session` press in a window whose workspace does not hold
the session is not dispatched. The renderer's arm marks its load as a notice action's (`session.resume { fromNotice: true }`,
`apps/desktop/src/renderer/main.tsx`); main, answered `session.no-session` for such a load, logs it and raises no notice, so the
notice pressed stays the one on screen (`apps/desktop/src/main/commands/session.ts`); and the run host records a session's
workspace only once the engine has loaded it from that workspace's store (`apps/desktop/src/run-host/dispatch.ts`), so the
refused load moves nothing. A load the session browser asks for raises its refusal as before. Pinned by
`commands/session.test.ts` (no notice for a notice's foreign load, red before; the browser's load still raises),
`run-host/dispatch.test.ts` (a refused resume leaves the session under its own root, red before) and
`renderer/recovery-wiring.test.ts`; `pnpm notice-proof` section 6c presses "Open the session" for a session the pressing
window's store does not hold and reads the notice still standing, the "not dispatched" line in the log and no "could not be
loaded" error. ~~What the press should do instead — reach the window that holds the session — is not decided:
[OQ-292](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-292).~~ *Amended 2026-10-14 (fin44, `fin44-notice-reach`):* decided —
[OQ-292](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-292) was ruled the same day under R-072 as
[`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001) revision 3: the action carries its session's workspace and reaches
the window holding it (or adds one), and the session is focused there. The silence above (`fromNotice`, the logged
`session.no-session`) is withdrawn by that revision; the run host's ordering repair stays.
