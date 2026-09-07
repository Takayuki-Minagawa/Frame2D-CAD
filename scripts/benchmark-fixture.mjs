// Shared deterministic geometry for Node benchmarks and browser import fixtures.
// State is passed in so this module also works against an archived baseline.
export function buildBenchmarkState(AppState, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  const state = new AppState();
  state.meta = { ...state.meta, name: `benchmark-${count}`, createdAt: '2026-01-01T00:00:00.000Z' };
  const columns = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const x = (i % columns) * 6000;
    const y = Math.floor(i / columns) * 4000;
    const start = state.addNode(x, y);
    const end = state.addNode(x + 5000, y);
    state.addMember(start.id, end.id, { type: 'beam', levelId: 'L0' });
  }
  return state;
}

export function benchmarkQueries(count, samples = 8) {
  const columns = Math.ceil(Math.sqrt(count));
  return Array.from({ length: samples }, (_, i) => {
    const index = Math.floor(i * (count - 1) / Math.max(1, samples - 1));
    return { id: `M${index + 1}`, nodeId: index * 2 + 1,
      x: (index % columns) * 6000, y: Math.floor(index / columns) * 4000 };
  });
}
