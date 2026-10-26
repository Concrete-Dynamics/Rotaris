# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Verdict

Part 1 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Verdict

The run is clean, and the 2026-10-06 rulings hold wherever this pack reaches them:
- **Exercised and holding (13):** OQ-162, OQ-105, OQ-202, REQ-TOOLS-135 (G6), OQ-119, OQ-127, OQ-157, G8, G5, OQ-115,
  OQ-194, H4 and OQ-114.
- **Broken:** none.
- **Not exercised (9):** REQ-TOOLS-032 for MCP (G3), OQ-116 mid-pass, OQ-139, OQ-163, OQ-199, OQ-177, OQ-185, OQ-188 and
  OQ-189.
- **Fixed notes:** none recurred.
- **Findings:** none blocks a release or degrades a run. Three new findings, all cosmetic:
  - **K1** (product defect): the run header floors the run's duration and the inspector's run-level row rounds the same
    interval, so they read a second apart.
  - **K2** (owner question): REQ-ORCH-029's todo-list clause reaches the coordinator only as instruction text, and three
    coordinators finished multi-step work with no plan of their own.
  - **K3** (product defect): the ROUTE playbook text tells the coordinator that "the coordinator routed it to you".

The largest cost is still the fixed figures OQ-114 keeps, now ruled. About 53 s of classification sat on the critical
path, 35.9 s of it in three 12 s fallbacks (edit, resume, terminal). About 91 s of report summarising ran with no other
model request in flight, mostly while a parent waited on it. Together that is roughly 144 s of 817 s of session wall
time.
