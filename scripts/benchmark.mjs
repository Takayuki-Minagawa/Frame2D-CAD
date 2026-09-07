import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { serialize } from 'node:v8';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { buildBenchmarkState, benchmarkQueries } from './benchmark-fixture.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} needs a value`);
  return args[index + 1];
};
const root = path.resolve(option('--source-root', repo));
const iterations = Number(option('--iterations', '3'));
const sizes = option('--sizes', '100,1000,10000').split(',').map(Number);
assert.ok(Number.isInteger(iterations) && iterations > 0);
assert.ok(sizes.every(size => Number.isInteger(size) && size > 0));
const { AppState } = await import(pathToFileURL(path.join(root, 'js/state.js')));
const { History } = await import(pathToFileURL(path.join(root, 'js/history.js')));
const round = number => Math.round(number * 1000) / 1000;
function measure(fn, repetitions = iterations) {
  const samples = [];
  let result;
  for (let i = 0; i < repetitions; i++) {
    const start = performance.now();
    result = fn();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return { result, timing: { medianMs: round(sorted[Math.floor(sorted.length / 2)]), samplesMs: samples.map(round) } };
}
async function sourceHash(directory) {
  const hash = createHash('sha256');
  for (const entry of (await readdir(directory, { recursive: true })).filter(f => f.endsWith('.js')).sort()) {
    hash.update(entry).update(await readFile(path.join(directory, entry)));
  }
  return hash.digest('hex');
}
let revision = null;
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* archived source */ }
const report = {
  benchmarkVersion: 2, capturedAt: new Date().toISOString(), sourceRoot: root,
  sourceLabel: option('--label', revision || 'archived-source'), sourceSha256: await sourceHash(path.join(root, 'js')),
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
  iterations, queryCount: 8, units: 'milliseconds per complete operation/batch', results: [],
};
// Small warm-up only; full-size samples remain visible in the raw output.
const warm = buildBenchmarkState(AppState, 10);
warm.loadJSON(warm.toJSON());
for (const count of (args.includes('--zoom-only') ? [] : sizes)) {
  const construction = measure(() => buildBenchmarkState(AppState, count));
  const state = construction.result;
  assert.equal(state.members.length, count);
  assert.equal(state.nodes.length, count * 2);
  const queries = benchmarkQueries(count);
  const lookups = measure(() => {
    for (const q of queries) {
      assert.equal(state.getMember(q.id)?.id, q.id);
      assert.equal(state.getNode(q.nodeId)?.id, q.nodeId);
    }
  });
  const search = measure(() => {
    for (const q of queries) {
      assert.equal(state.findNodeAt(q.x, q.y, 1)?.id, q.nodeId);
      assert.equal(state.findMemberAt(q.x + 2500, q.y, 1)?.id, q.id);
    }
    assert.equal(state.findMemberAt(-1000, -1000, 1), null);
  });
  const serialization = measure(() => JSON.stringify(state.toJSON()));
  const json = serialization.result;
  const load = measure(() => { const target = new AppState(); target.loadJSON(JSON.parse(json)); return target; });
  assert.deepEqual(load.result.toJSON(), state.toJSON());
  const snapshot = measure(() => state.snapshot());
  assert.deepEqual(snapshot.result, state.toJSON());
  const history = new History(state);
  const save = measure(() => history.save());
  history.clear();
  const originalGrid = state.settings.gridSize;
  const changedGrid = originalGrid === 500 ? 1000 : 500;
  const transact = measure(() => {
    history.clear();
    state.updateSetting('gridSize', originalGrid);
    assert.ok(history.transact(() => { state.updateSetting('gridSize', changedGrid); return true; }));
  });
  const undoSamples = [], redoSamples = [];
  for (let i = 0; i < iterations; i++) {
    const undo = measure(() => history.undo(), 1);
    assert.equal(undo.result, true);
    assert.equal(state.settings.gridSize, originalGrid);
    undoSamples.push(undo.timing.samplesMs[0]);
    const redo = measure(() => history.redo(), 1);
    assert.equal(redo.result, true);
    assert.equal(state.settings.gridSize, changedGrid);
    redoSamples.push(redo.timing.samplesMs[0]);
  }
  const summarize = samples => ({ medianMs: [...samples].sort((a,b) => a-b)[Math.floor(samples.length/2)], samplesMs: samples });
  report.results.push({ members: count, nodes: count * 2, jsonBytes: Buffer.byteLength(json),
    construction: construction.timing, idLookupBatch: lookups.timing, hitTestBatch: search.timing,
    serialization: serialization.timing, load: load.timing, snapshot: snapshot.timing,
    historySave: save.timing, historyTransaction: transact.timing,
    undo: summarize(undoSamples), redo: summarize(redoSamples) });
  if (args.includes('--extended')) {
    history.clear();
    state.updateSetting('gridSize', 1000);
    global.gc?.();
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    for (let i = 0; i < 55; i++) {
      history.save();
      state.updateSetting('gridSize', 2000 + i * 100);
    }
    const retainMs = performance.now() - start;
    global.gc?.();
    const afterHeap = process.memoryUsage().heapUsed;
    assert.equal(history.undoStack.length, 50);
    const approximateSerializedBytes = serialize(history.undoStack[0]).byteLength * 50;
    const undoStart = performance.now();
    for (let i = 0; i < 50; i++) assert.equal(history.undo(), true);
    const undo50Ms = performance.now() - undoStart;
    assert.equal(history.undo(), false);
    assert.equal(state.settings.gridSize, 2400);
    const redoStart = performance.now();
    for (let i = 0; i < 50; i++) assert.equal(history.redo(), true);
    const redo50Ms = performance.now() - redoStart;
    assert.equal(state.settings.gridSize, 7400);
    report.results.at(-1).history50 = { writes: 55, retained: 50, gcAvailable: Boolean(global.gc),
      retainMs: round(retainMs), undo50Ms: round(undo50Ms), redo50Ms: round(redo50Ms),
      heapBeforeBytes: beforeHeap, heapAfterBytes: afterHeap, heapDeltaBytes: afterHeap - beforeHeap,
      approximateSerializedBytes, verifiedUndoRedo: true };
    history.clear();
  }
  process.stderr.write(`Benchmarked ${count} members\n`);
}
if (args.includes('--zoom-only')) {
  const { runZoomOnly } = await import('../tests/e2e/browser-benchmark.mjs');
  report.browser = await runZoomOnly({ root, driver: args.includes('--zoom-cdp') ? 'cdp' : 'playwright' });
} else if (args.includes('--browser') || args.includes('--extended')) {
  const { runBrowserBenchmarks } = await import('../tests/e2e/browser-benchmark.mjs');
  report.browser = await runBrowserBenchmarks({ root, sizes, iterations, extended: args.includes('--extended') });
}
report.sourceSha256After = await sourceHash(path.join(root, 'js'));
report.sourceChangedDuringRun = report.sourceSha256 !== report.sourceSha256After;
const output = `${JSON.stringify(report, null, 2)}\n`;
if (args.includes('--output')) await writeFile(path.resolve(option('--output')), output);
process.stdout.write(output);
