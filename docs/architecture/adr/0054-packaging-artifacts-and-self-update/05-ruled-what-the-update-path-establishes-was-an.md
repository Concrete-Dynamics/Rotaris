# ADR-0054 — Packaging, the four artifacts, and self-update — Ruled — what the update path establishes (was an escalation; ESC-8)

Part 5 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Ruled — what the update path establishes (was an escalation; ESC-8)

The options this record raised were: **(a)** keep it as specified, disclosed in the release notes;
**(b)** add code signing and notarization; **(c)** sign the checksums manifest with a key shipped in the
application. **The owner ruled (c).**

The reasoning recorded with the ruling: `REQ-STARTUP-021`, `REQ-STARTUP-023` and `REQ-STARTUP-123` leave
binaries deliberately unsigned, so as specified the update path establishes *what* was downloaded and
nothing about *who* published it, over the same connection the download came from. Signing the manifest
gives publisher authenticity for updates, is materially cheaper than full code signing and notarization,
and **does not change first-launch platform warnings** — so consequence 2 below stands unaltered.

**The ruling is unchanged. The mechanism this record proposed for it is superseded**, and the
specification has since fixed both halves it left open. `REQ-STARTUP-167` is now the product's single
definition of publisher authenticity; `REQ-STARTUP-168` fixes rotation; `REQ-STARTUP-032`,
`REQ-STARTUP-035`, `REQ-STARTUP-122`, `REQ-STARTUP-123` and `REQ-STARTUP-152` carry the consequences.

**Superseded, and preserved because the argument was sound and only its premise was wrong.** This record
held: *"the signature must not become a fifth published asset. `REQ-STARTUP-152` and `REQ-STARTUP-035`
require every filename a release publishes to be a value of the one naming scheme, with exactly one
release-body row per published asset except the manifest. A detached signature file would be a filename
the scheme does not name. The signature therefore travels inside the manifest … the constraint it must
satisfy is that no new filename appears."* And on rotation: *"rotation therefore requires a period in
which the manifest carries signatures under both the outgoing and the incoming key."*

**What changed is that both constraints were amendable and were amended, which is not something an
architecture record gets to assume.** The naming rule was not a fact about the world; it was a
requirement, and the specification chose to widen it rather than to contort the signature into the
manifest. Reading the amended text against the old argument:

- **`REQ-STARTUP-032` now names the file.** The signature is `SHA256SUMS.txt.sig`, a detached signature
  over the manifest's **exact published bytes**, published beside it. The manifest lists neither itself
  nor the signature, and the requirement gives the reason this record did not have: *"the signature is
  what establishes the manifest rather than something the manifest establishes, and a manifest cannot
  carry a digest computed over a file derived from the manifest itself."*
- **The two agreement rules were amended to admit it, individually.** `REQ-STARTUP-152` now reads "the
  manifest listing every published asset but itself **and the signature published over it**", and
  `REQ-STARTUP-035` (3) now excepts both from the release-body table. So the constraint the old argument
  enforced — no filename outside the scheme — was not defended by hiding the signature; it was replaced
  by naming the two files the scheme does not cover.
- **Detachment is now load-bearing rather than incidental**, and it is the reason the old proposal would
  have been worse. `REQ-STARTUP-152` requires `SHA256SUMS.txt` **exactly as published** to be consumable
  unmodified both by the update path and by `sha256sum -c`, "with no reformatting step in between".
  Carrying a signature inside the manifest would have put content into a file whose bytes a stock tool
  must still accept. The detached form leaves those bytes untouched, which is why both consumers read the
  same file. **The old proposal was not merely overtaken; it conflicted with a guarantee this record had
  already cited elsewhere.**
- **Rotation is decided the other way round, and better.** `REQ-STARTUP-168` (a) makes what a build
  carries a **set** of keys rather than one, and (b) requires a release to be signed with a key carried
  by every published artifact it may be offered to — decidable before publishing, and decided at
  `REQ-STARTUP-156`'s gate. So the overlap lives in the **builds**, not in the manifest, and there is one
  signature per release rather than several. That is strictly cheaper: the manifest format never changes,
  and the thing that must be got right is a gate check against releases already published rather than a
  multi-signature format the updater has to parse.

**What this record owns under the amended text:**

- **The verification order is fixed by requirement and is not ours to arrange.** `REQ-STARTUP-122`:
  fetch the manifest together with the signature → **verify the signature** → parse the manifest, and
  only then → stream the asset into a fresh staging directory → verify the digest → apply. The signature
  is checked **before the manifest is parsed and before any asset is fetched**, so a manifest this build
  cannot attribute to a trusted publisher costs the user no download and **reaches no parser**. That last
  clause is a security property, not an efficiency one: it keeps untrusted bytes out of our parser, and
  it inverts the order this record previously wrote ("fetch and parse the manifest; stream the asset;
  verify; apply").
- **Three signature outcomes, each refusing the install and leaving nothing downloaded**
  (`REQ-STARTUP-123`): no signature published, a signature that cannot be fetched, and a signature that
  does not verify against a key this build carries. Their wording is ours; their existence and their
  effect are not. **No refusal is overridable** — no confirmation, setting, retry or interface path
  installs an update whose signature did not verify — so the updater must offer no such path even as a
  developer affordance.
- **The trusted set is fixed at build time and nothing at run time may touch it.** `REQ-STARTUP-167`
  forbids a configuration value, a preference, an environment variable, an interface control or anything
  downloaded from adding to, replacing or disabling it, "because a trust anchor a network can replace
  establishes nothing". This is a structural obligation on where the keys live: they are compiled into
  the artifact and resolved from what was installed with no additional download (`REQ-STARTUP-159`).
  There is no key file to ship, and shipping one would create the surface the requirement forbids.
- **The gate check of `REQ-STARTUP-168` (b) is a release-pipeline obligation with a real input.** To
  decide that a release is verifiable by everything it may be offered to, the pipeline must know which
  keys the artifacts of every still-offerable release carry. That is a record the pipeline has to keep
  deliberately; it cannot be recomputed from the current checkout, because it is a fact about builds that
  already shipped. **Not keeping it is how (b) becomes undecidable and stranding becomes a discovery.**
- **A withdrawn key strands updates and nothing else, by design.** `REQ-STARTUP-168` (c): installations
  carrying only a withdrawn key refuse the install, keep working exactly as they did, and their update
  *check* stays silent under `REQ-STARTUP-110` and `REQ-STARTUP-150` — the refusal is visible only where
  a user asks for the install. So the compromise path is a product decision with a stated cost, not an
  outage.
- **The key material is a release-pipeline secret and never ships**; only the verification counterpart is
  in the artifact. Nothing about this changes the unsigned-binary decision or the platforms' first-launch
  warnings, and `REQ-STARTUP-035` (6) requires the release body to say so explicitly, so a reader does not
  take the absence of a code signature to mean the update path establishes nothing about who published.
