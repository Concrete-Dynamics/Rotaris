# The first release — Windows only, skills and workspace-context injection — 7. Order of work

Part 8 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

## 7. Order of work

1. ~~**Rulings.** O-1 and O-10, then one amendment round for whichever ESC readings stand.~~ **Done 2026-09-27**
   ([R-052](../../product/requests.md#r-052)): every ruling as recommended, and the amendment round landed with it.
2. **In parallel, after step 1.** Each item is its own worktree with its own first-execution row:
   - ~~§2.2 `/skills`;~~ **built 2026-09-27** (§2.2's first-execution note);
   - ~~§3.2 the latency measurement plus §3.3 the injection proof;~~ **built 2026-09-27** (the Windows gate-class
     reading owed);
   - ~~§4.1 the version guard~~ **built 2026-09-27**; *the prerelease naming defect it found repaired 2026-09-28 (R-062),
     unmeasured on a Windows package (IC-3; corrected 2026-10-13: a Windows x64 host, deferred under R-071)*. It found that **the setup manifest is owed and scheduled nowhere**.
     The manifest has to exist, with Git, ripgrep, the language servers and the `@playwright/mcp` pin
     (`REQ-STARTUP-058/059`), before §5's first check can pass. §4.3's section is generated from the same file, so
     that step is where it most naturally lands, and it lands packed: an `extraResources` entry, and either the
     guard's `toolServerPackages` field or a change to the guard's constant — **the manifest built 2026-09-28** (§4.1's
     second note): packed by `extraResources`, under the guard's `toolServerPackages`, its schema in `packages/config`;
     `pnpm release:guard v0.1.0` passes. §4.3's reader ~~still reads `pins.json` (OQ-73)~~ reads the manifest since 2026-09-28 (R-062), and the manifest's consumer,
     machine setup, stays outside this plan;
   - §4.3 the notices generator with the About defect — *built 2026-09-27; validation refuses until O-3, O-11 and OQ-74.
     OQ-72 does not stop validation, but until it is ruled the file knowingly leaves out the libraries linked into
     the bundled interpreter*;
   - §4.4 the bundled assets — *built 2026-09-27; its "assets" rule waits for the next Windows package.*
3. **The portable stub (§4.5).** Spike first, and report the result into ADR-0054.
4. ~~**The updater (§4.6)** if O-10 includes it~~ **built 2026-09-28** (§4.6's first-execution note; its apply and
   restart steps owed a real Windows artifact), then the manifest and signature (§4.7) against O-2's key.
   *The manifest, the signature step, the verification hook and the key record built 2026-10-22 (R-080; §4.7); O-2's key
   is still owed (§6.1).* *2026-10-23 ([R-082](../../product/requests.md#r-082)): O-2's public half is in the build and its
   row in the key record, for `0.1.0rc1` (§6.1 steps 2, 4 and 5); the `release` environment's secret (step 3) is the
   owner's and is not read or checked from the repository.*
5. **Assembly.** The release body (§4.8), the icon (§4.9) and the tag workflow (§4.2), run end to end against a
   prerelease tag (for example `v0.1.0rc1`) as a draft.
   *The release body and the tag workflow built 2026-10-22 (R-080; §4.2, §4.8). Their end-to-end run against a prerelease tag
   is owed, after O-2, O-3, O-11, OQ-74 and §4.5, each of which stops the workflow at a named stage today.*
6. **The gate (§5)** on O-6's machine, with the §2.3 and §3.4 live runs. When the gate is green, the owner
   publishes `v0.1.0`.

Each step owes what CLAUDE.md states for any change: `pnpm check` green, the affected view updated, and a
mechanism's first execution reported into its record and into `first-executions.md`.

### Published-asset verification — T3, 2026-10-24

`node tools/release-pipeline/update-path-proof.mjs` checks the actual public v0.1.0rc1 assets with the
updater's compiled-in public keys: a digest-character mutation refuses signature verification; the original
verifies before parsing and both executable downloads must match the signed digests. The method, execution
and limits are in [the T3 record](../../research/update-path-proof.md). No installer is run and the Windows
apply/restart evidence remains owed.
