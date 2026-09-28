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
| REQ-CONFIG-231 | The referential-validation rule for `models:` and the role fields — which messages are produced, the order they are produced in, and that a rejected tool name is reported with the accepted names sorted (cited by REQ-CONFIG-465; REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 cited it until A4's round of 2026-09-13 re-pointed them at REQ-TOOLS-001 for the capability classification they had always been reading). It does not own the tool-name registry: it reads the accepted set from the tools-and-permissions domain and says so in its own text |

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
REQ-CONFIG-465. **Three of those four left the row on 2026-09-13**, when A4's round re-pointed
REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 at REQ-TOOLS-001; the row is REQ-CONFIG-465's alone now,
and the correction this paragraph records is finished rather than merely re-aimed.

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

**Closed, 2026-09-13, in A4's amendment round.** All three now cite REQ-TOOLS-001 for the
classification they read. The round that closed it was amending REQ-ORCH-153 for another reason
entirely — the accepted review's item A4 — and took the re-point with it rather than leaving a
second visit to the same sentence owed to a sweep. That is the shape the fifth round's lesson
predicts: the mis-pairing is cheapest to correct in the round that is already reading the
follower's text for something else. REQ-CONFIG-231 keeps the referential-validation rule it does
own, and the run-orchestration resolution record carries the executed note beside the entry that
recorded the debt.

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
| REQ-SESSION-199 | The **SR-6 export obligation** over the timeline, the issues record, the metrics document and the permission audit. Cited by REQ-SESSION-191, REQ-SESSION-133, REQ-SESSION-137, REQ-SESSION-139, REQ-SESSION-140, REQ-ORCH-139, REQ-MONITOR-287, REQ-TOOLS-078, REQ-SANDBOX-112, REQ-GIT-062, REQ-HOOKS-102 and REQ-HOOKS-133 — and, since the ruling-application round, by REQ-TOOLS-190, REQ-LIBRARY-176 and REQ-TRACE-514, which are **not** among the four records it names and cite it for the *terms* rather than for membership |
| REQ-STARTUP-165 | The **launch preparation** of SR-7: where it lives, what it is keyed by, that an unusable one is redone silently **and that one which cannot be made at all is reported once after paint and exempt from the first-paint bound** (clause (c), added in the ruling-application round), that it needs no network, and that the **artifact** rather than the preparation is the update target |
| REQ-STARTUP-166 | **Direct detection of shared or synchronised storage, and the warning.** SR-5 refinement 2. It warns and refuses nothing, needs no preference key, and must never be presented as or in place of the per-session refusal of REQ-SESSION-083 and REQ-SESSION-183 |
| REQ-CONFIG-477 | That **configuration must be held as files** and must not be migrated into a store only this application can read, with four independently sufficient grounds |
| REQ-TRACE-513 | That the **requirement documents, the three baselines, the generated symbol artifact and the retired-identifier log** stay plain files in the user's own repository — and, consequently, that REQ-TRACE-502's concurrency obligation stays live over them and no store's concurrency control may be cited as discharging it |

**Owners this round assigns.**

| Owner | What it is the single definition of |
|---|---|
| REQ-SESSION-048 | What a **lock refusal must convey**, in both the same-machine case (another run in this application holds it, naming the pid) and the other-machine case (the session is held by a different machine, when, that liveness cannot be established, and that the store being reachable from more than one machine is the condition to resolve). Cited by REQ-SESSION-083, REQ-SESSION-183, REQ-GIT-020 and REQ-MONITOR-240. The content was previously duplicated across 048 and 083 with no owner |
| REQ-SESSION-033 | The **sessions domain's replacement ladder** for the session summary file on this machine's own storage, which every save rewrites (ADR-0003 worked example 1). *Narrowed 2026-09-02, not replaced: it stops being "the only place in the corpus that states one", because `REQ-TRACE-061` now states the traceability domain's own, and its attempt count is now stated unambiguously as **six attempts in total — the first and at most five retries, at 0.05 / 0.1 / 0.2 / 0.4 / 0.8 s, the last beginning no more than 1.55 s after the first**. The earlier wording could be read as five attempts or as six; it is resolved to six because that is the reading under which every delay the requirement itself lists is used, and the alternative reading retries strictly less, so nothing is narrowed by the resolution. This row previously recorded "5 attempts, all within 1 second of the first", which was one of the two readings and is superseded.* |
| REQ-EVENTS-166 | What an **export of a session record must guarantee**, for domain 20 and for every other domain. It names the two exports that must exist and states the guarantee in full for both. Cited within domain 20 by REQ-EVENTS-132, REQ-EVENTS-163, REQ-EVENTS-172, REQ-EVENTS-178; across domains by REQ-SESSION-189, REQ-SESSION-199 and REQ-TOOLS-078 — and, since the ruling-application round, by REQ-TOOLS-190, REQ-LIBRARY-176 and REQ-TRACE-514. It remains the **sole** statement of the guarantee: every one of those citers applies it and none restates it |
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
  **Closed in the ruling-application round.** ESC-19 took SR-9(b)'s option 1 *and* half of option 2:
  REQ-SESSION-200 owns the disclosure and REQ-SESSION-201 owns a whole-store backup and restore. The
  configurable store location is refused, so ADR-0058's location decision does not reopen.
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
  **Closed for domain 08 and for two of the five export sites in the platform-defect round.**
  `REQ-TRACE-061` now states its own bounded ladder — five attempts in total, delays 0.05 / 0.1 / 0.2 /
  0.4 s, the last beginning within 0.75 s of the first — covering the generated artifact, the three
  baselines, the retired-identifier log and `REQ-TRACE-514`'s export destination. `REQ-LIBRARY-176`,
  `REQ-SESSION-189` and `REQ-SESSION-199` cite it rather than state a third and a fourth. The constants
  are the traceability domain's own and were deliberately **not** borrowed from `REQ-SESSION-033`, which
  is what OQ-44 and ADR-0004 both refused. What remains live is the two export destinations in domain 20
  (`REQ-EVENTS-145`) that have the one-step obligation without a ladder, and the general question of
  whether a ladder belongs in that requirement or stays a cross-domain citation of `REQ-TRACE-061`.
- **SR-6's export list may be too short by its own reasoning.** Improvement artifacts were readable JSON
  and delivery records were readable files; both are now rows and neither has an export. The argument
  that reaches the four named records reaches these two identically. Not minted, because no ruling covers
  them.
  **Closed in the ruling-application round.** ESC-20 ruled SR-9(a)'s two exports in: REQ-LIBRARY-176 and
  REQ-TRACE-514 are minted. The same ruling replaced the *readership* test with a **redaction-safety**
  test and gave the verification-gate record an export as well, so the list is now closed by a stated
  rule rather than by an enumeration that could go short again.
  **Extended by ESC-30 in the platform-defect round.** The two exports must now tell apart the two
  reasons a record can be absent. `REQ-LIBRARY-047` owns *versions never recorded* and `REQ-LIBRARY-052`
  owns *versions retention dropped*; `REQ-LIBRARY-176` carries both figures separately and merges
  neither; `REQ-TRACE-514` states that its store has only the second cause, because `REQ-TRACE-405`
  makes writing the record a condition of the state-changing action completing, and states so rather
  than leaving it assumed. Both exports are forbidden from carrying an absence figure in a shape shared
  with the other, because one shared mechanism emitting one undifferentiated field would be true of
  neither store.
- **ESC-2 and ESC-1 are ruled and unmade.** REQ-CONFIG-252 still states that comments and formatting are
  lost on configuration write-back; REQ-CONFIG-288 still states the shared save path. Neither was in
  scope for the storage passes.
  **Both closed in the ruling-application round.** REQ-CONFIG-252 now states that comments, formatting
  and layout are preserved, and is the single statement of that discipline for every writer of
  `agents.yaml`. REQ-CONFIG-288 now records the decision against the coupling: the composer's control
  writes its own key and commits nothing else.
- **`hook-trust.json` carries a security decision that travels with a synchronised or cloned workspace.**
  REQ-HOOKS-096 keeps it as a file and no ruling moves it. That a workspace copied to a second machine
  brings a trust decision that machine never made is unaddressed.
- **REQ-SESSION-016 and REQ-SESSION-138 disagree about when the launch audit is recorded** — "at session
  start" against "once by run startup, after worktree binding and the sandbox verdict". This predates the
  round and OQ 12's disposition sides with 138; the requirements still disagree.
  **Closed in the ruling-application round, in favour of REQ-SESSION-138**, which is what the
  architecture record already implements. REQ-SESSION-016 hands the timing over and keeps the two-place
  recording, the five facts, their defaults, the moments each is stamped on the session state, and the
  no-backfill rule. "At session start" is not a defensible alternative reading but an unsatisfiable one:
  two of the five facts are not knowable until the sandbox verdict of REQ-SESSION-086. That argument is
  recorded inside the requirement so the question cannot be reopened on a reading of the words alone.

## The ruling-application round

A ninth round, and the first whose purpose was to close a **class** of defect rather than a set of
instances. Several product-owner rulings authorised specification amendments that were recorded and then
never made, because no workflow was ever scoped to apply them: the pooled terminal backend was still
specified after ESC-5 withdrew it, the plugin file extension was still fixed in four places after ESC-7
withdrew it, and REQ-CONFIG-288 and REQ-CONFIG-252 still stated in the present tense the behaviour ESC-1
and ESC-2 refused. Nobody noticed for two days. The round therefore applied the outstanding amendments
**and** swept every ruling — ESC-1 to ESC-21 and SR-1 to SR-9 — against the corpus, so that the answer to
"which rulings are unlanded?" is a check that can be repeated rather than a memory.

Five agents worked in parallel on ten domain files — 05 with 10; 11 with 06; 07 with 20; and 15, 14, 08
with 21 — and a fifth pass reconciled them, swept the eleven remaining domains, and carried the
consequences into `resolutions/`, this file, the specification index and the Specification Gate.

**Rulings applied in this round:** **ESC-1**, **ESC-2**, **ESC-5**, **ESC-6**, **ESC-7**, **ESC-8**,
**ESC-13** (its withheld half), **ESC-19**, **ESC-20**, **ESC-21**, and the ESC-11 gate follow-through.
**SR-9(a)** and **SR-9(b)** are discharged. Every other ruling was checked and found already applied.

**What was withdrawn.** No identifier. Every withdrawal in this round is at clause or vocabulary level,
and each is recorded *in place* inside the requirement that carried it rather than deleted silently,
because a conformance-test author who has seen an earlier draft needs to be told a value is gone rather
than left to wonder.

| Withdrawn | Where it lived | What survived it, and where |
|---|---|---|
| The terminal backend name `tmux-pool` | REQ-TOOLS-100 | The `backend` **field** is kept for forward compatibility, with the consumer rule made explicit: the single value shipped today is not a closed vocabulary |
| `kill_status` values `pane_replaced` and `replace_failed` | REQ-TOOLS-099 | The two values of the one kill path this product has, `session_reset` and `reset_failed` |
| The pooled-recovery ladder — 3 recoveries in a rolling 10-second window, the fourth-recovery `execution_error` naming an unreachable pool server, the clear-on-completion rule | REQ-TOOLS-103, and a restated figure in the limits table | The guarantee, which was never the ladder's: every call returns an ordinary or a structured error observation and never a partial or malformed one, **whatever the backend is and however it failed** |
| The two-backend observational-parity clause | REQ-TOOLS-187 | Restated forward: because the rule attaches to the shell session and not to the backend, a backend added in a later release cannot change foreground concurrency |
| The `*.py` plugin extension | REQ-TOOLS-165, the domain 05 workspace layout, REQ-CONFIG-277, the domain 15 workspace layout | A stronger, technology-neutral discovery rule: the inventory lists exactly the set `custom_tools:` can load, so it never advertises a file the loader would reject nor hides one it would accept |
| REQ-TOOLS-190's **readership** argument for withholding an export | REQ-TOOLS-190, and again in the domain 05 Data & Formats preamble | The redaction-safety test that replaces it, stated once and owned there |
| REQ-SESSION-069's exact log line `Dropped a stale session write for <id>: …` | REQ-SESSION-069 | Last-requested-wins with its worked case, and the per-session scoping rule — neither of which REQ-SESSION-173 carries. An explicit instruction that no conformance test may look for the withdrawn string |
| REQ-EVENTS-029's comparative conclusion that the history is the more complete of a session's two records | REQ-EVENTS-029 | The crash-completeness property itself, verbatim, plus the negation stated so the conclusion cannot be re-derived |
| REQ-EVENTS-081's "a run driven by a programmatic embedding of the engine" | REQ-EVENTS-081 | The enumeration now cites REQ-SESSION-080's closed set; the guarantee is explicitly stated not to be narrowed by the shorter list, which matters because REQ-EVENTS-001, -002 and -014 were withdrawn **into** this requirement |
| The same phantom run path, in four more places | REQ-HOOKS-083, REQ-HOOKS-089, REQ-TRACE-218, REQ-TRACE-464 | Found by sweeping the corpus for the defect rather than the instance, once REQ-EVENTS-081 exposed it. All four had substituted "a programmatic embedding of the engine" for a withdrawn shell venue during the graphical-only sweep, which put a host the product does not have (REQ-EVENTS-178) on the far side of a comparison — making the comparison vacuous in each case. The two hooks requirements now state the guarantee against REQ-SESSION-080's closed set, with the trust gate declared a property of the run and never of the surface; REQ-TRACE-218's second independent host is the project's own test suite, which it already named, with the added test that a suite reaching the seam only through the desktop worker is not a second consumer; REQ-TRACE-464's clause is about a composition lacking a coordinator and holds for any such composition. No guarantee is narrowed in any of the four, and each says so |
| REQ-SESSION-016's "at session start" timing claim | REQ-SESSION-016 | REQ-SESSION-138 as sole owner of the timing; the state-stamping moments are now stated explicitly, which "at session start" had been the only thing to say |
| REQ-UIBENCH-054's element-count invariant | REQ-UIBENCH-054 | A bound on the count's variation across two comparisons, carried by a new `widgets_samples` field at REQ-UIBENCH-058's existing 11 indices, plus the retained absolute that a later record below the `construct_window` figure is a defect |
| REQ-UIBENCH-118's and REQ-UIBENCH-099's claim to state the only absolute threshold | both | The accurate distinction: 100 ms is fixed rather than comparative, and the benchmark enforces none of the three because all seven booleans are informational (REQ-UIBENCH-088) |
| REQ-UIBENCH-119's "no invariant reads it" | REQ-UIBENCH-119 | The informational character it was protecting, restated accurately: no threshold, never fails an operation |
| REQ-CONFIG-288's cross-surface save coupling | REQ-CONFIG-288 | The requirement's own demand that "a rewrite must decide about this cross-surface coupling explicitly", now discharged as a recorded decision rather than a deletion |
| REQ-STARTUP-123's "does not establish who produced the artifact" | REQ-STARTUP-123 | The transfer-integrity guarantee, preserved verbatim; the four hash-failure sentences are untouched because REQ-STARTUP-120 consumes them as a contract |
| REQ-SANDBOX-101's "only the presence of that channel is tested" | REQ-SANDBOX-101 | The half that was right — presence is not answering — split out and pointed at its two real owners, while the half that was wrong is corrected to REQ-TOOLS-053's capability test |

**What was minted.** Seven identifiers.

| Minted | What it owns |
|---|---|
| REQ-SANDBOX-130 | The **plain no-confinement disclosure** of ESC-6. One fact — this host cannot confine anything, so every agent command runs with the account's own privileges and no `runtime.sandbox_mode` value changes that — required on **two** surfaces: beside REQ-SANDBOX-116's availability label without the user having to select a mode first, and on REQ-SANDBOX-119's launch dialog before the run begins, for attended and unattended sessions alike and also when REQ-SANDBOX-107's advisory is empty. Text, never colour (REQ-SHELL-149). Adds no capability and moves no verdict |
| REQ-STARTUP-167 | **Publisher authenticity for updates** (ESC-8), and the single definition of that vocabulary. Every artifact carries the verification counterpart of the signing key within itself and resolves it with no download (REQ-STARTUP-159); the trusted set is fixed when the build is produced and nothing at run time adds to, replaces or disables it, because a trust anchor a network can replace establishes nothing; what this establishes and what it does not; and that there is no override by which an unverified update installs |
| REQ-STARTUP-168 | **Key rotation stated behaviourally**, as the ruling required. A build trusts a *set*; a release is signed with a key carried by every artifact it may be offered to, decidable before publishing and decided at the REQ-STARTUP-156 gate; a key withdrawn before that can be satisfied strands self-update for the affected installations, which keep working and refuse rather than install unverified; a withdrawn key signs no further release and ships in no later build. Nothing about key generation, custody or transfer is specified |
| REQ-SESSION-200 | The **backup disclosure** of SR-9(b) as re-affirmed by ESC-19. The product states, itself, that backing up, copying, cloning or synchronising a workspace does not carry that workspace's session history; names what is outside such a backup and what is carried; says where the two remedies are; and may not be delivered only inside a failure or remediation message, because a user who has already restored a workspace and found no history in it has been told too late |
| REQ-SESSION-201 | The **whole-store backup and restore** of ESC-19. One artifact over the store and the per-session files held with it; a destination chosen through the platform's save dialog; valid while runs are live and yielding a state a reader could have observed at one moment; restored only when explicitly asked for, never automatically, never silently merged, refused while any session in the target store is live, and carrying the workspace identifier it was taken from |
| REQ-LIBRARY-176 | The **improvement store exports** of SR-9(a), including the recorded version history REQ-LIBRARY-168 calls "the audit trail the write path keeps", exported as an audit with pruning disclosed |
| REQ-TRACE-514 | The **delivery store exports** of SR-9(a), including each transition's acting party, time and stated reason, and an override's grounds. Explicitly **not** a fifth toolchain operation, and explicitly carrying the delivery store's own retired ids and never the toolchain's retired-identifier log |

**Owners this round assigns.**

| Owner | What it is the single definition of |
|---|---|
| REQ-TOOLS-161 | What a **plugin file is** — a module the host process can load and call directly — and the rule that no programming language, runtime, packaging form or file extension is fixed here or anywhere else in the specification, and that no requirement may reintroduce one by naming a file suffix in passing. REQ-TOOLS-165, the domain 05 workspace layout, REQ-CONFIG-277 and the domain 15 workspace layout are all followers |
| REQ-TOOLS-190 | The **export-eligibility test**: a record gains an export when it carries no unredacted user or tool content, and does not gain one when it does. It also holds the one absolute exclusion — REQ-SESSION-136's tool-call evidence record must never gain an export, and a future requirement proposing one is in conflict with this requirement and must be refused rather than reconciled. REQ-EVENTS-163 and REQ-LIBRARY-176 are followers; REQ-SESSION-199 and REQ-EVENTS-166 remain the owners of the export *obligation* and *guarantee* respectively, which this requirement cites rather than restates |
| REQ-TOOLS-100 | The **`backend` field**, and the fact that exactly one terminal backend ships. Recorded so that a later pass does not re-close the vocabulary. REQ-TOOLS-099 and REQ-TOOLS-187 are citers |
| REQ-CONFIG-252 | The **write-back preservation discipline** for `agents.yaml` — comments, formatting and layout preserved by every writer of it. Before this round no requirement owned it and one requirement denied it. REQ-CONFIG-441 cites it; it applies to REQ-CONFIG-248, REQ-CONFIG-256 and REQ-CONFIG-027 |
| REQ-CONFIG-288 | How the **composer's permission-mode control writes** — one key, through the scoped per-field writer, committing nothing else. It was an open decision handed to a rewrite; it is now a definition. Cited by REQ-CONFIG-328, REQ-CONFIG-423 and REQ-CONFIG-441 |
| REQ-STARTUP-167 | **Publisher authenticity for updates**, declared so in its own text; other documents cite it rather than restate it |
| REQ-SESSION-138 | **When the launch audit is recorded.** REQ-SESSION-016 and REQ-SANDBOX-108 are followers. This closes a disagreement the previous round recorded and could not settle |
| REQ-UIBENCH-050 | The **two structural counting rules**, with the framework-neutral reading now stated as operative in the requirement rather than inferred from a resolution row. REQ-UIBENCH-054 remains the owner of the rule REQ-UIBENCH-085 reports |
| REQ-SANDBOX-130 | The **no-confinement disclosure**; REQ-SANDBOX-116 is a citer |

**Followership recorded rather than assumed.** REQ-SANDBOX-101 now says in its own text that it holds no
second copy of the attended test and follows REQ-TOOLS-053. REQ-SESSION-201 says in its own text why it
does not violate REQ-SESSION-199's no-duplicate rule — an export is a record rendered so that software
knowing nothing about this product can read it, a backup is the store rendered so that this product can
put it back — and REQ-SESSION-199 gained the matching clause from the export side, so the boundary is
stated from both directions.

**Guarantees checked before their mechanisms were rewritten.** The standing rule bit at five points and
changed what was done at all five.

- *REQ-TOOLS-103's well-formed-observation guarantee.* Scoped to "a failure of the pooled backend"
  before; generalised rather than deleted, with a sentence in the text telling the next reader that the
  ladder went and the guarantee stayed.
- *REQ-TOOLS-165's discovery filter.* The `*.py` filter was doing real work — it decided what the
  inventory lists. Deleting it without replacement would have left the tab undefined; the replacement is
  strictly stronger, because an extension filter can list a file the loader rejects.
- *REQ-SESSION-069's ordering guarantee.* REQ-SESSION-173 states last-requested-wins as a cross-cutting
  invariant but carries neither the running-before-completed worked case nor the per-session scoping
  rule, so both stay in REQ-SESSION-069 and the owner/follower relation is now explicit.
- *REQ-UIBENCH-054's no-accumulation guarantee.* Relaxing to a comparison between phase records alone
  would have deleted it: with one record per phase and content changing between phases, a leak confined
  to `tail_replacements_1000` is indistinguishable from content having been drawn. The guarantee is
  carried by sampling `widgets` at the 11 indices the phase already samples `rss` at.
- *REQ-STARTUP-165(f)'s indistinguishability guarantee.* A run started from a preparation is still
  behaviourally indistinguishable from any other; only the **silence** rule is narrowed, and it is
  narrowed by naming the one outcome it does not cover rather than by carving an exception out of (f).

**Two contradictions between the parallel agents' grants, adjudicated in the reconciling pass.** Both
were instances of the same failure mode: a ruling whose two halves lived in two documents owned by two
agents, so neither could close it.

1. *ESC-7 in domain 15.* The domain 05 agent withdrew the `*.py` extension; REQ-CONFIG-277 and the
   domain 15 workspace layout still stated it, and the domain 15 agent was not scoped to ESC-7. Both are
   now followers of REQ-TOOLS-161 and hold no second definition.
2. *ESC-20 in domain 20.* REQ-EVENTS-163's "their exports (REQ-EVENTS-166) are equally distinct" read as
   granting an export to the tool-call evidence record — the exact widening REQ-TOOLS-190 now forbids,
   sitting in another document. It is narrowed, and now states which records on its list have an export
   and which never will.

A third instance was caught inside a single grant and is recorded because it is the same pattern:
REQ-TOOLS-077 stated ESC-1's refused coupling in domain 05, where the agent holding ESC-1 could not
reach it.

**Still open after this round.**

- **The architecture record has not caught up with ESC-19, ESC-20 or ESC-21**, and is not expected to
  have: those three were ruled on 2026-09-01 against comparative evidence and the architecture pass that
  carries them has not run. This is a separate pass, not a defect in this one.
- **`docs/architecture/proposals/runtime.md` constraint C3.6 still mandates REQ-SESSION-069's withdrawn
  log line verbatim, as a HARD constraint.** It is the only place in the repository that still requires
  the string. Until it is corrected an implementer working from the proposal will produce a message the
  specification now forbids, and the two documents disagree invisibly unless both are read.
- **ADR-0020 and `proposals/exec.md` still carry ESC-5 as an open escalation**, with constraint C-74
  stating the four-value `kill_status` set and the two-name backend vocabulary the specification has
  withdrawn.
- **REQ-SESSION-201 has no architecture home.** ADR-0058 says nothing about backup or restore. The
  hardest unaddressed part is not the store but the **per-session files** held with it, which no store
  engine's online-backup facility covers and which REQ-SESSION-200 names as outside a workspace backup.
- **The backup artifact is a new exfiltration surface and nothing requires it to be protected at rest.**
  One file holding every session's unredacted tool-call arguments, the full permission audit and every
  artifact body, for a whole workspace, which a user will naturally put on removable media or a cloud
  drive. REQ-SESSION-201 requires the contents to be disclosed where the action is offered; encryption
  and passphrase were deliberately not invented in a requirement.
- **REQ-STARTUP-168(c) accepts in writing that a compromised signing key strands an installed
  population's ability to self-update** until each user downloads by hand. That is the honest consequence
  of shipping the trust anchor inside the artifact and refusing any run-time path to change it, but it is
  a real user-visible cost the owner has not explicitly ruled on.
- **ESC-8's signature protects the update path only.** A user downloading by hand from the release page
  still gets an unsigned binary and can check only its digest; REQ-STARTUP-035's verification hint was
  deliberately not extended, because doing so would require naming a signature-verification tool and
  therefore a technology.
- **Domain 14 states no redaction obligation over an improvement-artifact evidence entry's excerpt**,
  which REQ-LIBRARY-010 allows to hold quoted source text. ESC-20 rules the export in explicitly and
  gives its ground, so the export is applied; but the general test it states is not obviously satisfied
  by an excerpt, and closing that would be a new obligation needing a ruling.
- **REQ-SESSION-200's surface is under-constrained by design.** It is anchored to REQ-SESSION-182's
  session-management place, which is the only surface domain 07 owns. A user who never opens that surface
  and simply backs up their machine may still miss it. ESC-6's precedent for the analogous gap was two
  surfaces; a second one here would be a requirement in domain 13 or domain 15.
- **ESC-21's refusal has an availability cost.** A user whose repository legitimately lives in a
  synchronisation client's tree, working alone on one machine, cannot integrate worktrees at all even
  though nothing is contended, and the remedy the message offers is "move your repository". The
  requirement marks the strength as under review, which is what spike 19 weighs.
- **REQ-STARTUP-165(c)'s notice is the first thing in the product that reports anything about a launch
  preparation**, against a requirement whose preamble says preparations are invisible. It is bounded as
  tightly as it can be, and if the owner's intent was invisibility without exception this is the
  amendment to reverse — at the cost of the 13–19 second unexplained launch spike 17 measured.
- **Spike 19's retained scope should be widened in writing.** ESC-15 redirected it to "whether anything
  else the product writes into `.rotaris/` misbehaves on synchronised storage"; ESC-21 gives it a second,
  distinct question — refusal against warning for the integration lock — and REQ-GIT-128 now names it.

## The defect-correction round

A tenth round, 2026-09-02, and the first driven by a reader outside the specification. An architecture
pass read the amended corpus closely enough to implement it and returned **twelve defects**: ten the
specification's, two the architecture's own. Four were named as defects that would cause a conformant
implementation to be **built wrong**, and none of the four is discovered by testing. That is the
strongest kind of finding this process can produce — the specification was not merely under-determined,
it said two incompatible things in places where a builder has to pick one — and it is worth recording
that every one of the four was found by trying to build from the document rather than by re-reading it.

Four agents worked in parallel on nine domain files — 06 with 11; 07 with 20; 08 with 14; and 15, 04
with 03 — and a fifth pass swept the remaining twelve domains, reconciled the two machine-readable
contracts across the whole corpus, and carried the consequences into `resolutions/`, this file, the
specification index and the Specification Gate.

**One identifier minted, none withdrawn.** `REQ-CONFIG-478` owns what a fatal configuration load
failure conveys and how a user recovers from it. Three clause-level withdrawals were made and each is
recorded *in place* with the withdrawn text quoted rather than deleted.

### The rule this round was run on

**A machine-readable contract has exactly one home.** Two of the twelve defects were the same defect:
a document shape stated in two requirements that had drifted apart. The round did not fix the two
instances and stop. It gave each contract a single owning requirement that says so in its own text,
turned every other statement of it in the corpus into a citation, and recorded as withdrawn — with the
literal quoted and an explicit instruction that no conformance test may look for it — every spelling
that lost. The sweep covered follower requirements, Data & Formats tables and resolution logs, in the
retired domains as well as the shipping ones, because a retired document that fixes a rival key
inventory is a rival key inventory.

### Ownership recorded by this round

| Owner | What it is now the single definition of | Citers |
|---|---|---|
| `REQ-GIT-128` | Both integration-lock refusal texts — `Another worktree integration is already running.` for a busy lock and `Could not acquire worktree integration lock.` for an unreapable one — and that there is **one** already-running refusal serving both the precondition check and a failed acquisition | `REQ-GIT-124`, `REQ-GIT-145`, `REQ-GIT-151` |
| `REQ-STARTUP-163` | When two directory strings name the same directory: what is resolved, what is deliberately not reconciled, and the bounded cost of not reconciling it. **Not** the definition of workspace identity, which is `REQ-SESSION-197`'s and is never derived from a path | `REQ-STARTUP-041`(a), `REQ-STARTUP-052`, `REQ-SHELL-010`, `REQ-SHELL-021`, `REQ-HOOKS-092`, `REQ-HOOKS-097` |
| `REQ-STARTUP-165`(c) | The run-scoped placement and its closed set of two permitted locations; (d)'s prohibition names it as its single exception | `REQ-STARTUP-150`, `REQ-STARTUP-151`, `REQ-STARTUP-152`, `REQ-STARTUP-159`, domain 11 Data & Formats |
| `REQ-EVENTS-144` | The batch trajectory wrapper: its closed three-key inventory `trajectory_version`, `count`, `trajectories`; that `count` equals the element count of `trajectories`; that the documents travel unaltered in selection order; and that the inventory is exhaustive | `REQ-SESSION-189`, `REQ-SESSION-193`, `REQ-EVENTS-173`, the Data & Formats tables of domains 07, 18 and 20, and domain 18's `REQ-CLI-237` withdrawal |
| `REQ-EVENTS-056` | The record locator: its form `<record kind>#<record id>`; the closed record-kind token set `issues`, `permission_audit`, `tool_call_evidence`; the obligation that a named kind's own requirement supply a stable, non-reused, entry-distinguishing identifier; the resolution rule through an export and the stated consequence where a kind has none; and the prohibition on any export dereferencing a locator | `REQ-SESSION-135`, `REQ-SESSION-199`, `REQ-TOOLS-079`, `REQ-TOOLS-081`, the Data & Formats tables of domains 05, 07 and 20 |
| `REQ-TOOLS-079` | The identifier of a permission-audit **decision** entry — the only place it may be fixed, on `REQ-EVENTS-056`'s instruction — **and, since ESC-31 was ruled and applied on 2026-09-02, that it is a field of the entry**, carried inside it under the same field in every entry and in every export, because `REQ-EVENTS-056` requires the locator to resolve through the export on a machine carrying none of this product's code. *This row previously read "where that identifier lives is deliberately left open (ESC-31)"; that is superseded.* The requirement also owns that a mode-change entry has none and is owed none, and that the identifier discloses no argument of the call | `REQ-EVENTS-056`, `REQ-TOOLS-081`, `REQ-SESSION-199`, `REQ-SESSION-137` |
| `REQ-TRACE-089` | The index write carve-out, bounded by four named tests — confinement, observable inertness, no budget relief, and being a precondition of nothing — in addition to the consulted-versus-validated distinction it already owned. **This requirement must not be edited casually**: narrowing it silently changes `REQ-TRACE-090`, `REQ-TRACE-152` and `REQ-TRACE-408` together | `REQ-TRACE-090`, `REQ-TRACE-152`, `REQ-TRACE-408`, `REQ-TRACE-513` |
| `REQ-TRACE-405` | The delivery store's retention-disclosure obligation: retain enough to state how many history entries retention dropped | `REQ-TRACE-514` |
| `REQ-LIBRARY-052` | The improvement store's retention-disclosure obligation, scoped to **pruning only** | `REQ-LIBRARY-176` |
| `REQ-CONFIG-478` | What a **fatal** configuration load failure conveys and what recovers from it. `REQ-CONFIG-237`, `REQ-CONFIG-018`, `REQ-CONFIG-019`, `REQ-CONFIG-462` and `REQ-CONFIG-239` add to rather than replace its floor. *This row previously read "including the withdrawn-key case". That case is no longer fatal and moved to `REQ-CONFIG-183` when ESC-28 and ESC-29 were applied on 2026-09-02; the obligations are marked in `REQ-CONFIG-478` as relocated rather than withdrawn, with a pointer, so the move is visible rather than silent.* | `REQ-CONFIG-183`, `REQ-CONFIG-192`, `REQ-CONFIG-194`, `REQ-CONFIG-233` |
| `REQ-CONFIG-183` | *Split from `REQ-CONFIG-478` on 2026-09-02.* What happens to a key under `requirements:` — the unweakened hard load failure for a key this specification has never defined, and the **reported-and-ignored** outcome for a key it defined and withdrew or names as not a configuration key of this domain — together with what that report conveys, the grounds for the departure, and that the product never edits the user's file to repair it | `REQ-CONFIG-192`, `REQ-CONFIG-194`, `REQ-CONFIG-233`, `REQ-CONFIG-477`, `REQ-GIT-074` and domain 06's configuration-surface appendix |
| `REQ-CHAT-055` | The measurement point at which transcript update cost is read — the moment the interface has finished showing the update, and expressly not the duration of the synchronous call | `REQ-CHAT-154` |

`REQ-SESSION-133` was used as the **model** for the two retention-disclosure obligations and was
deliberately not made their owner. It owns the session retention caps, not a general cross-domain
principle; three stores each owning their own obligation is correct, and one owner with two
cross-domain followers would have been wrong. Recording that here stops a later reader collapsing the
three into one.

`REQ-PROVIDER-063` keeps its identifier and changed only its location: the Copilot gateway staging
directory is out of the workspace and under the per-user data directory, keyed by the workspace
identifier `REQ-SESSION-197` fixes and never by a path. Nothing was withdrawn with the move — the
environment variable name, both file names and the exact shape of `api-key.json` are preserved
character for character, because those are the third-party contract and the directory's own name never
was one.

### Vocabulary minted

Three record-kind tokens, fixed by `REQ-EVENTS-056` and closed at three: `issues` (already in the
corpus), `permission_audit`, `tool_call_evidence`. The third is deliberately **not** `tool_calls`,
because that string is already a summary count in the trajectory document (`REQ-EVENTS-136`) and in the
metrics document (`REQ-SESSION-139`), and a token that reads like a document key in the same exported
material is the confusion a machine-readable contract exists to prevent. Each token names the record,
not the thing recorded. Admitting a fourth is an amendment to `REQ-EVENTS-056` and to nothing else.

### Withdrawn at clause level, recorded in place

- `REQ-SESSION-189`'s batch wrapper inventory `{"trajectory_version": 1, "sessions": [<document>, …]}`
  and its "carries no fields of its own beyond them" clause. Survived by `REQ-EVENTS-144`'s equally
  closed inventory, which carries the version key, the array key, selection order, closure and the
  consumer-compatibility rationale — checked clause by clause before the literal was removed. **No
  conformance test may look for a `sessions` key on a batch document.**
- `REQ-GIT-124`'s spelling of the busy integration-lock refusal, `A worktree integration is already
  running.` It occurs nowhere in the corpus; `Another worktree integration is already running.` occurs
  exactly once, in its owner. `REQ-GIT-124`'s four refusal conditions and its ordering rationale are
  intact and its closing "when none of the four applies" still counts correctly.
- The two export-document shapes the retired domain 18 fixed in its Data & Formats section — a
  trajectory document as `schema_version`, `session_id`, `workspace`, `exported_at`, `run_count`,
  `truncated`, `event_count`, `events`, and a batch document as `schema_version`, `exported_at`,
  `session_count`, `sessions`. Both cited `REQ-CLI-237`, which the same document had already withdrawn,
  and both disagreed with the live owners on every key name that differs. The withdrawal is recorded in
  the document and in `resolutions/18-cli-headless.md` row 36, whose surviving half — the content of the
  two export warnings — is called out so it is not lost with the shapes.

### Narrowings, and what was checked before each

- `REQ-EVENTS-056`'s promise that a locator resolves "whether the consumer reads it through this
  application or through the export of that record kind" was unconditionally false for a kind with no
  export, which is the case the tool-call evidence record depends on. Narrowed to kinds that have an
  export, with the no-export case stated as the **intended** outcome that must not be closed by
  widening an export. Nothing was lost: the guarantee was undeliverable for the one kind it excluded.
- `REQ-TRACE-090`'s purity was preserved by an **observability** test rather than by carving out a class
  of writes, so the exception cannot grow: anything an index write could reach that a user or another
  tool can see is outside it by construction. "Verification SHALL be pure … writes nothing" and "Plain
  checking SHALL NEVER write" stand word for word.
- `REQ-CHAT-055` settles a reading, not a budget. It fixes no figure, threshold or tolerance that
  `REQ-CHAT-157` does not already fix, and `REQ-CHAT-154` now cites it rather than carrying the same
  ambiguity.
- `REQ-STARTUP-043`'s parenthetical is stated to be a closed list of the activities that requirement
  constrains — neither an enumeration of everything a shown window then does, nor permission for an
  unnamed activity to precede the show. `REQ-WORKSPACE-014` already enumerated the same four and already
  deferred, so the closed reading was in the corpus before it was stated.

### What this round did not settle

- **ESC-26 is untouched and remains with the product owner.** `REQ-SESSION-197` and `REQ-SESSION-201`
  were not amended, and nothing in this round pre-empts either option the escalation offers.
  `REQ-STARTUP-163` cites `REQ-SESSION-197` only to state a boundary — path identity is not workspace
  identity — which decides nothing the escalation asks.
- **Five product decisions were raised rather than taken** (ESC-27 to ESC-31), enumerated in the
  Specification Gate. Each changes what a user sees, which is why none was decided by an editor.
- **The second half of the tenth defect is open.** Nothing says which per-user data location is meant
  on a platform offering both a roaming and a machine-local one. `REQ-SESSION-198`, `REQ-STARTUP-165`(a),
  `REQ-PROVIDER-014` and `REQ-PROVIDER-063` each state machine-local for themselves, so the corpus is
  satisfiable and no build that reads them is wrong; the silence sits in `REQ-STARTUP-145`, and closing
  it is one clause.
  **Closed by amendment in the platform-defect round, 2026-09-02.** `REQ-STARTUP-145` now states, once
  and at the definition, that where a platform offers both, the product's per-user configuration and
  data directories are the location local to this machine, that this governs over the platform's own
  default, and that conformance is decided by the directories the product actually writes to. It
  declares itself the single statement of the property. All four requirements that restated it now cite
  it instead, `REQ-STARTUP-161`'s instance record gained the property it never had, and `REQ-SHELL-006`'s
  desktop preference store — which is **not** one of `REQ-STARTUP-145`'s directories and so inherited
  nothing — gained the same selection with its own reason.
- **No requirement places the workspace-store open after the window is shown.** `REQ-STARTUP-043` was
  believed to, and after this round demonstrably does not. Whether such a requirement should exist is
  domain 07's, and it may be architecture's choice rather than a specification gap, since
  `REQ-STARTUP-155`'s first-paint bound already constrains the outcome on either side of the show.

## The measurement round

An eleventh round, 2026-09-02, and the first driven by **measurement** rather than by reading. Four
architectural spikes were run on the target platform — a store on remote and synchronised storage, the
transaction commit on the publish path, the prepared portable's launch, and presenter liveness with the
single-instance claim. **Every product-owner ruling survived.** What the round did to the specification is
narrow and is recorded here in full, because the round's *architecture*-side output was much larger than
its specification-side output and a reader could easily assume the reverse.

**One identifier minted, none withdrawn, five amended in place. Live behaviour grew by one and no
requirement's strength was reduced.** Minted: `REQ-EVENTS-179`. Amended: `REQ-SESSION-197`,
`REQ-SESSION-201`, `REQ-SESSION-089`, `REQ-EVENTS-084`, `REQ-EVENTS-088`. Counts move from 3,949 / 258 /
3,691 to **3,950 / 258 / 3,692** on the shipping side, and from 4,393 to **4,394** in all. The two retired
domains are untouched.

### ESC-26 applied, and how the exception was written so it cannot be widened

The owner ruled ESC-26 on 2026-09-01: `REQ-SESSION-197` gains one narrow exception — a restore MAY
establish the workspace identifier when the user explicitly confirms it, and no other action ever may.
**The whole exception is stated in `REQ-SESSION-197`**, because that is where the absolute rule lives and
where a later reader looking to widen it will be standing; `REQ-SESSION-201` carries only a pointer, which
is not decorative, because a reader of the restore action would otherwise not know the confirmation
exists. That follows the rule the defect-correction round was run on: **a machine-readable contract, and a
behavioural one, has exactly one home.**

Three choices in the drafting were aimed at a later reader rather than at an implementer, and they are
recorded because they are the part a compression pass would remove first.

- The requirement **names the specific paths that do not gain the exception** — opening or preparing a
  workspace, `REQ-SESSION-060`'s explicit repair, a migration, an update, a later convenience — rather
  than only saying "no other path".
- It says the exception is **unavailable unless every one of the five conditions holds**, so it cannot be
  adopted in part.
- It closes with **why** it is confined: the rule it excepts protects against a folder moved, renamed,
  copied or merely spelled differently, which is constant, while the recovery arises once in a workspace's
  life if it arises at all — so relaxing the rule generally would trade a constant protection for a rare
  recovery. **An implementation that finds this exception useful anywhere else has drawn the wrong lesson
  from it.**

That reasoning is stated in **product terms** rather than by citing the comparative survey of other
harnesses that produced it, because a specification states observable behaviour and its reasons, not
evidence about other products.

### The gap a measurement exposed, and why it needed a requirement rather than an ADR

`REQ-EVENTS-084` governed a store that could not be **opened**. `REQ-EVENTS-088` governed a write failing
**during** a run. The storage measurement found that in every failing configuration the store **opened
successfully**, reported itself not read-only, and threw on the first statement after — a case belonging
to neither as written, and reproducible 30 times out of 30. The report's own verdict row recorded it as
"INCONCLUSIVE, and a gap is exposed" and asked for an owner.

`REQ-EVENTS-179` is that owner. A store that reports itself open is not yet known to be usable and MUST be
**established as usable** before the run starts. **Nothing the store reports about itself is sufficient
evidence** — it may report the open a success, report itself writable, return every setting read back
exactly as applied, create the further files it keeps alongside itself at their expected sizes, and still
fail on the next operation, and may fail on that operation every time while everything after it succeeds.
The check MUST be an operation that reads and writes the store's own contents — a write made and then
undone, so nothing is added — and MUST NOT be a reading back of what the store says about its state. It
sits where `REQ-EVENTS-035` puts establishing the store and runs before `REQ-EVENTS-087` creates the
history. Where it fails, the store counts as one that could not be opened and `REQ-EVENTS-084` governs
unaltered. **And the failure MUST NOT be retried into success, swallowed, or reduced to a warning: exactly
one attempt, its outcome decides, and a store that fails and then works still refuses the run.**

Two things about the drafting are worth recording. **No engine is named.** The measured facts were
engine-specific — a journal-mode pragma returning and reading back as set, a shared-memory index file
created at a particular size, a specific error on the next statement — and they are stated as observables
any implementation of any store must satisfy. And **the hardest clause is the no-retry one**, because it
forbids the thing that makes the symptom go away: the measurement found 30 of 30 opens throwing on the
first statement followed by 6,000 of 6,000 commits succeeding, so the store works if you simply try again.
The reason is written into the requirement — retrying yields a product that runs on storage it has already
been told is unsound, with no later moment at which it can say so — precisely so the clause is not read as
excessive caution. **It is the only clause in this round whose violation looks like success, and it should
have a conformance test.**

### What this round checked and deliberately did not change

- **`REQ-SESSION-070` needed no amendment and none was made.** A measurement read a terminal status back
  immediately at the weaker durability setting, across two operating-system processes and two different
  bindings. The requirement is already stated purely as **readability** — it names no durability level, no
  sync setting and no power-loss survival — and its trailing "durable" is this specification's own sense,
  fixed by `REQ-SESSION-067` and by `REQ-SESSION-034`'s crash-loss budget, which is explicitly about a
  killed process and a half-written record rather than a power cut. **The false reason is not in the
  specification; it is in an architecture record, and it has been corrected there.** No clarifying note
  was added, because that would be an amendment where none was needed and it would put the correction one
  document away from the error.
- **`REQ-SESSION-198` needed no amendment** even though a measurement disproved the mechanism the ruling
  behind it stated. The requirement states the machine-local rule **as a rule**, not as a consequence of
  that mechanism, and explicitly forbids making the store's location conditional on detection — which the
  measurement supports, detection being real and cheap for providers that register with the platform and
  blind to those that do not.
- **`REQ-SESSION-200`'s disclosure was left alone.** Its sentence that the identifier travels with the
  workspace "so a workspace moved, renamed or restored on this machine finds its own sessions again" is
  still true; a reader now has to reach `REQ-SESSION-201` and `REQ-SESSION-197` to learn that restoring
  onto a **different** machine is also complete, via the confirmed exception. That is a one-clause
  amendment if the owner wants the disclosure to carry it, and it was judged sprawl rather than a defect.

### What this round did not settle

- **Five product decisions raised by the defect-correction round remain unruled** — ESC-27 to ESC-31.
  Nothing in this round reads on any of them.
  **All five were ruled on 2026-09-02 and all five are applied**, together with ESC-22 and ESC-24, in
  the platform-defect round recorded below.
- **One conformance property fails in one configuration and no requirement states the rule that prevents
  it.** Where one store file is reached through two path spellings on one machine, two writers each report
  full success while up to 95 % of committed rows vanish with a clean integrity check, and
  `REQ-EVENTS-098`'s non-blocking property fails there. Under `REQ-SESSION-198` the store is machine-local
  so the configuration should not arise — but nothing in the specification states that the store's
  location must resolve to **one canonical spelling**. The architecture now states it as a rule and as a
  constraint; whether a requirement should is domain 07's or domain 20's.
- **`REQ-EVENTS-098`'s "a reader MUST NOT be able to delay or block the writer" is unsatisfiable on its
  literal reading.** A compliant reader measurably raises the writer's commit latency while never blocking
  it, and no store can offer no scheduling effect. The requirement's own following sentence fixes the
  sense as *blocking*, and the architecture record takes that reading and names it as a reading — but a
  conformance test written from the literal words fails every possible implementation. Reported, not
  amended: which of the two is meant is a decision, not an editorial fix.
  **Closed by amendment in the platform-defect round.** `REQ-EVENTS-098`'s single closing sentence is
  now three separately citable clauses — (a) the blocking prohibition, absolute in both directions; (b)
  that what a writer durably recorded must become observable to a reader, *later* never meaning *not at
  all*, and failing no less for reporting nothing; and (c) that concurrent reading which measurably
  raises the writer's latency has **not** blocked it, so a conformance test asserting that a writer's
  timings are unaffected rejects every store there could be. Clause (b) is what still catches the
  measured two-spelling failure; clause (c) is what stops a correct store being failed for it. The cost
  is bounded by citation to `REQ-MONITOR-218` and `REQ-MONITOR-222` rather than by a number invented at
  the requirement.
- **`REQ-EVENTS-179`'s probe has not itself been measured.** The measurement established that only a write
  detects the condition; it did not measure what a made-and-undone write costs on the startup path, and
  `REQ-EVENTS-035` puts establishing the store before any part of run start-up can fail.

## The platform-defect round

A twelfth round, 2026-09-02. Where the measurement round was driven by four spikes, this one answers an
architecture pass that measured the corpus against the target platform **eight** times and returned
**three defects that would each cause a conformant implementation to be built wrong, none of which any
test would find**, together with the seven owner rulings of 2026-09-02 — **ESC-22, ESC-24 and ESC-27 to
ESC-31**. Four agents landed the defects and the rulings across eight domain files; a fifth swept the
rest of the corpus, the resolution records, this file and the Specification Gate.

**Two identifiers minted, none withdrawn. Live behaviour grew by two and no requirement's strength was
reduced.** Minted: `REQ-MONITOR-306` (the aggregate bound on the rate at which live terminal output
reaches surfaces) and `REQ-SHELL-169` (a launch arriving while the instance is shutting down). Counts
move from 3,950 / 258 / 3,692 to **3,952 / 258 / 3,694** on the shipping side, and from 4,394 to
**4,396** in all. The two retired domains are untouched.

### The three build-wrong defects, and what closed each

**1. `REQ-STARTUP-145` did not say which per-user location is meant.** Four requirements that need the
machine-local one each said so for themselves, so the corpus was satisfiable and no build reading any one
of them was wrong — and a build was still wrong overall, because every requirement that places something
in a per-user directory and says nothing inherits whatever the platform's default is, which on the
mandated desktop platform resolves under the replicated profile. **Closed at the definition**, which is
the only place it could be closed correctly: `REQ-STARTUP-145` now states the selection once, states that
it governs over the platform's own default, and states that conformance is decided by the directories the
product actually writes to rather than by the one a platform layer would have chosen unasked. It declares
itself the single statement of the property and directs dependents to cite. Per-workspace state is
explicitly out of its reach, so the clause cannot be read as licence to relocate a workspace
(`REQ-STARTUP-166`).

*The sweep that followed it.* `REQ-STARTUP-165`(a), `REQ-SESSION-198`, `REQ-PROVIDER-014` and
`REQ-PROVIDER-063` each dropped their own restatement and cite. `REQ-STARTUP-161`'s single-instance
record **gained** the property, which it had never stated at all — the third dependent mechanism, and the
one that would have offered a launch a process that was never running on this machine.
`REQ-STARTUP-070`, `REQ-STARTUP-087`, `REQ-CONFIG-001`, `REQ-HOOKS-115`, and the Data & Formats sections
of domains 04, 11, 13 and 15 all cite it. **One restatement was deliberately kept**: `REQ-STARTUP-165`(c)
permits a run-scoped placement in a closed set of two locations, and only the first inherits from
`REQ-STARTUP-145`; deleting the prohibition as a duplicate would have silently unbound the second branch,
so it is retained with the reason for its retention written into the clause.

*The residue that was not a restatement but a second silence.* `REQ-SHELL-006`'s desktop preference store
is fixed as "the host platform's own standard per-user application-settings location" and is **not** one
of `REQ-STARTUP-145`'s directories, so it inherited nothing. It holds `workspace/lastOpened` and
`diagnostics/outputDir`, both paths that describe *this* machine. It now carries the same selection, with
`REQ-STARTUP-145` cited for the terms and the reason stated locally, because the alternative was to leave
one per-user location in the corpus whose replication status nothing states — a smaller version of the
defect this round was landing.

**2. `REQ-TRACE-061` required a failed whole-file replacement to be re-raised with no ladder.** On storage
shared with or reachable from another machine the replacement fails transiently **with no other opener
present at all**, so a user-initiated regeneration fails for a condition of storage the user can neither
act on nor reproduce. **Closed by stating a bounded ladder in the requirement**: at most five attempts in
total, delays of 0.05 / 0.1 / 0.2 / 0.4 s, the last attempt beginning no more than 0.75 s after the
first, every attempt leaving no temporary artifact behind. The clause that stops the wrong build is that
**the retry may not be conditioned on the application being able to attribute the failure to another
process holding the target** — a build that gates the retry on detecting contention absorbs none of the
measured failure, and both the corpus's other ladder and every derivation of it in the architecture
record argue from contention.

*Constants deliberately not borrowed.* The ladder is the traceability domain's own. `REQ-SESSION-033`'s
figures were expressly not copied, which is what OQ-44 and ADR-0004 both refuse ("no neighbouring store's
constants may be borrowed to pretend a ladder exists"), and `REQ-TRACE-061` states in terms that neither
requirement's ladder may be cited in place of the other's. The corpus now states **two** ladders with two
owners, each declaring its own scope.

*The second site.* `REQ-TRACE-514`, `REQ-LIBRARY-176`, `REQ-SESSION-189` and `REQ-SESSION-199` all write
to a destination the user chose through a save dialog — the one class of write whose target the product
does not pick. All four **cite** `REQ-TRACE-061` rather than state a third, fourth and fifth ladder.
`REQ-SESSION-189` and `REQ-SESSION-199` additionally cite `REQ-EVENTS-145` for the one-step-visibility
obligation the ladder hangs on, which nothing outside domain 20 had been citing; `REQ-EVENTS-145` now
states that the obligation is the product's single statement of what an export write owes the
destination a user chose and is not confined to the exports its own document names.

*A boundary sentence, added on judgement.* `REQ-TRACE-502` says no invocation may wait for another. That
is the sentence a conformant implementer would have cited to delete the ladder, so it now states that a
bounded replacement retry is not a wait for another invocation and may not be dropped as one.

**3. `REQ-EVENTS-098`'s no-delay clause was unsatisfiable on its literal reading.** Its single closing
sentence is now three separately citable clauses; see the correction recorded under the measurement
round above. What matters for the record here is the shape of the fix: the guarantee was **split**, not
weakened. (a) carries the whole blocking prohibition undiminished and keeps the bolded disqualifier; (b)
is new in words and old in force, and it is what still fails the measured configuration in which two
writers each report success while most of the committed rows vanish with a clean integrity check — it
says in terms that such a store fails "no less for reporting nothing"; (c) is the only permission
granted, and it is granted because the alternative was a conformance suite that rejects every possible
store.

### The seven rulings, and where each landed

| Ruling | Landed in | Note |
|---|---|---|
| **ESC-22** — bound the aggregate terminal-frame rate | `REQ-MONITOR-306` minted; `REQ-MONITOR-287`, `REQ-SHELL-103` and domain 12's Data & Formats cite it | Bounded on **frames**, not on volume, because a byte bound could be honoured only by discarding output, which `REQ-SHELL-103` and `REQ-MONITOR-294` both forbid. Stated as a condition of `REQ-MONITOR-222` that may not be widened without re-measuring it, and as conformance measured on the delivered aggregate rate rather than on the appearance of a grid |
| **ESC-24** — refuse a launch arriving inside the force-exit allowance | `REQ-SHELL-169` minted; `REQ-MONITOR-131` and domain 12's Data & Formats point at it; `REQ-STARTUP-161`, `REQ-STARTUP-162` and `REQ-STARTUP-164` amended in step | The refusal is **answered, never silent**, because an unanswered launch is the path `REQ-STARTUP-164` keeps for a process that *cannot* answer |
| **ESC-27** — `secrets.yaml` file mode | `REQ-CONFIG-216`; cited by `REQ-MCP-082` and domain 16's secrets appendix | `0600`, applied explicitly on every write rather than inherited; on a platform with no POSIX mode the protection is `REQ-PROVIDER-016`'s explicit owner-only access control, cited not restated; `REQ-CONFIG-444`'s platform-default fallback is **explicitly denied** to this file |
| **ESC-28 / ESC-29** — a withdrawn key must not fail the load | `REQ-CONFIG-183`, which now owns both outcomes; `REQ-CONFIG-233`, `REQ-CONFIG-192`, `REQ-CONFIG-194`, `REQ-CONFIG-477`, `REQ-GIT-074` and domain 06's configuration appendix follow | The withdrawn-key report's content **moved** from `REQ-CONFIG-478` and is marked there as relocated rather than withdrawn |
| **ESC-30** — tell a never-recorded version from a pruned one | `REQ-LIBRARY-047` gains the store obligation; `REQ-LIBRARY-176` carries two separate figures; `REQ-TRACE-514` states that its store has only one cause and why | Both exports are forbidden from carrying an absence figure in a shape shared with the other |
| **ESC-31** — the permission-audit entry's identifier is a field of the entry | `REQ-TOOLS-079`; `REQ-EVENTS-056` narrowed in step; `REQ-SESSION-137` and `REQ-SESSION-199` follow | The reason carried in the requirement is the **export**, not tidiness |

### The jointly-unsatisfiable pair ESC-31 would have sharpened

`REQ-EVENTS-056` read "A locator MUST NOT name a record kind whose own requirement gives its entries no
such identifier." The permission audit holds two entry shapes: decision entries, which `REQ-TOOLS-079`
identifies, and `REQ-TOOLS-082`'s mode-change entries, whose object is a closed literal with no
identifier. On the strict reading of *its entries* the token `permission_audit` is unnameable — and
`REQ-TOOLS-081` **requires** a `permission_audit` locator on every deny. Requirement A forbade exactly
what requirement B mandated. It was latent while the identifier's location was open and would have become
a flat contradiction the moment ESC-31 was stated. `REQ-EVENTS-056` was **narrowed in place** rather than
the ESC-31 amendment being weakened: a kind may hold entries of more than one shape and identify only
some of them, and such a kind is nameable while its unidentified entries are not. The sentence records
why it exists, so a later tidying pass does not delete it as verbose.

### Narrowings and withdrawals, each checked against its owner before deletion

- `REQ-STARTUP-165`(a)'s machine-local sentence → `REQ-STARTUP-145` holds it. Checked.
- `REQ-SESSION-198`, `REQ-PROVIDER-014`, `REQ-PROVIDER-063`'s machine-local sentences → same. Checked.
  Each kept its **local reason** for relying on the property, which is not the property.
- `REQ-CONFIG-478`'s withdrawn-key obligations → `REQ-CONFIG-183` holds them, extended. Marked in place
  as relocated, with a pointer, rather than deleted.
- `REQ-SESSION-137`'s decision-entry field enumeration → `REQ-TOOLS-079` holds every field it named and
  adds the identifier. Checked field by field.
- `REQ-SESSION-137`'s mode-change enumeration → `REQ-TOOLS-082` holds every field it named **and two it
  omitted** (`timestamp`, `session_id`), which is why the restatement was a defect rather than a
  duplicate. Checked.
- `REQ-MCP-082`'s `secrets.yaml` write restatement → `REQ-CONFIG-216` holds the atomicity and the
  directory creation and adds the file protection that restatement never had. Checked.
- `REQ-GIT-074`'s "rejected as an unknown key" → `REQ-CONFIG-183` and `REQ-CONFIG-194` hold the outcome,
  which is now report-and-ignore. The sentence cited the requirement whose terms it contradicted.
- `REQ-EVENTS-098`'s closing sentence → clauses (a), (b) and (c) hold it between them, and (a) carries
  the whole of the prohibition alone. Checked clause by clause.
- **One restatement was found and deliberately kept**: `REQ-STARTUP-165`(c)'s prohibition, above.
- **`REQ-SESSION-033`'s ambiguity was resolved rather than inherited.** Its ladder read as either five
  attempts or six; the architecture record carries both readings. It is fixed at **six** — the reading
  under which every delay the requirement itself lists is used — with the resolution and its ground
  written into the requirement, and nothing narrowed, since the alternative reading retries less.

### What this round did not settle

- **`ROTARIS_CONFIG_DIR` bounded, not withdrawn.** The variable relocates one hook-policy file and now
  says in terms that it reaches nothing else — not the configuration scopes, the credential store, the
  session store or the preference store — because a variable readable as an override of
  `REQ-STARTUP-145` would let a user relocate the product's stores onto shared storage, which ESC-19
  refused. Whether the variable should exist at all was not reopened.
- **The canonical-path-spelling rule is still unstated.** `REQ-EVENTS-098`(b) now states the behavioural
  property the two-spelling configuration violates, so the requirement catches the symptom; nothing
  forbids the cause. It remains domain 07's or domain 20's, and the architecture holds it as a
  constraint.
- **Three of the five export sites still have the one-step obligation without a stated ladder** — the
  destinations `REQ-EVENTS-145` itself governs. `REQ-TRACE-061` was written to be citable across domains
  precisely so that a competing owner is not minted for them.
- **The identifier's field token is not fixed.** ESC-31 ruled *where* the identifier lives, not what it
  is called. `REQ-TOOLS-079` fixes the property instead — the same field in every entry and in every
  export, locatable as the identifier — and minting a token would have been a decision the ruling did
  not make. The exported audit's concrete key belongs to whoever fixes that export's shape.
- **ESC-28's second half was not taken.** The owner ruled "report and carry on"; a confirmed one-click
  removal of the withdrawn key would need the no-repair rule narrowed explicitly, which nobody has ruled.
- **ESC-21's strength is still under review, and spike 19 has now reported without settling it.** The
  spike measured ESC-21's first premise (2,500 races over a network share, exactly one winner in 2,500)
  and could not measure the second, which needs a second machine and a synchronisation account. It
  stated the closing experiment and declined to invent a result. `REQ-GIT-128` records that the spike has
  reported, so a reader does not wait for an answer that has already come back empty.

## The code-intelligence round — 2026-09-06, the first amendment after the gates

Both gates were closed (specification 2026-08-31, architecture 2026-09-03) when ADR-0035 — the bundled
code-intelligence runtime — was executed for the first time on 2026-09-06 and measured, with outbound
network blocked, that the runtime it bundles obtains its language servers at the first use of a language.
`REQ-STARTUP-159` permitted nothing fetched after installation beyond the machine tools and the package
caches. The execution raised **IC-7** rather than repairing the requirement or the bundle quietly; the owner
ruled **ESC-32** the same day. This round applies that one ruling. It was produced from the approved
record and the runtime's public documentation and its published package alone; nothing here derives from
the reference.

### The ruling, and where it landed

| Ruling | Landed in | Note |
|---|---|---|
| **ESC-32** — the language servers are tools provisioned after installation | `REQ-STARTUP-159` amended in place; `REQ-STARTUP-058` gains a second, distinct list; `REQ-STARTUP-142`'s section gains the sub-list; `REQ-STARTUP-064`'s reason qualified in place; `REQ-MCP-116`'s manifest carries the declaration; **`REQ-MCP-118` minted** — the disclosure on the MCP category | The declaration is checked **against the runtime** at build time, the way `REQ-MCP-095` checks the browser package's pin, so the disclosure cannot say a version the runtime will not fetch |

### What was checked before the amendment was written

- **That the amendment narrows nothing a user relies on.** `REQ-STARTUP-159`'s first-run guarantees — the
  window paints, the version is true, every data asset resolves from what was installed — are untouched;
  what widens is the closed list of things fetched *after* installation, by one member, under the same
  conditions the other two already carry (only where the machine does not supply them; degradation of
  individual capabilities, never of the first run).
- **That the declaration has a single home.** `REQ-MCP-116` already made the binding manifest the one
  place the runtime's identifiers are written; the servers join it there, and `REQ-MCP-118` reads them
  from it and restates nothing. `REQ-STARTUP-058`'s list is the declaration's specification-side home and
  says the versions must equal the runtime's own defaults, so the two cannot disagree without the build
  failing.
- **That the falsified reason is kept.** `REQ-STARTUP-064` exempted the reserved token from warm-up
  "because what it resolves to ships inside the artifact". The outcome is right and the reason was half
  right; the half that was wrong is quoted beside its qualification, not deleted (GD-10).

### Narrowings and withdrawals

None. One identifier minted, five amended in place, every amended sentence quoting what it previously read.

### What this round did not settle

- **The notices generator** (`REQ-STARTUP-141/142/143`) is not built, so the section the amendment adds to
  `THIRD-PARTY-LICENSES.txt` exists in the specification only. IC-7's discharge is half shown until it
  exists, and the condition stays on the release. *2026-09-27: the generator is built and lists the servers,
  and IC-7 is recorded as discharged in `../architecture/implementation-conditions.md`.*
- **The setup manifest as a shipped file** (`REQ-STARTUP-058`, schema version 1) is the onboarding domain's
  and is not built either. The declaration lives in the generated binding manifest and feeds that file when
  it exists. *2026-09-28: the file exists at `apps/desktop/resources/setup-manifest.json`, schema version 1, and
  `packages/config/src/setup-manifest.test.ts` holds its `languageServers` equal to
  `apps/desktop/scripts/code-intelligence/pins.json` (ADR-0054, "The setup manifest"). Still unbuilt: its consumer
  (machine setup, `REQ-STARTUP-060` onward and `REQ-MCP-112`'s setup half), and the notices generator's reading of
  it, which still reads `pins.json` (OQ-73).*
- **Which languages the release names** is a release decision. Two are declared because two were measured;
  the disclosure says the rest are obtained the same way.

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
