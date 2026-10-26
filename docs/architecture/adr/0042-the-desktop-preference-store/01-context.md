# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — Context

Part 1 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## Context

`REQ-SHELL-006` fixes one per-user store scoped to the organisation and application pair, **established
before the first preference read**, disjoint in both directions from the layered configuration surface,
with a **closed key table**: "a key that does not appear in that table does not exist… a preference key
named in another document but absent from that table is not a preference of this product." Keys are
slash-namespaced; no dot-namespaced form exists.

The observable obligations are the whole of the requirement: the host's own standard per-user
application-settings location for that pair; readable and writable **without elevation**; **outside
every workspace directory**; created on first write; **absence is not an error** but the state in which
every key answers with its declared default; a written value is the value read back after a restart; and
integer parsing tolerant of values returned as strings. **Physical path and encoding are explicitly
free** — "two conformant builds may therefore lay the same keys out differently on disk."

`REQ-CONFIG-463` and `REQ-GIT-153` state the disjointness in the same terms: **no key of the layered
configuration surface is ever read from or written to the preference store, and no preference key ever
appears in a configuration file.** `REQ-GIT-153` adds that a domain relies on preferences being scoped
to the user *and not to a workspace* — which is the property a workspace database would destroy.

`REQ-UIBENCH-038`, `REQ-UIBENCH-039` and `REQ-UIBENCH-046` add an obligation no other slice saw: the
store must be **redirectable per process to an arbitrary directory on every platform**, because a
benchmark iteration must not touch the user's real settings and must start from the same stored-settings
state as every other iteration. `REQ-UIBENCH-038` is explicit that **one temporary settings directory is
created per iteration**, used by that iteration alone and deleted when it ends; `REQ-UIBENCH-039` is
explicit that **each iteration is a process** receiving the invoking environment with every
product-read variable removed plus a fixed set of overrides, of which `XDG_CONFIG_HOME` and one
benchmark-private variable name that directory. The acceptance criterion of `REQ-UIBENCH-046` is that
**the user's real stored settings hold the same bytes after the run as before**, with no such file
created, read, modified or deleted.

`REQ-SHELL-131`, `REQ-SHELL-009` and `REQ-SHELL-128`: the theme choice is committed **at the moment it
is made**, so a choice followed immediately by a crash or power loss is still in force at the next
launch; reading a theme preference never writes it back; an unknown name degrades silently to the
default and the stored value is left exactly as the user left it.

`REQ-CHAT-014`, `REQ-SHELL-159` and `REQ-CHAT-015`: **two different debounces** govern the composer draft
and both are normative — 200 ms before the draft is published to application state, never per keystroke,
and **400 ms** before it is written to the store, flushed immediately on focus loss, view change,
workspace replacement and window close, with a write landing whole or not at all.

`REQ-SHELL-069`, `REQ-SHELL-067` and `REQ-SHELL-070`: pane layouts are per **user**, not per workspace,
keyed by a stable per-view string, with a pane count and one schema-version stamp; **a retired key is
never reused**, so an old stored layout can only fail to match and fall back to declared defaults;
divider drags persist with a 250 ms debounce; capture before first layout is a silent no-op.

**Tolerant reads are contractual.** `REQ-CONFIG-405`: boolean restoration is tolerant of how the backend
spelled the value. Domain 08 repeats it — "a text backend round-trips a boolean as a string, a native
backend does not" — and one board key's rule is "any value other than the string `false`,
case-insensitively, reads as true", which is **not** a generic boolean parse. `REQ-SHELL-069` adds
tolerant integer parsing: a third rule.

**Some values are structured strings.** One board key is "one JSON object string, **keys sorted**,
mapping column key to boolean" — so a preference value is sometimes a serialised document and its
serialisation is fixed.

**Failure behaviour is specified.** `REQ-TRACE-498`: fold settings unreadable, or written by a later
build, means nothing is folded and the board opens under the emptiness rule; a stored sort order or axis
unknown to this build uses the default for that setting. `REQ-GIT-153`: a stored value that cannot be
used restores the view's declared default rather than raising.

`REQ-CHAT-045` and `REQ-SHELL-157`: prompt history and stash are **per workspace only**, at
`<workspace>/.rotaris/rotaris-prompts.json`, holding a pretty-printed JSON object with the two keys in
the order `history` then `stash`, two-space indentation, ending with a newline, written atomically with
no leftover temporary file; caps of 200 and 100; absent-or-unparseable loading as empty rather than as an
error; save failure degrading to in-memory with a persistent notice. There is explicitly **no**
user-global prompt history or stash.
