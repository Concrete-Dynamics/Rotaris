# ADR-0054 — history

The passages of [ADR-0054](../../../architecture/adr/0054-packaging-artifacts-and-self-update.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0054-packaging-artifacts-and-self-update.md](../../../architecture/adr/0054-packaging-artifacts-and-self-update.md), the header:

**Reopened and re-decided.** The packaging tool's own portable target cannot
meet `REQ-STARTUP-155` at any bundle weight, including an empty one; SR-7 rules that the artifact
prepares itself once and launches from that preparation, and `REQ-STARTUP-165` now states the contract
that preparation must satisfy. Both escalations this record raised are also ruled and are converted
from open questions into decisions.

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0054-packaging-artifacts-and-self-update.md](../../../architecture/adr/0054-packaging-artifacts-and-self-update.md), the header:

**ESC-8's signature mechanism is decided against the shape this record proposed** — `REQ-STARTUP-167`,
`REQ-STARTUP-168` and an amended `REQ-STARTUP-032` publish a **detached** signature as a fifth asset and
make the *build* carry a set of keys, where this record argued no new filename could appear and put the
rotation in the manifest. **The one gap this record's own "Revisit if" named is closed**:
`REQ-STARTUP-165` (c) now states the outcome for a preparation that cannot be made at all, and the
design is built to it below rather than left owed. And the native-module obligation is widened to the
store binding and pointed at ADR-0056's build-time proof.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0054-packaging-artifacts-and-self-update.md](../../../architecture/adr/0054-packaging-artifacts-and-self-update.md), the header:

SR-7's gate condition was measured and **SR-7 is vindicated**: a cached launch paints in 575.5–624.2 ms
warm against 5,000 ms, and the worst cached measurement taken anywhere in the spike is 1,414.6 ms. The
"Revisit if" clause that turned on that number is discharged below. But the same run found **two defects
in the mechanism this record specifies, both observed rather than inferred** — the commit step does not
work on Windows, and the completeness check passes a damaged preparation that then launches to no window
at all — and both are corrected in the Decision. **The corrections do not reopen P4; they are what makes
P4 work.**
