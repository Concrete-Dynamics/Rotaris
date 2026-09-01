The left icon rail present on every screen of the desktop app.

```jsx
<NavRail items={views} active="workspace" onSelect={goToView} />
```

Visual spec: 68px wide, chrome-colored ground with a hairline right border, stacked icon-over-label items in a 9px letter-spaced label. The active item is an accent tint plus accent ink — never a left rule, never a filled block. Icons are Phosphor at 17px.

The rail carries no built-in view list: which views exist, in what order, and under what labels is defined by the product specification (REQ-SHELL-023). Pass `items` accordingly.
