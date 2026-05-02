import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('README and in-app help document the roof workflow', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const i18n = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');

  assert.match(readme, /## Roof Workflow/);
  assert.match(readme, /roofGroupId/);
  assert.match(readme, /棟\/谷\/隅木/);
  assert.match(readme, /屋根部材の役割別本数・延長/);

  assert.match(i18n, /<h3>屋根入力ワークフロー<\/h3>/);
  assert.match(i18n, /<h3>Roof Workflow<\/h3>/);
  assert.match(i18n, /roofGroupId/);
  assert.match(i18n, /Generate ridge\/valley\/hip members/);
  assert.match(i18n, /数量集計で投影面積、地震用重量、屋根部材の役割別延長/);
});
