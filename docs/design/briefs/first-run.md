# The first-launch setup — brief

**Status:** built 2026-11-21 on `feat/r-110-first-launch-setup`; not yet audited by `design-ui`
**Written:** 2026-11-21 by the model, for [R-110](../../product/requests.md#r-110), with the Impeccable design skill; the owner chose the form, the optional tier, the ending and the structure
**Surface:** a full-window surface over the shell, shown at a first launch ([`PD-WORKSPACE-010`](../../product/directives/pd-workspace-010.md#pd-workspace-010)); no §7 row and no mockup section, the directive being what adds it; code `packages/ui/src/FirstRunSetup.tsx`, `packages/ui/src/first-run.css`; theme `rotaris-dim`

## 1. The surface

An Operate surface with one job: a person who has just installed the product sends a first prompt. It replaces three
things a first launch showed at once (REQ-WORKSPACE-007's fallback folder, REQ-SHELL-011's deferred chooser,
REQ-WORKSPACE-152 (3)'s notice) with one path. Fixed by the record and not restated: the chooser (REQ-WORKSPACE-009), the
sign-in's steps and outcomes (REQ-WORKSPACE-135, REQ-PROVIDER-116/117), the slots (REQ-PROVIDER-088), the modes
(REQ-TOOLS-041), reduced motion (REQ-SHELL-135), the contrast floors (REQ-SHELL-145), the minimum window (REQ-SHELL-022).

## 2. The journey

Project → Model → First prompt, each ending on a fact main holds, so the surface resumes wherever the facts stand: after
the window a chosen folder replaces, after a quit, after a crash. A step behind may be revisited; a step ahead may not be
reached before its fact. Skip setup is on every step. The end is the sent prompt, or "Open Rotaris without a prompt".

## 3. Content

Two columns under the window's own title bar. **Left, the lit plane**: a progress list of the three steps (number, name,
state word), then the step — a title, one sentence, the act, one note. **Right, the chrome plane**: a miniature of the
window being set up — title bar with three chips (project, model, mode), a navigation column, a transcript in outline, a
composer, a status line — that states the same three facts as they land and mirrors the prompt as it is typed.

## 4. States

| Region | Waiting | Now | Done | Failed |
|---|---|---|---|---|
| A step in the list | amber-free: tertiary ink, empty bar | name in primary ink, bar in `--rt-run` | bar in `--rt-done`, pressable | n/a: a failure belongs to the step's own content |
| Project | "Choose a folder…"; where the start folder is a repository, it is offered with "Use this folder" | the chooser is the platform's | the folder as a ruled fact, "Chosen", Continue | the refusal's own sentence under the fact |
| Model | the catalogue as radio rows, unavailable ones saying why | "Connecting…" with a pulsing dot, fields locked | the provider as a fact and the three slots as rows | the provider's message; no models and a replacement are asked in place |
| First prompt | n/a | the composer focused, send disabled while empty | "Starting", then the surface leaves | the run start's refusal under the composer |
| The miniature's chip | `wait` dot, tertiary ink | `run` dot | `done` dot, accent tint, the value in mono | n/a |

## 5. Interaction

Enter submits the model step's form and sends the prompt; Shift+Enter is a new line. The provider rows are one radio
group with roving focus and arrow keys. Each step's title takes focus as the step arrives. Escape does nothing: leaving is
Skip setup's alone, so a stray key cannot end a setup that is shown once.

## 6. Copy

§1.11's voice. Titles are the act ("Choose your project", "Connect a model", "Start your first run"); the model step's
done state is a statement ("Your model is connected"). The mode is said in the product's word and one sentence:
"Runs are autonomous. Agents edit files and run commands in this project without asking first. You can stop a run at any
time." A provider this build cannot sign in to reads "Sign-in is not in this build yet".

## 7. Accessibility

`role="dialog"`, `aria-modal`, labelled by the step's title; the shell is `inert` beneath. State is said twice everywhere:
a step's word beside its bar, a chip's value beside its dot. The miniature is `aria-hidden` and carries nothing the left
column does not. One filled control per step (the primary button; on the last step, the send control).

## 8. Composition

`first-run`: no scroll of the viewport on either axis. `first-run.ask` and `first-run.stage` are contained in it. The
asking column is 26 to 34 rem and scrolls on its own where the minimum window is too short for the model step with a
custom endpoint; the stage takes what is left and gives way first.

## 9. Components

`Button`, `Input`, `TextArea`, `SearchableSelect`, `SegmentedControl`, `SendPill`, `StatusDot`, `WindowControls`. No
radio group exists in the design system: the rows are `Button`s with `role="radio"`, as the settings' segments are. A
`RadioGroup` and a `Stepper` are §4.2 proposals this surface would be the first user of.

## 10. Left open

The end's motion is not captured frame by frame. `nocturne` and `high-contrast` are not captured. The model step repeats
the authentication window's form rather than sharing it. The setup cannot be opened again once ended; Settings › Setup is
where its three facts are found afterwards.

## 11. Evidence

`pnpm onboarding-proof` (20 checks) and `packages/ui/src/first-run.test.ts`. Must hold: no sideways scroll at 1000×680;
one filled control per step; no literal length, colour or duration in `first-run.css`.

## Direction contract

THESIS: the setup is the window assembling itself. The category default it refuses is the centred card wizard on an empty
backdrop, where nothing on screen is the product until the last button.

OWN-WORLD: the established one, unchanged: graphite planes, hairlines, Manrope, mono for what is typed or measured, the
three axis colours as states and nothing else.

STORY: the person sees their own window with three gaps, fills each, and is typing in the product's composer before they
have been taught anything.

FIRST VIEWPORT: title bar; left, 26 to 34 rem, the three-step list and the step; right, on the chrome plane, the
miniature window from the caption to the bottom edge, its chips in the title bar and its composer at the foot. The filled
control sits under the step's content in the left column.

FORM: "The workspace assembles", third of seven grounded structures (step rail; single column; split with live preview;
ledger of sections; composer-first; three axes; conversational). seed:c622bb87da3ce29b. Signature interaction: a fact
lands in the miniature as its step completes, and the miniature grows into the window at the end. Motion grammar: arrive
over `--rt-shift`, change state in place, one growth at the end.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Review 2026-11-21

An independent finish review (Impeccable's reviewer, a second agent that had not built the surface, over ten captures in
`.ui-review/r-110/`) returned **fix** with eight items; a recapture round followed four captures that did not show their
state; two verdict passes scored them.

| # | Item | Outcome |
|---|---|---|
| 1 | The miniature only lit chips: its navigation and transcript never changed | resolved: the project names the first navigation row, the draft becomes the first transcript entry, the "N of 3" counter is gone |
| 2 | Arriving at the last step, the title took focus from the composer | resolved |
| 3 | At 1000×680 the step's act was cut off | resolved: the action row sticks, what scrolls under it fades |
| 4 | The mode chip read as waiting; chips remounted to animate | resolved: `done` from the first step, state changes in place |
| 5 | Accent spent on the starters; a ghost action off the column edge | resolved |
| 6 | Copy: a run-on sentence, a mismatched placeholder, "subscription" beside "API key" | resolved; the last by a method text chosen from the provider's name, which a flag on the choice would do better |
| 7 | Errors inside labels, an `alertdialog` that was no dialog, a dot that did not follow the mode | resolved |
| 8 | The form's seed uncorroborated | resolved from the roll's output |

Left after the second pass, applied and **not scored**: the action row's foot padding pushed a step's note away from its
act (`:not(:last-child)` now removes it). **Never captured**: the end's growth, hover and focus-visible states,
`nocturne` and `high-contrast`, the no-models and replace prompts.
