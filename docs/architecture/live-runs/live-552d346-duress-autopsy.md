# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered)

> **In the record since 2026-10-13** (fin41, `fin41-comments-and-evidence`). Written on 2026-10-13 in the orchestrator's
> session scratchpad by a read-only examination of the duress live pack `2026-10-13T08-12-41-551Z` at `552d346`, and copied here unchanged so the record that
> cites it does not depend on the container. Only two things were added: this note, and an HTML comment on each line
> that names a defect note at the path it was proposed under (every such note now sits in `docs/defects/fixed/`).
> Paths under `scratchpad/` and `/home/user/Rotaris-crw-wt-live/.live-run/` name the orchestrator's container: the
> packs are git-ignored and are not carried into the repository. No host, URL, key or token is quoted. The index is
> [`README.md`](README.md).

- **Pack:** `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-13T08-12-41-551Z/` (`sign-in/`, `duress/`, `workspace.db`,
  `results.json`, `agents.yaml`). I copied it to `scratchpad/552d/pack/` and read only the copy (store opened `mode=ro`). The
  sandbox workspace no longer exists, so the delivered files are known from the store, the logs and the traffic only.
- **Console:** `scratchpad/live-552d346-duress.log`. `--only=duress`, per-agent timeout 2,700 s, 08:12–09:07 UTC.
  **`live-run PASSED`: 30 PASS, 9 NOTE, 0 FAIL.**
- **Code and record:** `/home/user/Rotaris-crw-wt-live`, detached at `552d346`. Nothing was built, launched or run there but
  the read-only reader `apps/desktop/scripts/autopsy.mjs` (`/opt/node24/bin/node`) against the copied store; its output
  equals the pack's `duress/autopsy.txt` but for the store path and one trailing blank line. Everything else was `python3 -I`
  reads of the copied store and traffic (`scratchpad/552d-scripts/`). No live run was launched and the repository was not
  edited.
- **Method:** `.agents/skills/run-autopsy/SKILL.md`, steps 1 to 6. Sources: `sessions`, `iterations`, `children` (each
  `report`), `tool_calls`, `issues`, `timeline`, `events`, `transcript_rows`, `artifacts`, `permission_audit`,
  `launch_audits`, `ring_state`; all 199 records of `duress/model-traffic.jsonl` (system prompt, brief, timing, record-level
  `usage`, reasoning, text, emitted calls, offered tools); both `app.log`s, `session.log`, `summary.md`, `results.json`,
  `duress.early.png`, `duress.png`. Record: `docs/defects/` (7 open notes, 604 fixed), OQ-214, OQ-250,
  PD-CONFIG-003, PD-TOOLS-006, REQ-TOOLS-152/154, REQ-ORCH-060, `packages/engine/src/run/supervisor.ts`,
  `packages/engine/src/children/{notify,orchestration,cut-off}.ts`.
- **Comparisons:** `live-a68f121-duress-autopsy.md` (D1–D9) and `live-552d346-default-autopsy.md` (Q1–Q3, same build).
- **Conventions:** `#N` is a `tool_calls.ordinal`; "req N" the 0-based line of `duress/model-traffic.jsonl`; "row N" a
  `transcript_rows.row_index`; children by short name: a, b, c (wave 1), d, e1 (`architect`), e2 (wave 2), f1 (`verifier`),
  f2 (wave 3). The model key is written `openai-compatible--<endpoint>/qwen3.8-flash-next`; no host, URL, key or token is
  quoted. New findings are numbered **V1–V3**.

## Parts

Since 2026-10-26 the rest of this document is in [`live-552d346-duress-autopsy/`](live-552d346-duress-autopsy/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](live-552d346-duress-autopsy/01-verdict.md) | Verdict |
| [02](live-552d346-duress-autopsy/02-sizing.md) | Sizing |
| [03](live-552d346-duress-autopsy/03-the-items-read.md) | The items, read; D2 — the 45-minute per-agent timeout (OQ-214's second ruling, PD-CONFIG-003); D3 — the architect write-scope refusal at #92, despite the routing sentence; D6 and the loop-classification cap; D8 |
| [04](live-552d346-duress-autopsy/04-run-autopsy-18a9d22d-5a5a-403c-808e.md) | Run autopsy — 18a9d22d-5a5a-403c-808e-57e0c942982b (duress, v1-89d793e5bbd827d8adddaac9922a2a8f, 3,263.7 s, 5,800,296 in / 307,187 out); V1. Carry the whole of a sibling's answer through the hand-off the routing sentence prescribes, not REQ-ORCH-060's 4,000-character report block; V2. Weigh OQ-250's per-route clause: the routing sentence did not keep the coordinator from giving `architect` a write scope; V3. The intent classifier is cut at 12 s on the duress prompt after it had decided, while it reasons about the object's field names; Model behaviour meeting spec-faithful gates (no finding) |
| [05](live-552d346-duress-autopsy/05-recurrences-and-repairs-that-held.md) | Recurrences and repairs that held |
| [06](live-552d346-duress-autopsy/06-log-triage.md) | Log triage |
| [07](live-552d346-duress-autopsy/07-the-note-lines.md) | The NOTE lines |
| [08](live-552d346-duress-autopsy/08-unverified-no-finding-drawn.md) | Unverified (no finding drawn) |
| [09](live-552d346-duress-autopsy/09-defect-notes-and-first-executions.md) | Defect notes and first executions |
