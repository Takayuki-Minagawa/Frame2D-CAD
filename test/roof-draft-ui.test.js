import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('roof draft toolbar exposes roof group id and passes it into new roof surfaces', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  const toolsSource = await readFile(new URL('../js/tools.js', import.meta.url), 'utf8');

  assert.match(html, /id="label-roof-group-id"/);
  assert.match(html, /id="input-roof-group-id"/);
  assert.match(uiSource, /surfaceDraftRoofGroupId = String\(e\.target\.value \|\| ''\)\.trim\(\) \|\| 'RG1'/);
  assert.match(uiSource, /roofGroupLabel\.style\.display = isRoof \? '' : 'none'/);
  assert.match(uiSource, /groupEl\.value = this\.state\.surfaceDraftRoofGroupId \|\| 'RG1'/);
  assert.match(toolsSource, /options\.roofGroupId = this\.state\.surfaceDraftRoofGroupId \|\| 'RG1'/);
});
