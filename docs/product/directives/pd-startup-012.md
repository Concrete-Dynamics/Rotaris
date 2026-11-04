[Product directives](../directives.md) › PD-STARTUP-012

<a id="pd-startup-012"></a>

### PD-STARTUP-012 — a release publishes its SBOM beside its artifacts, signed with them

For each platform key a release publishes, the release SHALL publish exactly one Software Bill of Materials of that platform's production dependency tree, Electron included, in CycloneDX JSON, as an asset beside the artifacts of REQ-STARTUP-031. Its filename SHALL be rendered by the single naming authority of REQ-STARTUP-031 as `Rotaris-{v}-{platform}-sbom.cdx.json`, by a function of its own and never as an artifact kind: the four artifact shapes, the per-platform kinds and the unknown-kind error of REQ-STARTUP-031 are unchanged, an update client SHALL never ask for it (REQ-STARTUP-108), and no download surface SHALL offer it as something to install. The SBOM SHALL be listed in `SHA256SUMS.txt` and is thereby covered by the signature of REQ-STARTUP-032 and REQ-STARTUP-167, and it SHALL have its row in the body table of REQ-STARTUP-035 (3). A release directory that lacks the SBOM for a published platform key SHALL be refused at the manifest step as a release missing an artifact is, and every other file the naming authority does not name SHALL still be refused: this directive admits the SBOM and nothing else. The release gate of REQ-STARTUP-156 is unchanged in its set: the SBOM is a published asset the manifest covers and not a published artifact to be launched. PD-STARTUP-001 is unchanged: while it stands, that is one SBOM, for `windows-x64`.

**Why, and what it costs.** R-091 asks for an SBOM on the release, the OpenSSF Scorecard's SBOM check among its reasons, and that check reads a release's assets; a workflow artifact kept 90 days is unsigned, expires, and lets no one re-establish a release's dependency tree from the release itself. REQ-STARTUP-152 closed the asset set so that the manifest, the assets and the update client agree on names, and that purpose is kept whole: the update path selects its artifact, the manifest and the signature by exact name and reads nothing else, while `sha256sum -c` checks the extra line like any other. Listing the SBOM in the signed manifest is what makes it established by the same signature as the installer, which the raising entry set as the condition of any published SBOM; a per-platform name keeps the rule correct on the day PD-STARTUP-001 is withdrawn. What it costs: the closed asset set gains one deliberate exception, and the tests that guard it name that exception exactly so it does not loosen into any extra file; the SBOM writer (pnpm's own `sbom` command) is now on the release's critical path, so a tag whose SBOM cannot be written fails at the manifest step; a wrong or incomplete SBOM is published under the publisher's signature, so its correctness is a release concern held by `tools/sbom/sbom.test.ts`; the release page and the body table carry one file a reader may mistake for a download, which its name and its row bound; the writer's current platform-less filename changes, and the 2026-11-02 first execution's filename no longer matches the rule; and the Scorecard credit is observed only from the first published release that carries it. Raised by [OQ-487](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-4.md#oq-487).

> **Narrows:** REQ-STARTUP-152
> **Extends:** REQ-STARTUP-031

*Raised as [OQ-487](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-4.md#oq-487) by [R-091](../requests.md#r-091)'s hardening, 2026-11-02, and ruled 2026-11-04 by the orchestrator's consortium under the owner's delegation ([R-072](../requests.md#r-072)); minted because the SBOM is a published asset whose filename is not one of REQ-STARTUP-031's artifact shapes, where REQ-STARTUP-152 holds every published filename to that scheme. Numbered PD-STARTUP-011 in its ruling; [`PD-STARTUP-011`](pd-startup-011.md#pd-startup-011), ruled the same day, took that number first, so this took the next free one. REQ-STARTUP-032 and REQ-STARTUP-035 hold as written once the SBOM is an asset, and carry a cross-reference rather than a back-pointer.*

> **First execution, 2026-11-04 (hardening hrda, `sbom-published-asset`):** built as ruled, and executed locally only.
> `sbomName(version, platform)` stands in `tools/release-naming/src/index.ts` beside `artifactName`, outside
> `ARTIFACT_KINDS`; `tools/release-pipeline/assets.mjs` admits and requires `expectedSboms` and still refuses every other
> unnamed file; `pnpm sbom:write <tag> <dir> <platform>` takes its filename from the authority; `release.yml`'s build job
> writes it into `release-assets/` and keeps no workflow artifact of its own. On Windows 11 ARM64 (Node 26.13.0, pnpm
> 11.9.0) the writer produced `Rotaris-0.1.0rc1-windows-x64-sbom.cdx.json` (118,037 bytes, 88 components, Electron 44.3.0
> included); `release:pipeline manifest` over stand-in artifacts refused the directory without it and listed three lines
> with it, `sha256sum -c --strict` read all three OK, and `body` gave it its row. *Reading carried, not a ruling:* "refused
> at the manifest step" is built as `writeChecksumManifest` refusing, with nothing written, so no signature is ever made
> over a manifest that lacks the SBOM; a missing artifact is still refused at `verify`, in the same `sign` job.
> **Not executed here:** the tag workflow and the release key. The release's first execution is the next tag's draft read
> back by the owner — the SBOM attached, listed in `SHA256SUMS.txt`, its row in the body, the signature verifying — and the
> Scorecard's SBOM credit is observed only from the first published release that carries it
> ([first executions, part 37](../../architecture/first-executions/37-the-register-36.md)).
