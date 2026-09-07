// Diagnostic navigation changes the current view, never element geometry.
export function focusIssue(state, canvas, issue) {
  const ref = issue.elementId !== null && issue.elementId !== undefined ? issue : issue.targets?.[0];
  if (!ref) return false;
  const kind = ref.elementType;
  const collections = { node: 'nodes', member: 'members', surface: 'surfaces', load: 'loads', support: 'supports', level: 'levels' };
  const item = state[collections[kind]]?.find(value => value.id === ref.elementId);
  if (!item) return false;
  if (kind === 'level') {
    state.activeLevelId = item.id;
    state.clearSelection();
    return true;
  }
  if (item.levelId) state.activeLevelId = item.levelId;
  state.currentTool = 'select';
  // Make a filtered target visible; the toolbar is refreshed by the caller.
  const visibility = { member: 'showMembers', surface: 'showSurfaces', load: 'showLoads', support: 'showSupports' };
  if (visibility[kind]) state.updateSetting(visibility[kind], true);
  if (kind === 'member') {
    state.updateSetting('memberTypeFilter', 'all');
    state.updateSetting('sectionFilter', 'all');
  }
  state.select(kind, item.id);
  let points = [];
  if (kind === 'member') points = [state.getNode(item.startNodeId), state.getNode(item.endNodeId)];
  else if (kind === 'node' || kind === 'support') points = [item];
  else points = item.points?.length ? item.points : [{ x: item.x1, y: item.y1 }, { x: item.x2 ?? item.x1, y: item.y2 ?? item.y1 }];
  points = points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (!points.length) return true;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = canvas.logicalWidth || 600;
  const height = canvas.logicalHeight || 400;
  const spanX = Math.max(2000, maxX - minX);
  const spanY = Math.max(2000, maxY - minY);
  canvas.camera.scale = Math.max(0.005, Math.min(1, width * 0.7 / spanX, height * 0.7 / spanY));
  canvas.camera.offsetX = width / 2 - (minX + maxX) / 2 * canvas.camera.scale;
  canvas.camera.offsetY = height / 2 + (minY + maxY) / 2 * canvas.camera.scale;
  return true;
}
