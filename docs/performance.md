# Performance and offline browser checks

## Validation and measured refactor snapshot

**54 passed (40.1 s)**: 18 scenarios each on Chromium, Firefox, and WebKit, against the ready version 1.2.0 browser code including the latest rendering, property-command and navigation fixes. No failures, skips, external dependency requests, or unresolved runtime blockers. All browser runtimes were already cached.

Coverage uses real UI events and downloaded files:

- Import → canvas selection → endpoint property edit → keyboard Undo/Redo → JSON download → reimport, comparing complete model data and displayed property values.
- Malformed JSON and unsupported schemas report errors while preserving the model and redo history.
- Native IndexedDB quota-error injection preserves existing generations; UI retry succeeds; reload opens recovery history; restoration supports Undo/Redo.
- Physical mouse drag → `autosave.saveNow()` → Escape never persists provisional coordinates. Both fresh unsaved work and work with an earlier checkpoint remain saveable. Mouseup commits a drag that is saved and can be undone.
- Place support → switch to Select → Ctrl+Z/Ctrl+Y keeps `state.currentTool` and the visible tool selector equal and restores the correct support count.
- Theme changes immediately redraw 2D; geometry edits in 3D expand the clipping slider; a PNG exported with the 2D canvas hidden matches current pixels by SHA-256 after decoding, and matches the subsequent visible redraw.
- Numeric no-ops retain working end-condition/spring bindings; one Undo restores the spring edit.
- 3D clipping, flip, isolation and focus controls; actual GLB download decoded to verify binary format, meter units, transformed vertex positions and the 2.5 m cut plane.
- Diagnostic severity/type filtering and target navigation, including a level change and visible target coordinates. Additional navigation cases reveal isolated/clipped targets, frame a zero-length target in 2D when needed, and verify the same reveal callback from analysis results.
- Line/rectangular-area load previews, acknowledgement, downloaded nodal loads, force/first-moment conservation, and unchanged CAD data.
- Synthetic analysis-result upload, deformation scale, projection, member navigation and stale-result rejection. This validates UI rendering, not a numerical solver.

Read-only `window._app` inspection supplies live camera coordinates and assertions. Focus-navigation fixtures also seed runtime selection/diagnostic records before activating real target buttons. Persisted model mutations use UI controls; the drag regression explicitly invokes the authorized autosave controller while the physical mouse button is held. Storage failure injection patches the native storage boundary, not app code.

## Run locally

```sh
npx playwright test
npx playwright test --project=chromium
E2E_REVIEW_DIR=/tmp/element-modeler-review-ui npx playwright test
node scripts/benchmark.mjs --output /tmp/benchmark-current.json
node scripts/benchmark.mjs --browser --output /tmp/benchmark-current-browser.json
node --expose-gc scripts/benchmark.mjs --extended --label measured-refactor --output /tmp/benchmark-extended.json
node scripts/benchmark.mjs --zoom-only --label measured-wheel-zoom --output /tmp/benchmark-zoom.json
node scripts/benchmark.mjs --zoom-only --zoom-cdp --label measured-cdp-wheel-zoom --output /tmp/benchmark-zoom-cdp.json
```

Requires installed `@playwright/test`, exactly `three@0.170.0`, and matching Chromium/Firefox/WebKit runtimes. macOS caches default to `~/Library/Caches/ms-playwright`; install missing runtimes with `npx playwright install chromium firefox webkit`. The suite starts a Node HTTP server on `127.0.0.1:4173` (`E2E_PORT` overrides the port), uses one worker, and does not reuse a potentially stale server. Listening/browser launch may require sandbox escalation. SwiftShader flags apply only to Chromium; the other projects use their defaults.

`tests/e2e/offline.mjs` serves all `https://cdn.jsdelivr.net/npm/three@0.170.0/` requests from `node_modules/three`, including OrbitControls, GLTFExporter and transitive addons. It rejects a different installed Three.js version, blocks other external requests, and disables service workers. No internet is needed after installing dependencies/runtimes. The app import map stays unchanged. Node tests must stay scoped to `node --test test/*.test.js`.

Failure traces/screenshots go to ignored `test-results/e2e`. The styled review screenshots are outside the repository in `/tmp/element-modeler-review-ui`: `3d-clipping-controls.png`, `recovery-dialog.png`, `analysis-workbench.png`, and `analysis-results.png`. Set `E2E_REVIEW_DIR` to regenerate them; only Chromium writes review images. No binary review artifacts are checked in.

## Benchmark method and provenance

The fixture constructs 100 / 1,000 / 10,000 independent beams in a deterministic grid: 5,000 mm length, 6,000 mm X pitch, 4,000 mm Y pitch, two unique nodes per beam, level L0, default section. Current fixture metadata is fixed. Each operation reports three samples and the median, following a 10-member model warm-up. These are diagnostic timings, not CI latency thresholds.

Construction calls the production constructor, `addNode`, and `addMember`. The ID batch performs eight member and eight node lookups. The hit-test batch performs eight node hits, eight beam-midpoint hits, and one member miss; its values are **per batch**, not per query. Serialization includes `toJSON` and `JSON.stringify`; load includes constructing state, parsing JSON and `loadJSON`. History measures save, a grid-size transaction, undo and redo. Transaction timing includes clearing history and restoring the initial grid size. Assertions verify element counts, lookup identities, complete JSON round trips, snapshots, and restored setting values.

The browser harness instantiates production Canvas2D/Viewer3D in an isolated page against the selected source root. It measures 2D redraw, 3D rebuild, render submission, selection (old versions fall back to rebuilding), and idle draw calls. Draw/geometry/program counts and available Chromium heap estimates are recorded. These timings exclude app bootstrap and import UI, and do not measure GPU completion or FPS. The renderer was ANGLE/SwiftShader, so results are not hardware-GPU claims. Browser zeroes mean below recorded clock precision; the new idle path avoids canvas work.

Use `--sizes 100,1000,10000`, `--iterations 3`, `--source-root PATH` and `--label LABEL` to vary the run. Reports include Node/browser versions, CPU/platform, JS source SHA-256, source location, byte counts and all samples. Current runs hash JS paths/content before and after measurement and flag concurrent source changes.

The original baseline was frozen from `main@2062b2ccba0366ba8efc56991b7ea91cf00960e9` and captured at 2026-09-07T01:24:29.017Z. Its numbers are preserved below. The initial helper used runtime `createdAt` plus a fixed `created` metadata field; geometry was deterministic, and the helper now fixes `createdAt` directly. Browser baseline was captured separately at 2026-09-07T01:28:59.656Z from the same archived JS hash.

The measured refactor snapshot was captured at **2026-09-07T01:44:16.588Z**, after all three browser projects finished. JS hashes before/after matched: `5689e1d7bca55f1c320ae1df5ca7542e95066d5739b244feda8d8e37255dfd67`. Both runs used Apple M4 Max (14 logical CPUs), macOS arm64, Node v22.18.0; browser captures used Chromium 153.0.8010.12 and Three.js 0.170.0. Concurrent unrelated system work and runtime warm-up can still affect small timings.

Recreate the archived source without touching the shared checkout:

```sh
mkdir -p /tmp/element-modeler-baseline
git archive 2062b2ccba0366ba8efc56991b7ea91cf00960e9 js package.json | tar -x -C /tmp/element-modeler-baseline
node scripts/benchmark.mjs --source-root /tmp/element-modeler-baseline \
  --label main@2062b2ccba0366ba8efc56991b7ea91cf00960e9 --browser --output /tmp/benchmark-main.json
```

## Preserved baseline → measured refactor comparison

Each cell is **main → measured refactor**, median milliseconds for the complete operation/batch.

| Node operation | 100 members | 1,000 members | 10,000 members |
|---|---:|---:|---:|
| Construction | 0.161 → 0.268 | 1.181 → 1.16 | 4.116 → 5.518 |
| ID lookup batch | 0.055 → 0.007 | 0.05 → 0.002 | 0.313 → 0.002 |
| Hit-test batch | 1.325 → 0.461 | 10.688 → 1.529 | 1176.677 → 10.118 |
| JSON serialization | 0.117 → 0.185 | 0.769 → 0.835 | 7.339 → 7.716 |
| JSON parse + load | 0.494 → 0.309 | 1.781 → 1.606 | 14.374 → 14.617 |
| Snapshot | 0.217 → 0.274 | 1.928 → 2.017 | 20.949 → 20.549 |
| History save | 0.227 → 0.232 | 2.025 → 2.073 | 21.821 → 24.089 |
| History transaction | 0.247 → 0.257 | 1.958 → 2.158 | 20.378 → 23.794 |
| Undo | 0.405 → 0.491 | 2.363 → 4.601 | 25.956 → 50.741 |
| Redo | 0.426 → 0.501 | 2.74 → 4.353 | 26.952 → 52.487 |

| Browser operation | 100 members | 1,000 members | 10,000 members |
|---|---:|---:|---:|
| 2D redraw | 0.4 → 0.3 | 8.7 → 1.8 | 116.3 → 28.9 |
| 3D rebuild | 2.7 → 3.1 | 27.6 → 20.5 | 675.5 → 308.8 |
| 3D render submission | 1.3 → 1.3 | 7.1 → 6.2 | 39.7 → 38.3 |
| Selection + display update | 2.4 → 0.3 | 27.6 → 1.2 | 1268.7 → 23 |
| Idle 2D draw call | 0.3 → 0 | 2 → 0 | 890.4 → 0 |

At 10,000 members, the hit-test batch fell from **1,176.677 to 10.118 ms** (about 116× faster), and browser selection/display update from **1,268.7 to 23.0 ms** (about 55× faster). Undo/Redo increased to about 51–52 ms; the new history retains richer model/catalog/runtime data. Construction and serialization fluctuate near the original range. Keep these distinct costs visible; one combined score would hide tradeoffs.

## Bounded interaction, history and resource experiment

The extended measurement is a separate **measured refactor snapshot**, not a final release measurement. The recorded experiment completed in 25.5 seconds (capture timestamp to output file), below the 60-second limit. No optimizations were made from these results. It uses the real app at 1,000 members, a 1440×1000 viewport, local Three.js 0.170.0 and Chromium/SwiftShader. Selection/property latency uses 40 physical-input samples each, from the input event timestamp through two animation-frame boundaries; it approximates presentation latency and does not measure GPU completion. Pan uses 120 physical middle-button moves paced by a 16 ms driver delay.

| Plan goal | Observation | Assessment |
|---|---|---|
| 1,000-member selection p95 ≤100 ms | 32.5 ms (40 samples) | Met in this capture |
| 1,000-member property p95 ≤100 ms | 30.2 ms (40 samples) | Met in this capture |
| Pan ≥30 FPS | 31.37 rendered FPS, 121 redraws over 3.857 s | Met narrowly |
| Driver-paced wheel zoom | 19.88 delivered inputs/s and 19.88 redraws/s | Renderer target **not established**: input rate below 30 Hz |
| Independently paced CDP wheel zoom ≥30 FPS | 58.47 delivered inputs/s and 55.06 redraws/s | Met in the supplemental capture |
| No idle continuous redraw | 0 2D and 0 3D frames over a settled 300 ms window | Observed for this window |
| Selection avoids full geometry rebuild | 0 rebuilds at 100/1,000/10,000 members | Observed in renderer harness |
| Stable repeated 3D resources | Ten import + 2D/3D-switch cycles: 2,002 geometries, 0 textures, 3 programs, 2,000 member objects throughout | Graphics counts stable; not a leak-free guarantee |

Post-GC JS heap rose from **16.60 MB to 17.43 MB** over the ten reload cycles (+0.83 MB). History was cleared before each GC to separate intentional history retention from renderer/resource trends. The short upward heap trend is recorded; it is insufficient to distinguish runtime warm-up/retention from a leak, so long-session memory remains unverified. Pan includes automation pacing and has little margin above the provisional target. Other browsers and hardware GPUs were not benchmarked. At 10,000 members, real-input p95/pan/zoom remain unmeasured.

For history, each size receives 55 committed setting changes, verifies the cap at 50 snapshots, then performs and verifies all 50 undo and redo operations. Heap values are measured with explicit Node GC before/after retention; serialization is a separate approximation (one retained snapshot’s V8 serialized bytes ×50), not GPU or total process memory.

| Members | Retained heap increase | Approx. serialized snapshots | 55 saves | 50 undo | 50 redo |
|---|---:|---:|---:|---:|---:|
| 100 | 4.06 MB | 2.04 MB | 14.95 ms | 26.00 ms | 26.28 ms |
| 1,000 | 37.18 MB | 18.77 MB | 126.04 ms | 228.81 ms | 228.48 ms |
| 10,000 | 368.38 MB | 188.44 MB | 1370.82 ms | 2545.76 ms | 2738.68 ms |

At 10,000 members, 50 retained entries add **368.38 MB** of JS heap. The plan specified measurement rather than a memory ceiling; this remains a substantial cost and does not justify claiming large-model memory goals are solved.

### Separate physical wheel-zoom capture

At 1,000 members, **120 physical wheel inputs**, alternating zoom direction in groups of six and paced with the same 16 ms driver delay as pan, produced **120 redraws over 6,036.3 ms: 19.88 FPS**. All 120 wheel events reached the canvas and the camera scale changed from 0.05 to 0.02736. Because input delivery was also only **19.88 inputs/s**, renderer ability to meet the 30 FPS target was **not established by this driver-paced capture**. The original raw goal flag below is superseded by this interpretation; its numerical samples are preserved. This independent experiment did not rerun history or replace any previous samples. It includes Playwright wheel delivery/automation pacing and two trailing RAF boundaries; the number is not a hardware renderer throughput estimate. No optimization was attempted.

Capture time: 2026-09-07T01:57:16.528Z; JS source hashes before/after matched. Chromium 153.0.8010.12, local Three.js 0.170.0, 1440×1000 viewport.

### Supplemental independently paced CDP wheel zoom

The validity correction sends `Input.dispatchMouseEvent(type: mouseWheel)` every 16 ms without awaiting each send; replies are collected and awaited after the burst. This separates the intended input cadence from individual driver acknowledgements. All **120 inputs were delivered over 2,052.2 ms (58.47 inputs/s)**. The canvas performed **113 redraws (55.06 FPS)**. Thus the provisional **30 FPS zoom target was met in this capture**. Fewer redraws than inputs are consistent with coalescing updates into display frames. This remains a Chromium/SwiftShader, 1,000-member observation; it is not a hardware-GPU or cross-browser guarantee, and counters do not measure GPU completion.

Capture time: 2026-09-07T02:00:41.633Z; source hashes before/after matched. The original wheel and earlier p95/history/resource data remain unchanged.

<details>
<summary>Supplemental CDP wheel-zoom raw capture and provenance</summary>

```json
{"benchmarkVersion":2,"capturedAt":"2026-09-07T02:00:41.633Z","sourceRoot":"/Users/mina25/element-modeler","sourceLabel":"measured-cdp-wheel-zoom","sourceSha256":"14155072963202027db83f1392389c9d595ca667de6a7c6a7f4a28763261dd57","environment":{"node":"v22.18.0","platform":"darwin","arch":"arm64","cpu":"Apple M4 Max","logicalCpus":14},"iterations":3,"queryCount":8,"units":"milliseconds per complete operation/batch","results":[],"browser":{"chromium":"153.0.8010.12","three":"0.170.0","zoom":{"members":1000,"viewport":{"width":1440,"height":1000},"driver":"cdp","physicalWheelInputs":120,"receivedWheelInputs":120,"driverDelayMs":16,"elapsedMs":2052.2000000178814,"renderedFrames":113,"deliveredInputRate":58.473832959241015,"renderedFPS":55.06285936995195,"initialScale":0.05,"finalScale":0.027357832119538236,"goalAtLeast30FPS":true,"goalAssessment":"met in this capture","limitations":["Chromium/SwiftShader and automation pacing only; not a hardware-GPU or other-browser guarantee.","Frame counter measures actual 2D redraws, not completed GPU presentations; two trailing RAF boundaries included."]}},"sourceSha256After":"14155072963202027db83f1392389c9d595ca667de6a7c6a7f4a28763261dd57","sourceChangedDuringRun":false}
```

</details>

<details>
<summary>Separate wheel-zoom raw capture and provenance</summary>

```json
{"benchmarkVersion":2,"capturedAt":"2026-09-07T01:57:16.528Z","sourceRoot":"/Users/mina25/element-modeler","sourceLabel":"measured-wheel-zoom","sourceSha256":"14155072963202027db83f1392389c9d595ca667de6a7c6a7f4a28763261dd57","environment":{"node":"v22.18.0","platform":"darwin","arch":"arm64","cpu":"Apple M4 Max","logicalCpus":14},"iterations":3,"queryCount":8,"units":"milliseconds per complete operation/batch","results":[],"browser":{"chromium":"153.0.8010.12","three":"0.170.0","zoom":{"members":1000,"viewport":{"width":1440,"height":1000},"physicalWheelInputs":120,"receivedWheelInputs":120,"driverDelayMs":16,"elapsedMs":6036.299999982119,"renderedFrames":120,"renderedFPS":19.879727647790116,"initialScale":0.05,"finalScale":0.027357832119538236,"goalAtLeast30FPS":false,"limitations":["Chromium/SwiftShader and automation pacing only; not a hardware-GPU or other-browser guarantee.","Frame counter measures actual 2D redraws, not completed GPU presentations; two trailing RAF boundaries included."]}},"sourceSha256After":"14155072963202027db83f1392389c9d595ca667de6a7c6a7f4a28763261dd57","sourceChangedDuringRun":false}
```

</details>

<details>
<summary>Extended measurement provenance and all interaction/resource/history samples</summary>

```json
{"benchmarkVersion":2,"capturedAt":"2026-09-07T01:52:08.206Z","sourceLabel":"measured-refactor-extended","sourceSha256":"b3c9d0291746e43bf4a05658b33d2626cc8b917a97c0578c7b7509cb1470c2f9","sourceSha256After":"b3c9d0291746e43bf4a05658b33d2626cc8b917a97c0578c7b7509cb1470c2f9","sourceChangedDuringRun":false,"environment":{"node":"v22.18.0","platform":"darwin","arch":"arm64","cpu":"Apple M4 Max","logicalCpus":14},"history50":[{"members":100,"writes":55,"retained":50,"gcAvailable":true,"retainMs":14.949,"undo50Ms":25.995,"redo50Ms":26.278,"heapBeforeBytes":5959704,"heapAfterBytes":10021536,"heapDeltaBytes":4061832,"approximateSerializedBytes":2041950,"verifiedUndoRedo":true},{"members":1000,"writes":55,"retained":50,"gcAvailable":true,"retainMs":126.042,"undo50Ms":228.814,"redo50Ms":228.477,"heapBeforeBytes":8602360,"heapAfterBytes":45786192,"heapDeltaBytes":37183832,"approximateSerializedBytes":18769050,"verifiedUndoRedo":true},{"members":10000,"writes":55,"retained":50,"gcAvailable":true,"retainMs":1370.82,"undo50Ms":2545.761,"redo50Ms":2738.678,"heapBeforeBytes":33431160,"heapAfterBytes":401815832,"heapDeltaBytes":368384672,"approximateSerializedBytes":188440300,"verifiedUndoRedo":true}],"interactions":{"members":1000,"viewport":{"width":1440,"height":1000},"sampleMethod":"physical input event timestamp through two requestAnimationFrame boundaries","selection":{"count":40,"medianMs":31.8,"p95Ms":32.5,"samplesMs":[21.8,27.7,31.7,31.7,31.9,32,31.9,31.8,32,31.4,32.5,31.8,31.8,32.2,32,31.6,31.7,31.4,31.6,32.3,32,32,32.2,31.8,30,32.9,32.1,32,31.6,32.5,32.1,31.5,31.8,32.2,31.5,31,30.3,24.8,31.4,31.9]},"propertyEdit":{"count":40,"medianMs":29.5,"p95Ms":30.2,"samplesMs":[19.7,27.8,25.9,28.5,29.2,28.5,28.8,29.8,29.6,29.3,23.8,24.1,22,29.6,29.9,29.8,29.5,30.1,30.2,29.5,30.1,30.1,29.9,29.4,29.8,29.8,28.7,29.4,29.4,29.4,29.5,28.8,29.8,29.5,30.2,29.6,29.4,29,30.8,29.7]},"pan":{"elapsedMs":3857.0999999940395,"renderedFrames":121,"renderedFPS":31.370718933962557,"inputEvents":120,"driverDelayMs":16,"rafIntervals":{"count":230,"medianMs":16.7,"p95Ms":16.7,"samplesMs":[16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.8,16.6,16.6,16.7,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.6,16.8,16.6,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.7,16.7,16.6,16.6,16.7,16.7,16.7,16.7,16.6,16.6,16.7,16.7,16.7,16.7,16.6,16.6,16.8,16.6,16.6,16.7,16.7,16.7,16.6,16.7,16.6,16.8,16.6,16.6,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.7,16.7,16.6,16.7,16.6,16.7,16.6,16.8,16.6,16.7,16.6,16.7,16.7,16.7,16.6,16.6,16.8,16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.8,16.6,16.7,16.7,16.6,16.6,16.8,16.6,16.7,16.7,16.6,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.7,16.6,16.6,16.7,16.7,16.7,16.7,16.6,16.7,16.6,16.7,16.7,16.7,16.6,16.6,16.7,16.6,16.8,16.6,16.7,16.6,16.7,16.7,16.7,16.6,16.7,16.6]}},"resourceCycles":[{"cycle":1,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":16600120},{"cycle":2,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":16949368},{"cycle":3,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17006840},{"cycle":4,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17080536},{"cycle":5,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17205792},{"cycle":6,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17290080},{"cycle":7,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17290148},{"cycle":8,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17324800},{"cycle":9,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17369192},{"cycle":10,"geometries":2002,"textures":0,"programs":3,"memberObjects":2000,"heapUsedBytes":17434052}],"idleWindowMs":300,"idleFrames":{"plan":0,"view":0},"goals":{"selectionP95Under100ms":true,"propertyP95Under100ms":true,"panAtLeast30FPS":true,"rendererCountsStable":true},"limitations":["Chromium/SwiftShader only; no hardware-GPU or cross-browser performance guarantee.","Pan frame rate includes physical-input driver pacing; zoom performance was not measured.","Heap sampled after explicit GC and history clear; retained 50-entry history is measured separately in Node.","Ten reload/view-switch cycles indicate resource trends, not a long-session memory bound."]}}
```

</details>

<details>
<summary>Original Node baseline — all samples unchanged</summary>

```json
{
  "benchmarkVersion": 1,
  "capturedAt": "2026-09-07T01:24:29.017Z",
  "sourceRoot": "/private/tmp/element-modeler-baseline",
  "sourceLabel": "main@2062b2ccba0366ba8efc56991b7ea91cf00960e9",
  "sourceSha256": "9e0e8e840dc4944701f97404934de0d90f4e3a0d5b91b298f20a1af3ea1693d2",
  "environment": {"node":"v22.18.0","platform":"darwin","arch":"arm64","cpu":"Apple M4 Max","logicalCpus":14},
  "iterations": 3,
  "queryCount": 8,
  "units": "milliseconds per complete operation/batch",
  "results": [
    {"members":100,"nodes":200,"jsonBytes":42068,"construction":{"medianMs":0.161,"samplesMs":[0.233,0.155,0.161]},"idLookupBatch":{"medianMs":0.055,"samplesMs":[0.055,0.08,0.014]},"hitTestBatch":{"medianMs":1.325,"samplesMs":[1.381,1.325,0.383]},"serialization":{"medianMs":0.117,"samplesMs":[0.297,0.117,0.108]},"load":{"medianMs":0.494,"samplesMs":[0.774,0.391,0.494]},"snapshot":{"medianMs":0.217,"samplesMs":[0.283,0.217,0.208]},"historySave":{"medianMs":0.227,"samplesMs":[0.227,0.261,0.203]},"historyTransaction":{"medianMs":0.247,"samplesMs":[0.391,0.218,0.247]},"undo":{"medianMs":0.405,"samplesMs":[0.405,0.341,0.534]},"redo":{"medianMs":0.426,"samplesMs":[0.368,0.527,0.426]}},
    {"members":1000,"nodes":2000,"jsonBytes":395137,"construction":{"medianMs":1.181,"samplesMs":[1.488,1.037,1.181]},"idLookupBatch":{"medianMs":0.05,"samplesMs":[0.069,0.05,0.046]},"hitTestBatch":{"medianMs":10.688,"samplesMs":[11.885,10.688,10.125]},"serialization":{"medianMs":0.769,"samplesMs":[0.934,0.769,0.665]},"load":{"medianMs":1.781,"samplesMs":[1.988,1.504,1.781]},"snapshot":{"medianMs":1.928,"samplesMs":[2.136,1.928,1.887]},"historySave":{"medianMs":2.025,"samplesMs":[1.832,2.091,2.025]},"historyTransaction":{"medianMs":1.958,"samplesMs":[1.958,2.002,1.835]},"undo":{"medianMs":2.363,"samplesMs":[2.495,2.363,2.239]},"redo":{"medianMs":2.74,"samplesMs":[2.77,2.74,2.598]}},
    {"members":10000,"nodes":20000,"jsonBytes":3990256,"construction":{"medianMs":4.116,"samplesMs":[3.81,4.116,5.385]},"idLookupBatch":{"medianMs":0.313,"samplesMs":[0.477,0.313,0.3]},"hitTestBatch":{"medianMs":1176.677,"samplesMs":[1410.287,1141.65,1176.677]},"serialization":{"medianMs":7.339,"samplesMs":[7.929,6.532,7.339]},"load":{"medianMs":14.374,"samplesMs":[14.374,22.031,14.027]},"snapshot":{"medianMs":20.949,"samplesMs":[19.858,22.931,20.949]},"historySave":{"medianMs":21.821,"samplesMs":[21.821,22.543,20.472]},"historyTransaction":{"medianMs":20.378,"samplesMs":[21.635,20.341,20.378]},"undo":{"medianMs":25.956,"samplesMs":[27.166,25.607,25.956]},"redo":{"medianMs":26.952,"samplesMs":[26.952,26.576,27.073]}}
  ]
}
```

</details>

<details>
<summary>Archived-main browser baseline — all browser samples and provenance</summary>

```json
{
  "benchmarkVersion": 1,
  "capturedAt": "2026-09-07T01:28:59.656Z",
  "sourceRoot": "/private/tmp/element-modeler-baseline",
  "sourceLabel": "main@2062b2ccba0366ba8efc56991b7ea91cf00960e9",
  "sourceSha256": "9e0e8e840dc4944701f97404934de0d90f4e3a0d5b91b298f20a1af3ea1693d2",
  "environment": {"node":"v22.18.0","platform":"darwin","arch":"arm64","cpu":"Apple M4 Max","logicalCpus":14},
  "iterations": 3,
  "browser": {"chromium":"153.0.8010.12","three":"0.170.0","viewport":{"width":1200,"height":900},"results":[{"members":100,"draw2D":{"medianMs":0.4,"samplesMs":[4.2,0.4,0.3]},"rebuild3D":{"medianMs":2.7,"samplesMs":[5.7,2.7,2.6]},"render3D":{"medianMs":1.3,"samplesMs":[36,1.3,0.7]},"selection":{"medianMs":2.4,"samplesMs":[4.1,2.4,2.3]},"idleDraw":{"medianMs":0.3,"samplesMs":[0.3,0.3,0.2]},"rendererInfo":{"render":{"frame":3,"calls":407,"triangles":23630,"points":0,"lines":1305},"memory":{"geometries":204,"textures":0},"programs":5},"memberObjects":200,"heapUsedBytes":11200000,"webglRenderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"},{"members":1000,"draw2D":{"medianMs":8.7,"samplesMs":[11.2,8.7,8.7]},"rebuild3D":{"medianMs":27.6,"samplesMs":[33.6,27.6,26.3]},"render3D":{"medianMs":7.1,"samplesMs":[26.5,7.1,4.1]},"selection":{"medianMs":27.6,"samplesMs":[38,27.4,27.6]},"idleDraw":{"medianMs":2,"samplesMs":[2,2,18.6]},"rendererInfo":{"render":{"frame":3,"calls":4007,"triangles":236030,"points":0,"lines":12105},"memory":{"geometries":2004,"textures":0},"programs":5},"memberObjects":2000,"heapUsedBytes":50400000,"webglRenderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"},{"members":10000,"draw2D":{"medianMs":116.3,"samplesMs":[136.4,115.8,116.3]},"rebuild3D":{"medianMs":675.5,"samplesMs":[960,675.5,428.9]},"render3D":{"medianMs":39.7,"samplesMs":[107.6,39.7,35.7]},"selection":{"medianMs":1268.7,"samplesMs":[1341.4,1074.5,1268.7]},"idleDraw":{"medianMs":890.4,"samplesMs":[890.6,890.4,112.8]},"rendererInfo":{"render":{"frame":3,"calls":30739,"triangles":1808766,"points":0,"lines":92553},"memory":{"geometries":15412,"textures":0},"programs":5},"memberObjects":20000,"heapUsedBytes":322000000,"webglRenderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"}]}
}
```

</details>

<details>
<summary>Measured refactor capture — all samples and source hashes</summary>

```json
{
  "benchmarkVersion": 1,
  "capturedAt": "2026-09-07T01:44:16.588Z",
  "sourceRoot": "/Users/mina25/element-modeler",
  "sourceLabel": "post-Newton-final",
  "sourceSha256": "5689e1d7bca55f1c320ae1df5ca7542e95066d5739b244feda8d8e37255dfd67",
  "environment": {"node":"v22.18.0","platform":"darwin","arch":"arm64","cpu":"Apple M4 Max","logicalCpus":14},
  "iterations": 3,
  "queryCount": 8,
  "units": "milliseconds per complete operation/batch",
  "results": [
    {"members":100,"nodes":200,"jsonBytes":42031,"construction":{"medianMs":0.268,"samplesMs":[0.268,0.187,0.322]},"idLookupBatch":{"medianMs":0.007,"samplesMs":[0.117,0.007,0.003]},"hitTestBatch":{"medianMs":0.461,"samplesMs":[0.512,0.461,0.391]},"serialization":{"medianMs":0.185,"samplesMs":[0.185,0.101,0.258]},"load":{"medianMs":0.309,"samplesMs":[0.469,0.309,0.289]},"snapshot":{"medianMs":0.274,"samplesMs":[0.274,0.23,0.378]},"historySave":{"medianMs":0.232,"samplesMs":[0.372,0.232,0.22]},"historyTransaction":{"medianMs":0.257,"samplesMs":[0.257,0.221,0.315]},"undo":{"medianMs":0.491,"samplesMs":[0.698,0.491,0.488]},"redo":{"medianMs":0.501,"samplesMs":[0.666,0.47,0.501]}},
    {"members":1000,"nodes":2000,"jsonBytes":395100,"construction":{"medianMs":1.16,"samplesMs":[1.775,1.16,0.951]},"idLookupBatch":{"medianMs":0.002,"samplesMs":[0.252,0.002,0.002]},"hitTestBatch":{"medianMs":1.529,"samplesMs":[3.274,1.417,1.529]},"serialization":{"medianMs":0.835,"samplesMs":[0.934,0.784,0.835]},"load":{"medianMs":1.606,"samplesMs":[1.824,1.532,1.606]},"snapshot":{"medianMs":2.017,"samplesMs":[2.083,1.984,2.017]},"historySave":{"medianMs":2.073,"samplesMs":[2.073,2.024,2.119]},"historyTransaction":{"medianMs":2.158,"samplesMs":[2.158,2.36,1.961]},"undo":{"medianMs":4.601,"samplesMs":[4.331,4.601,4.622]},"redo":{"medianMs":4.353,"samplesMs":[4.297,4.353,4.375]}},
    {"members":10000,"nodes":20000,"jsonBytes":3990219,"construction":{"medianMs":5.518,"samplesMs":[4.484,7.316,5.518]},"idLookupBatch":{"medianMs":0.002,"samplesMs":[1.7,0.002,0.002]},"hitTestBatch":{"medianMs":10.118,"samplesMs":[11.958,10.118,9.533]},"serialization":{"medianMs":7.716,"samplesMs":[8.847,6.578,7.716]},"load":{"medianMs":14.617,"samplesMs":[15.407,14.617,14.403]},"snapshot":{"medianMs":20.549,"samplesMs":[20.549,20.265,28.802]},"historySave":{"medianMs":24.089,"samplesMs":[22.515,25.469,24.089]},"historyTransaction":{"medianMs":23.794,"samplesMs":[22.992,23.794,24.138]},"undo":{"medianMs":50.741,"samplesMs":[50.741,52.988,49.55]},"redo":{"medianMs":52.487,"samplesMs":[50.103,52.487,53.23]}}
  ],
  "browser": {"chromium":"153.0.8010.12","three":"0.170.0","viewport":{"width":1200,"height":900},"results":[{"members":100,"draw2D":{"medianMs":0.3,"samplesMs":[2.3,0.3,0.3]},"rebuild3D":{"medianMs":3.1,"samplesMs":[6.2,3.1,2.7]},"render3D":{"medianMs":1.3,"samplesMs":[21.6,1.3,0.8]},"selection":{"medianMs":0.3,"samplesMs":[0.4,0.3,0.1]},"idleDraw":{"medianMs":0,"samplesMs":[0,0,0]},"rendererInfo":{"render":{"frame":3,"calls":407,"triangles":23630,"points":0,"lines":1305},"memory":{"geometries":204,"textures":0},"programs":5},"memberObjects":200,"heapUsedBytes":12700000,"webglRenderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"},{"members":1000,"draw2D":{"medianMs":1.8,"samplesMs":[4.3,1.7,1.8]},"rebuild3D":{"medianMs":20.5,"samplesMs":[27.7,20.5,19.8]},"render3D":{"medianMs":6.2,"samplesMs":[27.6,6.2,4.1]},"selection":{"medianMs":1.2,"samplesMs":[1.2,1.2,1]},"idleDraw":{"medianMs":0,"samplesMs":[0,0,0]},"rendererInfo":{"render":{"frame":3,"calls":4007,"triangles":236030,"points":0,"lines":12105},"memory":{"geometries":2004,"textures":0},"programs":5},"memberObjects":2000,"heapUsedBytes":50400000,"webglRenderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"},{"members":10000,"draw2D":{"medianMs":28.9,"samplesMs":[30.8,26.9,28.9]},"rebuild3D":{"medianMs":308.8,"samplesMs":[196.1,476.9,308.8]},"render3D":{"medianMs":38.3,"samplesMs":[100.6,38.3,35.9]},"selection":{"medianMs":23,"samplesMs":[23,22.5,23]},"idleDraw":{"medianMs":0,"samplesMs":[0.1,0,0]},"rendererInfo":{"render":{"frame":3,"calls":30739,"triangles":1808766,"points":0,"lines":92553},"memory":{"geometries":15412,"textures":0},"programs":5},"memberObjects":20000,"heapUsedBytes":342000000,"webglRenderer":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"}]},
  "sourceSha256After": "5689e1d7bca55f1c320ae1df5ca7542e95066d5739b244feda8d8e37255dfd67",
  "sourceChangedDuringRun": false
}
```

</details>
