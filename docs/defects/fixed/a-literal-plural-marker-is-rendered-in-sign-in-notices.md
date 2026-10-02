## A literal "(s)" plural marker is rendered in the provider sign-in notices

A sign-in with discovery reports "Added Katalyst; discovered 1 model(s).": the literal parenthesised plural. The same
form is in every discovery message of the sign-in module.

Live-run finding: L11 (live runs of 2026-09-29)

## Specs

- `REQ-SHELL-044`: "the literal parenthesised '(s)' form is never rendered anywhere in the product". The notes triage
  counted at least fifteen more rendered sites outside this module (dialogs, Library, Settings, notices, timeline text,
  `summarise`); this note records the sign-in sites the live run showed.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), `sign-in/sign-in.png`: "Added Katalyst; discovered 1 model(s)."

## Relevant files

- `packages/providers/src/signin.ts:157`, `:174`, `:235`, `:252`, `:275` (twice), `:375` — the messages.

## Repaired — 2026-09-29 under R-067

The sign-in sites were the ones the live run saw. A grep of the product's source for the marker found about thirty more
that reach a surface. They were the checkpoint dialogs, notices and timeline entries (REQ-GIT-097, REQ-GIT-098,
REQ-GIT-100), the run's failure summary, and the compression notices. The Library's proposal source, the Skills
tooltip and the traceability messages had it too. So did the tool results the transcript's tool row draws, such as line
and occurrence counts, todo, delegation, and the terminal's list and output warnings. Each now words its count with
`countNoun`. Where a verb follows the count, it agrees too. REQ-SHELL-044 governs where a requirement quotes the marker
in a drawn string, as REQ-CHAT-168, REQ-HOOKS-054 and REQ-HOOKS-106 already say of their own domains. The sign-in texts
of REQ-PROVIDER-054/099/108 and REQ-GIT-098's `Overwrite <n> uncommitted change(s)` are among them.

`countNoun` moved from `ui/agents.ts`, which re-exports it, to `kernel/count-noun.ts`. `providers`, `engine`,
`agent-tools`, `contracts`, `platform` and `workspace` cannot import `ui`, and every package may import the kernel.
The four local `plural` helpers it replaces now use it too.

Three kinds of text keep a marker, each for a stated reason. Log lines stay because main writes them to the
application log and draws none of them, and proofs match several as written. The generated declarations module's doc
comments are written into the workspace, and they are not counts. Four tool results keep it because their requirements
spell it: REQ-TOOLS-110's `byte(s)`, REQ-TOOLS-134's `match(es)`, REQ-LIBRARY-100's `artifact(s):` and
REQ-LIBRARY-089's `Invalid tag(s): `. The tool row draws those four too, so
[OQ-138](../../architecture/open-questions.md) asks which way that goes.

Pinned by `tools/check-plural-markers.test.ts` and `pnpm lint`'s `tools/check-plural-markers.mjs`. The check reads every
string literal, template and JSX text in the product's source and fails on a marker outside those exemptions. It also
fails on an exemption that excuses nothing. On `origin/main` (`eb49796`) it finds 58 sites. `kernel/count-noun.test.ts`
covers the helper. `CheckpointDialogs.test.ts` and `settings/SkillsSettings.test.ts` cover the singular and plural of
two drawn sites. The unit tests and proofs that asserted the old wording now assert the agreeing one: `signin.test.ts`,
the checkpoint, compression and report tests, `checkpoint-proof` and `chat-controls-proof`. The live run's sign-in
check now also fails on a literal "(s)" in the sign-in outcome. Repaired 2026-09-29 under R-067.

Shown live by `pnpm live-run --confirm --only=frictions` on the built app of `fix-file-tools-plurals`. The pack is
`.live-run/runs/2026-09-30T04-29-02-452Z` of that worktree (git-ignored). The sign-in notice in `sign-in/sign-in.png`
reads "Added Katalyst; discovered 1 model.", and the new check "the sign-in notice words its model count without a
literal "(s)"" passed. In the same run, frictions' `write_file` create read "Created friction-probe.txt: 1 line
created." `checkpoint-proof` and `chat-controls-proof` pass on the same build, with their assertions moved to the
agreeing wording. `chat-controls-proof` needed the code-intelligence bundle built in the checkout first, the
precondition recorded in
[`chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`](chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md).
`slice-proof`'s sign-in regex was moved too, but it signs in to OpenRouter with the owner's key, so it was not run.
