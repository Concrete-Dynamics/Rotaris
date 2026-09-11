import { useState } from 'react';
import { addTodo, filterTodos, remaining, removeTodo, toggleTodo } from './todos.js';

const FILTERS = ['all', 'active', 'done'];

export default function App() {
  const [todos, setTodos] = useState([]);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('all');
  const shown = filterTodos(todos, filter);

  return (
    <main className="app">
      <h1>Todo</h1>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          setTodos(addTodo(todos, draft));
          setDraft('');
        }}
      >
        <input aria-label="New todo" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What needs doing?" />
        <button type="submit">Add</button>
      </form>

      <nav className="filters">
        {FILTERS.map((name) => (
          <button key={name} type="button" className={name === filter ? 'active' : ''} onClick={() => setFilter(name)}>
            {name}
          </button>
        ))}
      </nav>

      <ul className="list">
        {shown.map((todo) => (
          <li key={todo.id} className={todo.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={todo.done} onChange={() => setTodos(toggleTodo(todos, todo.id))} />
              {todo.title}
            </label>
            <button type="button" aria-label={`Remove ${todo.title}`} onClick={() => setTodos(removeTodo(todos, todo.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>

      <p className="count">{remaining(todos)} left</p>
    </main>
  );
}
