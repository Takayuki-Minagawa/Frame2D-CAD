import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { History } from '../js/history.js';
import { exportJSON, importJSON, exportUserDefs, importUserDefs } from '../js/io.js';
import { applyModelImport } from '../js/persistence/model-import.js';
import { captureSnapshot } from '../js/persistence/snapshot.js';
import { hasProvisionalEdit } from '../js/domain/provisional-edit.js';
import { beginDrag, finishDrag, previewNode } from '../js/tools/drag-edit.js';

// --- Minimal browser shims (Node has Blob/File but no FileReader/document) ---

class FileReaderShim {
  readAsText(blob) {
    blob.text().then(
      text => {
        this.result = text;
        this.onload?.();
      },
      err => {
        this.error = err;
        this.onerror?.();
      }
    );
  }
}

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = FileReaderShim;
}

// Runs fn with a fake document + URL.createObjectURL that capture the Blob a
// download-anchor export would hand to the browser. Restores globals after.
function withExportCapture(fn) {
  const captured = { blobs: [], downloads: [] };
  const hadDocument = 'document' in globalThis;
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  globalThis.document = {
    createElement: () => ({
      click() {
        captured.downloads.push(this.download);
      },
    }),
    body: { appendChild() {}, removeChild() {} },
  };
  URL.createObjectURL = blob => {
    captured.blobs.push(blob);
    return 'blob:mock';
  };
  URL.revokeObjectURL = () => {};

  try {
    return fn(captured);
  } finally {
    if (hadDocument) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
}

function buildSampleState() {
  const state = new AppState();
  const n1 = state.addNode(0, 0);
  const n2 = state.addNode(5000, 0);
  const n3 = state.addNode(5000, 4000);
  state.addMember(n1.id, n2.id, { type: 'beam' });
  state.addMember(n2.id, n3.id, { type: 'beam' });
  state.addSurfacePolygon(
    [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }],
    { type: 'floor' }
  );
  state.addLoad('pointLoad', { x1: 2500, y1: 2000, fz: -10000 });
  return state;
}

// --- importJSON ---

test('exportJSON -> importJSON roundtrip preserves the serialized state', async () => {
  const source = buildSampleState();

  const captured = withExportCapture(cap => {
    exportJSON(source);
    return cap;
  });
  assert.equal(captured.blobs.length, 1);
  assert.equal(captured.blobs[0].type, 'application/json');
  assert.match(captured.downloads[0], /\.json$/);

  const json = await captured.blobs[0].text();
  const target = new AppState();
  const history = new History(target);
  const data = await importJSON(new Blob([json]), target, history);

  assert.equal(data.schemaVersion, source.schemaVersion);
  assert.deepEqual(target.toJSON(), source.toJSON());
  // importJSON saves the pre-import state for undo
  assert.equal(history.undoStack.length, 1);
});

test('importJSON rejects invalid JSON without touching state or history', async () => {
  const state = new AppState();
  const history = new History(state);

  await assert.rejects(importJSON(new Blob(['{not json']), state, history), SyntaxError);
  assert.equal(state.nodes.length, 0);
  assert.equal(history.undoStack.length, 0);
});

test('importJSON rejects unsupported schema versions', async () => {
  const state = new AppState();
  const history = new History(state);
  const future = { ...new AppState().toJSON(), schemaVersion: state.schemaVersion + 1 };

  await assert.rejects(
    importJSON(new Blob([JSON.stringify(future)]), state, history),
    /Unsupported schema version/
  );
});

test('pending import completing during a drag preserves cancellation and redo, then succeeds on retry', async t => {
  const state = new AppState();
  const node = state.addNode(100, 0);
  const history = new History(state);
  history.save();
  state.updateNode(node.id, { x: 200 });
  history.undo();
  const committed = captureSnapshot(state);
  const undo = structuredClone(history.undoStack);
  const redo = structuredClone(history.redoStack);
  const incoming = state.toJSON();
  incoming.meta.name = 'incoming';
  incoming.nodes[0].x = 900;
  const json = JSON.stringify(incoming);
  const file = new Blob([json]);
  let completeRead;
  t.mock.method(file, 'text', () => new Promise(resolve => { completeRead = resolve; }));

  // The read starts before the drag; only its completion races the preview.
  const pending = importJSON(file, state, history);
  const manager = { state, history };
  beginDrag(manager);
  t.after(() => finishDrag(manager, false));
  previewNode(manager, node.id, { x: 500 });
  const preview = captureSnapshot(state);
  const nodes = state.nodes;
  const rejected = assert.rejects(pending, /finish or cancel.*before importing/i);
  completeRead(json);
  await rejected;
  // The shared boundary also protects callers that do not provide History.
  assert.throws(() => applyModelImport(incoming, state), /finish or cancel.*before importing/i);
  assert.deepEqual(captureSnapshot(state), preview);
  assert.equal(state.nodes, nodes);
  assert.deepEqual(history.undoStack, undo);
  assert.deepEqual(history.redoStack, redo);
  assert.equal(hasProvisionalEdit(state), true);

  finishDrag(manager, false);
  assert.equal(hasProvisionalEdit(state), false);
  assert.deepEqual(captureSnapshot(state), committed);
  assert.deepEqual(history.undoStack, undo);
  assert.deepEqual(history.redoStack, redo);
  assert.equal(history.redo(), true);
  assert.equal(state.getNode(node.id).x, 200);
  assert.equal(history.undo(), true);
  assert.equal(state.getNode(node.id).x, 100);

  const beforeRetry = captureSnapshot(state);
  await importJSON(new Blob([json]), state, history);
  assert.equal(state.getNode(node.id).x, 900);
  assert.equal(state.meta.name, 'incoming');
  assert.equal(history.undoStack.length, undo.length + 1);
  assert.equal(history.redoStack.length, 0);
  assert.equal(history.undo(), true);
  assert.deepEqual({ ...captureSnapshot(state).data, revision: beforeRetry.data.revision }, beforeRetry.data);
  assert.equal(history.redo(), true);
  assert.equal(state.getNode(node.id).x, 900);
});

// --- importUserDefs ---

test('importUserDefs rejects files without the userDefinitions flag', async () => {
  const state = new AppState();
  await assert.rejects(
    importUserDefs(new Blob([JSON.stringify({ sections: [] })]), state),
    /Not a user definition file/
  );
});

test('importUserDefs adds custom definitions and skips duplicates and defaults', async () => {
  const state = new AppState();
  const payload = {
    userDefinitions: true,
    materials: [
      { name: 'test-material', E: 123000, G: 47000, density: 4560 },
      { name: 'test-material', E: 123000, G: 47000, density: 4560 }, // duplicate -> skipped
    ],
    sections: [
      { target: 'member', type: 'beam', name: 'TestBeam', b: 150, h: 300 },
      { target: 'member', type: 'beam', name: 'TestBeam', b: 150, h: 300 }, // duplicate -> skipped
      { target: 'member', type: 'beam', name: 'DefaultLike', isDefault: true }, // ignored entirely
    ],
    springs: [
      { symbol: 'K_TEST' },
      { symbol: 'K_TEST' }, // duplicate -> skipped
    ],
  };

  const result = await importUserDefs(new Blob([JSON.stringify(payload)]), state);
  assert.deepEqual(result, { added: 3, skipped: 3 });

  const section = state.sectionCatalog.find(s => s.name === 'TestBeam');
  assert.ok(section);
  assert.equal(section.isDefault, false);
  assert.equal(section.b, 150);
  assert.equal(section.h, 300);
  assert.ok(state.springCatalog.some(s => s.symbol === 'K_TEST' && !s.isDefault));
  assert.equal(state.getMaterial('test-material').density, 4560);
  assert.equal(state.sectionCatalog.some(s => s.name === 'DefaultLike'), false);
});

test('importUserDefs rejects invalid JSON', async () => {
  await assert.rejects(importUserDefs(new Blob(['not json']), new AppState()), SyntaxError);
});

// --- exportUserDefs ---

test('exportUserDefs returns false when only default definitions exist', () => {
  const state = new AppState();
  assert.equal(exportUserDefs(state), false);
});

test('exportUserDefs -> importUserDefs roundtrip restores custom definitions', async () => {
  const source = new AppState();
  assert.ok(source.addSection({ target: 'member', type: 'beam', name: 'RoundTripBeam', b: 120, h: 240, memo: 'note' }));
  assert.ok(source.addSpring({ symbol: 'K_RT', memo: 'spring note' }));
  assert.ok(source.addMaterial({ name: 'roundtrip-material', E: 100000, G: 40000, density: 4000 }));

  const captured = withExportCapture(cap => {
    assert.equal(exportUserDefs(source), true);
    return cap;
  });
  assert.equal(captured.blobs.length, 1);
  assert.match(captured.downloads[0], /^user_definitions_.*\.json$/);

  const data = JSON.parse(await captured.blobs[0].text());
  assert.equal(data.userDefinitions, true);
  assert.deepEqual(data.sections.map(s => s.name), ['RoundTripBeam']);
  assert.deepEqual(data.springs.map(s => s.symbol), ['K_RT']);
  assert.deepEqual(data.materials.map(material => material.name), ['roundtrip-material']);
  // Default catalog entries are never exported
  assert.equal(data.sections.some(s => s.isDefault), false);
  assert.equal(data.springs.some(s => s.isDefault), false);
  assert.equal(data.materials.some(material => material.isDefault), false);

  const target = new AppState();
  const result = await importUserDefs(new Blob([JSON.stringify(data)]), target);
  assert.deepEqual(result, { added: 3, skipped: 0 });

  const restored = target.sectionCatalog.find(s => s.name === 'RoundTripBeam');
  const original = source.sectionCatalog.find(s => s.name === 'RoundTripBeam');
  assert.deepEqual(restored, original);
  assert.deepEqual(
    target.springCatalog.find(s => s.symbol === 'K_RT'),
    source.springCatalog.find(s => s.symbol === 'K_RT')
  );
  assert.deepEqual(
    target.getMaterial('roundtrip-material'),
    source.getMaterial('roundtrip-material')
  );
});

function withRedo() {
  const state = buildSampleState();
  state.addSection({ target: 'member', type: 'beam', name: 'unused-local', b: 111, h: 222 });
  state.addSpring({ symbol: 'UNUSED_LOCAL' });
  const history = new History(state);
  history.save();
  state.addNode(9000, 0);
  history.undo();
  state.select('node', state.nodes[0].id);
  state.memberDraftSections.beam = 'unused-local';
  return { state, history };
}

for (const [name, payload] of [
  ['future schema', { schemaVersion: 999 }],
  ['partial-load axes error', { schemaVersion: 13, meta: { name: 'incoming' }, axes: {} }],
  ['non-object root', []],
  ['dangling node reference', { nodes: [{ id: 'N1', x: 0, y: 0 }], members: [{ startNodeId: 'N1', endNodeId: 'missing' }] }],
  ['dangling level reference', { supports: [{ id: 'SUP1', levelId: 'missing' }] }],
  ['duplicate node IDs', { nodes: [{ id: 'N1', x: 0, y: 0 }, { id: 'N1', x: 1, y: 0 }] }],
  ['invalid node ID type', { nodes: [{ id: {}, x: 0, y: 0 }] }],
  ['invalid section definition', { sectionCatalog: [{ name: 'bad' }] }],
  ['invalid spring definition', { springCatalog: [{}] }],
  ['invalid material definition', { materialCatalog: [{}] }],
  ['duplicate catalog definition', { springCatalog: [{ symbol: 'CUSTOM' }, { symbol: 'CUSTOM' }] }],
]) {
  test(`failed import preserves every field, revision, selection and redo: ${name}`, async () => {
    const { state, history } = withRedo();
    const before = structuredClone({ ...state });
    const references = { ...state };
    const undo = structuredClone(history.undoStack);
    const redo = structuredClone(history.redoStack);
    await assert.rejects(importJSON(new Blob([JSON.stringify(payload)]), state, history));
    assert.deepEqual({ ...state }, before);
    for (const key of Object.keys(references)) assert.equal(state[key], references[key]);
    assert.deepEqual(history.undoStack, undo);
    assert.deepEqual(history.redoStack, redo);
  });
}

for (const key of ['levels', 'axes', 'nodes', 'members', 'surfaces', 'loads', 'supports',
  'loadCombinations', 'sectionCatalog', 'springCatalog', 'materialCatalog']) {
  test(`import rejects malformed ${key} arrays and entries atomically`, async () => {
    const { state, history } = withRedo();
    const before = structuredClone({ ...state });
    const redo = structuredClone(history.redoStack);
    for (const value of [{}, 'bad', null, [null], [42]]) {
      await assert.rejects(importJSON(new Blob([JSON.stringify({ [key]: value })]), state, history));
      assert.deepEqual({ ...state }, before);
      assert.deepEqual(history.redoStack, redo);
    }
  });
}

test('CAD import keeps local unused definitions, incoming collisions win, and undo is exact', async () => {
  const { state, history } = withRedo();
  const source = buildSampleState();
  source.addSection({ target: 'member', type: 'beam', name: 'unused-local', b: 333, h: 444 });
  // CAD export normally omits an unused section; explicitly include it here.
  const payload = { ...source.toJSON(), sectionCatalog: source.sectionCatalog };
  const before = structuredClone({ ...state });
  await importJSON(new Blob([JSON.stringify(payload)]), state, history);
  assert.equal(state.sectionCatalog.find(s => s.name === 'unused-local').b, 333);
  assert.ok(state.springCatalog.some(s => s.symbol === 'UNUSED_LOCAL'));
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 0);
  assert.equal(state.selectedNodeId, null);
  history.undo();
  assert.deepEqual({ ...state, revision: before.revision }, before);
  history.redo();
  assert.equal(state.sectionCatalog.find(s => s.name === 'unused-local').b, 333);
});

test('legacy member IDs and section normalization still work through atomic import', async () => {
  const state = new AppState();
  await importJSON(new Blob([JSON.stringify({
    nodes: [{ id: 'N1', x: 0, y: 0 }, { id: 'N2', x: 1000, y: 0 }],
    members: [{ startNodeId: 'N1', endNodeId: 'N2', section: { b: 123, h: 234 }, material: 'steel' }],
  })]), state, new History(state));
  assert.equal(state.members[0].id, 'M1');
  assert.equal(state.members[0].section.b, 123);
});
