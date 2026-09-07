import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelFingerprint } from '../js/analysis/fingerprint.js';
import { buildResultView, validateAnalysisResult } from '../js/analysis/results.js';
import { mountResultsPanel, mountLoadPreview } from '../js/analysis/panels.js';
import { previewLineLoad } from '../js/analysis/load-distribution.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/analysis/${name}.json`, import.meta.url)));
const model = () => fixture('rigid-cantilever');
const result = () => fixture('rigid-cantilever-result');

test('real OpenSees fixture fingerprint and exact Hermite cantilever deflection curve', async () => {
  const m = model(), r = result();
  assert.equal(await modelFingerprint(m), r.modelFingerprint);
  const view = await buildResultView(m, r, { scale: 10, segments: 10 });
  const E = 205000, I = m.sections[0].Iy, L = 3000;
  view.members[0].deformed.forEach(([x, _y, z], index) => {
    assert.equal(x, index*300);
    const expected = 10*-1000*x*x*(3*L-x)/(6*E*I);
    assert.ok(Math.abs(z-expected) < 1e-10);
  });
  assert.equal(view.members[0].sourceId, 'DEMO-B1');
  assert.ok(Math.abs(view.reactions[0].reaction[2]-1000) < 1e-8);
});

test('result import rejects stale topology, identity, invalid numerics, equilibrium and units', async () => {
  const mutations = [r => { r.nodes.pop(); }, r => { r.nodes[0].displacement[0] = NaN; },
    r => { r.elements[0].sourceBranch = 'cross'; }, r => { r.elements[0].sourceId = 'wrong'; },
    r => { r.elements[0].localEndForces.pop(); }, r => { r.equilibrium.passed = false; },
    r => { r.equilibrium.residual[0] = 100; }, r => { r.units.translation = 'm'; },
    r => { r.nodes[0].position[0] = 1; }, r => { r.status = 'failed'; }];
  for (const mutate of mutations) {
    const r = result(); mutate(r);
    await assert.rejects(validateAnalysisResult(model(), r));
  }
  const m = model(); m.loads[0].fz = -1001;
  await assert.rejects(validateAnalysisResult(m, result()), /Stale/);
});

test('metadata timestamp/generator do not invalidate results, physical properties and branch edits do', async () => {
  const m = model(), r = result();
  m.meta.generatedAt = 'tomorrow'; m.meta.generator = { appVersion: 'next' };
  await validateAnalysisResult(m, r);
  m.sections[0].Iy += 1;
  await assert.rejects(validateAnalysisResult(m, r), /Stale/);
});

// Minimal DOM with real event lifecycles; no source-string assertions.
class DomNode {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = new Map(); this.attributes = {}; this.style = {}; }
  set textContent(text) { this.text = String(text); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(n => n.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(event, handler) { this.listeners.set(event, handler); }
  removeEventListener(event, handler) { if (this.listeners.get(event) === handler) this.listeners.delete(event); }
  replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
  remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
  find(tag) { return [this, ...this.children.flatMap(n => n.find(tag))].filter(n => n.tag === tag); }
}
function container() {
  const doc = { createElement: tag => new DomNode(tag, doc), createElementNS: (_ns, tag) => new DomNode(tag, doc),
    createTextNode: text => { const node = new DomNode('#text', doc); node.textContent = text; return node; } };
  return doc.createElement('div');
}

test('Japanese result panel renders SVG and reactions, selects source identity, and invalidates/disposes', async () => {
  const root = container(), selected = [];
  const panel = await mountResultsPanel(root, model(), result(), { language: 'ja', onSelect: id => selected.push(id) });
  assert.match(root.textContent, /線形静的解析結果/);
  assert.equal(root.find('svg').length, 1);
  assert.match(root.find('table')[0].textContent, /1000/);
  root.find('button')[0].listeners.get('click')();
  assert.deepEqual(selected, [{ elementId: 1, sourceId: 'DEMO-B1', sourceBranch: 'primary' }]);
  panel.invalidate();
  assert.equal(root.find('svg').length, 0);
  assert.match(root.textContent, /モデルが変更/);
  panel.dispose(); assert.equal(root.children.length, 0);
});

test('Japanese load panel requires explicit lumping acceptance and emits converter-compatible point loads', () => {
  const root = container(), outputs = [];
  const preview = previewLineLoad(model(), { elementId: 1, start: [0, 0, 0], end: [3000, 0, 0], intensity: [0, 0, -1] });
  const panel = mountLoadPreview(root, preview, { language: 'ja', onExport: loads => outputs.push(loads) });
  assert.match(root.textContent, /荷重配分プレビュー/);
  const button = root.find('button').find(n => n.textContent === '配分後の節点荷重を出力');
  button.listeners.get('click')(); assert.equal(outputs.length, 0);
  root.find('input')[0].checked = true;
  button.listeners.get('click')(); assert.equal(outputs[0][1].fz, -1500);
  panel.dispose(); assert.equal(root.children.length, 0);
});

test('SVG engineering projection uses one physical scale in both directions', () => {
  const m = model(); m.nodes[1].y = 3000;
  const root = container();
  const preview = previewLineLoad(m, { elementId: 1, start: [0, 0, 0], end: [3000, 3000, 0], intensity: [0, 0, -1] });
  mountLoadPreview(root, preview);
  const [[x0, y0], [x1, y1]] = root.find('polyline')[0].attributes.points.split(' ').map(p => p.split(',').map(Number));
  assert.equal(Math.abs(x1-x0), Math.abs(y1-y0));
});
