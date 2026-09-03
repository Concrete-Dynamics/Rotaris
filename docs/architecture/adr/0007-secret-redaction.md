# ADR-0007 — Secret redaction: one module, two output forms, predicates exposed separately

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-10), MODEL (ADR-MODEL-13 — a cross-slice request to EXEC)
- **Depends on:** ADR-0001
- **Resolves a cross-slice request.**

## Context

`REQ-TOOLS-171` is the single definition of the redaction algorithm, the marker `***`, the display
mask and the credential value-prefix list; `REQ-TOOLS-172` is the single definition of the
secret-looking key test. One shared pass backs **seven** surfaces — the approval prompt, the audit
log, the event stream, application log files, user-visible error text, persisted documents and
lifecycle-hook payloads — and none of them carries redaction rules of its own. `REQ-PROVIDER-131` and
`REQ-MCP-081` both state that their domains hold no second copy.

The algorithm is four ordered layers with exact semantics (`REQ-TOOLS-171`): `key=value` /
`key: value` with secret-looking keys; `--flag value` with secret-looking flags; the value after
`Bearer` / `Basic` / `token` compared case-insensitively; and a value-shape sweep for `ghp_`, `ghs_`,
`ghu_`, `gho_`, `sk-`, `sk_`, `iv1.`, `eyj`, recognised case-insensitively at a token boundary. In
layers 1 to 3 the replaced value spans exactly one value token. `REQ-TOOLS-172` fixes the key test as
a segmentation: strip a leading run of `-`, split on every run of non-alphanumeric characters, match a
**whole** segment case-insensitively against a closed sixteen-word list.

`REQ-TOOLS-171` also fixes a **different** function, the display mask: four characters or fewer
becomes `****`; longer becomes first two plus `****` plus last two. **The two are never substituted.**
`REQ-PROVIDER-107` and `REQ-PROVIDER-140` make the display mask the only rendering of a stored
provider key any interface shows, with no reveal control anywhere; `REQ-MCP-081` and `REQ-MCP-109`
make masking of an MCP stored secret **unconditional** — it does not depend on the key looking secret
or the value carrying a recognised prefix, because presence in the store is what establishes it as a
credential.

`REQ-TOOLS-173` and `REQ-TOOLS-083` require redaction on events to hold "no matter how the event was
assembled or which of its fields were set last", with `permission.decision` summaries re-redacted on
construction **and on assignment**. That is an invariant on the type, not a discipline at call sites.

**MODEL raised a fourth need EXEC's proposal did not answer.** `REQ-PROVIDER-086` requires the
discovery-snapshot writer to **detect and refuse** rather than mask: it scans the whole payload,
refuses the write if anything secret-like is found, and reports the **path** of the offending field. It
composes `REQ-TOOLS-172`'s key test with two local triggers of its own (a `session` key segment, and
`ghu_` anywhere in a lower-cased key) and with `REQ-TOOLS-171`'s prefix list. A module exposing only
`redact(text)` cannot serve that, and forcing it through would guarantee a second copy of the key test
— which `REQ-PROVIDER-086` and `REQ-MCP-081` forbid.

## Alternatives considered

**A — Redact at each sink.** The audit writer, the event publisher, the logger and the dialog each
call the pass. Simple and obvious. Against `REQ-TOOLS-171` and `REQ-TOOLS-173`: a new sink is one
forgotten call away from leaking, and "no matter which of its fields were set last" is a statement
about **assembly**, not about output, which a sink-side pass cannot make.

**B — Redact at one serialisation choke point.** Better; the sink count drops to one. Against: the
approval dialog is not a serialisation surface, and neither is user-visible error text, and both are
named. A value copied out of an event before encoding — a log line assembled from the same object —
escapes.

**C — A branded `Redacted` type produced only by the pass, with the fields that must be redacted
typed to accept only it, plus the predicates exposed separately.** Chosen.

## Decision

One module, exporting five things and nothing else:

- `redactForOutput(text): Redacted` — the four-layer pass of `REQ-TOOLS-171`, pure, idempotent.
- `displayMaskStoredSecret(secret): string` — the different function of `REQ-TOOLS-171`, returning a
  plain string, **never** `Redacted`, so the two can never be substituted by accident.
- `isSecretLookingKey(key): boolean` — `REQ-TOOLS-172`'s segmentation test, reusable by layers 1 and
  2 and composable by `REQ-PROVIDER-086`'s snapshot screen without restating it.
- `hasCredentialPrefix(value): boolean` — the value-prefix test at a token boundary.
- the prefix list itself, as a read-only export.

The brand is unforgeable outside the module. Every field the specification requires to be redacted —
`summary` on `permission.decision` and `approval.requested`, `command` and `argument_summary` on the
approval payload, `arguments` on `tool.start`, the hook payload's argument rendering, the audit
entry's `summary` — is typed `Redacted`. `REQ-TOOLS-173` then becomes a compile-time property: there
is no assembly order in which an unredacted string reaches one of those fields.

The two **renderings** of `REQ-TOOLS-016` are separate types with separate functions —
`RequestSummary` (`<tool>: <redacted command facet>` or `<tool>(<sorted argument keys>)`) and
`ArgumentSummary` (sorted `key=value` lines, clipped at 240 characters) — both producing `Redacted`,
so the audit writer cannot be handed an argument summary and the dialog cannot be handed a request
summary. `REQ-TOOLS-016`, `REQ-TOOLS-057`, `REQ-TOOLS-079` and `REQ-TOOLS-083` are emphatic that they
are never substituted; distinct types are the cheapest guarantee.

`REQ-PROVIDER-086`'s snapshot screen walks the value about to be serialised and yields
`(path, key, value)` triples, so the refusal can name the offending field's path. Its exempt set — the
two per-token price keys under `pricing` and the token-limit keys under `limits` — is matched **by
path**, not by bare key name, because the set is closed and a name-based match would exempt a
same-named key elsewhere in the document.

## Consequences accepted

1. The brand is viral in the types that carry it. That is the cost of `REQ-TOOLS-173` and it is worth
   paying only on the fields the specification names, not on every string in the product.
2. The recognised set is **closed** (`REQ-TOOLS-171`), so the pass will not catch a credential shape
   the list does not name. That is specified — an implementation recognising exactly those and nothing
   further is conformant — and it must not be quietly extended, because the same requirement also
   guarantees that a string carrying none of them reaches its destination **unaltered**. Adding a
   heuristic would break that guarantee.
3. Layer 3's one-value-token rule produces `--token *** def`, which looks like a bug to a first-time
   reader. It is specified verbatim and needs a comment citing the requirement, or someone will fix
   it.
4. The module lives in the run host but its pure functions are imported by main (for terminal-input
   redaction before forwarding, `REQ-SHELL-107`) and by the workspace service (for the snapshot
   screen). It must therefore have no process-specific dependencies.
5. `REQ-MCP-081`'s unconditional masking calls `displayMaskStoredSecret` directly with no predicate.
   That asymmetry is deliberate and should be commented.

## Revisit if

A requirement adds a credential prefix or a key word — a change to a closed vocabulary and therefore a
specification amendment; or a surface appears that must show a stored secret in clear, which
`REQ-TOOLS-171`, `REQ-PROVIDER-107` and `REQ-MCP-109` currently forbid outright.

## First execution at size — 2026-09-03, found by REQ-HOOKS-139

*Recorded under GD-10.* The pass had run under every test of REQ-TOOLS-171/172 and REQ-EVENTS-060 and
never over a long string. The hooks' payload bound (10 ms at 100 KB, REQ-HOOKS-139) ran it over 100,000
`x` and measured **26 seconds**. Two patterns were quadratic: the assignment key `[A-Za-z0-9][A-Za-z0-9_.\-]*`
and, once that was bounded, the unanchored URL scheme `[A-Za-z][A-Za-z0-9+.-]*://` (13 s alone; 46 ms
bounded but still unanchored). Each start position re-scanned the whole run for a separator that never came.

**The falsified reason, kept:** "a key is any alphanumeric run, however long" — true of the grammar, and
the cause. **The replacement:** the key, the flag and the quoted-key patterns are bounded at 128 characters
(REQ-TOOLS-172's segments are short words, so no credential name is longer) and the scheme is anchored at a
boundary and bounded at 64. No masking outcome changes — the requirement's worked examples all pass as
before — and `redaction.test.ts` now pins 100 KB under 50 ms (0.5 ms measured). Consequence 2's closed set
is untouched. This is the eighth first-execution defect of the pattern `implementation-conditions.md`
decision 3 names, and the first found in a mechanism other than the one being built.
