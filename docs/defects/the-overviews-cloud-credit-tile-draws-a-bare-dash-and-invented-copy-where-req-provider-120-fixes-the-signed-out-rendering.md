## The Overview's Cloud credit tile draws a bare dash and invented copy where REQ-PROVIDER-120 fixes the signed-out rendering

With no hosted account connected, the Overview's first right-column tile reads the kicker "Cloud credit", the value `—` with
the unit "credit", and the caption "No hosted account is connected in this build; a balance appears here once one is." Every
part of that is the implementation's own words. REQ-PROVIDER-120 fixes the signed-out rendering to the letter: the card title
"Rotaris Cloud credit", value `—`, tag "Not signed in", detail "Sign in to Rotaris Cloud to see your credit.", and a "Sign in"
button as the only control. Drawn as built, the tile reads as a fifth metric card holding nothing, which is what the Overview
audit of 2026-11-02 found as candidate (e).

[OQ-538](../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-3.md#oq-538) ruled on 2026-11-03,
under the owner's delegation, that REQ-MONITOR-173's order stands and that this is a conformance gap in the tile, not a fault in
the order. The ruling names this note as the first step, then `build-ui` on the tile with the strings verbatim and the state
carried by tag text and outline shape (REQ-MONITOR-188). It leaves open whether "Sign in" can complete with no reachable hosted
service; if it cannot, the refusal is REQ-SHELL-040's and REQ-SHELL-112's, recorded here when the tile is built.

Noticed 2026-11-05 while executing the Overview audit's items 2 and 11, which do not include this tile. Recorded, not repaired.

## Specs

- REQ-PROVIDER-120: the signed-out rendering's title, value, tag, detail and only control.
- REQ-MONITOR-185: the `signed_out` phase "has something to show, so the tile is never drawn as an empty card".
- REQ-NOTIFY-209: none of the four phases "renders as blank or as an absence".
- REQ-MONITOR-188: the state carried by tag text and outline shape.
- `docs/design/README.md` §1.11: the specification's wording wins over invented copy.

## Relevant files

- `packages/ui/src/OverviewView.tsx`: the `ov-card--credit` card in the right column, with the invented caption.
- `docs/design/briefs/overview.md`: the audit's candidate (e) and its ruling.
- `apps/desktop/scripts/overview-proof.mjs`: the `empty` and `run` launches the ruling names as the repair's evidence.
