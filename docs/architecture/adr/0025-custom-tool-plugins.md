# ADR-0025 — Custom tool plugins: the specified language and the chosen runtime are incompatible

- **Status:** proposed — **ESCALATION, not a decision**
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-12)
- **Depends on:** ADR-0001, ADR-0002, ADR-0016, ADR-0017

## Context

`REQ-TOOLS-161`, `REQ-TOOLS-163` and `REQ-TOOLS-165`, together with the workspace layout of domain 15
(`REQ-CONFIG-010`) and domain 14, fix custom tool plugins as **`*.py` files under
`<workspace>/.rotaris/plugins`**, listed per persona under `custom_tools:`, each defining exactly one
tool definition, loaded when that persona's agent is built, and executing **inside the host process
with exactly the OS privileges that process holds and no confinement of their own**.

`REQ-TOOLS-161`, `REQ-TOOLS-165` and `REQ-SHELL-149`: discovery is not loading. A file's presence in the
plugin folder grants nothing; the settings inventory must list every `*.py` file in that folder and
state **in text, never by colour alone**, whether it is loaded and by which personas.

`REQ-TOOLS-162`, `REQ-TOOLS-002` and `REQ-TOOLS-164`: duplicate registered plugin names after
configuration resolution, and a plugin registering under a name the persona also declares under
`tools:`, are **startup errors** — they are ambiguities about which tool a name means, not absences.

`REQ-TOOLS-163`: every plugin argument and return value must be expressible as JSON or a declared
schema type; plugin exceptions become structured tool errors with type and message to the model and
stack traces to debug logs only; a plugin is built with and invoked under the **same run-scoped context
a built-in receives**. `REQ-TOOLS-011` and `REQ-TOOLS-163` keep plugin dispatch inside the single gate.

`REQ-STARTUP-002` and `REQ-STARTUP-015` allow exactly one shipped executable and no second installed
program.

## The problem

ADR-0001 chose TypeScript on Node. **A TypeScript/Node host cannot import a Python module into its own
process.** This is the one point in the record where a requirement and the runtime are genuinely
incompatible, and no amount of implementation cleverness closes it.

## Alternatives considered

**1 — Bundle a Python runtime and host plugins in a sidecar process.** Preserves the file format, the
folder, the per-persona loading and the settings inventory exactly. Against: it violates
`REQ-TOOLS-163`'s literal "inside the host process" — the privilege statement survives (a sidecar run
as the same user under no confinement holds the same OS privileges), but the in-process claim does not.
It sits badly with `REQ-STARTUP-002`: shipping an interpreter inside the bundle arguably makes a second
executable available to an installation, and even read charitably it adds tens of megabytes and a
second supply chain to sign and update. It also needs a serialisation boundary, which
`REQ-TOOLS-163`'s JSON constraint happens to make tractable.

**2 — Change the plugin language to JavaScript or TypeScript.** Plugins become modules loaded by
dynamic import in the run host, **genuinely in-process, genuinely holding the host's privileges**, with
exceptions becoming structured tool errors naturally. Everything else — per-persona loading, one
definition per file, duplicate detection, degradation on load failure with a stable reason code, the
inventory tab — is unchanged. Against: it contradicts `REQ-TOOLS-165` and the on-disk layout as
written, and **it changes what a user can write**, so it is not an architectural decision to take.

**3 — Embed Python in WebAssembly.** Keeps `.py` and stays in-process. Against: it cannot satisfy
`REQ-TOOLS-163`'s premise at all — a sandboxed WebAssembly Python has no unrestricted filesystem or
subprocess access, so a plugin would **not** hold the privileges the host holds, and the whole point of
`REQ-TOOLS-163` is that a plugin is a privileged extension whose confinement the product cannot
enforce. It would also be an unusual and slow host for what is meant to be a thin extension point.

**4 — Drop custom plugins.** Removes a capability the specification carries. Not an architectural
decision either.

## Recommendation — escalated

**If the product owner is willing to amend the requirement, take alternative 2:** plugins are
JavaScript or TypeScript modules loaded by dynamic import inside the run host, with `REQ-TOOLS-165`'s
`*.py` and the on-disk layout amended to the corresponding extensions. It is the only option that
satisfies `REQ-TOOLS-163` **as written** — genuinely in-process, genuinely holding the host's
privileges — while keeping every other property of `REQ-TOOLS-161` to `REQ-TOOLS-165` intact and costing
nothing in bundle size or supply chain.

**If existing Python plugin files must keep working, that is a decision to take alternative 1** and to
accept a bundled interpreter, a second signing and update surface, and a re-reading of
`REQ-TOOLS-163`'s "inside the host process" as "with the host's privileges".

Choosing the plugin language changes what a user can write and therefore what the product is. It
belongs to the product owner.

## What is settled regardless

Whichever is chosen, the surrounding architecture is the same and can be fixed now:

- The loader is **per persona and explicit** — the folder never auto-loads.
- One tool definition per file.
- A load failure degrades that agent's tool set with a stable machine-readable reason code plus a
  session issue naming persona, path and cause; it never fails agent construction.
- Duplicate registered names, and collisions with public tool names, are **startup errors**.
- Plugin dispatch passes the same gate as everything else (ADR-0017).
- A plugin receives the same run-scoped context a built-in receives (ADR-0002).
- The undeclared-capability rule of `REQ-TOOLS-001` applies to plugin tools unchanged: they declare no
  facet, and every rule reads them fail-closed in its own direction (ADR-0016).

## Consequences accepted

1. Under **either** choice, plugins remain unconfined code in a process holding the user's privileges,
   and no permission rule can change that. `REQ-TOOLS-163` says so; the settings inventory should say
   so too, beside the load-state text, so a user copying a file into that folder understands what
   naming it in `custom_tools:` grants.
2. Under alternative 2, ADR-0002's crash-isolation argument becomes **load-bearing rather than
   precautionary**: a plugin that throws asynchronously or leaks handles takes down the run host, not
   the windows.
3. Under alternative 1, the plugin sidecar becomes a **fifth process kind** and ADR-0002's topology
   should be re-opened rather than extended silently.

## Revisit if

The escalation is decided; or a requirement arrives asking for plugin confinement, which would
contradict `REQ-TOOLS-163` and would be a much larger change than a language choice.
