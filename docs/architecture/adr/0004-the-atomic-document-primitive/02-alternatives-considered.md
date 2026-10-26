# ADR-0004 — One document primitive, three write shapes, and a guarded read side — Alternatives considered

Part 2 of 5 of [ADR-0004](../0004-the-atomic-document-primitive.md), which indexes every part.

## Alternatives considered

**A — One primitive with a uniform policy.** Simple, one place to audit. Still not available, and the
argument has changed sign twice, both times in the same direction: the set of differences **grew again**.
Three modes, two temp-name contracts, **four** failure policies (fatal, best-effort, reported, re-raised),
one retry ladder, and now **three** write shapes. A uniform primitive would over-constrain the credential
store or under-constrain the traceability store, and the over-constrained case fails conformance quietly.

**B — One write mechanism plus an explicit per-store policy, and store-specific decoders.** Chosen, as
before, with the policy record extended to carry the write shape and the ladder.

**C — A third-party atomic-write package.** Rejected, and one reason has survived every rescoping intact:
**no package addresses the read side**, which the original spike shows is where the requirement actually
breaks. A second reason has strengthened rather than weakened. The previous version said the awkwardness was
down to temp-name contracts and was nearly gone; the writer-handle spike shows the real problem is that a
correct implementation on Windows needs the platform's file-replacement call rather than rename, and no
package in this ecosystem reaches it from the runtime. Adding a dependency that has the same defect we have,
on the path that includes the credential store, buys nothing.

**D — Drop the primitive entirely and let each remaining store write itself.** Rejected, and more firmly
than before. There are now nine replace targets in three processes across three write shapes, and the Windows
replace behaviour is a property of the chosen platform call rather than of any one store. Nine independent
rediscoveries of the empty-read guard, and nine independent decisions about whether to close a staged handle
before renaming, is the outcome that argues for one module. **The re-derivation that produced this revision
is itself evidence for it:** four of the inventory's entries had drifted from their requirements while the
record still read as authoritative, and a drifted entry in one shared module is one bug, where a drifted
assumption in nine hand-written write sites is nine.

**F — Let the inventory live in the code and keep only the rules here.** Genuinely tempting after this
revision, since the drift being corrected is exactly the drift a document accumulates and a compiler does
not. Rejected for one reason: **most of what the table carries is not derivable from the code** — that
`secrets.yaml` has no mode is a requirement's silence (OQ-14), that `.gitignore` failures are swallowed is
`REQ-CONFIG-013`'s choice, and that `summary.md` alone gets a ladder is `REQ-SESSION-033`'s declaration that
it is "the only replacement ladder this domain states". A reader of the code would see the values and not
which of them are load-bearing. The policy record the decision names is the reconciliation: it lives in the
code, is the single source of the values, and cites the requirement fixing each — so the table above is
checkable against it rather than a second copy of it.

**E — Route the replace through the platform's file-replacement call by way of a native binding.** Newly
plausible, because the spike shows it is the one mechanism that works past a held handle while leaving a
concurrent reader with complete previous contents — it would remove rule 1 and the ladder together. Not
chosen now: it is a second native module (ADR-0058 and ADR-0020 already carry one each), it is
Windows-only so the POSIX path stays anyway, and no requirement is failing for want of it now that
`REQ-SESSION-033` supplies the ladder the one hot replace path needs. It is the *Revisit if*, and it
replaces the trigger the previous version had, which was already satisfied and would have changed nothing.
