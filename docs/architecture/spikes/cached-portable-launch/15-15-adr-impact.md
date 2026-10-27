# Spike — the cached launch of the Windows `onefile` portable — 15. ADR impact

Part 15 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 15. ADR impact

**SR-7's ruling is sound and the gate condition it attached is met.** The remaining options SR-7 held in
reserve — amending `REQ-STARTUP-155` to 17.5 s, or giving up the single-file artifact — are not needed.
Nothing below reopens ADR-0054's decision; the points are corrections and additions inside it.

1. **ADR-0054's launch-preparation design works, and the 0.7 s baseline it rests on is now a result.**
   The mechanism writes the same 507.9 MiB tree in **410.7 ms (`store`) to 565.7 ms (`deflate`)**, faster than the `fs.cpSync` baseline
   of 684–722 ms that SR-7 called "a baseline and not a result", because it writes large chunks in
   parallel. The cached launch is **575.5–624.2 ms warm and 897.3–1,242.5 ms cold**, against 5,000 ms.
   The whole launcher costs about **37 ms** over launching the tree directly.

2. **The version-check decision is correct and is now priced.** ADR-0054's "one directory probe and one
   small read … reads none of the payload and hashes nothing" costs **0.14–0.49 ms warm, 0.37 ms on its
   first cold touch**. The alternative it rejects — a launch-time digest — costs **709.6–845.0 ms** for
   the 182.7 MiB artifact with the fastest implementation on this machine, **1.48–1.95 s** with a
   pure-Rust one, and **3.89–5.50 s** if the prepared tree is digested instead. The ADR should carry
   these figures; they are the difference between a defensible choice and an asserted one.

3. **A reason to compile the token in that ADR-0054 does not state, and should.** The ADR justifies
   compiling the token into the stub on cost-of-hashing grounds. There is a second reason worth more on a
   cold machine: **opening the artifact file at all cost 342.9 ms on its first cold open**, against 0.37 ms
   for a check confined to the preparation. A footer-reading fast path would pay that on the first launch
   after every boot. The ADR's phrase "reads none of the payload" should become "does not open the
   artifact".

4. **ADR-0054's commit step is wrong as written and must say "displace, then rename".** "written into a
   sibling directory … and then **renamed onto the token-named path as the last step**" cannot work on
   Windows when the token-named path already exists, which is exactly the case clause (c) is about.
   Measured consequences: with the marker deleted the launch succeeded but the preparation was never
   repaired, so it would re-prepare on every launch for ever; with the entry point deleted the launch
   produced nothing at all. The correction — rename the damaged directory aside first — costs
   **2.17–3.18 ms** and is in every result reported here. **This is a correction to the record, not a
   reopening.**

5. **ADR-0054's completeness check is too weak for `REQ-STARTUP-165` (c), and the fix is affordable.**
   "token-named directory absent, marker absent, marker unreadable, marker naming a different token or an
   unrecognised format, or the payload's own entry point missing" catches an interrupted preparation and
   a wrong version — all eight such classes were detected here and redone silently in 1.6–2.0 s. It does
   **not** catch damage to the interior: with `ffmpeg.dll` deleted or `app.asar` truncated the check
   reported a hit and **the launch produced no window**, which clause (c) forbids in terms. Carrying the
   path and length of every prepared file in the marker and stat-ing them all costs **3.56–5.87 ms**
   (0.1 % of the budget) and closes every damage class tested. Recommended as an addition to the ADR's
   check.

6. **ADR-0054's identity token needs its scope stated, and the launcher-format field needs to be called
   load-bearing.** The token is a digest of the payload; **a launcher-only change produced a
   byte-different artifact with an identical token and the preparation was reused.** That is defensible —
   the launcher is not in the preparation — but it means clause (b)'s "identical content" is carried by
   the *marker's launcher-format field*, not by the token, for anything about the launcher that affects
   layout. The ADR should say so, because a maintainer who treats that field as cosmetic reintroduces the
   failure clause (b) exists to prevent. The format check itself was exercised and works
   (`marker-format-mismatch` → silent redo, 1,611.0 ms).

7. **ADR-0056's fifth build output is cheap, and cheaper than what it replaces.** Archive assembly plus
   `cargo build --release` plus append took **35.1 s** for the `deflate` artifact and **13.1 s** for the
   `store` one, on top of a 99.1 s `--dir` build — against spike 17's **≈2 m 40 s** per
   `electron-builder` `portable` build, which the record advises not to expect caching to help. The
   launcher is **330,752 B** with two pure-Rust dependencies. ADR-0056 can budget this as roughly
   **35 s and one small Rust crate**, and it removes an NSIS/7z compression step rather than adding one.

8. **`REQ-STARTUP-125` is not merely preserved by SR-7's ruling — it is rescued by it.** Under
   `electron-builder`'s portable target the artifact is locked for the entire run: 79 consecutive
   `EBUSY` failures, the rename succeeding only at 16,837 ms when the portable's own process exited.
   `REQ-STARTUP-125`'s "the replacement SHALL succeed while the application being replaced is still
   running" was **not satisfiable** on that target. Under the preparation, the rename succeeded on the
   **first attempt at 189 ms** with the application running. ADR-0054's rule that "the stub must close
   its handle on the artifact file before the application starts" and "must not remain as a supervising
   parent" is not a precaution — it is the whole difference, and it is now measured.

9. **ADR-0054's roaming trap is confirmed on this machine, not merely anticipated.**
   `app.getPath('userData')` resolved to `C:\Users\…\AppData\Roaming\rotaris-fp-probe`. A preparation
   derived from the platform layer's default user-data path would put 507.9 MiB per version into
   replicated storage, violating clause (a) and `REQ-STARTUP-166`. The ADR's instruction to derive the
   preparation root from the **local** application-data location is doing real work.

10. **Reclamation is cheap and skipping it is not.** Two versions left **2 × 507.9 MiB** behind. Deleting
    one costs **86.9–90.6 ms**, so ADR-0054's "after the window is shown and off the critical path"
    placement is comfortable. The disk cost of not doing it is one full payload per version.

11. **A finding for ADR-0056 and for the artifact-size discussion, independent of the launch budget.**
    The first cold execution of a newly built **508 MiB** executable cost **31.2–33.9 s before any of our
    code ran**, three times out of three, with none of it attributable to the launcher; a **182.7 MiB**
    artifact showed nothing comparable in eight control runs, and no cached launch of either size ever
    did. The cause was not established (§11) and the cost falls inside the exempt run — but it is a third
    reason, alongside `REQ-STARTUP-032`/`-038` and the update download of `REQ-STARTUP-124`, not to ship
    the payload uncompressed. **Compress the archive.**

12. **ADR-0055's budget arithmetic can now be restated for the flavour that previously had none.** On the
    Windows portable running from its preparation, packaging and runtime consume **0.58–1.41 s** of the
    5,000 ms, leaving roughly **3.6–4.4 s** for the sequence ADR-0055 fixes — preference scoping, branded
    icon, bundled font registration, theme restore, all before any window exists. That is the same order
    of headroom spike 17 measured for the installed flavour (0.66–1.56 s consumed, 3.4–4.4 s left), which
    is the point: **the portable is no longer a special case.**

---
