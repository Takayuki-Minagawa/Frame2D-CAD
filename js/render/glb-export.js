import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { disposeObjects } from './dispose.js';

// Bake the display plane into export triangles/segments. Cut faces are open,
// matching the renderer's uncapped clipping. Work on owned copies only.
export function clippedGeometry(object, plane) {
  const source = object.geometry;
  const positions = source.getAttribute('position');
  const names = Object.keys(source.attributes).filter(name => name !== 'position');
  const output = { position: [] };
  for (const name of names) output[name] = [];
  const localPlane = plane.clone().applyMatrix4(object.matrixWorld.clone().invert());
  const read = index => {
    const p = new THREE.Vector3().fromBufferAttribute(positions, index);
    const values = { position: p.toArray() };
    for (const name of names) {
      const attribute = source.getAttribute(name);
      values[name] = Array.from({ length: attribute.itemSize }, (_, i) => attribute.getComponent(index, i));
    }
    return { values, distance: localPlane.distanceToPoint(p) };
  };
  const mix = (a, b) => {
    const t = a.distance / (a.distance - b.distance);
    const values = {};
    for (const name of Object.keys(output)) values[name] = a.values[name].map((x, i) => x + (b.values[name][i] - x) * t);
    return { values, distance: 0 };
  };
  const append = vertex => {
    for (const name of Object.keys(output)) output[name].push(...vertex.values[name]);
  };
  const count = source.index?.count ?? positions.count;
  const vertex = i => read(source.index ? source.index.getX(i) : i);
  if (object.isMesh) {
    for (let i = 0; i + 2 < count; i += 3) {
      const triangle = [vertex(i), vertex(i + 1), vertex(i + 2)];
      const polygon = [];
      for (let j = 0; j < 3; j++) {
        const a = triangle[j], b = triangle[(j + 1) % 3];
        if (a.distance >= 0) polygon.push(a);
        if ((a.distance >= 0) !== (b.distance >= 0)) polygon.push(mix(a, b));
      }
      for (let j = 1; j + 1 < polygon.length; j++) {
        append(polygon[0]); append(polygon[j]); append(polygon[j + 1]);
      }
    }
  } else {
    const step = object.isLineSegments ? 2 : 1;
    const end = object.isLineLoop ? count : count - 1;
    for (let i = 0; i < end; i += step) {
      let a = vertex(i), b = vertex((i + 1) % count);
      if (a.distance < 0 && b.distance < 0) continue;
      if (a.distance < 0) a = mix(a, b);
      else if (b.distance < 0) b = mix(a, b);
      append(a); append(b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const name of Object.keys(output)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[name], source.getAttribute(name).itemSize));
  }
  if (geometry.hasAttribute('normal')) geometry.normalizeNormals();
  return geometry;
}

export function createExportScene(viewer) {
  if (THREE.REVISION !== '170') throw new Error('GLB export requires Three.js 0.170.0');
  viewer.scene.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  scene.name = viewer.state.meta?.name || 'Element Modeler';
  scene.userData = {
    units: 'm', sourceUnits: 'mm', sourceUpAxis: 'Z', upAxis: 'Y',
    coordinateMapping: '(x,y,z) mm -> (x,z,-y) / 1000 m',
    clipping: viewer.clipping ? { ...viewer.clipping, capped: false } : null,
    isolation: viewer._isolation ? [...viewer._isolation] : null,
  };
  try {
    for (const objects of viewer._visuals.values()) for (const object of objects) {
      if (!object.visible || (!object.isMesh && !object.isLine)) continue;
      const geometry = viewer._clipPlane ? clippedGeometry(object, viewer._clipPlane) : object.geometry.clone();
      if (!geometry.getAttribute('position').count) { geometry.dispose(); continue; }
      // Export source colors, independent of transient selection highlighting.
      const base = viewer._baseMaterials.get(object) || object.material;
      const material = object.isLine ? new THREE.MeshBasicMaterial({
        color: base.color, opacity: base.opacity, transparent: base.transparent,
      }) : base.clone();
      material.clippingPlanes = [];
      const copy = object.isMesh ? new THREE.Mesh(geometry, material)
        : viewer._clipPlane || object.isLineSegments ? new THREE.LineSegments(geometry, material)
          : new THREE.Line(geometry, material);
      copy.name = object.name;
      copy.userData = structuredClone(object.userData);
      copy.matrix.copy(object.matrixWorld);
      copy.matrixAutoUpdate = false;
      scene.add(copy);
    }
    return scene;
  } catch (error) {
    disposeObjects([scene]);
    throw error;
  }
}

export async function exportViewerGLB(viewer, exporter = new GLTFExporter()) {
  const snapshot = createExportScene(viewer);
  try {
    return await exporter.parseAsync(snapshot, { binary: true, onlyVisible: true });
  } finally {
    disposeObjects([snapshot]);
    snapshot.clear();
  }
}
