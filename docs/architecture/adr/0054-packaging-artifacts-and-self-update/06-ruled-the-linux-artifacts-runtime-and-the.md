# ADR-0054 — Packaging, the four artifacts, and self-update — Ruled — the Linux artifact's runtime, and the sandbox that comes with it (was an escalation; ESC-11)

Part 6 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Ruled — the Linux artifact's runtime, and the sandbox that comes with it (was an escalation; ESC-11)

`REQ-STARTUP-024` requires the application image to run **unextracted on an unmodified Ubuntu 24.04
installation**, and `REQ-STARTUP-159` requires first paint on that baseline with nothing else installed.
The packaging tool's two runtime options do not both satisfy that, and the difference is user-visible in
two ways:

- **The legacy runtime dynamically loads `libfuse.so.2`.** Ubuntu 24.04 ships FUSE 3 and does not
  install that library; the user's first double-click produces a dynamic-loader failure, or from a file
  manager, nothing at all. That is `REQ-STARTUP-024` failing on the exact machine it names.
- **The legacy runtime also disables the shell's own process sandbox unconditionally** on that path,
  because the distribution restricts unprivileged user namespaces. The static runtime instead detects
  the condition and disables it only when the namespaces are genuinely unavailable. ADR-0002 makes the
  sandboxed renderer load-bearing — the transcript renders Markdown a model wrote and the terminal grid
  renders bytes an arbitrary process wrote — so "Linux users get that surface unsandboxed" is a
  different product, not a build flag.

At the time of writing the static runtime is the default of the tool's **pre-release** line and the
legacy runtime is what the current stable line produces. The options were: **(a)** ship on the
pre-release line; **(b)** ship on the stable line and pin the runtime explicitly if that line permits it;
**(c)** ship on the stable line and disclose the library prerequisite; **(d)** change the Linux artifact
form.

**Ruled (ESC-11): (b) if the stable line permits explicit pinning, otherwise (a).** Options (c) and (d)
are refused — (c) contradicts `REQ-STARTUP-024` as written, and (d) is forbidden by
`REQ-STARTUP-031`'s closed four-artifact set. Whether pinning is possible on the stable line is a
measurement (open spike 12); **it decides between (b) and (a) and does not reopen the question.**

The deciding argument recorded with the ruling is not packaging convenience: the legacy runtime
**disables the shell's own process sandbox unconditionally** on a distribution that restricts
unprivileged user namespaces, where the static runtime disables it only where namespaces are genuinely
unavailable. ADR-0002 makes the sandboxed renderer load-bearing, so "Linux users get that surface
unsandboxed" is a different product rather than a build flag.

**The gate defect this record raised alongside it has been fixed in the specification.**
`REQ-STARTUP-156` no longer says only "a machine the release owner controls": it now requires, on Linux,
**the unmodified baseline `REQ-STARTUP-024` names**, explicitly excludes a machine configured for
building, testing or development, requires no separately installed component of the product and blocked
outbound network, and requires a check whose conditions cannot be established to be **recorded as not
performed and to fail the gate**. The complaint is discharged; what remains is consequence 4's
operational form of it — the gate machine must never have had the legacy library installed.
