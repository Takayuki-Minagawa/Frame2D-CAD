import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { ToolManager } from '../js/tools.js';

test('initial grid frame modal exposes all inputs and actions', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  for (const id of [
    'btn-grid-frame',
    'grid-frame-modal',
    'grid-frame-form',
    'grid-frame-story-heights',
    'grid-frame-spans-x',
    'grid-frame-spans-y',
    'btn-grid-frame-close',
    'btn-grid-frame-cancel',
    'btn-grid-frame-generate',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /data-i18n-placeholder="gridFrameStoryHeightsPlaceholder"/);
  assert.match(html, /data-i18n-placeholder="gridFrameSpansXPlaceholder"/);
  assert.match(html, /data-i18n-placeholder="gridFrameSpansYPlaceholder"/);
});

test('grid frame modal wires validation, replacement, and rollback flow', async () => {
  const source = await readFile(new URL('../js/grid-frame-modal.js', import.meta.url), 'utf8');

  assert.match(source, /parseMmList\(field\.input\.value, \{ maxCount: field\.maxCount \}\)/);
  assert.match(source, /state\.nodes\.length > 0 \|\| state\.members\.length > 0/);
  assert.match(source, /window\.confirm\(t\('gridFrameReplaceConfirm'\)\)/);
  assert.match(source, /generatedModel = buildGridFrame\(values\)/);
  assert.match(source, /history\.save\(\)/);
  assert.match(source, /state\.loadJSON\(generatedModel\)/);
  assert.match(source, /syncSettingsControls\(\)/);
  assert.match(source, /refreshLevelSelectors\(\)/);
  assert.match(source, /history\.undo\(\)/);
  assert.match(source, /gridFrameDone/);
  assert.match(source, /gridFrameTooLarge/);

  assert.ok(
    source.indexOf('generatedModel = buildGridFrame(values)') < source.indexOf('history.save()'),
    'validation/build must finish before history.save() clears redo'
  );
});

test('app wires the grid frame modal and Escape handling', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

  assert.match(source, /import \{ initGridFrameModal \} from '\.\/grid-frame-modal\.js'/);
  assert.match(source, /const gridFrameModal = initGridFrameModal\(\{/);
  assert.match(source, /document\.getElementById\('btn-grid-frame'\).*gridFrameModal\.show/);
  assert.match(source, /gridFrameModal\.applyLanguage\(\)/);
  assert.match(source, /gridFrameModal\.isOpen\(\)/);
  assert.match(source, /gridFrameModal\.hide\(\)/);
  assert.match(source, /history\.setOnRestore\(\(\) => \{/);
  assert.match(source, /syncSettingsControls\(\);\s*ui\.refreshLevelSelectors\(\);/);
});

test('in-app help documents generated and excluded model elements', async () => {
  const source = await readFile(new URL('../js/help-content.js', import.meta.url), 'utf8');

  assert.match(source, /初期モデル生成（格子フレーム）/);
  assert.match(source, /GLの並進3方向を拘束した支点/);
  assert.match(source, /床・荷重・ブレースは生成されません/);
  assert.match(source, /Initial Model Generation \(Grid Frame\)/);
  assert.match(source, /supports restrained in DX\/DY\/DZ at GL/);
  assert.match(source, /Floors, loads, and braces are not generated/);
});

test('text-field undo and redo remain native while the grid modal is being edited', () => {
  let undoCalls = 0;
  let redoCalls = 0;
  let updateCalls = 0;
  let preventDefaultCalls = 0;
  const manager = Object.create(ToolManager.prototype);
  Object.assign(manager, {
    state: { currentTool: 'member' },
    history: {
      undo() { undoCalls++; return true; },
      redo() { redoCalls++; return true; },
    },
    onUpdate() { updateCalls++; },
  });
  const event = (key, shiftKey = false) => ({
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: true,
    metaKey: false,
    shiftKey,
    target: { tagName: 'INPUT', isContentEditable: false },
    preventDefault() { preventDefaultCalls++; },
  });

  manager._onKeyDown(event('z'));
  manager._onKeyDown(event('y'));
  manager._onKeyDown(event('z', true));

  assert.equal(undoCalls, 0);
  assert.equal(redoCalls, 0);
  assert.equal(updateCalls, 0);
  assert.equal(preventDefaultCalls, 0);

  manager._onKeyDown({
    ...event('z'),
    target: { tagName: 'BODY', isContentEditable: false },
  });
  assert.equal(undoCalls, 1);
  assert.equal(updateCalls, 1);
  assert.equal(preventDefaultCalls, 1);
});

test('text-field spaces and Enter are not captured by canvas shortcuts', () => {
  let preventDefaultCalls = 0;
  let finishPolylineCalls = 0;
  const manager = Object.create(ToolManager.prototype);
  Object.assign(manager, {
    state: { currentTool: 'surface', surfaceDraftMode: 'polyline' },
    _spaceDown: false,
    _finishSurfacePolyline() { finishPolylineCalls++; },
  });
  const inputTarget = { tagName: 'INPUT', isContentEditable: false };

  manager._onKeyDown({
    key: ' ',
    code: 'Space',
    target: inputTarget,
    preventDefault() { preventDefaultCalls++; },
  });
  manager._onKeyDown({
    key: 'Enter',
    code: 'Enter',
    target: inputTarget,
    preventDefault() { preventDefaultCalls++; },
  });

  assert.equal(manager._spaceDown, false);
  assert.equal(finishPolylineCalls, 0);
  assert.equal(preventDefaultCalls, 0);

  manager._onKeyDown({
    key: ' ',
    code: 'Space',
    target: { tagName: 'BODY', isContentEditable: false },
    preventDefault() { preventDefaultCalls++; },
  });
  manager._onKeyDown({
    key: 'Enter',
    code: 'Enter',
    target: { tagName: 'BODY', isContentEditable: false },
    preventDefault() { preventDefaultCalls++; },
  });

  assert.equal(manager._spaceDown, true);
  assert.equal(finishPolylineCalls, 1);
  assert.equal(preventDefaultCalls, 1);
});
