# The first release — Windows only, skills and workspace-context injection — 2. Must-have: skills

Part 2 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

## 2. Must-have: skills

**Built and proven.** The following exist and are measured by `pnpm skills-proof`:

- portable-skill discovery, and the run host's catalog;
- skills as ordered context units;
- the Settings Skills tab;
- one composer command per user-invocable skill, using REQ-SHELL-056's catalogue normal form and `-2` suffixing;
- `/skill <path>`.

**2.1 The three rulings.** *Ruled 2026-09-27 ([R-052](../../product/requests.md#r-052)), each as recommended below.
`REQ-CHAT-034`, `REQ-CHAT-162` and `REQ-CONFIG-343` are amended, and `owner-decisions.md` holds the rulings.*
Each changed what §2.2 builds, so they came before it.

- **ESC-37: what invoking a skill delivers.** Either a force-loaded block for the session (domain 13, which is
  what is built) or a payload attached to one prompt (domain 03). This ruling decides whether the `/skills`
  listing has REQ-CHAT-162's "already in context" column: REQ-WORKSPACE-067 forbids that indicator by name.
  *Recommended: domain 13 stands.* The alternative needs a per-prompt attachment path the engine does not have.
- **ESC-38: the Skills table's columns.** Either five (REQ-CONFIG-343) or seven (REQ-WORKSPACE-067 with the
  invocation selector; what is built). *Recommended: seven, with REQ-CONFIG-343's count amended.*
- **ESC-39: a taken command name.** Either skipped (REQ-CHAT-034) or suffixed (REQ-SHELL-056; what is built).
  *Recommended: suffixed, with REQ-CHAT-034's clause amended to cite REQ-SHELL-056.*

Each recommendation is what is built, so ruling all three as recommended costs an amendment round and no code.
OQ-58 and OQ-59 ~~are also open~~ were raised against the same feature, and both were ruled 2026-10-06 ([R-071](../../product/requests.md#r-071)): OQ-58
confirmed as built, OQ-59 by the requirement's amendment to the file chooser as built (`PD-WORKSPACE-003`). Neither blocks the release, and both are named here so
that the release notes do not have to find them later.

**2.2 `/skills`, REQ-CHAT-162's listing.**

*What it must do.* The listing is one saved system row in the transcript: normalized name, scope, triggers,
description clipped to 120 characters with an ellipsis, the `SKILL.md` path, and a count. It carries the
no in-context flag: ESC-37 ruled for domain 13, and the amended REQ-CHAT-162 drops that column.

*Why it is not built.* A saved row is written through the session writer. The session writer belongs to the
run host, and no renderer command reaches it today.

*What building it needs.* Following the seam order in `views/04-seams.md`:

1. a `skills.list` command that the composer sends to the run host;
2. a system-row kind that the transcript's one row renderer draws;
3. the session writer appending that row, so it is saved with the session and exported with it.

The skills catalog is already the run host's, so no new owner of state appears. The command replaces
`SKILLS_LISTING_NOT_BUILT` where it would register. `skills-proof` gains one scenario: `/skills` in a session,
the row drawn, the session reopened, and the row still there.

*First execution — 2026-09-27. Reported in place, with one row in `first-executions.md`.* **The three-step path
held as written, the reason it was not built held, and building it found one defect and one open question.**

- *The path.* `skills.list` renderer → main (`main/commands/skills.ts`, which names the followed session) → run
  host (`dispatch.ts` → `run-host/skills.ts`'s `writeSkillListing`) → the session's own writer's `appendRow`. "Only
  the run host can do it" was exactly right: the writer that saves the row, records its `transcript.row` event and
  feeds the projection owner is the one every other row of the session goes through, so *saved with the session*,
  *drawn in every window following it* and *exported with it* (the trajectory reads those events) came from that
  writer rather than from new code. A live run's writer and a loaded idle session's are one object, so the row lands
  in order whether or not a run is going.
- *"A system-row kind".* Read as a kind **of** system row, not a new persisted role: REQ-CHAT-047 maps the role
  `system` to the system-notice category and any other role to a message, and REQ-CHAT-046 closes the categories
  at twelve and gives a row its text and no field shaped like a listing. So the row is `system`, its body IS the
  listing, and the one row renderer draws a system row whose text has the listing's shape as the listing. The text
  is fixed once, in `contracts/skills.ts` — one writer, one reader, a round-trip test — and a body the reader does
  not accept is drawn as the plain notice it also is. **No store column and no migration.** No in-context column,
  per ESC-37. The description is clipped as REQ-CHAT-068's task text already is: at most 120 characters, the last
  the ellipsis where the text was cut.
- *The defect.* `/skills` is the second fixed catalogue command with the `skill` kind badge, and the registrar read
  any `skill`-kind holder as its own earlier work — so a skill named `skill` took `/skill <path>`'s name or lost its
  own, depending on which React effect ran first (REQ-SHELL-056, both halves). Repaired with it:
  [`a-skill-named-skill-takes-the-skill-command.md`](../../defects/fixed/a-skill-named-skill-takes-the-skill-command.md).
- *The question, since ruled.* [OQ-67](../open-questions.md) (ruled 2026-10-06 as built, [R-071](../../product/requests.md#r-071)): REQ-CHAT-162 wants the listing reachable from the settings
  surface, and REQ-WORKSPACE-067 fixes that tab's header actions at two, so no action was added — the tab's table
  already shows every fact the listing carries; and `/skills` from a window following no session has no transcript
  to save a row into, so it is refused with a stated reason rather than creating a session.
- *The evidence.* `skills-proof` launch 1c types `/skills` into a scripted session and reads one system row listing
  the six discovered skills in the table's order, with `ws-skill`'s scope, triggers, description and path; 1d
  reopens that session from the browser in a new launch and reads the same row back, with no second listing
  logged. Both sit before the policy launch, which fails on Linux before and after this change at "the baseline
  over a global override was not written explicitly"; on Linux the two new launches are therefore the last that
  pass, and the cause is recorded as
  [`skills-proof-writes-its-global-policy-where-only-windows-reads-it.md`](../../defects/fixed/skills-proof-writes-its-global-policy-where-only-windows-reads-it.md).
  A temporary copy of the proof with that one path spelled for Linux passed all 10 checks over 9 launches with
  `/skills` built, so the later launches are unaffected by it; the copy was not committed.
  `rows-proof` passes unchanged. `slash-proof` stops at its first catalogue assertion with and without this change —
  it expects every built-in to carry the `action` badge, which `/skill` has not since ADR-0063 — recorded as
  [`slash-proof-expects-every-built-in-to-carry-the-action-badge.md`](../../defects/fixed/slash-proof-expects-every-built-in-to-carry-the-action-badge.md).
- *Gate round 1 of the same change found two more defects, both repaired before it merged.* (1) Drawing the listing
  as its own block took the system row off `PlainText`, so a bare URL in a skill's description stopped being a link
  (REQ-CHAT-076). Every field is now drawn through `PlainText`; `rows.test.ts` renders a listing and reads the link,
  and launch 1c gives `home-skill` a description ending in a URL and reads the link drawn for it, the full stop
  outside the target. `skills-proof` passes to the same Linux-only policy check as before, and `rows-proof` passes.
  (2) A prompt file named `skills.md` took `/skills` back from the listing on the first prompt re-read after mount
  (REQ-CHAT-160, REQ-CHAT-162): the collision repaired above held for the skill registrar only —
  [`a-prompt-file-named-skills-takes-the-skills-command.md`](../../defects/fixed/a-prompt-file-named-skills-takes-the-skills-command.md).
- *Readings stated here rather than left in code.* Search matches the row's text (REQ-CHAT-074), and the text's
  punctuation between fields (`- `, the brackets round the scope, ` triggers: `) is not drawn, so a match falling
  only there selects the row and paints nothing in it. `/skills` is sent from `renderer/main.tsx`'s slash host
  beside `/skill`'s `loadSkillFile`, not from `renderer/session-actions.ts`, where `views/04-seams.md` §1 step 5
  puts a gesture against the followed session: main, not the renderer, names the session here, as it does for
  `skills.forceLoad` and `skills.loadFile` (ADR-0063). The listing's other readings — which skills it lists, when
  its refusal is stated, how the 120 is counted, the badge, and the improvement analyst reading the row — are
  OQ-67 (c) to (g).

**2.3 A skills live run.** One `pnpm live-run` scenario invokes a skill command and asserts that the model's
first turn shows the skill's body was in its context. It spends the owner's money, so it runs only when the
owner asks (AGENTS.md).
