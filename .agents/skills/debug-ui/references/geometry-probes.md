# Geometry probes

Run probes through `pnpm app:drive eval`. Return `JSON.stringify(...)` so values cross the driver seam.

## Box and text fit

```js
JSON.stringify([...document.querySelectorAll('[data-ui]')].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.dataset.ui, x: r.x, y: r.y, width: r.width, height: r.height,
    scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}))
```

## Hit test

```js
JSON.stringify((() => {
  const el = document.querySelector('[data-ui="target"]');
  const r = el.getBoundingClientRect();
  const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return { x, y, topmost: hit === el || el.contains(hit), hit: hit?.className ?? hit?.tagName };
})())
```

## Guards

- Closed `details` content retains boxes while remaining unpainted.
- A scrolled child may have a box outside its clipping ancestor.
- Fixed descendants use the viewport until an ancestor establishes a containing block through transform, filter, perspective, will-change, or contain.
- A maximized window must leave maximized state before a requested content resize can take effect.
- A sweep with zero tested controls is a finding about evidence coverage.
- **A screenshot can be older than the state it is supposed to show.** `capturePage` answers with the last composited frame, and an occluded window composites nothing, so a capture can succeed and be a photograph of an earlier moment. When consecutive captures must differ, compare their bytes; one pixel of resize and back forces a frame. Found 2026-09-12, after thirty-two identical frames read as "no control paints a focus ring".
- **Settling is a loop, not a step.** A surface that mounts during the wait — the startup notice does — begins animating after `document.getAnimations()` has already been read. Re-read until nothing finite is running, and record per element whether it was still moving, so a string photographed mid-fade is reported as skipped rather than as a contrast failure.
- A control marked `aria-disabled` wears the disabled colour and answers to the disabled floor; a check that reads `:disabled` alone holds it to the enabled one.
- **`min-height` on a flex child is a limit, not a floor.** Every view here is a `flex-direction: column` box, so its children carry the default `flex-shrink: 1`: when content exceeds a short window the column takes the difference out of whichever child will give, down to its `min-height`. The box ends up smaller than what it holds while the content keeps its size — `clientHeight` 56 around a `scrollHeight` of 76 — and because the box does not scroll **nothing is clipped**: the remainder pays out past the edge, where the next sibling's background covers it. A control can end up drawn with three of its four borders. `flex: 0 0 auto` is the repair for anything that must show its content; reach for it before theorising about the wrapping you can see in the capture.
- **An ancestor's scroll is not an excuse.** A shrunk box inside an `overflow: auto` parent looks reachable and is not: the overflowing content does extend the ancestor's scroll height, and scrolling reveals nothing, because whatever paints next paints over it. Judge the box, not its ancestry.
- **`align-self: stretch` can collapse the parent it was meant to measure.** Equalising the nav rail's items that way did give all seven one width and one x — and the rail then resolved to its `min-width` rather than to its longest label, clipping "Requirements" at 57px of content in a 54px box. When a parent is `width: max-content`, stretching its children removes the contribution that made it wide.
- **An opt-in assertion catches nothing where nobody published it.** `text-fit` had asked this exact question since the contracts were written and no page header had ever carried one. Prefer a sweep over every marked box to a relation each component must remember to declare.
