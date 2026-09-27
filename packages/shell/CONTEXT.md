# Distribution

How the product is built, published, launched, kept to one instance per user, and updated. Also the
machine-setup pass that provisions the tools a fresh machine lacks.

Terms are derived from `docs/spec/11-startup-distribution-updates.md`.

> **Naming caution.** This package is called `shell` because it holds the process links and the
> update relay. The *desktop* shell — windows, views, notices — is the
> [Shell](../ui/CONTEXT.md) context in `packages/ui`. When the word is ambiguous, say **desktop
> shell** for the window and **distribution** for what is below.

## Language

### Publishing

**Release**:
One published version of the product, every artifact of it carrying that release's single product
version. — `REQ-STARTUP` overview
_Avoid_: build (a build is what produces an artifact), version (a version is a value)

**Release tag**:
`v<major>.<minor>.<patch>` with an optional prerelease suffix. Plain versions are `stable`; suffixed
ones are `prerelease`. — `REQ-STARTUP-027`, `REQ-STARTUP-029`

**Artifact**:
One published file of a release, named by the single authority that fixes the four names. There is
no console-archive kind. — `REQ-STARTUP-031`
_Avoid_: binary, package, installer (the Windows **installer** is one artifact flavour, not the word
for all of them)

**Flavour**:
Which form an installation took — installer, portable, disk image, AppImage — which decides the
install strategy an update uses. — `REQ-STARTUP` update download, verification, and install
strategies

**Checksum manifest**:
`SHA256SUMS.txt`, one line per asset, never self-listed and never listing the signature published
over it. — `REQ-STARTUP-032`, `REQ-STARTUP-113`

**Manifest signature**:
The detached signature over the manifest's exact published bytes, verified **before** the manifest is
parsed. Every published artifact carries within itself the keys it accepts, fixed when the build was
produced; nothing at run time adds to, replaces or disables that set. — `REQ-STARTUP-167`,
`REQ-STARTUP-122`
_Avoid_: code signature — the artifacts carry none, and what the manifest signature establishes is
**who published a release**, which checksums alone never did

**Notices file**:
`THIRD-PARTY-LICENSES.txt`, inside every standalone artifact: one entry per dependency of the shipped closure with its
version, licence identifier and full licence text, the bundled fonts' and icon set's licences, the tools provisioned
after installation, and a header giving the LGPL corresponding-sources address. The About & Legal surface opens this
same file. — `REQ-STARTUP-141`, `REQ-STARTUP-142`
_Avoid_: notices on its own — the desktop shell's notices are the [Shell](../ui/CONTEXT.md) context's. The surface
calls the same file the third-party license bundle (`REQ-SHELL-142`).

**Shipped closure**:
Every dependency present in the shipped artifact, and nothing used only for development or CI, and no component of
the product's own build. — `REQ-STARTUP-142`, `REQ-STARTUP-143`

**Notices validation**:
The check run per platform before freezing that fails the platform's release job, naming the offending component or
path, when the shipped closure or the notices header is incomplete. — `REQ-STARTUP-037`, `REQ-STARTUP-143`

**Maintainer-review table**:
The version-controlled, dated table of reviewed exceptions beside the notices generator, each entry letting one
dependency without licence text pass validation for a version range until its expiry. — `REQ-STARTUP-143`
_Avoid_: allow-list, waiver

**Release feed**:
The product's public source of the latest release, consulted exactly once per launch of a supported
standalone build, after the window is visible. — `REQ-STARTUP` update check

**Banner**:
The dismissible, non-blocking surface offering a newer release. — `REQ-STARTUP` update notification

### Launching

**Instance**:
The one running copy of the product per user account. A further launch is handed to it rather than
starting a rival, and several workspaces and several windows are windows of that one instance. —
`REQ-STARTUP-161`, `REQ-STARTUP-162`
_Avoid_: process (an instance is several), session

**Single-instance record**:
The per-user record naming which process is currently the instance and how a launch reaches it. Its
form and placement are implementation choices; what is observable is that a launch either claims it
or is handed over. — `REQ-STARTUP-161`, `REQ-STARTUP-164`

**Hand-over**:
Passing a launch to the instance that already exists. A launch arriving while the instance is
shutting down is refused for the remainder of the shutdown and honoured once it has finished. —
`REQ-STARTUP-164`, `REQ-SHELL-169`

**Launch preparation**:
What a single-file portable artifact may write once, in per-user machine-local storage and never
beside the artifact, so the artifact still runs from read-only and removable media. It is not a
published artifact and is never the target of an update. — `REQ-STARTUP-165`
_Avoid_: extraction, unpack, cache

**First paint**:
The moment the desktop is on screen, which the startup sequence is bounded against and which machine
setup never delays. — `REQ-STARTUP-155`, `REQ-SHELL-011`

**Demo mode**:
The entry that runs the product without a real workspace. — `REQ-SHELL-162`

### Provisioning a machine

**Machine setup**:
The visible, cancellable, resumable pass that probes for required tools, provisions pinned versions
into a per-user managed directory, and warms package caches. When a tool is unavailable only the
features needing it lose capability; the application is never held back. — `REQ-STARTUP` overview
_Avoid_: install, onboarding (**project initialization** is the
[Workspace](../workspace/CONTEXT.md) context's word), bootstrap

**Setup manifest**:
The pinned declaration of what setup provisions — per tool a probe, a version, per-platform
artifacts with their hashes, a licence and the capabilities it enables. — `REQ-STARTUP-058`

**Platform key**:
The per-platform selector a manifest's artifacts are chosen by. — `REQ-STARTUP-059`

**Probe**:
Running a tool's declared command to learn whether it is present and at what version. —
`REQ-STARTUP-063`

**Managed tool**:
A tool the product provisioned itself, held under its own per-user tree at a pinned version, as
opposed to one the machine already had. — `REQ-STARTUP` managed tool environment

**Setup outcome**:
`complete`, `degraded`, `cancelled`, or `already-running`. — `REQ-STARTUP-074`

**Per-user location**:
The machine-local, non-replicated directory the product keeps a user's data and configuration in,
which governs over the platform's own default. Nothing replicated to another machine or another copy
of a profile is this location. — `REQ-STARTUP-145`
_Avoid_: home directory, appdata, profile
