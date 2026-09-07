import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from '../js/state.js';
import { History } from '../js/history.js';

test('ID lookups build lazily and reuse an index until a public mutation', () => {
  const state = new AppState();
  const a = state.addNode(0, 0), b = state.addNode(1000, 0);
  assert.equal(state._idIndexes, null);
  assert.equal(state.getNode(a.id), a);
  const index = state._idIndexes.get('nodes');
  assert.equal(state.getNode(b.id), b);
  assert.equal(state._idIndexes.get('nodes'), index);
  state.updateNode(a.id, { x: 500 });
  assert.equal(state._idIndexes, null);
  assert.equal(state.getNode(a.id).x, 500);
  assert.notEqual(state._idIndexes.get('nodes'), index);
});

test('direct array replacement, append, splice and ID edits keep lookups correct', () => {
  const state = new AppState();
  const a = state.addNode(0, 0), b = state.addNode(1000, 0);
  state.getNode(a.id);
  state.nodes.push({ id: 100, x: 5, y: 5 });
  assert.equal(state.getNode(100).x, 5);
  state.nodes.splice(0, 1, { id: 200, x: 9, y: 9 });
  assert.equal(state.getNode(a.id), undefined);
  assert.equal(state.getNode(200).x, 9);
  state.nodes[1].id = 300;
  assert.equal(state.getNode(b.id), state.nodes[1]); // b is the same mutable object
  assert.equal(state.getNode(2), undefined);
  state.nodes = [{ id: 300, x: 11, y: 12 }];
  assert.equal(state.getNode(300).x, 11);
  assert.equal(state.getNode('300'), undefined);
});

test('delete, undo, redo, and CAD load discard stale ID entries', () => {
  const state = new AppState(), history = new History(state);
  const a = state.addNode(0, 0), b = state.addNode(1000, 0);
  const member = state.addMember(a.id, b.id);
  state.getMember(member.id); state.getNode(a.id);
  history.save(); state.removeMember(member.id);
  assert.equal(state.getMember(member.id), undefined);
  history.undo();
  assert.equal(state.getMember(member.id).startNodeId, a.id);
  assert.notEqual(state.getMember(member.id), member);
  history.redo(); assert.equal(state.getMember(member.id), undefined);
  state.loadJSON({ schemaVersion: 13, nodes: [{ id: a.id, x: 900, y: 800 }] });
  assert.equal(state.getNode(a.id).x, 900);
  assert.equal(state.getNode(b.id), undefined);
  assert.equal(Object.hasOwn(state.toJSON(), '_idIndexes'), false);
});
