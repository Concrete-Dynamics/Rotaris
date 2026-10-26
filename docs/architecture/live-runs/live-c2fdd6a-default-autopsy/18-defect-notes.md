# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Defect notes

Part 18 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Defect notes

- **Open notes this pack hits:** none of the 7 open notes is exercised by this run's evidence.
- **Fixed notes recurring:** none.
- **New, not recorded:** K1 (product defect, cosmetic), K2 (owner question against REQ-ORCH-029), K3 (product text,
  cosmetic). The brief made this examination read-only, so nothing was written to `docs/defects/`. CLAUDE.md's standing
  policy records such notes without asking.

**Highest-cost finding.** The cost remains OQ-114's ruled figures: about 144 s of classification and summarising on the
critical path in 817 s, including three 12 s fallbacks. The highest-cost new finding is **K2**, which costs nothing this
run but leaves a REQ-ORCH-029 constraint unchecked on half the multi-step runs. K1 to K3 are ready to be recorded in
`docs/defects/` (or K2 raised as an open question) on a go-ahead.
