import { useState, type KeyboardEvent } from 'react';
import type { TaskPlan } from '@rotaris/contracts';

export interface TodoEdit {
  readonly op: 'add' | 'update' | 'remove';
  readonly id?: string;
  readonly text?: string;
  readonly phaseId?: string;
  readonly source: TaskPlan['source'];
  readonly ownerId: string | null;
}

export interface TodoPaneProps {
  readonly plan: TaskPlan | null;
  readonly onEdit?: ((edit: TodoEdit) => Promise<{ ok: true; value?: string } | { ok: false; reason: string }>) | undefined;
  readonly onError?: ((message: string) => void) | undefined;
}

const GLYPH = { done: '✓', active: '◌', open: '○', abandoned: '⊘' } as const;
let nextLocalId = 1;

export function todoCountLabel(done: number, total: number): string {
  return `${done} of ${total} ${total === 1 ? 'task' : 'tasks'} done`;
}

export function TodoPane({ plan, onEdit, onError }: TodoPaneProps) {
  const fingerprint = JSON.stringify(plan);
  const [seen, setSeen] = useState(fingerprint);
  const [shown, setShown] = useState(plan);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  if (seen !== fingerprint) {
    setSeen(fingerprint);
    setShown(plan);
  }

  const tasks = shown?.phases.flatMap((phase) => phase.tasks) ?? [];
  const done = tasks.filter((task) => task.state === 'done').length;
  const fail = (message: string) => {
    setShown(plan);
    onError?.(message);
  };
  const edit = async (request: TodoEdit): Promise<{ ok: true; value?: string } | { ok: false; reason: string }> => onEdit?.(request) ?? { ok: true };

  const commitRename = async (id: string) => {
    const current = shown?.phases.flatMap((phase) => phase.tasks).find((task) => task.id === id);
    const body = renameText.trim();
    setRenaming(null);
    if (!shown || !current || body === '' || body === current.text) return;
    setShown({ ...shown, phases: shown.phases.map((phase) => ({ ...phase, tasks: phase.tasks.map((task) => task.id === id ? { ...task, text: body } : task) })) });
    const result = await edit({ op: 'update', id, text: body, source: shown.source, ownerId: shown.ownerId });
    if (!result.ok) fail(result.reason || 'Todo editing is not ready for this active run yet.');
  };

  const remove = async (id: string) => {
    if (!shown) return;
    setShown({ ...shown, phases: shown.phases.map((phase) => ({ ...phase, tasks: phase.tasks.filter((task) => task.id !== id) })) });
    const result = await edit({ op: 'remove', id, source: shown.source, ownerId: shown.ownerId });
    if (!result.ok) fail(result.reason || 'Todo editing is not ready for this active run yet.');
  };

  const commitAdd = async (phaseId: string) => {
    const body = addText.trim();
    setAdding(null);
    setAddText('');
    if (!shown || body === '') return;
    const localId = `local-${nextLocalId++}`;
    setShown({ ...shown, phases: shown.phases.map((phase) => phase.id === phaseId ? { ...phase, tasks: [...phase.tasks, { id: localId, text: body, state: 'open' as const }] } : phase) });
    const result = await edit({ op: 'add', text: body, phaseId, source: shown.source, ownerId: shown.ownerId });
    if (!result.ok) { fail(result.reason || 'Todo editing is not ready for this active run yet.'); return; }
    if (result.value) setShown((current) => current === null ? current : { ...current, phases: current.phases.map((phase) => ({ ...phase, tasks: phase.tasks.map((task) => task.id === localId ? { ...task, id: result.value! } : task) })) });
  };

  const editorKey = (event: KeyboardEvent<HTMLInputElement>, commit: () => void, cancel: () => void) => {
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
  };

  return (
    <section className="todo-pane" aria-label="Task plan" data-source={shown?.source ?? 'none'}>
      <div className="todo-pane__header">
        <span className="todo-pane__title">Task plan</span>
        <span className="todo-pane__count">{todoCountLabel(done, tasks.length)}</span>
      </div>
      {shown && <div className="todo-pane__source">{shown.sourceLabel}</div>}
      {tasks.length === 0 && (
        <div className="todo-pane__empty">
          <strong>No task plan</strong>
          <span>Agent-created tasks will appear during a run.</span>
        </div>
      )}
      {shown?.phases.map((phase, phaseIndex) => (
        <div className="todo-phase" key={phase.id}>
          <div className="todo-phase__kicker mono">{(phase.name || phase.id || `Phase ${phaseIndex + 1}`).toUpperCase()}</div>
          {phase.tasks.map((task) => (
            <div className={`todo-task todo-task--${task.state}`} key={task.id} data-task-id={task.id}>
              <span className="todo-task__glyph" aria-label={task.state}>{GLYPH[task.state]}</span>
              {renaming === task.id ? (
                <input className="input todo-task__editor" aria-label={`Rename task ${task.text}`} value={renameText} autoFocus
                  onChange={(event) => setRenameText(event.currentTarget.value)} onBlur={() => { void commitRename(task.id); }}
                  onKeyDown={(event) => editorKey(event, () => { void commitRename(task.id); }, () => setRenaming(null))} />
              ) : (
                <button type="button" className="todo-task__text" title="Click text to rename" aria-label={`${task.text}, click to rename`}
                  onClick={() => { setRenaming(task.id); setRenameText(task.text); }}>{task.text}</button>
              )}
              <button type="button" className="todo-task__remove" aria-label={`Remove ${task.text}`} title="Remove task" onClick={() => { void remove(task.id); }}>×</button>
            </div>
          ))}
          {adding === phase.id ? (
            <input className="input todo-task__editor todo-task__editor--add" placeholder="Task name" aria-label="New task name" value={addText} autoFocus
              onChange={(event) => setAddText(event.currentTarget.value)} onBlur={() => { void commitAdd(phase.id); }}
              onKeyDown={(event) => editorKey(event, () => { void commitAdd(phase.id); }, () => { setAdding(null); setAddText(''); })} />
          ) : (
            <button type="button" className="todo-phase__add" onClick={() => { setAdding(phase.id); setAddText(''); }}>+ Add task</button>
          )}
        </div>
      ))}
    </section>
  );
}
