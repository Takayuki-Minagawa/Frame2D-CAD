// Independent exchange consumer: no IfcOpenShell and no application dependencies.
// Usage: node scripts/analysis_ifc_web_check.mjs IFC REPORT WEB_IFC_INSTALL_DIR [OUTPUT_JSON]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [ifcPath, reportPath, dependencyDirectory, outputPath] = process.argv.slice(2);
if (!ifcPath || !reportPath || !dependencyDirectory) {
  throw new Error('Usage: node scripts/analysis_ifc_web_check.mjs IFC REPORT WEB_IFC_INSTALL_DIR [OUTPUT_JSON]');
}
if (outputPath && [ifcPath, reportPath].some(p => path.resolve(p) === path.resolve(outputPath))) {
  throw new Error('Validation output must not overwrite its input');
}
const require = createRequire(path.resolve(dependencyDirectory, 'package.json'));
const W = require('web-ifc');
const api = new W.IfcAPI();
await api.Init();
const bytes = fs.readFileSync(ifcPath);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
assert.equal(report.format, 'element-modeler-ifc-report');
assert.equal(report.lengthUnit, 'mm');
const model = api.OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: false });
assert.ok(model >= 0, 'web-ifc could not open IFC');
const scalar = value => value?.value;
const vec = values => values.map(scalar);
const get = reference => api.GetLine(model, reference.value);
const entities = type => {
  const ids = api.GetLineIDsWithType(model, type);
  return Array.from({ length: ids.size() }, (_, i) => api.GetLine(model, ids.get(i)));
};
const add = (a, b) => a.map((v, i) => v+b[i]);
const sub = (a, b) => a.map((v, i) => v-b[i]);
const mul = (a, s) => a.map(v => v*s);
const dot = (a, b) => a.reduce((sum, v, i) => sum+v*b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a, 1/Math.hypot(...a));
const near = (a, b, tolerance = 1e-6) => assert.ok(Number.isFinite(a) && Math.abs(a-b) <= tolerance, `${a} != ${b}`);
const nearVector = (a, b, tolerance) => a.forEach((v, i) => near(v, b[i], tolerance));
const identity = { origin: [0, 0, 0], basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
const rotate = (transform, v) => [0, 1, 2].map(i => transform.basis.reduce((s, axis, j) => s+axis[i]*v[j], 0));
const transformPoint = (transform, v) => add(transform.origin, rotate(transform, v));
function axisPlacement(reference) {
  const p = get(reference), origin = vec(get(p.Location).Coordinates);
  const z = p.Axis ? unit(vec(get(p.Axis).DirectionRatios)) : [0, 0, 1];
  const referenceX = p.RefDirection ? vec(get(p.RefDirection).DirectionRatios) : [1, 0, 0];
  const y = unit(cross(z, referenceX)), x = cross(y, z);
  return { origin, basis: [x, y, z] };
}
function worldPlacement(reference, visited = new Set()) {
  if (!reference) return identity;
  assert.ok(!visited.has(reference.value), 'Cyclic IFC placement'); visited.add(reference.value);
  const p = get(reference), local = axisPlacement(p.RelativePlacement);
  const parent = worldPlacement(p.PlacementRelTo, visited);
  return { origin: transformPoint(parent, local.origin), basis: local.basis.map(v => rotate(parent, v)) };
}
function expectedSectionBasis(member) {
  // Independent oracle: report endpoints + documented solver convention only.
  // IFC local X = structural y (width), Y = structural z (height), Z = structural x.
  for (const p of [member.start, member.end]) {
    assert.ok(Array.isArray(p) && p.length === 3 && p.every(Number.isFinite), 'Invalid report endpoints');
  }
  const delta = sub(member.end, member.start), length = Math.hypot(...delta);
  assert.ok(length > 1e-9, 'Zero-length report member');
  near(length, member.length);
  const along = unit(delta);
  const reference = Math.abs(along[2]) < 0.999 ? [0, 0, 1] : [0, 1, 0];
  const width = unit(cross(reference, along)), height = cross(along, width);
  return [width, height, along];
}
function checkSectionBasis(actual, expected, label) {
  actual.forEach((axis, i) => assert.ok(axis.every((value, j) => Number.isFinite(value) &&
    Math.abs(value-expected[i][j]) <= 1e-9), `Section orientation mismatch (${label}, axis ${i})`));
}
function profilePlacement(reference) {
  if (!reference) return identity;
  const p = get(reference);
  assert.equal(p.type, W.IFCAXIS2PLACEMENT2D, 'Expected a 2D profile placement');
  const xy = p.RefDirection ? unit(vec(get(p.RefDirection).DirectionRatios)) : [1, 0];
  return { origin: [...vec(get(p.Location).Coordinates), 0],
    basis: [[xy[0], xy[1], 0], [-xy[1], xy[0], 0], [0, 0, 1]] };
}
const evidence = [];
const geometryFailures = [];
try {
  assert.equal(api.GetModelSchema(model), 'IFC4');
  const all = api.GetAllLines(model), globalIds = new Set();
  for (let i = 0; i < all.size(); i++) {
    const line = api.GetLine(model, all.get(i));
    if (line.GlobalId) {
      const guid = scalar(line.GlobalId);
      assert.match(guid, /^[0-3][0-9A-Za-z_$]{21}$/);
      assert.ok(!globalIds.has(guid), `Duplicate GUID ${guid}`); globalIds.add(guid);
    }
  }
  const projects = entities(W.IFCPROJECT);
  assert.equal(projects.length, 1);
  const units = get(projects[0].UnitsInContext).Units.map(get);
  const length = units.find(u => scalar(u.UnitType) === 'LENGTHUNIT');
  assert.equal(scalar(length.Name), 'METRE'); assert.equal(scalar(length.Prefix), 'MILLI');
  const storeys = entities(W.IFCBUILDINGSTOREY);
  assert.equal(storeys.length, report.storeys.length);
  const storeyByLevel = new Map();
  for (const expected of report.storeys) {
    const storey = storeys.find(s => scalar(s.GlobalId) === expected.guid);
    assert.ok(storey, `Missing storey ${expected.guid}`);
    near(scalar(storey.Elevation), expected.elevation);
    nearVector(worldPlacement(storey.ObjectPlacement).origin, [0, 0, expected.elevation]);
    storeyByLevel.set(expected.levelId, storey.expressID);
  }
  const beams = entities(W.IFCBEAM), columns = entities(W.IFCCOLUMN);
  assert.equal(beams.length, report.members.filter(m => m.ifcClass === 'IfcBeam').length);
  assert.equal(columns.length, report.members.filter(m => m.ifcClass === 'IfcColumn').length);
  const products = [...beams, ...columns];
  const containments = entities(W.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  const definitions = entities(W.IFCRELDEFINESBYPROPERTIES);
  for (const expected of report.members) {
    const product = products.find(p => scalar(p.GlobalId) === expected.guid);
    assert.ok(product, `Missing member ${expected.guid}`);
    assert.equal(product.type, W[expected.ifcClass.toUpperCase()]);
    assert.equal(scalar(product.Tag), expected.sourceId);
    const container = containments.filter(c => c.RelatedElements.some(r => r.value === product.expressID));
    assert.equal(container.length, 1);
    assert.equal(container[0].RelatingStructure.value, storeyByLevel.get(expected.levelId));
    const relation = definitions.find(d => d.RelatedObjects.some(r => r.value === product.expressID));
    const properties = new Map(get(relation.RelatingPropertyDefinition).HasProperties.map(get).map(p => [scalar(p.Name), scalar(p.NominalValue)]));
    for (const [key, value] of Object.entries({ SourceId: expected.sourceId, SourceBranch: expected.sourceBranch,
      LevelId: expected.levelId, ModelFingerprint: report.modelFingerprint, ProjectIdentity: report.projectId })) {
      assert.equal(properties.get(key), value, key);
    }
    const shape = get(get(product.Representation).Representations[0]);
    const solid = get(shape.Items[0]), profile = get(solid.SweptArea);
    assert.equal(solid.type, W.IFCEXTRUDEDAREASOLID);
    assert.equal(profile.type, W[expected.profile.toUpperCase()]);
    for (const [key, value] of Object.entries(expected.profileDimensions)) near(scalar(profile[key]), value);
    near(scalar(solid.Depth), expected.length);
    const expectedBasis = expectedSectionBasis(expected);
    const productTransform = worldPlacement(product.ObjectPlacement);
    checkSectionBasis(productTransform.basis, expectedBasis, 'product world placement');
    const localSolid = axisPlacement(solid.Position);
    const localProfile = profilePlacement(profile.Position);
    const sectionBasis = localProfile.basis.map(axis => rotate(productTransform, rotate(localSolid, axis)));
    checkSectionBasis(sectionBasis, expectedBasis, 'composed solid/profile world placement');
    const sectionOrigin = transformPoint(productTransform, transformPoint(localSolid, localProfile.origin));
    nearVector(sectionOrigin, expected.start);
    const start = transformPoint(productTransform, localSolid.origin);
    const extrusion = rotate(productTransform, rotate(localSolid, vec(get(solid.ExtrudedDirection).DirectionRatios)));
    const end = add(start, mul(extrusion, scalar(solid.Depth)));
    nearVector(start, expected.start); nearVector(end, expected.end);

    // Consume web-ifc's independent tessellator as well as its STEP parser.
    // Its renderer coordinates are metres, X right/Y up; undo [X,Z,-Y].
    const mesh = api.GetFlatMesh(model, product.expressID);
    assert.ok(mesh.geometries.size() > 0, 'No tessellation');
    let volume = 0, vertexCount = 0;
    const ranges = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const placed = mesh.geometries.get(i), matrix = placed.flatTransformation;
      const geometry = api.GetGeometry(model, placed.geometryExpressID);
      try {
        const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
        const positions = [];
        for (let j = 0; j < vertices.length; j += 6) {
          const p = [0, 1, 2].map(k => matrix[k]*vertices[j]+matrix[4+k]*vertices[j+1]+matrix[8+k]*vertices[j+2]+matrix[12+k]);
          const cad = [p[0]*1000, -p[2]*1000, p[1]*1000];
          positions.push(cad); vertexCount++;
          const relative = sub(cad, expected.start);
          expectedBasis.forEach((axis, k) => {
            const v = dot(relative, axis);
            ranges[k][0] = Math.min(ranges[k][0], v); ranges[k][1] = Math.max(ranges[k][1], v);
          });
        }
        for (let j = 0; j < indices.length; j += 3) {
          const [a, b, c] = [0, 1, 2].map(k => sub(positions[indices[j+k]], start));
          volume += dot(a, cross(b, c))/6;
        }
      } finally { geometry.delete(); }
    }
    const width = expected.profileDimensions.XDim ?? expected.profileDimensions.OverallWidth;
    const height = expected.profileDimensions.YDim ?? expected.profileDimensions.OverallDepth;
    const bounds = [[-width/2, width/2], [-height/2, height/2], [0, expected.length]];
    ranges.forEach((range, i) => nearVector(range, bounds[i], 0.001));
    volume = Math.abs(volume);
    const volumePassed = Number.isFinite(volume) && Math.abs(volume-expected.volumeMm3) <= Math.max(0.01, expected.volumeMm3*1e-5);
    if (!volumePassed) geometryFailures.push({ guid: expected.guid, profile: expected.profile,
      expectedVolumeMm3: expected.volumeMm3, actualVolumeMm3: volume,
      message: 'Independent tessellated volume differs; the exported profile is not approved for rendering in this consumer.' });
    evidence.push({ guid: expected.guid, sourceId: expected.sourceId, sourceBranch: expected.sourceBranch,
      ifcClass: expected.ifcClass, levelId: expected.levelId, profile: expected.profile,
      parsedProfileDimensions: Object.fromEntries(Object.keys(expected.profileDimensions).map(key => [key, scalar(profile[key])])),
      expectedSectionBasis: expectedBasis, parsedSectionBasis: sectionBasis, sectionOrientationPassed: true,
      worldStartMm: start, worldEndMm: end, vertexCount, volumeMm3: volume, exchangeFieldsPassed: true, volumePassed });
  }
  const output = { format: 'element-modeler-independent-ifc-validation', version: 2,
    passed: geometryFailures.length === 0, exchangeFieldsPassed: true, geometryFailures,
    consumer: { name: 'web-ifc', version: api.GetVersion(), publisher: 'That Open Company', runtime: process.version },
    sourceIfcSha256: createHash('sha256').update(bytes).digest('hex'), modelFingerprint: report.modelFingerprint,
    exporterValidation: report.validation, consumerWarnings: report.consumerWarnings || [],
    counts: { beams: beams.length, columns: columns.length, storeys: storeys.length, members: evidence.length },
    checks: ['IFC4 parsing', 'mm units', 'unique GUIDs', 'member classes', 'storey elevations and containment',
      'source properties', 'profiles and dimensions', 'recursive global placements',
      'section axes independently derived from report endpoints', 'world tessellation bounds in report-derived axes and volume'],
    tolerances: { parsedCoordinatesMm: 1e-6, sectionAxisComponents: 1e-9, tessellatedBoundsMm: 0.001, volumeRelative: 1e-5 }, members: evidence,
    scope: 'Independent web-ifc Node/WASM consumer. Not a Revit, Archicad or other BIM desktop import test.' };
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(output, null, 2)+'\n');
  console.log(JSON.stringify(output, null, 2));
  if (geometryFailures.length) process.exitCode = 2;
} finally {
  api.CloseModel(model);
}
