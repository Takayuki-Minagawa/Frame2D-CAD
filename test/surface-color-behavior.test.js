import { uiHarness } from './helpers/ui-harness.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { AppState } from '../js/state.js';
import {
  defaultSurfaceColorForType,
  isHexColor,
  resolveSurfaceColor,
} from '../js/element-style.js';

test('surface color helpers resolve explicit and fallback colors', () => {
  assert.equal(isHexColor('#112233'), true);
  assert.equal(isHexColor('#ABCDEF'), true);
  assert.equal(isHexColor('#12345'), false);

  assert.equal(defaultSurfaceColorForType('floor'), '#67a9cf');
  assert.equal(defaultSurfaceColorForType('wall'), '#b57a6b');
  assert.equal(defaultSurfaceColorForType('exteriorWall'), '#b57a6b');
  assert.equal(defaultSurfaceColorForType('roof'), '#8b6f47');
  assert.equal(defaultSurfaceColorForType('eave'), '#4f9a8a');
  assert.equal(defaultSurfaceColorForType('gableWall'), '#bf6f5e');

  assert.equal(resolveSurfaceColor({ type: 'floor', color: '#224466' }), '#224466');
  assert.equal(resolveSurfaceColor({ type: 'floor', color: '' }), '#67a9cf');
  assert.equal(resolveSurfaceColor({ type: 'wall', color: null }), '#b57a6b');
});

test('surface section changes produce colors that are resolved consistently', () => {
  const state = new AppState();
  state.addSection({
    target: 'surface',
    type: 'wall',
    name: 'W_BLUE',
    color: '#1144aa',
  });

  const wall = state.addSurfaceRect(0, 0, 3000, 2000, { type: 'wall' });
  assert.equal(resolveSurfaceColor(wall), '#b57a6b');

  state.updateSurface(wall.id, { sectionName: 'W_BLUE' });
  assert.equal(resolveSurfaceColor(wall), '#1144aa');
});

test('2D/3D renderers both use shared surface color resolver (smoke)', async () => {
  const canvas2dSource = await readFile(new URL('../js/canvas2d.js', import.meta.url), 'utf8');
  const viewer3dSource = await readFile(new URL('../js/viewer3d.js', import.meta.url), 'utf8');

  assert.match(
    canvas2dSource,
    /import\s+\{[^}]*resolveSurfaceColor[^}]*\}\s+from\s+'\.\/element-style\.js';/
  );
  assert.match(
    viewer3dSource,
    /import\s+\{[^}]*resolveSurfaceColor[^}]*\}\s+from\s+'\.\/element-style\.js';/
  );
  assert.match(canvas2dSource, /resolveSurfaceColor\(/);
  assert.match(viewer3dSource, /resolveSurfaceColor\(/);
});

test('gable property inputs preserve zero offsets and reject invalid heights', context => {
  const { ui, state, get, history, container } = uiHarness(context);
  const wall = state.addSurfaceLine(0, 0, 4000, 0, { type: 'gableWall',
    bottomOffset: -1000, topOffset: 2000, gableStartTopOffset: 0, gableEndTopOffset: 2000 });
  state.select('surface', wall.id); ui.updatePropertyPanel();
  assert.equal(get('prop-gable-start-top-offset').value, '0');
  assert.equal(get('prop-wall-top-offset'), null);
  assert.ok(container.innerHTML.includes('風圧'));
  get('prop-gable-bottom-offset').change(3000);
  assert.equal(state.getSurface(wall.id).bottomOffset, -1000);
  assert.equal(history.undoStack.length, 0);
  get('prop-gable-bottom-offset').change(-500);
  assert.equal(state.getSurface(wall.id).bottomOffset, -500);
  assert.equal(state.getSurface(wall.id).gableStartTopOffset, 0);
  assert.equal(history.undoStack.length, 1);
});
