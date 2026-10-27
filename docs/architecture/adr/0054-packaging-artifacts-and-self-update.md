# ADR-0054 — Packaging, the four artifacts, and self-update

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **Reopened and re-decided.** The packaging tool's own portable target cannot
  meet `REQ-STARTUP-155` at any bundle weight, including an empty one; SR-7 rules that the artifact
  prepares itself once and launches from that preparation, and `REQ-STARTUP-165` now states the contract
  that preparation must satisfy. Both escalations this record raised are also ruled and are converted
  from open questions into decisions.
- **Revised:** 2026-09-02, against the settled specification, and it moves this record in three places.
  **ESC-8's signature mechanism is decided against the shape this record proposed** — `REQ-STARTUP-167`,
  `REQ-STARTUP-168` and an amended `REQ-STARTUP-032` publish a **detached** signature as a fifth asset and
  make the *build* carry a set of keys, where this record argued no new filename could appear and put the
  rotation in the manifest. **The one gap this record's own "Revisit if" named is closed**:
  `REQ-STARTUP-165` (c) now states the outcome for a preparation that cannot be made at all, and the
  design is built to it below rather than left owed. And the native-module obligation is widened to the
  store binding and pointed at ADR-0056's build-time proof.
- **Revised:** 2026-09-02, a second time, and this time against **measurement** rather than against text.
  SR-7's gate condition was measured and **SR-7 is vindicated**: a cached launch paints in 575.5–624.2 ms
  warm against 5,000 ms, and the worst cached measurement taken anywhere in the spike is 1,414.6 ms. The
  "Revisit if" clause that turned on that number is discharged below. But the same run found **two defects
  in the mechanism this record specifies, both observed rather than inferred** — the commit step does not
  work on Windows, and the completeness check passes a damaged preparation that then launches to no window
  at all — and both are corrected in the Decision. **The corrections do not reopen P4; they are what makes
  P4 work.**
- **Origin:** UI (ADR-UI-12)
- **Depends on:** ADR-0001, ADR-0002, ADR-0020, ADR-0042, ADR-0049, ADR-0055, ADR-0056, ADR-0058
- **Governed by:** `owner-decisions.md` ESC-8, ESC-11, SR-7, and the consequence for ADR-0058 recorded
  with ESC-21
- **Evidence:** `../spikes/cached-portable-launch.md` — the measurement of the preparation mechanism this
  record specifies, and the source of every figure below that is not attributed to another spike;
  `../spikes/packaged-first-paint.md` for the `electron-builder` `portable` target that P1 was refused on;
  `../spikes/windows-writer-handle-compaction.md` §3.2 for the Windows replace semantics the update path
  depends on.

## Parts

Since 2026-10-26 the rest of this document is in [`0054-packaging-artifacts-and-self-update/`](0054-packaging-artifacts-and-self-update/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0054-packaging-artifacts-and-self-update/01-context.md) | Context |
| [02](0054-packaging-artifacts-and-self-update/02-alternatives-considered.md) | Alternatives considered; For the Windows portable's launch path — reopened, and re-decided on measurement |
| [03](0054-packaging-artifacts-and-self-update/03-decision.md) | Decision; The launch preparation — what `REQ-STARTUP-165` leaves to this record |
| [04](0054-packaging-artifacts-and-self-update/04-the-launch-preparation-what-req-startup-165.md) | The launch preparation — what `REQ-STARTUP-165` leaves to this record *(continued, from "The stub must not outlive the launch, and must not keep the artifact open.")* |
| [05](0054-packaging-artifacts-and-self-update/05-ruled-what-the-update-path-establishes-was-an.md) | Ruled — what the update path establishes (was an escalation; ESC-8) |
| [06](0054-packaging-artifacts-and-self-update/06-ruled-the-linux-artifacts-runtime-and-the.md) | Ruled — the Linux artifact's runtime, and the sandbox that comes with it (was an escalation; ESC-11) |
| [07](0054-packaging-artifacts-and-self-update/07-consequences-accepted.md) | Consequences accepted |
| [08](0054-packaging-artifacts-and-self-update/08-discharged-the-cached-launch-clause-retired.md) | Discharged — the cached-launch clause, retired 2026-09-02 |
| [09](0054-packaging-artifacts-and-self-update/09-revisit-if.md) | Revisit if |
| [10](0054-packaging-artifacts-and-self-update/10-first-execution-2026-09-04-the-installer.md) | First execution — 2026-09-04, the installer |
| [11](0054-packaging-artifacts-and-self-update/11-the-bundled-code-intelligence-runtime-as.md) | The bundled code-intelligence runtime as `extraResources` — 2026-09-06, Part T (ADR-0035's first execution) |
| [12](0054-packaging-artifacts-and-self-update/12-two-assets-the-about-page-asks-this-record-for.md) | Two assets the About page asks this record for — 2026-09-08 (Part AG) |
| [13](0054-packaging-artifacts-and-self-update/13-one-version-and-the-pre-build-guard-first.md) | One version and the pre-build guard — first execution, 2026-09-27 (first-release plan §4.1) |
| [14](0054-packaging-artifacts-and-self-update/14-the-setup-manifest-first-execution-2026-09-28.md) | The setup manifest — first execution, 2026-09-28 (first-release plan §4.1) |
| [15](0054-packaging-artifacts-and-self-update/15-the-notices-generator-2026-09-27-first.md) | The notices generator — 2026-09-27, first execution (`first-release-plan.md` §4.3) |
| [16](0054-packaging-artifacts-and-self-update/16-the-two-bundled-assets-2026-09-27-first.md) | The two bundled assets — 2026-09-27, first execution (`first-release-plan.md` §4.4) |
| [17](0054-packaging-artifacts-and-self-update/17-the-prerelease-naming-repair-2026-09-28-first.md) | The prerelease naming repair — 2026-09-28, first execution (R-062; first-release plan §4.1/§4.2/§4.5) |
| [18](0054-packaging-artifacts-and-self-update/18-the-updater-2026-09-28-first-execution-first.md) | The updater — 2026-09-28, first execution (`first-release-plan.md` §4.6; O-10, R-062) |
| [19](0054-packaging-artifacts-and-self-update/19-the-tag-workflow-the-manifest-the-signature-and.md) | The tag workflow, the manifest, the signature and the key record — 2026-10-22, first execution (R-080; `first-release-plan.md` §4.2, §4.7, §4.8) |
| [20](0054-packaging-artifacts-and-self-update/20-linux-and-macos-configuration-prepared-2026-10.md) | Linux and macOS configuration prepared — 2026-10-22 (R-080; not wired, IC-3 and `PD-STARTUP-001` stand) |
| [21](0054-packaging-artifacts-and-self-update/21-the-portable-the-assisted-installer-and-the.md) | The portable, the assisted installer and the icon — 2026-10-23, first execution (`first-release-plan.md` §4.5, §4.9) |
| [22](0054-packaging-artifacts-and-self-update/22-planned-not-built-the-background-download-and.md) | Planned, not built — the background download and the next-start apply (2026-10-22, R-084) |
