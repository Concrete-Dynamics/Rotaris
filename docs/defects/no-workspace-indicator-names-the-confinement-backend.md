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
