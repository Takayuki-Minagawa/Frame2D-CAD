import { prepareModelImport } from './model-import.js';

export const LEGACY_AUTOSAVE_KEY = 'lineframe-autosave-v1';

// Keep the legacy bytes until both the write and an independent committed read
// have succeeded. A concurrent legacy writer's newer value is never removed.
export async function migrateLegacyAutosave({ storage, store, state }) {
  if (!storage) return null;
  const source = storage.getItem(LEGACY_AUTOSAVE_KEY);
  if (!source) return null;
  const entry = JSON.parse(source);
  prepareModelImport(entry?.data, state, { preserveCatalogs: false });
  if (typeof entry.savedAt !== 'string' || !Number.isFinite(Date.parse(entry.savedAt))) {
    throw new Error('Invalid legacy autosave timestamp');
  }
  const migrated = await store.migrate({
    savedAt: entry.savedAt, data: entry.data, source: 'legacy', revision: null,
  }, source);
  const verified = await store.get(migrated.id);
  if (!verified || JSON.stringify(verified.data) !== JSON.stringify(entry.data) || verified.savedAt !== entry.savedAt) {
    throw new Error('Legacy autosave verification failed');
  }
  if (storage.getItem(LEGACY_AUTOSAVE_KEY) === source) storage.removeItem(LEGACY_AUTOSAVE_KEY);
  return verified;
}
