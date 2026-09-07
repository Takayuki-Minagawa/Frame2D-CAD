// A drag is a provisional coordinate edit. Commit restores the original
// coordinates before entering the history transaction, so a whole gesture is
// one undo step and Escape / a return to origin leave Undo and Redo intact.
import { beginProvisionalEdit, endProvisionalEdit } from '../domain/provisional-edit.js';

export function beginDrag(manager) {
  manager._dragOriginalNodes = new Map(manager.state.nodes.map(node => [node.id, { x: node.x, y: node.y }]));
  beginProvisionalEdit(manager.state);
}
export function finishDrag(manager, commit) {
  const originals = manager._dragOriginalNodes;
  if (!originals) return false;
  const changes = [];
  for (const [id, start] of originals) {
    const node = manager.state.getNode(id);
    if (!node) continue;
    if (node.x !== start.x || node.y !== start.y) changes.push({ id, x: node.x, y: node.y });
    Object.assign(node, start);
  }
  manager._dragOriginalNodes = null;
  endProvisionalEdit(manager.state);
  if (!commit || !changes.length) return false;
  return manager.history.transact(() => {
    for (const { id, x, y } of changes) manager.state.updateNode(id, { x, y });
    return true;
  });
}
export function previewNode(manager, id, props) {
  const node = manager.state.getNode(id);
  if (node) Object.assign(node, props);
}
