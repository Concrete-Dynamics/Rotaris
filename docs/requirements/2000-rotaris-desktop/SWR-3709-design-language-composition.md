---
req-id: SWR-3709
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3700
title: "Views compose in the design system's vocabulary"
epic: SWR-2000
date: 2026-08-21
---

# SWR-3709 — Views compose in the design system's vocabulary

The design system's UI kit (`ui_kits/rotaris-desktop` in the Rotaris Design
System project) demonstrates a compositional vocabulary the token layer alone
does not carry: a section header is a kicker with an inline datum beside it
(`AGENTS · 3 live`), where the kicker is uppercase and tracked but the datum is
monospace, lowercase, and coloured by what it counts; place and name are told
apart by face (paths and numbers monospace, names in the body face); separators
between facts are a middle dot; and a fact's own colour comes from the state
triad. Rotaris already composes most of the kit's architecture, but these
details are hand-rolled per call site and disagree with each other — the todos
kicker uppercases its count into the label (`TODOS 4/7`), the live-agent count
is an unstyled default label beside its kicker, and the title bar's workspace
chip sets path and session in one undifferentiated run of text.

Rotaris shall carry the header pattern as one reusable composition and use it
wherever a section names a count:

- `SectionHeader` (patterns group, SWR-3702 inventory discipline: composed of
  `SectionLabel` and a datum label, not a second kicker) shows a kicker and an
  optional datum; the datum renders in the mono face at the kicker's size,
  is never uppercased, and takes a tone resolved from the active theme at
  paint time (`live` counts in the run colour, neutral data in secondary text).
- The workspace sidebar's three counted sections — active runs, task agents,
  todos — use it; no kicker carries its count inside its own uppercased text.
- The title bar's workspace chip separates place from session: a folder icon
  (SWR-3708), the workspace path in the mono face, a middle-dot separator, and
  the session name in the body face.
- The title bar's session status is one chip: the status dot and its word
  inside a tag-styled pill (SWR-3702 `Tag` anatomy), the pill's variant
  following the state — `run` while running, `wait` while pausing or paused,
  `done` when completed, `fail` when failed or cancelled, `neutral` when idle.
- The status bar's branch item carries the design system's `git-branch` icon
  beside the branch name.

## Acceptance criteria

- `SectionHeader` exists in the component library, constructible without a
  backend; its datum is mono, never uppercased, and follows a theme change.
- The workspace sidebar composes its counted section headers from
  `SectionHeader`; the todos kicker's text contains no digits.
- The title bar chip renders the path in the mono face and the session name in
  the body face, separated by a middle dot, with the folder icon present.
- The title bar session chip renders the status word beside the dot inside a
  tag pill, and a state change moves the pill to that state's variant.
- The status bar branch label shows the `git-branch` icon and the branch name.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Header shows `TODOS` + `4/7` with mono datum; tone follows theme switch | `SectionHeader` API → rendered fonts and colours | `test_design_system_components.py` additions |
| Integration | Sidebar refresh routes counts into headers; chip splits path from session; session chip follows state changes | `WorkspaceView._refresh_sidebar` / `TitleBar.refresh` → labels | `test_workspace_sidebar.py`, `test_chrome.py`, `test_design_language.py` |
| User-flow E2E | N/A — presentation composition; behaviour unchanged | — | — |

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
