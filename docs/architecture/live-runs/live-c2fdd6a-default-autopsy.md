# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered)

> **In the record since 2026-10-13** (fin41, `fin41-comments-and-evidence`). Written on 2026-10-06 in the orchestrator's
> session scratchpad by a read-only examination of the default live pack `2026-10-06T15-47-11-941Z` at `c2fdd6a`, and copied here unchanged so the record that
> cites it does not depend on the container. Only two things were added: this note, and an HTML comment on each line
> that names a defect note at the path it was proposed under (every such note now sits in `docs/defects/fixed/`).
> Paths under `scratchpad/` and `/home/user/Rotaris-crw-wt-live/.live-run/` name the orchestrator's container: the
> packs are git-ignored and are not carried into the repository. No host, URL, key or token is quoted. The index is
> [`README.md`](README.md).

- **Pack:** `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-06T15-47-11-941Z/`. I copied it to
  `scratchpad/c2f/pack/` and read the copy, so the pack itself was never opened for writing.
- **Console:** `scratchpad/live-c2fdd6a-default.log`. The run took 15:47:11 to 16:02:19 UTC and ended `live-run PASSED`:
  143 PASS, 0 FAIL, 13 NOTE (`results.json`).
- **Code and record:** `/home/user/Rotaris-crw-wt-live`, detached at `c2fdd6a`. Nothing was built or launched there, and
  no live run or proof was started. The only program I executed in that tree was the read-only reader
  `apps/desktop/scripts/autopsy.mjs`, against the copied store. The run's sandbox under `/tmp/rotaris-live-run/` no longer
  exists, so the workspace's files are known only through the store, the logs and the traffic.
- **Method:** `.agents/skills/run-autopsy/SKILL.md`, steps 1 to 6, applied to all 8 sessions and to the 2 launch-only logs
  (sign-in, shell). For every session, the reader's output equals that scenario's `autopsy.txt` apart from the store path
  and one trailing blank line. I then read:
  - the store's `sessions`, `iterations`, `children`, `tool_calls`, `issues`, `timeline`, `transcript_rows`, `events`,
    `launch_audits` and `agent_fingerprints`;
  - every `model-traffic.jsonl`, parsed request by request (timing, usage, tools offered, system prompt and its SHA-256,
    reasoning characters, calls emitted);
  - every `app.log`, `session.log` and `transcript.md`, all 16 PNGs, and the pack's `agents.yaml`.

  I checked each finding against `docs/defects/` (7 open notes) and `docs/defects/fixed/` (485 notes) at `c2fdd6a`.
- **Conventions:**
  - `#N` is a `tool_calls.ordinal`.
  - "row N" is a `transcript_rows.row_index`.
  - "traffic #N" is the 0-based line of that scenario's `model-traffic.jsonl`.
  - A prompt is named by the first 10 hex digits of its SHA-256.

## Parts

Since 2026-10-26 the rest of this document is in [`live-c2fdd6a-default-autopsy/`](live-c2fdd6a-default-autopsy/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](live-c2fdd6a-default-autopsy/01-verdict.md) | Verdict |
| [02](live-c2fdd6a-default-autopsy/02-sizing.md) | Sizing |
| [03](live-c2fdd6a-default-autopsy/03-the-rulings-this-run-exercises.md) | The rulings this run exercises |
| [04](live-c2fdd6a-default-autopsy/04-the-previous-default-runs-findings-27a5127-g1.md) | The previous default run's findings (`27a5127`, G1 to G11), in this pack |
| [05](live-c2fdd6a-default-autopsy/05-fixed-notes-re-checked-none-recurred.md) | Fixed notes re-checked: none recurred |
| [06](live-c2fdd6a-default-autopsy/06-run-autopsy-1248a1f2-653e-4f66-acb2.md) | Run autopsy — 1248a1f2-653e-4f66-acb2-6e35dbbf2a59 (resume, v1-4ec58051303c4300829be798789f98db, 90.3 s over 2 runs, 278,644 in / 8,225 out); 1. Spec-faithful and harness observations (no finding) |
| [07](live-c2fdd6a-default-autopsy/07-run-autopsy-21ebbb5d-3020-4f93-98cf.md) | Run autopsy — 21ebbb5d-3020-4f93-98cf-8eaab894af5b (frictions, v1-4ec58051303c4300829be798789f98db, 20.8 s, 65,152 in / 1,142 out); 1. Spec-faithful (no finding) |
| [08](live-c2fdd6a-default-autopsy/08-run-autopsy-bef9de1f-36aa-4b85-8b54.md) | Run autopsy — bef9de1f-36aa-4b85-8b54-eedea1e140d1 (requirements, v1-4ec58051303c4300829be798789f98db, 198.5 s, 539,320 in / 13,593 out); 1. Model behaviour meeting spec-faithful refusals (no finding) |
| [09](live-c2fdd6a-default-autopsy/09-run-autopsy-09450abb-a3a5-4971-b9f0.md) | Run autopsy — 09450abb-a3a5-4971-b9f0-8a09bd28b090 (terminal, v1-4ec58051303c4300829be798789f98db, 213.8 s, 301,477 in / 9,192 out); 1. Spec-faithful (no finding) |
| [10](live-c2fdd6a-default-autopsy/10-run-autopsy-8a7d0d7c-31ad-4319-b39d.md) | Run autopsy — 8a7d0d7c-31ad-4319-b39d-cfd414a15772 (edit, v1-4ec58051303c4300829be798789f98db, 133.7 s, 357,385 in / 12,614 out) |
| [11](live-c2fdd6a-default-autopsy/11-run-autopsy-3ce37ae3-7ed7-4d7b-b7fa.md) | Run autopsy — 3ce37ae3-7ed7-4d7b-b7fa-892831f2bcea (ask, 15.2 s, 28,140 in / 703 out) |
| [12](live-c2fdd6a-default-autopsy/12-run-autopsy-055e5eba-d035-4bfb-95cf.md) | Run autopsy — 055e5eba-d035-4bfb-95cf-58389f5ca38e (faults-ladder, 13.5 s, 18,554 in / 326 out) |
| [13](live-c2fdd6a-default-autopsy/13-run-autopsy-64426c61-22f1-4882-b86c.md) | Run autopsy — 64426c61-22f1-4882-b86c-bbaf0eae25e6 (faults-stall, 131.3 s, 18,554 in / 582 out) |
| [14](live-c2fdd6a-default-autopsy/14-launch-only-logs-sign-in-and-shell-no-session.md) | Launch-only logs — sign-in and shell (no session) |
| [15](live-c2fdd6a-default-autopsy/15-cross-session-findings.md) | Cross-session findings; K1. Show one run's duration a second apart in the run header and the inspector's run-level row; K2. Ask the coordinator for a todo list by instruction text alone, though REQ-ORCH-029 says the constraint holds whatever the text; K3. Tell the coordinator that "the coordinator routed it to you" |
| [16](live-c2fdd6a-default-autopsy/16-the-thirteen-note-lines.md) | The thirteen NOTE lines |
| [17](live-c2fdd6a-default-autopsy/17-unverified-no-finding-drawn.md) | Unverified (no finding drawn) |
| [18](live-c2fdd6a-default-autopsy/18-defect-notes.md) | Defect notes |
