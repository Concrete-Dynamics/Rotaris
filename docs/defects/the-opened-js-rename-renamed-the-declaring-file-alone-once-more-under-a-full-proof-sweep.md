## The opened-JS rename renamed the declaring file alone once more, under a full proof sweep

`pnpm code-intel-proof`'s launch 14, `child-rename-opened-js` (`apps/desktop/scripts/code-intel-proof.mjs:786-794`): a
JavaScript workspace with no project file, the declaring file `src/opened-e.js` opened by a symbol overview first, then
`rename_symbol` of `countOpen` to `tallyOpen` across `src/opened-e.js` and `src/opened-f.js`. On 2026-11-02 on `499a78c0`
(Windows 11 ARM64, Node 26.13.0, the bundle `win32-x64` 3.13.15 / `serena-agent` 1.7.0) the call answered
"Successfully renamed 'countOpen' to 'tallyOpen' (1 changes applied)", `src/opened-e.js` changed and `src/opened-f.js`
still read `import { countOpen } from './opened-e.js';`, so the proof failed with
`child-rename-opened-js: the rename of countOpen changed ["src/opened-e.js"], not both`.

This is the shape the record repaired twice and closed:
[`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md`](../archive/defects/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)
(repaired 2026-10-20 under OQ-362's ruling, `PD-MCP-004` revision 2 clause 5: the run host places its own
`jsconfig.json` at the root for the search and the rename). A recurrence opens a new note that cites the closed one
(`docs/defects/README.md`, "Closing a note that was never reproduced"), so this is that note, not a reopening.

What is and is not known. The red came in a sequential sweep of the seventeen suites `pnpm verify:plan` names for the
design-knowledge diff (R-093), with a writing workflow's agents beside it; the proof's own launch 1 timed `tools/list` at
19,597 ms. The rerun alone on `4edb333b` did not reach launch 14: its discovery launch went red earlier on the binding
probe (`discovery: the binding probe did not succeed: (no connected line)`), which is
[`code-intel-proofs-discovery-launch-judges-the-connection-inside-a-fixed-25-s-window.md`](code-intel-proofs-discovery-launch-judges-the-connection-inside-a-fixed-25-s-window.md).
So the rename red is observed once, under load, and not reproduced alone; whether the project file was placed and
removed as clause 5 states (the write journal of OQ-245 records each placement) was not read from that run's evidence,
which the next sweep's `.proof/code-intel-proof/results.json` and `session.log` should be kept for.

Not repaired: outside that task (the record and the skills).

## Specs

`PD-MCP-004` revision 2, clause 5 (the project file for a rename the runtime serves as TypeScript with no `tsconfig.json`
or `jsconfig.json`); REQ-MCP-015 as the proof's header cites it. A rename answered as one change where two files hold
the symbol contradicts the clause's purpose, if it recurs with the project file in place.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs` — launch 14 and `coldRenameFailures`.
- `apps/desktop/src/run-host/` — the project-file placement of `PD-MCP-004` clause 5 (`CODE_INTELLIGENCE_PROJECT_FILE_BYTES`).
- `docs/archive/defects/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md` — the closed note.
- `docs/defects/code-intel-proofs-discovery-launch-judges-the-connection-inside-a-fixed-25-s-window.md` — the rerun's earlier red.
