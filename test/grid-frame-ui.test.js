import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { MAX_GRID_FRAME_MEMBERS } from '../js/frame-generator.js';
import {
  GRID_FRAME_INPUT_STORAGE_KEY,
  GRID_FRAME_PRESETS_STORAGE_KEY,
  initGridFrameModal,
  MAX_GRID_FRAME_PRESETS,
} from '../js/grid-frame-modal.js';
import { AppState } from '../js/state.js';
import { ToolManager } from '../js/tools.js';

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
  constructor(ownerDocument, id = '', tagName = 'DIV') {
    super();
    this.ownerDocument = ownerDocument;
    this.id = id;
    this.tagName = tagName;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.children = [];
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.placeholder = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.isConnected = true;
    this.parentElement = null;
    this._innerHTML = '';
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (child.id) this.ownerDocument.elements.set(child.id, child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    }
    this.isConnected = false;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (value === '') this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelectorAll(selector) {
    return this.ownerDocument.queries.get(`${this.id}:${selector}`) || [];
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }
}

function createFakeDocument() {
  const root = {
    elements: new Map(),
    queries: new Map(),
    activeElement: null,
    documentElement: {},
    getElementById(id) {
      return root.elements.get(id) || null;
    },
    createElement(tagName) {
      return new FakeElement(root, '', tagName.toUpperCase());
    },
  };
  root.body = new FakeElement(root, 'body', 'BODY');

  const elementTypes = {
    'grid-frame-form': 'FORM',
    'grid-frame-story-heights': 'INPUT',
    'grid-frame-spans-x': 'INPUT',
    'grid-frame-spans-y': 'INPUT',
    'grid-frame-column-section': 'SELECT',
    'grid-frame-beam-section': 'SELECT',
    'grid-frame-generate-floors': 'INPUT',
    'grid-frame-preset': 'SELECT',
    'btn-grid-frame-preset-save': 'BUTTON',
    'btn-grid-frame-preset-delete': 'BUTTON',
    'btn-grid-frame-close': 'BUTTON',
    'btn-grid-frame-cancel': 'BUTTON',
    'btn-grid-frame-generate': 'BUTTON',
    'btn-grid-frame': 'BUTTON',
    'btn-settings': 'BUTTON',
  };
  for (const id of [
    'grid-frame-modal',
    'grid-frame-form',
    'grid-frame-story-heights',
    'grid-frame-spans-x',
    'grid-frame-spans-y',
    'grid-frame-column-section',
    'grid-frame-beam-section',
    'grid-frame-generate-floors',
    'grid-frame-preset',
    'btn-grid-frame-preset-save',
    'btn-grid-frame-preset-delete',
    'btn-grid-frame-close',
    'btn-grid-frame-cancel',
    'btn-grid-frame-generate',
    'btn-grid-frame',
    'btn-settings',
    'settings-modal',
    'app-notice-host',
  ]) {
    root.elements.set(id, new FakeElement(root, id, elementTypes[id] || 'DIV'));
  }

  const modal = root.getElementById('grid-frame-modal');
  const inputs = [
    root.getElementById('grid-frame-story-heights'),
    root.getElementById('grid-frame-spans-x'),
    root.getElementById('grid-frame-spans-y'),
  ];
  inputs[0].dataset.i18nPlaceholder = 'gridFrameStoryHeightsPlaceholder';
  inputs[1].dataset.i18nPlaceholder = 'gridFrameSpansXPlaceholder';
  inputs[2].dataset.i18nPlaceholder = 'gridFrameSpansYPlaceholder';
  const localized = [
    root.getElementById('btn-grid-frame-close'),
    root.getElementById('btn-grid-frame-preset-save'),
    root.getElementById('btn-grid-frame-preset-delete'),
    root.getElementById('btn-grid-frame-cancel'),
    root.getElementById('btn-grid-frame-generate'),
  ];
  localized[0].dataset.i18n = 'helpClose';
  localized[1].dataset.i18n = 'gridFramePresetSave';
  localized[2].dataset.i18n = 'gridFramePresetDelete';
  localized[3].dataset.i18n = 'choiceCancel';
  localized[4].dataset.i18n = 'gridFrameGenerate';
  root.queries.set('grid-frame-modal:[data-i18n]', localized);
  root.queries.set('grid-frame-modal:[data-i18n-placeholder]', inputs);
  root.queries.set(
    'grid-frame-modal:button:not([disabled]), input:not([disabled]), select:not([disabled])', [
    localized[0],
    root.getElementById('grid-frame-preset'),
    localized[1],
    localized[2],
    ...inputs,
    root.getElementById('grid-frame-column-section'),
    root.getElementById('grid-frame-beam-section'),
    root.getElementById('grid-frame-generate-floors'),
    localized[3],
    localized[4],
  ]
  );
  root.body.appendChild(root.getElementById('app-notice-host'));
  root.activeElement = root.getElementById('btn-grid-frame');

  let nextTimerId = 1;
  root.defaultView = {
    confirm: () => true,
    prompt: () => null,
    setTimeout: () => nextTimerId++,
    clearTimeout: () => {},
  };
  return root;
}

function createFakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

async function withFakeBrowser(callback, { storage = createFakeStorage() } = {}) {
  const originals = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    localStorage: globalThis.localStorage,
  };
  const root = createFakeDocument();
  globalThis.document = root;
  globalThis.window = root.defaultView;
  globalThis.HTMLElement = FakeElement;
  globalThis.localStorage = storage;
  globalThis.requestAnimationFrame = callback => {
    callback();
    return 1;
  };
  try {
    return await callback(root);
  } finally {
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
}

function setValidInputs(root, storyHeights = '2800') {
  root.getElementById('grid-frame-story-heights').value = storyHeights;
  root.getElementById('grid-frame-spans-x').value = '4000';
  root.getElementById('grid-frame-spans-y').value = '5000';
}

function createCustomSectionState() {
  const state = new AppState();
  state.addSpring({ symbol: 'K-Test', memo: 'test column-end spring' });
  state.addSection({
    target: 'member',
    type: 'column',
    name: 'C-Test',
    b: 450,
    h: 450,
    defaultEndI: { condition: 'spring', springSymbol: 'K-Test' },
  });
  state.addSection({
    target: 'member',
    type: 'beam',
    name: 'B-Test',
    b: 300,
    h: 650,
  });
  return state;
}

function latestNotice(root) {
  return root.getElementById('app-notice-host').children.at(-1);
}

function dispatchSubmit(root) {
  const event = new Event('submit', { cancelable: true });
  root.getElementById('grid-frame-form').dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
}

test('initial grid frame modal exposes all inputs and actions', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  for (const id of [
    'btn-grid-frame',
    'grid-frame-modal',
    'grid-frame-form',
    'grid-frame-story-heights',
    'grid-frame-spans-x',
    'grid-frame-spans-y',
    'grid-frame-column-section',
    'grid-frame-beam-section',
    'grid-frame-generate-floors',
    'grid-frame-preset',
    'btn-grid-frame-preset-save',
    'btn-grid-frame-preset-delete',
    'btn-grid-frame-close',
    'btn-grid-frame-cancel',
    'btn-grid-frame-generate',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /data-i18n-placeholder="gridFrameStoryHeightsPlaceholder"/);
  assert.match(html, /data-i18n-placeholder="gridFrameSpansXPlaceholder"/);
  assert.match(html, /data-i18n-placeholder="gridFrameSpansYPlaceholder"/);
});

test('grid frame modal retains input and restores focus after cancellation', () =>
  withFakeBrowser(root => {
    const controller = initGridFrameModal({
      state: { nodes: [], members: [] },
      history: { save() {}, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });

    controller.show();
    setValidInputs(root, '2800 3000');
    root.getElementById('btn-grid-frame-cancel').dispatchEvent(new Event('click'));

    assert.equal(controller.isOpen(), false);
    assert.equal(root.getElementById('settings-modal').getAttribute('inert'), null);
    assert.equal(root.activeElement, root.getElementById('btn-grid-frame'));

    controller.show();
    assert.equal(root.getElementById('grid-frame-story-heights').value, '2800 3000');
    assert.equal(root.getElementById('grid-frame-spans-x').value, '4000');
    assert.equal(root.getElementById('grid-frame-spans-y').value, '5000');
  })
);

test('grid frame modal keeps invalid input open and does not touch history', () =>
  withFakeBrowser(root => {
    let saveCalls = 0;
    let loadCalls = 0;
    const controller = initGridFrameModal({
      state: { nodes: [], members: [], loadJSON() { loadCalls++; } },
      history: { save() { saveCalls++; }, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });

    controller.show();
    setValidInputs(root, '0');
    dispatchSubmit(root);

    const input = root.getElementById('grid-frame-story-heights');
    assert.equal(controller.isOpen(), true);
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(root.activeElement, input);
    assert.equal(saveCalls, 0);
    assert.equal(loadCalls, 0);
    assert.match(latestNotice(root).textContent, /1〜100,000 mm/);
  })
);

test('grid frame modal respects replacement cancellation', () =>
  withFakeBrowser(root => {
    let confirmCalls = 0;
    let saveCalls = 0;
    let loadCalls = 0;
    root.defaultView.confirm = () => {
      confirmCalls++;
      return false;
    };
    const controller = initGridFrameModal({
      state: { nodes: [{ id: 1 }], members: [], loadJSON() { loadCalls++; } },
      history: { save() { saveCalls++; }, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });

    controller.show();
    setValidInputs(root);
    dispatchSubmit(root);

    assert.equal(confirmCalls, 1);
    assert.equal(saveCalls, 0);
    assert.equal(loadCalls, 0);
    assert.equal(controller.isOpen(), true);
    assert.equal(localStorage.getItem(GRID_FRAME_INPUT_STORAGE_KEY), null);
  })
);

test('grid frame modal confirms before replacing independent model content', async () => {
  const contentCases = [
    { loads: [{ id: 'LD1' }] },
    { supports: [{ id: 'SUP1' }] },
    { axes: [{ id: 'AX1' }] },
    { underlay: { name: 'plan.dxf', entities: [{ type: 'LINE' }] } },
    {
      levels: [
        { id: 'L0', name: 'GL', z: 0 },
        { id: 'L1', name: '2F', z: 2800 },
        { id: 'L2', name: 'RF', z: 6000 },
      ],
    },
  ];

  for (const content of contentCases) {
    await withFakeBrowser(root => {
      let confirmCalls = 0;
      let saveCalls = 0;
      let loadCalls = 0;
      root.defaultView.confirm = () => {
        confirmCalls++;
        return false;
      };
      const controller = initGridFrameModal({
        state: {
          nodes: [],
          members: [],
          surfaces: [],
          ...content,
          loadJSON() { loadCalls++; },
        },
        history: { save() { saveCalls++; }, undo() {} },
        onModelChange() {},
        syncSettingsControls() {},
        refreshLevelSelectors() {},
      });

      controller.show();
      setValidInputs(root);
      dispatchSubmit(root);

      assert.equal(confirmCalls, 1);
      assert.equal(saveCalls, 0);
      assert.equal(loadCalls, 0);
      assert.equal(controller.isOpen(), true);
    });
  }
});

test('grid frame modal replaces the model and synchronizes the UI', () =>
  withFakeBrowser(root => {
    const state = new AppState();
    const calls = { save: 0, sync: 0, refresh: 0, change: 0, hideSettings: 0 };
    const controller = initGridFrameModal({
      state,
      history: { save() { calls.save++; }, undo() { return true; } },
      onModelChange() { calls.change++; },
      syncSettingsControls() { calls.sync++; },
      refreshLevelSelectors() { calls.refresh++; },
      hideSettingsModal() { calls.hideSettings++; },
    });

    controller.show();
    setValidInputs(root);
    dispatchSubmit(root);

    assert.deepEqual(calls, { save: 1, sync: 1, refresh: 1, change: 1, hideSettings: 1 });
    assert.equal(state.members.filter(member => member.type === 'column').length, 4);
    assert.equal(state.members.filter(member => member.type === 'beam').length, 4);
    assert.equal(controller.isOpen(), false);
    assert.equal(root.activeElement, root.getElementById('btn-settings'));
    assert.match(latestNotice(root).textContent, /柱 4本・梁 4本/);
    assert.equal(latestNotice(root).getAttribute('role'), 'status');
  })
);

test('grid frame modal applies current-model sections, generates floors, and restores saved input', async () => {
  const storage = createFakeStorage();

  await withFakeBrowser(root => {
    const state = createCustomSectionState();
    const controller = initGridFrameModal({
      state,
      history: { save() {}, undo() { return true; } },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });

    controller.show();
    assert.ok(
      root.getElementById('grid-frame-column-section').children
        .some(option => option.value === 'C-Test')
    );
    assert.ok(
      root.getElementById('grid-frame-beam-section').children
        .some(option => option.value === 'B-Test')
    );

    setValidInputs(root, '2800, 3000');
    root.getElementById('grid-frame-column-section').value = 'C-Test';
    root.getElementById('grid-frame-beam-section').value = 'B-Test';
    root.getElementById('grid-frame-generate-floors').checked = true;
    dispatchSubmit(root);

    assert.equal(
      state.members.filter(member => member.type === 'column')
        .every(member => member.sectionName === 'C-Test'),
      true
    );
    assert.equal(
      state.members.filter(member => member.type === 'column')
        .every(member => member.endI.springSymbol === 'K-Test'),
      true
    );
    assert.equal(
      state.members.filter(member => member.type === 'beam')
        .every(member => member.sectionName === 'B-Test'),
      true
    );
    assert.equal(state.surfaces.filter(surface => surface.type === 'floor').length, 2);
    assert.match(latestNotice(root).textContent, /床 2枚/);

    assert.deepEqual(JSON.parse(storage.getItem(GRID_FRAME_INPUT_STORAGE_KEY)), {
      storyHeights: '2800, 3000',
      spansX: '4000',
      spansY: '5000',
      columnSection: 'C-Test',
      beamSection: 'B-Test',
      generateFloors: true,
    });
  }, { storage });

  await withFakeBrowser(root => {
    const controller = initGridFrameModal({
      state: createCustomSectionState(),
      history: { save() {}, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });
    controller.show();

    assert.equal(root.getElementById('grid-frame-story-heights').value, '2800, 3000');
    assert.equal(root.getElementById('grid-frame-spans-x').value, '4000');
    assert.equal(root.getElementById('grid-frame-spans-y').value, '5000');
    assert.equal(root.getElementById('grid-frame-column-section').value, 'C-Test');
    assert.equal(root.getElementById('grid-frame-beam-section').value, 'B-Test');
    assert.equal(root.getElementById('grid-frame-generate-floors').checked, true);
  }, { storage });
});

test('grid frame modal saves, loads, and deletes named presets', () => {
  const storage = createFakeStorage();
  return withFakeBrowser(root => {
    const controller = initGridFrameModal({
      state: createCustomSectionState(),
      history: { save() {}, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });
    controller.show();
    setValidInputs(root, '2@3000');
    root.getElementById('grid-frame-column-section').value = 'C-Test';
    root.getElementById('grid-frame-beam-section').value = 'B-Test';
    root.getElementById('grid-frame-generate-floors').checked = true;
    root.defaultView.prompt = () => 'Office';

    root.getElementById('btn-grid-frame-preset-save').dispatchEvent(new Event('click'));

    const saved = JSON.parse(storage.getItem(GRID_FRAME_PRESETS_STORAGE_KEY));
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], {
      name: 'Office',
      values: {
        storyHeights: '2@3000',
        spansX: '4000',
        spansY: '5000',
        columnSection: 'C-Test',
        beamSection: 'B-Test',
        generateFloors: true,
      },
    });
    assert.match(latestNotice(root).textContent, /Office/);

    setValidInputs(root, '4200');
    root.getElementById('grid-frame-generate-floors').checked = false;
    const presetSelect = root.getElementById('grid-frame-preset');
    presetSelect.value = 'Office';
    presetSelect.dispatchEvent(new Event('change'));

    assert.equal(root.getElementById('grid-frame-story-heights').value, '2@3000');
    assert.equal(root.getElementById('grid-frame-column-section').value, 'C-Test');
    assert.equal(root.getElementById('grid-frame-beam-section').value, 'B-Test');
    assert.equal(root.getElementById('grid-frame-generate-floors').checked, true);
    assert.equal(root.getElementById('btn-grid-frame-preset-delete').disabled, false);

    let confirmMessage = '';
    root.defaultView.confirm = message => {
      confirmMessage = message;
      return true;
    };
    root.getElementById('btn-grid-frame-preset-delete').dispatchEvent(new Event('click'));

    assert.match(confirmMessage, /Office/);
    assert.deepEqual(JSON.parse(storage.getItem(GRID_FRAME_PRESETS_STORAGE_KEY)), []);
    assert.equal(presetSelect.value, '');
    assert.equal(root.getElementById('btn-grid-frame-preset-delete').disabled, true);
    assert.match(latestNotice(root).textContent, /Office/);
  }, { storage });
});

test('grid frame modal limits presets and ignores corrupted storage JSON', async () => {
  const values = {
    storyHeights: '3000',
    spansX: '6000',
    spansY: '6000',
    columnSection: '',
    beamSection: '',
    generateFloors: false,
  };
  const presets = Array.from({ length: MAX_GRID_FRAME_PRESETS }, (_, index) => ({
    name: `Preset ${index + 1}`,
    values,
  }));
  const fullStorage = createFakeStorage({
    [GRID_FRAME_PRESETS_STORAGE_KEY]: JSON.stringify(presets),
  });

  await withFakeBrowser(root => {
    const controller = initGridFrameModal({
      state: new AppState(),
      history: { save() {}, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });
    controller.show();
    root.defaultView.prompt = () => 'One too many';
    root.getElementById('btn-grid-frame-preset-save').dispatchEvent(new Event('click'));

    assert.equal(
      JSON.parse(fullStorage.getItem(GRID_FRAME_PRESETS_STORAGE_KEY)).length,
      MAX_GRID_FRAME_PRESETS
    );
    assert.match(latestNotice(root).textContent, new RegExp(String(MAX_GRID_FRAME_PRESETS)));
  }, { storage: fullStorage });

  const corruptedStorage = createFakeStorage({
    [GRID_FRAME_INPUT_STORAGE_KEY]: '{broken input',
    [GRID_FRAME_PRESETS_STORAGE_KEY]: '[broken presets',
  });
  await withFakeBrowser(root => {
    const controller = initGridFrameModal({
      state: new AppState(),
      history: { save() {}, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });
    assert.doesNotThrow(() => controller.show());
    assert.equal(root.getElementById('grid-frame-story-heights').value, '');
    assert.equal(root.getElementById('grid-frame-generate-floors').checked, false);
    assert.equal(root.getElementById('grid-frame-preset').children.length, 1);
  }, { storage: corruptedStorage });
});

test('grid frame modal reports projected and maximum member counts before saving', () =>
  withFakeBrowser(root => {
    let saveCalls = 0;
    const controller = initGridFrameModal({
      state: { nodes: [], members: [] },
      history: { save() { saveCalls++; }, undo() {} },
      onModelChange() {},
      syncSettingsControls() {},
      refreshLevelSelectors() {},
    });
    const stories = Array(50).fill('3000').join(',');
    const spans = Array(12).fill('6000').join(',');
    const projectedMembers = 50 * ((13 * 13) + (12 * 13) + (12 * 13));

    controller.show();
    setValidInputs(root, stories);
    root.getElementById('grid-frame-spans-x').value = spans;
    root.getElementById('grid-frame-spans-y').value = spans;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      dispatchSubmit(root);
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(saveCalls, 0);
    assert.equal(controller.isOpen(), true);
    assert.match(latestNotice(root).textContent, new RegExp(String(projectedMembers)));
    assert.match(latestNotice(root).textContent, new RegExp(String(MAX_GRID_FRAME_MEMBERS)));
  })
);

test('grid frame modal rolls back and resynchronizes after a load failure', () =>
  withFakeBrowser(root => {
    const calls = { save: 0, undo: 0, sync: 0, refresh: 0, change: 0 };
    const controller = initGridFrameModal({
      state: {
        nodes: [],
        members: [],
        loadJSON() { throw new Error('load failed'); },
      },
      history: {
        save() { calls.save++; },
        undo() { calls.undo++; return true; },
      },
      onModelChange() { calls.change++; },
      syncSettingsControls() { calls.sync++; },
      refreshLevelSelectors() { calls.refresh++; },
    });

    controller.show();
    setValidInputs(root);
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      dispatchSubmit(root);
    } finally {
      console.error = originalConsoleError;
    }

    assert.deepEqual(calls, { save: 1, undo: 1, sync: 1, refresh: 1, change: 1 });
    assert.equal(controller.isOpen(), true);
    assert.match(latestNotice(root).textContent, /生成に失敗/);
    assert.equal(localStorage.getItem(GRID_FRAME_INPUT_STORAGE_KEY), null);
  })
);

test('app wires the grid frame modal and ignores Escape while IME is composing', async () => {
  const source = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

  assert.match(source, /import \{ initGridFrameModal \} from '\.\/grid-frame-modal\.js'/);
  assert.match(source, /const gridFrameModal = initGridFrameModal\(\{/);
  assert.match(source, /document\.getElementById\('btn-grid-frame'\).*gridFrameModal\.show/);
  assert.match(source, /if \(e\.isComposing\) return;\s*if \(e\.key === 'Escape'\)/);
});

test('in-app help documents generated and excluded model elements', async () => {
  const source = await readFile(new URL('../js/help-content.js', import.meta.url), 'utf8');

  assert.match(source, /初期モデル生成（格子フレーム）/);
  assert.match(source, /GLの並進3方向を拘束した支点/);
  assert.match(source, /「床を生成する」は既定で OFF/);
  assert.match(source, /荷重・ブレースは生成されません/);
  assert.match(source, /Initial Model Generation \(Grid Frame\)/);
  assert.match(source, /supports restrained in DX\/DY\/DZ at GL/);
  assert.match(source, /"Generate floors" is OFF by default/);
  assert.match(source, /Loads and braces are not generated/);
});

test('text-field undo and redo remain native while the grid modal is being edited', () => {
  let undoCalls = 0;
  let redoCalls = 0;
  let updateCalls = 0;
  let preventDefaultCalls = 0;
  const manager = Object.create(ToolManager.prototype);
  Object.assign(manager, {
    state: { currentTool: 'member' },
    history: {
      undo() { undoCalls++; return true; },
      redo() { redoCalls++; return true; },
    },
    onUpdate() { updateCalls++; },
  });
  const event = (key, shiftKey = false) => ({
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: true,
    metaKey: false,
    shiftKey,
    target: { tagName: 'INPUT', isContentEditable: false },
    preventDefault() { preventDefaultCalls++; },
  });

  manager._onKeyDown(event('z'));
  manager._onKeyDown(event('y'));
  manager._onKeyDown(event('z', true));

  assert.equal(undoCalls, 0);
  assert.equal(redoCalls, 0);
  assert.equal(updateCalls, 0);
  assert.equal(preventDefaultCalls, 0);

  manager._onKeyDown({
    ...event('z'),
    target: { tagName: 'BODY', isContentEditable: false },
  });
  assert.equal(undoCalls, 1);
  assert.equal(updateCalls, 1);
  assert.equal(preventDefaultCalls, 1);
});

test('text-field spaces and Enter are not captured by canvas shortcuts', () => {
  let preventDefaultCalls = 0;
  let finishPolylineCalls = 0;
  const manager = Object.create(ToolManager.prototype);
  Object.assign(manager, {
    state: { currentTool: 'surface', surfaceDraftMode: 'polyline' },
    _spaceDown: false,
    _finishSurfacePolyline() { finishPolylineCalls++; },
  });
  const inputTarget = { tagName: 'INPUT', isContentEditable: false };

  manager._onKeyDown({
    key: ' ',
    code: 'Space',
    target: inputTarget,
    preventDefault() { preventDefaultCalls++; },
  });
  manager._onKeyDown({
    key: 'Enter',
    code: 'Enter',
    target: inputTarget,
    preventDefault() { preventDefaultCalls++; },
  });

  assert.equal(manager._spaceDown, false);
  assert.equal(finishPolylineCalls, 0);
  assert.equal(preventDefaultCalls, 0);

  manager._onKeyDown({
    key: ' ',
    code: 'Space',
    target: { tagName: 'BODY', isContentEditable: false },
    preventDefault() { preventDefaultCalls++; },
  });
  manager._onKeyDown({
    key: 'Enter',
    code: 'Enter',
    target: { tagName: 'BODY', isContentEditable: false },
    preventDefault() { preventDefaultCalls++; },
  });

  assert.equal(manager._spaceDown, true);
  assert.equal(finishPolylineCalls, 1);
  assert.equal(preventDefaultCalls, 1);
});
