import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('display workflow controls are exposed in the toolbar and property panel', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  for (const id of [
    'sel-display-preset',
    'chk-plan-layer-selection-lock',
    'sel-3d-layer-display-mode',
    'chk-show-members',
    'chk-show-surfaces',
    'chk-show-loads',
    'chk-show-member-end-symbols',
    'chk-show-placement-labels',
    'sel-member-type-filter',
    'sel-section-filter',
    'sel-copy-source-layer',
    'sel-copy-target-layer',
    'btn-copy-level',
    'btn-model-check',
    'model-check-content',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('2D drawing and selection use shared display visibility helpers', async () => {
  const canvasSource = await readFile(new URL('../js/canvas2d.js', import.meta.url), 'utf8');
  const toolsSource = await readFile(new URL('../js/tools.js', import.meta.url), 'utf8');

  assert.match(canvasSource, /isMemberVisible\(m,\s*'2d'\)/);
  assert.match(canvasSource, /isSurfaceVisible\(s,\s*'2d'\)/);
  assert.match(canvasSource, /showMemberEndSymbols/);
  assert.match(canvasSource, /_drawPreviewLabel/);

  assert.match(toolsSource, /isMemberSelectable\(member\)/);
  assert.match(toolsSource, /isSurfaceSelectable\(surface\)/);
  assert.match(toolsSource, /_findSelectableMemberNodeAt/);
});

test('3D viewer uses 3D layer display and element filters', async () => {
  const viewerSource = await readFile(new URL('../js/viewer3d.js', import.meta.url), 'utf8');

  assert.match(viewerSource, /isSurfaceVisible\(s,\s*'3d'\)/);
  assert.match(viewerSource, /isMemberVisible\(m,\s*'3d'\)/);
  assert.match(viewerSource, /getPlanLayerStyle\(m\.levelId,\s*\{\s*view:\s*'3d'\s*\}\)/);
  assert.match(viewerSource, /opacity:\s*0\.35 \* opacityMultiplier/);
});
