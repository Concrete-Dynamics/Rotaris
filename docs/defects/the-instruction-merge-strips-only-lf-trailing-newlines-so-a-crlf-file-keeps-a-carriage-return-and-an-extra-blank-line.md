## The instruction merge strips only LF trailing newlines, so a CRLF file keeps a carriage return and an extra blank line

Noticed on 2026-11-04 by acceptance plan hrda's bundle `hrda-accept1-6` while repairing `injection-proof`'s isolated launch
(Windows 11 ARM64, Node 26.13.0, Git for Windows' system `core.autocrlf=true`). Recorded, not repaired: that bundle repairs the
proof, not the merge.

`mergeInstructionContext` drops a file's trailing newlines with `raw.replace(/\n+$/, '')` before either limit is applied, so
that "the separator between blocks is exactly one blank line whether or not the file ended with one" (its own comment). The
pattern removes line feeds only. A file with CRLF endings, which an isolated run's worktree holds whenever Git checks it out
under `core.autocrlf=true`, keeps its last carriage return: `# a\r\nline\r\n` reaches the model as `# a\r\nline\r`. A CRLF file
that ends with a blank line keeps a whole blank line as well, so two blank lines separate its block from the next:

```
'<!-- source: A -->\n# a\r\nline\r\n\r\n\n<!-- source: B -->\n# b'
→ "<!-- source: A -->" | "# a" | "line" | "" | "" | "<!-- source: B -->" | "# b"
```

The same file with LF endings is separated by one blank line. The per-file and total limits charge the stray bytes too.

## Specs

REQ-WORKSPACE-043: "blocks SHALL be separated by one blank line". A CRLF file ending in a blank line is separated by two. Whether an
instruction file's CRLF endings should be normalised is not stated (REQ-WORKSPACE-043 to 045, REQ-WORKSPACE-050).

## Relevant files

- `packages/config/src/instructions.ts` — `mergeInstructionContext`, the two `replace(/\n+$/, '')` (the read and the cut).
- `apps/desktop/scripts/injection-proof.mjs` — its `blockOf` mirrors the same LF-only strip, so the isolated launch's
  expectation (`lib/checkout-text.mjs`) agrees with the product on a CRLF checkout and would follow a repair of the merge only
  if `blockOf` changes with it.
