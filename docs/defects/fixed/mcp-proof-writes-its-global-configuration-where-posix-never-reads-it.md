## The MCP proof writes its global configuration where a POSIX launch never reads it

`apps/desktop/scripts/mcp-proof.mjs` spells the product's global configuration directory by hand —
`const configDir = join(local, 'rotaris', 'config')` — and writes the proof's `agents.yaml` (per launch) and
`secrets.yaml` there. That is the Windows answer only. The launch's environment comes from `proofIsolationEnv`, which
sets `XDG_CONFIG_HOME` to `<local>/rotaris/config`, and off Windows `resolveUserDirs` answers
`<XDG_CONFIG_HOME>/rotaris` (`packages/platform/src/dirs.ts`), so a Linux launch reads
`<local>/rotaris/config/rotaris/` and never opens the files the proof wrote. The harness already knows the rule:
`configDirFor(local)` in `apps/desktop/scripts/lib/harness.mjs` returns exactly that directory, and says it was added
after the live run made the same mistake with the discovery snapshot on 2026-09-24.

What follows on Linux: the global file carries the `alpha` and `beta` servers, `code_intelligence: { enabled: false }`
and the orchestrator's grant of `alpha`, `beta` and `gamma`, and none of it is read. The orchestrator is left with its
shipped grant, so the first scenario's surface holds `code_intelligence` alone, and the proof's first assertion — the
character-exact MCP section — fails. The stored secret in `secrets.yaml` is not read either, so the settings
scenario's masked-secret checks could not pass there.

Found by the independent review of the `PD-MONITOR-002` branch on 2026-09-27, which ran a scratch copy of the proof
with `--no-sandbox` as root and saw `code_intelligence` alone in the surface. Confirmed here by reading the code (the
three paths above); not re-run. On macOS the product reads `~/Library/Application Support/rotaris`, below the real
home directory, which neither this spelling nor `configDirFor` names. The same hand-spelled
`join(local, 'rotaris', 'config')` stands in nine other proof scripts — `artifacts-proof`, `code-intel-proof`,
`config-proof`, `init-proof`, `notice-proof`, `plan-gate-proof`, `resilience-proof`, `sandbox-proof` and the
`mcp-console-spike` — and whether each of them fails off Windows depends on what it needs from the global file; that
was not checked one by one.

## Specs

None contradicted: the product reads the directory `resolveUserDirs` names on each platform. The defect is the
instrument's — on POSIX the proof cannot exercise the MCP requirements it exists to show (REQ-MCP-023, REQ-MCP-025,
REQ-MCP-027 and the rest it asserts), so a red there is the harness's, not the product's.

## Relevant files

- `apps/desktop/scripts/mcp-proof.mjs`: `configDir` (the hand-spelled directory), `globalYaml`, the `secrets.yaml`
  write, and `launch`, which writes `agents.yaml` there before each launch.
- `apps/desktop/scripts/lib/harness.mjs`: `configDirFor`, the rule the proof should use, and `proofIsolationEnv`, which
  sets `XDG_CONFIG_HOME`.
- `packages/platform/src/dirs.ts`: `resolveUserDirs`, the three platform answers.
- The nine other proof scripts named above, each with the same `join(local, 'rotaris', 'config')`.

## Repaired — 2026-09-28, under R-062

`configDir` is `configDirFor(local)`, so `agents.yaml` (per launch) and `secrets.yaml` land where the platform's
`resolveUserDirs` reads them; every launch carries `hostSwitches`. Launch 7's one Windows-only check — the `.cmd`
runner standing in for `browser` probing healthy through REQ-MCP-113's wrap — is asserted on win32 and **stated not
applicable** elsewhere, with its reason and the observed health recorded in `results.settings.cmdRunner`, so the
launch's other checks (the probing states, the two contacts of REQ-MCP-054, the masked and scoped secret, no secret in
any line) and launches 8 and 9 run off Windows rather than stopping there.

Measured as root under Xvfb on Linux, Node 24, after one `pnpm build`: `pnpm mcp-proof --skip-build` — **nine launches,
exit 0**. Launch 1's section is character-exact with the three fixture servers and the handshakes name `rotaris 0.1.0`;
launch 7 reads alpha, beta and gamma `healthy`, ghost and off `unreachable`, the mask `***`, scope `Global`,
`ALPHA_KEY:yes,FROM_SHELL:no`, alpha contacted twice, and `browser` observed `unreachable` under the stated
non-applicability (a POSIX kernel does not execute `runner.cmd`); launch 9's discovery returned at 35,001 ms and the
application exited 1,028 ms after the quit. The first run of the same tree stopped at launch 6 with the beta row's
toggle "not on screen" at the 2,200 ms click; the second run passed it, and my own timing probe found the rows on
screen at 1,500 ms — a fixed offset on a shared 4-vCPU host, recorded as
[`mcp-proofs-drop-rules-launch-clicks-at-a-fixed-offset.md`](../mcp-proofs-drop-rules-launch-clicks-at-a-fixed-offset.md),
not repaired here. Not re-run on Windows: no Windows host here (IC-3), and the win32 spelling is unchanged.
