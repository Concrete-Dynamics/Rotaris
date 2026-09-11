import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTodo, filterTodos, nextId, remaining, removeTodo, toggleTodo } from './todos.js';

const sample = () => addTodo(addTodo([], 'write the spec'), 'read the spec');

test('an added todo is appended, trimmed and not done', () => {
  const todos = addTodo([], '  write the spec  ');
  assert.deepEqual(todos, [{ id: 1, title: 'write the spec', done: false }]);
});

test('a blank title adds nothing', () => {
  assert.deepEqual(addTodo([], '   '), []);
});

test('identifiers do not repeat after a removal', () => {
  const todos = removeTodo(sample(), 1);
  assert.equal(nextId(todos), 3);
});

test('toggling flips one todo and leaves the rest alone', () => {
  const todos = toggleTodo(sample(), 2);
  assert.deepEqual(todos.map((todo) => todo.done), [false, true]);
});

test('removing drops exactly one todo', () => {
  assert.deepEqual(removeTodo(sample(), 1).map((todo) => todo.id), [2]);
});

test('the three filters and the remaining count', () => {
  const todos = toggleTodo(sample(), 1);
  assert.equal(filterTodos(todos, 'all').length, 2);
  assert.deepEqual(filterTodos(todos, 'active').map((todo) => todo.id), [2]);
  assert.deepEqual(filterTodos(todos, 'done').map((todo) => todo.id), [1]);
  assert.equal(remaining(todos), 1);
});
