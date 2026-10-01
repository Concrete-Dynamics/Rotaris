## The other setup step details are not in REQ-WORKSPACE-091/092's words

`code-intelligence-setup`'s step rows carry the details the run host's `runSetupSteps` writes for the MCP category, passed
through `InitializationCoordinator.resultOf` (and the live step sink) unchanged. Since the repair of
`fixed/a-stopped-setup-step-is-not-reported-in-req-workspace-092s-words.md` a stopped step reads in REQ-WORKSPACE-092's
two sentences; every other detail is still the run host's:

- a step that ran and exited non-zero reads "exited with code N; its last output: {tail}" — REQ-WORKSPACE-092 makes it the
  last 400 bytes of the step's combined output, with no prefix (and REQ-MCP-099 counts the same tail in characters);
- a step that succeeded has an empty detail, where REQ-WORKSPACE-092's "every other step's detail" is its output's tail;
- a creation step skipped because the marker file is present reads "the project already exists (its marker file is
  present); creation skipped, nothing overwritten", where REQ-WORKSPACE-091 says it "SHALL report success with the output
  'project file already exists; left as is'";
- the two `skipped-no-code` steps read "skipped: the workspace contains no file the runtime indexes", where REQ-WORKSPACE-091
  fixes "No source files found, so there are no symbols to index." and "No source files found, so no memory layout was
  seeded.".

The unit cases in `initialization.test.ts` push the domain's own sentences as the run host's details ("summarises a
documentation-only workspace in its own words"), so they pass while the built app shows the run host's. Noticed
2026-10-01 while repairing the stopped-step details under R-067 (the evidence: `workspace-proof`'s scenario 8b/8c logs,
and `packages/mcp/src/setup.ts`); not repaired there. The repair has the same choice that one had: map in this domain's
`stepDetail` from a structured fact on the status (the skip reason, the marker, the exit code and the output tail kept
apart from the prose), leaving the run host's sentences to the MCP category.

## Specs

- REQ-WORKSPACE-091: the marker-present creation output and the two `skipped-no-code` details, fixed sentences.
- REQ-WORKSPACE-092: "every other step's detail SHALL be the last 400 bytes of its combined standard output and standard
  error".
- REQ-WORKSPACE-093: the failure reads "{reason}: {detail}", so a non-zero exit's prefix reaches the error too.

## Relevant files

- `packages/mcp/src/setup.ts` — `runSetupSteps`, where each detail is written.
- `apps/desktop/src/main/initialization.ts` — `stepDetail`, which maps a stopped step only; `resultOf` and `followSetup`'s sink, which use it.
- `apps/desktop/src/main/initialization.test.ts` — the cases that push the domain's sentences as if the run host wrote them.
