Destructive-action gate (kill agent, delete worktree, discard edits). Composes Dialog conventions: backdrop + esc cancel, cancel on the left, the destructive verb on the right in the danger button.

```jsx
<ConfirmDialog title="Delete worktree feat/parser?" confirmLabel="Delete worktree" onConfirm={del} onCancel={close}>
  Its 2 uncommitted changes will be lost. The branch itself is kept.
</ConfirmDialog>
```

Body copy states the exact consequence with exact numbers — no "Are you sure?".
