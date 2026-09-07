import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('major app flows use notice/inline errors instead of alert dialogs', async () => {
  const sources = {};
  for (const name of ['app.js', 'notice.js', 'side-panels.js', 'user-def-modal.js', 'ui/user-def/form.js', 'ui/user-def/list.js', 'layer-modal.js']) {
    sources[name] = await readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');
  }
  for (const source of Object.values(sources)) {
    assert.doesNotMatch(source, /alert\(/);
  }
  assert.match(sources['app.js'], /showNotice\(/);
  assert.match(sources['app.js'], /buildAnalysisPreflight\(state\)/);
  assert.match(sources['app.js'], /if \(!preflight\.canExport\)/);
  assert.match(sources['app.js'], /preflight\.summary\.warnings \? 'warning' : 'success'/);
  assert.match(sources['notice.js'], /export function showNotice\(/);
  assert.match(sources['ui/user-def/form.js'], /showUserDefFormError\(/);
  assert.match(sources['layer-modal.js'], /showLayerFormError\(/);
});

test('user-def and layer modals include inline error placeholders', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="user-def-form-error"/);
  assert.match(html, /id="layer-form-error"/);
});
