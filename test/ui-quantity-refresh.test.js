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

test('quantity summary renders surface and roof member detail tables', async () => {
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  const i18nSource = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');
  const styleSource = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(uiSource, /const surfaceDetailRows = \(this\.state\.surfaces \|\| \[\]\)/);
  assert.match(uiSource, /computeSurfaceSeismicWeightN\(this\.state,\s*surface\)/);
  assert.match(uiSource, /const roofMemberDetailRows = \(this\.state\.members \|\| \[\]\)/);
  assert.match(uiSource, /computeMemberLengthM\(this\.state,\s*member\)/);
  assert.match(uiSource, /<details class="quantity-detail">/);
  assert.match(i18nSource, /quantitySurfaceDetails/);
  assert.match(i18nSource, /quantityRoofMemberDetails/);
  assert.match(styleSource, /\.quantity-detail-scroll/);
});
