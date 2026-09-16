## `glob` mistranslates a brace group into an invalid regular expression, then hands the engine's message to the model

`globToRegExp` translated `*`, `**` and `?` itself, but a brace group's alternatives it passed
through `escapeRe` — which escapes `.` and leaves `*` alone. So every alternative kept its
leading star as a bare quantifier:

```
pattern: packages/*/{*.json,*.js,*.ts,*.cjs,*.mjs}
regex:   ^packages/[^/]*/(?:*\.json|*\.js|*\.ts|*\.cjs|*\.mjs)$
throws:  Invalid regular expression: /^…/: Nothing to repeat
```

`globTool.execute` had no guard around the compile, so the `SyntaxError` escaped to the gate's
executor catch and reached the model as `The 'glob' call failed: Invalid regular expression:
/^packages/[^/]*/(?:*\.json|…)$/: Nothing to repeat`, with `failure_kind: execution_error` —
a message quoting a regular expression the caller never wrote, naming nothing it could change.
Observed on 2026-09-16 in session `6696f6ed`.

Two smaller faults in the same branch: the closing brace was found with `indexOf('}')`, so a
nested group closed at the wrong place, and the split was on every comma, so a nested group's
commas split the outer one.

This is the sibling of the grep defect repaired on 2026-09-15 (an inline flag group refused by
the in-process path). That repair made `compileSearchPattern` the single compilation point for
`grep` and `read_file`'s filter; `globToRegExp` was left out of the consolidation and kept its
own escaping, which is where this survived.

## Specs

- `REQ-TOOLS-141` — observable results are identical whether or not an external search
  accelerator is present. ripgrep and every shell accept a brace group, so the in-process path
  may not refuse one.
- `REQ-TOOLS-138` — an unreadable pattern is a recoverable error naming what was wrong.
  `Invalid regex pattern: <detail>` is the shape; the raised RegExp message was not it, and
  the guidance belongs in the detail.
- `REQ-TOOLS-139` — the glob tool's own contract over workspace-relative POSIX paths,
  unchanged by this repair.

## Relevant files

- `packages/agent-tools/src/tools/search.ts` — `translateGlob` (new, recursive: an alternative
  is a glob like any other), `closingBrace` (depth scan) and `braceAlternatives` (splits at its
  own level). `globToRegExp` is now a thin wrapper over it, and `globTool.execute` guards the
  compile the way `grepTool` guards `compileSearchPattern`.

## Known and left alone

Character classes (`[abc]`) are still literal in a glob pattern here, as they have always
been. That is a real difference from an accelerator's dialect and so is arguably the same
defect; it was not observed, is not what the run hit, and widening the translator on the way
past would have put untested behaviour in the same change. Recorded here so it is not lost.

## Repaired — 2026-09-16

Regression test: `packages/agent-tools/src/tools/tools.test.ts` — "glob brace alternatives are
globs, not literals (REQ-TOOLS-141): what ripgrep accepts is not refused here", which drives
the exact pattern that failed, the nested and path-separator cases, the unclosed brace, and a
list of malformed patterns that must each come back as an observation rather than a throw.
