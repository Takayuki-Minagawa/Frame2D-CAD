// Generate a CAD file and its exact solver-neutral counterpart from public APIs.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppState } from '../js/state.js';
import { buildAnalysisModel } from '../js/analysis-export.js';

const folder = process.argv[2];
if (!folder) throw new Error('Usage: node scripts/analysis-cad-demo.mjs OUTPUT_DIRECTORY');
const state = new AppState();
state.meta.name = 'rigid-cantilever-cad';
const start = state.addNode(0, 0), end = state.addNode(3000, 0);
state.addMember(start.id, end.id, {
  type: 'beam', levelId: 'L0', endI: { condition: 'rigid' }, endJ: { condition: 'rigid' },
});
state.addSupport(0, 0, { levelId: 'L0', dx: true, dy: true, dz: true, rx: true, ry: true, rz: true });
state.addLoad('pointLoad', { x1: 3000, y1: 0, levelId: 'L0', loadCase: 'LL', fz: -1000 });
state.updateAnalysisSettings({ selfWeightMode: 'includedInDL' });
await mkdir(folder, { recursive: true });
for (const [name, model] of [['cantilever.cad.json', state.toJSON()], ['cantilever.analysis.json', buildAnalysisModel(state)]]) {
  const destination = path.resolve(folder, name);
  await writeFile(destination, `${JSON.stringify(model, null, 2)}\n`, { flag: 'wx' });
  console.log(destination);
}
