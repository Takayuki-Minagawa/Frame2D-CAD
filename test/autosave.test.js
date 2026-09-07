import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from '../js/state.js';
import { History } from '../js/history.js';
import { initAutosave } from '../js/autosave.js';
import { AutosaveConflictError, IndexedDBGenerationStore } from '../js/persistence/indexeddb-store.js';
import { LEGACY_AUTOSAVE_KEY, migrateLegacyAutosave } from '../js/persistence/legacy-migration.js';
import { beginDrag, finishDrag, previewNode } from '../js/tools/drag-edit.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Deterministic store-contract fixture. Native IndexedDB transaction behavior
// is additionally exercised by fixtures/persistence-browser.html.
class MemoryStore {
  entries = [];
  counter = 0;
  fail = null;
  gate = null;
  started = null;
  migrated = new Map();
  async list() { return structuredClone([...this.entries].reverse()); }
  async get(id) { return structuredClone(this.entries.find(e => e.id === id)); }
  async append(entry, { expectedHead }) {
    this.started?.resolve();
    if (this.gate) await this.gate.promise;
    if (this.fail) throw this.fail;
    if ((this.entries.at(-1)?.id ?? null) !== expectedHead) throw new AutosaveConflictError();
    const saved = structuredClone({ ...entry, id: ++this.counter });
    this.entries.push(saved);
    this.entries = this.entries.slice(-5);
    return structuredClone(saved);
  }
  async migrate(entry, source) {
    if (this.migrated.has(source)) return this.get(this.migrated.get(source));
    const saved = await this.append(entry, { expectedHead: this.entries.at(-1)?.id ?? null });
    this.migrated.set(source, saved.id);
    return saved;
  }
}

class Storage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

function setup(t, options = {}) {
  const state = options.state || new AppState();
  const history = new History(state);
  const store = options.store || new MemoryStore();
  const autosave = initAutosave({ state, history, store, storage: null, intervalMs: 0,
    eventTarget: null, documentTarget: null, ...options });
  t.after(() => autosave.stop());
  return { state, history, store, autosave };
}

test('autosave never records provisional drag coordinates, including canceled unsaved work', async t => {
  const { state, history, store, autosave } = setup(t);
  await autosave.ready;
  const node = state.addNode(0, 0);
  const manager = { state, history };
  beginDrag(manager);
  previewNode(manager, node.id, { x: 500 });
  assert.equal(await autosave.saveNow(), null);
  assert.equal(store.entries.length, 0);
  finishDrag(manager, false);
  const saved = await autosave.saveNow();
  assert.equal(saved.data.nodes[0].x, 0);
  beginDrag(manager);
  previewNode(manager, node.id, { x: 700 });
  assert.equal(await autosave.saveNow(), null);
  finishDrag(manager, true);
  assert.equal((await autosave.saveNow()).data.nodes[0].x, 700);
});

test('autosave exposes saving/saved/error, retries failures and retains last success', async t => {
  const statuses = [];
  const errors = [];
  const { state, store, autosave } = setup(t, { onStatus: s => statuses.push(s.status), onError: e => errors.push(e) });
  await autosave.ready;
  state.addNode(0, 0);
  const saved = await autosave.saveNow();
  assert.ok(statuses.includes('saving'));
  assert.equal(autosave.getStatus().status, 'saved');
  assert.equal(autosave.getStatus().lastSavedRevision, state.revision);
  state.addNode(1, 1);
  store.fail = Object.assign(new Error('quota full'), { name: 'QuotaExceededError' });
  await autosave.saveNow();
  await autosave.saveNow();
  assert.equal(errors.length, 1);
  assert.equal(autosave.getStatus().status, 'error');
  assert.equal(autosave.getStatus().lastSavedAt, saved.savedAt);
  assert.equal(autosave.getStatus().lastSavedRevision, saved.revision);
  assert.deepEqual(await store.list(), [saved]);
  store.fail = null;
  await autosave.saveNow();
  assert.equal(autosave.getStatus().status, 'saved');
  assert.equal(autosave.getStatus().dirty, false);
});

test('save-in-flight edits remain dirty and concurrent calls serialize without duplicate snapshots', async t => {
  const { state, store, autosave } = setup(t);
  await autosave.ready;
  state.addNode(0, 0);
  const firstRevision = state.revision;
  store.gate = deferred();
  store.started = deferred();
  const first = autosave.saveNow();
  await store.started.promise;
  state.addNode(2, 2);
  store.gate.resolve();
  const saved = await first;
  assert.equal(saved.revision, firstRevision);
  assert.equal(saved.data.nodes.length, 1);
  assert.equal(autosave.getStatus().status, 'pending');
  assert.equal(autosave.getStatus().dirty, true);
  await Promise.all([autosave.saveNow(), autosave.saveNow(), autosave.saveNow()]);
  assert.equal(store.entries.length, 2);
  assert.equal(store.entries[1].data.nodes.length, 2);
  assert.equal(autosave.getStatus().dirty, false);
});

test('two tabs cannot replace an unseen generation; explicit recovery re-establishes the save head', async t => {
  const store = new MemoryStore();
  const a = setup(t, { store });
  const b = setup(t, { store });
  await Promise.all([a.autosave.ready, b.autosave.ready]);
  a.state.addNode(1, 1);
  b.state.addNode(2, 2);
  const generation = await a.autosave.saveNow();
  assert.equal(await b.autosave.saveNow(), null);
  assert.equal(b.autosave.getStatus().error.name, 'AutosaveConflictError');
  assert.equal(b.state.nodes[0].x, 2);
  assert.equal(store.entries.length, 1);
  await b.autosave.restoreGeneration(generation.id);
  assert.equal(b.state.nodes[0].x, 1);
  b.history.undo(); // The user's previous work remains accessible.
  assert.equal(b.state.nodes[0].x, 2);
  assert.ok(await b.autosave.saveNow());
});

test('restoring a selected generation is atomic, removes later catalogs and adds one undo', async t => {
  const { state, history, autosave, store } = setup(t);
  await autosave.ready;
  state.addNode(0, 0);
  state.addSection({ target: 'member', type: 'beam', name: 'saved-unused', b: 123, h: 234 });
  const saved = await autosave.saveNow();
  state.addNode(100, 100);
  state.addSpring({ symbol: 'later' });
  state.select('node', state.nodes[1].id);
  const before = structuredClone({ ...state });
  await autosave.restoreGeneration(saved.id);
  assert.equal(state.nodes.length, 1);
  assert.ok(state.sectionCatalog.some(s => s.name === 'saved-unused'));
  assert.equal(state.springCatalog.some(s => s.symbol === 'later'), false);
  assert.equal(history.undoStack.length, 1);
  history.undo();
  assert.deepEqual({ ...state, revision: before.revision }, before);
  const redo = structuredClone(history.redoStack);
  store.entries[0].data.axes = {};
  await assert.rejects(autosave.restoreGeneration(saved.id));
  assert.deepEqual(history.redoStack, redo);
  assert.deepEqual({ ...state, revision: before.revision }, before);
});

test('edits during asynchronous recovery prevent replacing newer user work', async t => {
  const { state, autosave, store, history } = setup(t);
  await autosave.ready;
  state.addNode(0, 0);
  const saved = await autosave.saveNow();
  const gate = deferred();
  store.get = async () => { await gate.promise; return saved; };
  const recovery = autosave.restoreGeneration(saved.id);
  state.addNode(1, 1);
  gate.resolve();
  await assert.rejects(recovery, /Model changed/);
  assert.equal(state.nodes.length, 2);
  assert.equal(history.undoStack.length, 0);
});

test('fresh startup retains prior recovery; a deliberate empty model is saved without clearing older generations', async t => {
  const store = new MemoryStore();
  const previous = new AppState();
  previous.addNode(1, 1);
  await store.append({ data: previous.toJSON(), savedAt: new Date().toISOString() }, { expectedHead: null });
  const { state, autosave } = setup(t, { store });
  await autosave.ready;
  await autosave.saveNow();
  assert.equal(store.entries.length, 1);
  state.addNode(3, 3);
  state.nodes = [];
  state._touch();
  await autosave.saveNow();
  assert.equal(store.entries.length, 2);
  assert.equal(store.entries[1].data.nodes.length, 0);
});

test('autosave off prevents writes; stopping removes handlers and skips queued writes', async t => {
  const eventTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'hidden';
  const { state, autosave, store } = setup(t, { eventTarget, documentTarget });
  await autosave.ready;
  state.updateSetting('autosave', false);
  state.addNode(0, 0);
  assert.equal(await autosave.saveNow(), null);
  assert.equal(autosave.getStatus().status, 'disabled');
  state.updateSetting('autosave', true);
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  // Queue a barrier after the event's save.
  await autosave.saveNow();
  assert.equal(store.entries.length, 1);
  state.addNode(1, 1);
  await autosave.stop();
  eventTarget.dispatchEvent(new Event('pagehide'));
  await autosave.saveNow();
  assert.equal(store.entries.length, 1);
});

test('unavailable IndexedDB reports failure without losing the live model', async t => {
  const { state, autosave } = setup(t, { store: new IndexedDBGenerationStore({ indexedDB: null }) });
  const before = structuredClone({ ...state });
  assert.equal(await autosave.ready, false);
  assert.equal(autosave.getStatus().status, 'error');
  assert.equal(await autosave.saveNow(), null);
  assert.deepEqual({ ...state }, before);
});

test('legacy migration verifies persisted bytes before deleting, and is idempotent after failed verification', async () => {
  const storage = new Storage();
  const store = new MemoryStore();
  const state = new AppState();
  state.addNode(0, 0);
  const source = JSON.stringify({ data: state.toJSON(), savedAt: '2026-09-07T00:00:00.000Z' });
  storage.setItem(LEGACY_AUTOSAVE_KEY, source);
  const get = store.get.bind(store);
  store.get = async () => { throw new Error('read failed'); };
  await assert.rejects(migrateLegacyAutosave({ storage, store, state }), /read failed/);
  assert.equal(storage.getItem(LEGACY_AUTOSAVE_KEY), source);
  assert.equal(store.entries.length, 1);
  store.get = get;
  await migrateLegacyAutosave({ storage, store, state });
  assert.equal(storage.getItem(LEGACY_AUTOSAVE_KEY), null);
  assert.equal(store.entries.length, 1);
});

test('failed or corrupt legacy migration leaves old bytes intact', async () => {
  const storage = new Storage();
  const store = new MemoryStore();
  const state = new AppState();
  for (const source of ['not json', JSON.stringify({ data: { axes: {} }, savedAt: 'bad' })]) {
    storage.setItem(LEGACY_AUTOSAVE_KEY, source);
    await assert.rejects(migrateLegacyAutosave({ storage, store, state }));
    assert.equal(storage.getItem(LEGACY_AUTOSAVE_KEY), source);
    assert.equal(store.entries.length, 0);
  }
  const source = JSON.stringify({ data: state.toJSON(), savedAt: '2026-09-07T00:00:00Z' });
  storage.setItem(LEGACY_AUTOSAVE_KEY, source);
  store.fail = new Error('write failed');
  await assert.rejects(migrateLegacyAutosave({ storage, store, state }), /write failed/);
  assert.equal(storage.getItem(LEGACY_AUTOSAVE_KEY), source);
});

test('concurrent legacy replacement is not deleted by migration', async () => {
  const storage = new Storage();
  const store = new MemoryStore();
  const state = new AppState();
  const source = JSON.stringify({ data: state.toJSON(), savedAt: '2026-09-07T00:00:00Z' });
  storage.setItem(LEGACY_AUTOSAVE_KEY, source);
  const get = store.get.bind(store);
  store.get = async id => { storage.setItem(LEGACY_AUTOSAVE_KEY, 'newer value'); return get(id); };
  await migrateLegacyAutosave({ storage, store, state });
  assert.equal(storage.getItem(LEGACY_AUTOSAVE_KEY), 'newer value');
});

test('first edit reports pending before the first successful save', async t => {
  const { state, autosave } = setup(t);
  await autosave.ready;
  assert.equal(autosave.getStatus().status, 'idle');
  state.addNode(1, 1);
  assert.equal(autosave.getStatus().status, 'pending');
  assert.equal(autosave.getStatus().lastSavedAt, null);
});
