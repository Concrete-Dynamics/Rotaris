# Rotaris-crw — system architecture — 4. How a run flows, end to end (continued)

Part 6 of 13 of [the architecture README](../README.md), which indexes every part.

**The restore stops the store for both holding processes while the application keeps running**, which is
a capability the topology did not previously need — the run host must close its connection, refuse runs
against it, and re-open, without exiting and without a window closing. It is the **second** two-process
handshake in the record after ADR-0014's quit, and it is not the same shape. It is whole-store
replacement; **merge is not offered at all, silent or stated.** The grounds are worth the sentence:
`REQ-SESSION-012` makes ids non-reusable, so the only possible collision is a backup against the store it
was taken from where the target has since recorded more of the same sessions — and merging those means
reconciling rows inside one session between divergent histories, producing a session neither ever
recorded, which is `REQ-SESSION-201`'s own forbidden "store no run could have left behind". A merge would
be a feature every use of which is its worst case. Lock rows naming a **foreign host** are dropped on the
way in and rows naming this machine are kept, with the count disclosed before the restore: artifacts
routinely carry locks for mid-run sessions, and restored elsewhere those name a host `REQ-SESSION-056`
resolves toward live and `REQ-SESSION-047` never reaps, so fidelity would make every session that was
live at backup time permanently unreachable. Dropping costs nothing — the status still asserts a run, so
with no lock the session is stale by `REQ-SESSION-057` and the ordinary repair settles it to
`interrupted`, which is what actually happened to it.

**Quit.** Main evaluates the window guards, asks the run host to stop **every** run before waiting on any
of them, and holds process exit until the run host reports teardown complete or a thirty-second deadline
expires — the same deadline as the cancellation grace, composing exactly with it. `REQ-MONITOR-131`'s
"a restart that is not a shutdown waits at most 5 seconds" and `REQ-MONITOR-287`'s worker join cap are
**different** allowances and must not be unified with it. A second quit during that window force-exits
immediately. **What a force exit can leave is now enumerated rather than gestured at**: incomplete ordered
effects, a reapable lock row, a truncated line in the session log, and a `summary.md` replacement that
lands as one of its two complete versions — and no partial trailing JSON line and no unwritten debounce
window, both of which are gone with the requirements that produced them. `REQ-SESSION-106` as amended
closes with "no run is ever left holding a lock that this machine cannot reclaim", which is what keeps
SR-5's unreapable case out of the quit path. Meanwhile the workspace service **waits** for in-flight
checkpoint version-control work and **abandons** an in-flight improvement analysis; those two behaviours
differ deliberately and must not be unified. At quit two of the three processes hold connections to one
machine-local store, so the quit sequence closes two connections in a defined order rather than leaving
it to process exit.

---
