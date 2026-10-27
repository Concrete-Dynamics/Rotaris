# The codebase — how the architecture is laid out in code — What the walking skeleton does, and nothing more (continued)

Part 7 of 22 of [the codebase record](../codebase.md), which indexes every part.

**Configuration.** `packages/config/src/` — `load.ts` (the one entry point, no database handle), `merge.ts` (the four
classes; the overlay shared with the per-field writer through a mapping adapter), `sections/`, `slots.ts`, `validate.ts`,
`writers.ts` (bootstrap, per-field, desktop save, model preferences), `tiers.ts` (Tier B), `preferences.ts` and
`snapshot.ts` (what the screen reads). The run host resolves a run's setup in `run-host/configuration.ts`; the
workspace service commits Tier A; contracts carry `ConfigSnapshot`, `DesktopSave`, `LiveState` and the `config:changed`
channel. Decisions taken here for the owner: the built-in roles' default tiers; `api_key_env` as the credential until
ADR-0029 (closed by Part K's lease); the composer's write also updating the pending state (REQ-CONFIG-423); the proof
scripts writing a scratch `agents.yaml`. `ROTARIS_CAPTURE_CLICKS` and `ROTARIS_CAPTURE_SELECT` are verification seams.
`project-settings.ts` is the snapshot's reader and its layer (REQ-CONFIG-034), kept in `config` because the loader
folds it and may not import `providers`.

**Providers.** `packages/providers/src/` — `catalogue.ts` (the six frozen records, `validateCatalog()` at build and at
main's start), `credentials/` (`store.ts`, the protection adapter `protect.ts` with its read-back, the adjacent lock
`lock.ts`), `discovery.ts` (the generic discoverer with REQ-PROVIDER-071's total mapping), `slots.ts` with
`tiers.data.ts` (deterministic tier assignment), `limits.data.ts` (the known-limits table), `project-settings.ts` (the
snapshot's writer, merge and secret screen), `signin.ts` (`ProviderService`: the API-key flow, replace-key,
validate, sign-out, delete, refresh, health, the list, the lease). Instantiated by **main only** (ADR-0030); the run
host asks `credentials.lease` per run start and is answered the bearers. Contracts carry `ProviderRow`,
`ProviderDialogPayload` and the outcome shapes, none with a secret-looking field (a test); `provider.signIn` is the one
command carrying a pasted key inward. Surfaces: the providers card under Settings → Models (`ui/src/settings/
Providers.tsx`), the authentication window `?role=provider` (`ui/src/ProviderDialog.tsx`), the first-launch notice
with "Add a provider", the two refusals with "Open Settings"; a sign-in asks the workspace service `config.bootstrap`
for the starter `agents.yaml`, which the workspace's open has normally written already (`workspace-service/open-bootstrap.ts`,
2026-10-03: before it, initialization's record created the file first and the starter never came). Decisions taken here for the owner: the OpenAI-compatible instance only (the other
two sign-in methods, Copilot's and codex's discovery, the bridges, the usage and credit tiles owed); `/reset` before
the grant on Windows; `<data>/tokens` replacing the reserved `credentials`; the lock inside the directory (OQ-19); the
shipped capability metadata empty (OQ-18); REQ-PROVIDER-091's override read as the named-entry overlay; the zero-model
recovery without "edit by hand" (no configuration editor). `ROTARIS_CAPTURE_PROVIDER_FILL`, `ROTARIS_CAPTURE_WAIT`
and `ROTARIS_CAPTURE_WAIT_MS` are verification seams (with a typed prompt, the wait's bound counts from the prompt's submission since 2026-10-07: live-run finding P6, [`a-captures-wait-starts-before-its-prompt-is-typed.md`](../../defects/fixed/a-captures-wait-starts-before-its-prompt-is-typed.md), and the live run's kill limit for such a launch adds the typing time, `apps/desktop/scripts/lib/prompt-typing.mjs`); a third `>>key` segment on the fill seam fills the key field and presses the dialog's own button, which is how `pnpm live-run` signs in unattended (`AGENTS.md`) and how `pnpm slice-proof` gives the registered endpoint its stored key; `ROTARIS_CAPTURE_PROVIDER_EMPTY_OK` takes the
zero-model alert's own "Continue anyway", so an endpoint whose `/models` answers with nothing does not strand a run
that no one is watching.

**What `pnpm slice-proof` does.** It builds Electron and carries ONE scratch profile across the launches, because
the credential the first writes must be the one the runs lease. Since 2026-10-02 ([R-068](../../product/requests.md#r-068))
it signs into the live-run registry's endpoint (`~/.rotaris/live-run/endpoints.json`: its default, or `--endpoint=<name>`),
read through `apps/desktop/scripts/lib/endpoint-registry.mjs`, the module `live-run` reads it through: the label, base
URL and model are the registry's and the provider id is the one the product mints for the label (REQ-PROVIDER-051).
**A registered endpoint with a stored key runs it unattended**: the key (`ROTARIS_LIVE_API_KEY`, else the file beside
the registry) is filled into the dialog's key field and the dialog's own button pressed, as `live-run` signs in. **An
endpoint without a stored key takes `--paste-key`**: the label and URL are filled and the owner pastes the key, the
proof's original design. Until then it signed into OpenRouter constants (`anthropic/claude-haiku-4.5`) and always waited
for the owner's paste. The key never reaches a log (each is written with it substituted out and asserted to have held
none), the repository or `.proof/slice-proof/`: the scratch profile, whose credential store holds the key as a person's
would, lives in the system temp directory, and `credential-facts.json` records the credential file's shape without its
token. Scenarios: (1) first launch — the notice, Settings → Models → Add endpoint, the credential file's five keys,
the key it holds being the one the dialog was given, its exact protection, the snapshot's record and picks, the
discovered-models count read as a count (at least one, its noun agreeing with it, REQ-SHELL-044), the bootstrapped
`agents.yaml`, and a log free of the key; (2) the three tier slots set to the registered model and saved, or, on a one-model endpoint whose discovery picks already name it, asserted through the discovered picks; (3) one real
run — the lease, the request to the endpoint, a settled tool row, usage figures and the terminal result from the store;
(3b, Part L) three more real runs, one prompt per intent family, each asserted to classify from the small slot and never
fall back, the answering rung recorded; (4) spike 6's live harness against the same URL, model and key; (5) sign-out
from the card — the file gone, the snapshot kept; (6) a prompt refused. `--resume` keeps the profile and skips the
sign-in; `--skip-build` skips the build. Evidence lands under `.proof/slice-proof/`. `--from=<scenario>` replays the
earlier scenarios from their evidence. On 2026-09-05 every scenario passed on the owner's re-run with an OpenRouter
key (`.proof/slice-proof/results.json`), after two runs that each found a defect. Since 2026-09-29 (R-067) it reads the
credential file where the product writes it on the running platform (`tokensDirFor`): the Windows spelling it used
everywhere left the first launch's wait, the strays check and the sign-out check with nothing to read off Windows
([note](../../defects/fixed/slice-proof-and-code-intel-proof-spell-the-windows-data-directory-on-every-platform.md)).
Since 2026-10-01 step 3 reads the priming from the run host's opening credential report (`lib/priming-report.mjs`,
pinned against `LeaseReportLog`): the provider among the authenticated, nothing unresolved (REQ-PROVIDER-067/068), in
place of "credentials: 1 provider(s) authenticated", a line nothing writes
([note](../../defects/fixed/slice-proof-asserts-a-priming-line-the-product-does-not-write.md)). ~~Not yet run since.~~
**First run against a self-hosted endpoint, 2026-10-02** (`katalyst`, `qwen3.8-flash-next`, the stored key,
xvfb, as root): every scenario passed on a fresh profile — first launch (`Added Katalyst; discovered 1 model.`), slots,
run (`completed`, one settled tool row, the request at `…/v1/chat/completions`), the three intents (`question`,
`explicit_trivial`, `small_feature`, each by `json_schema`, none falling back), spike 6 (four of four), sign-out and the
refusal — after the runs before it found four defects of the proof, each repaired in the same bundle: the model slots
named as native selects, the sign-out pressed in a panel that no longer holds it, the run replayed from the newest
session, and spike 6's figures lost on a green run (notes under `docs/defects/fixed/slice-proof-*`). On a one-model
endpoint the sign-in's discovery picks already name the model for every tier, so scenario 2 asserts the tiers through
the discovered layer (the Models page shows them `discovered`; re-selecting the shown value is no edit) rather than a
saved file. Recorded in [`first-executions.md`](../first-executions.md).
**Since 2026-10-04 it asserts only what a requirement fixes about a live model's answers** (`lib/live-answers.mjs`), after
three of five runs on 2026-10-03 went red on what the model answered or how long the shared endpoint took
([note](../../defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md)). Each intent prompt accepts the
categories REQ-ORCH-006 and REQ-ORCH-021 leave in reach of it, the reason written beside each (`INTENTS`). The README
question admitted `explicit_trivial`, which was [OQ-198](../open-questions.md)'s to narrow; since the owner's ruling of 2026-10-06
([`PD-ORCH-011`](../../product/directives/pd-orch-011.md#pd-orch-011), [R-071](../../product/requests.md#r-071)) it accepts the answer group alone. A fallback stays a red, and one
at the 12 s bound names OQ-114. A run the product completed in which the model wrote no answer is reported as the model's
call: it is kept as `run.attempt-1.*` (and in `.proof/slice-proof-answerless/`, which the next run does not clear) and
scenario 3 runs once more. A second answerless run is a red ([OQ-199](../open-questions.md)
asked whether the product should complete such a run; since its ruling, `PD-ORCH-009`, the product asks the entry role once
more first and tells the person when it still wrote none, and an answerless run without that row is the product's red,
`toldNoAnswer`). Every red copies the output directory into
`.proof/slice-proof-reds/<stamp>-<scenario>/` beside a `red.json` (the scenario, the error, the commit, the load, the results
so far; `lib/proof-reds.mjs`), where the next run does not remove it. `results.json` records the host's load at each launch.

**What `pnpm live-run` does.** It is the only check here that answers to a real model rather than a scripted one,
and the only one that spends money, so it never runs on its own: `pnpm check` does not reach it and without
`--confirm` it prints its plan and exits. The workspace is a COPY of `apps/desktop/scripts/fixtures/todo-app` in
the system temp directory — a React todo application with its requirements and a `node --test` suite needing
nothing installed — committed to a fresh Git repository so the change can be read back from `git diff`. Its store is
the conventional shape of REQ-TRACE-002 and its identifiers are REQ-TRACE-022 identifiers, so the requirements BOARD
reads it as readily as the agent does; `REQ-103` and `REQ-104` are approved and unimplemented there on purpose, one
for each path. Five scenarios over one scratch profile: (1) sign-in through the
product's own dialog, filled and pressed by the third `>>key` segment of the fill seam — the credential file, the
snapshot record, the discovered catalogue and logs free of the key; (2) one real run that reads and answers — the
lease, the request, a completed session, settled tool rows, usage; (3) one real run that implements the requirement
and runs the suite in the terminal — asserted from the files, from `git diff` and by the script running `node --test`
ITSELF, because the agent's own report is never the evidence; (4) the requirements BOARD, where nothing is typed —
`REQ-104` selected, the move control pressed, the release confirmed, and the run that follows watched from `backlog`
through `running` to `review`, its decision taken and the card left resting in `done`, asserted from the board, from
the delivery store's own rows, from the worktree the run was confined to and by running `node --test` inside it;
(5) a relaunch with no prompt — Overview painted from
the store. The endpoint is the owner's: `--add-endpoint` registers a name, the label the product will show, the base
URL, the model and optional prices in `~/.rotaris/live-run/endpoints.json`, with the key beside it, one file per
endpoint, DPAPI-encrypted on Windows (PowerShell 7 probed first, since 5.1 cannot always load the cmdlets; an
owner-only ACL where no host can, said aloud) and mode 600 elsewhere — never on a command line, never in the repository;
every log is substituted and then asserted to hold no bearer. Two bounds on the cost always hold — the model the
owner chose and `runtime.max_iterations` written into the sandbox — and the third is whatever the endpoint allows,
named in the output rather than inferred: none at all for an endpoint registered `--unmetered` (the owner's own
hardware — tokens counted and reported, nothing stopping on them, unless the invocation names a ceiling itself),
else the provider's own figure where it answers `GET /key` (OpenRouter), else the registered prices over the
store's token counts, else tokens alone against `--max-tokens`. `--context=<tokens>` covers an endpoint whose
`/models` declares its window in a key discovery does not read (vLLM's `max_model_len`): it becomes
`max_input_tokens` on the written entry. An endpoint that
discovers no catalogue is not a dead end: the sign-in takes the dialog's own "Continue anyway" and the script writes
the `models:` entry the run needs (REQ-CONFIG-082..097, the shape `snapshotLayer` would have produced). Evidence
under `.live-run/runs/<stamp>/`, one directory per scenario, packs accumulating to `--keep-runs` (default 10);
`AGENTS.md` is its standing instruction. **The pack became the run-autopsy skill's input on 2026-09-22, and was
not before it**: the skill asks for a launch log, the session store and a session id, and this script produced
all three and deleted two of them with the sandbox — so each scenario now leaves `autopsy.txt`, the product's own
`session.log`, the full `transcript.md` and a filtered copy of the launch log beside the verbatim one, and the
store is copied out before the sandbox goes. Until then every defect that skill found came from a session driven
by hand, and the live run had found exactly one defect in its life, which was its own.

*First Windows live run, 2026-10-20 (the Windows ARM64 session; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; packs `2026-10-20T07-55-35-723Z` (terminal, frictions) and `2026-10-20T08-14-16-333Z` (crlf), endpoint `katalyst`, unmetered; [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)):* the key came from the DPAPI registry file, as the run's key-source line said; `terminal` passed every check on its 11 win32 shapes, `crlf` (its first run anywhere) passed, and `frictions` failed twice — an upstream stream reset, and a child that never sent its SIGINT ([`a-signal-sent-without-session-action-is-read-as-a-query-and-dropped-silently.md`](../../defects/a-signal-sent-without-session-action-is-read-as-a-query-and-dropped-silently.md)). The first attempt (`2026-10-15T15-16-50-373Z`) lost its verdicts to a `crlf` overrun ([`a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`](../../defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md)).

**What the model was sent, and what came back, is recorded by a loopback proxy** the sandbox's `base_url` points
at (`apps/desktop/scripts/lib/model-traffic.mjs`, `--no-record-traffic` to bypass). The product emits one line
per call — `run-host/host.ts`'s `onRequest`: a method, a URL, and whether an authorization header was set — and
no body, status or duration anywhere; the only body that survives a real call is 500 characters of a failed
response kept on a `ModelError`. So the proxy adds a record the product cannot, without changing the product:
it is a raw pipe, forwarding chunks as they arrive, because a buffering proxy would remove the streaming the run
loop is built on and leave every assertion green — the harness measuring a product that exists only while it is
measured, which is the shape of the two false-symptom repairs above. `model-traffic.test.ts` pins that property
with a case that hangs if the pipe ever buffers, verified by making it buffer. Credentials are replaced in the
record before it is written and the `ask` scenario asserts it. *Since 2026-09-29 (R-067, live-run findings H1 and H-g)
a call the product aborts is let go at the endpoint too and written `aborted`, a record lands in the file of the scenario
that made the call rather than the one current when it ended, and a call still open when the proxy closes is written
`in-flight at close`: the first live run had nine aborted calls finish upstream and land `complete` in the next scenario's
file, and the duress pack was one record short of its log
(`docs/defects/fixed/the-recording-proxy-does-not-pass-a-client-abort-upstream.md`,
`docs/defects/fixed/the-recording-proxy-writes-nothing-for-a-call-in-flight-at-close.md`). Shown live the same day
(pack `2026-09-29T21-11-24-678Z`): `faults-stall`'s stalled call was let go at 120.5 s, the product's own idle bound,
not the rule's 300 s hold, and every scenario's records matched its log's `model request POST` lines.*

**The proxy's own first execution found that it could not answer a single call, and the reason is kept beside
its replacement.** The script launched every scenario with `spawnSync`, which blocks the Node event loop until
the child exits; a listener on a blocked loop accepts nothing, so the connection sat in the kernel's backlog and
was served only after the scenario that made it was over. A probe measured it rather than reasoned about it — a
child `fetch`ing a counting server while the parent sat in `spawnSync` reported `NO ANSWER after 6012 ms` and the
server had served **0** requests. Nine unit tests were green throughout, every one of them exercising the proxy
from a loop that was free: the same shape as 2026-09-12's finding that a proof which cannot fail is a finding.
`runElectron` now spawns asynchronously and resolves on `close`, keeping the SIGKILL-on-timeout behaviour its
callers read; the regression guard asserts **both legs**, that the `spawnSync` child is not served and the
`spawn` child is, because without the first the second could pass for an unrelated reason
(`docs/defects/fixed/the-recording-proxy-could-not-answer-while-spawnsync-blocked.md`).
*Since 2026-10-20 it no longer resolves on `close`:* on Windows the bound's SIGKILL ends main alone, and at `8080fbda`
two processes of the killed main kept its pipes for eight hours, so the run waited as long. It settles on the child's
`exit` and a five-second drain of the pipes (`scripts/lib/settle-launch.mjs`), and a launch that overruns or exits
non-zero is a failed check of its scenario, its session preserved, the run ended through `scripts/lib/run-ending.mjs`,
which writes `results.json` and the manifest whatever ends it
(`docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`).

**A proxy in the path can also misbehave on purpose, which is the `faults` scenario.** A rule names a kind
(`status`, `cut`, `stall`, `malformed`), the path it watches and the **1-based index** of the call it fires at,
and fires once — the index is the point, because "the second completion" is a reproduction and "some completion"
is a coincidence. `faults-ladder` answers 429 then 500 without contacting the endpoint (so the injected calls
spend nothing) and asks whether the ladder waits, falls back and still finishes; `faults-stall` stops the bytes
mid-answer with the socket open and asks the **eighty-second defect's** question, which is whether a model
timeout is still collapsed into the flag a user's stop sets and reported as `user_cancelled`. This makes the
first of the two frictions the `frictions` scenario records as uncoverable inducible on demand. **Neither
product check has yet run against a real endpoint**: the mechanism is unit-tested against a loopback upstream,
what the checks claim about the product is unverified, and that first execution owes its row in
`first-executions.md`. *Both ran live on 2026-09-22 (the row is there). The ladder half is corrected 2026-09-29 (R-067, OQ-110): the
429 and the 500 are retried by the model client's dispatch layer (REQ-CONFIG-086's `num_retries`, default 5) before the
ladder sees them, which the owner ruled is the specification's order; the scenario shows the run surviving the refusals,
not the ladder waiting or falling back. Its check once passed on the call count alone; since 2026-09-29 it reads, for each
injected refusal, the session log's dispatch-layer line or the ladder's own issue, and names which layer it was
(`docs/defects/fixed/two-live-run-checks-cannot-see-what-they-claim.md`).*

**Two scenarios enter the gap this page names below** — "short tasks against an unmetered endpoint, so no
generation near the model timeout, no multi-line command, and no re-spawn", where all seven of one session's
defects lived. `terminal` issues **the commands the record names verbatim** (six when it was written; since
2026-09-29 seven on Windows and eight elsewhere, nine elsewhere since 2026-09-30, and eight on Windows and ten elsewhere since 2026-10-01, then eleven elsewhere, then ten on Windows and thirteen elsewhere, fourteen elsewhere since 2026-10-06): the multi-line here-string that lost
its newlines in the PTY, forty long lines for the concatenation the sixty runs missed and the VT strip the
agent's capture was left out of, off Windows a here-document of about 4.7 KB that is longer than the PTY's input line, which
once never reached the shell and read as a soft pause with `>` (live-run M1, 2026-10-06), off Windows an `exec bash` that replaced the session's shell and read as a soft
pause, with every later call left in bash (acceptance A9, OQ-144, 2026-09-30), then a bash-ism `/bin/sh` cannot expand (`${PIPESTATUS[0]}`), which lost
its end marker live and read as a soft pause (live-run L1, 2026-09-29), then an `exit 3` that ends the session's shell,
which read as a soft pause with the next call's respawn unreported (OQ-144's sibling case, 2026-10-01), a wedge supplying no `timeout` for the
`hardMs` that was read nowhere, one empty poll of that wedge, whose answer once said thirty seconds had passed
after under a millisecond (live-run L2, 2026-09-29), then `C-c` with `is_input` and one poll after it, which read the
interrupted wedge as still running until the agent's next command (OQ-147, 2026-10-01), then a second wedge and a
command issued while it is soft-paused, which waited behind it and said only its own exit (OQ-164, 2026-10-01), an exit-0
output carrying `FAILED`, a `git diff` exiting 1 for ESC-41's carve-out, and a read-only pipeline through a pipe.
The shapes, their patterns and the two readers live in `apps/desktop/scripts/lib/terminal-shapes.mjs` and are
pinned by `terminal-shapes.test.ts` **because that is the part of the scenario that can be wrong silently**: a
pattern that stopped matching its own command would turn every check in it into "the model never attempted it",
which is a NOTE, a green run, and a question nobody is told has stopped being asked. The test pins the round
trip in both directions — every shape matches its own command, no shape matches another's — measured by
breaking one pattern and confirming the red, then restoring it. Writing it found one defect in the reader as
first drafted: `diagnosticOf` took the FIRST `[terminal_diagnostic]` block, and an observation whose output
quotes an earlier one would have had a previous call's exit code read as its own; it takes the last now.
Since fin40 (2026-10-13) each shape is read from the first send that reached execution (`shapeSends`, `reachedShape`): the
confirming run at `0bc3eee` read `long-output` from a send REQ-ORCH-029's todo gate had refused unrun and failed "all 40
lines" on 0 markers while the same command, sent again after the list, had returned all 40; a gate-refused send is now
counted beside its shape, a shape whose every send was refused is a NOTE, and a permission block is still read
(`docs/defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md`).
Since fin41 (2026-10-13) "refused unrun" is every refusal `gate.ts` settles before a call runs (`GATE_REFUSALS`: the todo
gate, the schema check, the plan gate's hold, another agent's write scope and a `pre_tool` hook's block), and an
`interrupted` call counts as unreached only when it settled `blocked` — an approval withdrawn before it ran
(`docs/defects/fixed/the-live-runs-terminal-reader-counts-a-send-the-gate-refused-for-another-reason-as-reached.md`).
It reads `tool_calls` — `args.command` and the `[terminal_diagnostic]` block — never the model's prose, and the
shapes whose behaviour is faithful to a requirement (`REQ-TOOLS-113`'s marker, `REQ-TOOLS-036/038`'s deny) are
**NOTEs measuring their cost** rather than checks accusing the product; so is a shape the model never issued.
That split is deliberate: a scenario that reports a faithful behaviour as a fault teaches its reader to ignore
it, which is what the board scenario did twice. `duress` is the length, **opt-in under `--only=duress`** because
a thirty-minute scenario inside a smoke test is a smoke test nobody runs; it asserts **coherence rather than
correctness** — the autopsy's own two booleans, a failed child with an empty `final_response` (the eighty-second
defect's shape at the child level), a child that ran commands and reported none (the eighty-eighth), and the
`compressions` aggregate against the `context_compressed` timeline entries (the eighty-seventh) — and it
**reports whether it was long at all**, including when it stopped at `--max-iterations` and was bounded by the
harness rather than by the work. `--duress-fixture` replaces the workspace for the whole run and is refused
alongside any other scenario, because one sandbox holds one store and every other prompt names `todo-app`'s
files. *Corrected 2026-09-29 (live-run findings H-a to H-d, H-h; R-067), with the reading above kept as it was written:
"a failed child with an empty `final_response`" was the wrong observable. REQ-ORCH-110 leaves that field empty for every
child cut off mid-work, and the first execution flagged exactly such a child, `d`, whose `last_response`, `cut_off` and
timeout error said what it did. A failed child is now silent only when none of the four speaks. *(Corrected
2026-09-30, the verifier's fix round 1: of the three that can speak — `final_response`, `last_response`, `cut_off` — since an
error entry alone is on every failed child's report, and counting it passed the eighty-second defect's own shape.)* Two other readings
were also wrong. The commands question compared a call's canonical agent name with a child's given name, so it was
never asked. The autopsy's null-summary boolean answered `false`, and passed, for a session that never stopped; it
answers `unasked` now. The readings live in `scripts/lib/duress-checks.mjs`, pinned by `duress-checks.test.ts`, and the
deadline check now says where the time went.*

**`failed-word` stopped being a NOTE on 2026-09-27 (`PD-TOOLS-003`), and the paragraph above is kept as it was
written.** The shape printed `FAILED` in capitals, and its warning was faithful to `REQ-TOOLS-113`'s marker. The
directive matches that marker in capitals only, which put the shape on the other side of the rule from the
record it claimed to replay. It now prints the record's own lower-case docker line,
`failed to connect to the docker API`, and the scenario checks that the line reached the output at exit 0, was not
`suspicious_success` and carried no failure-marker warning — a regression guard, as `diff-exit-1` is for ESC-41.
That positive half reads the output through a new `outputOf`, because the diagnostic block repeats the command
and a pattern taken from the command matches the whole result whether or not anything was printed. The deny is
the one faithful behaviour still measured as a NOTE. **The guard has not run against a real endpoint**; the next
live run of `terminal` is its first.
