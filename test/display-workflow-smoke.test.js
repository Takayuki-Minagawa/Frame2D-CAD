import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('display workflow controls are exposed in the toolbar and property panel', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const sidePanelsSource = await readFile(new URL('../js/side-panels.js', import.meta.url), 'utf8');

  for (const id of [
    'toolbar-resizer',
    'btn-toggle-toolbar',
    'sel-display-preset',
    'chk-plan-layer-selection-lock',
    'sel-3d-layer-display-mode',
    'sel-beam-3d-section-mode',
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
    'property-resizer',
    'btn-toggle-property',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(css, /grid-template-columns:\s*var\(--toolbar-w\)\s+var\(--side-resizer-w\)\s+1fr\s+var\(--side-resizer-w\)\s+var\(--panel-w\)/);
  assert.match(css, /body\.toolbar-collapsed/);
  assert.match(css, /body\.property-collapsed/);
  assert.match(sidePanelsSource, /lineframe-toolbar-width/);
  assert.match(sidePanelsSource, /lineframe-property-panel-width/);
  assert.match(sidePanelsSource, /pointermove/);
  assert.match(sidePanelsSource, /pointercancel/);
  assert.match(sidePanelsSource, /layoutRefreshQueued/);
  assert.match(sidePanelsSource, /applyPanelWidth\(side,\s*nextWidth,\s*false\)/);
  assert.match(appSource, /canvas2d\.resize\(\)/);
});

test('2D drawing and selection use shared display visibility helpers', async () => {
  const canvasSource = await readFile(new URL('../js/canvas2d.js', import.meta.url), 'utf8');
  const toolsSource = await readFile(new URL('../js/tools.js', import.meta.url), 'utf8');

  assert.match(canvasSource, /isMemberVisible\(m,\s*'2d'\)/);
  assert.match(canvasSource, /isSurfaceVisible\(s,\s*'2d'\)/);
  assert.match(canvasSource, /showMemberEndSymbols/);
  assert.match(canvasSource, /_drawPreviewLabel/);

  assert.match(toolsSource, /isMemberSelectable\(member\)/);
  assert.match(toolsSource, /findSurfaceAt\(x,\s*y,\s*surface => this\.state\.isSurfaceSelectable\(surface\)\)/);
  assert.match(toolsSource, /findMemberAt\(x,\s*y,\s*tolerance,\s*member => this\.state\.isMemberSelectable\(member\)\)/);
  assert.match(toolsSource, /_findSelectableMemberNodeAt/);
  assert.doesNotMatch(toolsSource, /function surfaceHitAt/);
});

test('3D viewer uses 3D layer display and element filters', async () => {
  const viewerSource = await readFile(new URL('../js/viewer3d.js', import.meta.url), 'utf8');

  assert.match(viewerSource, /isSurfaceVisible\(s,\s*'3d'\)/);
  assert.match(viewerSource, /isMemberVisible\(m,\s*'3d'\)/);
  assert.match(viewerSource, /getPlanLayerStyle\(m\.levelId,\s*\{\s*view:\s*'3d'\s*\}\)/);
  // Wall surface opacity (0.35) is applied through a named constant and scaled
  // by the per-layer alpha (opacityMultiplier).
  assert.match(viewerSource, /wall:\s*0\.35/);
  assert.match(viewerSource, /SURFACE_OPACITY\.wall \* opacityMultiplier/);
  assert.match(viewerSource, /_addBeamHSection3D/);
  assert.match(viewerSource, /beam3dSectionMode/);
});
