// Interaction previews are not committed model data and must never be saved.
// Weak membership is runtime-only: it cannot leak into files or snapshots.
const active = new WeakSet();
export const beginProvisionalEdit = state => active.add(state);
export const endProvisionalEdit = state => active.delete(state);
export const hasProvisionalEdit = state => active.has(state);
