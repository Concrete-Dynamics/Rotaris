/**
 * The todo list, as pure functions over a plain array. Every function returns a new array; nothing here
 * touches the DOM, the clock or module state, so `node --test src/` runs it with no dependencies installed.
 *
 * A todo is `{ id: number, title: string, done: boolean }`.
 */

/** The next free identifier: one above the largest in use, 1 for an empty list. */
export function nextId(todos) {
  return todos.reduce((highest, todo) => Math.max(highest, todo.id), 0) + 1;
}

/** REQ-101: append a todo with the trimmed title. An empty or blank title adds nothing. */
export function addTodo(todos, title) {
  const trimmed = title.trim();
  if (trimmed === '') return todos;
  return [...todos, { id: nextId(todos), title: trimmed, done: false }];
}

/** REQ-101: flip one todo's done flag. An identifier that is not in the list changes nothing. */
export function toggleTodo(todos, id) {
  return todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
}

/** REQ-101: drop one todo by identifier. */
export function removeTodo(todos, id) {
  return todos.filter((todo) => todo.id !== id);
}

/** REQ-102: the list under one of the three filters. */
export function filterTodos(todos, filter) {
  if (filter === 'active') return todos.filter((todo) => !todo.done);
  if (filter === 'done') return todos.filter((todo) => todo.done);
  return todos;
}

/** REQ-102: how many are still to do. */
export function remaining(todos) {
  return todos.filter((todo) => !todo.done).length;
}
