import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';
import * as domain from '../js/domain/model.js';
import * as state from '../js/state.js';

test('public model helpers retain identity and return independent defaults', () => {
  for (const key of ['createDefaultLevels', 'normalizeLoadCase', 'normalizeLoadFactors', 'normalizeAxisEntry',
    'stripSurfaceFieldsForType', 'sanitizeRoofGroupId', 'normalizeMemberGeometryMode', 'isWallSurfaceType', 'isRoofSurfaceType']) {
    assert.equal(state[key], domain[key]);
  }
  const first = domain.createDefaultLoadCombinations(); first[0].factors.DL = 99;
  assert.equal(domain.createDefaultLoadCombinations()[0].factors.DL, 1);
});

test('state dependency graph contains no import cycle and domain never imports state/UI', async () => {
  const visiting = new Set(), visited = new Set();
  async function visit(url) {
    assert.equal(visiting.has(url.href), false, `Import cycle at ${url.pathname}`);
    if (visited.has(url.href)) return;
    visiting.add(url.href);
    const source = await readFile(url, 'utf8');
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    for (const node of ast.body) {
      if (!node.source?.value.startsWith('.')) continue;
      const imported = new URL(node.source.value, url);
      if (url.pathname.includes('/domain/')) {
        assert.ok(!imported.pathname.endsWith('/state.js') && !imported.pathname.includes('/ui/'));
      }
      await visit(imported);
    }
    visiting.delete(url.href); visited.add(url.href);
  }
  await visit(new URL('../js/state.js', import.meta.url));
});
