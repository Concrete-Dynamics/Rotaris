# ADR-0056 — The build toolchain — Revisit if

Part 5 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

## Revisit if

A future requirement needs a second renderer entry point with genuinely different capabilities; or the
measured launch cost stops being dominated by the extraction mechanism and starts being dominated by
what the bundle **executes** at startup, which is the term the first-paint measurement deliberately did
not price.

**Restated: the bundle-size clause.** This record previously carried "bundle size threatens the 5 s
first-paint budget on the slowest artifact". On the measurement that is not the mechanism: 327 MB of
extra payload cost about 10 ms at first paint on the flavours that pass, and the flavour that failed
failed with an empty bundle. The clause is kept but re-aimed — the thing to watch is **start-up work**,
not weight, and on the portable the thing weight buys is a longer preparation on a run the requirement
exempts.

**On the native-module obligation.** Either binding stops being native — `node:sqlite` reaching stable
with Electron committing to ship it, which is ADR-0058's own revisit condition, or the equivalent for the
pseudo-terminal — in which case rules 1 to 4 narrow to whatever remains and are withdrawn entirely if
nothing does. Or the load proof of rule 4 turns out to be reachable *before* packaging with the same
strength, which would make it cheaper without weakening it; the reason it sits after packaging today is
consequence 8, and only a check that still sees asar unpacking may move. Or the packaging tool's native
settings move again, at which point the coupling recorded under "what was checked" fires and the
configuration has to be re-verified against the line ESC-11 puts the build on rather than assumed to have
carried over. Or spike 20 forces the launcher stub to place the payload by some means other than a
verbatim copy, which would put rule 3's "byte-for-byte, permissions intact" in tension with whatever that
mechanism is — the stub is the one component that handles unpacked addons without knowing what they are.
