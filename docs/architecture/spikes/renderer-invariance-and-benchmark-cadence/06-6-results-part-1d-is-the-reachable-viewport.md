# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 6. Results — Part 1d: is the reachable viewport knowable at construction?

Part 6 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

## 6. Results — Part 1d: is the reachable viewport knowable at construction?

ADR-0045 states that the earlier formulation — size the pool at construction for "the largest viewport
the window can reach" — is not determinable in the live application, and replaces it with a declared
`H_max` constant. That claim was tested rather than argued.

At construction the display enumeration offered two displays, both 1920×1080 with work area 1920×1032 and
`scaleFactor` 1. The tallest thing any host-derived figure could name is therefore **1080 px**. The window
was then driven to a series of sizes, each read back from both the main process (`getContentSize`) and the
renderer (`window.innerHeight`), with the pool held at 80 slots:

| attempt | requested content size | achieved content size | renderer `innerHeight` | transcript viewport height | slots the viewport calls for | pool sufficient |
|---|---|---|---|---|---|---|
| opening | 1440×900 | 1440×900 | 900 | 768 | 34 | yes |
| `maximize()` | — | 1920×983 | 983 | 851 | 37 | yes |
| work-area height | 1200×1032 | 1200×1032 | 1032 | 900 | 38 | yes |
| full display height | 1200×1080 | 1200×1080 | 1080 | 948 | 40 | yes |
| tallest display + 500 | 1200×1580 | **1200×1580** | **1580** | 1448 | 57 | yes |
| — | 1200×3000 | **1200×3000** | **3000** | 2868 | **104** | **no** |
| — | 1200×8000 | **1200×8000** | **8000** | 7868 | **271** | **no** |
| — | 1200×20000 | **1200×20000** | **20000** | 19868 | **671** | **no** |
| back to opening | 1440×900 | 1440×900 | 900 | 768 | 34 | yes |

**Windows did not clamp the window to any display.** A content height of 20,000 CSS pixels was requested,
granted, and reported by the renderer as a real laid-out viewport, on a machine whose tallest display is
1,080 pixels. Nothing in the display enumeration available at construction bounds it. The empirical answer
to the question is therefore:

- **"The largest viewport the window can reach" is not knowable at construction time on Windows, and the
  gap is not marginal.** It is not a matter of a user maximising onto a taller monitor later — a window on
  *this* machine, with *these* two 1080 px displays, reached a viewport 18.4× taller than the tallest
  display present, without any monitor being attached. The reachable height is bounded by what the window
  manager accepts, which was at least 20,000 px here and was not probed further.
- **ADR-0045's replacement of that formulation with a declared `H_max` constant is therefore not merely
  tidier; the original formulation has no referent.** A constant is the only thing available to write
  down, which is what the record already says.
- **The consequence of the growth branch being unreachable is concrete and worth stating in the size the
  user would see.** At 20,000 px of content the viewport calls for 671 slots and the pool holds 80. The
  pool covers 80 of 671 slots; the rest of the transcript pane would be blank until the pool grew. The
  branch exists in ADR-0045 for exactly this case, and this measurement shows how big the case is.
- **The benchmark cannot reach it.** Confirmed by measurement, not only by argument: across every phase
  record and every resize step of all twelve runs, the largest slot count the viewport ever called for was
  **34**, at the opening canonical size, against a pool of 80; the harness's "pool growth wanted"
  watermark was 0 in all twelve runs including all sixty resize steps. No size in `REQ-UIBENCH-060`'s
  sweep exceeds the construction size in either dimension, and the measurements agree.

Not measured, and therefore not claimed: behaviour when a display is physically attached or removed while
the window exists; behaviour at a `scaleFactor` other than 1 (both displays here report 1); and whether
any other window manager on the two other platforms clamps where Windows does not.

---
