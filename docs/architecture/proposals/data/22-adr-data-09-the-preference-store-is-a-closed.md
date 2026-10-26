# Architecture proposals — DATA slice — ADR-DATA-09 — The preference store is a closed typed registry over a plain file

Part 22 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-09 — The preference store is a closed typed registry over a plain file

### Decision to be made

How the per-user desktop preference store is implemented, given that its physical form is explicitly
free but its key set is explicitly closed.

### Constraints that bear on it

- **A3.** `REQ-SHELL-006`: one platform-standard per-user store scoped to organisation `Rotaris` and
  application `Rotaris`, established before the first preference read; disjoint from the layered YAML
  surface in both directions; outside every workspace so no preference appears in a project or its
  version control; created on first write; absence is not an error but the state in which every key
  answers with its declared default; a written value reads back after a restart. Physical path and
  encoding are free — "Two conformant builds may therefore lay the same keys out differently on
  disk."
- **The key set is closed.** `REQ-SHELL-006`: "the store's key set is exactly the keys listed in the
  per-user preference store table… and a key that does not appear in that table does not exist…
  a preference key named in another document but absent from that table is not a preference of this
  product." Keys are slash-namespaced; no dot-namespaced form exists.
- Defaults are owned elsewhere but registered there: `REQ-CONFIG-405` lists nine keys with their
  types and defaults; `REQ-GIT-153` relies on `interface/worktreeCleanupPrompt` being user-scoped and
  default-enabled; domain 08's persisted-state table adds the board's filter, sort, axis, fold and
  released-run keys.
- **Tolerant reads are contractual.** `REQ-CONFIG-405`: "Boolean restoration is tolerant of how the
  preference backend spelled the value." Domain 08 repeats it: "a text backend round-trips a boolean
  as a string, a native backend does not." `REQ-TRACE`'s `requirements/blocked_column` default is
  `true` with "any value other than the string `false`, case-insensitively, reads as true".
  `REQ-SHELL-069` adds tolerant integer parsing.
- **Some values are structured strings.** `workspaces/<resolved absolute path, or the literal default
  key>/requirementColumnFolds` is "one JSON object string, keys sorted, mapping column key to
  boolean". A preference value is therefore sometimes a serialised document, and its serialisation is
  fixed (sorted keys).
- **Failure behaviour is specified.** `REQ-TRACE-498`: fold settings unreadable, or written by a
  later build → nothing is folded and the board opens under the emptiness rule; a stored sort order
  or axis unknown to this build → the default for that setting is used. `REQ-GIT-153`: a stored value
  that cannot be used restores the view's declared default rather than raising.

### Alternative A — `electron-store` or a similar preferences package

Gives a JSON file in `userData`, schema validation, defaults and migrations, for no work.

Against it: its schema-and-defaults model normalises on read, which fights the tolerant-coercion
contract (a boolean stored as `"true"` by a text backend must read as `true`, not fail validation);
its migration feature has no counterpart in the requirements and would be dead weight or, worse, a
temptation; and it does not enforce a **closed** key set, which is the one property `REQ-SHELL-006`
insists on twice. We would wrap it in a registry to get that, at which point it is providing a JSON
file and a debounce.

### Alternative B — a native platform store per platform

Registry on Windows, `defaults`/`NSUserDefaults` on macOS, an XDG file on Linux — arguably the most
literal reading of "the host platform's own standard per-user application-settings location".

Against it: three implementations, three coercion behaviours (which is exactly the "text backend
versus native backend" split the requirements have to accommodate), and no benefit, since
`REQ-SHELL-006` explicitly frees the physical form. It would also make the structured-string values
awkward on the registry.

### Alternative C — a small typed registry over a single JSON file

One module owning: a table of key → type → default, which *is* the closed key set; typed accessors
that will not compile for an unregistered key; tolerant read coercion per type; and writes through
ADR-DATA-02's primitive into a JSON file in Electron's `userData` path for the `Rotaris`/`Rotaris`
pair.

### Recommendation

**Alternative C.**

The reasoning is that the requirement's substance is entirely in the *registry*, not in the storage.
`REQ-SHELL-006` frees the encoding and then spends its length on the closed key set, the scoping, the
absence semantics and the restart round-trip. A hand-written registry makes the closed set a
compile-time property — a key absent from the table is not addressable — which is the strongest form
of "a key that does not appear in that table does not exist". No package gives that.

Two details worth fixing here rather than discovering later:
- The tolerant coercion is **per type and per key**, not global. `requirements/blocked_column`'s rule
  ("any value other than the string `false`, case-insensitively, reads as true") is not the same as a
  generic boolean parse, and `REQ-SHELL-069`'s tolerant integer parse is a third rule. The registry
  entry carries the coercion.
- Structured values serialise deterministically. `requirementColumnFolds` is "one JSON object string,
  **keys sorted**" — so the registry's serialiser sorts, and the sorting is byte order per **A8**.

The store is established before the first preference read, per `REQ-SHELL-006`, which makes it a
main-process startup step rather than a lazily initialised singleton.

### Consequences accepted

- We own the file format and its evolution. Since every key answers with its declared default when
  absent (`REQ-SHELL-006`) and every unknown stored value falls back to a default
  (`REQ-TRACE-498`), forward and backward compatibility are already the specified behaviour and need
  no migration mechanism — which is why Alternative A's migration feature is not a loss.
- Adding a preference means editing the registry table, which is the intended friction:
  `REQ-SHELL-006` requires a new preference to be "registered in that table rather than minting a key
  of its own".

### What would have to change to revisit this

A requirement that preferences be readable or writable by another program, which would argue for a
platform-native store; or the key set ceasing to be closed.

---

# Part 4 — Escalations

These change what the product *is* for a user rather than how it is built. They are the product
owner's, not mine.
