## The other setup step details are not in REQ-WORKSPACE-091/092's words

`code-intelligence-setup`'s step rows carry the details the run host's `runSetupSteps` writes for the MCP category, passed
through `InitializationCoordinator.resultOf` (and the live step sink) unchanged. Since the repair of
`a-stopped-setup-step-is-not-reported-in-req-workspace-092s-words.md` a stopped step reads in REQ-WORKSPACE-092's
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

## Outcome — repaired 2026-10-01

The repair took the choice the stopped-step repair took: the run host's status carries facts beside its own `detail`, and
this domain's `stepDetail` maps them; the run host's sentences stay the MCP category's (REQ-MCP-099/112), unchanged in its
rows and in the run host's log lines. `runSetupSteps` (`packages/mcp/src/setup.ts`) now sets, on `SetupStepReport` and so
on `McpSetupStep` (`packages/contracts/src/mcp.ts`, all optional): `skipped` (`marker-present` or `no-code`), `output` (the
captured output's trimmed tail, at most 400 characters, on every step whose command ran, stopped or not) and `startError`
(the launch's own error, on a step whose command could not be started). In this domain's live rows, step rows and
"{reason}: {detail}" error:

- a creation the marker skipped reads "project file already exists; left as is";
- the two `skipped-no-code` stages read "No source files found, so there are no symbols to index." and "No source files
  found, so no memory layout was seeded.", chosen by the stage;
- a step that exited non-zero, and one that succeeded, read as the last 400 bytes of the output, with no prefix, cut where
  a UTF-8 character begins (`lastUtf8Bytes`);
- a stopped step keeps REQ-WORKSPACE-092's two sentences.

The steps with no output to give — not attempted, never started, silent — are raised as
[OQ-174](../../architecture/open-questions.md) with the reading built: empty, except a step that could not be started,
which reads in the launch's own error; a failed stage with an empty detail keeps the setup's final sentence in its error.

Pinned by `apps/desktop/src/main/initialization.test.ts`, whose cases now push the run host's real details and facts
(`RUN_HOST`) and assert this domain's words: "summarises a documentation-only workspace in its own words", "reports a
creation the marker skipped as …", "reports a failed stage with its own reason …", "reports a non-zero exit as its output's
tail, with no prefix", three byte-cut cases, "reports a silent non-zero exit …" and "reports a stage whose command could
not be started …" — eight of them red on the code before. `packages/mcp/src/setup.test.ts` asserts the new facts, two
cases new. Shown by `workspace-proof`'s new scenario 8g in the built app: a project carrying the runtime's marker reads
"project file already exists; left as is"; a documentation-only one reads its creation's output and the two fixed
`skipped-no-code` sentences; and one whose stand-in creation writes to both streams and exits 3 reads its output with no
prefix, non-ASCII intact, in the row and the error — while the run host's log lines keep its own words throughout.
ADR-0064's fifteenth round reports it.

**Found while showing it, recorded separately:** a documentation-only project carrying the marker never finishes its run,
since every step ends without waiting and the coordinator's follow misses the `finished` status
([`a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`](../a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md),
not repaired here); 8g's marker project holds a source file for that reason.
