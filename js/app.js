// app.js - Application entry point

import { AppState } from './state.js';
import { History } from './history.js';
import { Canvas2D } from './canvas2d.js';
import { ToolManager } from './tools.js';
import { UI } from './ui.js';
import { exportJSON, importJSON } from './io.js';
import { initLang, setLang, getLang, t } from './i18n.js';

// --- Initialize ---

initLang();

const state = new AppState();
const history = new History(state);

const canvasEl = document.getElementById('canvas-2d');
const canvas2d = new Canvas2D(canvasEl, state);

const viewerContainer = document.getElementById('viewer-3d');

// Lazy-load 3D viewer (avoids blocking app if three.js CDN fails)
let viewer3d = null;
let viewer3dLoading = false;

async function loadViewer3D() {
  if (viewer3d) return viewer3d;
  if (viewer3dLoading) return null;
  viewer3dLoading = true;
  try {
    const { Viewer3D } = await import('./viewer3d.js');
    viewer3d = new Viewer3D(viewerContainer, state);
    return viewer3d;
  } catch (err) {
    console.error('Failed to load 3D viewer:', err);
    viewer3dLoading = false;
    return null;
  }
}

let activeView = '2d'; // '2d' | '3d'

// --- Render loop ---

function update() {
  if (activeView === '2d') {
    canvas2d.draw();
  } else if (viewer3d) {
    viewer3d.rebuildScene();
  }
  ui.updatePropertyPanel();
  ui.updateZoom(canvas2d.camera.scale);
}

function renderLoop() {
  if (activeView === '2d') {
    canvas2d.draw();
  }
  requestAnimationFrame(renderLoop);
}

// --- UI ---

const ui = new UI(state, {
  onToolChange() { update(); },
  onSnapToggle() { update(); },
  onGridChange() { update(); },
  onLayerChange() { update(); },
  onPropertyChange() { update(); },
});

// --- Tools ---

new ToolManager(canvas2d, state, history, update);

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

tab3d.addEventListener('click', async () => {
  activeView = '3d';
  tab3d.classList.add('active');
  tab2d.classList.remove('active');
  canvasEl.hidden = true;
  viewerContainer.hidden = false;
  const v = await loadViewer3D();
  if (v) v.startRendering();
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
    document.getElementById('chk-snap').checked = state.settings.snap;
    document.getElementById('sel-grid').value = String(state.settings.gridSize);
    ui.refreshLayerSelectors();
    update();
    if (activeView === '3d' && viewer3d) {
      viewer3d.rebuildScene();
    }
  } catch (err) {
    alert(t('importFailed') + err.message);
  }
  e.target.value = '';
});

// --- Settings Modal ---

const settingsModal = document.getElementById('settings-modal');
const settingsThemeSelect = document.getElementById('settings-theme');
const settingsLangSelect = document.getElementById('settings-lang');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('lineframe-theme', theme);
  if (viewer3d) viewer3d.applyTheme();
  if (settingsThemeSelect) settingsThemeSelect.value = theme;
}

function applyLang(lang) {
  setLang(lang);
  ui.applyLanguage();
  if (settingsLangSelect) settingsLangSelect.value = lang;
}

function showSettingsModal() {
  settingsThemeSelect.value = document.documentElement.dataset.theme || 'dark';
  settingsLangSelect.value = getLang();
  settingsModal.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  settingsModal.classList.add('visible');
}

function hideSettingsModal() {
  settingsModal.classList.remove('visible');
}

document.getElementById('btn-settings').addEventListener('click', showSettingsModal);
document.getElementById('btn-settings-close').addEventListener('click', hideSettingsModal);

settingsThemeSelect.addEventListener('change', (e) => {
  applyTheme(e.target.value);
});

settingsLangSelect.addEventListener('change', (e) => {
  applyLang(e.target.value);
  // Re-apply i18n to settings modal itself
  settingsModal.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) hideSettingsModal();
});

// Apply initial theme and language
const savedTheme = localStorage.getItem('lineframe-theme') || 'dark';
applyTheme(savedTheme);
ui.applyLanguage();

// --- Help Modal ---

const helpModal = document.getElementById('help-modal');
const helpBody = document.getElementById('help-body');

function showHelpModal() {
  helpBody.innerHTML = t('helpContent');
  const titleEl = helpModal.querySelector('[data-i18n="helpTitle"]');
  if (titleEl) titleEl.textContent = t('helpTitle');
  const closeEl = helpModal.querySelector('[data-i18n="helpClose"]');
  if (closeEl) closeEl.textContent = t('helpClose');
  helpModal.classList.add('visible');
}

function hideHelpModal() {
  helpModal.classList.remove('visible');
}

document.getElementById('btn-open-help').addEventListener('click', () => {
  hideSettingsModal();
  showHelpModal();
});

document.getElementById('btn-help-close').addEventListener('click', hideHelpModal);

helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) hideHelpModal();
});

// Close modals on Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (helpModal.classList.contains('visible')) {
      hideHelpModal();
      e.stopPropagation();
    } else if (settingsModal.classList.contains('visible')) {
      hideSettingsModal();
      e.stopPropagation();
    }
  }
}, true);

// --- Start ---

renderLoop();
update();
