# Product-owner decisions on the architecture record — Escalations after the gate — 2026-10-22

Part 15 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Escalations after the gate — 2026-10-22

<a id="esc-43"></a>

### ESC-43 — domain 19's update requirements were never swept after ESC-8 and SR-1: REQ-NOTIFY-219 and REQ-NOTIFY-212 against domain 11

**Raised 2026-10-22, open — the owner's to rule.** Found while reading for [R-084](../../product/requests.md#r-084)'s plan
([`background-update-plan.md`](../background-update-plan.md)); nothing in R-084 depends on the answer, and no build reads
either sentence today (the updater follows domain 11). Two live requirements of domain 19's §G1 state the opposite of
domain 11 on the same behaviour.

- **(a) Who published an update.** REQ-NOTIFY-219: "A downloaded update is installed only after its SHA-256 digest has been
  compared with the digest published for that release in `SHA256SUMS.txt` and the two match. … **No signature is verified**:
  a matching digest establishes that the download is the published file and nothing about who published it."
  REQ-STARTUP-167: "the update path SHALL install nothing whose manifest signature it has not verified", with
  REQ-STARTUP-122 and REQ-STARTUP-123 placing that verification before the manifest is parsed. ESC-8's ruling (option (c),
  the signed manifest) amended domain 11 and REQ-STARTUP-032; the ruling-application round's sweep did not reach domain 19.
- **(b) How often the check runs.** REQ-NOTIFY-212: "The application checks **once per launch**". REQ-STARTUP-114: "once
  per **window activation**", and REQ-STARTUP-047 gives a replacement window "a fresh update check"; under SR-1 one launch
  holds several windows, so the two counts differ whenever a second window opens.

**Why both cannot hold.** (a) A build that verifies the signature contradicts "no signature is verified"; one that does not
contradicts REQ-STARTUP-167. (b) A second window either checks or it does not.

**Options.** (1) Amend REQ-NOTIFY-219 and REQ-NOTIFY-212 to domain 11's text — an amendment round, the derived record
corrected in place as ESC-8's sweep would have done (recommended: domain 11 is the side ESC-8 and SR-1 were applied to, and
the updater as built follows it). (2) Amend domain 11 to domain 19 — which would reverse ESC-8 for (a). (3) Leave both and
record which governs per sentence — leaves a reader of domain 19 believing text that does not describe the product.

**What the build proceeds under.** Domain 11, as built since 2026-09-28. Not ruled here: an escalation stays the owner's.
