# Seams — what to touch, in what order, to add one of the things this product adds most often — 2. A main → renderer channel

Part 2 of 8 of [the seams](../04-seams.md), which indexes every part.

## 2. A main → renderer channel

Sixteen exist. A seventeenth is a real decision — ask whether an existing one carries it first. The sixteenth,
`session:focus` (2026-10-14, PD-SHELL-001 revision 3, OQ-292), was taken for the same reason as the fifteenth: a
`focus-session` notice is pressed in any window and the session must be focused in the window holding its workspace, whose
renderer alone owns the replica that follows a session. A request to ONE window that may still be loading — a window the
reach has just added — is held on its `MainWindows` record until its renderer, having registered its listener, says so by a
command (`session.focusReady`), and is then answered with what was held, once; a window already listening is sent it at
once through `MainWindows`' `deliver` dependency, which counts it on the relay and calls `webContents.send`. Copy that
hand-off for the next main-to-one-window request: a `webContents.send` to a window that has not registered its listener is
lost without an error. The fifteenth,
`project-init:open` (2026-10-14, PD-WORKSPACE-005 revision 2, OQ-262), was taken because no channel asks ONE window to open
a Settings category on main's account: a project-setup banner's action is pressed in any window and must open Settings ›
Project in the window holding the project, which main finds and the renderer alone can navigate; `notice:current` is every
window's and `initialization:state` carries state, not a request. Since revision 3 (OQ-294) main finds it by
`MainWindows.reach`, which adds a window where none holds the project (revision 2's `surfaceHolding` answered with a notice
there), and the request takes the sixteenth's hand-off: `MainWindows.openProjectInit` sends it through `deliver` to a renderer
listening, else holds it until the renderer's `projectInit.ready`, its command inward beside `projectInit.open`. The fourteenth,
`display:changed` (2026-10-14, REQ-CHAT-167 / REQ-CONFIG-403), was taken because no channel carried a preference:
`theme:changed` names a theme and `config:changed` a workspace's configuration snapshot, while the three transcript display
preferences are application-wide preference-store keys every window draws its rows from; it is sent like the theme, by
`webContents.send` to every live window. The thirteenth,
`reauth:prompt` (2026-10-02, REQ-NOTIFY-071), was that decision taken: the re-authentication prompt is window-scoped
state main opens and closes on its own account (after a fallback restart), which neither the notice slot (one notice,
any session) nor channel 12 (one workspace's initialization) could carry without changing what they mean. It is the
worked example of a **window-level non-modal surface fed by main** (ADR-0048): the payload schema and the two commands
in `packages/contracts/src/reauth.ts`, the counter in `packages/shell/src/relay.ts`'s total record, the publisher in
`main/index.ts` sending each opening and closing, keyed by session, to every main window, the state in
`main/auth-fallback.ts` (`failure-recovery.ts` until the merge beside the recovery dialog, 2026-10-02; the dialog's opening
closes every prompt through it, REQ-NOTIFY-079), the facet `main/commands/reauth.ts` (the two answers, and `reauth.read` for a window that
mounts later), the hook in `renderer/main.tsx` holding the prompts by session and choosing the followed session's
(`reauthPromptFor`, REQ-NOTIFY-030: a recovery affordance moves with the focused session), and the surface
`packages/ui/src/ReauthPrompt.tsx`, drawn **in flow** by the Workspace view (`WorkspaceView`'s `reauthPrompt`) as its
own row of the view's grid, `reauth`, between the run header and the transcript (OQ-181's reading, confirmed 2026-10-06 by R-071, of "beside the
continuing run") — so a panel open until answered overlays no control at any window size. *Corrected 2026-10-02
(the repair rounds):* the first build sent to the one window following the session and mounted the surface beside the
shell, `fixed` at the window's corner like `ProjectSetupDialog`; the verifier measured the session browser, the three
window controls and the notice's dismissal under it, and the prompt staying over whatever session that window focused
next. ~~A window-level non-modal surface goes in the `windowPanel` slot~~ — the second build drew it `absolute` in an
AppShell `windowPanel` slot inside the rail-and-view region, and at 1000x680 the run header's switches and, under a key
field, the composer's submit were under it; the slot is gone. **A non-modal surface that stays open until answered is
laid out in flow, in a row or column of the view it belongs to, never as an overlay**: add its grid area to every
template of that view (`layout-proof` fails a child naming an area the template lacks) and measure it at REQ-SHELL-022's
minimum. **In flow is not enough beside another panel open until answered** (the third repair round, 2026-10-02): an
`auto`-maximum row is grown before a `1fr` one, so beside the expanded plan gate (whose row has no floor once the
transcript is hidden) the prompt took the height first and left the gate's three answers unreachable at 1000x680. Decide
which of the two yields — the one the run is not stopped on — and give it a form whose height is one row of its answers
on the state where they meet (`.workspace[data-plan-gate='1']:not([data-plan-gate-collapsed='1']) > .reauth-prompt`, the
prompt's bar), never a written height, then measure both panels' answers at the minimum in that state. **A window-level dialog that belongs to no view** (REQ-WORKSPACE-106's project setup consent dialog) is the exception
the rule above cannot place: in flow it would take room from every view at the minimum. It goes in AppShell's
`windowDialog` slot, `absolute` against the rail-and-view region (`.body`) at its top corner with the `--rt-space-4`
inset and bounded by that region, so the title bar and the notice slot are never under it, and it lies over the view's
corner while open (OQ-187; since 2026-10-02, when it moved off the window's corner,
`../../../defects/fixed/the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md`). Measure the chrome's and
the notice's buttons at their centres with it open (`init-proof`'s `consent`).

| # | File | What lands here |
|---|---|---|
| 1 | `packages/contracts/src/channels.ts` | the name in `CHANNEL`, and the payload schema |
| 2 | `packages/contracts/src/commands.ts` — `RendererBridge` | the subscription method's type |
| 3 | `apps/desktop/src/preload/index.ts` | one `subscribe(CHANNEL.…)` entry on the frozen namespace |
| 4 | `apps/desktop/src/main/index.ts` | the publisher — `UpdateRelay` for a session-scoped fan-out, `webContents.send` for a window-scoped one |
| 5 | `packages/ui/src/…` | the subscriber |

Invariants:

- **The preload renumbers nothing and re-derives nothing.** Sequence numbers are the producer's; payloads pass
  through untouched (`ADR-0044`).
- A delivery bound is **one budget across every window taken together**, not one per window. Getting this
  backwards was defect T2-1 on channel 3.
- The relay preserves sequence. A surface that needs ordering gets it from the payload, never from arrival.
- **A dead sink is shed, never thrown on.** A `send` that throws (a disposed render frame) detaches the sink
  from the relay and delivery continues to the survivors (`relaySequenced`, `broadcast`, and the channel-3
  limiter's `send` all isolate per sink). `render-process-gone` detaches the window's sink at once, so the
  crash-without-close path never waits for the next publication. A vanished view leaves the run untouched
  (`REQ-MONITOR-226`'s intent on the delivery path).

Update the process view's **main → renderer** paragraph and the channel list in its diagram.

---
