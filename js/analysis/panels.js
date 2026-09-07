// Standalone DOM modules. Parent owns file picking, state revisions and mounting.
import { buildResultView } from './results.js';
import { previewToPointLoads } from './load-distribution.js';

const NS = 'http://www.w3.org/2000/svg';
const messages = {
  en: {
    results: 'Linear static results', preview: 'Load assignment', select: 'Select', node: 'Node', member: 'Member / branch',
    position: 'Position [mm]', original: 'Original force [N]', moment: 'Moment at origin [N·mm]', residual: 'Conservation residual',
    tributary: 'Tributary width per support', export: 'Export nodal assignments',
    view: 'grey original / blue deformed. Z-up, mm. Forces N, moments N·mm.', scale: 'Deformation',
    accept: 'I accept endpoint lumping; distributed-load beam bending is omitted.',
    required: 'Accept the lumping limitation before exporting.',
    exported: 'Nodal assignments exported. Replace the original load to avoid double counting.',
    stale: 'Model changed. Reload results for the current model.',
    line: 'Endpoint lumping conserves force and moment, but omits distributed-load member bending/fixed-end forces.',
    slab: 'Uniform one-way tributary distribution only; no slab stiffness/two-way action. Nodal export uses static lumping.',
    gravity: 'Density self-weight explicitly omitted; this is a load-only analysis.',
  },
  ja: {
    results: '線形静的解析結果', preview: '荷重配分プレビュー', select: '選択', node: '節点', member: '部材 / 枝番',
    position: '位置 [mm]', original: '元荷重の合力 [N]', moment: '原点まわりのモーメント [N·mm]', residual: '配分前後の残差',
    tributary: '支持部材ごとの支配幅', export: '配分後の節点荷重を出力',
    view: '灰色：元形状 / 青色：変形後。Z上向き、mm。力 N、モーメント N·mm。', scale: '変形倍率',
    accept: '端部節点への集中配分を了承します。分布荷重による部材内の曲げ・固定端力は再現しません。',
    required: '集中配分の制限事項に同意してから出力してください。',
    exported: '節点荷重を出力しました。二重計上を避けるため元荷重を置き換えてください。',
    stale: 'モデルが変更されました。現在のモデルに対応する解析結果を読み直してください。',
    line: '端部節点への集中配分は合力とモーメントを保存しますが、分布荷重による部材内の曲げ・固定端力は再現しません。',
    slab: '等分布荷重を受ける矩形床の一方向配分のみ。床剛性・二方向作用は対象外。節点荷重出力は端部への集中配分です。',
    gravity: '密度からの自重を明示的に省略しています。指定した節点荷重のみの解析です。',
  },
};
function element(doc, tag, text) {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function table(doc, headers, rows) {
  const out = element(doc, 'table');
  const header = element(doc, 'tr');
  headers.forEach(text => header.append(element(doc, 'th', text)));
  out.append(header);
  for (const cells of rows) {
    const row = element(doc, 'tr');
    cells.forEach(text => row.append(element(doc, 'td', text)));
    out.append(row);
  }
  return out;
}
const values = row => row.map(v => Number(v).toPrecision(6)).join(', ');
function drawing(doc, paths, plane) {
  const indices = plane === 'yz' ? [1, 2] : plane === 'xy' ? [0, 1] : [0, 2];
  const ranges = [[Infinity, -Infinity], [Infinity, -Infinity]];
  for (const path of paths) for (const point of path.points) {
    indices.forEach((axis, i) => {
      ranges[i][0] = Math.min(ranges[i][0], point[axis]);
      ranges[i][1] = Math.max(ranges[i][1], point[axis]);
    });
  }
  const factor = Math.min(540/Math.max(1, ranges[0][1]-ranges[0][0]), 280/Math.max(1, ranges[1][1]-ranges[1][0]));
  const project = p => [(p[indices[0]]-ranges[0][0])*factor+30, 330-(p[indices[1]]-ranges[1][0])*factor];
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 360');
  svg.style.width = '100%'; svg.style.maxHeight = '420px';
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Structural preview ${plane.toUpperCase()}`);
  for (const path of paths) {
    const line = doc.createElementNS(NS, 'polyline');
    line.setAttribute('points', path.points.map(p => project(p).join(',')).join(' '));
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', path.color);
    line.setAttribute('stroke-width', '2');
    const title = doc.createElementNS(NS, 'title'); title.textContent = path.label; line.append(title);
    svg.append(line);
  }
  return svg;
}

/** Returns {dispose, invalidate}; call invalidate immediately on model edits.
 * Selection callback: ({elementId, sourceId, sourceBranch}). No state mutation.
 */
export async function mountResultsPanel(container, model, result, { scale = 1, plane = 'xz', language = 'en', onSelect = () => {} } = {}) {
  const t = messages[language] || messages.en;
  const view = await buildResultView(model, result, { scale });
  const doc = container.ownerDocument;
  const root = element(doc, 'section'); root.setAttribute('aria-label', t.results);
  root.append(element(doc, 'h3', `${t.results} — ${view.loadCase}`));
  root.append(element(doc, 'p', `${t.scale} ×${scale}; ${t.view}`));
  view.warnings.forEach(warning => root.append(element(doc, 'p', warning === messages.en.gravity ? t.gravity : warning)));
  const plot = drawing(doc, view.members.flatMap(m => [
    { points: m.original, color: '#888', label: `${m.sourceId}/${m.sourceBranch} original` },
    { points: m.deformed, color: '#168ce0', label: `${m.sourceId}/${m.sourceBranch} deformed` },
  ]), plane);
  root.append(plot);
  root.append(table(doc, [t.node, 'ux, uy, uz [mm]; rx, ry, rz [rad]', 'Fx, Fy, Fz [N]; Mx, My, Mz [N·mm]'],
    view.nodes.map(n => [n.id, values(n.displacement), values(n.reaction)])));
  const handlers = [];
  for (const member of view.members) {
    const button = element(doc, 'button', `${t.select} ${member.sourceId}/${member.sourceBranch}`);
    button.type = 'button';
    const handler = () => onSelect({ elementId: member.id, sourceId: member.sourceId, sourceBranch: member.sourceBranch });
    button.addEventListener('click', handler); handlers.push([button, handler]); root.append(button);
  }
  container.append(root);
  const cleanup = () => handlers.forEach(([button, handler]) => button.removeEventListener('click', handler));
  return {
    dispose() { cleanup(); root.remove(); },
    invalidate() { cleanup(); root.replaceChildren(element(doc, 'p', t.stale)); },
  };
}

/** onExport receives explicit nodal loads after the user accepts static lumping. */
export function mountLoadPreview(container, preview, { onSelect = () => {}, onExport = () => {}, firstId = 1, plane = 'xy', language = 'en' } = {}) {
  const t = messages[language] || messages.en;
  if (!preview.conservation?.passed) throw new Error('Conserved preview required');
  const doc = container.ownerDocument, root = element(doc, 'section');
  root.setAttribute('aria-label', t.preview);
  root.append(element(doc, 'h3', `${t.preview} — ${preview.sourceId ?? preview.kind}`));
  root.append(element(doc, 'p', preview.kind === 'line' ? t.line : t.slab));
  if (preview.tributaryWidth !== undefined) root.append(element(doc, 'p', `${t.tributary}: ${preview.tributaryWidth} mm`));
  const lines = preview.lines || [preview];
  root.append(drawing(doc, lines.map(line => ({ points: [line.start, line.end], color: '#168ce0', label: `Member ${line.elementId}` })), plane));
  root.append(table(doc, [t.member, t.node, 'Fx, Fy, Fz [N]', t.position], preview.targets.map(row =>
    [`${row.sourceId}/${row.sourceBranch}`, row.nodeId, values(row.force), values(row.position)])));
  root.append(element(doc, 'p', `${t.original}: ${values(preview.conservation.original.force)}; ${t.moment}: ${values(preview.conservation.original.moment)}`));
  root.append(element(doc, 'p', `${t.residual}: F ${values(preview.conservation.forceResidual)}; M ${values(preview.conservation.momentResidual)}`));
  const handlers = [];
  const bind = (button, handler) => { button.type = 'button'; button.addEventListener('click', handler); handlers.push([button, handler]); root.append(button); };
  for (const line of lines) {
    const row = line.targets[0];
    bind(element(doc, 'button', `${t.select} ${row.sourceId}/${row.sourceBranch}`),
      () => onSelect({ elementId: row.elementId, sourceId: row.sourceId, sourceBranch: row.sourceBranch }));
  }
  const label = element(doc, 'label');
  const accept = element(doc, 'input'); accept.type = 'checkbox';
  label.append(accept, doc.createTextNode(` ${t.accept}`));
  root.append(label);
  const output = element(doc, 'p'); output.setAttribute('role', 'status');
  bind(element(doc, 'button', t.export), () => {
    if (!accept.checked) { output.textContent = t.required; return; }
    onExport(previewToPointLoads(preview, { firstId, acknowledgeLumping: true }));
    output.textContent = t.exported;
  });
  root.append(output); container.append(root);
  return { dispose() { handlers.forEach(([button, handler]) => button.removeEventListener('click', handler)); root.remove(); } };
}
