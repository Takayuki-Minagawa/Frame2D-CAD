import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AppState } from '../js/state.js';
import { History } from '../js/history.js';
import { initUserDefModal } from '../js/user-def-modal.js';

// A small event-capable DOM fixture. Rows are supplied explicitly so assertions
// exercise handlers and real state/history, without depending on a DOM package.
class Element {
  constructor() {
    this.value = '';
    this.style = {};
    this.hidden = false;
    this.dataset = {};
    this.listeners = {};
    this.children = [];
    const classes = new Set();
    this.classList = { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v) };
  }
  set innerHTML(html) {
    this.html = html;
    const options = [...html.matchAll(/<option value="([^"]*)"([^>]*)>/g)];
    if (options.length) this.value = (options.find(o => o[2].includes('selected')) || options[0])[1];
  }
  get innerHTML() { return this.html || ''; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async emit(type, target = this) { for (const fn of this.listeners[type] || []) await fn({ target }); }
  click() { return this.emit('click'); }
  querySelectorAll() { return []; }
  appendChild(child) { this.children.push(child); }
  setAttribute() {}
  setCustomValidity() {}
  focus() { this.focused = true; }
  remove() {}
}
function fixture(t, { history: injectHistory = true } = {}) {
  const originals = { document: globalThis.document, window: globalThis.window, FileReader: globalThis.FileReader };
  t.after(() => Object.assign(globalThis, originals));
  const ids = [...readFileSync(new URL('../index.html', import.meta.url), 'utf8').matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const elements = new Map(ids.map(id => [id, new Element()]));
  elements.set('app-notice-host', new Element());
  globalThis.document = { getElementById: id => elements.get(id) || null, createElement: () => new Element() };
  let confirmed = true;
  globalThis.window = { confirm: () => confirmed, setTimeout: () => 1, clearTimeout() {} };
  globalThis.FileReader = class {
    readAsText(file) {
      file.text().then(text => { this.result = text; this.onload(); }, error => { this.error = error; this.onerror(); });
    }
  };
  const state = new AppState();
  const history = new History(state);
  const counts = { change: 0, refresh: 0, transact: 0 };
  const api = initUserDefModal({
    state,
    ...(injectHistory ? { history: { transact(fn) { counts.transact++; return history.transact(fn); } } } : {}),
    onModelChange: () => counts.change++,
    refreshDraftSectionSelectors: () => counts.refresh++,
  });
  const el = id => elements.get(id);
  const values = data => { for (const [id, value] of Object.entries(data)) el(`user-def-${id}`).value = String(value); };
  const click = id => el(id).click();
  const rowAction = (action, key, data = {}) => {
    const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => {
      const input = new Element(); input.value = String(value ?? ''); return [key, input];
    }));
    const row = { querySelector: selector => fields[selector.match(/data-field="([^"]+)"/)[1]] || null };
    const btn = { dataset: { action, ...key }, closest: selector => selector === 'tr' ? row : btn };
    return { fields, run: () => el('user-def-list-body').emit('click', btn) };
  };
  return { state, history, counts, api, el, values, click, rowAction, cancel: () => { confirmed = false; } };
}

for (const kind of ['section', 'spring', 'material']) {
  test(`modal ${kind} creation validates before history and notifies once on success`, async t => {
    const f = fixture(t);
    const { state, history, counts, values, click, el } = f;
    values({ kind, name: 'B', symbol: 'S', 'material-name': 'M', b: 200, h: 400, shape: 'rectangle', E: 200, G: 80, density: 7000 });
    const invalid = kind === 'section' ? { b: '20junk' } : kind === 'spring' ? { kr: '-1' } : { E: '0' };
    values(invalid);
    const before = structuredClone({ ...state });
    await click('btn-user-def-add');
    assert.deepEqual({ ...state }, before);
    assert.equal(counts.transact, 0);
    assert.equal(el('user-def-form-error').hidden, false);
    values({ b: 200, kr: 100, E: 200 });
    await click('btn-user-def-add');
    assert.equal(history.undoStack.length, 1);
    assert.deepEqual(counts, { change: 1, refresh: 1, transact: 1 });
    assert.equal(el('user-def-form-error').hidden, true);
    history.undo();
    assert.equal(state.getSection('member', 'beam', 'B'), null);
    assert.equal(state.getSpring('S'), null);
    assert.equal(state.getMaterial('M'), null);
    history.redo();
    assert.ok(kind === 'section' ? state.getSection('member', 'beam', 'B') : kind === 'spring' ? state.getSpring('S') : state.getMaterial('M'));
  });
}

test('section form validates shapes, optional properties and ratios without consuming redo; calculation is only a preview', async t => {
  const { state, history, counts, values, click, el } = fixture(t);
  history.save(); state.addNode(10, 20); history.undo();
  const before = structuredClone({ ...state });
  values({ name: 'B', b: 200, h: 400, shape: 'hSection', 'flange-thickness': 250, 'web-thickness': 10 });
  await click('btn-user-def-add');
  values({ 'flange-thickness': 20, A: -1 });
  await click('btn-user-def-add');
  values({ A: '', 'shear-area-ratio-y': 1.2 });
  await click('btn-user-def-add');
  values({ 'shear-area-ratio-y': '' });
  await click('btn-user-def-calculate-properties');
  assert.ok(Number(el('user-def-A').value) > 0);
  assert.equal(Number(el('user-def-A').value) % 1, 0);
  assert.deepEqual({ ...state }, before);
  assert.equal(counts.transact, 0);
  assert.equal(history.redoStack.length, 1);
});

for (const kind of ['section', 'surface', 'spring', 'material']) {
  test(`delegated ${kind} update/remove uses one transaction; invalid and no-op edits do not notify`, async t => {
    const { state, history, counts, values, rowAction } = fixture(t);
    let key, fields;
    if (kind === 'spring') {
      state.addSpring({ symbol: 'S', kr: 100 });
      key = { symbol: 'S' }; fields = { kr: 200, kt: '', memo: '' };
    } else if (kind === 'material') {
      state.addMaterial({ name: 'M', E: 200, G: 80, density: 7000 });
      key = { material: 'M' }; fields = { E: 250, G: 80, density: 7000 };
    } else {
      const target = kind === 'surface' ? 'surface' : 'member';
      const type = kind === 'surface' ? 'roof' : 'beam';
      values({ target, type });
      state.addSection({ target, type, name: 'B', b: 200, h: 400 });
      key = { name: 'B' };
      fields = kind === 'surface' ? { memo: 'New memo' } : { b: 250, h: 400, shape: 'rectangle', material: 'steel', defaultEndICondition: 'pin', defaultEndJCondition: 'pin' };
    }
    const actionKind = kind === 'surface' ? 'section' : kind;
    const edit = rowAction(`save-${actionKind}`, key, fields);
    if (kind !== 'surface') {
      const field = kind === 'material' ? 'E' : kind === 'spring' ? 'kr' : 'b';
      const valid = edit.fields[field].value;
      edit.fields[field].value = '20junk';
      await edit.run();
      assert.equal(counts.transact, 0);
      edit.fields[field].value = valid;
    }
    await edit.run();
    assert.equal(history.undoStack.length, 1);
    assert.equal(counts.change, 1);
    const revision = state.revision;
    await edit.run();
    assert.equal(state.revision, revision);
    assert.equal(counts.transact, 1);
    assert.equal(counts.change, 1);
    await rowAction(`remove-${actionKind}`, key).run();
    assert.equal(history.undoStack.length, 2);
    assert.equal(counts.change, 2);
    history.undo();
    assert.ok(kind === 'spring' ? state.getSpring('S') : kind === 'material' ? state.getMaterial('M') : state.getSection(kind === 'surface' ? 'surface' : 'member', kind === 'surface' ? 'roof' : 'beam', 'B'));
  });
}

test('cancelled deletion, row calculation and end-spring visibility do not mutate history', async t => {
  const { state, history, counts, rowAction, cancel, el } = fixture(t);
  state.addSpring({ symbol: 'S' });
  cancel();
  await rowAction('remove-spring', { symbol: 'S' }).run();
  assert.ok(state.getSpring('S'));
  const preview = rowAction('calculate-section-row', { name: 'B' }, { b: 200, h: 400, shape: 'rectangle', A: '', Iy: '', Iz: '', J: '' });
  await preview.run();
  assert.equal(Number(preview.fields.A.value), 80000);
  const spring = new Element(); spring.style.display = 'none';
  const condition = new Element(); condition.value = 'spring'; condition.dataset.field = 'defaultEndICondition';
  condition.closest = selector => selector === 'td' ? { querySelector: () => spring } : condition;
  await el('user-def-list-body').emit('change', condition);
  assert.equal(spring.hidden, false);
  assert.equal(spring.style.display, '');
  assert.equal(history.undoStack.length, 0);
  assert.equal(counts.change, 0);
});

test('modal import is one entry and one notification; skipped/errors reset file input without callbacks', async t => {
  const { state, history, counts, el } = fixture(t);
  const input = el('file-user-def-import');
  const read = async data => {
    input.value = 'selected.json';
    input.files = [new Blob([typeof data === 'string' ? data : JSON.stringify(data)])];
    await input.emit('change');
    assert.equal(input.value, '');
  };
  const payload = { userDefinitions: true, springs: [{ symbol: 'S' }, { symbol: 'T' }] };
  await read(payload);
  assert.equal(history.undoStack.length, 1);
  assert.deepEqual(counts, { change: 1, refresh: 1, transact: 1 });
  await read(payload);
  await read('{bad');
  await read({ userDefinitions: true, materials: [{ name: 'M', E: 200, G: 80, density: 7000 }], sections: [{ target: 'member', type: 'beam', name: 'Bad', b: -1 }] });
  assert.equal(state.getMaterial('M'), null);
  assert.deepEqual(counts, { change: 1, refresh: 1, transact: 1 });
  history.undo();
  assert.equal(state.getSpring('S'), null);
  assert.equal(state.getSpring('T'), null);
});

test('public show/isOpen/applyLanguage API works without history and requires explicit close', async t => {
  const { api, state, values, click, el } = fixture(t, { history: false });
  assert.equal(api.isOpen(), false);
  api.show(); api.applyLanguage();
  assert.equal(api.isOpen(), true);
  await el('user-def-modal').emit('click');
  await el('user-def-modal').emit('keydown');
  assert.equal(api.isOpen(), true);
  await click('btn-user-def-list');
  await click('btn-user-def-close');
  assert.equal(api.isOpen(), true);
  await click('btn-user-def-list-close');
  assert.equal(api.isOpen(), false);
  values({ kind: 'spring', symbol: 'Standalone' });
  await click('btn-user-def-add');
  assert.ok(state.getSpring('Standalone'));
});
