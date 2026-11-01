# Archived open questions — Specification questions (8 of 27)

The ruled, closed, resolved and withdrawn entries of [part 13](../../../architecture/open-questions/13-specification-questions-8.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-71"></a>

**OQ-71 — With no version metadata, does the running desktop report `dev` or `0+unknown`?** *(REQ-STARTUP-004, REQ-STARTUP-007; REQ-STARTUP-109, REQ-STARTUP-158, REQ-STARTUP-159, REQ-SHELL-140. Raised 2026-09-27 by the review of the version guard, first-release plan §4.1; raised as OQ-68 and renumbered OQ-71 when it reached `main` after the `/skills` listing's OQ-67 and the injection proof's OQ-68.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** `dev` is kept, and REQ-STARTUP-004 is amended to agree by [`PD-STARTUP-003`](../../../product/directives/pd-startup-003.md#pd-startup-003): with no installation metadata the running desktop reports `dev`.

Both requirements govern the same value and fix different literals for the same case. REQ-STARTUP-004: the product
reports its version from its own installation metadata, and "when that metadata is absent, the reported version SHALL
be the literal string `0+unknown`". REQ-STARTUP-007: the running desktop treats as its version the one that metadata
declares, "else the literal `dev` when no such metadata is present", and that value is the one the About surface
presents and the one compared against the release feed. REQ-STARTUP-007 cites REQ-STARTUP-004 for the first branch, so
the two are meant to agree, and do not. Before 2026-09-27 the code had no absent-metadata branch to disagree with:
`app.getVersion()` always answered something, Electron's own version for the unpacked entry. Reading the application's
manifest (`@rotaris/platform`, `version.ts`) gave the question a place to be answered.

**What the build proceeds under.** `dev`. REQ-STARTUP-007 is the requirement written for the running desktop and for
the two consumers of the value (the About surface, REQ-SHELL-140, and the update comparison); REQ-STARTUP-109's
unanswerable comparison names `dev` as its example; and `0+unknown` is not a version REQ-STARTUP-027's grammar parses
either, so nothing downstream distinguishes the two. `VERSION_WITHOUT_METADATA` in `packages/platform/src/version.ts`
carries the literal and cites this question. Neither literal can reach an installed build: REQ-STARTUP-004's own last
sentence and REQ-STARTUP-159's About observation forbid it, and electron-builder always packs the manifest.

**What a ruling decides.** Which literal the running desktop reports without metadata. If `0+unknown`, the constant
changes and nothing else does; if `dev`, REQ-STARTUP-004's second sentence is amended to agree.

<a id="oq-76"></a>

**OQ-76 — Which timeline word records that a run's user went away, and came back?** *(REQ-ORCH-139, REQ-SESSION-142,
`PD-TOOLS-005`. Raised 2026-09-28 by building `PD-TOOLS-005` under [R-062](../../../product/requests.md#r-062). Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** as recommended, with OQ-157 — domain 05's timeline gains `user_away` and `user_returned` ([`PD-TOOLS-011`](../../../product/directives/pd-tools-011.md#pd-tools-011)), written by `UserPresence` beside its two session-log lines, which keep their `WARNING` level so the stretch's end is visible wherever its start is; each entry carries the expired timeout as `after_seconds`.

`PD-TOOLS-005` makes a run treat the user as away once an approval wait has expired unanswered, and present again on
their next input to the session. An autopsy of such a run wants both instants: every approval ask between them was
refused without a prompt, and the stretch is what explains a row of `permission_denied` issues. REQ-ORCH-139 closes
the timeline-event vocabulary to the list in domain 01's Data & Formats, and domain 05's own Data & Formats names the
only other timeline events a permission mechanism may write (`permission_approved`, `permission_mode_changed`,
`permission_mode_downgraded`). Neither has a word for the user's presence, and the directive mints none.

**What the build proceeds under.** Both transitions are written to the session log (REQ-SESSION-142) at `WARNING` —
the default level, so that the end of a stretch is visible wherever its start is — in the words `user away: an approval
in this run went unanswered for <N> seconds …` and `user returned: input reached this session …`
(`packages/engine/src/run/presence.ts`). The denials themselves carry the cause in the decision's reason, which the
`permission_denied` issue records, so an autopsy reading the store alone still sees why each ask was refused; what it
cannot read from the store is the instant the user returned.

**What a ruling decides.** Whether the timeline gains two names for the transitions, and in which domain's list, or
whether the log line is the record. Recommendation: two names in domain 05's list, because the timeline is what an
autopsy reads first and is among the records the export reaches (REQ-SESSION-199), and the session log is neither. *(Added
2026-10-01: OQ-157 asks the same question of every timeline name the product writes that no list has, and recommends one
ruling for all of them and for this one.)*

<a id="oq-77"></a>

**OQ-77 — Does the away state resolve the approval an `ask_questions` call itself needs under the `ask` preset?**
*(`PD-TOOLS-005`, REQ-TOOLS-007, REQ-TOOLS-158, REQ-TOOLS-178. Raised 2026-09-28 by building `PD-TOOLS-005` under
[R-062](../../../product/requests.md#r-062). Open until 2026-10-06; ruled that day by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the question tool's own dispatch is exempt from
the away rule and nothing else is — under the `ask` preset its approval is put to the user and waits while they are away,
the preset's decision on the call otherwise standing; read so as to cover only the public `ask_questions` tool (not a tool
offered under its name) and to keep that approval's wait from being ended by OQ-78's ruling as well. Minted as
[`PD-TOOLS-005`](../../../product/directives/pd-tools-005.md#pd-tools-005) revision 2, narrowing REQ-TOOLS-052 and REQ-TOOLS-055 as revision 1
did, and built the same day (`AWAY_EXEMPT_TOOL` in `packages/agent-tools/src/gate.ts`; plan fin21). The reading below is
kept as the build proceeded under it until then.

The directive keeps questions prompting and waiting while the user is away: "questions put to the user (REQ-TOOLS-158,
REQ-TOOLS-178) still prompt and wait". But `ask_questions` is outside REQ-TOOLS-007's read-only class, so under the
`ask` preset — the default — its dispatch resolves to the preset's default decision, `ask`, and the call needs an
approval before the question exists. That approval is an ask that would prompt, so while the user is away it is
resolved at once and denied: under the default preset no question reaches an away user, and the clause is reachable
only where the call is permitted outright — `autonomous`, a rule, or a session approval of the tool.

**What the build proceeds under.** The literal reading: the away state resolves every approval ask, the question
tool's own included, and the clause governs the question the executor raises, which still prompts and waits wherever
the call is permitted. A gate case pins both halves (`gate.test.ts`, "a question still prompts and waits while the user
is away").

**What a ruling decides.** Whether `ask_questions`'s own dispatch is exempt from the away resolution — or from the
preset default altogether, as the loop-control tools are under REQ-TOOLS-014 — so that a question can reach a user
who is away in the approval sense and may still answer one. Recommendation: exempt the question tool's own dispatch
from the away resolution and nothing else; a question is the one prompt the directive means to keep, and the preset's
decision on the call otherwise stands.
