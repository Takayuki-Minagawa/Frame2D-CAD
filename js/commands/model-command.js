// History owns rollback and snapshot retention. Commands decide whether
// persisted content changed; tool/selection-only edits do not create history.
function contentKey(state) {
  return JSON.stringify({ model: state.toJSON(), materialCatalog: state.materialCatalog,
    sectionCatalog: state.sectionCatalog, springCatalog: state.springCatalog });
}
export function executeModelMutation(state, mutate) {
  const before = contentKey(state);
  const revision = state.revision;
  const result = mutate();
  const changed = before !== contentKey(state);
  if (!changed) state.revision = revision;
  return { changed, result };
}
export function executeModelCommand(history, state, mutate) {
  let result;
  const changed = history.transact(() => {
    const outcome = executeModelMutation(state, mutate);
    result = outcome.result;
    return outcome.changed;
  });
  return { changed: Boolean(changed), result };
}
