// viewer3d.js - 3D Viewer with three.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

    this.showWireframe = false;
    this.showNodes = true;
    this.gridHelper = null;

    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e2e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(15, 15, 15);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 20, 10);
    this.scene.add(directional);

    // Grid floor
    this.gridHelper = new THREE.GridHelper(50, 50, 0x444466, 0x333355);
    this.scene.add(this.gridHelper);

    // Axes
    const axes = new THREE.AxesHelper(5);
    this.scene.add(axes);

    // Groups for dynamic objects
    this.memberGroup = new THREE.Group();
    this.scene.add(this.memberGroup);
    this.nodeGroup = new THREE.Group();
    this.scene.add(this.nodeGroup);

    this.resize();

    // Resize observer
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

  rebuildScene() {
    if (!this._initialized) return;

    // Clear member group
    while (this.memberGroup.children.length) {
      const child = this.memberGroup.children[0];
      child.geometry?.dispose();
      child.material?.dispose();
      this.memberGroup.remove(child);
    }

    // Clear node group
    while (this.nodeGroup.children.length) {
      const child = this.nodeGroup.children[0];
      child.geometry?.dispose();
      child.material?.dispose();
      this.nodeGroup.remove(child);
    }

    // Rebuild members
    for (const m of this.state.members) {
      const n1 = this.state.getNode(m.startNodeId);
      const n2 = this.state.getNode(m.endNodeId);
      if (!n1 || !n2) continue;

      const level = this.state.levels.find(l => l.id === m.levelId);
      const z = (level ? level.z : 0) / 1000; // mm -> m for 3D scene

      // Start and end positions in 3D (y is up in three.js, so swap y/z)
      // Convert mm -> m
      const start = new THREE.Vector3(n1.x / 1000, z, -n1.y / 1000);
      const end = new THREE.Vector3(n2.x / 1000, z, -n2.y / 1000);

      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      if (length < 0.001) continue;

      const b = (m.section?.b || 200) / 1000; // mm -> m
      const h = (m.section?.h || 400) / 1000; // mm -> m

      const geometry = new THREE.BoxGeometry(length, h, b);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(m.color || '#666666'),
        wireframe: this.showWireframe,
      });
      const mesh = new THREE.Mesh(geometry, material);

      // Position at midpoint
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      // Offset upward by half height so bottom aligns with level
      mid.y += h / 2;
      mesh.position.copy(mid);

      // Rotate to align with member direction
      const angle = Math.atan2(direction.z, direction.x);
      mesh.rotation.y = -angle;

      this.memberGroup.add(mesh);

      // Edge wireframe overlay for better visibility
      if (!this.showWireframe) {
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
        const lineSegments = new THREE.LineSegments(edges, lineMat);
        lineSegments.position.copy(mesh.position);
        lineSegments.rotation.copy(mesh.rotation);
        this.memberGroup.add(lineSegments);
      }
    }

    // Rebuild nodes
    if (this.showNodes) {
      const sphereGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const sphereMat = new THREE.MeshStandardMaterial({ color: 0x89b4fa });

      for (const n of this.state.nodes) {
        // Find lowest level z for this node from connected members
        let z = 0;
        for (const m of this.state.members) {
          if (m.startNodeId === n.id || m.endNodeId === n.id) {
            const level = this.state.levels.find(l => l.id === m.levelId);
            if (level) z = level.z / 1000;
            break;
          }
        }
        const sphere = new THREE.Mesh(sphereGeo, sphereMat.clone());
        sphere.position.set(n.x / 1000, z, -n.y / 1000);
        this.nodeGroup.add(sphere);
      }
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
    // Replace grid
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
    }
    this.gridHelper = new THREE.GridHelper(50, 50, new THREE.Color(g1), new THREE.Color(g2));
    this.scene.add(this.gridHelper);
  }
}
