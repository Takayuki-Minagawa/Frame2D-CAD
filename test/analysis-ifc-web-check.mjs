// Optional external-consumer regression: no dependency added to the app runtime.
// node test/analysis-ifc-web-check.mjs /tmp/element-modeler-f457-web-ifc
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dependencyDirectory = process.argv[2];
assert.ok(dependencyDirectory, 'Pass the external web-ifc installation directory');
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = path.join(root, 'test/fixtures/analysis/ifc-web-exchange.ifc');
const report = `${fixture}.report.json`;
const original = fs.readFileSync(fixture, 'utf8');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ifc-section-axis-regression-'));
const run = input => spawnSync(process.execPath, [path.join(root, 'scripts/analysis_ifc_web_check.mjs'),
  input, report, path.resolve(dependencyDirectory)], { encoding: 'utf8', timeout: 30000 });
function reject(name, text) {
  assert.notEqual(text, original, 'Regression mutation must change the IFC');
  const input = path.join(temporary, `${name}.ifc`);
  fs.writeFileSync(input, text);
  const result = run(input);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, `${name}: rotated section falsely passed`);
  assert.match(result.stderr, /Section orientation mismatch/, result.stderr);
  console.log(`PASS: ${name} is rejected with unchanged report`);
}
try {
  const result = run(fixture);
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.version, 2);
  assert.equal(evidence.passed, true);
  assert.deepEqual(evidence.members[0].expectedSectionBasis, [[0, 1, 0], [0, 0, 1], [1, 0, 0]]);
  assert.deepEqual(evidence.members[1].expectedSectionBasis, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.ok(evidence.members.every(member => member.sectionOrientationPassed));
  console.log('PASS: original horizontal/vertical/inclined sections');

  // Exact review reproduction: member endpoint axis is unchanged; only its
  // section orientation rotates 90 degrees. Former checker exited zero.
  assert.match(original, /#43=IFCDIRECTION\(\(0\.,1\.,0\.\)\);/);
  reject('member-section-90deg', original.replace('#43=IFCDIRECTION((0.,1.,0.));', '#43=IFCDIRECTION((0.,0.,1.));'));

  // Also rotate the profile inside an otherwise unchanged member placement.
  let profileRotation = original.replace('#39=IFCAXIS2PLACEMENT2D(#38,$);', '#39=IFCAXIS2PLACEMENT2D(#38,#9001);');
  const endOfData = profileRotation.lastIndexOf('ENDSEC;');
  profileRotation = profileRotation.slice(0, endOfData)+'#9001=IFCDIRECTION((0.,1.));\n'+profileRotation.slice(endOfData);
  reject('profile-section-90deg', profileRotation);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
