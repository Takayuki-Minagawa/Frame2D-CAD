import test from 'node:test';
import assert from 'node:assert/strict';
import { uiHarness } from './helpers/ui-harness.js';
import { UI } from '../js/ui.js';
import { t } from '../js/i18n.js';

function beam(state) {
  const a = state.addNode(0, 0), b = state.addNode(1000, 0);
  return state.addMember(a.id, b.id);
}

test('property edits produce one undo step; unchanged inputs and presets preserve redo', context => {
  const { ui, state, history, get } = uiHarness(context);
  const support = state.addSupport(100, 200);
  state.select('support', support.id); ui.updatePropertyPanel();
  const initialRevision = state.revision;
  get('prop-sup-x').change(100);
  assert.equal(history.undoStack.length, 0);
  assert.equal(state.revision, initialRevision);
  get('prop-sup-x').change(300);
  assert.equal(history.undoStack.length, 1);
  assert.equal(state.getSupport(support.id).x, 300);
  history.undo(); ui.updatePropertyPanel();
  assert.equal(state.getSupport(support.id).x, 100);
  get('btn-sup-pin').click();
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);
});

test('member coordinates, load properties and batch edits use the shared command boundary', context => {
  const { ui, state, history, get } = uiHarness(context);
  const member = beam(state);
  state.select('member', member.id); ui.updatePropertyPanel();
  get('prop-start-x').change(250);
  assert.equal(state.getNode(member.startNodeId).x, 250);
  assert.equal(history.undoStack.length, 1);
  const load = state.addLoad('pointLoad', { x1: 0, y1: 0 });
  state.select('load', load.id); ui.updatePropertyPanel();
  get('prop-ld-fz').change(-200);
  assert.equal(state.getLoad(load.id).fz, -200);
  assert.equal(history.undoStack.length, 2);
  const second = beam(state);
  state.selectMembers([member.id, second.id]); ui.updatePropertyPanel();
  get('btn-batch-apply-section').click();
  assert.equal(history.undoStack.length, 2);
  get('btn-batch-delete').click();
  assert.equal(state.members.length, 0);
  assert.equal(history.undoStack.length, 3);
  history.undo(); assert.equal(state.members.length, 2);
});

test('pointer-only refresh preserves controls, selection and model revision invalidate them', context => {
  const { ui, state, get, history } = uiHarness(context);
  const member = beam(state);
  state.select('member', member.id); ui.updatePropertyPanel();
  const input = get('prop-start-x'); input.value = '123 unfinished';
  ui.updatePropertyPanel();
  assert.equal(get('prop-start-x'), input);
  assert.equal(get('prop-start-x').value, '123 unfinished');
  history.save(); state.updateNode(member.startNodeId, { x: 500 }); ui.updatePropertyPanel();
  assert.notEqual(get('prop-start-x'), input);
  assert.equal(get('prop-start-x').value, '500');
  history.undo(); ui.updatePropertyPanel(); assert.equal(get('prop-start-x').value, '0');
  state.clearSelection(); ui.updatePropertyPanel(); assert.equal(get('prop-start-x'), null);
});

test('normalized no-op notifications see the final revision and do not poison panel or quantity caches', context => {
  const { ui, state, history, get } = uiHarness(context);
  const member = beam(state);
  state.select('member', member.id);
  // Exercise the real quantity cache as well as the property-panel cache.
  ui.refreshQuantitySummary = UI.prototype.refreshQuantitySummary;
  const quantityRevisions = [];
  ui._renderQuantitySummary = () => quantityRevisions.push(state.revision);
  const notifications = [];
  ui.callbacks.onPropertyChange = id => {
    notifications.push({ id, revision: state.revision, undo: history.undoStack.length, redo: history.redoStack.length });
    ui.updatePropertyPanel();
  };
  history.save(); state.updateNode(member.endNodeId, { x: 2000 }); history.undo();
  ui.updatePropertyPanel();
  const revision = state.revision;
  get('prop-end-x').change('1000.0');
  assert.deepEqual(notifications, [{ id: member.id, revision, undo: 0, redo: 1 }]);
  assert.deepEqual(quantityRevisions, [revision]);

  get('prop-endi-condition').change('spring');
  assert.equal(state.getMember(member.id).endI.condition, 'spring');
  assert.ok(get('prop-endi-spring'), 'the new spring condition must expose its selector');
  assert.deepEqual(notifications[1], { id: member.id, revision: state.revision, undo: 1, redo: 0 });
  assert.deepEqual(quantityRevisions, [revision, state.revision]);
  history.undo(); ui.updatePropertyPanel();
  assert.equal(get('prop-endi-spring'), null);
  history.redo(); ui.updatePropertyPanel();
  assert.ok(get('prop-endi-spring'));
});

test('surface, load and support notifications run after history commits', context => {
  const { ui, state, history, get } = uiHarness(context);
  const surface = state.addSurfaceRect(0, 0, 2000, 1000, { type: 'floor' });
  const load = state.addLoad('pointLoad', { x1: 0, y1: 0 });
  const support = state.addSupport(100, 200);
  const notifications = [];
  ui.callbacks.onPropertyChange = id => {
    notifications.push({ id, revision: state.revision, undo: history.undoStack.length });
    ui.updatePropertyPanel();
  };
  for (const [kind, item, edit] of [
    ['surface', surface, () => get('prop-surface-unit-weight').change(200)],
    ['load', load, () => get('prop-ld-fz').change(-200)],
    ['support', support, () => get('btn-sup-rigid').click()],
  ]) {
    state.select(kind, item.id); ui.updatePropertyPanel();
    const undo = history.undoStack.length;
    edit();
    assert.equal(history.undoStack.length, undo + 1);
    assert.deepEqual(notifications.at(-1), { id: item.id, revision: state.revision, undo: undo + 1 });
  }
  assert.equal(notifications.length, 3);
  assert.equal(get('prop-sup-rx').checked, true);
});

test('deferred roof generation notices survive the parent property-panel refresh', context => {
  const { ui, state, history, get, container } = uiHarness(context);
  const roof = state.addSurfaceRect(0, 0, 6000, 4000, { type: 'roof' });
  ui.callbacks.onPropertyChange = () => ui.updatePropertyPanel();
  state.select('surface', roof.id); ui.updatePropertyPanel();
  get('btn-roof-eaves').click();
  const count = state.surfaces.filter(surface => surface.type === 'eave').length;
  assert.ok(count > 0);
  assert.equal(history.undoStack.length, 1);
  assert.equal(container.children.at(-1).textContent, t('roofGeneratedEaves', { n: count }));
  get('btn-roof-eaves').click();
  assert.equal(history.undoStack.length, 1);
  assert.equal(container.children.at(-1).textContent, t('roofGeneratedNone'));
});

test('failed nested property edits roll back without notifying and leave the next command usable', context => {
  const { ui, state, history, container } = uiHarness(context);
  const support = state.addSupport(100, 200);
  history.save(); state.updateSupport(support.id, { x: 500 }); history.undo();
  state.select('support', support.id); ui.updatePropertyPanel();
  const revision = state.revision;
  const notifications = [];
  ui.callbacks.onPropertyChange = id => {
    notifications.push({ id, x: state.getSupport(id).x, undo: history.undoStack.length });
    ui.updatePropertyPanel();
  };
  assert.throws(() => ui._runModelChange(() => {
    ui._runModelChange(() => {
      state.updateSupport(support.id, { x: 300 });
      ui._notifyPropertyChange(support.id);
      ui._showInlineNotice(container, 'Must not survive rollback');
    });
    throw new Error('Invalid edit');
  }), /Invalid edit/);
  assert.equal(state.getSupport(support.id).x, 100);
  assert.equal(state.revision, revision);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);
  assert.deepEqual(notifications, []);
  assert.ok(container.children.every(child => child.textContent !== 'Must not survive rollback'));

  ui._runModelChange(() => ui._runModelChange(() => {
    state.updateSupport(support.id, { x: 400 });
    ui._notifyPropertyChange(support.id);
  }));
  assert.deepEqual(notifications, [{ id: support.id, x: 400, undo: 1 }]);
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 0);
  history.undo(); assert.equal(state.getSupport(support.id).x, 100);
});

test('panels without a history hook also notify after normalized no-ops finalize', context => {
  const { ui, state, get, history } = uiHarness(context);
  delete ui.callbacks.onModelCommand;
  const member = beam(state);
  state.select('member', member.id); ui.updatePropertyPanel();
  const revisions = [];
  ui.callbacks.onPropertyChange = () => {
    revisions.push(state.revision);
    ui.updatePropertyPanel();
  };
  const revision = state.revision;
  get('prop-end-x').change('1000.0');
  assert.deepEqual(revisions, [revision]);
  get('prop-endi-condition').change('spring');
  assert.ok(get('prop-endi-spring'));
  assert.deepEqual(revisions, [revision, state.revision]);
  assert.equal(history.undoStack.length, 0);
});
