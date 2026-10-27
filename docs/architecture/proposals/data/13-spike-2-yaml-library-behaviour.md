# Architecture proposals — DATA slice — Spike 2 — YAML library behaviour

Part 13 of 25 of [the data proposal](../data.md), which indexes every part.

## Spike 2 — YAML library behaviour

`yaml@2.9.0` and `js-yaml@5.4.1`.

- Under the default YAML 1.2 core schema, `yaml` parses `off` and `on` as the **strings** `"off"`
  and `"on"`, and `true` as a boolean. Under `{version: '1.1'}` it folds `off`→`false` and
  `on`→`true`. `js-yaml`'s `load` behaves as 1.2 here. So `REQ-CONFIG-020`'s coercion is a
  two-spelling problem under 1.2 and a six-spelling problem under 1.1; either is workable, and 1.2 is
  less work.
- Tri-state is available and robust through `YAML.parseDocument`: for `hooks: {entries: }`,
  `has('entries')` is `true` while the value node is null, and `has('enabled')` is `false`. Absent,
  explicit-null and value are all distinguishable at the AST.
- Key order is preserved on round trip and **not** alphabetised (`zzz_last_key` stayed ahead of
  `aaa_first_key`), satisfying `REQ-CONFIG-248` and `REQ-CONFIG-441`.
- `yaml@2.9.0` resolves `!!js/function "function(){}"` to the plain **string** `"function(){}"` with
  a warning; it constructs no function. `js-yaml@5.4.1`'s `load` throws on the unknown tag. Both are
  safe by default, satisfying `REQ-CONFIG-015`.
- Editing through the `Document` API preserves comments and layout alongside key order. Only
  `parse` → `stringify` loses them. Comment preservation is therefore nearly free, which changes the
  shape of **ESC-2**.

---

# Part 3 — ADR proposals

Numbering is provisional; the synthesis step assigns final numbers.
