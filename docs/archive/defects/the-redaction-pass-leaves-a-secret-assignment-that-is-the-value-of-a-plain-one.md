## The redaction pass leaves a secret assignment that is the value of a plain one

`redact` (`packages/kernel/src/redaction.ts`) masks `token=abcdef123456` and `x token=abcdef123456` to `token=***`, but
returns `Error: token=abcdef123456` unchanged. Layer 1 (`layerAssignments`) matches `Error` as the key, `: ` as the
separator and the whole token `token=abcdef123456` as its value; the key is not secret-looking, so the match is returned as
it stands, and the global replace resumes after it, so the inner `token=…` assignment is never examined. Layers 2 to 4 do not
catch it either unless the value carries one of the closed prefixes (`sk-`, `ghp_`, …). The shape is the ordinary shape of an
error message (`Error: password=…`, `detail: api_key=…`), which is what the pass is most often handed: an error's message
and stack in the application log, a failed command's detail, a tool's output. Measured 2026-11-01 while writing the
dispatcher's `command.failed` test (R-091 bundle A1): `['token=abcdef123456', 'Error: token=abcdef123456', 'x token=abc']`
redacts to `['token=***', 'Error: token=abcdef123456', 'x token=***']`. Not repaired here; the dispatcher's test uses a
prefixed value instead.

The same shape breaks the pass's idempotence, measured 2026-11-03 by the property tests of hardening bundle F2
(`packages/kernel/src/redaction.property.test.ts`, 20,000 runs at seeds 1 to 3): `ghp_= key=A0000a0aa0aAAa0A ` redacts to
`*** key=A0000a0aa0aAAa0A ` — the outer `ghp_=` assignment swallows `key=…`, then layer 4 masks `ghp_=` itself — and a
second pass, which no longer sees the outer assignment, masks `key=***`. A quoted outer value swallows the inner
assignment too (`msg: "use password=hunter22 now"` comes back unchanged). Those tests hold every assignment shape out of
their leak property where the text before it carries `=`, `:` or a quote, and a text that nests an assignment in an
assignment's value out of their idempotence property (`nestsAnAssignment`; the spaced `ghp_= key = …`, whose inner name
the outer assignment takes as its value, breaks it the same way), and pin `ghp_= key=…` as still changing on a second
pass; the repair removes that branch of `heldOut`, the predicate and the pin.

## Specs

REQ-TOOLS-171 (one value token after a secret-looking key is masked, wherever the text comes from) and REQ-EVENTS-060
(the same pass over event text): `token` is a secret-looking name (REQ-TOOLS-172's segment list), and its value survives.

## Relevant files

- `packages/kernel/src/redaction.ts` — `layerAssignments`: the `plain` expression consumes the inner assignment as the
  outer one's value and `isSecretLookingName(key)` is false for the outer key, so the match is kept whole.
- `packages/kernel/src/redaction.test.ts` — has no case of an assignment nested as another's value.
- `apps/desktop/src/main/command-dispatch.ts` — one of the callers that hands the pass an error message.

## Outcome — repaired 2026-11-01 (hardening plan hrd1, bundle D1), closed 2026-11-03 (hrd2, bundle F2)

The pass's first layer now consumes a value only when it masks it, so a non-secret assignment's value is read for a
secret assignment of its own: D1's repair (`layerPlainAssignments`, `valueEnd` in `packages/kernel/src/redaction.ts`),
recorded under its own note,
[an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md](an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md),
which found the same defect from the application log; `redaction.test.ts` pins `error: token=` and a URL's key query.
This note stayed open beside it until F2's landing met D1's repair at its rebase: the pin of
`packages/kernel/src/redaction.property.test.ts` ("`ghp_= key=…` still changes on a second pass") turned red, as it was
written to. Every shape above now masks in one pass and a second pass changes nothing: `Error: token=***`,
`msg: "use password=*** now"`, `*** key=*** ` and `*** key = *** ` (probed on the rebased head, 2026-11-03). The property
file dropped `nestsAnAssignment` and the assignment branch of `heldOut` that blamed this note, and holds the shape by a
worked case ("masks an assignment nested in a plain one in one pass"); the leak and idempotence properties ran green at
500 runs over 60 seeds without them. What the broad branch had also been hiding, a secret name taken as the value of a
secret assignment before it (`key= key = …`), is the other family, recorded on
[the-redaction-pass-masks-a-secret-name-as-the-value-before-it-and-leaks-the-secret-after.md](../../defects/the-redaction-pass-masks-a-secret-name-as-the-value-before-it-and-leaks-the-secret-after.md).
