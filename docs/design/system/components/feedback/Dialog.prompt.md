A confirmation or settings modal over a dimmed backdrop.

```jsx
<Dialog title="Discard artifact edits?" actions={<><Button variant="secondary">Cancel</Button><Button variant="danger">Discard</Button></>}>
  Unsaved changes will be lost.
</Dialog>
```

Escape/backdrop-click dismisses; always pair that with a keyboard path.
