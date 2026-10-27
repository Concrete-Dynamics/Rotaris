# ADR-0054 — Packaging, the four artifacts, and self-update — Revisit if

Part 9 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Revisit if

**The unwritable-root case is measured and behaves differently from the design above.** It is the only
part of `REQ-STARTUP-165` the spike left untouched, it is the branch this record wrote from scratch on
2026-09-02, and it is the one where the failure is a missing warning rather than a slow launch. Until it
is exercised, consequence 14 is the honest statement of what is known.

**The bundle grows materially past the anchor weight the figures were taken at.** Everything above is at
spike 17's `W150` anchor — a 507.9 MiB payload tree carried as a 182.68 MiB compressed artifact — with a
probe application that contains no product. The preparing run scales with the payload and with the core
count: single-threaded it was 3,798.8–3,909.8 ms, of which roughly 2.7 s is decompression, so a
four-core machine at twice this bundle weight is the first place the exempt run stops being comfortable.
The cached run is nearly insensitive to weight, so the number to watch is the **preparing** one, and the
lever is the archive rather than the check.

**Anti-malware or a filesystem filter treats the preparation root differently from an installed
directory.** Nothing in the measurement suggests it — no cached launch of either artifact at any cache
state exceeded 1,414.6 ms across 68 fast-path launches — but every figure here was taken with Microsoft
Defender enabled and unmodified on one machine, with locally written artifacts carrying no
mark-of-the-web, so **no SmartScreen prompt and no download-zone handling was exercised at all** and a
real download adds a first-run cost that is not measured. `REQ-STARTUP-156`'s gate, which now requires
two runs of a preparing artifact on a machine meeting `REQ-STARTUP-159`'s conditions, is where that lands.

**A single-file artifact ever needs to ship uncompressed.** Consequence 13 is why, and the argument would
have to survive a reproducible half-minute on the user's first launch.

**The specification defect this record previously designed around is closed and this clause is retired.**
It read: *"`REQ-STARTUP-165` (c) requires a run that can produce no preparation to 'still start the
artifact', while clause (d) requires preparing to 'write nothing outside the per-user directories of
`REQ-STARTUP-145`'. A payload that must exist as files cannot satisfy both where that root refuses every
write."* **Both clauses have since been amended and the contradiction is gone**: clause (c) fixes a
closed set of two permitted locations, clause (d) states the single exception in its own text, and the
case where neither accepts a write is explicitly declared out of the requirement's reach. The design is
restated against the amended text under "Where the ephemeral placement goes" above. **Nothing here is
owed to the owner and this is not a residue.**

**And:** the product ever acquires code signing, at which point signature verification of the artifacts
themselves becomes possible, `REQ-STARTUP-167`'s manifest signature is subsumed by it, and
`REQ-STARTUP-123`'s explicit note that neither check establishes anything about the artifacts carrying a
code signature would be worth revisiting as a requirement. Or `REQ-STARTUP-168` (b)'s gate check proves
undecidable in practice because the record of which keys shipped in which release was not kept from the
start — consequence 10 exists to stop that, and if it happens anyway the rotation story needs a different
mechanism rather than a better process.
