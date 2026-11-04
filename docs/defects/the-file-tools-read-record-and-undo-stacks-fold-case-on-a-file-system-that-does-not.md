## The file tools' read record and undo stacks fold case on a file system that does not

`FileToolState.key` (`packages/agent-tools/src/tools/files.ts`) lower-cases every resolved path on every platform, and the read
record (REQ-TOOLS-133) and the per-path undo stacks (REQ-TOOLS-132) are keyed by it. On Linux, where `/work/A.txt` and
`/work/a.txt` are two files, they share one key: reading `a.txt` satisfies `write_file`'s must-read gate for `A.txt`, and both
files' writes push onto one undo stack, so `undo` of `A.txt` pops the newest entry of either file. An overwrite of `a.txt`
followed by an undo of `A.txt` writes `a.txt`'s previous content into `A.txt`; an undo of a create removes `A.txt` when its
bytes happen to equal what the other create wrote (the digest guard compares bytes, not names).

Noticed by R-091's bundle D3 (2026-11-04) while it gave the fence the platform's rule (`pathRuleFor`, `fence.ts`): since that
change the fence tells the two paths apart on Linux and this key does not. Reasoned from the code, not reproduced: this host is
Windows, where the two spellings are one file and the fold is right. The PD-TOOLS-006 write scopes match claims without regard
to case for the same reason (`packages/engine/src/children/write-scope.ts`, `packages/kernel/src/glob.ts`), which on Linux is
stricter than the file system, not looser.

## Specs

REQ-TOOLS-132 keeps the ten most recent writes "for each path"; REQ-TOOLS-133 records the paths read. On a case-sensitive file
system two paths that differ by case are two paths, so one stack and one read entry for both contradict both requirements
there. The fix is the fence's path rule applied to the key (`pathKey(resolved)`), with tests under an injected rule.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `FileToolState.key`, `markRead`, `wasRead`, `pushUndo`, `popUndo`.
- `packages/agent-tools/src/tools/fence.ts` — `pathRuleFor`, `pathKey`: the rule the key would take.
- `packages/engine/src/children/write-scope.ts`, `packages/kernel/src/glob.ts` — the write scope's case-insensitive match, which
  cites this key as its reason.
