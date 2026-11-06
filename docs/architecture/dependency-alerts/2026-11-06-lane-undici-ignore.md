# Lane record — the `undici` majors' ignore entry in `.github/dependabot.yml` (R-091, 2026-11-06)

The owner's ruling of 2026-11-06, after #54's close: the repository stops Dependabot re-proposing a version it has
already measured incompatible with the product as built. Branch `chore/deps-dependabot-undici-ignore`, cut from
`origin/main` at `b6501e8e`. It changes Dependabot's configuration and the test that holds it, and nothing else; no
manifest, no lockfile, no shipped code.

- **Read against:** `b6501e8e`, Linux x86_64, Node 26.12.1, pnpm 11.9.0, 2026-11-06 about 19:20 UTC.
- **Source:** #54's own evidence (job `126841519958` on head `24ad497a`), re-read from the `gate` job's log rather than
  from the pull request's description.

## 1. What was refused, and where the refusal was measured

`packages/agent-tools/src/tools/direct-fetch.ts` builds an `undici` `Agent` and hands it to `fetch` as the
`dispatcher` — OQ-37's shape, in the product's own code. On #54's head (`24ad497a`, the `production` group's
`undici` 7.30.1 → 8.12.3) the gate measured:

```
TypeError: fetch failed
  Caused by: InvalidArgumentError: invalid onRequestStart method
    at .../node_modules/undici/lib/core/util.js:597
```

`direct-fetch.test.ts`'s "selects the target directly even when the process global dispatcher routes through a proxy"
went red on that error, and **five** `fetch.test.ts` cases went red in three different ways: three read
`network_error` where the product's own words are expected — `http_error` (the 404 case and the server's 500) and
`egress_redirect_denied` (the `localhost` redirect) — and two on non-`failure_kind` assertions (a body assertion
answering `true` for `false`, and a `seen` list empty where `['/slow']` is expected). The `Dispatcher` contract the
code is written against is 7's, not 8's: the bump is **incompatible with the product as built**, not merely an
unverified update. #54 was closed on that reading, with the re-open condition named in its comment.

## 2. Why an `ignore` entry, and why only this one

Closing a pull request does not stop Dependabot: on its next weekly run it sees the same version behind and opens a
fresh one. Without an entry the decision has to be re-made every week from the same evidence, and a re-open reads as a
reversal of the reading rather than as the bot doing its job. The entry is deliberately as narrow as the evidence:

| Refused | Why | What lifts it |
| --- | --- | --- |
| `undici`, **majors only** | the `dispatcher` use above is 7's contract; 8.12.3 refuses it | the dispatcher use rewritten for 8's contract in its own branch, `direct-fetch.test.ts` and `fetch.test.ts` green under 8 — then delete the entry |

Only majors are held, because only the major is in question: 7's patches and minors are ordinary updates and stay
proposable. No other dependency is named — #52's `typescript` 7 is **held, not closed**, and its blocker is a
prerequisite to build (an explicit JS compiler-API dependency), so it stays visible as a weekly proposal rather than
being suppressed here.

## 3. The change

`.github/dependabot.yml`, the `npm` entry, beside `cooldown` and above `groups`:

```yaml
    ignore:
      # ... the evidence and the re-evaluation condition, in the file (see §1, §2)
      - dependency-name: 'undici'
        update-types: ['version-update:semver-major']
```

The reason lives beside the dependency it names, not in a pull request's description: the next reader of the file does
not open the pull request that added it. The file's own header comment and the alerts folder's README both say the test
holds the list now.

`tools/dependabot.test.ts` gains one case (`ignores undici majors and nothing else, and records why in the file`):
it asserts the **whole** parsed `ignore` entry (not a projection of it, which a second key such as `versions` could
slip past while holding patches and minors too), that the `github-actions` entry ignores nothing, and — slicing the
comment off the parsed `ignore` node itself, so a decoy comment elsewhere in the file cannot satisfy it — that the
block still cites its evidence (`direct-fetch.ts`, `OQ-37`, `onRequestStart`) and its lifting condition
(`Re-evaluate when`).

## 4. Verification

- `npx vitest run tools/dependabot.test.ts` → **6 passed** (was 5), on the head.
- **Negative controls, run and reverted** — a test that cannot fail is not evidence:
  - `update-types` changed to `version-update:semver-minor` (valid YAML, wrong rule) → the new case **fails**,
    `expected [ 'version-update:semver-minor' ] to deeply equal [ 'version-update:semver-major' ]`.
  - every comment line removed from the `ignore` block (the entry kept, its reason gone) → the new case **fails**
    on `Re-evaluate when`.
  - **a second key added** to the entry — `versions: ['>=7.0.0']`, which would hold patches and minors too — → the new
    case **fails** on the whole-entry equality. (The reviewer pass found this hole in a projection-based first
    version; the case now compares the whole entry.)
  - **a decoy comment** elsewhere in the file carrying the four cited phrases, with the block's own comments removed →
    the new case **fails**. (Also from the reviewer pass: the first version sliced the file by substring position,
    which a decoy satisfied. The reason is now read off the parsed `ignore` node's `commentBefore`.)
- `pnpm check` runs in CI on the landed head; its lint stage reads this file through `folder-indexes` and
  `check-doc-budget` like any other record.

## 5. What this is not

Not a dismissal and not a security judgement: no alert is closed or read by this file (the alerts keep their own
readings under `docs/architecture/dependency-alerts/`), and 7.30.1 stays the resolved version. It stops a version
update, on the evidence that version's own pull request produced. If the re-evaluation condition is met, the entry is
deleted in the branch that rewrites the dispatcher — the entry names that branch as its own removal condition.
