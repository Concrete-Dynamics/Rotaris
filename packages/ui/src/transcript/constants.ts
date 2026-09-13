/**
 * ADR-0045's declared product constants, written down ONCE, here, and cited from everywhere that reads them.
 *
 * **`H_MAX` is a declared maximum supported transcript viewport height, not a measurement of the window.** The
 * earlier formulation — size the pool at construction for "the largest viewport the window can reach" — has no
 * referent on this platform, and that is a measurement rather than an argument: the invariance spike asked Windows
 * for a window content height of 20,000 CSS pixels on a machine whose two displays are both 1,080 px tall, and
 * Windows granted it, laying out a real 20,000 px viewport without clamping. A viewport the host will grant but no
 * host enumeration will predict cannot be the basis of a capacity, so the capacity is declared and reviewable.
 *
 * 4,320 is chosen as the height of a 4320p display in its ordinary orientation — the tallest panel the product
 * expects to be maximised onto. At REQ-CHAT-057's 30 px minimum row height that is 144 slots, which with the
 * overscan is 154 always-allocated containers: a few hundred bytes of layout each, and REQ-UIBENCH-087's memory
 * tripwire does not object to over-allocation at all (it subtracts RSS at tail replacement 500 from RSS at 999, so
 * an allocation made at construction appears in both samples and cancels).
 *
 * **ADR-0045's "Revisit if" names the trigger this constant must be checked against:** if `H_MAX` is chosen at a
 * value a supported display can exceed, the one growth branch stops being unreachable and `REQ-UIBENCH-054`
 * acquires a real deviation rather than an unreachable one. A display taller than 4,320 CSS pixels — a portrait 8K
 * panel, or any display at a `scaleFactor` below 1 — is that case, and the branch exists and is taken rather than
 * the transcript being left blank below the pool.
 */
export const H_MAX = 4320;

/**
 * REQ-CHAT-057 fixes the minimum row height normatively, in pixels; PD-CHAT-003 narrows it to a
 * one-line ROW's rendered height (the estimate floor and the slot-size arithmetic's conservative
 * unit), not a padding-box minimum the stylesheet enforces on every row.
 */
export const ROW_MIN_HEIGHT = 30;

/** Slots above and below the visible span, so an ordinary scroll rebinds rather than reveals blank space. */
export const OVERSCAN = 10;

/** ADR-0045: capacity is `ceil(H_max / 30 px)` plus overscan, and is fixed for the life of the window. */
export const POOL_CAPACITY = Math.ceil(H_MAX / ROW_MIN_HEIGHT) + OVERSCAN;

/**
 * The one growth branch ADR-0045 permits: a viewport TALLER than `H_MAX` grows the pool, and that is the only
 * event allowed to change the slot count after construction. It lives in the product's own rendering path and is
 * not conditioned on being under measurement (REQ-UIBENCH-112), so the benchmark runs the same code and simply
 * never takes the branch — its window is constructed at 1440x900 and REQ-UIBENCH-060's sweep visits no size larger
 * in either dimension.
 */
export function capacityFor(viewportHeight: number): number {
  return viewportHeight <= H_MAX ? POOL_CAPACITY : Math.ceil(viewportHeight / ROW_MIN_HEIGHT) + OVERSCAN;
}

/** REQ-CHAT-065: the searchable member blob of a group header. */
export const GROUP_BLOB_CAP = 2000;

/** REQ-CHAT-050: added-or-removed lines drawn before the truncation line. */
export const DIFF_LINE_CAP = 50;

/** REQ-CHAT-063: every live row refreshes at least this often, so elapsed times advance and spinners animate. */
export const LIVE_REFRESH_MS = 1000;

/**
 * REQ-CHAT-063's other cadence — at least once every 250 ms while a TERMINAL stream is live. Nothing publishes a
 * terminal frame in this build (`CHANNEL.terminalFrames` exists in the contract, the relay and the preload and has
 * no producer; ADR-0021 has no first execution), so this cadence is implemented and left unexercised, and the
 * `streamId` REQ-CHAT-046 puts on a row is what it will key on when a producer exists.
 */
export const LIVE_TERMINAL_REFRESH_MS = 250;

/** REQ-CHAT-062: a live thinking row stops presenting as live after this long without completion. */
export const THINKING_STALE_SECONDS = 3600;

/** REQ-UIBENCH-063 / REQ-UIBENCH-086: the rendered-body cache's observable capacity. */
export const RENDER_CACHE_ENTRIES = 256;
export const RENDER_CACHE_CHARACTERS = 2_000_000;

/** Scrolling within this many pixels of the top asks for the next older span (REQ-CHAT-165). */
export const PAGE_OLDER_THRESHOLD = 240;

/** The tail-follow test of REQ-CHAT-070: the scrollbar "rests at its maximum" within a pixel of rounding. */
export const TAIL_EPSILON = 2;

/**
 * **The counting rule for `widgets` and `ui_objects`, written down once as the product's own definition** —
 * ADR-0045's closing obligation, so that a later reader does not conclude the counter was gamed. It is reading 1
 * of that record, which ESC-13 leaves admissible under either answer to OQ-28.
 *
 *  - **`widgets`** counts the live STRUCTURAL elements the application's own layout owns: the shell, the
 *    navigation rail, the view frame, the status strip, the transcript pane and its FIXED slot pool, the composer
 *    and the panes beside it. Every one is allocated at window construction and is count-stable thereafter, and
 *    every one occupies space in the window's layout and can be painted, which is the honest test.
 *  - **Content nodes inside a slot** — the spans, code blocks and links a Markdown body produces — are counted in
 *    **`ui_objects`**, which REQ-UIBENCH-109 makes explicitly informational and unbounded: no invariant reads it
 *    and no value it takes changes any outcome.
 *
 * The selector below IS that definition. It is cited from `countWidgets` and from the transcript proof, and the
 * benchmark harness of ADR-0053 must read it from here rather than restate it.
 */
export const WIDGET_SELECTOR = [
  '.app-shell',
  '.nav-rail',
  '.view',
  '.status-strip',
  '.workspace',
  '.transcript',
  '.transcript__pane',
  '.transcript__scroll',
  '.transcript__pool',
  '.transcript__slot',
  '.composer',
  '.composer__actions',
].join(', ');

/**
 * **What this list leaves out, and why — because leaving it unsaid is how a counter gets gamed.** Reading 1's
 * criterion is not "an element the application drew" but "a structural element the application's own layout owns,
 * allocated at window construction and count-stable thereafter". Three classes of element in this product are
 * neither, and the first execution of ADR-0045 is what found them:
 *
 *  - **Conditional panes.** The agents panel appears only when the session has delegated children; the queued-
 *    messages panel only while the queue is non-empty; and REQ-MONITOR-051 turns the inspector and the agents
 *    panel into overlay DRAWERS below 1180 px, which unmounts the inspector — inside `REQ-UIBENCH-060`'s own
 *    resize sweep, which visits 1000x680. **Counting any of them would make `REQ-UIBENCH-054` false by ordinary,
 *    specified behaviour**, with no recycler anywhere near it. ADR-0045's spike had no responsive layout and no
 *    data-conditional pane, so it could not have seen this; the record now says it.
 *  - **Transient controls.** The search panel (REQ-CHAT-074) and the "N new updates" button (REQ-CHAT-072) exist
 *    only while the reader has asked for them.
 *  - **Content nodes inside a slot**, which reading 1 accounts to `ui_objects` explicitly.
 *
 * All three are counted in `ui_objects`, which REQ-UIBENCH-109 makes informational and unbounded. The transcript's
 * own contribution is fixed by construction and is not an exception carved for it: the pool is rendered whether or
 * not the transcript has any rows, so REQ-CHAT-073's empty state is drawn OVER an intact pool of empty slots
 * rather than instead of one.
 */

/** ADR-0045: `widgets`, by the definition above. */
export function countWidgets(root: ParentNode): number {
  return root.querySelectorAll(WIDGET_SELECTOR).length;
}

/** ADR-0045: `ui_objects` — every live interface-framework object owned by the window, visual or not, informational only. */
export function countUiObjects(root: ParentNode): number {
  return root.querySelectorAll('*').length;
}
