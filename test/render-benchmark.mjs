// CPU-only before/after renderer comparison; run explicitly with --run.
// Uses a fixed baseline renderer, current shared domain API, identical
// fixtures and Three 0.170.0. No WebGL, frame-rate or GPU claims are made.
import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
register('./helpers/three-loader.mjs', import.meta.url);

if (process.argv.includes('--run')) {
  const baselineOption = process.argv.indexOf('--baseline');
  const baselineRef = baselineOption < 0 ? '2062b2ccba0366ba8efc56991b7ea91cf00960e9'
    : process.argv[baselineOption + 1];
  if (!baselineRef || baselineRef.startsWith('-')) throw new Error('--baseline requires a git commit or ref');
  const gitOptions = { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' };
  let baselineCommit;
  try {
    baselineCommit = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${baselineRef}^{commit}`], gitOptions).trim();
  } catch {
    throw new Error(`Baseline ${baselineRef} is unavailable. Fetch its history or pass --baseline <ref>.`);
  }
  const THREE = await import('three');
  const { Viewer3D } = await import('../js/viewer3d.js');
  const { AppState } = await import('../js/state.js');
  const { RenderIndex } = await import('../js/render/model-index.js');
  const { buildBenchmarkState } = await import('../scripts/benchmark-fixture.mjs');
  const base = new URL('../js/', import.meta.url);
  const original = execFileSync('git', ['show', `${baselineCommit}:js/viewer3d.js`], gitOptions);
  const baselineSource = original.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, base).href}'`)
    .replace(/from '(three[^']*)'/g, (_, specifier) => `from '${import.meta.resolve(specifier)}'`);
  const { Viewer3D: Baseline } = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const setup = (Class, state) => {
    const viewer = new Class({ hidden: false }, state);
    viewer._initialized = true; viewer._pendingInitialCamera = false;
    viewer.scene = new THREE.Scene(); viewer.camera = new THREE.PerspectiveCamera();
    viewer.controls = { target: new THREE.Vector3(), update() {}, removeEventListener() {}, dispose() {} };
    for (const kind of ['member', 'surface', 'node', 'load', 'support']) {
      viewer[`${kind}Group`] = new THREE.Group(); viewer.scene.add(viewer[`${kind}Group`]);
    }
    return viewer;
  };
  const measure = action => {
    const samples = [];
    for (let i = 0; i < 5; i++) { const start = performance.now(); action(i); samples.push(performance.now() - start); }
    return +samples.sort((a, b) => a - b)[2].toFixed(3);
  };
  const results = [];
  for (const count of [100, 1000, 10000]) {
    const state = buildBenchmarkState(AppState, count);
    const index = new RenderIndex();
    let checksum = 0;
    const linearLookupMs = measure(() => { for (const m of state.members) {
      checksum += state.nodes.find(n => n.id === m.startNodeId).x;
      checksum += state.nodes.find(n => n.id === m.endNodeId).x;
    } });
    const indexedLookupIncludingBuildMs = measure(() => {
      index.update(state, true);
      for (const m of state.members) {
        checksum += index.nodesById.get(m.startNodeId).x;
        checksum += index.nodesById.get(m.endNodeId).x;
      }
    });
    const old = setup(Baseline, state), current = setup(Viewer3D, state);
    const baselineRebuildMs = measure(() => old.rebuildScene());
    const currentRebuildMs = measure(() => current.rebuildScene());
    const baselineSelectionMs = measure(i => { state.select('member', `M${i + 1}`); old.rebuildScene(); });
    const currentSelectionMs = measure(i => { state.select('member', `M${i + 1}`); current.updateSelection(); });
    if (old.memberGroup.children.length !== current.memberGroup.children.length) throw new Error('Geometry count changed');
    results.push({ members: count, linearLookupMs, indexedLookupIncludingBuildMs, baselineRebuildMs,
      currentRebuildMs, baselineSelectionMs, currentSelectionMs, memberObjects: current.memberGroup.children.length, checksum });
    old.dispose(); current.dispose();
  }
  console.log(JSON.stringify({ baselineRef, baselineCommit, baselinePath: 'js/viewer3d.js',
    node: process.version, three: THREE.REVISION, statistic: 'median of 5; milliseconds; CPU only', results }, null, 2));
}
