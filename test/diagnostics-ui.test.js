import test from 'node:test';
import assert from 'node:assert/strict';
import { uiHarness } from './helpers/ui-harness.js';
import { createDiagnostic, filterDiagnostics, resolveDiagnosticTarget } from '../js/domain/diagnostics.js';
import { formatDiagnostic } from '../js/ui/diagnostic-messages.js';
import { buildAnalysisPreflight } from '../js/analysis-preflight.js';
import { setLang } from '../js/i18n.js';

function beam(state, x = 0) {
  const a = state.addNode(x, 0), b = state.addNode(x + 1000, 0);
  return state.addMember(a.id, b.id);
}

test('model diagnostics are structured, localized, complete and safely escaped', context => {
  const { ui, state, diagnostics, get, history } = uiHarness(context);
  for (let i = 0; i < 30; i++) state.addNode(i * 1000, 0);
  state.nodes[0].id = '<img src=x onerror=bad()>';
  const issues = state.validateModel();
  assert.equal(issues.length, 30);
  assert.deepEqual(issues[1].targets, [{ elementType: 'node', elementId: state.nodes[1].id }]);
  assert.equal(issues[0].messageKey, 'diagnostic.orphan-node');
  ui.renderModelCheck();
  assert.equal(diagnostics.querySelectorAll('[data-diagnostic-target]').length, 30);
  assert.match(diagnostics.innerHTML, /&lt;img/);
  assert.doesNotMatch(diagnostics.innerHTML, /<img/);
  const before = state.snapshot();
  get('diagnostic-severity').change('error');
  assert.equal(diagnostics.querySelectorAll('[data-diagnostic-target]').length, 0);
  get('diagnostic-severity').change('all');
  assert.equal(diagnostics.querySelectorAll('[data-diagnostic-target]').length, 30);
  assert.deepEqual(state.snapshot(), before);
  assert.equal(history.undoStack.length, 0);
  assert.match(formatDiagnostic(issues[1], 'en'), /not connected/);
  assert.match(formatDiagnostic(issues[1], 'ja'), /孤立/);
  setLang('en'); ui.renderModelCheck();
  assert.match(diagnostics.innerHTML, /not connected/);
  assert.equal(get('diagnostic-severity').value, 'all');
  setLang('ja');
});

test('diagnostic focus uses clicked refs and resolves hidden or stale targets at activation', context => {
  const selected = [], filters = [];
  const { ui, state, diagnostics, get } = uiHarness(context, undefined, {
    onFocusIssue: issue => selected.push(issue), onDiagnosticFilterChange: value => filters.push(value),
  });
  const member = beam(state);
  member.levelId = 'L1'; member.topLevelId = 'missing'; member.type = 'column';
  state.settings.showMembers = false;
  const before = state.snapshot();
  ui.renderModelCheck();
  get('diagnostic-type').change('member');
  const button = diagnostics.querySelectorAll('[data-diagnostic-target]')[0];
  button.click();
  assert.equal(selected[0].elementId, member.id);
  assert.equal(selected[0].target.hidden, true);
  assert.equal(selected[0].target.requiresLevelChange, true);
  assert.deepEqual(selected[0].target.bounds, { minX: 0, maxX: 1000, minY: 0, maxY: 0 });
  assert.deepEqual(state.snapshot(), before);
  assert.equal(filters.at(-1).elementType, 'member');
  state.removeMember(member.id); button.click();
  assert.equal(selected.length, 1);
  assert.equal(resolveDiagnosticTarget(state, { elementType: 'member', elementId: member.id }), null);
});

test('preflight component and source errors retain CAD targets and share filters', context => {
  const { ui, state, diagnostics, get } = uiHarness(context);
  const first = beam(state), second = beam(state, 10000);
  const support = state.addSupport(90000, 90000);
  const report = buildAnalysisPreflight(state);
  const components = report.issues.filter(issue => issue.code === 'rigid-body-modes');
  assert.deepEqual(components.flatMap(issue => issue.targets).map(ref => ref.elementId), [first.id, second.id]);
  assert.deepEqual(report.issues.find(issue => issue.code === 'orphan-supports').targets,
    [{ elementType: 'support', elementId: support.id }]);
  ui.renderAnalysisPreflight(report);
  get('diagnostic-type').change('support');
  assert.equal(diagnostics.querySelectorAll('[data-diagnostic-target]').length, 1);
  first.startNodeId = 'missing';
  const broken = buildAnalysisPreflight(state);
  assert.ok(broken.issues.some(issue => issue.code === 'missing-node' && issue.elementId === first.id));
  assert.ok(broken.issues.find(issue => issue.code === 'source-model-errors').targets.some(ref => ref.elementId === first.id));
  const record = createDiagnostic('warning', 'aggregate', {}, { targets: [
    { elementType: 'member', elementId: first.id }, { elementType: 'support', elementId: support.id },
  ] });
  assert.equal(filterDiagnostics([record], { severity: 'warning', elementType: 'support' }).length, 1);
});
