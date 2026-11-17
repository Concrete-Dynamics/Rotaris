# Product

This file is the product record the Impeccable design skill reads (`impeccable context`). It is a **pointer and a
summary**: the authority is the repository's own record, named in each section, and where the two disagree the record
governs. Written 2026-11-14 for [R-101](docs/product/requests.md#r-101) by the model, from the record and the built
application; the owner worded none of it.

## Platform

web

The product is one Electron desktop application; its interface is a web renderer (React), which is what the skill's
`web` covers. There is no browser build, no command-line interface and no mobile form (`docs/spec/README.md`).

## Stack

TypeScript, React, electron-vite, a pnpm workspace; SQLite for the session record; Vitest. Every drawn surface is in
`packages/ui/`, built from `packages/ui/src/design-system/`; theme tokens are data in
`packages/contracts/src/theme/themes.ts`. See `AGENTS.md`, "The codebase", and `docs/module-map.md`.

## Users

One person at a desk, for hours: a software engineer who hands work to AI agents and stays responsible for the result.
They start a run, watch several agents work, answer what the run asks, read what it changed, and decide what lands.
They are fluent in editors, terminals and Git, and they run this beside those. The journeys are
`docs/research/design/04-the-agent-operator-journeys.md`.

## Product Purpose

A graphical environment for orchestrating AI agents on a software project: starting and steering runs, monitoring
delegated agents, approving what a run may do, keeping sessions, and tracing work to requirements and to Git.

## Positioning

A desktop tool the operator trusts with their repository. Every action an agent takes is visible, bounded by a
permission the operator set, and recorded.

## Operating Context

Long sessions, a large display, often a second window beside it; the minimum window is 1000×680 (REQ-SHELL-022).
Dark by default, for use beside a terminal and an editor. Keyboard first: every view and every common act has a chord
(REQ-SHELL-049).

## Capabilities and Constraints

- Six primary views — Workspace, Overview, Requirements, Git, Library, Settings — in a navigation sidebar that also
  lists the workspace's sessions from 1600 px and folds to a rail below it (`docs/design/information-architecture.md`, section 10).
- Screens, order, tabs and required strings are the record's: `docs/spec/` and, over it, `docs/product/directives.md`.
  A change to them is a directive, never an edit in place.
- Three built-in themes, each holding the contrast floors of REQ-SHELL-145 (`pnpm theme-proof`).
- A drawn control exists only in the design system; a colour or a length is a token, never a literal
  (`tools/check-ui-language.mjs`).

## Brand Commitments

- The three-axis mark and its colours: amber for waiting (X), green for running (Y), violet for done (Z); the accent is
  the Z axis (`docs/design/README/01-1-the-design-language.md`, §1.2 and §1.3).
- Colour states a fact about the work before it decorates anything.
- The copy voice of §1.11: plain sentences, the product's own words (`CONTEXT-MAP.md`), no exclamation.

## Evidence on Hand

The built application, driven free of any provider with `pnpm app:drive`; the proof scripts (`docs/proofs/README.md`);
the research corpus (`docs/research/design/`); the surface briefs (`docs/design/briefs/`). There is no usage telemetry
and no user study: no claim in the design record rests on either.

## Product Principles

1. The session is the frame: what the operator is working on never leaves the screen.
2. The content is the lit plane; the chrome recedes.
3. A fill means *this floats* or *this takes input*, and nothing else.
4. State is said twice, in colour and in words.
5. Dense, and readable at that density.

## Accessibility & Inclusion

REQ-SHELL-144 and REQ-SHELL-145 are the floors: 4.5:1 for text, 3:1 for a boundary and for disabled text, an accessible
name on every control, every act reachable by keyboard, motion that collapses under the reduced-motion setting.
`docs/research/design/09-accessibility-for-a-dense-desktop-tool.md` is the guidance beneath them.
