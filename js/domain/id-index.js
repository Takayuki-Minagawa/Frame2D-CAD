// Index entries retain their array position so direct replacement/splice/id
// edits are detected even when callers bypass the public mutators. Public
// writes invalidate at the state boundary; construction alone does no work.
export function createIdIndex(items) {
  const entries = new Map();
  items.forEach((item, index) => {
    if (!entries.has(item.id)) entries.set(item.id, { item, index });
  });
  return { items, length: items.length, entries };
}

export function indexedItem(index, items, id) {
  const entry = index.entries.get(id);
  if (entry && items[entry.index] === entry.item && entry.item.id === id) return entry.item;
  // Missing/stale IDs can result from direct edits without a revision bump.
  // Preserve Array.find semantics in that exceptional path, including numeric
  // versus string IDs and undefined for misses.
  return items.find(item => item.id === id);
}
