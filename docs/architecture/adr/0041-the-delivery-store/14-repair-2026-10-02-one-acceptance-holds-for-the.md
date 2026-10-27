# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Repair — 2026-10-02: one acceptance holds for the rest of the launch

Part 14 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Repair — 2026-10-02: one acceptance holds for the rest of the launch

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md`](../../../defects/fixed/accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md).*

Part AP's second execution built REQ-TRACE-472's disclosure with **two** desktop preferences and **one** reading of a
launch nobody disclosed — `due`, `suppressed` (accepted permanently) or `off` — and the repairs above stamped that value
on every command. **Only the permanent half of "Accepting SHALL suppress the disclosure for the remainder of that launch,
and accepting it permanently SHALL suppress it in subsequent launches too" was built**: a plain acceptance wrote no
preference, main held nothing for it, and the next card's preview read `due` again. The launch is read as the
application's, as "subsequent launches" requires, and main's lifetime is that launch. So main's coordinator now holds a
plain acceptance in memory, told by the board through `requirements.runs {op: 'accept'}`, and reads `accepted` — a new
value of `StandingDisclosure` and of `LaunchPreview.disclosure` — in the standing disclosure it stamps on every service
command and in the launch preview, which the board answers without the dialog (`disclosureFor`) and passes straight
through as the act's or release's payload. The workspace service needed no change: it already treats any standing
value but `due` and `off` as disclosed and permissive. The next launch reads `due` again. `requirements-proof`'s
`disclosure-launch` stage shows it.
