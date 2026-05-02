import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('surface property panel exposes roof plane auto generation controls', async () => {
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  const i18nSource = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(uiSource, /const canGenerateRoof = \(surface\.type === 'floor' \|\| surface\.type === 'exteriorWall'\) && surface\.shape !== 'line'/);
  assert.match(uiSource, /id="prop-auto-roof-pattern"/);
  assert.match(uiSource, /id="btn-auto-roof-planes"/);
  assert.match(uiSource, /addRoofPlanesFromSurface\(surface\.id,\s*\{/);
  assert.match(uiSource, /roofGeneratedPlanes/);
  assert.match(i18nSource, /roofAutoGenerate/);
  assert.match(i18nSource, /roofPatternGableX/);
  assert.match(i18nSource, /roofPatternHip/);
  assert.match(readme, /屋根面を自動生成/);
});

test('roof property panel exposes group validation and regeneration controls', async () => {
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  const i18nSource = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(uiSource, /id="btn-roof-validate-group"/);
  assert.match(uiSource, /validateRoofGroup\(surface\.roofGroupId \|\| 'RG1'\)/);
  assert.match(uiSource, /id="btn-roof-remove-generated"/);
  assert.match(uiSource, /removeRoofGeneratedElements\(surface\.roofGroupId \|\| 'RG1'\)/);
  assert.match(uiSource, /id="btn-roof-regenerate"/);
  assert.match(uiSource, /regenerateRoofGeneratedElements\(surface\.roofGroupId \|\| 'RG1'/);
  assert.match(i18nSource, /roofValidateGroup/);
  assert.match(i18nSource, /roofRegenerateGenerated/);
  assert.match(readme, /生成要素削除/);
});
