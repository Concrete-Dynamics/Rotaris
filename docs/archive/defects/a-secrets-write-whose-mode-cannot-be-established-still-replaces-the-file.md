## A secrets write whose mode cannot be established still replaces the file

**Outcome: repaired 2026-11-09 (slice-B rework round 1, branch `feat/mcp-web-search-onboarding`); both residues are closed at the primitive, and the repair is pinned by `packages/platform/src/protection.test.ts` (protect-then-write, a refusal before the rename, `0600` at every observable instant) and `packages/config/src/mcp/secrets-write.test.ts` (the same ordering on `secrets.yaml`, with the ACL path driven through the platform adapter; the negative control stubs the protect call out and the mode case goes red).** `replaceDocument` gained a `protector` option (`packages/platform/src/document.ts`): the staged sibling is created EMPTY, the adapter protects it and reads the protection back, and only then is a byte of content written — the ordering `credentials/store.ts` keeps for `<id>.json`, now one protection path for both files (the adapter moved whole into `packages/platform/src/protection.ts`). A protection refusal answers `document.protect` BEFORE the rename, so "the write does not happen" holds by construction and no put-back step exists: the target is never touched. The mode-only `mode` option keeps its post-rename check for the callers that declare a mode and nothing more, and its comment no longer claims an ACL adapter runs on Windows (none did — the defect's second half, fixed by routing both protectors through the same primitive: `createProtector`'s win32 branch and `posixProtector`, with the ACL adapter unit-tested here with its `exec` injected and **not measured on a real Windows host**, none being available to this build).

Found 2026-11-09 while building REQ-MCP-110/111's write side (slice B1 of the web-search onboarding work), from
reading ADR-0004's primitive rather than from a run: `replaceDocument` (`packages/platform/src/document.ts`) applies
its declared mode **after** its rename — the staged file is renamed over the target, and only then is `chmodSync`
called and the mode read back. REQ-CONFIG-216 requires that where the required protection cannot be established "the
write does not happen: the staged file is removed and the failure is reported".

Two residues follow, both belonging to the primitive rather than to any one caller:

1. Between the rename and the chmod the target exists holding the NEW bytes at whatever mode the staged file
   inherited, so a reader (or a copy) in that window sees the content of a write whose protection is not yet
   established — for `secrets.yaml` at mode `0600` this is a window where the file may be up to `0644`.
2. When the mode step itself fails (`document.mode`), the file has ALREADY been replaced: the caller is told the
   write did not happen, and the new content is the file's content. The secrets writer
   (`packages/config/src/mcp/secrets-write.ts`) puts the target's own bytes and mode back best-effort when it sees
   `document.mode`, which narrows the residue to a crash between the two steps and to a put-back that itself fails —
   neither reported, because there is nothing left to report through.

No requirement names the primitive as the protector; REQ-CONFIG-216 names the FILE (`secrets.yaml` at `0600`) and
REQ-PROVIDER-016's read-back discipline is what the mode option implements. The fix lives in the primitive (the
`protector` option protects the staged file before the content, so the mode is established before anything observes
the content), which is why this was a note rather than a repair inside slice B1: it touches every replace-form
caller (`writers.ts`, the traceability artifacts, the exports) and needed its own verification — the option is
additive and no other caller declares it, so the blast radius is the two files REQ-CONFIG-216 and REQ-PROVIDER-016
name.

## Specs

- REQ-CONFIG-216 — "Where the required protection cannot be applied the write does not happen: the staged file is
  removed and the failure is reported on this requirement's own terms above, so no secret is ever left on disk at a
  weaker protection than this requirement fixes." Residue 1 leaves a window; residue 2 leaves the new content in
  place whenever the put-back cannot run or fails.
- REQ-CONFIG-444 — the sibling requirement the secrets file is deliberately NOT written under; it permits a
  platform-default fallback, which is exactly what residue 1 exposes for the duration of the window.

## Relevant files

- `packages/platform/src/document.ts` — `replaceDocument` gained the `protector` option (protect-then-write, refusal
  before the rename); `replaceDocumentSync` states it takes none.
- `packages/platform/src/protection.ts` — the one protection adapter (moved whole from
  `packages/providers/src/credentials/protect.ts` on 2026-11-09), with `createProtector`'s win32 and POSIX branches.
- `packages/config/src/mcp/secrets-write.ts` — the caller on the repaired path: `commitSecrets` passes the adapter,
  and no put-back step exists because the failure answers before the target is touched.
- `packages/config/src/writers.ts` — the other configuration writer on the same primitive; mode `0644`, where the
  window was far less consequential, and it declares the mode alone (unchanged).
