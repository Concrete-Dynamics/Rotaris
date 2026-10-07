## A missing path's parent listing shows the ignore components

`read_file` (and `haet_read`) on a path that does not exist answers with a listing of the parent directory and up to five
close matches (REQ-TOOLS-134). That listing is taken with a bare `readdirSync`, so it shows every entry, the hard-coded
ignore components included: `read_file READNE.md` in a workspace holding `.rotaris/`, `node_modules/` and the
code-intelligence runtime's marker directory answers `Contents of .:` with all three, where `read_file .` on the same
directory skips them. The close-match suggestions are drawn from the same unfiltered names. Found 2026-10-07 while building
`PD-TOOLS-012` (fin27): its ruling, OQ-215, reads "read_file's directory and parent listings therefore skip it as they skip
`.rotaris`", and a case asserting the parent half failed on the marker directory and showed `.rotaris` beside it.

## Specs

REQ-TOOLS-134 defines the directory listing as one that skips "entries whose name is one of the ignore components of
REQ-TOOLS-140", and a missing path's recovery message as containing "a listing of the parent directory"; the parent listing
skips nothing, so the two listings of one directory disagree. `PD-TOOLS-012` (extending REQ-TOOLS-140) names REQ-TOOLS-134's
directory and parent listings as inheriting the marker directory by reference.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `missingPathMessage` reads the parent with `readdirSync` and lists every name;
  `listing` beside it filters by `IGNORE_COMPONENTS`.
- `packages/agent-tools/src/tools/search.ts` — `IGNORE_COMPONENTS`, the one set both listings should read.
- `packages/agent-tools/src/tools/tools.test.ts` — the read_file cases.
