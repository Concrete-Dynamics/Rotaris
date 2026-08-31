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

Four reconciliation rounds settled every conflict, and settled them all the same way: as an
owner/follower pair. One requirement is named the product's single definition of the thing and says so
in its own text, naming its citers where that list is short enough to be useful; every other
requirement that needs it cites that identifier and states what it relies on it for, and holds no copy
of the content — a restated copy being what produced each of these conflicts in the first place.

Four rounds were needed because of how the specifications were written, not because the editing was
careless. Twenty-one documents were drafted in parallel by independent agents, and each stated for
itself every vocabulary, key, bound and on-disk file its own requirements depended on — that is what
made each document readable on its own, and it is also why the same closed set was declared in two,
three and in some cases four places. No single audit sees every declaration of a set at once:
reducing one document's copy to a citation is what exposes the next copy, so each round found
duplication the previous round's fixes had made visible and went a level deeper than the round before
it. The first three rounds settled the vocabularies several domains produced values of — run
results, execution statuses, stop reasons, delegation and approval surfaces, and the on-disk files
and configuration keys two domains had each claimed. The fourth settled the constants, schemas and
closed sets that only one domain produces but several documents had restated: permission-mode
presets, sandbox and egress keys, the hook event vocabulary and hook entry schema, two desktop-shell
figures, MCP discovery locations, and the transient acknowledgement surface.

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
| REQ-CONFIG-231 | The referential-validation rule for `models:` and the role fields — which messages are produced, the order they are produced in, and that a rejected tool name is reported with the accepted names sorted (cited by REQ-ORCH-016, REQ-ORCH-028, REQ-ORCH-153, REQ-CONFIG-104, REQ-CONFIG-105). It does not own the tool-name registry: it reads the accepted set from the tools-and-permissions domain and says so in its own text |

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
| REQ-HOOKS-091 | The workspace hook fingerprint — no document outside domain 09 cites it yet |
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

Every citation named in both tables was checked against the follower's own text when this record was
written; a pairing is listed here only where the follower carries the owner's identifier. Two pairings
in the first table had been recorded before the follower carried the citation — REQ-CONFIG-127
against REQ-SANDBOX-048, and REQ-CHAT-165 against REQ-SESSION-131 and REQ-SESSION-192 — and both
followers were amended in the fourth round, so the rows now state what the files hold. Two further
rows claimed more ownership than the requirement itself claims and were narrowed to it. The check is
worth repeating whenever a round adds owners: a reconciliation that is recorded as done and is not is
worse than one that was never attempted.

Two things this round did not close, recorded so the account is not read as complete. The tool-name
registry is not yet an owner/follower pair. REQ-TOOLS-001 states the accepted set of public tool
names; REQ-CONFIG-231 correctly declines to own that set and points at the tools-and-permissions
domain, but names no requirement there; and REQ-ORCH-016 and REQ-ORCH-028 cite REQ-CONFIG-231 for
per-tool capability declarations — which tool reads workspace files, which writes them, which runs
commands — that no requirement in any domain states. And four owners name citers whose text does not
carry the owner's identifier: REQ-NOTIFY-011 names REQ-SHELL-113 and REQ-STARTUP-054, REQ-HOOKS-091
names REQ-WORKSPACE-117, REQ-SANDBOX-050 names REQ-TOOLS-116, and REQ-SANDBOX-051 names
REQ-TOOLS-117. All five of those requirements exist; none of them references the owner. Both items
belong to the next round, and neither is claimed as settled by the tables above.

The resolution records in `../spec/resolutions/` were corrected rather than rewritten. A disposition
that a later round overturned still states what was decided and why, and then names what superseded
it — so the account of how a decision was reached survives the decision itself being replaced. That
matters for this repository specifically: the reasoning in those records is the clean-side derivation,
and deleting it would leave the current requirement with no visible provenance.

## Standing constraints on what comes next

Implementation agents will receive the approved specifications, approved architecture decisions,
public documentation, and approved design material. They will not receive the reference, the sealed
area, RED findings, or raw audit reports. The repository's `CLAUDE.md` states this boundary so it
applies to every session opened here.

Implementation commits should cite the requirement IDs they satisfy, so the chain from requirement
to code to test stays checkable.
