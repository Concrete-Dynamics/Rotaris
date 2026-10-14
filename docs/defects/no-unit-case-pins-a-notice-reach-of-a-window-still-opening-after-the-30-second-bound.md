## No unit case pins a notice reach of a window still opening after the 30 second bound

`MainWindows.reach` meets a holder whose workspace open has not settled (a second notice-action press while the window the first
press added is still loading) and waits for that open through `MainWindows.awaitWorkspace`, bounded at 30,000 ms. Since
2026-10-14 (`fin45-optional-findings`) only a window that is GONE after the wait is refused; a holder still alive is answered
with that window and no workspace id, and the caller opens the action's surface in it. When the bound elapses with the open
still pending, the holder is alive, so the reach answers ok with no workspace id, where before fin45 it was refused.

That reading is consistent with "only a gone window is refused", but nothing pins it. Every reach case in
`main-windows.test.ts` settles the open (resolved, failed, or settled with no id) before it looks at the answer; none lets the
bound elapse. Confirmed 2026-10-14 on `fin46-accept1-9` (base `907415e`) by a mutation: with the bound's timer made to never
resolve (`timers.after(30_000, () => undefined)`), every test under `apps/desktop/src/main/` stays green (712 passed), so a
reach behind an open that never settles could hang the pressing window's action without a test noticing, and the answer the
bound gives is unpinned either way.

Noticed 2026-10-14 by fin45's review (`fin45-optional-findings`, Task 1); recorded 2026-10-14 by fin46 (acceptance finding C23).

## Specs

- `REQ-SHELL-019` — a window that could not be built reports "Could not open the selected project: {reason}"; the refusal after
  the wait is kept for a window that is gone, which `#addWindow` reported under it, and a window that stands is not refused in
  its words.
- `PD-SHELL-001` revision 2 (OQ-267) and revision 3 (OQ-292) — a notice action naming a workspace surfaces the window holding
  it and opens the action's surface there.

No requirement is contradicted: the gap is a missing test, not a wrong behaviour.

## Relevant files

- `apps/desktop/src/main/main-windows.ts` — `MainWindows.awaitWorkspace` (the 30,000 ms bound) and `MainWindows.reach` (the
  answer after the wait).
- `apps/desktop/src/main/main-windows.test.ts` — the reach cases, none of which lets the bound elapse.
