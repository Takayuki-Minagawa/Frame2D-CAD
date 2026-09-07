import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from '../js/state.js';
import { t } from '../js/i18n.js';
import { uiHarness } from './helpers/ui-harness.js';

test('roof eave control uses entered depth and repeated generation reports no-op', context => {
  const { ui, state, get, history, container } = uiHarness(context);
  const roof = state.addSurfaceRect(0, 0, 6000, 4000, { type: 'roof' });
  state.select('surface', roof.id); ui.updatePropertyPanel();
  get('prop-roof-eave-depth').value = '700';
  get('btn-roof-eaves').click();
  assert.equal(state.surfaces.filter(s => s.type === 'eave').length, 4);
  assert.equal(history.undoStack.length, 1);
  get('btn-roof-eaves').click();
  assert.equal(history.undoStack.length, 1);
  assert.equal(container.children.at(-1).textContent, t('roofGeneratedNone'));
});

test('every generation action explains an empty result without adding history', context => {
  const { ui, state, get, history, container } = uiHarness(context);
  const roof = state.addSurfaceRect(0, 0, 6000, 4000, { type: 'roof' });
  for (const method of ['addRoofEdgeMembers', 'addRoofSlopeMembers', 'addRoofJointMembers', 'addEavesFromRoofGroup', 'addGableWallsFromRoofGroup']) context.mock.method(AppState.prototype, method, () => []);
  state.select('surface', roof.id); ui.updatePropertyPanel();
  for (const id of ['btn-roof-edge-members', 'btn-roof-slope-members', 'btn-roof-joint-members', 'btn-roof-eaves', 'btn-roof-gable-walls']) {
    get(id).click();
    assert.equal(container.children.at(-1).textContent, t('roofGeneratedNone'));
    assert.equal(history.undoStack.length, 0);
  }
});
