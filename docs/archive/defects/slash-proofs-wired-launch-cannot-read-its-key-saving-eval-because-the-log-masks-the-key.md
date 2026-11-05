## slash-proof's wired launch cannot read its key-saving eval because the log masks the key

**Outcome (repaired on main before this note landed, 2026-11-05, acceptance hrda AF-16's review).** The note was recorded on
`hrda-accept1-4` against a base whose `readEval` matched the logged expression verbatim. `a10ad853` (on `main` since
2026-11-04, `docs/archive/defects/rows-and-git-proofs-read-probe-and-eval-text-the-application-logs-redaction-pass-masks.md`)
made `readEval` accept the log's masked echo of an expression as its own (`apps/desktop/scripts/lib/logged-text.mjs`), and
that reader covers this expression too: on the branch rebased onto it, the key-saving eval's echo, written through the
product's own `redact()`, reads back its answer. Pinned by `apps/desktop/scripts/lib/capture-evals.test.ts`, "slash-proof's
wired launch reads its key-saving eval through the masked echo": both cases pass, and the read case fails against the
reader before `a10ad853` (checked by restoring that file for one run). Not shown in the built app: on the rebased head
`slash-proof` stops earlier, in its catalogue launch, on
`docs/defects/an-open-slash-popup-loses-skill-and-skills-when-the-catalogue-is-rebuilt.md` (two runs on 2026-11-05), so its
`wired` launch was not reached.

`pnpm slash-proof`'s `wired` launch (Part C2) schedules an eval that saves a made-up DeepSeek key through `providers.save`
and lists the providers (`saveProviderKeyAndList`, `apps/desktop/scripts/slash-proof.mjs`), then reads its answer with
`readEval(wired.evals, W.saveAndList, saveProviderKeyAndList)`. `readEval` (`apps/desktop/scripts/lib/capture-evals.mjs`)
finds a logged eval by its offset and its expression text exactly. The expression carries the key as the literal
`apiKey: 'sk-proof-not-a-real-key'`, and the application log writes it masked, `apiKey: '***'` (the redaction pass the log
runs every line through, `packages/kernel/src/redaction.ts`), so no logged eval matches, the read answers `undefined`, and the
proof stops at "the credential store should have taken the key: undefined" (line 628).

The product did what was asked: the same log line's answer reads `{"saved":{"ok":true,"message":"Saved. Saved the key for
DeepSeek."}, …, {"id":"deepseek","authenticated":true}, …}`, and the `/logout` that follows logs "Deleted stored tokens for
deepseek" and "Signed out of DeepSeek.". So the red is the harness's: masking a key-shaped value in the log is what the product
is meant to do.

Seen 2026-11-04 on Windows 11 ARM64 (Node 26.13.0, CPU load 83 %, the acceptance tree's Electron running beside it) on branch
`hrda-accept1-4`, the first run on this host to get past the catalogue launch's skill-badge check
(`docs/archive/defects/slash-proof-counts-a-skill-from-the-real-home-as-a-fixed-skill-command.md` had stopped every Windows run
there since 2026-11-01), so this check had not been reached here before. Whether it passes on a host where it is reached is not
known; nothing in the reading depends on the platform.

## Specs

None contradicted by the product: `/logout` (REQ-CHAT-159) and the credential store behaved, and the log masked a key-shaped
value as its redaction pass is meant to. The proof reads its own probe through text the product masks.

## Relevant files

- `apps/desktop/scripts/slash-proof.mjs`: `saveProviderKeyAndList`, which carries the key as a literal in the logged
  expression, and the read at line 628.
- `apps/desktop/scripts/lib/capture-evals.mjs`: `readEval`, which matches the logged expression exactly.
- `packages/kernel/src/redaction.ts`: the masking the logged expression goes through.
