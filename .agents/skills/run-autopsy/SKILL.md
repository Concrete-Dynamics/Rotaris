---
name: run-autopsy
description: 'Post-run forensic examination of an agent-run product: launch log, session store, and transcript are read as evidence to produce a fixed-schema friction/bug report. Use when the user says "inspect the run", "look at the run after I finished", "run autopsy", "find frictions in the run", or after driving a run in a product whose logs and evidence they want analyzed. Covers log triage, store queries, transcript reading, duplicate/anomaly quantification, and defect-note cross-checking.'
argument-hint: '[session id or workspace path, optional]'
---

# Run Autopsy

Examine a completed (or stopped) agent run and report frictions and bugs in the
product — not in the model, not in the user. Evidence only: log, store,
transcript, files on disk. Nothing is repaired; findings are reported, without
suggestions or fixes.

## Inputs

Ask for (or discover) before starting:

1. **Log file** — the main-process/launch log written while the run happened
   (e.g. stdout redirected to a file at launch).
2. **Session store** — the workspace database (e.g. `workspace.db` under
   `~/.local/share/<product>/workspaces/<id>/`). Discover the newest workspace
   if not given: newest mtime wins.
3. **Session id** — the run to autopsy. If not given, take the session with the
   latest `updated_at` whose `run_started_at` is not null.
4. **Product defect directory** — where noted defects live (e.g.
   `docs/defects/`), so findings can be marked *known* vs *new*.

## Procedure

Work in this order. Each step names what it decides; skip nothing without
saying why in the report.

### Step 1 — Size the run

Quantify before judging. Run the product reader first —
`apps/desktop/scripts/autopsy.mjs` (backed by `readAutopsy` in
`packages/engine/src/autopsy.ts`, covered work under R-043:
REQ-SESSION-139/199/153/136/134/135, REQ-EVENTS-056). It emits the session
row, per-tool breakdown (failed vs blocked partitioned, elapsed sums),
failure detail grouped by cause, usage curve with largest jumps, coherence
warnings, and per-model-key tool-call attribution (children from the children
record, the entry agent from its own launch audit, switches and overrides), in one
read-only pass:

```bash
node apps/desktop/scripts/autopsy.mjs              # newest db + latest started session
node apps/desktop/scripts/autopsy.mjs DB [SESSION_ID]
```

Two facts the reader bakes in: the `usage.update` payload carries tokens and
cost alone — no provider or model — so attribution reads `children.model_key`
for a child and, for the entry agent, the key its launch audit's configuration
snapshot, its continuations and its `entry_model_switched` entries record,
carried through every `model_override` of the pair it runs on (`undetermined`
where the snapshot cannot place the root's pair against a recorded override),
joined in order when it ran on more than one (`session` means none is recorded;
it is never borrowed from the children; automatic fallbacks are not read yet), and every printed line is truncated to 220 columns, so one catalogue dump
cannot take the transcript.

Then supplement from the store by hand for anything the snapshot doesn't
cover. Every number the report claims (duration, tokens, tool calls,
requests-per-minute) comes from here, so "slow" is a number, not a feeling.

### Step 2 — Log triage

Read the whole log with line truncation (`cut -c1-220`), never raw — one
model-catalogue dump can be 40k characters. Then:

- Count and group `warn`/`error` lines. For each group: exact message, count,
  whether it is actionable or noise.
- Grep for `fail|reject|refus|invalid|unhandled|exception` and read each hit's
  context (±3 lines).
- Note duplicate emission: same logical line printed twice with adjacent
  timestamps is a finding (double-sink), not two events.
- Note stderr forwarded from child processes (MCP servers, LSPs) that landed
  in the main log — if a known handshake/validation spam pattern exists, cite
  the defect that records it instead of re-deriving it.

### Step 3 — Store forensics

Query the store read-only (prefer `python3` + `sqlite3`; never write):

- **Failed tool calls** (`is_error=1` or `status != ok`): for each, the tool,
  args, `failure_kind`, and the result text. Group by cause. Two failures with
  the same root are one finding with a count.
- **Blocked vs failed**: `blocked` with a gate/withheld `failure_kind` is a
  permission-design question ("should a read-only tool be withheld?"),
  `failed` is a robustness question ("should this input have parsed?").
  Report them separately.
- **Consistency between twins**: if two tools of the same class (e.g. two
  read tools) disagree about gating, fencing, or paths for the same args,
  that is a finding of its own.
- **Efficiency waste**: duplicate reads of the same path, calls rejected and
  then retried with identical args, long waits between tool calls with no
  tool in between (agent thinking in circles — check surrounding thinking
  rows before claiming it).
- **Accounting**: cost fields vs provider meteredness. Tokens through a
  metered provider with `cost: 0` is a finding (unknown-cost should not
  render as free).
- **Summary/stop-state coherence**: `summary_text`, `stop_reason`,
  `execution_status` should agree. A NULL summary on a stopped run where
  other stopped runs get a summary is a finding.

### Step 4 — Transcript reading

Pull transcript rows around every failure and around stop points. Read the
agent's thinking rows adjacent to failures: they show where the *product*
confused the *agent* (e.g. an error message whose advice is not actionable,
two approval mechanisms that do not talk to each other). Quote the shortest
decisive fragment. A model flailing because the product gave it no workable
move is a product finding — record the flailing as evidence, the gate/message
as cause.

### Step 5 — Cross-check known defects

For each finding, search the defect directory by keyword before writing it
up. Mark every finding **known** (cite the note) or **new**. Never re-derive
a recorded defect.

### Step 6 — Rank and report

Rank by cost to the run's actual goal (minutes lost, user actions forced,
runs poisoned), not by elegance. Then emit the report in the schema below.

## Output schema

Emit exactly this structure, one numbered entry per finding:

```markdown
## Run autopsy — <session id> (<workspace>, <duration>, <tokens in/out>)

<context sentence: what the run was doing when it stopped>

### N. <Imperative title naming the cause>
- **Class**: bug | friction | noise | accounting
- **Status**: new | known (<docs/defects/<note>.md>)
- **Evidence**: 1–3 decisive facts with sources (log line / store table /
  transcript row ordinal). Shortest decisive quote, not a dump.
- **Cost**: what it actually wasted this run (time, tokens, user action).
```

Do **not** include a suggested fix or direction in any entry — the report is
evidence only; repairs are decided separately.

Close the report with a single line naming the highest-cost finding and
offering to record new findings in the defect directory. Findings are recorded
only with the user's go-ahead unless standing policy in the repo says
otherwise.

## Habits that made past autopsies work

- Truncate every log line before printing or filtering; untruncated dumps
  waste the transcript budget.
- One SQL round-trip per question; batch aggregations into a single heredoc
  script rather than many one-liners.
- `elapsed_ms` on tool calls exposes dominated wall time instantly — always
  sum per tool.
- Failure *counts by cause* beat failure lists: three identical rejections are
  one design flaw, not three bugs.
- Thinking rows adjacent to failures are the difference between "model was
  confused" (not a finding) and "product confused the model" (a finding).
- End every autopsy by offering the write-up step separately from the
  examination; examination is read-only and always safe.
