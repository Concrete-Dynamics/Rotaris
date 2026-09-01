# Provenance — Specification Phase

This record exists so the claim "these specifications were produced independently" can be checked
rather than taken on trust. It documents who produced what, what each producer was allowed to see,
and what the audits found.

## Zone assignment

Every step ran as an isolated agent with its own context. No context was reused across zones, and no
agent that read the reference ever wrote a specification.

| Step | Reference access | Wrote to this repository |
|------|------------------|--------------------------|
| Reference freeze | yes | no |
| Behavioral survey | yes | no |
| Survey coverage critic | yes | no |
| Per-domain behavioral analysis | yes | no |
| Gateway (spec authoring) | no — exactly one sealed findings file per agent | yes |
| Contamination scanning | yes | edits to specs only |
| Second-pass verification | yes | edits to specs only |
| Adjudication | yes | no — read-only |
| Specification quality review | no — clean side only | no — read-only |
| Remediation | no — clean side only | yes |

The gateway is the only step that authored specification text, and it never had reference access. It
read exactly one sealed findings file, produced by an analyst it never communicated with.

## Sequence

1. **Freeze.** The reference was cloned to a sealed area outside this repository and pinned to a
   commit. See [`reference-record.md`](reference-record.md).
2. **Survey.** One agent enumerated the observable behavior surface as domains. An independent critic
   re-derived the surface and found four domains the survey had missed or under-recorded; those were
   added rather than argued away.
3. **Analysis.** One agent per domain wrote exhaustive behavioral findings into the sealed area.
   Two domains had to be split into halves after the single-agent attempts stalled.
4. **Gateway.** One agent per domain converted its sealed findings into a specification here.
5. **Scanning and verification.** Two successive passes compared each specification against the
   reference and edited what they found.
6. **Adjudication.** Read-only judges with reference access rendered a verdict on each file, and
   clean-side reviewers judged whether each file was fit to build from. This step found that the
   earlier editing passes had cleaned identifiers and library names thoroughly but had left copied
   *expression* and inherited structure largely untouched — six files were graded contaminated.
7. **Remediation.** Clean-side authors with no reference access rewrote the flagged requirements
   from the observable consequence alone, and fresh judges re-adjudicated every file.

## What the audits actually found

The recurring failure was not identifier leakage. It was prose: rationale sentences explaining why a
behavior exists, descriptions of internal mechanism where only the guarantee is observable, tables
reproduced in their original order, and statements that could only come from reading source or
tests ("no test covers this", "no caller supplies that"). Those are the marks of derivation, and
they survived passes that were looking for names.

The remediation instruction that worked was to *recompose* a requirement rather than edit it —
matching phrasing is the evidence, so rewording is the remedy.

Judges were also asked whether remediation had over-corrected. Several restored behavioral content
that earlier scrubbing had vagued out. A specification scrubbed into uselessness is a failure, not a
pass.

## Reconciliation after resolution

Open-question resolution ran one isolated agent per domain, each with only its own specification in
front of it. An audit of the resolved set found the predictable consequence of that isolation: wherever
two domains touched the same vocabulary, key, derivation or on-disk file, each agent had written its
own domain's requirement as the authoritative one and restated the other's content rather than citing
it. The terminal run-result vocabulary was defined in three documents. The stop-reason set existed
twice, once as prose reasons and once as snake_case tokens. One timeout bound was registered under two
key names, one isolated-checkout directory under two, and one transcript archive file had two homes.

Six reconciliation rounds settled every conflict, and settled them all the same way: as an
owner/follower pair. One requirement is named the product's single definition of the thing and says so
in its own text; every other requirement that needs it cites that identifier and states what it relies
on it for, and holds no copy of the content — a restated copy being what produced each of these
conflicts in the first place.

An owner does **not** enumerate its citers. The first four rounds had owners carry a list of the
requirements citing them, on the reasoning that a short list is useful to a reader; that was a
mistake, and the fifth round struck those lists — all but two, which are recorded as open below. A
citer list is a second copy of a fact that
already lives in the follower, so it went stale in both directions — owners naming requirements that
were never amended to cite them, and followers citing owners whose lists did not mention them. The
tables below are now the single index of ownership for the specification set, and the only place a
pairing is recorded.

Six rounds were needed because of how the specifications were written, not because the editing was
careless. Twenty-one documents were drafted in parallel by independent agents, and each stated for
itself every vocabulary, key, bound and on-disk file its own requirements depended on — that is what
made each document readable on its own, and it is also why the same closed set was declared in two,
three and in some cases four places. No single audit sees every declaration of a set at once:
reducing one document's copy to a citation is what exposes the next copy, so each round found
duplication the previous round's fixes had made visible and went a level deeper than the round before
it. Read in order, the six rounds are a sequence of defect classes, each one only visible once the
one before it had been cleared: duplicated vocabularies stated in requirement bodies; the same
duplication in the normative Data & Formats appendices, which the earlier rounds had read as
description; requirements that duplicated nothing at all but specified a different product; and
finally cross-domain obligations that a resolution record promised and no domain ever executed.

The first three rounds settled the vocabularies several domains produced values of — run
results, execution statuses, stop reasons, delegation and approval surfaces, and the on-disk files
and configuration keys two domains had each claimed. The fourth settled the constants, schemas and
closed sets that only one domain produces but several documents had restated: permission-mode
presets, sandbox and egress keys, the hook event vocabulary and hook entry schema, two desktop-shell
figures, MCP discovery locations, and the transient acknowledgement surface.

The fifth found the same defect in two places the first four had not reached, and one defect of a
different kind.

It went another level into the requirement bodies. The workspace domain was still restating the
skipped-hooks notice wording, the review dialog, the trust-status statements and the Settings hooks
table that the lifecycle-hooks domain owns; those requirements now cite REQ-HOOKS-091 through
REQ-HOOKS-108 and carry only what they add.

It then found the same duplication in the **Data & Formats** appendices, which the earlier rounds had
read as description rather than as normative statement and had therefore not swept. Appendices were
carrying second copies of schemas owned elsewhere — the canonical hook-set digest payload, the
hook-trust file, a per-user preference key — each of which is now a citation of the requirement that
fixes it.

And it withdrew three requirements that duplicated nothing but specified a different product. Domain
11 stated its publication model, and the self-containment claim resting on it, in terms of one
language ecosystem's interpreter and packages. How the product is packaged and published is an
architecture decision rather than behavior a user observes, so REQ-STARTUP-001, REQ-STARTUP-012 and
REQ-STARTUP-036 are withdrawn in place; the behavior underneath two of them is carried
technology-neutrally by REQ-STARTUP-158 and REQ-STARTUP-159, and the third had nothing left to
rescue.

The sixth round looked for the opposite of what the first five looked for. Every round up to that
point searched for content stated twice; this one searched for content stated nowhere — obligations a
resolution record had placed on another domain that no requirement in that domain ever carried. Five
audits had passed over them because an audit that reads two documents for the same sentence cannot
see a sentence that is missing from both.

The resolution records turned out to be the source. Domain 01's record closed with a list of
cross-domain consequences written in the future tense: four settings that "will need entries in the
settings domain", and a plan gate and run-surface set that were "new obligations on the desktop shell
domain". None of that is a requirement, and nothing in the first five rounds was looking for one.
Three of the four settings had no key anywhere and are now REQ-CONFIG-474, REQ-CONFIG-475 and
REQ-CONFIG-476; the fourth needed none, being a field of a check declaration domain 01 states itself.
The shell obligations are now REQ-SHELL-168. Of the vocabulary the same record said consuming domains
"should expect", exactly one was owed anywhere else — `awaiting_plan_decision`, a member of
REQ-SESSION-073's closed persisted-status set, which domain 07 does carry — and the other two are
domain 01's own, enumerated in no other document.

The same search found two obligations the round could close outright. The public tool-name registry
had been an owner/follower pair in the files since the fifth round without the owner saying so;
REQ-TOOLS-001 now declares itself the product's single definition of the accepted names *and* of the
per-tool capability declarations — reads workspace files, writes workspace files, runs commands —
that REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 had been resolving rules against with no requirement
in any domain stating them. And REQ-STARTUP-144, whose subject was a public marketing download page
rather than this product, is withdrawn on the same ground the fifth round withdrew the packaging
requirements: a behavioral specification for an application cannot bind a website. What that
requirement was protecting — that a user is told what the product puts on the network, in words the
product itself carries — is now REQ-STARTUP-160.

Re-verifying the tables turned up one more thing, of a kind none of the earlier rounds had a name
for: a question two resolution passes had decided in opposite directions, with both decisions live in
the corpus until now. Which domain owns the two sandbox runtime keys was settled one way by domains
05 and 10 in their own records and the other way by the fourth reconciliation round, and neither side
contradicted anything a single reader could see at once. It is recorded among the open items below,
with the direction that stands.

This round changed three domains' totals, and every change was an addition. That is the signature of
the defect class: the first five rounds removed duplicated content and moved one total; the sixth
wrote the requirements that were missing.

None of this is a mark against the drafting, and it should not be read as one. It is what twenty-one
specifications written in parallel cost. They converge by successive reconciliation, each round
exposing what the previous round's fixes made visible, and six rounds is the price of the parallelism
that produced them.

The lesson worth carrying into the architecture phase is the last one, because it is the one that
generalizes. The resolution records were themselves a source of unexecuted obligations. Each was
written by an agent that could see only its own domain, and where a decision reached into another
domain the record did the honest thing and wrote down what that domain would owe — in prose, in the
future tense, addressed to nobody. Those sentences read as work recorded; they were work deferred,
and they survived five audits because nothing was checking them. An obligation that lives only in a
narrative account of a decision is not tracked by anything. Architecture decision records will carry
the same temptation, and the same failure mode: a decision that names consequences for another part
of the system has not been executed until each consequence is a numbered item somewhere it can be
checked against.

Each row names the owner, what it is the single definition of, and the requirements verified to
cite it. The lists are not cross-reference indexes: a requirement may mention an owner's identifier
without being a follower of it, and many do. What is recorded here is the pairings reconciliation
established.

The owners assigned in the first three rounds:

| Owner | What it is the single definition of |
|---|---|
| REQ-ORCH-082 | End-of-run summarization (cited by REQ-SESSION-074) |
| REQ-ORCH-083 | The terminal run-result vocabulary (cited by REQ-MONITOR-028, REQ-SESSION-187, REQ-EVENTS-026) |
| REQ-ORCH-137 | The stop reasons for which no improvement pass is collected (cited by REQ-LIBRARY-032) |
| REQ-MONITOR-300 | The delegated-child state machine, over the state set of REQ-MONITOR-014 |
| REQ-MONITOR-301 | The closed stop-reason set and its total mapping onto the terminal run result (cited by REQ-ORCH-083, REQ-SESSION-077, REQ-EVENTS-027) |
| REQ-SESSION-073 | The persisted `execution_status` vocabulary |
| REQ-SESSION-076 | The derivation of a run result from an execution status |
| REQ-SESSION-131, REQ-SESSION-192 | Bounded transcript residency and the retained released pages (cited by REQ-CHAT-165) |
| REQ-TOOLS-061 | The approval-request event and its `resolver` and `unattended_reason` vocabularies (cited by REQ-EVENTS-049) |
| REQ-TOOLS-153, REQ-TOOLS-156 | What a `delegate` call returns (cited by REQ-ORCH-033, REQ-ORCH-037), and the wait for delegated tasks (cited by REQ-ORCH-037, REQ-ORCH-057, REQ-ORCH-062) |
| REQ-SANDBOX-048 | The confinement-mode vocabulary (cited by REQ-TOOLS-114, REQ-SHELL-125, REQ-CONFIG-127) |
| REQ-PROVIDER-121 | Money arithmetic and rendering, for the model-providers domain — the requirement claims that domain and no more |
| REQ-NOTIFY-200 | The provider status vocabulary, its entry conditions and its precedence order (cited by REQ-PROVIDER-118, REQ-CONFIG-368) |
| REQ-LIBRARY-089 | The artifact tag vocabulary and its normalisation |
| REQ-GIT-137 | Where requirement-unit checkouts live, and that no configuration key names that location |
| REQ-CONFIG-068, REQ-CONFIG-194 | The one key that names a session worktree's storage subpath, and the absence of any key for the requirement-unit one |
| REQ-CONFIG-231 | The referential-validation rule for `models:` and the role fields — which messages are produced, the order they are produced in, and that a rejected tool name is reported with the accepted names sorted (cited by REQ-ORCH-016, REQ-ORCH-028, REQ-ORCH-153, REQ-CONFIG-465). It does not own the tool-name registry: it reads the accepted set from the tools-and-permissions domain and says so in its own text |

The owners assigned in the fourth round:

| Owner | What it is the single definition of |
|---|---|
| REQ-ORCH-116 | The completion-gate decision — its three values, where the gate is applied, and its override of the classifier (cited by REQ-NOTIFY-128, REQ-EVENTS-055, REQ-LIBRARY-027, REQ-LIBRARY-028) |
| REQ-ORCH-123 | The closed five-value check-outcome vocabulary (cited by REQ-NOTIFY-142, REQ-EVENTS-054, REQ-SESSION-129) |
| REQ-TOOLS-041 | The permission-mode preset vocabulary (cited by REQ-CONFIG-122, REQ-CONFIG-324, REQ-SANDBOX-046, REQ-SANDBOX-053) |
| REQ-TOOLS-046 | How a configured mode name resolves to a preset, and the shipped default (cited by REQ-CONFIG-122, REQ-SANDBOX-046, REQ-WORKSPACE-022) |
| REQ-TOOLS-047 | The restrictiveness ordering of the presets (cited by REQ-CONFIG-122, REQ-SANDBOX-046, REQ-SANDBOX-106) |
| REQ-TOOLS-067 | The downgrade of a permissive mode, its three conditions and what it leaves alone (cited by REQ-CONFIG-124, REQ-SANDBOX-099, REQ-WORKSPACE-022) |
| REQ-TOOLS-094 | The closed catalogue of leading-token command patterns (cited by REQ-SANDBOX-043) |
| REQ-GIT-015 | The worktree binding record and its closed `merge_status` vocabulary (cited by REQ-SESSION-018) |
| REQ-HOOKS-001 | The hook event vocabulary and its division into two families (cited by REQ-CONFIG-157, REQ-EVENTS-048) |
| REQ-HOOKS-008 | The hook entry schema — field set, types, which fields are required, defaults (cited by REQ-CONFIG-154, REQ-CONFIG-156) |
| REQ-HOOKS-025 | Hook matcher evaluation, with REQ-HOOKS-027 and REQ-HOOKS-029 (cited by REQ-CONFIG-156) |
| REQ-HOOKS-037 | The per-stream cap on captured hook output (cited by REQ-CONFIG-157) |
| REQ-HOOKS-091 | The workspace hook fingerprint (cited by REQ-WORKSPACE-117, REQ-WORKSPACE-153, REQ-NOTIFY-224 — the row recorded no citers when it was written; the fifth round supplied them) |
| REQ-HOOKS-139 | The numeric bounds on hook work — no document outside domain 09 cites it yet |
| REQ-SANDBOX-001 | The egress disposition vocabulary and its shipped default, with REQ-SANDBOX-002 and REQ-SANDBOX-017 (cited by REQ-CONFIG-128, REQ-CONFIG-301) |
| REQ-SANDBOX-003 | The two host-list keys, their normalization, and that a denial outranks an allow, with REQ-SANDBOX-004 and REQ-SANDBOX-014 (cited by REQ-CONFIG-128) |
| REQ-SANDBOX-050 | `runtime.sandbox_writable_roots`, its default and its entry rules (cited by REQ-CONFIG-127) |
| REQ-SANDBOX-051 | `runtime.sandbox_allow_network` and its default (cited by REQ-CONFIG-127) |
| REQ-SHELL-011 | The shared first-paint deferral interval (cited by REQ-SHELL-013, REQ-STARTUP-044) |
| REQ-SHELL-047 | The status strip's responsive-elision thresholds (cited by REQ-WORKSPACE-021, REQ-WORKSPACE-153) |
| REQ-MCP-017 | Where `.mcp.json` auto-discovery looks (cited by REQ-CONFIG-008, REQ-CONFIG-009, REQ-WORKSPACE-037) |
| REQ-NOTIFY-011 | The transient acknowledgement lifetime (cited by REQ-SHELL-112, REQ-SHELL-167) |
| REQ-NOTIFY-012 | Where a transient acknowledgement is placed (cited by REQ-SHELL-112) |
| REQ-NOTIFY-013 | The transient acknowledgement surface itself (cited by REQ-SHELL-112, REQ-SHELL-113, REQ-SHELL-167) |
| REQ-NOTIFY-022 | Acknowledgement motion (cited by REQ-SHELL-113, REQ-SHELL-136, REQ-SHELL-167) |

The owners assigned in the fifth round. That round found the workspace domain restating the hook
model the lifecycle-hooks domain owns, and the appendices restating formats owned elsewhere. Two of
its assignments are owners in the full sense — the owner carries the declaring sentence:

| Owner | What it is the single definition of |
|---|---|
| REQ-HOOKS-091 | Already listed in the fourth-round table; the fifth round is where it acquired citers |
| REQ-HOOKS-096 | The trust decision file `<workspace>/.rotaris/hook-trust.json` — its path, its four keys and its serialization (cited by REQ-WORKSPACE-118, REQ-WORKSPACE-153, and by the Data & Formats appendix of domain 09, which holds no copy) |

The rest of what the fifth round settled between domains 09 and 13 is a set of real pairings whose
owner has not yet been given a declaring sentence. They are recorded here because this file is the
only index, and listed as unfinished rather than as settled:

| Requirement relied on | What the workspace domain reads from it | Follower |
|---|---|---|
| REQ-HOOKS-086 | The environment a hook command is given | REQ-WORKSPACE-127 |
| REQ-HOOKS-090 | The workspace hook trust gate | REQ-WORKSPACE-116, REQ-WORKSPACE-121, REQ-EVENTS-047 |
| REQ-HOOKS-092, REQ-HOOKS-093 | The pending review request, and the decision lifecycle that invalidates it | REQ-WORKSPACE-120; REQ-HOOKS-093 also by REQ-WORKSPACE-118 |
| REQ-HOOKS-094 | Reading a stored decision, and the default-to-not-approved rule for every unreadable case | REQ-WORKSPACE-119, REQ-WORKSPACE-153 |
| REQ-HOOKS-097 | Path reduction before a decision file is located | REQ-WORKSPACE-121 |
| REQ-HOOKS-098, REQ-HOOKS-099 | Reinstating inherited hooks a workspace list displaced, and when reinstatement lapses | REQ-WORKSPACE-125 |
| REQ-HOOKS-101, REQ-HOOKS-102 | The review dialog and what it must convey | REQ-WORKSPACE-122, REQ-WORKSPACE-126, REQ-WORKSPACE-130, REQ-WORKSPACE-131 |
| REQ-HOOKS-103, REQ-HOOKS-104, REQ-HOOKS-105, REQ-HOOKS-106, REQ-HOOKS-107, REQ-HOOKS-108 | The Settings hooks table, its trust-status statements and its per-entry controls | REQ-WORKSPACE-128, REQ-WORKSPACE-129, REQ-WORKSPACE-130, REQ-WORKSPACE-131 |

The owners assigned in the sixth round:

| Owner | What it is the single definition of |
|---|---|
| REQ-TOOLS-001 | The public tool-name registry: the accepted set of public tool names, and each name's three capability facets — reads workspace files, writes workspace files, runs commands (cited by REQ-CONFIG-104, REQ-CONFIG-105, REQ-CONFIG-231). The declarations were the thing three run-orchestration requirements had been resolving rules against while no requirement stated them; see the open items below, because those three have not yet been re-pointed |
| REQ-CONFIG-474 | The key that bounds consecutive pending-outcome iterations for one task, its type and its default. It holds no copy of the rule that consumes it, which is REQ-ORCH-077's |
| REQ-CONFIG-475 | The key that bounds the relentless-mode fulfilment audit, its type and its default. The rule it feeds is REQ-ORCH-079's |
| REQ-CONFIG-476 | The one key naming the run-start mode, its two accepted values and its default. Every surface offering the mode writes this key; what each mode does is REQ-ORCH-152's and REQ-ORCH-153's |
| REQ-STARTUP-160 | The product's disclosure of its own network activity: what it contacts, when, what those requests never carry, and the surface that must carry it |

Both of the first two tables were re-verified in the fifth round, row by row and citer by citer,
against the files themselves: each owner was read for the sentence declaring it the single
definition, and each named citer was read for the owner's identifier. Every table above was
re-verified the same way in the sixth, and every pairing recorded here was found present in the
follower's own text at that check. The sixth round's verification also read each owner for its
declaring sentence, which is how the unfinished pairings between domains 09 and 13 were separated
out above: a follower that cites correctly does not make the requirement it cites an owner until the
owner says it is one.

One row overstated what had been done, in a way the earlier check could not have caught.
REQ-CONFIG-231 was recorded as cited by REQ-CONFIG-104 and REQ-CONFIG-105. Both did carry the
identifier when the row was written, but not as followers of what the row says REQ-CONFIG-231 owns:
they cited it for the public tool-name registry's per-tool capability declarations, which
REQ-CONFIG-231 explicitly declines to own, rather than for the referential-validation rule that it
does. The fifth round re-pointed both at the domain that does own what they rely on — REQ-CONFIG-104
now cites REQ-TOOLS-006 and REQ-TOOLS-001, REQ-CONFIG-105 cites REQ-TOOLS-007 and REQ-TOOLS-006 —
which leaves the recorded pairing naming nothing at all. Nothing was duplicated at any point, so no
content was ever at risk; what was wrong was the record. The row now names the requirements that do
carry the citation and do rely on the validation rule: REQ-ORCH-016, REQ-ORCH-028, REQ-ORCH-153 and
REQ-CONFIG-465.

Every other pairing in the tables was found present in the follower's own text. What that check
establishes is that the follower carries the owner's identifier. That the follower cites it *for the
thing the owner owns* was read on each row rather than machine-checked, and REQ-CONFIG-231 is the
reason to say so: an identifier can be present and still be the wrong pairing. The sixth round found
the same mis-pairing again, in three requirements nobody had thought to re-read; it is recorded below.

Two earlier corrections stand as previously recorded. REQ-CONFIG-127 against REQ-SANDBOX-048, and
REQ-CHAT-165 against REQ-SESSION-131 and REQ-SESSION-192, had each been recorded before the follower
carried the citation; both followers were amended in the fourth round, so those rows state what the
files hold. Two further rows had claimed more ownership than the requirement itself claims and were
narrowed to it.

The check is worth repeating whenever a round adds owners, and — as the fifth round showed — it is
worth repeating on rows nobody touched. A reconciliation that is recorded as done and is not is worse
than one that was never attempted. The sixth round added a second check to it, and it is the one that
found the missing requirements: read the resolution records for obligations they place on a domain
other than their own, and look for the requirement that discharges each. Prose is not a pairing.

Two of the four things the fifth round left open are now closed, and the sixth round's own reading
opened two more. What follows is the state after that round.

**Closed.** The tool-name registry is an owner in the full sense: REQ-TOOLS-001 now carries the
sentence declaring it the product's single definition of the accepted names, and it is in the
sixth-round table above. With it, the per-tool capability declarations that had been stated nowhere
are stated: REQ-TOOLS-001 declares, for each name, whether the tool reads workspace files, writes
workspace files, or runs commands, each facet declared or not declared, as a property of the tool and
never of the content it is handed. That closes the gap three requirements had been reading across.

**Still open, and now for a narrower reason.** REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 resolve
the direct-work bundle, the definition of an implementation delegation, and the plan gate's spawn
restriction against those declarations, and all three still cite REQ-CONFIG-231 — which says in its
own text that it fixes the validation rule alone, owns no capability, and that a requirement
resolving a rule against a tool's capabilities cites REQ-TOOLS-001 rather than it. The classification
now exists; the three followers point at the wrong requirement for it. This is the same defect as the
REQ-CONFIG-104 and REQ-CONFIG-105 mis-pairing the fifth round corrected, in the same place, and it is
the reason that correction should have been read across the whole set of citers rather than the two
that raised it.

**Still open.** Two owners carry no sentence declaring them the single definition, so their ownership
is recorded here and nowhere else: REQ-MONITOR-301, for the closed stop-reason set and its mapping
onto the terminal run result, and REQ-TOOLS-061, for the approval-request event and its `resolver`
and `unattended_reason` vocabularies. REQ-CONFIG-068 carries none either, but does not need one: the
declaration for that pair sits in REQ-CONFIG-194, which names it. To these the sixth round's
verification adds the fifteen lifecycle-hook requirements listed in the unfinished-pairings table
above, which are relied on correctly by domain 13 and say nothing about being relied on.

**Still open.** Two citer lists survived the fifth round's sweep, in REQ-TOOLS-153 and REQ-TOOLS-156,
and one of them is still stale in the way the rule anticipates: REQ-TOOLS-153 names REQ-ORCH-050
among the run-orchestration requirements that cite it, and REQ-ORCH-050 does not.

**Open, and now decided in the record but not in the files.** REQ-TOOLS-116 and REQ-TOOLS-117 hold
copies of what REQ-SANDBOX-050 and REQ-SANDBOX-051 own — the absolute-path rule and its message for
`runtime.sandbox_writable_roots`, and the `runtime.sandbox_allow_network` default — without citing
either owner, while REQ-SANDBOX-050 cites REQ-TOOLS-116 for the message shape. The sixth round found
why: this question had been decided in opposite directions and both decisions were live. The
resolution records for domains 05 and 10, written independently, each concluded that REQ-TOOLS-116
fixes the rule and had the sandbox domain cite the tools domain; the fourth reconciliation round
concluded the reverse and named REQ-SANDBOX-050 and REQ-SANDBOX-051 the owners, which is what the
fourth-round table records and what those two requirements now say in their own text. Two records
agreeing with each other and disagreeing with the table is precisely the shape no single audit sees,
and it survived five rounds on that account. The direction that stands is the fourth round's: the
domain that defines confinement defines the keys that configure it. Both resolution records now carry
a supersession note saying so. The files do not yet: REQ-TOOLS-116 and REQ-TOOLS-117 still hold the
copies, and REQ-SANDBOX-050 still carries the citation running the wrong way.

Everything above belongs to the next round, and none of it is claimed as settled by the tables.

The resolution records in `../spec/resolutions/` were corrected rather than rewritten. A disposition
that a later round overturned still states what was decided and why, and then names what superseded
it — so the account of how a decision was reached survives the decision itself being replaced. That
matters for this repository specifically: the reasoning in those records is the clean-side derivation,
and deleting it would leave the current requirement with no visible provenance.

The sixth round completed that annotation across the corpus, having found dispositions in several
records still reading as current guidance after a later round had overturned them — the ownership of
the two sandbox runtime keys in domains 05 and 10, the hook digest and reinstatement rules in domain
13, the sixth configuration layer and the origin vocabulary that went with it in domain 15, and the
download-page obligations in domain 11. Each now states what was decided, why, and what replaced it.
A resolution record is a historical account and is not amended into agreement with the present; it is
also read by people looking for the current rule, so where it no longer states one it has to say so
in place.

## The structural-ruling round

A seventh round, and the first not driven by an audit of the record. The product owner ruled on three
structural questions — SR-1, one running instance; SR-2, a session this application does not own
cannot be viewed at all; SR-3, no polling — recorded in
[`../architecture/owner-decisions.md`](../architecture/owner-decisions.md). Those rulings are the
authority for everything below; nothing here was decided by an editing agent.

Four domains were amended in parallel by independent agents, one each for 02, 07, 11 and 20, and a
fifth pass reconciled them against each other and swept the remaining seventeen. That is the same
parallel-and-isolated arrangement that made six rounds necessary the first time, and it produced the
same defect class again: two of the four domains reached opposite conclusions about one shared rule,
each correct within its own file. Both are recorded below.

**What was withdrawn.** Fifteen identifiers, all of them parts of one mechanism — a surface following
a session by reading `evidence/events.jsonl` while another process executed it.

| Withdrawn | What it held | Where the surviving part lives |
|---|---|---|
| REQ-SESSION-149 | The resumable byte-offset tail, its restart flag, and discard-and-re-seed | Nothing that reads a *stored* history goes with it: REQ-SESSION-148, REQ-SESSION-150, REQ-SESSION-151, REQ-SESSION-189, REQ-EVENTS-106, REQ-EVENTS-126 |
| REQ-SESSION-160 | Follower row numbering, the placeholder row, the re-seed | Contiguous indices and replace-at-index are REQ-EVENTS-052's; index stability across eviction is REQ-SESSION-192's; the placeholder row is withdrawn outright by SR-2 and is replaced by reconcile-from-whole-read (REQ-SESSION-161) |
| REQ-EVENTS-108 to REQ-EVENTS-116 | The resumable-read protocol: offset, restart flag, partial-line hold, corrupt-line offset advance, read-relative warning numbering, undecodable bytes, exactly-once across reads | REQ-EVENTS-101 (missing file), REQ-EVENTS-088 with REQ-EVENTS-106 (partial and damaged lines), REQ-EVENTS-083 with REQ-EVENTS-099 (complete, in-order, whole read), REQ-EVENTS-165 (exactly-once on the live channel). REQ-EVENTS-115's undecodable-bytes rule was **moved into REQ-EVENTS-106 before** its identifier was withdrawn |
| REQ-MONITOR-244, REQ-MONITOR-245 | The tail-following protocol and its edge cases | The event store itself is untouched: REQ-MONITOR-233, REQ-MONITOR-237, REQ-EVENTS-126 |
| REQ-MONITOR-247 | Refusing to follow a second session while executing your own run | The single-writer guarantee it protected is REQ-MONITOR-240's, with REQ-MONITOR-256 and REQ-MONITOR-260 |
| REQ-MONITOR-288 | The 750 ms foreign poll and the 2000 ms reconcile poll | The reconcile cadence is replaced, not deleted: REQ-MONITOR-214's sequence number with REQ-MONITOR-226's gap obligation. The foreign cadence has nothing left to observe |

**What was minted.** Four identifiers, all in domain 11 and all for SR-1, which is genuinely new
behavior rather than a reduction: REQ-STARTUP-161 (one instance), REQ-STARTUP-162 (what surfacing
means), REQ-STARTUP-163 (a workspace a launch carries), REQ-STARTUP-164 (the stale record, and the
guarantee that the application is never unlaunchable). SR-3's replacement for the withdrawn poll was
deliberately **not** minted as a new identifier: the sequence number is a clause on REQ-MONITOR-214,
which already fixed the two-channel publication model, and the gap obligation is a clause on
REQ-MONITOR-226, which already carried the identical fallback for an increment a view cannot apply.

**The event journal is untouched and this is the load-bearing fact.** `evidence/events.jsonl` remains
byte-identical to the wire (REQ-EVENTS-079, REQ-EVENTS-080), remains comparable as a file by
conformance requirements (REQ-EVENTS-166, REQ-MONITOR-299), remains readable by a stock parser on a
machine with none of this product's code (REQ-EVENTS-166), and is now the durable anchor for
persist-before-publish. Every reader of it was enumerated before anything was withdrawn: the
first-and-last-line listing summary (REQ-EVENTS-126, REQ-SESSION-151), replay (REQ-SESSION-150,
REQ-SESSION-188), export including the raw-lines form (REQ-SESSION-189), the persist-before-forward
tee (REQ-SESSION-147, REQ-SESSION-174), and the reattach completion read (REQ-SESSION-196). None is
following, and none was broken.

> **Corrected by the storage-ruling round, 2026-09-01.** Three of the four claims in the paragraph
> above are no longer true of the specification, and the fourth has moved. REQ-EVENTS-079 is
> **withdrawn**; REQ-EVENTS-080 governs the stored **event** rather than a line in a file;
> REQ-MONITOR-299 no longer compares files; and REQ-EVENTS-166's stock-parser guarantee is now
> discharged by an **export** (REQ-EVENTS-172, REQ-SESSION-189) rather than by the write path. What
> survives unchanged is the part that mattered: the five readers enumerated here are all still
> correct, none was broken by either round, and the guarantee that a user can read a run's history
> without this product is stronger than it was, because it is now stated as an obligation on a named
> artifact rather than inherited from a file format.

The owners this round assigns:

| Owner | What it is the single definition of |
|---|---|
| REQ-SESSION-159 | The two conditions a session can be in — live and owned by the one running instance, or not running and existing as a persisted record — and that there is no third (cited by REQ-SESSION-047, REQ-SESSION-071, REQ-SESSION-106, REQ-SESSION-196, and by REQ-MONITOR-243, which says in its own text that it relies on the model and does not define it). REQ-MONITOR-243 was re-pointed at it this round: it had cited REQ-SESSION-196, which restores a session rather than defining the conditions — the same wrong-pairing defect the fifth and sixth rounds found around REQ-CONFIG-231 |
| REQ-STARTUP-161 | Application-instance identity: at most one instance per user account, and that several workspaces and several windows are not a second instance (cited by REQ-PROVIDER-064, REQ-PROVIDER-152, REQ-SESSION-047, REQ-SESSION-050, REQ-SESSION-159, REQ-GIT-020, REQ-SHELL-020, REQ-SHELL-121, REQ-SHELL-161, REQ-LIBRARY-158, REQ-CONFIG-397, REQ-MCP-047, and within domain 11 by REQ-STARTUP-093, REQ-STARTUP-102, REQ-STARTUP-103, REQ-STARTUP-121, REQ-STARTUP-147, REQ-STARTUP-152, REQ-STARTUP-155, REQ-STARTUP-164). It is the requirement four of the amended domains had been asserting as a fact with nothing to cite |
| REQ-MONITOR-214 | The per-session view-publication sequence number — one counter shared by both channels — by which a surface knows it missed an update (cited by REQ-MONITOR-003, REQ-MONITOR-225, REQ-MONITOR-226, REQ-MONITOR-243, REQ-MONITOR-287, REQ-MONITOR-292, REQ-MONITOR-298, REQ-SESSION-161 and REQ-NOTIFY-253; REQ-EVENTS-052 reaches it through REQ-MONITOR-226 rather than directly). It is a transport number and MUST NOT appear in `evidence/events.jsonl`, which REQ-EVENTS-080 requires to be byte-for-byte what the live stream emitted |
| REQ-SHELL-161 | What "show, raise and activate" guarantees for **every** window this product owns, a declined raise included. Widened this round from auxiliary windows alone, so that REQ-STARTUP-162 could cite it rather than restate it, which it now does |
| REQ-EVENTS-106 | The read-damage warning reasons — now all four of them, undecodable bytes included, which REQ-EVENTS-115 held under its own scope until its content was moved here and its identifier withdrawn — together with the warning's fields, its one-line rendering, and the rule that reading continues past a damaged line (cited within domain 20 by REQ-EVENTS-088, REQ-EVENTS-103 and REQ-EVENTS-170; across domains by REQ-MONITOR-245's withdrawal line, by REQ-SESSION-149's, and by domain 07's Data & Formats reader-warning row, which pairs it with REQ-SESSION-148). It carries no declaring sentence; see the open items below |

**Removed from the record.** No row of the earlier tables named REQ-SESSION-160 or REQ-EVENTS-111 as
an owner, so no row had to be struck. Two ownership facts that lived only in requirement text are
recorded here instead. The placeholder row `{"role":"system","content":"(this line was not
recorded)"}` had no owner after REQ-SESSION-160's withdrawal and now has no subject either — it is
withdrawn product-wide, and REQ-EVENTS-052 was re-pointed off it. The truncation marker's ownership,
which REQ-EVENTS-111 had shared by requiring every resumable read to consult it, is now unambiguously
REQ-EVENTS-092 (existence, contents, atomic write) and REQ-EVENTS-094 (accumulation across runs and
launches), with four citers — REQ-EVENTS-129, REQ-EVENTS-140, REQ-EVENTS-168, REQ-EVENTS-173 — none
of which has anything to do with following.

**Confirmed unchanged.** The row `REQ-SESSION-131, REQ-SESSION-192 — Bounded transcript residency and
the evicted-page archive file (cited by REQ-CHAT-165)` absorbs no new content. REQ-SESSION-192 was
read for the declaring sentence before REQ-SESSION-160's citation was dropped from it, and it already
declares the stability of a row's index across eviction among what it owns.

**Two domains contradicted each other, and both were adjudicated rather than left.**

1. *The placeholder row.* Domain 07 withdrew REQ-SESSION-160 wholesale, as SR-2 names the
   placeholder-row gap filling among what is withdrawn. Domain 20 left REQ-EVENTS-052 citing it,
   having reasoned that the gap it fills — REQ-EVENTS-164's 1024-event buffer discarding events —
   survives the ruling, which it does. Both are right about their own file. The ruling decides it:
   the *gap* survives, the *placeholder* does not. REQ-EVENTS-052 now requires the consumer to stop
   consuming increments and reconcile from a whole-session read, which is what REQ-MONITOR-226
   already requires of the same surface for the same loss, so one response now serves both detectors.
2. *The surviving owners of the reader's robustness rules.* REQ-MONITOR-245's withdrawal line named
   REQ-EVENTS-109, -110, -112, -113 and -116 as keeping their consumers, in the same round in which
   domain 20 withdrew all five. The citation was re-pointed at the requirements that do hold each
   rule, listed in the withdrawal table above.

**One thing the ruling broke that no requirement covered, found in this round and fixed here.** SR-3
makes a lost update detectable and requires the surface to "re-render from a whole read". For a live
session, REQ-SESSION-161 named that read as the whole-session update the application publishes — and
REQ-MONITOR-216 requires that update to omit the transcript. A surface that missed a *transcript*
increment could therefore detect the loss and have no way to recover the rows. REQ-SESSION-161 now
states that reconciling a missed transcript increment also re-delivers the transcript: for a live
session by republishing from the lowest index held, which REQ-MONITOR-214 and REQ-MONITOR-215 already
express and REQ-MONITOR-229 already uses for a cleared transcript; for a session at rest from the
snapshot projection of REQ-SESSION-156. No new mechanism was added — the republication already
existed — but nothing had said it was required here.

**Still open after this round.**

- REQ-EVENTS-106 became the sole owner of the four read-damage warning reasons when REQ-EVENTS-115's
  content was moved into it, and it carries no sentence declaring itself the single definition. It
  joins REQ-MONITOR-301 and REQ-TOOLS-061 in the list above of owners recorded only here.
- The cross-machine case is the one place SR-1 is not literally exhaustive. "One instance" is one
  instance *per machine*; a workspace on shared or synced storage opened from a second machine
  produces a lock naming another host that this instance cannot probe. REQ-SESSION-046's `host`
  field, REQ-SESSION-054, REQ-SESSION-056, REQ-SESSION-183 and REQ-GIT-093 all exist for it, and
  REQ-SESSION-159 resolves it by refusing the session rather than watching it, with explicit release
  as the remedy. That is a third observable outcome for a user — not viewable, not continuable, only
  forcibly unlocked — and the owner has not ruled on whether refusing is what was intended.
- REQ-STARTUP-164 (3) reclaims the instance record from a process that is running but will not
  answer within 5 seconds, because the alternative is an unlaunchable application. That is the one
  path by which two processes of this application can briefly coexist, and what contains it is the
  session lock rather than the record. Recorded so it is not discovered later.
- The retired documents 17 and 18 were **not** amended. Their own preamble states that surrounding
  text is left as drafted rather than rewritten, so their multi-process language stands as a record
  of a product this is not.

> **Answered by SR-5, 2026-08-31.** The cross-machine item above is closed. Refusing is intended, and the
> refusal is a safety feature rather than an awkward edge case. Two things changed with the answer:
> REQ-SESSION-048 now owns what the refusal must **convey** — that the workspace is held by another
> machine, not that a lock is contended — and, under ESC-15, a foreign-host lock ceases to be the ordinary
> consequence of shared storage and becomes evidence that the session store itself is reachable from more
> than one machine. `host`, REQ-SESSION-054, REQ-SESSION-056, REQ-SESSION-183 and REQ-GIT-093 all stay.
>
> **Also amended, 2026-09-01.** The retired documents 17 and 18 gained one storage note each, saying that
> the session-directory layout they describe is withdrawn corpus-wide and that none of their file
> references is a surviving contract. Their body text is still left as drafted; only the retirement banner
> was touched.

## The storage-ruling round

An eighth round, driven by the product owner's storage rulings rather than by an audit: **SR-4** (a
database for what only the application reads), **SR-5** (a workspace held by another machine is refused,
plus a new obligation to detect shared or synchronised storage directly), **SR-6** (the export obligation
covers the timeline, the issues record, the metrics document and the permission audit), **SR-7** (the
onefile portable extracts once to a cache), **SR-8** (REQ-ORCH-155's 100 ms is a p95), and the
escalations **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and **ESC-18**. All are recorded in
[`../architecture/owner-decisions.md`](../architecture/owner-decisions.md).

The same parallel-and-isolated arrangement was used again: four agents amended four domain groups
independently — 07; 20; 11 with 01; and 14 with 15 and 08 — and a fifth pass reconciled them and swept
the remaining domains, `resolutions/`, this file, the specification index and the Specification Gate.

**What was withdrawn.** Six identifiers, all of them layout or path requirements, and no behaviour with
them. Each guarantee was re-homed *before* the identifier was withdrawn, which is the standing rule this
repository learned the hard way three rounds running.

| Withdrawn | What it held | Where the surviving part lives |
|---|---|---|
| REQ-SESSION-003 | The split `state/` layout: `resume.json`, `ui_transcript.json`, `ui_edit_diffs.json`, `run_config.json`, `transcript_archive.jsonl` | A session created but never run carries no launch audit and loads with an empty configuration snapshot — REQ-SESSION-138. Released pages exist only once the resident window overflows — REQ-SESSION-131, REQ-SESSION-192 |
| REQ-SESSION-004 | The `evidence/` filename set | That a reader of a record kind the session never wrote gets **empty rather than a failure** — REQ-SESSION-132, now without a placeholder. The session log survives as a file — REQ-SESSION-142, opened by REQ-SESSION-191 |
| REQ-SESSION-010 | Directory-name-equals-session-id as a fallback resolution rule | Nothing to rescue: bindings bind by id (REQ-SESSION-146, REQ-SESSION-176) and id uniqueness is REQ-SESSION-012's. Confirmed to have no citers before withdrawal |
| REQ-EVENTS-079 | The fixed paths `<session_dir>/evidence/events.jsonl` and `events.meta.json` | One history per session and a resumed run adding to it — REQ-EVENTS-097, REQ-EVENTS-085. A history belonging to exactly one workspace's sessions — REQ-EVENTS-131. A truncation record existing only after a trim — REQ-EVENTS-087, REQ-EVENTS-092. **The line-delimited form is not withdrawn with the path**: it moves whole to the export (REQ-EVENTS-090, REQ-EVENTS-172) |
| REQ-EVENTS-093 | Three interchangeable filesystem paths from which store metadata could be located | That a session with no store at all reports **no truncation rather than failing** — moved into REQ-EVENTS-092 before the identifier was withdrawn |
| REQ-MONITOR-236 | The readability of a legacy combined snapshot file | Withdrawn for the reason that already withdrew REQ-SESSION-005: a clean-room product has no predecessor layout. That a session recorded by an earlier version still opens is REQ-SESSION-015's and REQ-SESSION-073's |

One configuration **key** was also withdrawn, below requirement level:
`requirements.delivery.store_subpath`, inside REQ-CONFIG-192, because the directory it named no longer
exists. REQ-CONFIG-192 keeps its identifier and its five other fields.

**What was minted.** Seven identifiers, each for behaviour no existing requirement stated.

| Minted | What it owns |
|---|---|
| REQ-SESSION-197 | The **workspace identifier**. Written into the workspace's `.rotaris/`, human-readable, minted once, never changed by move, rename, copy, sync or version. The store is located by it and never by path. ESC-15 invents the thing; nothing in the corpus previously named it |
| REQ-SESSION-198 | The **machine-local store**: always machine-local, never conditional on detection; a workspace on a share or in a sync folder is fully usable; a session recorded on one machine never appears on another; per-session files are held with the store; a store that will not open is not worked around |
| REQ-SESSION-199 | The **SR-6 export obligation** over the timeline, the issues record, the metrics document and the permission audit. Cited by REQ-SESSION-191, REQ-SESSION-133, REQ-SESSION-137, REQ-SESSION-139, REQ-SESSION-140, REQ-ORCH-139, REQ-MONITOR-287, REQ-TOOLS-078, REQ-SANDBOX-112, REQ-GIT-062, REQ-HOOKS-102 and REQ-HOOKS-133 |
| REQ-STARTUP-165 | The **launch preparation** of SR-7: where it lives, what it is keyed by, that an unusable one is redone silently, that it needs no network, and that the **artifact** rather than the preparation is the update target |
| REQ-STARTUP-166 | **Direct detection of shared or synchronised storage, and the warning.** SR-5 refinement 2. It warns and refuses nothing, needs no preference key, and must never be presented as or in place of the per-session refusal of REQ-SESSION-083 and REQ-SESSION-183 |
| REQ-CONFIG-477 | That **configuration must be held as files** and must not be migrated into a store only this application can read, with four independently sufficient grounds |
| REQ-TRACE-513 | That the **requirement documents, the three baselines, the generated symbol artifact and the retired-identifier log** stay plain files in the user's own repository — and, consequently, that REQ-TRACE-502's concurrency obligation stays live over them and no store's concurrency control may be cited as discharging it |

**Owners this round assigns.**

| Owner | What it is the single definition of |
|---|---|
| REQ-SESSION-048 | What a **lock refusal must convey**, in both the same-machine case (another run in this application holds it, naming the pid) and the other-machine case (the session is held by a different machine, when, that liveness cannot be established, and that the store being reachable from more than one machine is the condition to resolve). Cited by REQ-SESSION-083, REQ-SESSION-183, REQ-GIT-020 and REQ-MONITOR-240. The content was previously duplicated across 048 and 083 with no owner |
| REQ-SESSION-033 | The **Windows replacement ladder** — 5 attempts, all within 1 second of the first. It is now the only place in the corpus that states one, and it declares itself so. It governs the session summary file, which every save rewrites (ADR-0003 worked example 1) |
| REQ-EVENTS-166 | What an **export of a session record must guarantee**, for domain 20 and for every other domain. It names the two exports that must exist and states the guarantee in full for both. Cited within domain 20 by REQ-EVENTS-132, REQ-EVENTS-163, REQ-EVENTS-172, REQ-EVENTS-178; across domains by REQ-SESSION-189, REQ-SESSION-199 and REQ-TOOLS-078 |
| REQ-EVENTS-090 | The **line-delimited record terminator**, now unambiguously the export format's rather than a claim about stored bytes. Cited by REQ-EVENTS-089, REQ-EVENTS-172, REQ-SESSION-145 |
| REQ-EVENTS-092 with REQ-EVENTS-094 | The **truncation record**, jointly and solely, now that REQ-EVENTS-093 is withdrawn: the four facts, their indivisibility with the trim, that absence reads as zero, and accumulation over a session id that is never reset |
| REQ-STARTUP-155 | The **first-run exemption** and the definition of "first run" — first run of a given artifact **version**, on a machine, for that user |
| REQ-STARTUP-106 | **"The artifact the launch started from"** as both the flavour-classification input and the update target, in every flavour, superseding the per-flavour phrasing |
| REQ-TRACE-089 | The **consulted-versus-validated** distinction for a traceability index, with the behavioural test that decides it |

**Ownership handed over.** REQ-LIBRARY-087 no longer names a location for artifact body files and cites
REQ-SESSION-002 as the owner of where per-session files live. REQ-CONFIG-010 no longer names locations
for session records, improvement artifacts or delivery records. Domains 01, 02, 05, 06, 09, 10, 19 and 21
no longer restate a session directory layout at all; REQ-SESSION-001, REQ-SESSION-002 and
REQ-SESSION-198 are the sole owners and every other domain is a follower. REQ-ORCH-123 keeps the
five-value check-outcome vocabulary but no longer owns where a check's output is kept.

**Vocabulary boundaries drawn.** Two words now mean two things and the distinction is load-bearing.
*Tombstones*: REQ-CONFIG-192's `retain_tombstones` is the delivery store's own record of retired ids and
is a **row**; the retired-identifier log of REQ-TRACE-130 and REQ-TRACE-513 is a **file in the user's
repository**. *Archive*: REQ-SESSION-131's evicted-page archive **file** is gone; what REQ-CHAT-165 relies
on is the retained released pages, and both documents now use that vocabulary.

**Contradictions between the parallel agents, adjudicated rather than left.**

1. *Saved prompts.* Domain 14 moved the prompt history and stash into the workspace store
   (REQ-LIBRARY-138) on SR-4's principle. Domain 03 still fixed the file
   `<workspace>/.rotaris/rotaris-prompts.json`, its two-space indentation and its key order
   (REQ-CHAT-045), and domain 12 restated it again (REQ-SHELL-157). Three documents, one fact, two
   answers. **Adjudicated for domain 14**: only the application reads those two lists, nothing states a
   user edits them, and REQ-LIBRARY-139 itself calls them a convenience store rather than a record of
   work. REQ-CHAT-045 and REQ-SHELL-157 are now followers and fix no path or format. Everything the
   composer depends on — per-workspace scoping, the 200/100 caps, blanks dropped on load,
   unreadable-reads-as-empty, the no-partial-state guarantee and the "Could not save prompt history"
   notice — is stated in exactly one place each and none was lost.
2. *The session lock's medium.* REQ-GIT-020 fixed a **file** named `lock` with exclusive-create
   semantics; REQ-SESSION-046 had become a **record**. Both stated the same three fields, so they agreed
   about the contract and disagreed about the medium. **Adjudicated for the record**, with the
   `pid`/`host`/`acquired_at` field set kept verbatim as a machine-readable contract shared between the
   two, and neither domain able to change it alone. The single-retry reap, the resolve-toward-live rule
   and every refusal branch survive unchanged.
3. *REQ-EVENTS-084 against REQ-SESSION-089.* ESC-16 amends both and both agents amended their own. They
   now agree: a store that will not open refuses the run, and the reason carries the store's own reported
   error. This was a sequencing risk rather than a real divergence, and it did not materialise.

**Guarantees checked for, one by one, because this is where the last three rounds went wrong.**

- *A reader never sees partial or empty state.* Kept three ways rather than dropped with the atomic
  rename that carried it: REQ-SESSION-028's all-or-nothing save for the store, REQ-SESSION-033 narrowed
  to the files this product still replaces, and REQ-EVENTS-145 for the export document. REQ-EVENTS-091's
  trim and REQ-EVENTS-092's truncation record are now one indivisible step, which **closes** a crash
  window the file design had accepted.
- *A stored history is readable without this product.* Moved, not lost, and strengthened: it is now
  REQ-EVENTS-166's export obligation, discharged by REQ-EVENTS-172 and REQ-SESSION-189, and extended by
  SR-6 to four more records through REQ-SESSION-199.
- *Ordering and single-writer discipline.* REQ-EVENTS-098 keeps the single writer in full and now adds,
  as a requirement rather than an implementation preference, that a reader must not be able to delay or
  block the writer. A transaction supplies atomicity, not emission order.
- *The crash-loss budget.* REQ-SESSION-034 restates it in saves rather than seconds: a crash loses only
  changes for which no save was requested, and a partially applied save is never observable. The
  ten-second window it used to include is gone with the debounce.
- *An untrusted session id can never reach outside its workspace.* REQ-SESSION-151 and REQ-EVENTS-130
  both keep it, restated as lookup-key resolution rather than path validation. Security-bearing and the
  easiest thing in this pass to lose along with a path.
- *Secrets are masked wherever they are carried.* REQ-HOOKS-118, REQ-HOOKS-119 and REQ-HOOKS-133 justified
  masking by "the session directory is readable by anyone who can look inside it". The premise went; the
  masking did not, and its reason is now stronger — those records outlive the run and are carried into
  exports.
- *`source_checksum` identifies what a fixture was captured from.* REQ-UIBENCH-019's digest over a
  directory walk becomes a digest over the canonical serialization of the session's recorded state.
  Reproducibility across hosts, the absent-versus-empty distinction, and the two properties the
  symlink rule bought are all kept by construction.

**Still open after this round.**

- **SR-5's refusal path is nearly unreachable under ESC-15, and the two rulings were made the same day.**
  SR-5 describes a second machine meeting a lock naming a host it cannot probe; ESC-15 then made the
  store machine-local, so that machine gets its own store and never sees the first machine's lock. Every
  requirement SR-5 names was kept and re-based: a foreign-host lock is now evidence the store itself is
  reachable from more than one machine. The owner should confirm that turning SR-5's routine case into a
  defence against a state that should not arise is intended — which is exactly what happened to ESC-10.
- **A machine-local store changes what a backup protects, and no requirement says so.** Under the file
  design, backing up or syncing a workspace backed up its session history. It no longer does. The exports
  of REQ-SESSION-189 and REQ-SESSION-199 are now the only way a user carries their history anywhere
  durable. Correct under SR-5; worth a deliberate decision rather than a discovery.
- **A workspace identifier that is lost or duplicated is an unrecoverable history loss the product cannot
  detect.** REQ-SESSION-197 forbids minting over a readable identifier and requires an unreadable one to
  be reported rather than overwritten. The copied-workspace case — two workspaces sharing one identifier
  and one store, their sessions interleaving — could not be closed without inventing detection no ruling
  authorises.
- **OQ-44 is partly closed and partly live.** REQ-LIBRARY-043's Windows retry ladder is gone as
  authorised. REQ-SESSION-033's is **not**, because summary.md stays a file that every save rewrites, so
  the corpus states exactly one ladder rather than none. What remains live is REQ-TRACE-502's residue:
  the four traceability artifacts stay files, REQ-TRACE-513 now says in terms that no store's concurrency
  properties reach them, and REQ-TRACE-061 requires a failed replace to be re-raised with no ladder.
- **SR-6's export list may be too short by its own reasoning.** Improvement artifacts were readable JSON
  and delivery records were readable files; both are now rows and neither has an export. The argument
  that reaches the four named records reaches these two identically. Not minted, because no ruling covers
  them.
- **ESC-2 and ESC-1 are ruled and unmade.** REQ-CONFIG-252 still states that comments and formatting are
  lost on configuration write-back; REQ-CONFIG-288 still states the shared save path. Neither was in
  scope for the storage passes.
- **`hook-trust.json` carries a security decision that travels with a synchronised or cloned workspace.**
  REQ-HOOKS-096 keeps it as a file and no ruling moves it. That a workspace copied to a second machine
  brings a trust decision that machine never made is unaddressed.
- **REQ-SESSION-016 and REQ-SESSION-138 disagree about when the launch audit is recorded** — "at session
  start" against "once by run startup, after worktree binding and the sandbox verdict". This predates the
  round and OQ 12's disposition sides with 138; the requirements still disagree.

## Standing constraints on what comes next

Implementation agents will receive the approved specifications, approved architecture decisions,
public documentation, and approved design material. They will not receive the reference, the sealed
area, RED findings, or raw audit reports. The repository's `CLAUDE.md` states this boundary so it
applies to every session opened here.

Implementation commits should cite the requirement IDs they satisfy, so the chain from requirement
to code to test stays checkable.

## Design material — how it entered the clean side

The approved visual design is an approved GREEN input under `zone-policy.md`. This section records
what was imported, what was deliberately left behind, and why the distinction was drawn where it
was, because that is a fact about how this repository was assembled rather than a design opinion.

### What was imported

From the product owner's approved Claude Design project, into `docs/design/`:

- `system/` — the design language: `styles.css` and the four token files it imports
  (`tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`),
  `base.css`, `components.css`, `motif.css`, twenty foundation specimen cards under `guidelines/`,
  and twenty-seven components under `components/` — twenty-two primitives and five composed
  patterns, each carrying `.jsx`, `.d.ts` and `.prompt.md`.
- `mockup/rotaris-ui-mockup.dc.html` — the approved visual mockup, a single Design Component file
  showing the language applied to screens.
- `assets/` — the Rotaris mark and five self-hosted OFL-licensed variable font binaries
  (Space Grotesk, Manrope, JetBrains Mono roman and italic), pulled from their official upstream
  repositories rather than from a font CDN.

### What was deliberately not adopted

The **information architecture**: which screens exist, what is on them, how they are grouped, what
they are called, in what order they appear, and which tabs each carries. `REQ-SHELL-023` remains the
single definition of the primary views and their order, and each view's contents come from the domain
that owns them.

Three concrete acts of non-adoption were performed at import time, so that the boundary is visible in
the artefacts rather than only asserted here:

1. The `NavRail` component was stripped of its built-in view list. It now takes its items from the
   caller, and its type declaration and prompt file both name `REQ-SHELL-023` as the source of the
   view set and its order.
2. The mockup's sample requirement identifiers were renamed onto this project's convention, so no
   identifier from the design project's own example domain survives in this repository.
3. `docs/design/README.md` records the mapping in full: which specified view each piece of design
   material serves, which specified views have no design at all, and which design screens have no
   specified counterpart. Nothing in the design material was edited to resolve a disagreement with
   the specification; the disagreements are written down instead.

### The reasoning

The design language — colour, typography, spacing, radii, elevation, motion, the component inventory
and its visual specification, the iconography rules and the copy voice — was designed fresh for this
product. It is original work, it did not pass through the reference at any point, and it is
authoritative for how this product looks.

The screen structure in the same design project was derived from a different product's requirements
documentation. Reading it was **not** a boundary breach: it is not reference source, it is not sealed
material, and no RED or PURPLE output was involved in producing it or in reviewing it. But that
derivation happened outside the clean-room chain that produced `docs/spec/`, and this repository
already holds a cleared definition of the product's information architecture from that chain.
Building the product's structure from the uncleared derivation, when a cleared one exists, would put
material of unestablished provenance into the part of the product where provenance matters most.
So the design language crosses and the screen structure does not. Where the two disagree, the
specification governs.

Standing rule 3 of the zone policy applies to design material as it does to everything else: where it
is unclear whether a detail may cross, it does not cross — it is converted into a requirement, or
recorded in `docs/design/README.md` as design work still to do.

### What did not enter

Nothing from the frozen reference `ROTARIS-CRW-001`, nothing from the sealed area, and no RED
finding, raw audit report or agent transcript from a contaminated context. The design material
carries no reference source, no internal identifiers and no implementation detail from the reference,
because it was never produced from it.

### Two carried-over defects

Both are recorded rather than silently repaired, because they exist in the source material and their
resolution is an Architecture Gate decision:

- The motion tokens disagree between `tokens/effects.css` (90 / 160 / 240 ms, 3 px shift) and
  `guidelines/motion-tokens.html` (100 / 180 / 260 ms, 4 px shift). Both are reproduced verbatim.
- The icon set is currently loaded from a public CDN. That must become a bundled local copy before
  implementation; this application renders offline, and `REQ-SHELL-139` requires the About page to
  render with zero network requests.
