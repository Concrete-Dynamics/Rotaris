## The live run's tool-friction checks read two scenarios, and miss a refused call whose arguments were cut

`apps/desktop/scripts/live-run.mjs` reads two rulings from the tool-call record: `checkRefusalIssues` (REQ-SESSION-136: a
call the tool gate refused as `invalid_request` files a `tool_error` issue referencing it) and `checkToolFrictions`
(PD-TOOLS-007: a `write_file` call with a path and content and no `operation` is read as a create where its file does not
exist; PD-TOOLS-008). Both run for the `frictions` and `duress` scenarios only, and each prints a NOTE when its shape did
not arise there, worded for the whole run: "… was not observed this run", "… was not asked this run". The other
scenarios' sessions are never read.

Separately, `createShaped` in `apps/desktop/scripts/lib/tool-frictions.mjs` requires the recorded `args` to be an object.
The session writer stores an error-path record's arguments longer than 2,000 characters as a cut JSON string
(`settleToolCall` in `packages/engine/src/session-writer.ts`, REQ-SESSION-136), so a refused whole-file write, the shape the
check was built for (the duress refusals of `docs/defects/fixed/write-files-first-use-refusal-recurred-under-duress.md`),
can never be found by `refusedInferable` in any scenario. A regression to the old refusal on a long create would pass in
silence.

Found by the autopsy of the final default live run at `c2a9444` (2026-10-06, finding M2), from the pack
`.live-run/runs/2026-10-06T17-41-48-175Z/`:

- the console printed "NOTE frictions: no call was refused at the tool gate as invalid_request — REQ-SESSION-136's issue
  for such a refusal was not observed this run" and "NOTE frictions: no write_file call left out its operation —
  PD-TOOLS-007's inferred create was not asked this run";
- the requirements session holds an `invalid_request` refusal, ordinal 62 (`requirements/autopsy.txt`:
  `invalid_request ×1 [write_file] ordinals 62`), and its `tool_error` issue references it (`workspace.db`);
- the resume session's ordinal 9 is PD-TOOLS-007's inferred create, its result carrying the directive's sentence
  (`workspace.db`, the first live execution of the directive), which no check reported;
- ordinals 62 and 66 of the requirements session store their arguments as 2,000-character strings (`workspace.db`).
  Ordinal 62 is a create-shaped call with no `operation` whose path lies outside the workspace; PD-TOOLS-007's first
  execution reads "a path the fence refuses is not read as anything, and is refused as before", so it is the directive's
  own refusal, and a reader that sees cut arguments must tell it from the old shape.

## Specs

None contradicted by the product: this is the harness. It bears on the verification of PD-TOOLS-007 (its first-execution
note leaves the live shape "their next run's to show") and REQ-SESSION-136 (the issue for a refused call).

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `checkRefusalIssues`, `checkToolFrictions` and their two call sites (the
  `frictions` and `duress` scenarios); `preserveRun`, called for every session the run drives.
- `apps/desktop/scripts/lib/tool-frictions.mjs` — `createShaped`, `writeSelectorReadings`.
- `apps/desktop/scripts/lib/refusal-issues.mjs` — `refusalIssues`.
- `packages/engine/src/session-writer.ts` — `settleToolCall`, the error-path cut to 2,000 characters.
