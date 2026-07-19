// grid-frame-modal.js - Initial column/beam grid frame generation dialog.
// Parsing and model construction stay DOM-independent in frame-generator.js;
// this module owns only modal state and the whole-model replacement flow.

import { buildGridFrame, parseMmList } from './frame-generator.js';
import { t } from './i18n.js';
import { showNotice } from './notice.js';

const PARSE_ERROR_KEYS = {
  empty: 'gridFrameEmptyInput',
  invalid: 'gridFrameInvalidInput',
  range: 'gridFrameOutOfRange',
  count: 'gridFrameTooMany',
};

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
  let returnFocusElement = null;
  const fields = [
    {
      key: 'storyHeights',
      input: document.getElementById('grid-frame-story-heights'),
      labelKey: 'gridFrameStoryHeights',
      maxCount: 50,
      initialValue: '',
    },
    {
      key: 'spansX',
      input: document.getElementById('grid-frame-spans-x'),
      labelKey: 'gridFrameSpansX',
      maxCount: 100,
      initialValue: '',
    },
    {
      key: 'spansY',
      input: document.getElementById('grid-frame-spans-y'),
      labelKey: 'gridFrameSpansY',
      maxCount: 100,
      initialValue: '',
    },
  ];
  const retainedValues = Object.fromEntries(
    fields.map(field => [field.key, field.initialValue])
  );

  function applyLanguage() {
    modal.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    modal.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
  }

  function retainInputValues() {
    for (const field of fields) retainedValues[field.key] = field.input.value;
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
    for (const field of fields) field.input.value = retainedValues[field.key];
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
    if (error?.code === 'member-count') return t('gridFrameTooLarge');
    return t('gridFrameGenerateFailed');
  }

  function generate() {
    retainInputValues();
    const values = parseInputs();
    if (!values) return;

    // Build against a fresh AppState before touching the current model or its
    // history. Validation failures (including the member cap) must preserve an
    // existing redo stack.
    let generatedModel;
    try {
      generatedModel = buildGridFrame(values);
    } catch (error) {
      console.error('Grid frame generation failed:', error);
      showNotice(errorMessage(error), 'error', 6500);
      return;
    }

    const hasModelContent = state.nodes.length > 0 || state.members.length > 0;
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
      requestAnimationFrame(() => document.getElementById('btn-settings')?.focus());

      const columns = state.members.filter(member => member.type === 'column').length;
      const beams = state.members.filter(member => member.type === 'beam').length;
      showNotice(t('gridFrameDone', { columns, beams }), 'success');
    } catch (error) {
      console.error('Grid frame generation failed:', error);
      if (snapshotSaved) history.undo();
      syncSettingsControls();
      refreshLevelSelectors();
      onModelChange();
      showNotice(errorMessage(error), 'error', 6500);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    generate();
  });
  document.getElementById('btn-grid-frame-close').addEventListener('click', hide);
  document.getElementById('btn-grid-frame-cancel').addEventListener('click', hide);
  modal.addEventListener('click', event => {
    if (event.target === modal) hide();
  });
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled])')]
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
