## Two requirements fix the composer's project-setup refusal differently

`packages/ui/src/composer.ts` holds one refusal string for an unanswered project-setup
prompt:

```
Answer the project setup prompt before sending a prompt. Nothing else in the application is blocked while it waits.
```

It was written against `REQ-CHAT-007`, which says of this second refusal that its "wording
is left to the implementation" and must convey exactly two facts. The comment above the
constant records, accurately and at the time, that the gate was vacuous: nothing could
pass `true` because the task registry did not exist.

`REQ-WORKSPACE-112` states the same refusal as **fixed text**, and it is different text:

```
Answer the project setup prompt first. Initialize or skip it in the setup window; nothing else in Rotaris is blocked.
```

It also fixes a second string the composer has no equivalent of at all — the keyboard
submit path, which `REQ-WORKSPACE-112` says is "caught separately" with error "Project
setup is unanswered" / "Initialize this workspace or skip its setup before starting a run."
and an "Open project setup" action. Today the keyboard path and the button path share one
string.

So a conformance-test author reading domain 3 and a conformance-test author reading domain
13 write different assertions about the same control, and both cite a requirement. One of
the two is the product's wording; the specification does not say which. The likely
disposition is that `REQ-WORKSPACE-112` governs — it is the more specific statement, it
names the surface that raises the prompt, and its text satisfies both facts `REQ-CHAT-007`
requires — but that is a reading, not a ruling, and the two requirements should agree in
the corpus rather than in a build.

This is recorded as noticed, not as classified: it is a candidate for an amendment round,
not something to resolve by editing either requirement here.

## Specs

- **`REQ-CHAT-007`** — refuses sending in two situations; of the second, "The second's
  wording is left to the implementation and must convey exactly two facts — that the
  project-setup prompt has to be answered first, and that nothing else in the application
  is blocked meanwhile."
- **`REQ-WORKSPACE-112`** — "While the setup prompt is unanswered, the composer's Send
  control SHALL be disabled with the reason "Answer the project setup prompt first.
  Initialize or skip it in the setup window; nothing else in Rotaris is blocked." The
  keyboard submit path SHALL be caught separately with error "Project setup is unanswered"
  / "Initialize this workspace or skip its setup before starting a run." and an "Open
  project setup" action. This is a composer gate only — no other view is blocked."

## Relevant files

- `packages/ui/src/composer.ts` — `PROJECT_SETUP_REFUSAL`, `sendRefusal`, and the comment
  recording that the flag was unreachable when it was written.
- `packages/ui/src/composer.test.ts` — the test pinning the current wording.
- `packages/ui/src/WorkspaceView.tsx` — `projectSetupPending`, the parameter no caller
  supplied.

## Repaired — 2026-09-16

The requirements compose directly: REQ-CHAT-007 defines two facts; REQ-WORKSPACE-112 fixes copy that conveys both facts and adds the keyboard-path recovery. Send remains disabled with its exact tooltip and accessible description. Ctrl+Enter now raises the separate exact headline/detail and renders an `Open project setup` action wired to the same setup dialog. Current `pnpm check`: 1,886 passed, 25 skipped.
