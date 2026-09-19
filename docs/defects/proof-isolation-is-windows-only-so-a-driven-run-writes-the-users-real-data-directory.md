## Proof isolation is Windows-only, so a driven run writes into the user's real data directory

Every proof script isolates the application it drives by handing it a private `LOCALAPPDATA` and `APPDATA`
(`apps/desktop/scripts/lib/driver.mjs:130-137`, and the same three lines copied into each script's own `launch`).
Those are Windows variables. `packages/platform/src/dirs.ts:53` resolves the data directory on POSIX from
`XDG_DATA_HOME`, falling back to `$HOME/.local/share`, and neither is set by the harness — so on Linux and macOS
the driven application ignores the private directory and opens its workspace databases under the **operator's own**
`~/.local/share/rotaris/workspaces/`.

Two consequences, both observed rather than reasoned:

1. **A proof that reads the store cannot find it.** `pnpm transcript-proof` fails at its first planting step with
   `expected one workspace database below …/.proof/transcript-proof/profile/local; found 0`, while the launch log
   one directory up records `opened /home/david/.local/share/rotaris/workspaces/v1-148f…/workspace.db (0 sessions,
   0 rows)`. The proof is not wrong about the database being absent; it is looking where the isolation promised it
   would be. Thirty-four scripts isolate this way.
2. **A throwaway run leaves a durable trace.** The databases a proof creates persist in the operator's real data
   directory, keyed by the workspace path the proof invented. Nothing is overwritten — the key is per workspace
   root — but the store the product treats as the user's accumulates rows no user made.

The preference store is unaffected: `ROTARIS_PREFERENCES_ROOT` is the product's own variable and is honoured on
every platform (`REQ-CONFIG-*`), which is why the same launch writes its preferences inside the proof profile and
its database outside it. The workspace store has no such override — `dirs.ts` is the only decision point.

**Repaired 2026-09-19** (branch `fix-r3-proof-isolation-separators`): `apps/desktop/scripts/lib/harness.mjs`
gains `proofIsolationEnv` — every launch names both pairs on every platform: the Windows pair as before, plus
`XDG_DATA_HOME` / `XDG_CONFIG_HOME` under the scratch profile's own `local/` (POSIX-spelled, since a POSIX
launch reads the values) and a short `XDG_RUNTIME_DIR` under the system temporary directory (a unix socket
path is capped at 108 bytes; the data root nested under `.proof/<name>/profile` already overflows it).
`apps/desktop/scripts/lib/driver.mjs`'s `startApp` uses it, and `launchOptions` carries it so the one
`skills-proof` launch that already went through the shared helper is isolated too. The product's half:
`packages/platform/src/instance.ts` takes an optional `socketDir` (else `XDG_RUNTIME_DIR` on POSIX), so the
claim listens on the shallow directory while every other file stays under the data root. Measured: new unit
case on `endpointFor`'s contract (shallow address, under the 108-byte cap, defaults unchanged); `pnpm
driver-proof` green (14 passed) with the store under the profile's `local/` and no `USERPROFILE` leak in the
log. **Not proven here**: that a POSIX launch lands its store in the profile — no such host exists on this
project yet, so the POSIX half is argued from `dirs.ts` reading exactly these variables, not measured.
`HOME` is still the operator's own on POSIX (except through `ROTARIS_CAPTURE_SKILLS_HOME` in `skills-proof`);
overriding it kills Electron before it paints on Windows.

**Exporting `XDG_DATA_HOME` at the proof's own profile does not work, and the reason is a POSIX limit the
Windows-shaped design never had to meet.** The single-instance claim listens on a unix socket under the data
directory, and a unix socket path is capped at 108 bytes:

```
Error: listen EINVAL: invalid argument
  /home/david/dev/Rotaris-crw-wt-agentlines/.proof/transcript-proof/profile/local/rotaris/instance-1283393-ead1812…
```

The same claim over a named pipe on Windows has no such cap, and the fallback `~/.local/share` is short enough
that the limit is invisible until something asks for isolation. Whatever fixes the first half has to put the
instance socket somewhere short — `XDG_RUNTIME_DIR`, which exists for exactly this, or a fixed shallow path —
rather than assume the data directory is a place a socket can live.

## Specs

No requirement is contradicted. `REQ-STARTUP-*` and ADR-0058 fix where the product stores a workspace database,
and the product does exactly what they say on this host; the harness is what assumes a Windows-shaped environment.
It is a defect of the evidence, not of the behaviour — which is why a proof that passes here proves less than it
reads as proving, and one that reads the store cannot run at all.

## Relevant files

- `apps/desktop/scripts/lib/driver.mjs` — the shared driver's environment; `LOCALAPPDATA` and `APPDATA` only.
- `apps/desktop/scripts/lib/harness.mjs` — `cleanEnvironment` strips `ROTARIS_*` and keeps `HOME`, so the fallback
  in `dirs.ts` resolves to the operator's home.
- `packages/platform/src/dirs.ts:44-62` — the POSIX branch that reads `XDG_DATA_HOME`, and `workspaces` beneath it.
- `apps/desktop/scripts/transcript-proof.mjs:58,83,111` — the script where the assumption becomes a failure.
