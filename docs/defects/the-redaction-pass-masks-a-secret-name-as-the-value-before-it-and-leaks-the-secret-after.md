## The redaction pass masks a secret name as the value before it, and leaks the secret after

`redact` (`packages/kernel/src/redaction.ts`) reads one value token after a flag, after a scheme word and after an
assignment's separator, and it does not ask whether that token is itself a secret name waiting for its own value. When
it is, the earlier rule takes it as its value — and either leaves it alone (the earlier name is not secret-looking) or
masks it (the earlier name is) — and the global replace resumes after it, so the real secret one token later is never
examined. Layer 4 catches it only when the value carries one of the closed prefixes (`sk-`, `ghp_`, …). Measured
2026-11-03 by the property tests of hardening bundle F2 (`packages/kernel/src/redaction.property.test.ts`, which hold
these shapes out of their leak property and pin each one as still leaking):

- **A flag after a flag** (layer 2): `curl -s --api-key abc123def456 https://x` and `cmd --verbose --password hunter22`
  come back unchanged. `-s` takes `--api-key` as its value; it is not secret-looking, so the match is kept whole and
  `--api-key`'s value is never read. Layer 2 already refuses a value that starts with `-` — but only for a secret flag.
  This is the ordinary shape of a command line, which is what the pass is handed in an approval prompt, the audit and a
  terminal tool's arguments.
- **A scheme word after a scheme word** (layer 3): `say token Basic dXNlcjpwYXNz` redacts to
  `say token *** dXNlcjpwYXNz`, and `token bearer abc123` to `token *** abc123`; whitespace between them may be a newline.
- **A flag after a secret assignment's separator** (layers 1 then 2): `password: --token abc123def456` redacts to
  `password: *** abc123def456` — layer 1 masks `--token` as the password's value, and layer 2 no longer sees a flag.
  Layer 1's quoted-name form does the same: `"key" -key i7UjG8xTU36Z4w1S6Ass2fR8xLM7h` leaves the value after `-key`.
- **An assignment or a quoted name after a secret assignment's separator** (layer 1): `key= key = V7K3PCvlN7fLyjl2xQDssxbaGUALAN`
  redacts to `key= *** = V7K3PCvlN7fLyjl2xQDssxbaGUALAN`, and `key= "key" B3ZEhj60960dio5O` leaves `B3ZEhj60960dio5O` —
  the outer `key=` masks the inner name as its value. Measured 2026-11-03 by the same tests once the pass's repair of a
  nested assignment
  ([an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md](../archive/defects/an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md))
  let them stop holding every assignment out where the text before it carries `=`, `:` or a quote: 40 of 60 seeds met it
  within 500 runs.

## Specs

REQ-TOOLS-171 (layer 2 masks the value after a secret-looking flag, layer 3 the value after `Bearer`, `Basic` or
`token`, wherever the text comes from) and REQ-EVENTS-060 ("everything after the scheme word is masked"): in each shape a
secret-looking flag, a scheme word or a secret-looking name stands in the text and its value survives. The sibling shape
for assignments, repaired, is
[the-redaction-pass-leaves-a-secret-assignment-that-is-the-value-of-a-plain-one.md](../archive/defects/the-redaction-pass-leaves-a-secret-assignment-that-is-the-value-of-a-plain-one.md).

## Relevant files

- `packages/kernel/src/redaction.ts` — `layerFlags` (a non-secret flag consumes the next token even when it starts with
  `-`), `layerSchemes` (a scheme word consumes the next scheme word as its value), `layerAssignments` (a secret
  assignment masks a flag name, an assignment's name or a quoted name as its value).
- `packages/kernel/src/redaction.property.test.ts` — `heldOut` and `endsTakingAValue` keep these shapes out of the leak
  property; the test "holds out a shape only while its note stands" pins each as leaking. The repair removes both.
- `packages/kernel/src/redaction.test.ts` — no worked example of a flag after a flag or a scheme word after another.
