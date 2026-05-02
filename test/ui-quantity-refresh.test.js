import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('property panel refreshes quantity summary through a model signature cache', async () => {
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');

  assert.match(uiSource, /this\._quantitySummaryLastKey = null;/);
  assert.match(uiSource, /updatePropertyPanel\(\)\s*\{\s*this\.refreshQuantitySummary\(\);/);
  assert.match(uiSource, /if \(!force && key === this\._quantitySummaryLastKey\) return;/);
  assert.match(uiSource, /levels:\s*this\.state\.levels/);
  assert.match(uiSource, /members:\s*this\.state\.members/);
  assert.match(uiSource, /surfaces:\s*this\.state\.surfaces/);
  assert.match(uiSource, /this\.refreshQuantitySummary\(\{ force: true \}\);/);
});
