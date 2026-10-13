## The gate's spike ruling still says the board is unmeasured and spike 6's live half is owed

`docs/architecture/implementation-conditions.md`, "How the unstarted spikes bind" (the Architecture Gate's ruling of
2026-09-03), keeps two sentences the record has since answered, with no report-back beside either: spike 8's
"`REQ-TRACE-239`'s board remains unmeasured: no board table exists yet", although the board was built and measured
(`codebase.md`: "REQ-TRACE-239 is met", 38–43 ms on the fixture and 54–59 ms on 1,500 requirements on idle main, the
103–112 ms misses kept as a falsified reading taken while the machine was short of memory); and spike 6's "**The live
half is owed**: no endpoint exists on the build machine", although `spikes/responses-dialect.md` records it taken on
2026-09-05 against OpenRouter (four of four assertions, ADR-0027's fallback no longer priced) and against a second,
self-hosted endpoint on 2026-10-02.

Found by the 2026-10-13 survey at `6de2a67` (item N11).

## Specs

- None contradicted. `REQ-TRACE-239` (the board budget); ADR-0027 consequence 2 (spike 6). CLAUDE.md's report-back rule.

## Relevant files

- `docs/architecture/implementation-conditions.md` — the spike 8 and spike 6 bullets.
- `docs/architecture/codebase.md` — "The board that shipped was chosen on measurement" and "REQ-TRACE-239 is met" (wave 2,
  2026-09-10).
- `docs/architecture/spikes/responses-dialect.md` — the two live-half sections.

## Repaired — 2026-10-13 (fin41)

Two dated report-back notes stand beside the two sentences in `docs/architecture/implementation-conditions.md`, each
keeping the sentence it answers: the board measured in wave 2 (2026-09-10, `7c8260c`), with the falsified 103–112 ms
reading named; spike 6's live half taken on 2026-09-05 (OpenRouter, four of four) and on 2026-10-02 (the self-hosted
endpoint). The paragraph's opening, which describes the state before spike 8 was taken, stays as history. No test:
record only; each figure was read from `codebase.md` and `spikes/responses-dialect.md` at `6de2a67`.
