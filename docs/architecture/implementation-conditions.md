# Conditions that bind at implementation time

Created 2026-09-02 by owner ruling GD-3. **Extended 2026-09-03 by the Architecture Gate**, which added
IC-4, IC-5 and IC-6 under its decision 2 and recorded its decision 3 at the end of this file. **IC-7 was proposed
2026-09-06 by ADR-0035's first execution and adopted by the owner the same day (ESC-32, option 2)**; it stayed on the
release until both halves of that option were shown, and **the second half was shown on 2026-09-27** by the notices
generator's first execution (see its entry).

This file holds obligations that are **not** conditions of the Architecture Gate but **are** conditions on
building the thing they name. It exists because the alternative to holding a whole gate for one mechanism's
measurement is not "trust the reasoning" — it is "bind the measurement to the mechanism". Without somewhere
to write that down, deciding an obligation is an implementation-time condition is indistinguishable from
deciding it is nothing.

**How an entry here binds.** The work it names may not be reported as complete until its condition is
discharged. Discharging a condition means recording the result where the entry says, in the record, whether
or not it passed — a condition that quietly disappears has not been discharged. Nothing here may be
downgraded by the person doing the work; a condition is removed by the same authority that set it.

**How an entry gets here.** Someone with the authority to set a gate condition decides that an obligation
binds the mechanism rather than the gate. The entry names what must be shown, what would count as showing
it, and where the result goes.

**How this register is laid out — since 2026-10-26 ([R-087](../product/requests.md#r-087)).** This file is the
index: the rules above, the status of every entry, and what each still binds. Each entry's full text is its own file
under [`implementation-conditions/`](implementation-conditions/), moved there verbatim with only its relative links
re-pointed, so that no reader has to load all eight to consult one. The register was one file of 636 lines; the
longest file it has now is IC-8's, at about 140. The bound followed is the working budget for a document an agent is
expected to read whole — **at most ~500 lines (~8,000 words), and ~200–300 lines as the single-read target** — and an
entry that grows past 300 lines is split by its own sections, with this index naming the parts. An entry is cited
as before, by its number (`IC-3`, `IC-3 item 3`); the anchor this file's IC-3 heading had is kept below.

---

## The entries, and what each binds now

Reviewed 2026-10-26 against the record ([R-087](../product/requests.md#r-087)). **Open** binds work today;
**discharged** binds nothing and is kept as evidence (IC-1's own words: "the entry is kept rather than deleted,
because what it required is now evidence"); **narrowed** names a half its authority removed and says where the
half went. **None of the eight is stale**: each is either open, or discharged with its evidence still cited from
elsewhere in the record.

| Entry | Status | Set by | What it binds now | What is still owed, and whose |
| --- | --- | --- | --- | --- |
| [IC-1 — the corrected restore is re-measured](implementation-conditions/ic-1-the-corrected-restore.md) | **discharged** 2026-09-02 | GD-3 | nothing | nothing under IC-1; spike 22's eight uncorrected defects are their own items (D8, D11 repaired; D5 deferred, OQ-48) |
| [IC-2 — the two undesigned themes](implementation-conditions/ic-2-the-undesigned-themes.md) | **discharged** 2026-09-04 | GD-1 | nothing | the different-scale multi-monitor drag — the owner's measurement, deferred under [R-071](../product/requests.md#r-071) |
| [IC-3 — the macOS build-host obligations](implementation-conditions/ic-3-the-build-host-obligations.md) | **open, narrowed** 2026-10-26 to macOS | GD-5; narrowed by the owner, R-087 | any macOS release artifact; the store binding's acceptance on macOS | items 2–4 for macOS — a macOS host. The Linux half moved to [ADR-0066](adr/0066-the-linux-artifact-is-built-on-a-developer-host.md) (below) |
| [IC-4 — the foreign-host lock row's fix is measured](implementation-conditions/ic-4-the-foreign-host-lock-row.md) | **open in part** — the foreign-lock report discharged 2026-09-03 | the Architecture Gate, decision 2 | the first implementation of `REQ-SESSION-046`'s machine identifier | the real machine rename and reboot — the owner's act, deferred under R-071 |
| [IC-5 — the artifact-layout conversion is tested](implementation-conditions/ic-5-the-artifact-layout-conversion.md) | **discharged** 2026-09-03 | the Architecture Gate, decision 2 | nothing | nothing |
| [IC-6 — the build rule that replaced an exit status](implementation-conditions/ic-6-the-build-rule-that-replaced-an-exit-status.md) | **discharged** 2026-09-04 | the Architecture Gate, decision 2 | nothing | the per-runner half: macOS is IC-3 item 3, Linux is ADR-0066 AC-3 |
| [IC-7 — the code-intelligence language servers](implementation-conditions/ic-7-the-code-intelligence-language-servers.md) | **discharged** 2026-09-27 (ESC-32 option 2) | proposed under ADR-0035; adopted by the owner | nothing `REQ-STARTUP-143` does not already bind | the release pipeline's evidence — a notices file frozen into a release; no pipeline run has published one |
| [IC-8 — the confinement backends](implementation-conditions/ic-8-the-confinement-backends.md) | **open**; heading still reads PROPOSED (below) | raised by ADR-0022's first execution | the two renderers' completion, and any claim that OS-level confinement works | the six effects on a real macOS host; Linux held on 2026-09-29 after the repair |

<a id="ic-3--the-linux-and-macos-build-host-obligations-deferred-to-hardware"></a>

### IC-3's Linux half — moved, not discharged

*This anchor was IC-3's heading while it read "the Linux and macOS build-host obligations, deferred to hardware".*
On 2026-10-26 the owner ruled that no implementation condition may prevent a Linux build (R-087). IC-3 now binds macOS
alone, and its Linux half is the acceptance criteria of
[ADR-0066](adr/0066-the-linux-artifact-is-built-on-a-developer-host.md): the Linux artifact **may be built**, and is
**accepted** only once these are recorded, pass or fail. They are owed exactly as IC-3 owed them.

| ADR-0066 | Was | What must be shown |
| --- | --- | --- |
| AC-1 | IC-3 item 1 | spike 12: the AppImage runs, unextracted, on Ubuntu 24.04 that never had `libfuse.so.2` |
| AC-2 | IC-3 item 2, Linux | spike 17: first paint within `REQ-STARTUP-155`'s 5 s on the Linux baseline |
| AC-3 | IC-3 item 3, Linux | ADR-0056's load proof constructible on Linux, D10's counterfactual refused |
| AC-4 | IC-3 item 4, Linux | the instance claim: a second launch on one account is handed to the first |

Publishing a Linux artifact is not decided by this: `PD-STARTUP-001` still publishes `windows-x64` alone.

### Not entries, kept beside them

[The unstarted spikes, and the mechanisms built without a condition](implementation-conditions/decision-3-the-unstarted-spikes-and-first-executions.md)
— the Architecture Gate's ruling on decision 3 (a spike is taken as the first act of building what it prices), the
four spikes it named, and five dated notes on mechanisms built with no condition naming them, each listing what it
left owed. None is a condition; they stay because they say what is owed where no entry does.

### For the owner — what this review could not settle

1. **IC-8's authority.** Its heading has read "PROPOSED 2026-09-15" since it was raised, and no adoption is recorded
   in [`owner-decisions.md`](owner-decisions.md) or [`requests.md`](../product/requests.md). The record treats it as in
   force — `PD-STARTUP-001` and R-071 both name it — so it is kept as open. Adopting or refusing it is the owner's.
2. **A Linux publication still waits on macOS.** `PD-STARTUP-001` lets its withdrawal land only once "IC-3 and IC-8
   are discharged". IC-3 no longer binds Linux, but IC-8 needs a macOS host as well as a Linux one, so a Linux-only
   release would still wait on macOS hardware. Whether that is intended is a revision of `PD-STARTUP-001`, and the
   owner's.
3. **The notes kept beside the entries were not re-verified.** Their "owed" lists date from 2026-09-03 and 2026-09-04,
   and some items have been built since (one is marked so in place). Pruning them needs each item checked against
   the code, which this review did not do.
