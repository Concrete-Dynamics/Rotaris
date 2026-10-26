# Architecture proposals — DATA slice — ADR-DATA-03 — Configuration is loaded through the YAML document AST over a tri-state model

Part 16 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-03 — Configuration is loaded through the YAML document AST over a tri-state model

### Decision to be made

How `agents.yaml`, `models.yml`, `secrets.yaml` and `project_settings.yaml` are parsed, represented
in memory across five layers of merging, validated, and written back.

### Constraints that bear on it

- **D1** five fixed layers; **D2** four merge classes with different overlay depths and lists that
  never append; **D3** absent / explicit-null / value must stay distinct, with a *different* null
  policy per merge class; **D4** a fixed ordering of passes, three of which run per scope before the
  merge; **D5** a fully resolved result; **D6** no read cache; **D7** a closed five-way severity
  taxonomy; **D8** validation on assignment as well as on load; **D9** a second, separate parse of
  the same file for one key; **D10** safe-subset parsing and per-field boolean un-folding;
  **D11** a rejected value fails the whole load; **D12** branch-namespace validation on a rendered
  example.
- **B8** never write a configuration you cannot load back; **B9** preserve key order, comments
  explicitly lost.
- **E1** the loader's synthesis step must be callable outside a load, over a configuration value,
  because `REQ-CONFIG-263` does it at run start "exactly as the loader does".
- Spike 2: tri-state and key order are available through `yaml@2.9.0`'s `Document`; safe-tag
  behaviour is the default in both candidate libraries; comment preservation is free through the
  `Document` edit API.

### Alternative A — parse to plain objects and merge with a schema library's defaults

Parse each file with `YAML.parse`, validate each layer with a schema library (Zod, Valibot,
TypeBox), merge the validated objects.

Attractive: validation and typing fall out for free, and the codebase gets one description of the
configuration shape. It breaks on **D3** and **D2**.

A schema library's job is to *normalise* — apply defaults, coerce, produce a value of a known shape.
Every one of those operations destroys the absent-versus-null distinction `REQ-CONFIG-055`,
`REQ-CONFIG-056` and `REQ-CONFIG-057` require to survive the merge. Applying defaults per layer is
worse than useless: it turns every unstated field of the global layer into a stated value that then
shadows the workspace layer, inverting `REQ-CONFIG-031`'s precedence for every key the user did not
write. One can work around this with `.optional()` everywhere and defaults applied only at the end,
but at that point the schema library is validating a tri-state document it does not model and the
merge is hand-written anyway.

It also cannot express **D2**'s depth rules: named entries overlay exactly one level
(`REQ-CONFIG-046`) while sections recurse to any depth (`REQ-CONFIG-048`). No generic deep-merge does
both, and no schema library expresses "merge depth" at all.

### Alternative B — parse to the YAML document AST, merge over a tri-state model, validate the merged result

Parse each scope's files with `YAML.parseDocument`, project into an internal document model that
distinguishes *absent*, *null* and *value* at every node, run the per-scope passes (**D4**), merge by
explicit merge class, then validate once.

More code — a hand-written merger of a few hundred lines. But every line corresponds to a stated
rule; the rules are enumerated exhaustively in `REQ-CONFIG-040` through `REQ-CONFIG-050`; and
`REQ-CONFIG-051` supplies a ready-made end-to-end fixture for it. Validating once on the merged
result is what **D4** describes and what `REQ-CONFIG-037` requires — secret values never pass through
schema validation.

### Alternative C — a configuration library (cosmiconfig, node-config, convict)

None models five fixed layers with four merge classes, per-class null policies, per-scope pre-merge
passes, or a five-way severity taxonomy. Each would be fought rather than used, and each brings its
own precedence model that would have to be disabled.

### Recommendation

**Alternative B.** Parse with `yaml`'s `Document` API, carry a tri-state internal model, hand-write
the merger against the enumerated rules, validate the merged document once.

On the library: `yaml@2.9.0` or later, rather than `js-yaml`. Both are safe by default (Spike 2), but
`yaml` is the only one of the two that gives the `Document` AST needed for tri-state and for order-
and comment-preserving writes. Use the **default YAML 1.2 core schema**, under which
`on`/`off`/`yes`/`no` parse as strings; `REQ-CONFIG-020` then reduces to un-folding `true`/`false`
per field against that field's vocabulary, which is a smaller and more auditable rule than un-folding
six spellings. The requirement's observable is satisfied either way; this is the cheaper route to it.

On validation: whatever library is chosen must support **assignment-time** validation for `runtime:`
and `requirements:` (**D8**; `REQ-CONFIG-111`, `REQ-CONFIG-183`, `REQ-CONFIG-436`). The natural shape
is a validating wrapper around those two sections whose setters run the same schema the load runs, so
that `REQ-CONFIG-260`'s "validated before any file is touched" and `REQ-CONFIG-290`'s "nothing
invalid reaches the store" are one code path rather than two. Note that `REQ-CONFIG-237` fixes the
error rendering — `<dotted.path>: <message>`, an empty path rendered as `config`, the framework's
"field required" phrasing rewritten as "missing required field", and never an empty list — so the
library's issue objects must expose a dotted path and a message. `REQ-CONFIG-238` further requires
missing-field errors under `models` → `<name>` → `<field>` to be **gathered into exactly two lines**
rather than reported per model, which is post-processing over the issue list either way.

On write-back: four writers exist and they are not interchangeable — the bootstrap
(`REQ-CONFIG-027`), the startup model-preference path (`REQ-CONFIG-248`), the desktop save
(`REQ-CONFIG-256`) and the scoped per-field writer (`REQ-CONFIG-441`). All four leave mode `0644`
(`REQ-CONFIG-444`) and all four go through ADR-DATA-02's primitive. The per-field writer overlays
"recursively through nested mappings exactly as a section merge does" (`REQ-CONFIG-441`), so the
merge code is shared between the loader and one of the writers — which is a good thing, because it
means a divergence between them is a compile-time impossibility rather than a test we might forget.

On Tier B: the tier-alias substitution and reasoning-synthesis passes are exported as pure transforms
over a configuration value, not as private steps of a file-reading function, because
`REQ-CONFIG-263` calls them at run start with no file involved.

`rotaris.delegation_strategy` (**D9**) gets its own small reader over the same parsed document —
literally a second lookup, not a second file read — checking the value against the three accepted
spellings and leaving the default in place otherwise.

### Consequences accepted

- We own the merge. It is the largest single piece of hand-written logic in the slice and the place
  where a conformance failure would be least visible. It needs `REQ-CONFIG-051`'s fixture as a
  first-class test plus a per-rule test for each of `REQ-CONFIG-052` through `REQ-CONFIG-057`.
- **D6**'s no-cache rule means every settings-screen open, every run start and every workspace open
  re-reads and re-merges. At these file sizes that is microseconds; it is recorded here so it is not
  later "optimised" into a violation.
- Comments are lost on the paths `REQ-CONFIG-252` says they are lost on, unless **ESC-2** is taken.

### What would have to change to revisit this

A requirement making absent and null equivalent everywhere, removing **D3**; a requirement for a
sixth layer or a per-key precedence inversion, both of which `REQ-CONFIG-449` currently forbids; or a
validation library that models tri-state optionality natively without normalising, which would
collapse Alternatives A and B into one.

---
