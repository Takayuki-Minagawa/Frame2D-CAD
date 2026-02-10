// viewer3d.js - 3D Viewer with three.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { offsetPolygonOutward } from './state.js';

export class Viewer3D {
  constructor(containerEl, state) {
    this.container = containerEl;
    this.state = state;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.memberGroup = null;
    this.nodeGroup = null;
    this.surfaceGroup = null;
    this.loadGroup = null;

    this.showWireframe = false;
    this.showNodes = true;
    this.gridHelper = null;

    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e2e);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(15, 15, 15);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 20, 10);
    this.scene.add(directional);

    this.gridHelper = new THREE.GridHelper(50, 50, 0x444466, 0x333355);
    this.scene.add(this.gridHelper);

    const axes = new THREE.AxesHelper(5);
    this.scene.add(axes);

    this.surfaceGroup = new THREE.Group();
    this.scene.add(this.surfaceGroup);
    this.memberGroup = new THREE.Group();
    this.scene.add(this.memberGroup);
    this.nodeGroup = new THREE.Group();
    this.scene.add(this.nodeGroup);
    this.loadGroup = new THREE.Group();
    this.scene.add(this.loadGroup);

    this.resize();

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.container);
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

    this._clearGroup(this.surfaceGroup);
    this._clearGroup(this.memberGroup);
    this._clearGroup(this.nodeGroup);
    this._clearGroup(this.loadGroup);

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
      let matColor = s.color || '#67a9cf';

      const isWallType = s.type === 'wall' || s.type === 'exteriorWall';
      if (isWallType) {
        ySize = Math.max(0.1, Math.abs(top - base) / 1000);
        yCenter = (Math.min(base, top) / 1000) + ySize / 2;
        matColor = s.color || '#b57a6b';
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
      color: new THREE.Color(surface.color || '#b57a6b'),
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

  _addPolygonSurface3D(surface, base, top) {
    const points = surface.points.map(p => new THREE.Vector2(p.x / 1000, -p.y / 1000));
    const shape = new THREE.Shape(points);
    const isWallType = surface.type === 'wall' || surface.type === 'exteriorWall';
    const color = new THREE.Color(surface.color || (isWallType ? '#b57a6b' : '#67a9cf'));

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
        color: new THREE.Color(surface.color || '#888888'),
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

  animate() {
    if (!this._initialized || this.container.hidden) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.animate());
  }

  startRendering() {
    this.init();
    this.rebuildScene();
    this.resize();
    this.animate();
  }

  toggleWireframe() {
    this.showWireframe = !this.showWireframe;
    this.rebuildScene();
  }

  toggleNodes() {
    this.showNodes = !this.showNodes;
    this.rebuildScene();
  }

  applyTheme() {
    if (!this._initialized) return;
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue('--viewer-bg').trim();
    const g1 = style.getPropertyValue('--viewer-grid1').trim();
    const g2 = style.getPropertyValue('--viewer-grid2').trim();
    this.scene.background = new THREE.Color(bg);
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
    }
    this.gridHelper = new THREE.GridHelper(50, 50, new THREE.Color(g1), new THREE.Color(g2));
    this.scene.add(this.gridHelper);
  }
}
