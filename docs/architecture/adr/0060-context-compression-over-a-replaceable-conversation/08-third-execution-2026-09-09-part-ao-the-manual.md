# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — Third execution — 2026-09-09 (Part AO): the manual arm, decision 1's second reader

Part 8 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## Third execution — 2026-09-09 (Part AO): the manual arm, decision 1's second reader

*Recorded under GD-10; the proof is `pnpm chat-controls-proof`. Defects are numbered `AO-n`; the manager assigns the
ordinals at merge.*

**What was asked.** §10's manual compression, which consequence 4 left unbuilt and decision 1 was written to make
buildable: `forceCompression` reaching every live conversation concurrently (REQ-MONITOR-092), unconditionally
(REQ-CHAT-081, REQ-MONITOR-096), settling once (REQ-CHAT-080), every failure listed per agent (REQ-MONITOR-094); the run
header's control (REQ-CHAT-078..080), the palette entry (REQ-MONITOR-097) and `/compress`.

**Built.** `run/conversations.ts` — the **`ConversationRegistry`**: a turn registers a handle (the agent's name and one
operation, compress now through this agent's own `CompressionRunner`) on entry to `runTurn` and unregisters on every
exit, so a handle never outlives its turn; `Run.forceCompression()` compresses every registered handle at once and
reports `{compressed, unchanged, failed[]}`; `CompressionRunner.manual` is the same `compress()` call as the automatic
pass, but neither `due()` nor the futility latch is consulted, and the `context_compressed` entry carries
`trigger: manual` with **no threshold field** — a figure that was never read would be a false record, and the reason
line says so instead. The runner gained a single-flight guard: a manual pass landing while the automatic trigger's pass
runs, or the reverse, JOINS it rather than doubling it, and `due()` answers false meanwhile — two passes over one
conversation would each slice the array they were given and the second `replace` would discard the first's work.
`Sessions.controlAsync` is the one asynchronous control entry, awaited by the run host; the completion toast and the
persistent "Context compression incomplete" notice are raised by the run host, which holds the figures. Decision 9's
live field became a map, because several agents compress at once and one name could not say so. Engine tests cover the
registry's concurrency and per-agent failure, the pass through `Sessions` against a real store with a held tool
dispatch, both refusals, and the transcript clear on both of REQ-CHAT-084's routes.

**Measured** (`pnpm chat-controls-proof`, four launches a run; **three green runs on the final build**, the figures
identical. Stated plainly rather than smoothed: they were not three *in a row*. Two runs in between died mid-launch —
`compress-partial exited 4294967295`, and `EPERM` on the proof's own output-directory wipe — because a second process
outside this agent's control ran the same proof inside this worktree at the same time; the handoff's §10 records it, and
the orphaned Electron processes it left had to be cleared before a run could start. The record before the repair was two
consecutive runs, which was not enough, and is how AO-2 below was found):
with a root in a `wait` model call after delegating and its child in a `wait` after one `read`, **one press compressed
both** — `orchestrator` 7 → 3 messages and `child-a` 3 → 2 in every one of the three runs, 4–8 ms each on the scripted
compressor (4/5/5 ms for the root and 5/5/8 ms for the child — the only figures that move), the two compressor
calls 12 ms after the click and the control's answer 23 ms after it; "Compressing…" with the control disabled was
observed by a MutationObserver (the relabel lasts the pass, ~20 ms here); "Compressed context for 2 active agent(s)."
was toasted; neither entry carries a threshold field. With the scripted compressor failing on the child's slice alone
(`fail-if:CHILD-SLICE-MARKER` matches the README the child read and the root never did), `orchestrator` compressed,
`child-a` did not, and the persistent notice read "1 of 2 active agent context(s) compressed; 1 failed." with
`child-a: the compressing pass failed: scripted compressor failure (HTTP 500)` in its copyable detail block, recorded
in the session's timeline (REQ-NOTIFY-268). Idle: the header control disabled with "Start or continue a run to enable
run controls.", the palette's entry a toast "No run is active.", `/compress` "Command not run" through the shell's one
slot.

**Found — AO-1, in this part's own renderer code.** The catalogue's registry is rebuilt by its memo several times
while a window settles (the stash count, the reachable set and the command context each arrive once), and the
prompt-roots effect read the disk on every rebuild: five `prompts.roots.read` round trips in the first 200 ms of the
first launch, each an IPC to the workspace service and three directory listings. A rebuild re-applies the last result
to the new registry now; the disk is read on composer focus, on a configuration change, and once when nothing is
cached. The reason is kept in `slash/controls.tsx` beside the fix.

**Found — AO-2, in AO-1's own fix and in the proof that read it.** The prompt-file commands are registered on the
catalogue's registry from an effect, and the popup's list is a `useMemo` of the composer's text and that registry
(`WorkspaceView.tsx`, a line this part may not edit) — so a registration landing after that list was built shows only at
the next keystroke. Two things followed. A read still in flight when the registry was rebuilt was applied through the
closure that had started it, so the answer landed on the registry the composer had already replaced and the live one kept
nothing until something else rebuilt it; the newest applier is held in a ref now and every resolution calls that one, and
the reader's last answer is kept beside the reader in `slash/prompts.ts`, so a rebuilt registrar takes it in the same tick
instead of reading three directories again. And the proof typed `/` at a fixed millisecond, which measured the machine: it
went red in one launch of three with the workspace service's answer already in that launch's log (the popup listed the 28
built-ins and palette mirrors and neither `greet-me` nor `prompts:greet-me`). The registrar now publishes what it has put
on the registry the composer currently holds — a hidden `[data-testid="prompt-commands"]` carrying the count and whether
the roots have been read at all — and the proof waits for that signal before it types, then asserts it beside the popup, so
a red there is the product's list and never the schedule's luck.

**That repair was measured, was not enough, and the reason it was wrong is kept here beside its replacement.** It treated
the registrar's registration as what the popup reads. The popup reads a `useMemo` of the composer's text and the
registry, so a registry REBUILT after a registration is a registry without the prompt commands until an effect refills
it — and the list the popup shows is the one built at that moment. The run measured straight after that repair was red
with the new signal reading `{count: 2, roots: 'read', waitedMs: 0}`: the roots read, both names registered, the typer
not waiting at all, and neither of them in a popup of 28. That is the verifier's one-in-three red, this time with the
evidence that says why rather than a guess about the machine. **The fix belongs where the registry is made.** `buildCatalogue` now registers the
cached answer as it builds, last, after the built-ins and the palette mirrors, so every registry carries the prompt
commands from the moment it exists and a rebuild loses nothing; and a name held by a `kind: 'prompt'` command is
replaceable by this module alone, so the build-time registration and the registrar's re-application compose instead of
each skipping the other's work as a holder it must respect. One banner block and one import in `slash/catalogue.ts`,
declared in the handoff as a ruling request.

**Found later — AO-3, in AO-1's own repair, by a launch log rather than by the proof.** AO-1's paragraph above says the
disk is read "once when nothing is cached". It was read twice: two effects start a read as a window settles — the
registrar's, when nothing is cached, and the configuration key's, which always reloads — and neither can see the other,
so before the first answer there is nothing for the second to find. The repair kept the reader's last ANSWER and not the
read still in flight, which is the whole of the gap. A launch on 2026-09-16 shows two `prompts.roots.read` round trips in
the same millisecond and two more within 16 ms (`/tmp/rotaris-launch.log`, lines 20–23), each an IPC and three directory
listings. `readPromptRoots` now holds the in-flight read beside the cached answer, so a second caller in the same window
joins it; the handle is cleared when the read settles, so focus and configuration changes still read afresh, and binding a
reader drops both. The correction is written here rather than in place, and AO-1's sentence stands as it was measured.
The skill catalog's reader, modelled on this one (ADR-0063 §5), had the gap verbatim and with three starters rather than
two, so it joins reads now as well. The note is
`docs/defects/fixed/the-prompt-roots-are-read-twice-as-a-window-settles.md`; the coalescing itself has a regression test
on both readers and has not yet been seen in a launch of the built app.

**Readings recorded.**

- The scripted compressor answers in ~20 ms, so REQ-CHAT-079's "Compressing…" is invisible to any timed probe; the
  proof arms a MutationObserver on the control before the click and reads what it recorded. On a real model the relabel
  lasts seconds.
- Main's `session.control` relay bounded every control at 10 s; a concurrent pass is bounded by
  `compressor.timeout_seconds` (120 s by default, decision 4), so the reply would have timed out while the pass ran
  on and the header would have reported a failure the run host never had. The relay bounds `forceCompression` at 130 s
  now — one line in `main/index.ts` outside this part's permitted set, raised in the handoff as a ruling request. A
  larger configured bound still outlives it; stated at the site, not hidden.
- On this shared machine a scripted step took 2 s where an idle one takes 0.5 s, and a fixed click found the child with
  one completed step and one preserved turn — nothing between its request and its tail, reported **unchanged**.
  REQ-MONITOR-092's "however empty a context is" is honoured by that: the pass ran, and there was nothing to remove.
  The proof runs with `preserve_recent_turns: 0` (consequence 5's accepted value) so one step suffices, and longer
  waits; the schedule tolerates about five times the idle step time.
- The proof's `controls` launch no longer types `/` on the clock. Everything after that step moved by 2900 ms to leave
  the typer the whole wait it can take; the schedule was widened, never reordered (the rule wave 1 left for wave 2).
- `REQ-MONITOR-091`'s refusal (`no_active_conversations`) is answered when the registry is empty — a run between
  turns, or one whose configuration offers no compressor. The proof does not reach it: a scripted run always holds a
  live turn while it runs. Stated.
- REQ-CHAT-084's "Transcript is busy and could not be cleared." has no producer under the store's synchronous
  transactions: a clear cannot interleave with another write. The toast and the refusal code exist; the condition is
  stated unreachable in `sessions.ts`.

**Not exercised.** A manual pass against a real provider (every figure above is the scripted client's); the single-flight
join with the automatic trigger's pass in flight (implemented, the guard read, not measured — the automatic trigger is
off in every proof launch); a pass during a parent resume; a run configured without a compressor answering
`no_active_conversations`.
