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
| REQ-SESSION-131, REQ-SESSION-192 | Bounded transcript residency and the evicted-page archive file (cited by REQ-CHAT-165) |
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

## Standing constraints on what comes next

Implementation agents will receive the approved specifications, approved architecture decisions,
public documentation, and approved design material. They will not receive the reference, the sealed
area, RED findings, or raw audit reports. The repository's `CLAUDE.md` states this boundary so it
applies to every session opened here.

Implementation commits should cite the requirement IDs they satisfy, so the chain from requirement
to code to test stays checkable.
