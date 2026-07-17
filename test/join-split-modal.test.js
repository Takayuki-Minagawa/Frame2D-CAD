import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { initJoinSplitModal } from '../js/join-split-modal.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement extends EventTarget {
  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.children = [];
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.isConnected = true;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll(selector) {
    if (selector !== '[data-i18n]') return [];
    return this.ownerDocument.localizedElements;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }
}

function createFakeDocument() {
  const root = {
    defaultView: new EventTarget(),
    localizedElements: [],
    activeElement: null,
    elements: new Map(),
    createElement() {
      return new FakeElement(root);
    },
    getElementById(id) {
      return root.elements.get(id) || null;
    },
  };
  for (const id of [
    'join-section-modal',
    'join-section-modal-title',
    'join-section-form',
    'join-section-choice',
    'btn-join-section-close',
    'btn-join-section-cancel',
    'btn-join-section-confirm',
  ]) {
    root.elements.set(id, new FakeElement(root));
  }
  for (const [id, key] of [
    ['btn-join-section-close', 'choiceCancel'],
    ['btn-join-section-cancel', 'choiceCancel'],
    ['btn-join-section-confirm', 'choiceConfirm'],
  ]) {
    const element = root.getElementById(id);
    element.dataset.i18n = key;
    root.localizedElements.push(element);
  }
  return root;
}

test('choice modal markup is wired in index.html', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of [
    'join-section-modal',
    'join-section-modal-title',
    'join-section-form',
    'join-section-choice',
    'btn-join-section-cancel',
    'btn-join-section-confirm',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('choice modal preserves option values and reuses its controller', async () => {
  const root = createFakeDocument();
  const modal = initJoinSplitModal(root);
  assert.equal(initJoinSplitModal(root), modal);

  const resultPromise = modal.choose({
    titleKey: 'joinSelectSection',
    options: [
      { value: 'S1', label: 'S1' },
      { value: 42, label: 'Section 42' },
    ],
    initialValue: 42,
  });

  const select = root.getElementById('join-section-choice');
  assert.equal(modal.isOpen(), true);
  assert.equal(select.value, '1');
  assert.deepEqual(select.children.map(option => option.textContent), ['S1', 'Section 42']);
  assert.equal(root.getElementById('join-section-modal').getAttribute('aria-hidden'), 'false');

  root.getElementById('join-section-form').dispatchEvent(
    new Event('submit', { cancelable: true })
  );
  assert.equal(await resultPromise, 42);
  assert.equal(modal.isOpen(), false);
});

test('choice modal resolves all cancellation paths with null', async () => {
  const root = createFakeDocument();
  const modal = initJoinSplitModal(root);

  let resultPromise = modal.choose({ options: ['S1'] });
  root.getElementById('btn-join-section-cancel').dispatchEvent(new Event('click'));
  assert.equal(await resultPromise, null);

  resultPromise = modal.choose({ options: ['S1'] });
  root.getElementById('join-section-modal').dispatchEvent(new Event('click'));
  assert.equal(await resultPromise, null);

  resultPromise = modal.choose({ options: ['S1'] });
  const escape = new Event('keydown', { cancelable: true });
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  root.defaultView.dispatchEvent(escape);
  assert.equal(await resultPromise, null);

  assert.equal(await modal.choose({ options: [] }), null);
  assert.equal(await initJoinSplitModal(null).choose({ options: ['S1'] }), null);
});

test('a new choice resolves an older pending request', async () => {
  const root = createFakeDocument();
  const modal = initJoinSplitModal(root);
  const first = modal.choose({ options: ['old'] });
  const second = modal.choose({ options: ['new'] });

  assert.equal(await first, null);
  root.getElementById('join-section-form').dispatchEvent(
    new Event('submit', { cancelable: true })
  );
  assert.equal(await second, 'new');
});
