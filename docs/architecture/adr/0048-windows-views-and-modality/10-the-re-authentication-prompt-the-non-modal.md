# ADR-0048 — Windows, views and the three modality levels — The re-authentication prompt — the non-modal level's second surface, first executed 2026-10-02

Part 10 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## The re-authentication prompt — the non-modal level's second surface, first executed 2026-10-02

*The 401 note's part B ([`a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`](../../../defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md));
REQ-NOTIFY-071, REQ-NOTIFY-078. Found nothing wrong with the decision; found two placements wrong against it, both
corrected below with the falsified reading kept.*

The Context names two non-modal window-level surfaces, the project-setup consent dialog and the re-authentication prompt;
only the first had been built. The second is built the same way the Decision states the level — "an in-window panel
that does not trap focus and leaves the rest navigable": `packages/ui/src/ReauthPrompt.tsx`, `role="dialog"` with no
`aria-modal` and no backdrop, ~~mounted beside the shell next to `ProjectSetupDialog` and positioned as it is (fixed, its
own corner, z-index 40, below an application-modal backdrop)~~ — **falsified the same day**: that corner is the title
bar's right end and the notice slot below it, and a panel open until answered covered the session browser, minimise,
maximise, close and the notice's dismissal (the verifier's `elementFromPoint` probe in the built app). ~~It is now drawn in
AppShell's `windowPanel` slot inside the rail-and-view region (absolute, z-index 40, below an application-modal
backdrop), so neither lies under it whatever the notice's height; it overlays the view's top-right corner (in the
Workspace view, the inspector's persona and agent-model fields, recorded by the proof as `underPrompt`). The decision
holds — "leaves the rest navigable" is what the first placement broke.~~ — **falsified too, by the second verification
the same day**: an overlay that stays open until answered covers whatever lies under it at some size. At REQ-SHELL-022's
1000x680 minimum the second placement covered the run header's model and reasoning switches and Compress context; with an
API-key provider's taller prompt, the composer's submit; in the other views their top-right controls (Overview's New
session and Open Mission, Git's New worktree, Settings' model rows, Library's search, Requirements' Re-evaluate). "The
decision holds" was not true of that placement: it broke "leaves the rest navigable" as the first one did, only lower
down. The proof had passed because it measured at the opening size with the shortest prompt alone. **Now** the prompt is
no overlay: the Workspace view draws it **in flow**, as its own row of the view's grid between the run header and the
transcript (`WorkspaceView`'s `reauthPrompt`, the grid's `reauth` row; AppShell's `windowPanel` slot is gone), so it takes
its height from the transcript (whose REQ-CHAT-010 floor is sized first) and overlays nothing at any size; shorter than it
needs, the card scrolls with its answers pinned to its floor, as the plan gate's are. ~~It takes its height from the
transcript~~ in every state — **falsified by the third verification the same day** for one: beside an EXPANDED plan gate
the transcript is not drawn and the gate's row is `minmax(0, 1fr)`, floor 0, and the prompt's `auto` maximum is grown
first (CSS Grid §12.5-12.7), so at 1000x680 with a key field it left the gate 42 px and the gate's Approve, Revise and
Cancel were not the element under their own centres. In flow, the prompt overlaid nothing; it starved a sibling that is
also open until answered. Beside an expanded gate it now yields as the transcript does, one action away: it is drawn as
a bar, its title and its answers on one row, its words drawn again when the gate is collapsed or answered, and the gate
takes the rest (the run is stopped on it, REQ-ORCH-153; it is the reading area, PD-ORCH-002 revision 2). The decision is untouched: the level never said which of two in-flow panels gives way, and the
build's answer is the one the run is stopped on keeps the room. That it is drawn in the view that
shows the run, and not while another view is shown, is the build's reading of "beside the continuing run", raised as
[OQ-181](../../open-questions.md) *(ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the placement and
visibility accepted as built)*. The decision holds for this placement: the level is still an in-window panel, non-modal,
with no focus trap, and nothing else in the window is under it. It is fed by main on its own channel
(`reauth:prompt`, channel 13), ~~to the one window that follows the session~~ — also corrected: to every main window,
each drawing the followed session's prompt alone (REQ-NOTIFY-030), with `reauth.read` for a window that mounts later.
Measured in the built app by `resilience-proof`'s `auth-fallback` scenario with the prompt open, in two launches — the
opening size with the shortest prompt, and 1000x680 with an API-key provider's prompt, taller by its key field: the
composer is the element under its own centre, takes the focus and is enabled, the prompt carries no `aria-modal`, every
title-bar and notice-slot button is the element under its own centre (`chromeUsable`), no control on screen outside the
prompt has the prompt at its centre (`underPrompt` empty: 45 and 33 controls tested), and the prompt's own key field and
answers are each the element under their own centre (`promptControls`); and a third launch in plan mode at 1000x680 with
the key field, the gate expanded beside the prompt, each of the gate's three answers the element under its own centre
(`gateAnswers`). Not measured: Escape, which this surface does not answer (only its
two buttons close it — the dismissal keeps the fallback, REQ-NOTIFY-071), and REQ-NOTIFY-079's rule that the modal
recovery dialog closes it, ~~since that dialog is not built (part C)~~ — *corrected at the merge of parts C and D beside
this one, 2026-10-02*: the dialog is built (the section below), and its opening closes every prompt open
(`RunFailurePublisher.publish` → `closePrompts`, `auth-fallback.ts`'s `closeAllPrompts`), each session keeping its
fallback; pinned by `run-failure-notice.test.ts` and `auth-fallback.test.ts`, and measured in the built app by
`resilience-proof`'s `auth-fallback-dialog` launch (the fallback refused too: the dialog opens over the window and the
prompt is gone from it).
