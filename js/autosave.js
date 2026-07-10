// autosave.js - Periodic localStorage snapshots of the model with a
// restore-on-startup prompt (crash / accidental-close recovery).

const AUTOSAVE_KEY = 'lineframe-autosave-v1';
const AUTOSAVE_INTERVAL_MS = 20000;

function modelHasContent(data) {
  return !!data && (
    (data.members?.length || 0) +
    (data.surfaces?.length || 0) +
    (data.loads?.length || 0) +
    (data.supports?.length || 0)
  ) > 0;
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
