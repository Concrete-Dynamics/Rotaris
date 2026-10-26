[Product directives](../directives.md) › PD-STARTUP-005

<a id="pd-startup-005"></a>

### PD-STARTUP-005 — the notices file lists the tool-server packages a build pins

`THIRD-PARTY-LICENSES.txt`'s `Tools provisioned after installation` section SHALL carry, after the machine tools and the
code-intelligence runtime's sub-heading with its language servers (REQ-STARTUP-142's order, kept), a third sub-heading,
`Tool-server packages`. It lists each package the setup manifest's `toolServerPackages` pins with REQ-STARTUP-142's four
fields, and states that a tool server of the built-in configuration launches each through its package runner, which
downloads it when that tool server is first started, and that none is contained in the artifact. The sub-heading is left
out for a manifest that pins no package. This is where REQ-STARTUP-152's "the same versions its `THIRD-PARTY-LICENSES.txt`
reports" finds the tool-server packages.

**As built.** The notices generator (`tools/notices/`); `@playwright/mcp` 0.0.80 is the one package this build pins.

**Why, and what it costs.** OQ-92: REQ-STARTUP-152 requires the file to report the tool-server package versions a build
provisions, and REQ-STARTUP-142 names no place for them; they are not "dependencies present in the shipped artifact"
either, since the package runner fetches them. The owner confirmed the sub-heading as built. What it costs: one more
section of the file to keep in step with the manifest.

> **Extends:** REQ-STARTUP-142

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-92.*
