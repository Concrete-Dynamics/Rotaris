# Open questions — Specification questions (6 of 27)

Part 11 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-53 – OQ-62.

**OQ-53 — Which event reports a compression, given a closed catalogue?** *(No ADR beyond ADR-0060, which ships an
interim; raised against `REQ-CONFIG-135` by context compression's first execution, Part AH, 2026-09-08. Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** as recommended — "the session's event stream" is read as the session's timeline, so the `context_compressed` timeline entry is the event that reports the compression and no event joins REQ-EVENTS-041's catalogue; its name is a word of domain 01's vocabulary under OQ-157's ruling ([`PD-ORCH-014`](../../product/directives/pd-orch-014.md#pd-orch-014), with its back-pointer at REQ-CONFIG-135).

`REQ-CONFIG-135` says that whenever a compression trigger is resolved, the four inputs that produced it and the
resulting token number are surfaced "in exactly two places", the first being: "emitted on the session's event
stream as part of **the event that reports the compression**, carrying the four inputs and the resulting token
number as **separate machine-readable fields** so a consumer never has to parse a sentence". The second is the
transcript entry's reason line, rendered from those fields, and the same figures go to the per-session debug log.

**There is no such event.** `REQ-EVENTS-041` closes the published catalogue at exactly 23 types and none of them
reports a compression; `REQ-EVENTS-017` requires every event to carry an `event` value drawn from that catalogue,
so no new kind may be added without amending it. The requirement names a venue the product has no way to reach.

Two readings, and they differ in what a consumer of the recorded stream sees. Either **"the session's event
stream" means the timeline**, and the interim below already satisfies the requirement — this is the reading Part Q
took for `model_exhausted` and `model_override`, which are recorded facts the closed catalogue also has no kind
for. Or **`REQ-EVENTS-041` is to be amended with a compression event**, in which case the catalogue's count and
`REQ-EVENTS-017`'s payload table both change and an external consumer gains a type it must decode.

Shipped meanwhile (ADR-0060 decision 7): a `context_compressed` **timeline entry** carrying `threshold_percentage`,
`capacity`, `advertised_input_limit`, `default_threshold` and `trigger_tokens` as separate metadata fields beside
`trigger`, `count_source`, `counted_tokens`, `before_tokens`, `after_tokens`, `before_messages`, `after_messages`
and `latency_ms`; one `system` transcript row rendered from those fields; and the log line. What the requirement
asks to be carried is carried, in a venue it did not name. If the second reading is ruled, the entry stays and an
event joins it — the interim is not repaired quietly. *(Added 2026-10-01: `context_compressed` is also a name
REQ-ORCH-139's vocabulary does not have; it is held, with every other such name, by OQ-157.)*

**OQ-54 — The user-terminal audit entry's `decision` and `source` fall outside the closed permission vocabularies.** *(spec 12 Data & Formats, "Permission audit entries for user terminal actions"; REQ-TOOLS-012/028. Raised by the terminal stream's first execution, Part AL, 2026-09-09. Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** as recommended — the vocabularies gain the two members: `user-input` beside REQ-TOOLS-012's three decisions and `user` as REQ-TOOLS-028's thirteenth source, carried only by the audit entry of a user's own terminal action and never yielded by a policy resolution ([`PD-TOOLS-011`](../../product/directives/pd-tools-011.md#pd-tools-011), narrowing both; `AUDIT_DECISIONS` and `AUDIT_DECISION_SOURCES` in `packages/contracts/src/tools.ts`).

REQ-SHELL-107 says a user's terminal action is written to the permission audit with `decision: user-input`, `source: user`. `DECISIONS` is the closed set `{allow, ask, deny}` (REQ-TOOLS-012) and `DECISION_SOURCES` the closed twelve (REQ-TOOLS-028); neither holds `user-input` or `user`. Part AL writes the entry as spec 12 words it (the writer takes the strings), so a decision-log reader that enumerates the closed vocabularies will not recognise it. Whether spec 12 mints two new members, or the audit entry is a different record from a permission decision, is the owner's call. Recorded, written as spec 12 says, not resolved.

**OQ-55 — Decision closed, 2026-09-11.** `REQ-CONFIG-116` gives the key a range of **1–64**. The figure is
`REQ-TRACE-481`'s ceiling taken with its reason — an input needs some upper bound, and a figure no machine could
actually service is of no use to anyone — rather than a fresh invention. A value outside the range is rejected at
load and on assignment (`REQ-CONFIG-111`), never clamped; `REQ-TOOLS-108` keeps the effective limit and the message
on reaching it. With the ceiling in place the staleness law Part T″ measured has both of its terms: at the maximum,
`(20 agents + 64) × windows` stays under the thousand-stream crossing for any window count a user can produce, so
the worst case a **configuration** can reach is the flat regime bounded by the drain's own one-second period rather
than the `streams × windows ÷ 1,000` seconds that applies above it. **ADR-0021's "The cap is load-bearing"
obligation 2 is discharged by this**, and says so in place.

**OQ-56 — The adopted `--rt-text-disabled` misses `REQ-SHELL-145`'s 3:1 floor on every surface but the page ground.** *(`docs/design/README.md` §5 item 1, which named this token as the one specifically at risk; REQ-SHELL-145, REQ-SHELL-160 (a). Raised 2026-09-12, when `pnpm theme-proof` settled that acceptance item from rendered pixels for the first time.)*

`docs/design/system/tokens/colors.css` sets `--rt-text-disabled` to `oklch(52% 0 0)` and `packages/contracts/src/theme/themes.ts`
transcribes it without drift, which a test pins by name. Against the default palette's own surfaces that value clears
**3.22:1 on `--rt-bg`, 3.07:1 on `--rt-chrome`, 2.90:1 on `--rt-surface`, 2.56:1 on `--rt-surface-2` and 2.48:1 on
`--rt-hover`** — and REQ-SHELL-145 requires 3:1 **on every background the token is actually painted on**. The rendered
proof measures **2.898:1** on a card for "Cancel selection" (`disabled`) and for Mission's "Pause" (`aria-disabled`,
which wears the same colour) at 100 %, 125 %, 150 % and 200 %; `nocturne` (60%) and `high-contrast` (62%) clear every
surface and are not affected. **At 175 % the same pair measures 3.030:1 and passes** — one scale's device-pixel
rounding is the entire distance to the floor, which is the strongest argument that the value was never measured rather
than deliberately chosen. The matrix was run twice and both passes name the same strings, the same ratio and the same
four scale points. The static check in `static-contrast.ts` passed because it tests the ground alone, which is
**REQ-SHELL-160 (a)'s own sentence** — "a token pair that computes correctly but paints over a different surface fails".

**Two resolutions, and both belong to the owner.** Either the adopted token rises — `oklch(58% 0 0)` clears 3.18:1 at
the dimmest surface and stays at 4.14:1 on the ground, comfortably under half the enabled 14.86:1 the same requirement
caps it by, and leaves the default still dimmer than the other two themes — or REQ-SHELL-145's floor is amended to name
the ground it is measured against. **An agent may not choose between them**: the first changes approved design material
and the second changes an approved requirement. Until it is answered, `pnpm theme-proof`'s `contrast` section is red on
`rotaris-dim` at four of the five scales **and on nothing else**, the two tests that pin the shortfall keep it from being
lost, and the narrow static check stays narrow so the conflict cannot be mistaken for an ordinary test failure.

**RULED 2026-09-18: the adopted token rises.** The owner chose the first resolution — `--rt-text-disabled`
to `oklch(58% 0 0)` in the adopted material, transcribed without drift, with `theme-proof`'s `contrast`
section as the measure that closes this question.

**OQ-57 — Decision closed, 2026-09-13.** The owner ruled by direction — *"i want you to fix ALL of them"* — so **the product draws a checkbox**, and it is assembled from parts the language already declares rather than invented as a new idiom: `.input`'s hairline and `--rt-boundary-strong`, `--rt-radius-sm`, `--rt-accent` for the checked ground, `--rt-accent-100` for the tick, and the one focus ring every control shares. It is `Checkbox` in `packages/ui/src/design-system/forms.tsx`, the twenty-eighth brief; the native `input` is the control itself under `appearance: none`, so a pointer, a screen reader and the focus ring all meet one element, and the label sits beside the box on one line. Seven call sites moved onto it. The `.check__box` span the first draft drew beside a hidden 1 px input is gone with it, because a hidden input takes two literals the baseline would have had to carry. **The question below is kept as it was asked**, because the reason it was a question — that an agent may not mint a member of the design language — is the part worth keeping, and the answer is the owner's, not the builder's. Recorded in `docs/product/requests.md` as R-008.

**OQ-57 — The product draws checkboxes and the adopted design language has none.** *(`docs/design/README.md` §2; raised 2026-09-12 by the first independent visual-critic pass, finding UIR-004.)*

`docs/design/` contains **no checkbox** — not in the token set, not in §1's component notes, not in the mockup. The
product needs them all the same: the start-session dialog's "Run in an isolated Git worktree", the Requirements board's
"Blocked column", and the worktree-cleanup dialog's "Don't ask again" (`REQ-GIT-135`). They are drawn today as the
platform's native control, and it shows — the critic measured the Requirements checkbox at **13 × 24 with
`border-radius: 0px`**, below every radius the system declares, and in the start-session dialog the box sits at one end
of its row with the words it governs at the other. The shared layer has no `Checkbox` because the material it is drawn
from has none, and `tools/check-ui-language.mjs` cannot catch it: the callers pass `type="checkbox"` to the shared
`Input`, so the guard sees a component, not a raw control.

**This is a gap in the adopted material, not a violation of it, and the difference decides who answers.** There is no
approved drawing to match and no requirement that states one, so an agent drawing a checkbox here would be inventing a
member of the design language — which `CLAUDE.md` forbids in exactly these words. Either the design material gains a
checkbox (and the shared layer gains the component that transcribes it, with the native input kept underneath for its
semantics), or the product states that these three choices are drawn as `ToggleSwitch`, which the language **does**
define. The layout half is not waiting on the answer and can be repaired under either: a control and its label belong on
one line, adjacent.

**OQ-58 — "the current session" has no referent while a workspace has several.** *(REQ-WORKSPACE-057, REQ-WORKSPACE-058, REQ-WORKSPACE-073 against `PD-WORKSPACE-001`; raised 2026-09-14 while planning portable-skill discovery, ADR-0063.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: skill session state is per session, keyed by session id, with a pending bucket per workspace root that the next session created for it adopts; a second session's creation clears the root's catalog cache and leaves every other live session's forced skills untouched.

Three requirements scope skill state to "the current session": a manually loaded skill "applies to the
current session only" (057), the catalog cache is "cleared on every session creation" (058), and an
invoked skill's load mode becomes `on` "for the current session only" and is discarded by session
creation (073). Each was written when a workspace had one. `PD-WORKSPACE-001` has since made a second
session on one workspace an offered route — it is the directive's whole subject — and `REQ-STARTUP-162`
makes several windows ordinary. Two sessions on one workspace can therefore be live at once, and none
of the three requirements says whether a skill forced in one is forced in the other, or whether the
*second* session's creation clears a cache the *first* still depends on.

The gestures that set the state also have no session to name at the moment they happen. A user loads a
skill file or types its command from a window that may be showing no session at all, and the sentence
"applies to the current session" then has no referent rather than an ambiguous one.

**What the build proceeds under.** State is keyed by **session id**, with one `pending:<root>` bucket
per workspace root that the next session created for that root adopts. A gesture with no session
follows the pending bucket; a gesture with one is that session's alone. Session creation clears the
**catalog cache** for its root (058's literal rule, which is about re-reading disk and is harmless when
shared) and adopts the pending bucket, leaving any other live session's forced set untouched. That is
the reading under which no requirement is violated for a single session and no session can silently
change another's context.

**What the ruling decides.** Whether skill session-state is per session (built) or per workspace, and
whether a second session's creation may clear the first's forced skills. The second reading is cheaper
to implement and worse to use: a colleague starting a second session in the same folder would silently
drop a skill out of the first session's agents mid-run. Stated here rather than chosen quietly.

**OQ-59 — REQ-WORKSPACE-151's chooser asks for a file **or** a directory, which no platform dialog offers.** *(REQ-WORKSPACE-151 with REQ-WORKSPACE-057 and REQ-SHELL-164; raised 2026-09-14 by the same planning pass.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the requirement is amended to the file chooser as built: a file chooser filtered to Markdown files (`.md`) on Windows and Linux, a file or a directory on macOS, a chosen file not named `SKILL.md` refused with REQ-WORKSPACE-057's message, and the directory form reachable through `/skill <path>`. [`PD-WORKSPACE-003`](../../product/directives/pd-workspace-003.md#pd-workspace-003) narrows REQ-WORKSPACE-151. The entry below says the build's chooser is "filtered to `SKILL.md`"; it never was — a host dialog filters by extension, and the build's filter is `.md` (`chooseSkillFile` in `apps/desktop/src/main/index.ts`), with the name check in `loadManualSkill` — and the ruling states what is built.

REQ-WORKSPACE-151 requires the "Load skill file…" action to open "the platform's own file chooser,
**restricted to selecting a `SKILL.md` file or a directory containing one**", applying REQ-WORKSPACE-057
— which accepts either. On Windows and Linux the host dialog cannot offer both: Electron's
`openFile` and `openDirectory` properties are mutually exclusive there and only macOS honours both at
once. The requirement asks for a restriction the platform does not have, so a product cannot be
answerable for it in REQ-SHELL-164's terms, which make the product answerable only for what it supplies
to the host.

**What the build proceeds under.** A **file** chooser filtered to `SKILL.md` on win32 and linux, both
properties on darwin. The file form is the one the requirement names first, it is what the mockup's
action implies, and a directory holding a `SKILL.md` is reachable by selecting that file. The
**directory** form of REQ-WORKSPACE-057 stays reachable through the typed `/skill <path>` command
(REQ-CHAT-162), so no capability the specification states is lost — only the dialog is narrower on two
of three platforms, and REQ-WORKSPACE-057's own directory-path error message stays reachable and is
still produced by the path resolver.

**What the ruling decides.** Whether REQ-WORKSPACE-151 is amended to name a file chooser (what is
built), or whether the action becomes two — "Load skill file…" and "Load skill folder…" — which is the
only way to offer both on every platform and adds a header action the requirement does not state.

**OQ-60 — What summary does a session carry when the run that owned it died without a teardown?** *(REQ-ORCH-082 with REQ-SESSION-060/062 and REQ-SESSION-093; raised 2026-09-16 while repairing the plan gate's cancel path. Ruled 2026-10-06.)*

`REQ-ORCH-082` is "the single definition of end-of-run summarization for the whole product", and all
five of its arms are selected by a **stop reason**. A run whose host process died recorded none: the
session is corrected by `Sessions.repairOne` under REQ-SESSION-060/062, which fixes exactly what that
correction writes — its type, severity, actor, message and metadata keys — and says nothing about the
three summary columns. So a recovered session reads back with `summary_text` NULL, and three readers
show the absence: the session record presents no summary at all, `summary.md` omits its Outcome block,
and the agents view's activity line is empty.

**What the build proceeds under.** Nothing: the repair path leaves the columns as it found them, which
is what it has always done. The sibling case that *is* decidable was fixed in the same pass — a cancel
taken at the plan gate comes to rest through `resolvePlanGate` rather than through the run's teardown,
and it records a stop reason of `user_cancelled`, so REQ-ORCH-082's first arm selects itself and is now
written there.

**What a ruling decides.** Whether REQ-ORCH-082 gains a sixth arm for a run that ended without ending
(and therefore whether an interruption is an outcome the product summarises at all), or whether
REQ-SESSION-062's correction entry is the whole of what a recovered session says about itself, in which
case the three NULL columns are correct and the readers should present that entry instead. The build
must not choose: a second place deciding a summary would contradict REQ-ORCH-082's own claim to be the
only one.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** REQ-ORCH-082 is kept as it is, and the three
readers present the recovery correction entry. No requirement names what those readers show for a recovered session, so the
ruling alone settles it and no directive is minted. The reading taken where the ruling leaves a detail open: a recovered
session is one whose status is `interrupted`, which only the repair writes (REQ-SESSION-073); while it is, its readers present
the latest `session.interrupted_recovered` entry — status `interrupted`, the entry's severity and message, as written — in
place of the columns, which are NULL for a first run that died and describe an earlier run otherwise; once a later run of the
session starts, the columns govern again. The repair rebuilds `summary.md`, which only a run's saves had rebuilt. The columns
are never written by the repair. **Built 2026-10-06 (fin20):** `sessionOutcomeOf` and `recoveryEntryOf`
(`packages/engine/src/run/summary.ts`), read by `toSessionRecord` and `renderSummary`; the rebuild in `Sessions.repairOne`;
cases in `run/summary.test.ts` and `session-actions.test.ts`; `pnpm sessions-proof`'s repair reads the repaired session's `summary.md`. Noticed while building it, and recorded open:
[`summary-md-carries-none-of-the-sections-its-requirement-lists.md`](../../defects/fixed/summary-md-carries-none-of-the-sections-its-requirement-lists.md),
repaired 2026-10-06 by fin22: `summary.md` carries REQ-SESSION-140's sections, the Outcome block standing after the stop
reason, before Metrics, and every rebuild (a run's, a continuation's, a repair's) reads the outcome through `summaryFactsOf`.

**OQ-61 — May an isolated run read the repository metadata of the worktree it is working in?** *(REQ-TOOLS-132 with REQ-GIT-019/021/022 and REQ-TOOLS-001/142; raised 2026-09-16 while repairing what an isolated plan-mode run hit.)*

An isolated run works in a linked worktree under `<workspace>/.rotaris/worktrees/<id>`, which
REQ-GIT-019 makes its effective root. A linked worktree's `.git` is a **file** holding a
`gitdir:` pointer, so HEAD, the refs and the worktree's own administrative directory all live
under `<workspace>/.git/`, above the fence. Every repository-metadata path the run reached for in
session `6696f6ed` — `.git/HEAD`, `.git/refs/heads/<branch>`, `<workspace>/.git/worktrees/<id>/HEAD`
and a bare `../` — was refused by REQ-TOOLS-129's boundary check, and the run recorded its own git
state as unverifiable.

The fence admits a read outside the root only from a **designated additional read-only root**
(REQ-TOOLS-132), and the corpus designates exactly two things: `runtime.additional_read_only_roots`
(REQ-CONFIG-468) and the catalogued skill directories (REQ-WORKSPACE-059). A repository's git
directory is not among them. Nor is there a read-only git tool to ask instead: REQ-TOOLS-001 and
REQ-TOOLS-142 declare `git_commit` and nothing else.

**What the build proceeds under.** Nothing changes: an isolated run still cannot read the metadata
of the worktree it occupies. What *was* repaired in this pass is only the answer it received —
`read_file .git/HEAD` replied `Its parent directory does not exist either.` about a `.git` that
exists and is a file, which sent the run looking for a path that was there all along.

**What a ruling decides.** Which of three shapes the capability takes, if it is wanted at all:
the run-host designates the base repository's git directory as an additional read-only root for an
isolated port, which needs no new tool but adds a read root the corpus does not name; or
REQ-TOOLS-001 gains a read-only git member, which is a new tool with its own contract and its own
permission facet; or the run is *told* its branch and base commit in the opening context it already
receives and never reads metadata at all, which is a message the specification does not have. The
build must not choose between them: each one adds product behaviour, and the third would put the
git state in a place no requirement says it appears.

**RULED 2026-09-18: REQ-TOOLS-001 gains a read-only git member.** The owner chose the second shape —
a new tool with its own contract and its own permission facet (reads declared, read-only class, no
writes, no commands), reading the worktree's metadata through the `gitdir:` pointer rather than
through a new read root. The refusal for unlisted metadata stands; only the tool's own operations
are granted.

**Built and run the same day it was ruled.** `git_read` (`packages/agent-tools/src/tools/git-read.ts`,
`REQ-TOOLS-193`): operations exactly `head` and `read_ref`, resolved from `HEAD`, loose refs and
`packed-refs` through the `gitdir:` pointer and its `commondir`, no subprocess, no command run; any
other repository path refused, a non-repository refused up front. Nineteen names in
`REQ-TOOLS-001`/`REQ-TOOLS-006`/`REQ-TOOLS-007`, the declaration and the class in `registry.ts`, the
executor wired in `run-host/tools.ts`, the read group in `children/personas.ts`. No policy rule
added — the tool takes no path, so the outside-workspace ask never fires — and no transcript change:
a tool call is a tool call. First execution: seven unit cases against real repositories (plain,
linked worktree with the pointer file, packed-only ref, detached HEAD, non-repository, traversal
names, the mandated refusals), plus the registry, planning-grants and contract pins — all green.

**OQ-62 — May a price come from a provider's discovery payload, and may a provider-reported cost be shown under its own qualifier? PARTLY RULED 2026-09-16 — the second half is answered, the first is not.** *(REQ-PROVIDER-072, REQ-MONITOR-166, REQ-CONFIG-088, with ADR-0031 and OQ-21; raised 2026-09-16 from a run whose cost read `0` throughout.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

Every run's `cost` column reads `"0"` and every cost label reads "price not established". That is not a
defect of the aggregate: `Aggregates` has no mutator for cost because there is nothing to feed one.
Four routes to a figure exist and three of them need a ruling.

**Discovery drops the prices it is given.** `REQ-PROVIDER-072` admits pricing "only for
`concrete-cloud`", so `describeModel` returns `pricing: {}` for every other provider and a test pins
it. OpenRouter publishes per-token prices in the same payload, as decimal strings, and they are
discarded on the way past.

**A provider-reported per-request cost has nowhere to land.** OpenRouter answers `usage.cost` when the
request asks for it; the adapter neither asks nor reads it. `REQ-MONITOR-166` fixes the cost label's
qualifier as one of three — `unknown`, `incomplete`, `configured` — and a figure the provider itself
computed is none of them. A fourth would have to be named.

**Configured rates are covered in principle and blocked in practice.** `REQ-CONFIG-088`'s
`input_cost_per_token` / `output_cost_per_token` take effect only when both are set — and today they
take effect never: `effectivePricing()` has no callers at all. Multiplying them is where this stops.
`REQ-PROVIDER-121` states the one money rule, that no amount is computed in binary floating point
anywhere; ADR-0031 is the decision that carries it out, and it is **proposed**, names a spike it has
not had, and is blocked by **OQ-21** — the same two fields are float-typed at their source
(`REQ-CONFIG-088`, `REQ-PROVIDER-072`) and exact in the rule that consumes them. ADR-0031's first
accepted consequence settles what to do meanwhile in terms: if the float typing stands, the exactness
is unattainable and "that is a specification defect to be recorded rather than a design to be built
around".

**What the build proceeds under.** Nothing was built for this, deliberately. Cost stays `"0"` and the
label stays `price not established` under the `unknown` qualifier, which `REQ-MONITOR-166` provides
for. Writing the arithmetic now would choose ADR-0031's representation before OQ-21 answers and before
the spike that decision requires, and a second money path is precisely what the lint rule in that
decision exists to prevent. The gap is recorded as an open defect note instead.

**What a ruling decides.** Whether discovery carries per-token prices for every provider (as decimal
strings, extending OQ-21's own recommended reading, which would amend `REQ-PROVIDER-072`'s
`concrete-cloud` clause); whether `REQ-MONITOR-166`'s qualifier set gains a fourth member for a price
the provider computed rather than the product; and whether configured rates are meant to produce a
figure at all — which cannot be built until OQ-21 says what a price is.

> **Disposition, 2026-09-16 (R-026).** One of the three is ruled and the other two are not, so the paragraphs
> above stay as written rather than being edited to match the answer.
>
> **Ruled:** the provider-reported cost. `REQ-MONITOR-166`'s qualifier set gains a fourth member for a figure
> the provider computed, and the adapter asks for and reads it — `PD-MONITOR-001`, a directive rather than an
> amendment round, because the owner is choosing to narrow a requirement that is not wrong. The sentence above
> that says "a fourth would have to be named" is **falsified and kept**: it is what the record said before the
> owner named one. What made this branch rulable while the other two are blocked is that carrying a figure the
> provider computed is exact decimal **addition** and never a multiplication, so `REQ-PROVIDER-121`'s money
> rule is met without saying what a price is. See `owner-decisions.md`, "OQ-62 — a provider-reported cost,
> ruled".
>
> **Still open:** discovery pricing, which is blocked behind OQ-21 for the reason stated above, and configured
> rates, which stay unbuilt. The paragraph "What the build proceeds under" continues to hold for both: cost
> reads `"0"` under the `unknown` qualifier wherever no provider-reported figure exists, which after the
> ruling is every provider but OpenRouter.
>
> **Configured rates ruled, 2026-09-23 (R-049).** With OQ-21 answered, the third branch is ruled by
> `PD-MONITOR-001` revision 2: a request the provider did not price is priced from the model's configured rates
> where both are set, exactly, under the `configured` qualifier, and `incomplete` marks a total some requests
> could not contribute to. **Discovery pricing stays open**: the owner deferred it, so `REQ-PROVIDER-072`'s
> `concrete-cloud`-only clause still governs.
>
> **Built the same day.** The ruled branch is no longer only ruled: the adapter asks OpenRouter for the figure
> and reads it back, `Aggregates.addCost` adds it in exact decimal arithmetic, and the label carries the fourth
> qualifier. The two open branches were not touched by that work and are not unblocked by it — what made this
> one buildable was addition, and neither of theirs is addition. The account is in
> `docs/architecture/first-executions.md`, and the arithmetic is reported back into ADR-0031 in place.
