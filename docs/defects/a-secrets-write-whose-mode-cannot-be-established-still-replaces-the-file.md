## A secrets write whose mode cannot be established still replaces the file

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
REQ-PROVIDER-016's read-back discipline is what the mode option implements. The fix would live in the primitive (a
fchmod on the staged descriptor before the rename, so the mode is established before anything observes the content),
which is why this is a note rather than a repair inside slice B1: it touches every replace-form caller
(`writers.ts`, the traceability artifacts, the exports) and needs its own verification.

## Specs

- REQ-CONFIG-216 — "Where the required protection cannot be applied the write does not happen: the staged file is
  removed and the failure is reported on this requirement's own terms above, so no secret is ever left on disk at a
  weaker protection than this requirement fixes." Residue 1 leaves a window; residue 2 leaves the new content in
  place whenever the put-back cannot run or fails.
- REQ-CONFIG-444 — the sibling requirement the secrets file is deliberately NOT written under; it permits a
  platform-default fallback, which is exactly what residue 1 exposes for the duration of the window.

## Relevant files

- `packages/platform/src/document.ts` — `replaceDocument` / `replaceDocumentSync`: the mode step after the rename.
- `packages/config/src/mcp/secrets-write.ts` — the caller that declines to inherit the residue: it detects
  `document.mode` and puts the target's bytes and mode back best-effort (see the comment on its `commitSecrets`).
- `packages/config/src/writers.ts` — the other configuration writer on the same primitive; mode `0644`, where the
  window is far less consequential.
