import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from './local-server.mjs';
import { installOfflineRoutes } from './offline.mjs';

// Isolated renderer harness: runs the production classes without app bootstrap,
// allowing the same measurements against git-archived and current modules.
export async function runBrowserBenchmarks({ root, sizes, iterations, extended = false }) {
  const server = await startServer(root);
  let browser;
  try {
    browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
    const results = [];
    for (const count of sizes) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
      try {
        const requests = await installOfflineRoutes(context, server.url);
        await context.route('**/__benchmark_fixture.mjs', route => route.fulfill({ path: fileURLToPath(new URL('../../scripts/benchmark-fixture.mjs', import.meta.url)), contentType: 'text/javascript' }));
        await context.route('**/__benchmark', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>body{margin:0}.panel{width:1100px;height:400px}</style><div class="panel"><canvas id="plan"></canvas></div><div id="view" class="panel"></div><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>` }));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${server.url}/__benchmark`);
        const result = await page.evaluate(async ({ count, iterations }) => {
          const [{ AppState }, { Canvas2D }, { Viewer3D }, { buildBenchmarkState }] = await Promise.all([
            import('/js/state.js'), import('/js/canvas2d.js'), import('/js/viewer3d.js'), import('/__benchmark_fixture.mjs'),
          ]);
          const state = buildBenchmarkState(AppState, count);
          const canvas = new Canvas2D(document.querySelector('#plan'), state);
          const viewer = new Viewer3D(document.querySelector('#view'), state);
          const summarize = samples => ({ medianMs: +[...samples].sort((a,b) => a-b)[Math.floor(samples.length / 2)].toFixed(3), samplesMs: samples.map(x => +x.toFixed(3)) });
          const measure = (action, before = () => {}) => {
            const samples = [];
            for (let i = 0; i < iterations; i++) { before(i); const start = performance.now(); action(i); samples.push(performance.now() - start); }
            return summarize(samples);
          };
          viewer.init();
          // Fit all fixture geometry in the plan viewport using the public camera.
          canvas.camera = { offsetX: 20, offsetY: 380, scale: Math.min(1060 / (Math.ceil(Math.sqrt(count)) * 6000), 360 / (Math.ceil(count / Math.ceil(Math.sqrt(count))) * 4000)) };
          const draw2D = measure(() => canvas.draw(), () => { state.updateNode(state.nodes[0].id, { x: 0 }); });
          const rebuild3D = measure(() => viewer.rebuildScene());
          const render3D = measure(() => viewer.renderer.render(viewer.scene, viewer.camera));
          const info = JSON.parse(JSON.stringify({ render: viewer.renderer.info.render, memory: viewer.renderer.info.memory, programs: viewer.renderer.info.programs?.length }));
          const rebuildsBeforeSelection = viewer.stats?.rebuilds ?? null;
          const selection = measure(i => {
            state.select('member', `M${i % count + 1}`);
            canvas.draw();
            if (typeof viewer.updateSelection === 'function') viewer.updateSelection();
            else viewer.rebuildScene();
          });
          const selectionGeometryRebuilds = rebuildsBeforeSelection === null ? null : viewer.stats.rebuilds - rebuildsBeforeSelection;
          const idleDraw = measure(() => canvas.draw());
          const gl = viewer.renderer.getContext();
          const extension = gl.getExtension('WEBGL_debug_renderer_info');
          const webglRenderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          const heapUsedBytes = performance.memory?.usedJSHeapSize ?? null;
          const memberObjects = viewer.memberGroup.children.length;
          canvas.dispose?.();
          viewer.dispose();
          return { members: count, draw2D, rebuild3D, render3D, selection, selectionGeometryRebuilds, idleDraw, rendererInfo: info, memberObjects, heapUsedBytes, webglRenderer };
        }, { count, iterations });
        assert.ok(result.memberObjects > 0, 'renderer must build member objects');
        assert.ok(result.rendererInfo.render.calls > 0, 'renderer must submit draw calls');
        assert.deepEqual(errors, [], 'browser page errors');
        assert.deepEqual(requests.blocked, [], 'unexpected network dependencies');
        results.push(result);
        process.stderr.write(`Browser benchmarked ${count} members\n`);
      } finally { await context.close(); }
    }
    const report = { chromium: browser.version(), three: '0.170.0', viewport: { width: 1200, height: 900 }, results };
    if (extended) {
      const { runInteractionBenchmarks } = await import('./interaction-benchmark.mjs');
      report.interactions = await runInteractionBenchmarks(browser, server.url);
    }
    return report;
  } finally { await browser?.close(); await server.close(); }
}

export async function runZoomOnly({ root, driver = 'playwright' }) {
  const server = await startServer(root);
  let browser;
  try {
    browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
    const { runWheelZoomBenchmark } = await import('./interaction-benchmark.mjs');
    return { chromium: browser.version(), three: '0.170.0', zoom: await runWheelZoomBenchmark(browser, server.url, { driver }) };
  } finally { await browser?.close(); await server.close(); }
}
