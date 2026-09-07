// Render-owned indexes: never mutate AppState or retain stale undo/import arrays.
export class RenderIndex {
  update(state, force = false) {
    const arrays = ['nodes', 'members', 'surfaces', 'loads', 'supports', 'levels'];
    if (!force && this.revision === state.revision && arrays.every(key =>
      this[key] === state[key] && this[`${key}Length`] === state[key]?.length)) return false;
    this.revision = state.revision;
    for (const key of arrays) {
      this[key] = state[key];
      this[`${key}Length`] = state[key]?.length;
      this[`${key}ById`] = new Map((state[key] || []).map(item => [item.id, item]));
    }
    this.memberNodeIds = new Set();
    this.membersByLevel = new Map();
    for (const member of state.members || []) {
      this.memberNodeIds.add(member.startNodeId);
      this.memberNodeIds.add(member.endNodeId);
      const bucket = this.membersByLevel.get(member.levelId) || [];
      bucket.push(member);
      this.membersByLevel.set(member.levelId, bucket);
    }
    return true;
  }
}

export function selectedElements(state) {
  const picks = new Map();
  for (const id of state.selectedMemberIds || []) picks.set(`member:${id}`, { kind: 'member', id });
  for (const kind of ['member', 'surface', 'node', 'load', 'support']) {
    const id = state[`selected${kind[0].toUpperCase()}${kind.slice(1)}Id`];
    if (id !== null && id !== undefined) picks.set(`${kind}:${id}`, { kind, id });
  }
  return picks;
}

// Small display/runtime stamp; model arrays are covered by revision + identity.
// Legacy callers that edit geometry directly must use requestRebuild({force:true}).
export function displayStamp(state) {
  return JSON.stringify([state.revision, state.activeLevelId, state.settings, state.levels]);
}
