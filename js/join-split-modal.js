// join-split-modal.js - Reusable single-choice modal used by member join and
// column split flows. The caller supplies the title and choices and awaits the
// selected value; every cancel path resolves the Promise with null.

import { t } from './i18n.js';

const controllers = new WeakMap();

function inertController() {
  return {
    choose: async () => null,
    hide() {},
    isOpen: () => false,
  };
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map(option => {
    if (option !== null && typeof option === 'object') {
      return {
        value: option.value,
        label: String(option.label ?? option.value ?? ''),
      };
    }
    return { value: option, label: String(option ?? '') };
  });
}

/**
 * Initialize the shared join/split choice modal.
 *
 * choose({ titleKey, options, initialValue }) resolves with the selected
 * option value, or null when the user cancels. Options may be primitive values
 * or { value, label } objects. Repeated initialization for the same DOM reuses
 * the existing controller and does not install duplicate listeners.
 */
export function initJoinSplitModal(root = globalThis.document) {
  if (!root?.getElementById) return inertController();

  const modal = root.getElementById('join-section-modal');
  const titleEl = root.getElementById('join-section-modal-title');
  const form = root.getElementById('join-section-form');
  const select = root.getElementById('join-section-choice');
  const closeButton = root.getElementById('btn-join-section-close');
  const cancelButton = root.getElementById('btn-join-section-cancel');
  const confirmButton = root.getElementById('btn-join-section-confirm');
  if (!modal || !titleEl || !form || !select || !closeButton ||
      !cancelButton || !confirmButton || !root.createElement) {
    return inertController();
  }

  const existing = controllers.get(modal);
  if (existing) return existing;

  let activeOptions = [];
  let pendingResolve = null;
  let returnFocus = null;

  function applyLanguage() {
    modal.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
  }

  function finish(value = null) {
    if (!pendingResolve) return;
    const resolve = pendingResolve;
    const focusTarget = returnFocus;
    pendingResolve = null;
    returnFocus = null;
    activeOptions = [];
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    resolve(value);
    if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }

  function hide() {
    finish(null);
  }

  function choose({ titleKey, options, initialValue } = {}) {
    const normalized = normalizeOptions(options);
    if (!normalized.length) return Promise.resolve(null);

    // A new request supersedes an open one. Resolve the old request first so
    // callers never retain a dangling Promise.
    finish(null);
    activeOptions = normalized;
    select.replaceChildren();
    normalized.forEach((option, index) => {
      const optionEl = root.createElement('option');
      optionEl.value = String(index);
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    });

    const initialIndex = normalized.findIndex(option =>
      Object.is(option.value, initialValue)
    );
    select.value = String(initialIndex >= 0 ? initialIndex : 0);
    titleEl.textContent = t(titleKey || 'choicePrompt');
    applyLanguage();
    returnFocus = root.activeElement || null;
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');

    return new Promise(resolve => {
      pendingResolve = resolve;
      if (typeof select.focus === 'function') select.focus();
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const index = Number.parseInt(select.value, 10);
    const option = activeOptions[index];
    finish(option ? option.value : null);
  });
  closeButton.addEventListener('click', hide);
  cancelButton.addEventListener('click', hide);
  modal.addEventListener('click', event => {
    if (event.target === modal) hide();
  });

  const eventTarget = root.defaultView || root;
  eventTarget.addEventListener?.('keydown', event => {
    if (event.key !== 'Escape' || !pendingResolve) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    hide();
  }, true);

  const controller = {
    choose,
    hide,
    isOpen: () => modal.classList.contains('visible'),
  };
  controllers.set(modal, controller);
  return controller;
}
