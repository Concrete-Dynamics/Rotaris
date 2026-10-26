[Product directives](../directives.md) › PD-WORKSPACE-004

<a id="pd-workspace-004"></a>

### PD-WORKSPACE-004 — the injection latency bound counts every instruction file discovery can reach

REQ-WORKSPACE-049's reference conditions SHALL read "every instruction file discovery can reach, totalling up to 1 MiB"
where they read "up to 20 context files totalling 1 MiB", in both places the requirement states them. Under
`PD-WORKSPACE-002`'s discovery that is fourteen files on a platform with a machine-wide `/etc` hierarchy and twelve on
Windows, of which the merge reads twelve and ten. A fixture "at the bound" fills every slot discovery can reach with
1,048,576 bytes across them. The 200 ms figure, the cold cache, the 95th percentile of at least twenty measurements in
separate processes, determinism and responsiveness are unchanged.

**As built.** `pnpm injection-proof`'s latency section, whose fixture fills the fourteen slots with exactly 1 MiB.

**Why, and what it costs.** OQ-68: no discovery rule the record has held can present twenty files, so the count half of
the bound could not be built. The owner restated it as what discovery reaches. What it costs: should discovery widen, the
bound widens with it, and the 200 ms figure then covers more files than it was first stated over.

> **Narrows:** REQ-WORKSPACE-049

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-68.*
