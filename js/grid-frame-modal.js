// grid-frame-modal.js - Initial column/beam grid frame generation dialog.
// Parsing and model construction stay DOM-independent in frame-generator.js;
// this module owns only modal state and the whole-model replacement flow.

import {
  buildGridFrame,
  MAX_SPAN_COUNT,
  MAX_STORY_COUNT,
  parseMmList,
} from './frame-generator.js';
import { modelHasContent } from './autosave.js';
import { t } from './i18n.js';
import { showNotice } from './notice.js';
import { createDefaultLevels } from './state.js';

const PARSE_ERROR_KEYS = {
  empty: 'gridFrameEmptyInput',
  invalid: 'gridFrameInvalidInput',
  range: 'gridFrameOutOfRange',
  count: 'gridFrameTooMany',
};

export const GRID_FRAME_INPUT_STORAGE_KEY = 'lineframe-grid-frame-input';
export const GRID_FRAME_PRESETS_STORAGE_KEY = 'lineframe-grid-frame-presets';
export const MAX_GRID_FRAME_PRESETS = 20;

const DEFAULT_INPUT_VALUES = Object.freeze({
  storyHeights: '',
  spansX: '',
  spansY: '',
  columnSection: '',
  beamSection: '',
  generateFloors: false,
});

function normalizeStoredInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    storyHeights: typeof value.storyHeights === 'string' ? value.storyHeights : '',
    spansX: typeof value.spansX === 'string' ? value.spansX : '',
    spansY: typeof value.spansY === 'string' ? value.spansY : '',
    columnSection: typeof value.columnSection === 'string' ? value.columnSection : '',
    beamSection: typeof value.beamSection === 'string' ? value.beamSection : '',
    generateFloors: value.generateFloors === true,
  };
}

function readStoredInput() {
  try {
    const raw = globalThis.localStorage?.getItem(GRID_FRAME_INPUT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeStoredInput(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return !!globalThis.localStorage;
  } catch {
    return false;
  }
}

function readPresets() {
  try {
    const raw = globalThis.localStorage?.getItem(GRID_FRAME_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const presetsByName = new Map();
    for (const item of parsed) {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      const values = normalizeStoredInput(item?.values);
      if (!name || !values) continue;
      presetsByName.set(name, { name, values });
    }
    return [...presetsByName.values()].slice(0, MAX_GRID_FRAME_PRESETS);
  } catch {
    return [];
  }
}

function hasNonDefaultLevels(levels) {
  if (!Array.isArray(levels)) return false;
  const defaults = createDefaultLevels();
  if (levels.length !== defaults.length) return true;
  const levelById = new Map(levels.map(level => [level.id, level]));
  return defaults.some(defaultLevel => {
    const level = levelById.get(defaultLevel.id);
    return !level || level.name !== defaultLevel.name || level.z !== defaultLevel.z;
  });
}

export function initGridFrameModal({
  state,
  history,
  onModelChange,
  syncSettingsControls,
  refreshLevelSelectors,
  hideSettingsModal = () => {},
}) {
  const modal = document.getElementById('grid-frame-modal');
  const form = document.getElementById('grid-frame-form');
  const settingsModal = document.getElementById('settings-modal');
  const presetSelect = document.getElementById('grid-frame-preset');
  const presetDeleteButton = document.getElementById('btn-grid-frame-preset-delete');
  const columnSectionSelect = document.getElementById('grid-frame-column-section');
  const beamSectionSelect = document.getElementById('grid-frame-beam-section');
  const generateFloorsInput = document.getElementById('grid-frame-generate-floors');
  let returnFocusElement = null;
  let presets = readPresets();
  const fields = [
    {
      key: 'storyHeights',
      input: document.getElementById('grid-frame-story-heights'),
      labelKey: 'gridFrameStoryHeights',
      maxCount: MAX_STORY_COUNT,
    },
    {
      key: 'spansX',
      input: document.getElementById('grid-frame-spans-x'),
      labelKey: 'gridFrameSpansX',
      maxCount: MAX_SPAN_COUNT,
    },
    {
      key: 'spansY',
      input: document.getElementById('grid-frame-spans-y'),
      labelKey: 'gridFrameSpansY',
      maxCount: MAX_SPAN_COUNT,
    },
  ];
  let retainedValues = readStoredInput() || { ...DEFAULT_INPUT_VALUES };

  function applyLanguage() {
    modal.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    modal.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
  }

  function captureInputValues() {
    return {
      storyHeights: fields[0].input.value,
      spansX: fields[1].input.value,
      spansY: fields[2].input.value,
      columnSection: columnSectionSelect.value,
      beamSection: beamSectionSelect.value,
      generateFloors: generateFloorsInput.checked,
    };
  }

  function retainInputValues() {
    retainedValues = captureInputValues();
  }

  function listSections(type) {
    if (typeof state.listSections === 'function') {
      return state.listSections('member', type);
    }
    if (!Array.isArray(state.sectionCatalog)) return [];
    return state.sectionCatalog
      .filter(section => section?.target === 'member' && section.type === type)
      .sort((a, b) => {
        if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      });
  }

  function populateSectionSelect(select, type, preferredName) {
    const sections = listSections(type);
    select.innerHTML = '';
    for (const section of sections) {
      const option = document.createElement('option');
      option.value = section.name;
      option.textContent = section.name;
      select.appendChild(option);
    }

    const names = new Set(sections.map(section => section.name));
    const defaultName = typeof state.getDefaultSectionName === 'function'
      ? state.getDefaultSectionName('member', type)
      : sections.find(section => section.isDefault)?.name;
    const selectedName = names.has(preferredName)
      ? preferredName
      : names.has(defaultName)
        ? defaultName
        : sections[0]?.name || '';
    select.value = selectedName;
    return selectedName;
  }

  function applyInputValues(values) {
    const normalized = normalizeStoredInput(values) || { ...DEFAULT_INPUT_VALUES };
    for (const field of fields) field.input.value = normalized[field.key];
    generateFloorsInput.checked = normalized.generateFloors;
    normalized.columnSection = populateSectionSelect(
      columnSectionSelect,
      'column',
      normalized.columnSection
    );
    normalized.beamSection = populateSectionSelect(
      beamSectionSelect,
      'beam',
      normalized.beamSection
    );
    retainedValues = normalized;
  }

  function refreshPresetSelect(preferredName = presetSelect.value) {
    presets = readPresets();
    presetSelect.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = t('gridFramePresetNone');
    emptyOption.dataset.i18n = 'gridFramePresetNone';
    presetSelect.appendChild(emptyOption);
    for (const preset of presets) {
      const option = document.createElement('option');
      option.value = preset.name;
      option.textContent = preset.name;
      presetSelect.appendChild(option);
    }
    presetSelect.value = presets.some(preset => preset.name === preferredName)
      ? preferredName
      : '';
    presetDeleteButton.disabled = !presetSelect.value;
  }

  function clearInputErrors() {
    for (const field of fields) {
      field.input.classList.remove('input-error');
      field.input.removeAttribute('aria-invalid');
    }
  }

  function show() {
    returnFocusElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    applyLanguage();
    clearInputErrors();
    refreshPresetSelect();
    applyInputValues(retainedValues);
    settingsModal?.setAttribute('inert', '');
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => fields[0].input.focus());
  }

  function hide({ restoreFocus = true } = {}) {
    retainInputValues();
    clearInputErrors();
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    settingsModal?.removeAttribute('inert');
    if (restoreFocus && returnFocusElement?.isConnected) {
      requestAnimationFrame(() => returnFocusElement.focus());
    }
  }

  function parseInputs() {
    clearInputErrors();
    const parsed = {};
    for (const field of fields) {
      const result = parseMmList(field.input.value, { maxCount: field.maxCount });
      if (!result.ok) {
        field.input.classList.add('input-error');
        field.input.setAttribute('aria-invalid', 'true');
        field.input.focus();
        const messageKey = PARSE_ERROR_KEYS[result.reason] || 'gridFrameInvalidInput';
        showNotice(t(messageKey, { field: t(field.labelKey) }), 'error');
        return null;
      }
      parsed[field.key] = result.values;
    }
    return parsed;
  }

  function errorMessage(error) {
    if (error?.code === 'member-count' || error?.code === 'element-count') {
      return t('gridFrameTooLarge', { count: error.count, max: error.max });
    }
    return t('gridFrameGenerateFailed');
  }

  function generate() {
    retainInputValues();
    const values = parseInputs();
    if (!values) return;
    const inputValues = { ...retainedValues };

    // Build against a fresh AppState before touching the current model or its
    // history. Validation failures (including the member cap) must preserve an
    // existing redo stack.
    let generatedModel;
    try {
      generatedModel = buildGridFrame({
        ...values,
        columnSection: inputValues.columnSection,
        beamSection: inputValues.beamSection,
        generateFloors: inputValues.generateFloors,
        sectionCatalog: state.sectionCatalog,
        springCatalog: state.springCatalog,
      });
    } catch (error) {
      console.error('Grid frame generation failed:', error);
      showNotice(errorMessage(error), 'error', 6500);
      return;
    }

    // Nodes are intentionally excluded from autosave's broader content check,
    // but still count here because replacing the model discards them too.
    const hasModelContent =
      (state.nodes?.length || 0) > 0 ||
      hasNonDefaultLevels(state.levels) ||
      modelHasContent(state);
    if (hasModelContent && !window.confirm(t('gridFrameReplaceConfirm'))) return;

    let snapshotSaved = false;
    try {
      history.save();
      snapshotSaved = true;
      state.loadJSON(generatedModel);
      syncSettingsControls();
      refreshLevelSelectors();
      hide({ restoreFocus: false });
      hideSettingsModal();
      onModelChange();
      writeStorage(GRID_FRAME_INPUT_STORAGE_KEY, inputValues);
      requestAnimationFrame(() => document.getElementById('btn-settings')?.focus());

      const columns = state.members.filter(member => member.type === 'column').length;
      const beams = state.members.filter(member => member.type === 'beam').length;
      const floors = state.surfaces?.filter(surface => surface.type === 'floor').length || 0;
      showNotice(t('gridFrameDone', { columns, beams, floors }), 'success');
    } catch (error) {
      console.error('Grid frame generation failed:', error);
      if (snapshotSaved) history.undo();
      // The app-level History restore hook normally performs these updates.
      // Keep an explicit fallback for callers without that hook and for a
      // history.save()/undo() failure before a snapshot can be restored.
      syncSettingsControls();
      refreshLevelSelectors();
      onModelChange();
      showNotice(errorMessage(error), 'error', 6500);
    }
  }

  function savePreset() {
    retainInputValues();
    const proposedName = window.prompt(t('gridFramePresetNamePrompt'), presetSelect.value || '');
    if (proposedName === null) return;
    const name = proposedName.trim();
    if (!name) {
      showNotice(t('gridFramePresetNameRequired'), 'error');
      return;
    }

    const existingIndex = presets.findIndex(preset => preset.name === name);
    if (existingIndex < 0 && presets.length >= MAX_GRID_FRAME_PRESETS) {
      showNotice(t('gridFramePresetLimit', { max: MAX_GRID_FRAME_PRESETS }), 'error');
      return;
    }

    const nextPreset = { name, values: { ...retainedValues } };
    const nextPresets = [...presets];
    if (existingIndex >= 0) nextPresets[existingIndex] = nextPreset;
    else nextPresets.push(nextPreset);
    if (!writeStorage(GRID_FRAME_PRESETS_STORAGE_KEY, nextPresets)) {
      showNotice(t('gridFramePresetSaveFailed'), 'error');
      return;
    }

    refreshPresetSelect(name);
    showNotice(t('gridFramePresetSaved', { name }), 'success');
  }

  function loadSelectedPreset() {
    presetDeleteButton.disabled = !presetSelect.value;
    const preset = presets.find(item => item.name === presetSelect.value);
    if (!preset) return;
    applyInputValues(preset.values);
    clearInputErrors();
    showNotice(t('gridFramePresetLoaded', { name: preset.name }), 'success');
  }

  function deletePreset() {
    const name = presetSelect.value;
    if (!name) return;
    if (!window.confirm(t('gridFramePresetDeleteConfirm', { name }))) return;
    const nextPresets = presets.filter(preset => preset.name !== name);
    if (!writeStorage(GRID_FRAME_PRESETS_STORAGE_KEY, nextPresets)) {
      showNotice(t('gridFramePresetDeleteFailed'), 'error');
      return;
    }
    refreshPresetSelect();
    showNotice(t('gridFramePresetDeleted', { name }), 'success');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    generate();
  });
  presetSelect.addEventListener('change', loadSelectedPreset);
  document.getElementById('btn-grid-frame-preset-save').addEventListener('click', savePreset);
  presetDeleteButton.addEventListener('click', deletePreset);
  document.getElementById('btn-grid-frame-close').addEventListener('click', hide);
  document.getElementById('btn-grid-frame-cancel').addEventListener('click', hide);
  modal.addEventListener('click', event => {
    if (event.target === modal) hide();
  });
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [
      ...modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled])'
      ),
    ]
      .filter(element => !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  for (const field of fields) {
    field.input.addEventListener('input', () => {
      field.input.classList.remove('input-error');
      field.input.removeAttribute('aria-invalid');
    });
  }

  return {
    show,
    hide,
    applyLanguage,
    isOpen: () => modal.classList.contains('visible'),
  };
}
