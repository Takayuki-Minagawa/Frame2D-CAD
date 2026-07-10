// autosave.js - Periodic localStorage snapshots of the model with a
// restore-on-startup prompt (crash / accidental-close recovery).

import { LOAD_CASES } from './constants.js';
import { createDefaultLoadCombinations } from './state.js';
import { createDefaultSettings, normalizeSettings } from './display-settings.js';

const AUTOSAVE_KEY = 'lineframe-autosave-v1';
const AUTOSAVE_INTERVAL_MS = 20000;

function loadCombinationsEdited(list) {
  if (!Array.isArray(list)) return false;
  const defaults = createDefaultLoadCombinations();
  if (list.length !== defaults.length) return true;
  return list.some((combo, i) =>
    combo?.id !== defaults[i].id ||
    combo?.name !== defaults[i].name ||
    LOAD_CASES.some(cs => (combo?.factors?.[cs] || 0) !== (defaults[i].factors[cs] || 0))
  );
}

function settingsEdited(raw) {
  if (!raw) return false;
  const settings = normalizeSettings(raw);
  const defaults = createDefaultSettings();
  return Object.keys(defaults).some(key => settings[key] !== defaults[key]);
}

// A snapshot is worth keeping when it contains any drawn elements, grid axes,
// an underlay, edited load combinations, or non-default display settings
// (settings are part of the saved model too). Exported for tests.
export function modelHasContent(data) {
  if (!data) return false;
  const count =
    (data.members?.length || 0) +
    (data.surfaces?.length || 0) +
    (data.loads?.length || 0) +
    (data.supports?.length || 0) +
    (data.axes?.length || 0) +
    (data.underlay?.entities?.length || 0);
  if (count > 0) return true;
  return loadCombinationsEdited(data.loadCombinations) || settingsEdited(data.settings);
}

export function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return modelHasContent(parsed?.data) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // storage unavailable - nothing to clear
  }
}

// Starts the autosave loop. Returns { stop, saveNow }.
export function initAutosave({ state }) {
  let lastSavedRevision = state.revision;

  const saveNow = () => {
    if (state.settings?.autosave === false) return;
    if (state.revision === lastSavedRevision) return;
    const data = state.toJSON();
    if (!modelHasContent(data)) {
      clearAutosave();
      lastSavedRevision = state.revision;
      return;
    }
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        data,
      }));
      lastSavedRevision = state.revision;
    } catch {
      // Quota exceeded or storage unavailable: skip silently, CAD save/load
      // remains the durable path.
    }
  };

  const timer = setInterval(saveNow, AUTOSAVE_INTERVAL_MS);
  window.addEventListener('beforeunload', saveNow);

  return {
    saveNow,
    stop() {
      clearInterval(timer);
      window.removeEventListener('beforeunload', saveNow);
    },
  };
}
