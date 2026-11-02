# Security policy

Rotaris is a desktop application that runs AI agents against the files of a workspace on your machine. This page says
which versions receive security fixes, how to report a vulnerability, and what happens after you do.

## Supported versions

Security fixes are made on the **latest release line** only: the most recent release published on
[the releases page](https://github.com/Concrete-Dynamics/Rotaris/releases), prereleases included while no stable release
exists. An installation on an earlier version receives the fix by updating to the release that carries it; the
application's update check offers it (REQ-STARTUP-105). Earlier release lines are not patched.

| Version | Supported |
| --- | --- |
| The latest release (today the 0.1 line) | Yes |
| Any earlier release | No: update to the latest |

## Reporting a vulnerability

Report it **privately**, through a GitHub security advisory on this repository:
[Security → Report a vulnerability](https://github.com/Concrete-Dynamics/Rotaris/security/advisories/new). Please do
not open a public issue, pull request or discussion that describes the vulnerability.

If the form is not offered to you, open a public issue titled "Security contact requested" that says nothing about the
vulnerability, and a private channel will be arranged with you.

A useful report names the version (the title bar shows it), the operating system, what an attacker controls (a file
in the workspace, a model's reply, an MCP server, a repository), what they gain, and the steps that reproduce it.

There is **no bug bounty**: reports are welcome, and acknowledged in the advisory if you wish, but not paid.

## What to expect

- **Acknowledgement within 14 days** of the report.
- An assessment: whether it is a vulnerability of this product, how severe it is, and which versions it reaches.
- A fix in a release of the latest line, and the advisory published once that release is available, crediting you
  unless you ask otherwise. A vulnerability in a dependency is taken to that dependency's maintainers as well.

## What is already known

- [`docs/architecture/hardening.md`](docs/architecture/hardening.md) is the hardening record: the trust boundaries
  the product holds, the findings against them and which are closed. A report that a boundary it lists as open is open
  is still welcome, but is not news.
- [`docs/architecture/dependency-alerts/`](docs/architecture/dependency-alerts/) holds the readings of the dependency
  advisories that have been triaged: what each one reaches in the shipped product, and why it was patched or excepted.
- Continuous integration audits the production dependencies on every push and runs CodeQL's static analysis; each
  release build writes a CycloneDX Software Bill of Materials of the production dependency tree.

## A note on what a report may contain

This repository is a clean-room reimplementation: everything in it must be traceable to its own specifications and
public documentation (`AGENTS.md`). A report must therefore **not quote, attach or link source code, analysis or
transcripts of the earlier implementation it replaces**, nor of any repository `AGENTS.md` lists as off-limits. Describe
what this product does, observed from the outside or read from this repository, and that is all a report needs.
