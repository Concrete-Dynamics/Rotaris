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
