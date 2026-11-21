## The file tools write into `.rotaris/` and `.git/`, which the sandbox keeps read-only

The one workspace-boundary check the file tools share (`checkFence`) admits every write whose real path lies inside the
workspace root, and nothing beneath it is excepted. So `write_file` and `edit_file` can rewrite
`<workspace>/.rotaris/agents.yaml` (the configuration a later run resolves, as raw YAML with no validation) and can
create `<workspace>/.git/hooks/<name>` (a script git later runs outside every confinement). With
`runtime.allow_outside_workspace` on, they can also write the global configuration directory. The shell cannot do any
of these: the confinement spec renders `.git` and `.rotaris` as read-only carve-outs. The approval such a write meets
is an ordinary file edit's, so under the `autonomous` preset it meets none.

Found by reading, while planning R-121, and not reproduced by a run: no policy-level protected-path list was found in
`packages/engine/src`, `packages/hooks/src` or `apps/desktop/src/run-host` either, which is what makes the reading
likely, but a run that tries the write is the check that settles it.

## Specs

No requirement states that the file tools may or may not write there, so none is contradicted to the letter.
REQ-SANDBOX-056's stated reason is defeated: a confined command "must therefore never be able to install a repository
hook that would later run outside confinement, nor to write the configuration that governs a later run" — and a file
tool in the same run can do both. REQ-TOOLS-129 is the check that would carry the exception.
[`PD-CONFIG-014`](../product/directives/pd-config-014.md#pd-config-014) clause 6 decides the repair (R-121): the file
tools refuse those paths and name the `configure` tool.

## Relevant files

- `packages/agent-tools/src/tools/fence.ts` — `checkFence`: inside the root is always `ok`; no protected subpath.
- `packages/agent-tools/src/tools/files.ts` — the file tools that call it for `write`.
- `packages/agent-tools/src/confinement/spec.ts` — `PROTECTED_SUBPATHS = ['.git', '.rotaris']`, the shell's carve-out
  that the file tools do not share.
