# Renderer measurements, 2026-09-07

Node v22.18.0, Three.js 0.170.0, local macOS. Median of five complete operations,
milliseconds. Deterministic 100/1,000/10,000 beam fixtures from
`scripts/benchmark-fixture.mjs`; baseline renderer from commit
`2062b2ccba0366ba8efc56991b7ea91cf00960e9`;
both renderers used the shared domain API available at measurement time.
These are historical measurements of an uncommitted working tree, not a
performance guarantee for later revisions. `node test/render-benchmark.mjs --run`
always defaults to that fixed commit, including after merge. Override explicitly
with `node test/render-benchmark.mjs --run --baseline <commit-or-ref>`.
JSON output records `baselineRef`, the resolved full `baselineCommit`, and
`baselinePath`. The referenced history must be available locally; shallow clones
may need to fetch it. For broader measurements with recorded source hashes, see
[Performance verification](../../docs/performance.md).

| Members | Linear endpoint lookup | Index build + lookup | Baseline selection/rebuild | Current selection/material update | Baseline full rebuild | Current full rebuild |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.096 | 0.056 | 2.817 | 0.011 | 5.285 | 3.979 |
| 1,000 | 8.769 | 0.267 | 24.495 | 0.005 | 24.826 | 28.955 |
| 10,000 | 170.532 | 2.679 | 562.430 | 0.003 | 517.727 | 556.104 |

The 10,000-member lookup batch is about 64x faster including index construction.
Selection now touches the changed elements instead of rebuilding the scene;
submillisecond selection measurements should be read as negligible CPU work,
not as precise latency predictions. Both versions produced exactly 2 objects
per beam. Full rebuilds remain expensive and are slightly slower at 1,000 and
10,000 members. The new renderer also performs ID metadata/indexing and resource
bookkeeping; this measurement does not isolate their individual costs. This work does not claim a full-rebuild or GPU-throughput speedup.

Browser validation covered idle-frame stability, selection without geometry
replacement, clipping/isolation/focus controls, GLB output and OrbitControls
settling. These are behavioral checks, not repeatable latency measurements.
The maintained `tests/e2e/workflow.spec.js` exercises the integrated controls and
GLB download; `test/render-*.test.js` verifies renderer scheduling and geometry.

Unit tests additionally exercise both sides of all CAD clipping axes, actual
Raycaster picking behind a clipped member, multi-member 2D endpoint selection,
preview mutation before onUpdate, resize/input invalidation, and GLB loading to
verify dimensions, IDs, original colors and coordinate orientation.

These observations do not establish the plan's 30 fps or p95 100 ms targets.
The browser benchmark in `tests/e2e/browser-benchmark.mjs` records WebGL draw
calls, renderer memory and frame costs; use those measurements before considering
instancing or workers.
