import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameScheduler } from '../js/render/frame-scheduler.js';
import { RenderIndex, selectedElements } from '../js/render/model-index.js';
import { clippingEquation, isVisibleHit } from '../js/render/clipping.js';
import { AppState } from '../js/state.js';

export function fakeFrames() {
  let next = 0;
  const pending = new Map();
  return {
    pending,
    request: callback => { pending.set(++next, callback); return next; },
    cancel: id => pending.delete(id),
    flush() { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(); },
  };
}

test('frame bursts coalesce, damping terminates, hidden invalidations wait, disposal cancels', () => {
  const frames = fakeFrames();
  let count = 0;
  const scheduler = new FrameScheduler(() => { count++; if (count < 3) scheduler.invalidate(); }, frames);
  for (let i = 0; i < 100; i++) scheduler.invalidate();
  assert.equal(frames.pending.size, 1);
  frames.flush(); frames.flush(); frames.flush();
  assert.equal(count, 3); assert.equal(frames.pending.size, 0);
  scheduler.invalidate(); scheduler.setActive(false);
  assert.equal(frames.pending.size, 0);
  scheduler.invalidate(); assert.equal(frames.pending.size, 0);
  scheduler.setActive(true); assert.equal(frames.pending.size, 1);
  scheduler.dispose(); frames.flush(); scheduler.invalidate();
  assert.equal(count, 3); assert.equal(frames.pending.size, 0);
});

test('render indexes track node edits, deletes and same-revision array replacement', () => {
  const state = new AppState();
  const index = new RenderIndex();
  const node = state.addNode(100, 200);
  index.update(state);
  assert.equal(index.nodesById.get(node.id), node);
  const map = index.nodesById;
  state.select('node', node.id);
  assert.equal(index.update(state), false);
  assert.equal(index.nodesById, map);
  state.nodes = [{ id: node.id, x: 400, y: 500 }]; // undo/import replacement
  assert.equal(index.update(state), true);
  assert.equal(index.nodesById.get(node.id).x, 400);
  state.nodes.splice(0, 1);
  index.update(state);
  assert.equal(index.nodesById.has(node.id), false);
  state.nodes.push({ id: 'replacement', x: 0, y: 0 });
  index.update(state);
  state.nodes[0] = { id: 'forced', x: 0, y: 0 };
  index.update(state, true);
  assert.equal(index.nodesById.has('replacement'), false);
  assert.equal(index.nodesById.has('forced'), true);
});

test('selection index includes multi-members and all supported element kinds', () => {
  const picks = selectedElements({ selectedMemberIds: ['M1', 'M2'], selectedMemberId: 'M1', selectedLoadId: 'P1' });
  assert.deepEqual([...picks.keys()], ['member:M1', 'member:M2', 'load:P1']);
});

test('clipping converts CAD axes and both sides consistently with scene mapping', () => {
  for (const axis of ['X', 'Y', 'Z']) for (const flipped of [false, true]) {
    const equation = clippingEquation(axis, 1000, flipped);
    const plane = { distanceToPoint: p => equation.normal.reduce((sum, n, i) => sum + n * p[i], equation.constant) };
    for (const value of [0.5, 1, 1.5]) {
      const p = axis === 'X' ? [value, 0, 0] : axis === 'Y' ? [0, 0, -value] : [0, value, 0];
      assert.equal(isVisibleHit({ point: p, object: { visible: true } }, plane), flipped ? value >= 1 : value <= 1);
    }
  }
  assert.equal(isVisibleHit({ object: { visible: true, parent: { visible: false } } }), false);
  assert.throws(() => clippingEquation('Q', 0));
  assert.throws(() => clippingEquation('Z', NaN));
});
