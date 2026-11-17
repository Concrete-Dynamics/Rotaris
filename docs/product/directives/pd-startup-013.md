[Product directives](../directives.md) › PD-STARTUP-013

<a id="pd-startup-013"></a>

### PD-STARTUP-013 — a release publishes for Linux x86_64 beside Windows: an AppImage and a Debian package

**The platform set.** A release SHALL publish for two platform keys, `windows-x64` and `linux-x86_64`, and the build matrix SHALL build both. For `linux-x86_64` this takes the place of [`PD-STARTUP-001`](pd-startup-001.md#pd-startup-001)'s platform set, which published `windows-x64` alone; that directive stands as written for `macos-arm64`, which is still neither built nor published, and in every clause that names no platform.

**The Linux artifacts.** `linux-x86_64` SHALL carry two artifacts, both rendered by REQ-STARTUP-031's one authority: the AppImage of REQ-STARTUP-024, `Rotaris-{v}-linux-x86_64.AppImage`, and a Debian package, `Rotaris-{v}-linux-x86_64.deb`. The package carries the platform key in its name, not Debian's architecture word, so that one release's assets name their platform one way; its control file names the architecture `amd64`, as the package manager requires. It installs under `/opt/Rotaris`, with the desktop entry of REQ-STARTUP-024 and the application icon.

**Updates.** An AppImage is the AppImage flavour of REQ-STARTUP-106 and is offered and applied as REQ-STARTUP-107 and REQ-STARTUP-125 state. A build installed from the Debian package is **not updatable** in the sense of REQ-STARTUP-106: it performs no check and issues no request, because replacing files a package manager owns is not the application's to do. Its user takes a new version by installing a newer package.

**When it may be published.** A `linux-x86_64` artifact SHALL be published only once each of AC-1 to AC-4 of [ADR-0066](../../architecture/adr/0066-the-linux-artifact-is-built-on-a-developer-host.md) is recorded as held on that ADR, with where and how it was measured. A criterion that was not performed does not hold. The clean-machine launch of REQ-STARTUP-156 is the owner's for this key as for `windows-x64`.

**The release body, the gate and the download surfaces.** The line PD-STARTUP-001 puts in the body in place of REQ-STARTUP-035's element (4) SHALL say what is published: Windows and Linux x86_64 builds, and no macOS build. The gate of REQ-STARTUP-156 exercises both published keys. A download surface reached from Linux on x86_64 offers the two Linux artifacts; one reached from macOS, or from Linux on another architecture, states that this release publishes no build for it.

**What is not published, and why.** No 32-bit Linux build, x86 or ARM: the Electron the product ships on (45.2.1 on the day of this directive) publishes Linux builds for `x64` and `arm64` alone, so there is no runtime to package. A `linux-arm64` key is the owner's stated next step and is not decided here: REQ-STARTUP-026 names the platform keys, a fourth is a directive of its own, and its artifacts, its runner and its acceptance are that directive's.

**Why, and what it costs.** The owner, 2026-11-17, once `v0.1.0rc2` was public: "where is the linux artifact? its not attached to the release. please also make sure that users get a linux debian and appimage for both 64 and 32 bit and arm if possible." ([R-104](../requests.md#r-104)). REQ-STARTUP-024 and REQ-STARTUP-025 have required the AppImage since the specification was written; PD-STARTUP-001 held it back for want of a build host, and ADR-0066 lifted that for Linux on 2026-10-26. The Debian package is new: no requirement names it, and it is what a Debian or Ubuntu user installs without learning what an AppImage is. What it costs:

- **A second way to be installed, with a second answer to "how do I update".** The package does not update itself, and nothing in the application says so yet beyond the log.
- **The AppImage's apply strategy takes its first execution with this release.** It was specified and unbuilt while no AppImage was published; it is built now, tested over fakes, and has replaced no real AppImage.
- **A release is as large as its platforms.** Two more assets of about 216 MB and 176 MB, one more matrix job, and a release that is partial when the Linux job fails (REQ-STARTUP-030).
- **Confinement is unproven for publication.** IC-8 is undischarged while macOS has not run; the Linux half held on 2026-09-29, and a Linux artifact is not described as having proven confinement on that alone.

> **Narrows:** REQ-STARTUP-026, REQ-STARTUP-030, REQ-STARTUP-035, REQ-STARTUP-156
> **Extends:** REQ-STARTUP-031

Its case on REQ-STARTUP-026, REQ-STARTUP-030, REQ-STARTUP-035 and REQ-STARTUP-156 is the `linux-x86_64` key: published, built, named in the body and gated. [`PD-STARTUP-001`](pd-startup-001.md#pd-startup-001)'s case on the same four is `macos-arm64` since this directive, and `windows-x64`'s artifacts throughout; the two are disjoint by platform key.

*Proposed and decided by the model (`claude-fable-5-2`) under the owner's request [R-104](../requests.md#r-104) and the standing delegation [R-098](../requests.md#r-098), 2026-11-17. The owner chose the order (x64 first, arm64 after), the condition (after the acceptance checks pass) and the release (`v0.1.0rc3`); the owner did not word this directive.*
