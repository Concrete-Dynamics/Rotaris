## No workspace indicator names the confinement backend

REQ-SANDBOX-121 has "a workspace indicator naming the backend" appear for a session whose recorded result is confined,
hidden otherwise and tracking the focused session; REQ-MONITOR-257 and REQ-NOTIFY-030 re-bind "the sandbox indicator" on
a focus change, and REQ-NOTIFY-061 has it stop describing a refused run as sandboxed. No surface in this build draws one:
the session record carries `sandboxed` (`packages/contracts/src/channels.ts`), and no component in `packages/ui` or the
renderer reads it, and no code or record cites REQ-SANDBOX-121. Noticed 2026-10-02 while checking REQ-NOTIFY-061
([a-refused-confinement-start-is-not-reported-as-req-notify-061-says.md](a-refused-confinement-start-is-not-reported-as-req-notify-061-says.md));
not repaired: it is a surface of its own, drawn under `docs/design/README.md` §7.

## Specs

- REQ-SANDBOX-121 — the indicator.
- REQ-MONITOR-257, REQ-NOTIFY-030, REQ-NOTIFY-061 — the clauses that act on it.

## Relevant files

- `packages/contracts/src/channels.ts` — `sandboxed` on the session record, read by nothing that draws.
- `packages/ui/src/` — no indicator component.

## Outcome

Repaired 2026-10-02 (fin8, bundle `fin8-focus-bound-recovery`). The backend reaches the record and a surface draws it:

- Store v31 appends `sessions.sandbox_backend` (`packages/store/src/schema.ts`), written beside `sandboxed` when a run
  starts (`Run`'s `saveRunning`, from `postureAtStart`'s `sandboxBackend`); a confined session written before v31 takes
  the backend its `session.start` event recorded. The record carries `sandboxBackend` beside `sandboxed`
  (`packages/contracts/src/channels.ts`, `toSessionRecord`), '' wherever `sandboxed` is false.
- The status strip draws an inert text item, `sandbox: <backend>` (`statusStripSandboxItem`, `packages/ui/src/composer.ts`;
  the strip's `status` memo in `apps/desktop/src/renderer/main.tsx`), right after the workspace-scope flag, with the
  accessible name "Confinement backend" and a tooltip worded as the settings page's Sandbox mode control words
  confinement. It reads the focused session's record only, so it re-binds with focus (REQ-MONITOR-257, REQ-NOTIFY-030),
  is absent for an unconfined session, and is absent with no session focused, which is where a refused start leaves the
  window (REQ-NOTIFY-061, REQ-SANDBOX-120). The mockup has no confinement indicator, so the strip's own text-flag craft
  decided; no new control or token.
- REQ-NOTIFY-061's indicator clause for a session that exists (repair round 1, after fin8's verifier): a run of a
  confined session refused at the confinement gate — by its prompt, a retry, a continue, a plan decision or an
  authentication restart — publishes the session's record with `sandboxed: false` and no backend
  (`Sessions.refusedAtStart` and `Live.refusedConfinement`, `packages/engine/src/sessions.ts`), so the item is gone beside
  the refusal notice until a run of the session starts again. The stored row keeps the started run's own fact
  (REQ-SANDBOX-094); the state is the published record's. The first version of this repair kept the item describing the
  last run that started and raised what a refused continuation says as part of OQ-184; the verifier found that reading left
  the clause with no effect (a refused start leaves no session, so the only indicator that can stop is this one), and that
  part of OQ-184 is withdrawn.

Raised, not ruled: where the indicator stands among REQ-SHELL-038's items and its REQ-SHELL-047 threshold, and its wording
(OQ-184). Recorded beside it: the strip applies no REQ-SHELL-047 hiding and is over-full at the 1000 px floor, which this
item widens
([the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md](the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md)).

Pinned by `packages/ui/src/composer.test.ts` (confined and unconfined records, no session focused, a focus switch, and
the records published around a refusal at the gate), `packages/engine/src/sandbox-record.test.ts` (a confined run's record
names `bubblewrap`, an unconfined one none; a confined session's prompt, retry and continue refused at the confinement gate
each publish the record unconfined, another refusal publishes nothing, the row keeps `sandboxed 1`, and the next confined
run names `bubblewrap` again — that test fails without `refusedAtStart`) and
`packages/store/src/store.test.ts` (v30 → v31 with the backfill). Shown in the built application with `pnpm app:drive`
on this host (bubblewrap available) in one workspace configured `sandbox_mode: workspace-write`: before the repair a
confined session's strip read `… workspace-scoped | redaction: always on …` with no indicator, its record `sandboxed: 1`;
after it, a confined session (typed in the composer) reads `… workspace-scoped | sandbox: bubblewrap | redaction …`, an
unconfined one started with the launch override `sandboxMode: off` reads no such item, and switching focus between them
through the session browser moves it each way; the store held `sandboxed 1 / sandbox_backend bubblewrap` and `0 / ''`.
