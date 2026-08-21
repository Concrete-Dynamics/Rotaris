---
req-id: SWR-2444
status: approved
trace: required
test: required
title: "Structured tool rows in the Nocturne mono idiom"
epic: SWR-2000
date: 2026-08-10
---

# Structured tool rows in the Nocturne mono idiom

Tool rows in the transcript shall carry a machine-readable outcome instead of an icon glyph
baked into the result text, and shall render in the transcript idiom of the Nocturne design
comp (`docs/reference/Rotaris_ui/Rotaris Workspace.dc.html`): a monospace header line
`▸ toolname args` with the chevron and tool name in the info (teal) accent, the call summary
in secondary mono, and the outcome trailing inline at the end of the line in the status
colour — `ok · 3.2s`, `failed · 12s`, `blocked`, or a pulsing `◉ running…` while the call is
in flight. Durations of a minute or more format as `1m 12s`.

The run bridge stamps `status = "running"` when the tool call row is created, and rewrites it
to `ok`, `failed`, or `blocked` from the SDK observation outcome when the result attaches,
together with `duration` in seconds measured between call and result. The `detail` /
`full_detail` fields hold the result text only; no `✓`/`✗`/`!` prefix is embedded. Rows
persisted by older sessions may still carry the glyph prefix; the renderer strips it.

## Acceptance criteria

- A tool call row is created with `status == "running"` and no duration.
- When the result event attaches, the row's status becomes `ok`, `failed`, or `blocked`
  matching the observation outcome, and `duration` holds the elapsed seconds (± timer
  granularity).
- The rendered header is monospace with the chevron + tool name in `rotaris.theme.INFO`,
  the call summary in secondary colour, and a trailing outcome in the status colour:
  the status word plus `· <duration>` once the duration exists, or `◉ running…` (dot
  alternating colour on the live repaint tick) while running. No leading status bullet.
- `detail` and `full_detail` written by the bridge contain no status glyph prefix; a legacy
  row whose detail starts with `✓ `, `✗ `, or `! ` renders without the glyph.
