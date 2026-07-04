import test from 'node:test';
import assert from 'node:assert/strict';

import { AppState } from '../js/state.js';
import { History } from '../js/history.js';
import { exportJSON, importJSON, exportUserDefs, importUserDefs } from '../js/io.js';

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
  assert.deepEqual(result, { added: 2, skipped: 2 });

  const section = state.sectionCatalog.find(s => s.name === 'TestBeam');
  assert.ok(section);
  assert.equal(section.isDefault, false);
  assert.equal(section.b, 150);
  assert.equal(section.h, 300);
  assert.ok(state.springCatalog.some(s => s.symbol === 'K_TEST' && !s.isDefault));
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
  // Default catalog entries are never exported
  assert.equal(data.sections.some(s => s.isDefault), false);
  assert.equal(data.springs.some(s => s.isDefault), false);

  const target = new AppState();
  const result = await importUserDefs(new Blob([JSON.stringify(data)]), target);
  assert.deepEqual(result, { added: 2, skipped: 0 });

  const restored = target.sectionCatalog.find(s => s.name === 'RoundTripBeam');
  const original = source.sectionCatalog.find(s => s.name === 'RoundTripBeam');
  assert.deepEqual(restored, original);
  assert.deepEqual(
    target.springCatalog.find(s => s.symbol === 'K_RT'),
    source.springCatalog.find(s => s.symbol === 'K_RT')
  );
});
