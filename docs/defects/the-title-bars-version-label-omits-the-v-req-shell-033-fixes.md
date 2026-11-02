## The title bar's version label omits the v REQ-SHELL-033 fixes

The title bar's version label reads "0.1.0rc1", 8 characters, at both captured sizes, where REQ-SHELL-033 fixes
`v{version}`, 9 characters. It is seen in the pack's PNGs `1-overview-1400x900.png` and `1-overview-1000x680.png`
(`.ui-review/8d438e315df9/iteration-1/`, captured 2026-11-02) and read in the source at `499a78c0`:
`packages/ui/src/AppShell.tsx:160` renders `{version}` bare in `.title-bar__version`, while About's Version row
(`packages/ui/src/settings/About.tsx:113`) prefixes it with `v`. The product's two readings of the running version so
spell it two ways. Noticed 2026-11-02 by the Overview audit (`docs/design/briefs/overview.md`, "Deliberately left")
under [R-093](../product/requests.md#r-093); the label is the title bar's surface (slug `title-bar-and-rail`), not the
Overview's, so the audit records it here rather than as one of its items.

## Specs

- REQ-SHELL-033 (`docs/spec/12-desktop-shell-windows/02-title-bar.md`) lists the title bar's contents left to right,
  among them "a version label `v{version}` in small monospace"; the label keeps the monospace face and drops the `v`.
- REQ-SHELL-140 (`docs/spec/12-desktop-shell-windows/04-transient-and-persistent-feedback-surfaces.md`) fixes the same
  form for About's Version row, "Version (`v{version}`)", which `About.tsx:113` meets. It is not itself breached; it is
  cited because the withdrawn REQ-SHELL-002 names the title-bar label (REQ-SHELL-033) and that row (REQ-SHELL-140) as
  the two places the running version is read, and the two now differ by one character.

## Relevant files

- `packages/ui/src/AppShell.tsx` — line 160, the `.title-bar__version mono` span rendering `{version}` without the
  prefix.
- `packages/ui/src/settings/About.tsx` — line 113, the Version row's `v` prefix (`v—` when no version is known); one
  formatter shared by both places would keep them one spelling.
- `packages/ui/src/shell.css` — line 26, `.title-bar__version`'s colour and size, which a repair keeps.
- `docs/design/briefs/overview.md` — the Overview audit that measured the label and left it to the title bar's surface.
- `.ui-review/8d438e315df9/iteration-1/` — the pack whose two PNGs show it; git-ignored, local to the
  `design-knowledge` worktree that captured it.
