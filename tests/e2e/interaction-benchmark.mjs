import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { installOfflineRoutes } from './offline.mjs';

const summarize = samples => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: samples.length, medianMs: +sorted[Math.floor(samples.length / 2)].toFixed(3),
    p95Ms: +sorted[Math.ceil(samples.length * 0.95) - 1].toFixed(3), samplesMs: samples.map(x => +x.toFixed(3)) };
};

// Real app, file import and physical pointer/keyboard input. Event timestamps
// through two RAF boundaries approximate presentation latency, not GPU completion.
export async function runInteractionBenchmarks(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  try {
    const requests = await installOfflineRoutes(context, url);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window._app?.autosave));
    // Suppress background persistence while measuring interaction/render costs.
    await page.evaluate(() => window._app.autosave.stop());
    const data = await page.evaluate(async () => {
      const { AppState } = await import('/js/state.js');
      const state = new AppState();
      state.meta.createdAt = '2026-01-01T00:00:00.000Z';
      for (let i = 0; i < 1000; i++) {
        const x = (i % 32) * 6000, y = Math.floor(i / 32) * 4000;
        const a = state.addNode(x, y), b = state.addNode(x + 5000, y);
        state.addMember(a.id, b.id, { type: 'beam' });
      }
      return state.toJSON();
    });
    const upload = async () => {
      await page.locator('#file-import').setInputFiles({ name: 'interaction-1000.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForFunction(() => window._app.state.members.length === 1000 && document.querySelector('#file-import').value === '');
    };
    await upload();
    await page.locator('#sel-tool').selectOption('select');
    const arm = (selector, event) => page.evaluate(({ selector, event }) => {
      window.__benchmarkPresentation = new Promise(resolve => {
        document.querySelector(selector).addEventListener(event, e => {
          const start = e.timeStamp;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
        }, { once: true });
      });
    }, { selector, event });
    const point = id => page.evaluate(id => {
      const { state, canvas2d } = window._app;
      const member = state.getMember(id), a = state.getNode(member.startNodeId), b = state.getNode(member.endNodeId);
      const p = canvas2d.worldToScreen((a.x + b.x) / 2, a.y), rect = canvas2d.canvas.getBoundingClientRect();
      return { x: p.x + rect.left, y: p.y + rect.top };
    }, id);
    const selections = [];
    for (let i = 0; i < 40; i++) {
      const id = `M${i % 2 + 1}`, p = await point(id);
      await arm('#canvas-2d', 'mousedown');
      await page.mouse.click(p.x, p.y);
      selections.push(await page.evaluate(() => window.__benchmarkPresentation));
      assert.equal(await page.evaluate(() => window._app.state.selectedMemberId), id);
    }
    const p = await point('M1');
    await page.mouse.click(p.x, p.y);
    const properties = [];
    for (let i = 0; i < 40; i++) {
      const value = i % 2 ? 5000 : 4500;
      await page.locator('#prop-end-x').fill(String(value));
      await arm('#prop-end-x', 'change');
      await page.locator('#prop-end-x').press('Tab');
      properties.push(await page.evaluate(() => window.__benchmarkPresentation));
      assert.equal(await page.evaluate(() => window._app.state.getNode(window._app.state.getMember('M1').endNodeId).x), value);
    }
    await page.evaluate(() => {
      const state = window._app;
      const frames = [];
      window.__benchmarkPan = { start: performance.now(), initialFrames: state.canvas2d.stats.frames, frames, active: true };
      const tick = t => { if (!window.__benchmarkPan.active) return; frames.push(t); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.mouse.move(600, 500);
    await page.mouse.down({ button: 'middle' });
    for (let i = 0; i < 120; i++) {
      await page.mouse.move(600 + Math.sin(i / 12) * 160, 500 + Math.cos(i / 12) * 100);
      await delay(16);
    }
    await page.mouse.up({ button: 'middle' });
    const pan = await page.evaluate(() => {
      const sample = window.__benchmarkPan; sample.active = false;
      const elapsedMs = performance.now() - sample.start, renderedFrames = window._app.canvas2d.stats.frames - sample.initialFrames;
      return { elapsedMs, renderedFrames, renderedFPS: renderedFrames * 1000 / elapsedMs,
        rafIntervalsMs: sample.frames.slice(1).map((t, i) => t - sample.frames[i]), inputEvents: 120, driverDelayMs: 16 };
    });
    const resourceCycles = [];
    const cdp = await context.newCDPSession(page);
    for (let i = 0; i < 10; i++) {
      await page.locator('#tab-2d').click();
      await upload();
      const beforeFrames = await page.evaluate(() => window._app.viewer3d?.stats.frames ?? 0);
      await page.locator('#tab-3d').click();
      await page.waitForFunction(before => window._app.viewer3d?.stats.frames > before && window._app.viewer3d.memberGroup.children.length > 0, beforeFrames);
      // History is measured separately; remove its intentional retained models
      // here so post-GC heap trends primarily reflect the renderer/reload path.
      await page.evaluate(() => window._app.history.clear());
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      const resources = await page.evaluate(() => {
        const viewer = window._app.viewer3d;
        return { geometries: viewer.renderer.info.memory.geometries, textures: viewer.renderer.info.memory.textures,
          programs: viewer.renderer.info.programs.length, memberObjects: viewer.memberGroup.children.length };
      });
      resourceCycles.push({ cycle: i + 1, ...resources, heapUsedBytes: heap.usedSize });
    }
    await delay(300); // Allow initial orbit damping to settle before idle sample.
    const beforeIdle = await page.evaluate(() => ({ plan: window._app.canvas2d.stats.frames, view: window._app.viewer3d.stats.frames }));
    await delay(300);
    const afterIdle = await page.evaluate(() => ({ plan: window._app.canvas2d.stats.frames, view: window._app.viewer3d.stats.frames }));
    const selection = summarize(selections), propertyEdit = summarize(properties);
    const reference = resourceCycles[0];
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.blocked, []);
    return { members: 1000, viewport: { width: 1440, height: 1000 }, sampleMethod: 'physical input event timestamp through two requestAnimationFrame boundaries',
      selection, propertyEdit, pan: { ...pan, rafIntervals: summarize(pan.rafIntervalsMs), rafIntervalsMs: undefined }, resourceCycles,
      idleWindowMs: 300, idleFrames: { plan: afterIdle.plan - beforeIdle.plan, view: afterIdle.view - beforeIdle.view },
      goals: { selectionP95Under100ms: selection.p95Ms <= 100, propertyP95Under100ms: propertyEdit.p95Ms <= 100,
        panAtLeast30FPS: pan.renderedFPS >= 30,
        rendererCountsStable: resourceCycles.every(c => ['geometries','textures','programs','memberObjects'].every(key => c[key] === reference[key])) },
      limitations: ['Chromium/SwiftShader only; no hardware-GPU or cross-browser performance guarantee.',
        'Pan frame rate includes physical-input driver pacing; zoom performance was not measured.',
        'Heap sampled after explicit GC and history clear; retained 50-entry history is measured separately in Node.',
        'Ten reload/view-switch cycles indicate resource trends, not a long-session memory bound.'] };
  } finally { await context.close(); }
}

// Independent bounded zoom experiment; does not repeat history or other metrics.
export async function runWheelZoomBenchmark(browser, url, { driver = 'playwright' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  try {
    const requests = await installOfflineRoutes(context, url);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window._app?.autosave));
    await page.evaluate(() => window._app.autosave.stop());
    const data = await page.evaluate(async () => {
      const { AppState } = await import('/js/state.js');
      const state = new AppState();
      state.meta.createdAt = '2026-01-01T00:00:00.000Z';
      for (let i = 0; i < 1000; i++) {
        const x = (i % 32) * 6000, y = Math.floor(i / 32) * 4000;
        const a = state.addNode(x, y), b = state.addNode(x + 5000, y);
        state.addMember(a.id, b.id, { type: 'beam' });
      }
      return state.toJSON();
    });
    await page.locator('#file-import').setInputFiles({ name: 'zoom-1000.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.waitForFunction(() => window._app.state.members.length === 1000 && document.querySelector('#file-import').value === '');
    await page.mouse.move(700, 500);
    const before = await page.evaluate(() => {
      window.__wheelInputCount = 0;
      document.querySelector('#canvas-2d').addEventListener('wheel', () => window.__wheelInputCount++);
      return { at: performance.now(), frames: window._app.canvas2d.stats.frames, scale: window._app.canvas2d.camera.scale };
    });
    const cdp = driver === 'cdp' ? await context.newCDPSession(page) : null;
    const sends = [], sendErrors = [];
    for (let i = 0; i < 120; i++) {
      const deltaY = i % 12 < 6 ? -40 : 40;
      if (cdp) {
        // Independent 16 ms sender: completion of one wheel event must not
        // throttle the next. Collect all replies after the input burst.
        sends.push(cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 500,
          deltaX: 0, deltaY }).catch(error => sendErrors.push(error.message)));
      } else await page.mouse.wheel(0, deltaY);
      await delay(16);
    }
    await Promise.all(sends);
    assert.deepEqual(sendErrors, []);
    await page.waitForFunction(() => window.__wheelInputCount === 120);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => ({ at: performance.now(), frames: window._app.canvas2d.stats.frames,
      scale: window._app.canvas2d.camera.scale, received: window.__wheelInputCount }));
    const elapsedMs = after.at - before.at, renderedFrames = after.frames - before.frames;
    assert.equal(after.received, 120);
    assert.notEqual(after.scale, before.scale);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.blocked, []);
    return { members: 1000, viewport: { width: 1440, height: 1000 }, driver, physicalWheelInputs: 120,
      receivedWheelInputs: after.received, driverDelayMs: 16, elapsedMs, renderedFrames,
      deliveredInputRate: after.received * 1000 / elapsedMs, renderedFPS: renderedFrames * 1000 / elapsedMs, initialScale: before.scale, finalScale: after.scale,
      goalAtLeast30FPS: after.received * 1000 / elapsedMs < 30 ? null : renderedFrames * 1000 / elapsedMs >= 30,
      goalAssessment: after.received * 1000 / elapsedMs < 30 ? 'not established: input delivery below 30 Hz' : renderedFrames * 1000 / elapsedMs >= 30 ? 'met in this capture' : 'not met in this capture',
      limitations: ['Chromium/SwiftShader and automation pacing only; not a hardware-GPU or other-browser guarantee.',
        'Frame counter measures actual 2D redraws, not completed GPU presentations; two trailing RAF boundaries included.'] };
  } finally { await context.close(); }
}
