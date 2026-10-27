[Product directives](../directives.md) › PD-STARTUP-001

<a id="pd-startup-001"></a>

### PD-STARTUP-001 — releases publish for Windows only until the directive is withdrawn

**The platform set.** Until this directive is withdrawn, a release SHALL publish for exactly one platform key,
`windows-x64`, with the two Windows artifacts of REQ-STARTUP-031 (installer and portable) and the manifest and
signature of REQ-STARTUP-032. The build matrix SHALL build that one platform key. No `macos-arm64` or
`linux-x86_64` build is attempted, and none is published.

**The release body.** Element (4) of REQ-STARTUP-035 SHALL NOT be written for a platform this directive leaves
out, because that build was not attempted and did not fail. In its place the body SHALL state, as one line
between elements (3) and (5), that this release publishes Windows builds only. The other six elements keep their
order and content. Element (5) still names `sha256sum -c`, and element (6) still names Gatekeeper; both stay true of
the manifest and the caveat, and keeping them spares a second rewording when the directive is withdrawn.

**The gate.** The release gate of REQ-STARTUP-156 SHALL exercise the `windows-x64` key only. Every published
artifact of that key SHALL still be launched under REQ-STARTUP-159's four conditions, with the portable getting its two runs.
Every other member of the gate's set is unchanged.

**Download surfaces.** A download surface reached from macOS or Linux SHALL state that this release publishes no
build for that platform, and SHALL offer none. REQ-STARTUP-026's treatment of Windows ARM64 is unchanged: it is
offered the `windows-x64` artifacts, with the statement that requirement fixes.

**What is unchanged.** The directive narrows what a release publishes, not what the product runs on. Nothing
in the application may be removed or disabled on macOS or Linux because of it. REQ-STARTUP-024's Linux baseline, IC-3 and IC-8 all stay in force. They govern the release that
withdraws this directive, and this directive discharges none of them.

**Why, and what it costs.** The product has no macOS or Linux build host (IC-3), and confinement is unproven on
both (IC-8), so a three-platform first release waits on hardware and proofs that are unrelated to shipping
it on the one platform whose installer is already built. Without this directive, REQ-STARTUP-030 has the matrix
fail two platforms on every tag, and REQ-STARTUP-035 then has every release state that its macOS and Linux
builds "failed". That would be false, and it would read as a broken pipeline. What it costs:

- **No macOS or Linux user can install a release.** They can still build from source.
- **The updater's non-Windows paths ship unexercised.** The apply strategies for the dmg and the AppImage
  (ADR-0054) are neither built into an artifact nor gated, so withdrawing this directive means taking their first
  execution then.
- **Withdrawal is a directive of its own.** It is not a quiet change to the pipeline, and it lands only once IC-3
  and IC-8 are discharged.

> **Narrows:** REQ-STARTUP-026, REQ-STARTUP-030, REQ-STARTUP-035, REQ-STARTUP-156

*Raised by the owner, 2026-09-25; logged as [R-051](../requests.md#r-051).*
