# IC-3 — the macOS build-host obligations, deferred to hardware

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed, and the narrowing below was added. Its status is the index's table.*

> **NARROWED 2026-10-26 BY THE OWNER — the Linux half is removed from this condition
> ([R-087](../../product/requests.md#r-087)).** The owner, who set this condition through GD-5, ruled that no
> implementation condition may prevent a Linux build: "das IC, also Implementation Conditions sollten keine
> Linux-Builds verhindern … deine Arbeit darf nicht blockiert werden dadurch. … Müsste ein AC sein und eine
> Architekturentscheidung." The Linux halves of items 1 to 4 below are **not discharged and not waived**: they moved,
> word for word in substance, to the acceptance criteria of
> [ADR-0066](../adr/0066-the-linux-artifact-is-built-on-a-developer-host.md), which authorises building the Linux
> artifact and states what must be shown before it is called accepted or published. What this entry still binds is
> the **macOS** half, unchanged.
>
> The heading read, and no longer governs: *"IC-3 — the Linux and macOS build-host obligations, deferred to
> hardware"*. The **Binds** line read, and no longer governs: *"any release artifact for Linux or macOS, and the
> store binding's acceptance on any platform"*. Item 1 is wholly Linux and is now ADR-0066's AC-1; items 2 to 4 keep
> their macOS half here and their Linux half is ADR-0066's AC-2 to AC-4. Publication is not touched by the narrowing:
> `PD-STARTUP-001` still publishes Windows x64 alone.

**Set by:** GD-5, 2026-09-02; narrowed by the owner, 2026-10-26 (R-087). **Binds:** any release artifact for
macOS, and the store binding's acceptance on macOS. **Discharged into:** dated spike reports and a note on the ADR
each obligation belongs to.

**Why it is here rather than in the gate verdict.** These four cannot be closed on the machine this record
was produced on. Deferring them to a machine that exists is a scheduling fact; leaving them in a verdict
category is how an obligation becomes a paragraph nobody owns. They remain owed and none of them is smaller
for being written here.

1. ~~**Spike 12 — the Linux artifact's runtime on a host that has never had the legacy FUSE library
   installed.** Decides which of ESC-11's two applied options the release takes. The measurement's whole
   content is the never-had-it condition, which a machine cannot reach by uninstalling.~~
   *Moved 2026-10-26 to ADR-0066, AC-1; owed there, unchanged.*
2. **Spike 17's macOS ~~and Linux~~ platform key~~s~~.** `REQ-STARTUP-155` binds all four artifacts; two were built.
   *The Linux key moved 2026-10-26 to ADR-0066, AC-2.*
3. **ADR-0056's build-time load proof on ~~all three release runners~~ the macOS release runner.** This one grew
   rather than waited. It was always the only check that catches an unloadable store binding, and defect D10
   established that the rebuild it confirms **exits 0 while compiling nothing**, and that the binding's loader
   prefers a prebuilt binary over anything built beside it. Rule 4 is now the entire check rather than one of
   several, and it must be shown constructible on each runner rather than assumed. *The Linux runner moved
   2026-10-26 to ADR-0066, AC-3; the Windows runner was IC-6's and is discharged.*
4. **The instance claim on macOS ~~and Linux~~.** SR-1 made this entirely ours on three platforms and it is
   measured on one. `REQ-STARTUP-156`'s release gate does not require launching the entry point twice on one
   user account, which is the check that would catch a failure. *Linux moved 2026-10-26 to ADR-0066, AC-4.*

*2026-10-22 ([R-080](../../product/requests.md#r-080)): the Linux and macOS packaging configuration is prepared and not wired
(`apps/desktop/scripts/lib/platform-targets.mjs`; ADR-0054, "Linux and macOS configuration prepared"). This discharges
none of the four items. Item 1's choice between ESC-11's options now has a configuration to measure (`toolsets.appimage`
"1.0.3" on the stable line), and the hooks still refuse every platform but win32.*

*2026-10-26 (R-087): the hooks' refusal of `linux` still names this condition as its reason, and that reason no longer
holds — recorded as [a defect note](../../defects/the-build-hooks-refuse-a-linux-artifact-in-the-name-of-ic-3.md), not
repaired here. Their refusal of `darwin` is this entry's and stands.*

**What deferral is not.** It is not a judgement that these will pass. Every one of them is in the class of
things this record has never executed, and every mechanism this record has taken from paper to first
execution has held a defect no reading caught — three for three. **An implementation that reaches a ~~Linux or~~
macOS artifact before this condition is discharged is shipping on an untested platform.** *(The same sentence
holds for a Linux artifact built before ADR-0066's acceptance criteria are met; it is stated there.)*
