// Stable model-check records. Text is formatted at the UI boundary.
export function createDiagnostic(severity, code, params = {}, ref = {}) {
  const targets = ref.targets || (ref.elementType && ref.elementId !== null && ref.elementId !== undefined
    ? [{ elementType: ref.elementType, elementId: ref.elementId }] : []);
  return { severity, code, messageKey: `diagnostic.${code}`, params, ...ref, targets };
}

export function diagnosticTargets(issue) {
  return issue.targets || (issue.elementType && issue.elementId !== null && issue.elementId !== undefined
    ? [{ elementType: issue.elementType, elementId: issue.elementId }] : []);
}

export function filterDiagnostics(issues, { severity = 'all', elementType = 'all' } = {}) {
  return issues.filter(issue => (severity === 'all' || issue.severity === severity) &&
    (elementType === 'all' || diagnosticTargets(issue).some(ref => ref.elementType === elementType)));
}

// Read-only navigation descriptor. The app decides how to reveal the level,
// select in 2D/3D and frame bounds; diagnostics never silently edit filters.
export function resolveDiagnosticTarget(state, ref) {
  const { elementType, elementId } = ref;
  const collections = { node: 'nodes', member: 'members', surface: 'surfaces', load: 'loads', support: 'supports', level: 'levels' };
  const element = state[collections[elementType]]?.find(item => item.id === elementId);
  if (!element) return null;
  let points;
  if (elementType === 'member') points = [state.getNode(element.startNodeId), state.getNode(element.endNodeId)];
  else if (elementType === 'surface' && Array.isArray(element.points)) points = element.points;
  else if (elementType === 'surface' || elementType === 'load') points = [
    { x: element.x1, y: element.y1 }, { x: element.x2 ?? element.x1, y: element.y2 ?? element.y1 },
  ];
  else points = [element];
  points = points.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const bounds = points.length ? {
    minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)),
  } : null;
  const levelId = elementType === 'level' ? element.id : element.levelId ?? null;
  const visibility = { member: 'isMemberVisible', surface: 'isSurfaceVisible', load: 'isLoadVisible', support: 'isSupportVisible' };
  const visible = visibility[elementType] && typeof state[visibility[elementType]] === 'function'
    ? state[visibility[elementType]](element) : true;
  return { elementType, elementId, levelId, bounds, hidden: !visible,
    requiresLevelChange: levelId !== null && levelId !== state.activeLevelId };
}
