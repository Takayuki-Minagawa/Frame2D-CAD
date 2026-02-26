// viewer3d.js - 3D Viewer with three.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { offsetPolygonOutward } from './state.js';
import { resolveSurfaceColor } from './surface-color.js';

function isWallSurfaceType(type) {
  return type === 'wall' || type === 'exteriorWall';
}

export class Viewer3D {
  constructor(containerEl, state) {
    this.container = containerEl;
    this.state = state;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.ambientLight = null;
    this.directionalLight = null;
    this.memberGroup = null;
    this.nodeGroup = null;
    this.surfaceGroup = null;
    this.loadGroup = null;
    this.supportGroup = null;

    this.showWireframe = false;
    this.showNodes = true;
    this.gridHelper = null;
    this.originAxes = null;

    this._initialized = false;
    this._isAnimating = false;
    this._sceneDirty = true;
    this._pendingInitialCamera = true;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e2e);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enablePan = false;
    this._setFallbackObliqueView();

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(10, 20, 10);
    this.scene.add(this.directionalLight);

    this.gridHelper = new THREE.GridHelper(50, 50, 0x444466, 0x333355);
    this.scene.add(this.gridHelper);

    this.originAxes = this._createOriginPlanAxes(1.2);
    this.scene.add(this.originAxes);

    this.surfaceGroup = new THREE.Group();
    this.scene.add(this.surfaceGroup);
    this.memberGroup = new THREE.Group();
    this.scene.add(this.memberGroup);
    this.nodeGroup = new THREE.Group();
    this.scene.add(this.nodeGroup);
    this.loadGroup = new THREE.Group();
    this.scene.add(this.loadGroup);
    this.supportGroup = new THREE.Group();
    this.scene.add(this.supportGroup);

    this.applyTheme();

    this.resize();

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.container);
  }

  _setFallbackObliqueView() {
    this._setInitialObliqueViewToTarget(new THREE.Vector3(0, 0, 0), 10);
  }

  _setInitialObliqueViewToTarget(target, span) {
    const distance = Math.max(8, span * 2.2);
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    const position = target.clone().addScaledVector(dir, distance);
    this.camera.position.copy(position);
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
  }

  _computeContentBounds() {
    const box = new THREE.Box3();
    let hasContent = false;
    for (const group of [this.surfaceGroup, this.memberGroup, this.nodeGroup, this.loadGroup, this.supportGroup]) {
      if (!group || group.children.length === 0) continue;
      const gbox = new THREE.Box3().setFromObject(group);
      if (!Number.isFinite(gbox.min.x) || !Number.isFinite(gbox.max.x)) continue;
      box.union(gbox);
      hasContent = true;
    }
    return { box, hasContent };
  }

  _autoFrameObliqueView(bounds = null) {
    const { box, hasContent } = bounds || this._computeContentBounds();
    if (!hasContent) {
      this._setFallbackObliqueView();
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 4);
    this._setInitialObliqueViewToTarget(center, span);
  }

  _createOriginPlanAxes(length = 1.2) {
    // 2D plan Y is mapped to -Z in the 3D scene.
    const origin = new THREE.Vector3(0, 0, 0);
    const headLength = Math.max(0.18, length * 0.28);
    const headWidth = Math.max(0.1, length * 0.16);

    const xArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      origin.clone(),
      length,
      0xff4d4d,
      headLength,
      headWidth
    );
    const yArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      origin.clone(),
      length,
      0x4dff88,
      headLength,
      headWidth
    );
    const zArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      origin.clone(),
      length,
      0x4da6ff,
      headLength,
      headWidth
    );

    for (const arrow of [xArrow, yArrow, zArrow]) {
      arrow.line.material.depthTest = false;
      arrow.line.material.depthWrite = false;
      arrow.line.material.toneMapped = false;
      arrow.cone.material.depthTest = false;
      arrow.cone.material.depthWrite = false;
      arrow.cone.material.toneMapped = false;
      arrow.renderOrder = 999;
    }

    const group = new THREE.Group();
    group.add(xArrow);
    group.add(yArrow);
    group.add(zArrow);
    return group;
  }

  _positionOriginAxes(bounds = null) {
    if (!this.originAxes) return;
    const { box, hasContent } = bounds || this._computeContentBounds();
    if (!hasContent) {
      this.originAxes.position.set(-4, 0.4, 4);
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const planSpan = Math.max(size.x, size.z, 4);
    const pad = Math.max(2.0, planSpan * 0.22);
    const lift = Math.max(0.25, Math.min(1.0, size.y * 0.08));

    // Place far away from the plan's lower-left corner for readability.
    const x = box.min.x - pad;
    const z = box.max.z + pad;
    this.originAxes.position.set(x, box.min.y + lift, z);
  }

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _clearGroup(group) {
    while (group.children.length) {
      const child = group.children[0];
      child.geometry?.dispose();
      child.material?.dispose();
      group.remove(child);
    }
  }

  rebuildScene() {
    if (!this._initialized) return;
    this._sceneDirty = false;

    this._clearGroup(this.surfaceGroup);
    this._clearGroup(this.memberGroup);
    this._clearGroup(this.nodeGroup);
    this._clearGroup(this.loadGroup);
    this._clearGroup(this.supportGroup);

    // Surfaces
    for (const s of this.state.surfaces || []) {
      const base = this.state.levels.find(l => l.id === s.levelId)?.z || 0;
      const top = this.state.levels.find(l => l.id === s.topLevelId)?.z || base;
      const isPolygon = s.shape === 'polygon' && Array.isArray(s.points) && s.points.length >= 3;

      if (isPolygon) {
        if (s.type === 'exteriorWall') {
          this._addExteriorWallEdges3D(s, base, top);
        } else {
          this._addPolygonSurface3D(s, base, top);
        }
        continue;
      }

      if (s.shape === 'line') {
        this._addWallLine3D(s, base, top);
        continue;
      }

      const xSize = Math.max(1, (s.x2 - s.x1) / 1000);
      const zSize = Math.max(1, (s.y2 - s.y1) / 1000);
      const cx = (s.x1 + s.x2) / 2000;
      const cz = -((s.y1 + s.y2) / 2000);

      let yCenter;
      let ySize;
      const matColor = resolveSurfaceColor(s);

      const isWallType = isWallSurfaceType(s.type);
      if (isWallType) {
        ySize = Math.max(0.1, Math.abs(top - base) / 1000);
        yCenter = (Math.min(base, top) / 1000) + ySize / 2;
      } else {
        ySize = 0.12;
        yCenter = base / 1000 + ySize / 2;
      }

      const geometry = new THREE.BoxGeometry(xSize, ySize, zSize);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(matColor),
        transparent: true,
        opacity: isWallType ? 0.35 : 0.45,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cx, yCenter, cz);
      this.surfaceGroup.add(mesh);

      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
      const lineSegments = new THREE.LineSegments(edges, lineMat);
      lineSegments.position.copy(mesh.position);
      this.surfaceGroup.add(lineSegments);
    }

    // Members
    for (const m of this.state.members) {
      const n1 = this.state.getNode(m.startNodeId);
      if (!n1) continue;

      if (m.type === 'column') {
        this._addColumn3D(m, n1);
        continue;
      }

      const n2 = this.state.getNode(m.endNodeId);
      if (!n2) continue;

      if (m.type === 'vbrace') {
        this._addVBrace3D(m, n1, n2);
        continue;
      }

      const level = this.state.levels.find(l => l.id === m.levelId);
      const y = (level ? level.z : 0) / 1000;

      const start = new THREE.Vector3(n1.x / 1000, y, -n1.y / 1000);
      const end = new THREE.Vector3(n2.x / 1000, y, -n2.y / 1000);

      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      if (length < 0.001) continue;

      const b = (m.section?.b || 200) / 1000;
      const h = (m.section?.h || 400) / 1000;

      const geometry = new THREE.BoxGeometry(length, h, b);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(m.color || '#666666'),
        wireframe: this.showWireframe,
      });
      const mesh = new THREE.Mesh(geometry, material);

      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mid.y += h / 2;
      mesh.position.copy(mid);

      const angle = Math.atan2(direction.z, direction.x);
      mesh.rotation.y = -angle;

      this.memberGroup.add(mesh);

      if (!this.showWireframe) {
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
        const lineSegments = new THREE.LineSegments(edges, lineMat);
        lineSegments.position.copy(mesh.position);
        lineSegments.rotation.copy(mesh.rotation);
        this.memberGroup.add(lineSegments);
      }
    }

    // Nodes
    if (this.showNodes) {
      const sphereGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const sphereMat = new THREE.MeshStandardMaterial({ color: 0x89b4fa });

      for (const n of this.state.nodes) {
        let y = 0;
        for (const m of this.state.members) {
          if (m.startNodeId === n.id || m.endNodeId === n.id) {
            const level = this.state.levels.find(l => l.id === m.levelId);
            if (level) y = level.z / 1000;
            break;
          }
        }
        const sphere = new THREE.Mesh(sphereGeo, sphereMat.clone());
        sphere.position.set(n.x / 1000, y, -n.y / 1000);
        this.nodeGroup.add(sphere);
      }
    }

    // Loads
    for (const ld of this.state.loads || []) {
      const level = this.state.levels.find(l => l.id === ld.levelId);
      const y = (level ? level.z : 0) / 1000 + 0.05;

      if (ld.type === 'areaLoad') {
        const xSize = Math.abs(ld.x2 - ld.x1) / 1000;
        const zSize = Math.abs(ld.y2 - ld.y1) / 1000;
        const cx = (ld.x1 + ld.x2) / 2000;
        const cz = -((ld.y1 + ld.y2) / 2000);
        const geo = new THREE.BoxGeometry(xSize, 0.05, zSize);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(ld.color || '#e57373'),
          transparent: true, opacity: 0.35,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, y, cz);
        this.loadGroup.add(mesh);
      } else if (ld.type === 'lineLoad') {
        const pts = [
          new THREE.Vector3(ld.x1 / 1000, y, -ld.y1 / 1000),
          new THREE.Vector3(ld.x2 / 1000, y, -ld.y2 / 1000),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(ld.color || '#ffb74d'), linewidth: 2 });
        this.loadGroup.add(new THREE.Line(geo, mat));
      } else if (ld.type === 'pointLoad') {
        const geo = new THREE.SphereGeometry(0.15, 8, 8);
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(ld.color || '#ba68c8') });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(ld.x1 / 1000, y, -ld.y1 / 1000);
        this.loadGroup.add(mesh);
      }
    }

    // Supports
    for (const sup of this.state.supports || []) {
      const level = this.state.levels.find(l => l.id === sup.levelId);
      const y = (level ? level.z : 0) / 1000;
      this._addSupport3D(sup, y);
    }

    const bounds = this._computeContentBounds();
    this._positionOriginAxes(bounds);

    if (this._pendingInitialCamera) {
      this._autoFrameObliqueView(bounds);
      this._pendingInitialCamera = false;
    }
  }

  requestRebuild() {
    this._sceneDirty = true;
  }

  _addWallLine3D(surface, base, top) {
    const height = Math.max(0.1, Math.abs(top - base) / 1000);
    const yBase = Math.min(base, top) / 1000;

    const start = new THREE.Vector3(surface.x1 / 1000, 0, -surface.y1 / 1000);
    const end = new THREE.Vector3(surface.x2 / 1000, 0, -surface.y2 / 1000);
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.001) return;

    const thickness = 0.05;
    const geometry = new THREE.BoxGeometry(length, height, thickness);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(resolveSurfaceColor(surface)),
      transparent: true,
      opacity: 0.35,
    });
    const mesh = new THREE.Mesh(geometry, material);

    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y = yBase + height / 2;
    mesh.position.copy(mid);

    const angle = Math.atan2(direction.z, direction.x);
    mesh.rotation.y = -angle;

    this.surfaceGroup.add(mesh);

    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
    const lineSegments = new THREE.LineSegments(edges, lineMat);
    lineSegments.position.copy(mesh.position);
    lineSegments.rotation.copy(mesh.rotation);
    this.surfaceGroup.add(lineSegments);
  }

  _addColumn3D(member, node) {
    const bottomLevel = this.state.levels.find(l => l.id === member.levelId);
    const topLevel = this.state.levels.find(l => l.id === member.topLevelId);
    if (!bottomLevel || !topLevel) return;

    const bottomZ = bottomLevel.z / 1000;
    const topZ = topLevel.z / 1000;
    const height = Math.abs(topZ - bottomZ);
    if (height < 0.001) return;

    const b = (member.section?.b || 200) / 1000;
    const h = (member.section?.h || 200) / 1000;

    const geometry = new THREE.BoxGeometry(b, height, h);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(member.color || '#666666'),
      wireframe: this.showWireframe,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const midY = (bottomZ + topZ) / 2;
    mesh.position.set(node.x / 1000, midY, -node.y / 1000);
    this.memberGroup.add(mesh);

    if (!this.showWireframe) {
      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
      const lineSegments = new THREE.LineSegments(edges, lineMat);
      lineSegments.position.copy(mesh.position);
      this.memberGroup.add(lineSegments);
    }
  }

  _addVBrace3D(member, n1, n2) {
    const bottomLevel = this.state.levels.find(l => l.id === member.levelId);
    const topLevel = this.state.levels.find(l => l.id === member.topLevelId);
    if (!bottomLevel || !topLevel) return;

    const yBottom = bottomLevel.z / 1000;
    const yTop = topLevel.z / 1000;
    const color = new THREE.Color(member.color || '#666666');
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });

    const s1 = new THREE.Vector3(n1.x / 1000, yBottom, -n1.y / 1000);
    const s2 = new THREE.Vector3(n2.x / 1000, yBottom, -n2.y / 1000);
    const t1 = new THREE.Vector3(n1.x / 1000, yTop, -n1.y / 1000);
    const t2 = new THREE.Vector3(n2.x / 1000, yTop, -n2.y / 1000);

    if (member.bracePattern === 'cross') {
      // X: both diagonals
      const geo1 = new THREE.BufferGeometry().setFromPoints([s1, t2]);
      this.memberGroup.add(new THREE.Line(geo1, mat));
      const geo2 = new THREE.BufferGeometry().setFromPoints([s2, t1]);
      this.memberGroup.add(new THREE.Line(geo2, mat));
    } else {
      // Single: start-bottom to end-top
      const geo = new THREE.BufferGeometry().setFromPoints([s1, t2]);
      this.memberGroup.add(new THREE.Line(geo, mat));
    }

    // Frame outline (rectangle)
    const frameGeo = new THREE.BufferGeometry().setFromPoints([s1, s2, t2, t1, s1]);
    const frameMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
    this.memberGroup.add(new THREE.Line(frameGeo, frameMat));
  }

  _addPolygonSurface3D(surface, base, top) {
    const points = surface.points.map(p => new THREE.Vector2(p.x / 1000, -p.y / 1000));
    const shape = new THREE.Shape(points);
    const isWallType = isWallSurfaceType(surface.type);
    const color = new THREE.Color(resolveSurfaceColor(surface));

    if (isWallType) {
      const height = Math.max(0.1, Math.abs(top - base) / 1000);
      const yBase = Math.min(base, top) / 1000;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = yBase;
      this.surfaceGroup.add(mesh);
      return;
    }

    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = base / 1000 + 0.06;
    this.surfaceGroup.add(mesh);
  }

  _addExteriorWallEdges3D(surface, base, top) {
    const points = surface.points;
    if (!points || points.length < 2) return;

    const height = Math.max(0.1, Math.abs(top - base) / 1000);
    const yBase = Math.min(base, top) / 1000;
    const thickness = 0.05;
    const wallOffset = this.state.settings?.wallDisplayOffset || 120;
    const oPts = offsetPolygonOutward(points, wallOffset);

    for (let i = 0; i < oPts.length; i++) {
      const a = oPts[i], b = oPts[(i + 1) % oPts.length];

      const start = new THREE.Vector3(a.x / 1000, 0, -a.y / 1000);
      const end = new THREE.Vector3(b.x / 1000, 0, -b.y / 1000);
      const direction = new THREE.Vector3().subVectors(end, start);
      const edgeLen = direction.length();
      if (edgeLen < 0.001) continue;

      const geometry = new THREE.BoxGeometry(edgeLen, height, thickness);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(resolveSurfaceColor(surface)),
        transparent: true,
        opacity: 0.35,
      });
      const mesh = new THREE.Mesh(geometry, material);

      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mid.y = yBase + height / 2;
      mesh.position.copy(mid);

      const angle = Math.atan2(direction.z, direction.x);
      mesh.rotation.y = -angle;

      this.surfaceGroup.add(mesh);

      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
      const lineSegments = new THREE.LineSegments(edges, lineMat);
      lineSegments.position.copy(mesh.position);
      lineSegments.rotation.copy(mesh.rotation);
      this.surfaceGroup.add(lineSegments);
    }
  }

  _addSupport3D(sup, y) {
    const px = sup.x / 1000;
    const pz = -sup.y / 1000;
    const allTrans = sup.dx && sup.dy && sup.dz;
    const allRot = sup.rx && sup.ry && sup.rz;
    const isFixed = allTrans && allRot;
    const color = new THREE.Color(0x4ade80);

    // Cone (triangle symbol) — apex at the support point, base below
    const coneRadius = 0.2;
    const coneHeight = 0.35;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 4);
    const coneMat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.7,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(px, y - coneHeight / 2, pz);
    this.supportGroup.add(cone);

    if (isFixed) {
      // Fixed support: flat box as ground plate
      const plateGeo = new THREE.BoxGeometry(coneRadius * 2.4, 0.04, coneRadius * 2.4);
      const plateMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5 });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(px, y - coneHeight - 0.02, pz);
      this.supportGroup.add(plate);
    } else {
      // Roller / partial: sphere under the cone
      const sphereGeo = new THREE.SphereGeometry(0.08, 8, 8);
      const sphereMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.7 });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(px, y - coneHeight - 0.08, pz);
      this.supportGroup.add(sphere);
    }
  }

  animate() {
    if (!this._initialized) {
      this._isAnimating = false;
      return;
    }

    if (!this.container.hidden) {
      if (this._sceneDirty) {
        this.rebuildScene();
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }

    requestAnimationFrame(() => this.animate());
  }

  startRendering() {
    this.init();
    this.resize();
    this._pendingInitialCamera = true;
    this.requestRebuild();
    if (this._isAnimating) return;
    this._isAnimating = true;
    this.animate();
  }

  toggleWireframe() {
    this.showWireframe = !this.showWireframe;
    this.requestRebuild();
  }

  toggleNodes() {
    this.showNodes = !this.showNodes;
    this.requestRebuild();
  }

  applyTheme() {
    if (!this._initialized) return;
    const style = getComputedStyle(document.documentElement);
    const theme = document.documentElement.dataset.theme || 'dark';
    const bg = style.getPropertyValue('--viewer-bg').trim();
    const g1 = style.getPropertyValue('--viewer-grid1').trim();
    const g2 = style.getPropertyValue('--viewer-grid2').trim();
    this.scene.background = new THREE.Color(bg);

    if (this.renderer) {
      this.renderer.toneMappingExposure = theme === 'light' ? 0.95 : 1.0;
    }
    if (this.ambientLight) {
      this.ambientLight.intensity = theme === 'light' ? 0.72 : 0.5;
    }
    if (this.directionalLight) {
      this.directionalLight.intensity = theme === 'light' ? 0.95 : 0.8;
      this.directionalLight.position.set(
        theme === 'light' ? 12 : 10,
        theme === 'light' ? 22 : 20,
        theme === 'light' ? 14 : 10
      );
    }

    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry?.dispose();
      const mats = Array.isArray(this.gridHelper.material)
        ? this.gridHelper.material
        : [this.gridHelper.material];
      for (const mat of mats) mat?.dispose?.();
    }
    this.gridHelper = new THREE.GridHelper(50, 50, new THREE.Color(g1), new THREE.Color(g2));
    const gridMats = Array.isArray(this.gridHelper.material)
      ? this.gridHelper.material
      : [this.gridHelper.material];
    for (const mat of gridMats) {
      mat.transparent = true;
      mat.opacity = theme === 'light' ? 0.72 : 0.48;
      mat.depthWrite = false;
    }
    this.scene.add(this.gridHelper);
  }
}
