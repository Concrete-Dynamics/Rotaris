# The codebase — how the architecture is laid out in code — The disciplines, mechanised

Part 2 of 22 of [the codebase record](../codebase.md), which indexes every part.

## The disciplines, mechanised

- **Boundaries** — the matrix in `eslint.config.js`; `apps/desktop` is split into its five roots so
  the renderer cannot reach `platform` or `store` and main cannot reach `store`.
- **No bare timers in engine code** — `rotaris/no-bare-timers` over `kernel`, `engine`, `agent-tools`,
  `workspace`, `store`, `platform`, `model`, `mcp` and the two utility-process roots. Named
  exceptions: `kernel/src/clock/` (it *is* a clock) and `platform/src/clock.ts` (it *is* the adapter).
- **No `electron` outside the roots** — `rotaris/no-electron-outside-roots`.
- **No Node built-ins in renderer code** — `no-restricted-imports` over `ui`, `ui-core`, renderer, preload.
- **The IPC payloads carry no secret** — `contracts.test.ts` walks every channel schema.
- **The symbol artifact is regenerated before collection** — vitest `globalSetup`, same generator as
  the build. A withdrawn identifier is `@deprecated` and warns at every reference (REQ-TRACE-181).
- **A window is held by id, never by handle, past its creation** — `webContents` on a destroyed
  window throws, and a throw from a `closed` handler during exit wedges the process behind a modal
  error dialog (ADR-0044 first-execution note). The relay attaches by id; `send` checks `isDestroyed()`.
- **Nothing in main reaches the platform's own presenter** — every dialog is opened in its asynchronous form (ADR-0019),
  and main logs an uncaught exception instead of letting the platform show it in a native error box, which is the
  same synchronous modal by another door (found on the approval dialog's first execution).
- **A hook process is killed alone; a terminal command's tree is killed together** — ADR-0015 forbids widening a
  hook's termination to its group and ADR-0020 requires it for a command; the two paths share no kill code
  (`hooks/runner.ts` calls `kill()` on the one process, `terminal/foreground.ts` runs `taskkill /T`).
- **The redaction pass is bounded, not merely correct** — every pattern that scans an unbounded alphanumeric run
  is capped or anchored (ADR-0007 first-execution note); `redaction.test.ts` pins 100 KB under 50 ms.
- **A PTY repeats the marker back before honouring it** — the terminal's end-marker detection matches the marker
  FOLLOWED BY DIGITS on the VT-stripped stream, never the first occurrence of the marker text, because the
  echoed wrapper carries that text (ADR-0020 first-execution note). `node-pty` loads from its prebuilds under
  Node and Electron alike and is externalised beside `better-sqlite3`.
- **A PTY caps the line it hands the shell** — a POSIX wrapper longer than `POSIX_LINE_BYTES` (1,000 bytes) is never
  written to the PTY: the canonical-mode line discipline keeps 4,095 characters of a line on Linux and 1,024 on macOS, and
  a cut wrapper left the shell on its continuation prompt (live-run M1). `ForegroundSession.carry` stages such a command
  in a script under the OS temporary directory and wraps `. '<script>'` instead (ADR-0020's report-back of 2026-10-06).
- **The engine owns the `ToolPort` and `GateSink` interfaces; the run-host root fills them** — `engine` never
  imports `agent-tools` and `agent-tools` never imports `engine`, so the boundaries matrix has no edge between
  them to police.
- **Icons are `@phosphor-icons/web` classes** (`ph ph-<name>`), imported in the renderer root; the
  design assets carry the same two fonts and are not referenced directly.
- **A relative link in the record reaches what it names** — `tools/check-record-links.mjs` (in `pnpm lint`, beside
  `check-request-log.mjs` and `check-directive-register.mjs`) fails on a Markdown link under `docs/`, in
  `CONTEXT-MAP.md`, `AGENTS.md`, the root `README.md` (since 2026-10-31) or a `packages/**/CONTEXT.md` whose target file does not exist or
  whose `#fragment` names no heading or anchor in it; fenced and inline code and HTML comments are text, not links.
  A defect note moved to `docs/defects/fixed/` takes every link to it along in the same commit, or the gate says
  which one stayed behind (since 2026-09-28, R-062). A second pass reads the code: a `docs/defects/….md` path in a
  file under `apps/`, `packages/` or `tools/` — comment, test or a line a proof prints — must name a note that exists,
  and be written whole on one line, since a path wrapped across a comment's lines or abbreviated with `…` is one no
  pass can read (since 2026-10-03, fin13). A third pass reads the record's prose: a `docs/defects/….md` path, or one
  written relative to its file (`../defects/….md`), written as inline code in a record file must name a note that exists, unless an HTML comment on its own line,
  `<!-- historical-path: <the path> -->`, keeps it as history on purpose; a mark that keeps nothing, or keeps a live
  path, fails. `docs/product/requests.md`, the orchestrator's alone to edit, is not read by it, and the check says why
  (since 2026-10-04, fin15).
- **No merge leaves a conflict marker behind** — `tools/check-conflict-markers.mjs` (in `pnpm lint`, after
  `check-line-endings.mjs`) reads every tracked text file in the working copy and the index, through `git grep`, and
  fails on a line git writes as a marker: seven `<`, `|` or `>` at column 0 followed by a space or the line's end, and
  a line of exactly seven `=` only between an opening and a closing marker, since alone it is a Markdown setext
  heading underline. Text is judged by content, never by attribute: `git grep --text`, and a file is passed over as
  binary only when a NUL stands in its first 8000 bytes, git's own test. Until the third correction it ran
  `git grep -I`, which reads every path whose `diff` attribute is unset as binary, so `pnpm-lock.yaml`
  (`text eol=lf -diff` in `.gitattributes`) was never read, against the claim that every tracked text file was. It
  does not read untracked files, nor markers git writes at a non-default `conflict-marker-size`. It names the file
  and the line, runs git with colour off whatever the configuration says, reports
  a candidate it cannot read, a `git grep` that fails inside a checkout and a checkout git refuses (another uid's,
  an unknown repository format), and skips only where git is not installed or no `.git` stands at or above the
  repository root. A typecheck catches a marker in TypeScript; nothing else read one in Markdown or JSON read as text
  (since 2026-10-02, [the note](../../defects/fixed/the-gate-passes-a-committed-merge-conflict-marker.md)).
- **A design-equivalent control is written once** — `tools/check-ui-language.mjs` (in `pnpm lint`, beside
  `check-theme-colours.mjs`) fails on a raw `button`, `input`, `textarea`, `select` or `table` anywhere under
  `packages/ui/src` or `apps/desktop/src/renderer` except `design-system/` itself, which is where they live.
  Literal spacing, type, radius and motion values are held at a **committed baseline that only shrinks**: a new
  one fails, and a paid-off one fails too until the baseline is lowered (`--write-baseline`), so an allowance
  freed in one file cannot be re-spent in another. A textarea, a file input, a canvas, an SVG and the terminal
  grid keep their own markup and consume the shared classes and tokens.
- **A count's noun agrees with it, and a literal "(s)" is never drawn** — `REQ-SHELL-044`. `countNoun` lives in
  `kernel/count-noun.ts` so that every package can word a count one way (`ui/agents.ts` re-exports it), and
  `tools/check-plural-markers.mjs` (in `pnpm lint`, beside `check-ui-language.mjs`) fails on a `(s)`, `(es)` or `(ies)`
  marker in any string literal, template or JSX text of the product's source. A log line passes, and so do the four
  tool results a requirement spells with the marker, named with their reason in its `ALLOWED` list (OQ-138). An
  entry that excuses nothing fails too (since 2026-09-29, live-run L11, R-067).
- **A timeline name is a vocabulary's word** — `REQ-ORCH-139`. `tools/check-timeline-vocabulary.mjs` (in `pnpm lint`)
  reads every timeline write in the product's source — the writer's calls, a sink's `timeline`, the store's
  `insertTimeline`, main's `timeline.append` — and fails on a name in no vocabulary. Its `VOCABULARY` cites the
  requirement fixing each word, and domain 01's list is read from the specification so the two cannot drift. Its
  `FORBIDDEN` fails a name a directive withdrew though the displaced requirement still states it (PD-TOOLS-002's
  `permission_mode_downgraded`). ~~**Owed:** twenty-eight names the product writes have no word in any list; they are held
  in its `AWAITING` by OQ-157 — an entry nothing writes fails the gate, and the test pins the list's names, so adding one
  is a deliberate test edit (since 2026-10-01, acceptance A29, R-067).~~ **Done 2026-10-06** (R-071): the owner ruled
  OQ-157 with OQ-53, OQ-54, OQ-76 and OQ-127, and the thirty-three names (the twenty-eight, OQ-127's three watchdog words
  and OQ-76's two) are words of `PD-ORCH-014`, `PD-CHAT-009` and `PD-TOOLS-011`, each cited in `VOCABULARY`; `AWAITING` is
  empty and pinned so, and the gate's test checks each directive's entry states its words.
- **An open question is called open only while it is** — `tools/check-open-question-claims.mjs` (in `pnpm lint`) reads
  each question's state from `open-questions.md` (open, deferred, or settled: ruled, closed, withdrawn or resolved) and
  fails on a sentence in the code or in the record that describes the build (the views, this file,
  `first-release-plan.md`, the architecture README) that calls a settled question open — "OQ-37 stays open", "asked as
  OQ-120", "OQ-114 to OQ-116 are open" — unless it is struck through or its next words say it was ruled; on a sentence
  presenting a settled question's answer as the build's reading — "OQ-103's reading", "OQ-190's build reading" — with
  no ruling beside it; and on a sentence saying a question was "raised as an open question" that names none. It also
  reads `AGENTS.md`, `docs/module-map.md`, the glossaries and `.claude/rules/`; a bare "closed" or a "not ruled" is no
  ruling. After R-071 a dozen of the first stood, some sixty of the second, and three comments claimed questions no
  entry held, which became OQ-210 to OQ-212 (since 2026-10-06, acceptance F16 and its repair round 1; all three ruled
  2026-10-07 under R-072: OQ-210 and OQ-211 as `PD-LIBRARY-003` and `PD-LIBRARY-004`, OQ-212 confirmed as built).
- **A settled entry leaves the live record for the archive** — `tools/archive/migrate.mjs` (`pnpm archive:migrate`;
  R-092, [`docs/README.md`](../../README.md#the-archive), "The archive") moves each open question the claims gate reads as
  settled (`entryState`, the one rule both share) whole to `docs/archive/architecture/open-questions/<part>.md`, leaves an
  index line in its place, rewrites the part's "Holds" sentence and its index row, and repoints every link to the moved
  anchor in the record and in the code; a second run changes nothing. Its `--check`, in `pnpm lint` from the first
  migration on, fails while a settled entry is still live. The gates read the archive as part of the record:
  `check-record-links.mjs` and `check-doc-budget.mjs` walk `docs/archive/` with the rest of `docs/`, and the claims gate and the record's tests read
  live and archived parts together through `tools/record-parts.mjs` (`readRecordWithArchive`) (since 2026-11-01, hrd2).
- **A whole-session update keeps the transcript rows** — `REQ-MONITOR-216` omits the transcript from it, so
  it cannot say which rows survived; the increment after an attach or a reconcile upserts by index. The
  first run loop's status saves emptied a transcript still being written before this was so (ADR-0043
  correction note). A test pins it.
- **Every total mapping between the closed vocabularies lives once** — `contracts/src/status.ts` for what a
  surface needs, `engine/src/run/stop-conditions.ts` for what a run decides; a token outside a closed set
  yields `error` with a diagnostic, never a guessed success (REQ-EVENTS-026, REQ-SESSION-187).
- **Implementation conditions are markers at the module they bind** — `TODO(IC-4)` in
  `platform/src/machine-id.ts` (half 2, the rename), ~~`TODO(IC-6)` in `apps/desktop/electron-builder.yml`~~.
  IC-5's marker went with its discharge, and so did IC-6's (discharged 2026-09-04; *corrected 2026-10-13: no such
  marker is in the file, and `git log -S'TODO(IC-6)'` finds none there*).
- **A verification run drives the dialogs from the environment** — with `ROTARIS_CAPTURE_PNG` set, main
  answers the save and open dialogs from `ROTARIS_CAPTURE_BACKUP_TO` / `ROTARIS_CAPTURE_RESTORE_FROM`
  and every message box from `ROTARIS_CAPTURE_ANSWERS`, logging each box's full text; a user-driven run
  never enters those branches. A box with no scripted answer is a real dialog and blocks — by design.
