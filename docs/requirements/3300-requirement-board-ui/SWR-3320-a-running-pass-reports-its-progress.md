---
req-id: SWR-3320
status: approved
trace: required
test: required
title: "A running pass says what it is doing and how far it has got"
type: technical
derived-from: SWR-3319
epic: SWR-3300
date: 2026-08-19
---

# SWR-3320 — A running pass says what it is doing and how far it has got

SWR-3319 separated a refresh that reads three files from a refresh that waits on
a provider, because one sentence for both let an unbounded wait hide inside an
ordinary loading state. The two passes a user *starts by hand* — adoption
(SWR-3614) and verification (SWR-3615) — have the same defect and it is worse,
because they are longer: the board says `Verifying this workspace…` once, and
then nothing changes for the several minutes the workspace's check suite takes.
Nothing on screen separates a suite that is running from a worker that died.

The pass is not one uniform wait. It is five phases whose costs differ by three
orders of magnitude: reading the requirement source, running the check suite
(minutes), sweeping the repository for coverage (seconds), recording one
verification per requirement, and — for adoption — moving what the gate allows.

Requirement: while an adoption or verification pass runs, the board states which
phase it is in, where that phase has got to, and that time is passing.

- **The phase is named, in the words of what it is doing.** "Running this
  workspace's check suite" and "Recording verifications" are different waits and
  are stated differently. The phase's position in the fixed sequence is stated
  with it, because that is a position the code actually knows before the pass
  starts.
- **A position is stated wherever a real denominator exists** — the check within
  the suite, the requirement within the store — and the number is always
  accompanied by what it counts. A count without its unit is the same defect as
  a sentence that covers two waits.
- **No global percentage is stated, and this is deliberate.** One phase dominates
  the pass and its duration is unknown before it ends, so a single bar would sit
  near a tenth for minutes and then jump. A number that behaves like that teaches
  a user to disregard the number. Where a phase has no denominator at all, it
  says so by showing no bar rather than by showing an invented one.
- **Time passing is visible without a new value arriving.** The elapsed clock is
  rendered from a timestamp the pass set once, so a check that produces no output
  for four minutes still reads as alive.
- **Progress is narration and never authority.** What may be clicked follows from
  the pass being in flight, exactly as it does today; a progress value that is
  late, throttled away or absent cannot enable a control or move a card.
- **A progress tick does not rebuild the board.** SWR-3317 bought a board that
  survives a repository-sized store by not repainting what did not change, and
  ten full repaints a second would spend it. The tick reaches the surface that
  shows it and nothing else.
- **The pass survives the board being re-evaluated under it.** A repository event
  landing mid-pass leaves the pass running, so it must also leave what the board
  says about it standing.

## Acceptance criteria

- A running pass renders a phase sentence that changes as the phase changes, and
  states the phase's position in the sequence.
- The check phase names the check that is running and its position in the suite;
  the recording and adopting phases count requirements against their total.
- A phase with no denominator renders no progress bar, and no surface states a
  percentage for the pass as a whole.
- The elapsed reading advances while no new progress value arrives, and stops
  when the pass ends.
- A progress value never realises, recycles or repaints a card widget.
- A board evaluation arriving mid-pass leaves the pass's state and its narration
  intact.
- Every control and meter this adds carries an accessible name, states its
  content in words as well as in fill, and fits at 1000×680 (SWR-3314).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each phase renders its own sentence and position; a phase without a denominator reports none | Progress value object | `apps/rotaris/tests/test_requirements_verification.py` |
| Integration | A pass's progress reaches the banner from the worker thread, and a tick leaves every card widget untouched | Controller → view | `apps/rotaris/tests/test_requirements_pass_progress.py` |
| User-flow E2E | A user starts a verification, watches it name the check it is running and count the requirements it records, and sees it clear when the pass ends | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_pass_progress.py` |

Derived from: [SWR-3319 — The board says when it is analysing changes, and lets you stop](SWR-3319-analysing-changes-is-visible-and-stoppable.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
