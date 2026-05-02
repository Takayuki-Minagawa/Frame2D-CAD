import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('roof property panel exposes roof group eave generation controls', async () => {
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  const i18nSource = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');

  assert.match(uiSource, /id="prop-roof-eave-depth"/);
  assert.match(uiSource, /id="btn-roof-eaves"/);
  assert.match(uiSource, /addEavesFromRoofGroup\(surface\.roofGroupId \|\| 'RG1',\s*\{ depth \}\)/);
  assert.match(uiSource, /roofGeneratedEaves/);
  assert.match(i18nSource, /roofEaveDepth/);
  assert.match(i18nSource, /roofGenerateEaves/);
  assert.match(i18nSource, /roofGeneratedEaves/);
});

test('roof generation buttons show an explicit notice when nothing is generated', async () => {
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  const i18nSource = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');

  assert.match(uiSource, /_showGenerationNotice\(container,\s*members\.length,\s*'roofGeneratedMembers'\)/);
  assert.match(uiSource, /_showGenerationNotice\(container,\s*members\.length,\s*'roofGeneratedSlopeMembers'\)/);
  assert.match(uiSource, /_showGenerationNotice\(container,\s*members\.length,\s*'roofGeneratedJointMembers'\)/);
  assert.match(uiSource, /_showGenerationNotice\(container,\s*eaves\.length,\s*'roofGeneratedEaves'\)/);
  assert.match(uiSource, /_showGenerationNotice\(container,\s*walls\.length,\s*'roofGeneratedGableWalls'\)/);
  assert.match(uiSource, /count > 0[\s\S]*t\('roofGeneratedNone'\)/);
  assert.match(i18nSource, /roofGeneratedNone/);
});
