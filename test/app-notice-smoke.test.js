import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('major app flows use notice/inline errors instead of alert dialogs', async () => {
  const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /alert\(/);
  assert.match(appSource, /showNotice\(/);
  assert.match(appSource, /showUserDefFormError\(/);
  assert.match(appSource, /showLayerFormError\(/);
});

test('user-def and layer modals include inline error placeholders', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="user-def-form-error"/);
  assert.match(html, /id="layer-form-error"/);
});
