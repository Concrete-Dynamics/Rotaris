## The product statement leaves out that the marker's directory may show as untracked

`PRODUCT_DIRECTORIES_UNIT`, the product statement `PD-TOOLS-012` revision 2 gives every agent, as first built (fin32,
2026-10-07), said that the application keeps the code-intelligence marker's directory out of version control with a line in
the repository's `info/exclude` "only at a repository's top level", and stopped there. Point (b) of the revision carries one
more fact: "so elsewhere version control may list it as untracked". Without it an agent working in a workspace below a
repository's top level sees the directory in `git status` as an untracked change and is not told why — the very probing
finding D4 of the final duress run at `a68f121` recorded (wave3's `git check-ignore` probes #281, #283, #285 and #286) — and
point (d)'s "do not count them as changes" stands without the reason it rests on.

Found by the independent review of fin32's bundle (2026-10-07), before the bundle landed; no live run met it.

## Specs

- `PD-TOOLS-012` revision 2, point (b): "the marker's directory in the repository's `info/exclude` only when the workspace is
  a repository's top level, so elsewhere version control may list it as untracked". The statement SHALL carry the four points.

## Relevant files

- `packages/config/src/product-directories.ts` — `PRODUCT_DIRECTORIES_UNIT`, its second sentence.
- `packages/config/src/product-directories.test.ts` — the four points, and the statement's length bound.

## Repaired — 2026-10-07 (review of fin32)

The second sentence now ends "only at a repository's top level, so elsewhere version control may list `<marker>/` as
untracked)", the name built from `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]` as before. The statement is 662 characters (it was
599), nearer 165 tokens a request; the length bound in the test moves from 620 to 680. Pinned by the case "names both
directories from their single sources and carries the directive's four points" in
`packages/config/src/product-directories.test.ts`, red on the statement before. `pnpm mcp-proof`'s launch 1 reads the built
app's orchestrator prompt with the new words. Reported in place in `PD-TOOLS-012` revision 2's first execution and in OQ-230.
