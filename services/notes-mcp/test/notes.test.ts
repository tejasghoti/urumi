import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createNotesStore, TOOLS } from '../src/server.js';

describe('notes-mcp', () => {
  test('TOOLS list contains exact required names', () => {
    const names = TOOLS.map((t) => t.name).sort();
    assert.deepEqual(names, ['add_note', 'get_note', 'list_notes']);
  });

  test('Store starts with seeded Shipping policy and Returns notes', () => {
    const store = createNotesStore();
    const list = store.listNotes();
    assert.equal(list.length, 2);
    assert.equal(list[0].title, 'Shipping policy');
    assert.equal(list[1].title, 'Returns');

    const note1 = store.getNote(1);
    assert.ok(note1);
    assert.match(note1.body, /COD only/);

    const note2 = store.getNote(2);
    assert.ok(note2);
    assert.match(note2.body, /30 days/);
  });

  test('addNote creates new note with incrementing ID', () => {
    const store = createNotesStore();
    const added = store.addNote('New Policy', 'Policy details');
    assert.equal(added.id, 3);
    assert.equal(added.title, 'New Policy');
    assert.equal(store.listNotes().length, 3);
  });
});
