// app.js - Application entry point

import { AppState } from './state.js';
import { History } from './history.js';
import { Canvas2D } from './canvas2d.js';
import { ToolManager } from './tools.js';
import { Viewer3D } from './viewer3d.js';
import { UI } from './ui.js';
import { exportJSON, importJSON } from './io.js';

// --- Initialize ---

const state = new AppState();
const history = new History(state);

const canvasEl = document.getElementById('canvas-2d');
const canvas2d = new Canvas2D(canvasEl, state);

const viewerContainer = document.getElementById('viewer-3d');
const viewer3d = new Viewer3D(viewerContainer, state);

let activeView = '2d'; // '2d' | '3d'
let animFrameId = null;

// --- Render loop ---

function update() {
  if (activeView === '2d') {
    canvas2d.draw();
  }
  ui.updatePropertyPanel();
  ui.updateZoom(canvas2d.camera.scale);
}

function renderLoop() {
  if (activeView === '2d') {
    canvas2d.draw();
  }
  animFrameId = requestAnimationFrame(renderLoop);
}

// --- UI ---

const ui = new UI(state, {
  onToolChange(tool) {
    update();
  },
  onSnapToggle(snap) {
    update();
  },
  onGridChange(size) {
    update();
  },
  onPropertyChange(memberId) {
    update();
  },
});

// --- Tools ---

const tools = new ToolManager(canvas2d, state, history, update);

// --- View Tab Switching ---

const tab2d = document.getElementById('tab-2d');
const tab3d = document.getElementById('tab-3d');

tab2d.addEventListener('click', () => {
  activeView = '2d';
  tab2d.classList.add('active');
  tab3d.classList.remove('active');
  canvasEl.hidden = false;
  viewerContainer.hidden = true;
  canvas2d.resize();
  update();
});

tab3d.addEventListener('click', () => {
  activeView = '3d';
  tab3d.classList.add('active');
  tab2d.classList.remove('active');
  canvasEl.hidden = true;
  viewerContainer.hidden = false;
  viewer3d.startRendering();
});

// --- Export / Import ---

document.getElementById('btn-export').addEventListener('click', () => {
  exportJSON(state);
});

document.getElementById('btn-import-trigger').addEventListener('click', () => {
  document.getElementById('file-import').click();
});

document.getElementById('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await importJSON(file, state, history);
    // Sync UI
    document.getElementById('chk-snap').checked = state.settings.snap;
    document.getElementById('sel-grid').value = String(state.settings.gridSize);
    update();
    if (activeView === '3d') {
      viewer3d.rebuildScene();
    }
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
  e.target.value = '';
});

// --- Start ---

renderLoop();
update();
