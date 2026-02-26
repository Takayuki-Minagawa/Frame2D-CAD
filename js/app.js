// app.js - Application entry point

import { AppState } from './state.js';
import { History } from './history.js';
import { Canvas2D } from './canvas2d.js';
import { ToolManager } from './tools.js';
import { UI } from './ui.js';
import { exportJSON, importJSON, exportUserDefs, importUserDefs } from './io.js';
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
    showNotice(t('viewer3dLoadFailed'), 'error', 6500);
    return null;
  } finally {
    viewer3dLoading = false;
  }
}

let activeView = '2d'; // '2d' | '3d'

// --- Render loop ---

function update() {
  if (activeView === '2d') {
    canvas2d.draw();
  } else if (viewer3d) {
    viewer3d.requestRebuild();
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
  } catch (err) {
    showNotice(t('importFailed') + err.message, 'error', 6500);
  }
  e.target.value = '';
});

// --- Settings Modal ---

const settingsModal = document.getElementById('settings-modal');
const settingsThemeSelect = document.getElementById('settings-theme');
const settingsLangSelect = document.getElementById('settings-lang');
const userDefModal = document.getElementById('user-def-modal');
const userDefKindSelect = document.getElementById('user-def-kind');
const userDefTargetSelect = document.getElementById('user-def-target');
const userDefTypeSelect = document.getElementById('user-def-type');
const userDefSectionGroup = document.getElementById('user-def-section-group');
const userDefSpringGroup = document.getElementById('user-def-spring-group');
const userDefSizeGroup = document.getElementById('user-def-size-group');
const userDefNameInput = document.getElementById('user-def-name');
const userDefColorInput = document.getElementById('user-def-color');
const userDefBInput = document.getElementById('user-def-b');
const userDefHInput = document.getElementById('user-def-h');
const userDefSymbolInput = document.getElementById('user-def-symbol');
const userDefMemoInput = document.getElementById('user-def-memo');
const userDefListModal = document.getElementById('user-def-list-modal');
const userDefListBody = document.getElementById('user-def-list-body');
const userDefFormErrorEl = document.getElementById('user-def-form-error');
let noticeTimerId = null;

function applyI18nTo(root) {
  if (!root) return;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

function ensureNoticeHost() {
  let host = document.getElementById('app-notice-host');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'app-notice-host';
  document.body.appendChild(host);
  return host;
}

function showNotice(message, kind = 'error', durationMs = 4200) {
  const text = String(message || '').trim();
  if (!text) return;
  const host = ensureNoticeHost();
  host.innerHTML = '';

  const notice = document.createElement('div');
  notice.className = `app-notice app-notice-${kind}`;
  notice.textContent = text;
  host.appendChild(notice);

  if (noticeTimerId) {
    window.clearTimeout(noticeTimerId);
    noticeTimerId = null;
  }
  noticeTimerId = window.setTimeout(() => {
    notice.remove();
    noticeTimerId = null;
  }, durationMs);
}

function clearInputError(input) {
  if (!input) return;
  input.classList.remove('input-error');
}

function markInputError(input) {
  if (!input) return;
  input.classList.add('input-error');
  input.focus();
}

function clearUserDefFormError() {
  if (!userDefFormErrorEl) return;
  userDefFormErrorEl.hidden = true;
  userDefFormErrorEl.textContent = '';
  clearInputError(userDefNameInput);
  clearInputError(userDefBInput);
  clearInputError(userDefHInput);
  clearInputError(userDefSymbolInput);
}

function showUserDefFormError(message, input) {
  if (!userDefFormErrorEl) {
    showNotice(message, 'error');
    return;
  }
  clearUserDefFormError();
  userDefFormErrorEl.textContent = message;
  userDefFormErrorEl.hidden = false;
  markInputError(input);
}

function refreshUserDefTypeOptions() {
  if (!userDefTargetSelect || !userDefTypeSelect) return;
  const isMember = userDefTargetSelect.value === 'member';
  const options = isMember
    ? [
        { value: 'beam', label: t('beam') },
        { value: 'column', label: t('column') },
        { value: 'hbrace', label: t('hbrace') },
        { value: 'vbrace', label: t('vbrace') },
      ]
    : [
        { value: 'floor', label: t('floor') },
        { value: 'exteriorWall', label: t('exteriorWall') },
        { value: 'wall', label: t('wall') },
      ];
  userDefTypeSelect.innerHTML = options
    .map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
    .join('');
  applyUserDefDefaultSectionValues();
}

function refreshUserDefFormVisibility() {
  const isSection = userDefKindSelect?.value !== 'spring';
  if (userDefSectionGroup) userDefSectionGroup.style.display = isSection ? '' : 'none';
  if (userDefSpringGroup) userDefSpringGroup.style.display = isSection ? 'none' : '';
  const isMemberSection = isSection && userDefTargetSelect?.value === 'member';
  if (userDefSizeGroup) userDefSizeGroup.style.display = isMemberSection ? 'flex' : 'none';
}

function getUserDefGroupDefaultSection(target, type) {
  return state.getDefaultSection(target, type) || state.listSections(target, type)[0] || null;
}

function applyUserDefDefaultSectionValues() {
  if (!userDefColorInput || !userDefTargetSelect || !userDefTypeSelect) return;
  const target = userDefTargetSelect.value || 'member';
  const type = userDefTypeSelect.value || '';
  const section = getUserDefGroupDefaultSection(target, type);
  if (section?.color) {
    userDefColorInput.value = section.color;
  } else if (target === 'surface') {
    userDefColorInput.value = type === 'floor' ? '#67a9cf' : '#b57a6b';
  } else {
    userDefColorInput.value = '#666666';
  }
  if (target === 'member') {
    if (userDefBInput) userDefBInput.value = String(section?.b || 200);
    if (userDefHInput) userDefHInput.value = String(section?.h || 400);
  }
}

function resetUserDefForm() {
  clearUserDefFormError();
  if (userDefKindSelect) userDefKindSelect.value = 'section';
  if (userDefTargetSelect) userDefTargetSelect.value = 'member';
  if (userDefNameInput) userDefNameInput.value = '';
  if (userDefColorInput) userDefColorInput.value = '#666666';
  if (userDefBInput) userDefBInput.value = '200';
  if (userDefHInput) userDefHInput.value = '400';
  if (userDefSymbolInput) userDefSymbolInput.value = '';
  if (userDefMemoInput) userDefMemoInput.value = '';
  refreshUserDefTypeOptions();
  refreshUserDefFormVisibility();
}

function showUserDefModal() {
  clearUserDefFormError();
  applyI18nTo(userDefModal);
  refreshUserDefTypeOptions();
  refreshUserDefFormVisibility();
  userDefModal.classList.add('visible');
}

function hideUserDefModal() {
  clearUserDefFormError();
  userDefModal.classList.remove('visible');
}

function currentUserDefGroupLabel() {
  const kind = userDefKindSelect?.value || 'section';
  if (kind === 'spring') return t('userDefSpring');
  const target = userDefTargetSelect?.value || 'member';
  const type = userDefTypeSelect?.value || '';
  return `${target === 'member' ? t('userDefTargetMember') : t('userDefTargetSurface')} / ${t(type)}`;
}

function renderUserDefGroupList() {
  if (!userDefListBody) return;
  const kind = userDefKindSelect?.value || 'section';

  if (kind === 'spring') {
    const springs = state.listSprings();
    if (springs.length === 0) {
      userDefListBody.innerHTML = `<p>${t('userDefListNoItems')}</p>`;
      return;
    }
    userDefListBody.innerHTML = `
      <p><b>${t('userDefListGroup')}:</b> ${escapeHtml(currentUserDefGroupLabel())}</p>
      <table>
        <thead>
          <tr>
            <th>${t('userDefListColName')}</th>
            <th>${t('userDefListColMemo')}</th>
            <th>${t('userDefListColDefault')}</th>
            <th>${t('userDefListColAction')}</th>
          </tr>
        </thead>
        <tbody>
          ${springs.map(s => `
            <tr>
              <td>${escapeHtml(s.symbol)}</td>
              <td>
                ${s.isDefault
    ? escapeHtml(s.memo || '')
    : `<input type="text" class="user-def-table-input" data-field="memo" value="${escapeHtml(s.memo || '')}">`}
              </td>
              <td>${s.isDefault ? t('userDefDefaultFlag') : t('userDefCustomFlag')}</td>
	            <td>
	                ${s.isDefault
	    ? '-'
	    : `<div class="user-def-table-actions">
	                 <button type="button" class="user-def-table-btn" data-action="save-spring" data-symbol="${escapeHtml(s.symbol)}">${t('userDefUpdate')}</button>
	                 <button type="button" class="user-def-table-btn" data-action="remove-spring" data-symbol="${escapeHtml(s.symbol)}">${t('userDefDelete')}</button>
	               </div>`}
	              </td>
	            </tr>
	          `).join('')}
        </tbody>
      </table>
    `;
    attachUserDefListHandlers();
    return;
  }

  const target = userDefTargetSelect?.value || 'member';
  const type = userDefTypeSelect?.value || '';
  const sections = state.listSections(target, type);
  if (sections.length === 0) {
    userDefListBody.innerHTML = `<p>${t('userDefListNoItems')}</p>`;
    return;
  }

  const hasSize = target === 'member';
  userDefListBody.innerHTML = `
    <p><b>${t('userDefListGroup')}:</b> ${escapeHtml(currentUserDefGroupLabel())}</p>
    <table>
      <thead>
        <tr>
          <th>${t('userDefListColName')}</th>
          ${hasSize ? `<th>${t('userDefListColB')}</th><th>${t('userDefListColH')}</th>` : ''}
          <th>${t('userDefListColColor')}</th>
          <th>${t('userDefListColDefault')}</th>
          <th>${t('userDefListColAction')}</th>
        </tr>
      </thead>
      <tbody>
        ${sections.map(s => `
          <tr>
            <td>${escapeHtml(s.name)}</td>
            ${hasSize ? `<td>${s.isDefault
    ? `${s.b ?? '-'}`
    : `<input type="number" class="user-def-table-input" data-field="b" min="1" step="1" value="${Number.isFinite(s.b) ? s.b : 1}">`}</td>
            <td>${s.isDefault
    ? `${s.h ?? '-'}`
    : `<input type="number" class="user-def-table-input" data-field="h" min="1" step="1" value="${Number.isFinite(s.h) ? s.h : 1}">`}</td>` : ''}
            <td>${s.isDefault
    ? `<span style="display:inline-block;width:14px;height:14px;border:1px solid #999;vertical-align:middle;margin-right:6px;background:${escapeHtml(s.color || '#666666')};"></span>${escapeHtml(s.color || '')}`
    : `<input type="color" class="user-def-table-input" data-field="color" value="${escapeHtml(s.color || '#666666')}">`}</td>
            <td>${s.isDefault ? t('userDefDefaultFlag') : t('userDefCustomFlag')}</td>
	            <td>
	              ${s.isDefault
	    ? '-'
	    : `<div class="user-def-table-actions">
	                 <button type="button" class="user-def-table-btn" data-action="save-section" data-name="${escapeHtml(s.name)}">${t('userDefUpdate')}</button>
	                 <button type="button" class="user-def-table-btn" data-action="remove-section" data-name="${escapeHtml(s.name)}">${t('userDefDelete')}</button>
	               </div>`}
	            </td>
	          </tr>
	        `).join('')}
      </tbody>
    </table>
  `;
  attachUserDefListHandlers();
}

function attachUserDefListHandlers() {
  if (!userDefListBody) return;

  userDefListBody.querySelectorAll('[data-action="save-section"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = userDefTargetSelect?.value || 'member';
      const type = userDefTypeSelect?.value || '';
      const name = btn.dataset.name || '';
      const row = btn.closest('tr');
      if (!row) return;

      const patch = {};
      const colorEl = row.querySelector('[data-field="color"]');
      if (colorEl) patch.color = colorEl.value;

      if (target === 'member') {
        const bInput = row.querySelector('[data-field="b"]');
        const hInput = row.querySelector('[data-field="h"]');
        clearInputError(bInput);
        clearInputError(hInput);
        const b = parseFloat(bInput?.value || '');
        const h = parseFloat(hInput?.value || '');
        if (!(Number.isFinite(b) && b > 0 && Number.isFinite(h) && h > 0)) {
          markInputError(bInput);
          markInputError(hInput);
          showNotice(t('userDefInvalidSize'), 'error');
          return;
        }
        patch.b = b;
        patch.h = h;
      }

      const updated = state.updateSection(target, type, name, patch);
      if (!updated) {
        showNotice(t('userDefUpdateFailed'), 'error');
        return;
      }
      showNotice(t('userDefUpdated') || t('userDefUpdate'), 'success');
      update();
      renderUserDefGroupList();
    });
  });

  userDefListBody.querySelectorAll('[data-action="save-spring"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const symbol = btn.dataset.symbol || '';
      const row = btn.closest('tr');
      if (!row) return;
      const memo = row.querySelector('[data-field="memo"]')?.value || '';
      const updated = state.updateSpring(symbol, { memo });
      if (!updated) {
        showNotice(t('userDefUpdateFailed'), 'error');
        return;
      }
      showNotice(t('userDefUpdated') || t('userDefUpdate'), 'success');
      update();
      renderUserDefGroupList();
    });
  });

  userDefListBody.querySelectorAll('[data-action="remove-section"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = userDefTargetSelect?.value || 'member';
      const type = userDefTypeSelect?.value || '';
      const name = btn.dataset.name || '';
      if (!name) return;
      const confirmed = window.confirm(
        t('userDefDeleteConfirm').replace('{name}', name)
      );
      if (!confirmed) return;
      const removed = state.removeSection(target, type, name);
      if (!removed) {
        showNotice(t('userDefDeleteFailed'), 'error');
        return;
      }
      showNotice(t('userDefDeleted') || t('userDefDelete'), 'success');
      update();
      renderUserDefGroupList();
    });
  });

  userDefListBody.querySelectorAll('[data-action="remove-spring"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const symbol = btn.dataset.symbol || '';
      if (!symbol) return;
      const confirmed = window.confirm(
        t('userDefDeleteConfirm').replace('{name}', symbol)
      );
      if (!confirmed) return;
      const removed = state.removeSpring(symbol);
      if (!removed) {
        showNotice(t('userDefDeleteFailed'), 'error');
        return;
      }
      showNotice(t('userDefDeleted') || t('userDefDelete'), 'success');
      update();
      renderUserDefGroupList();
    });
  });
}

function showUserDefListModal() {
  applyI18nTo(userDefListModal);
  renderUserDefGroupList();
  userDefListModal.classList.add('visible');
}

function hideUserDefListModal() {
  userDefListModal.classList.remove('visible');
}

function addUserDefinition() {
  clearUserDefFormError();
  const kind = userDefKindSelect?.value || 'section';
  let added = null;

  if (kind === 'section') {
    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    const name = userDefNameInput?.value?.trim() || '';
    if (name.startsWith('_')) {
      showUserDefFormError(t('userDefNoLeadingUnderscore'), userDefNameInput);
      return;
    }
    const color = userDefColorInput?.value || '';
    if (target === 'member') {
      const b = parseFloat(userDefBInput?.value || '');
      const h = parseFloat(userDefHInput?.value || '');
      if (!(Number.isFinite(b) && b > 0 && Number.isFinite(h) && h > 0)) {
        showUserDefFormError(t('userDefInvalidSize'), userDefBInput);
        markInputError(userDefHInput);
        return;
      }
      added = state.addSection({ target, type, name, b, h, color });
    } else {
      added = state.addSection({ target, type, name, color });
    }
  } else {
    const symbol = userDefSymbolInput?.value?.trim() || '';
    if (symbol.startsWith('_')) {
      showUserDefFormError(t('userDefNoLeadingUnderscore'), userDefSymbolInput);
      return;
    }
    const memo = userDefMemoInput?.value?.trim() || '';
    added = state.addSpring({ symbol, memo });
  }

  if (!added) {
    const keyInput = kind === 'section' ? userDefNameInput : userDefSymbolInput;
    showUserDefFormError(t('userDefAddFailed'), keyInput);
    return;
  }
  clearUserDefFormError();
  showNotice(t('userDefAdded'), 'success');
  update();
  resetUserDefForm();
  if (userDefListModal?.classList.contains('visible')) {
    renderUserDefGroupList();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
  applyI18nTo(settingsModal);
  applyI18nTo(userDefModal);
  applyI18nTo(userDefListModal);
  refreshUserDefTypeOptions();
  refreshUserDefFormVisibility();
  clearUserDefFormError();
  clearLayerFormError();
  if (userDefListModal?.classList.contains('visible')) {
    renderUserDefGroupList();
  }
}

function showSettingsModal() {
  settingsThemeSelect.value = document.documentElement.dataset.theme || 'dark';
  settingsLangSelect.value = getLang();
  applyI18nTo(settingsModal);
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
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) hideSettingsModal();
});

document.getElementById('btn-open-user-def').addEventListener('click', () => {
  hideSettingsModal();
  showUserDefModal();
});

document.getElementById('btn-user-def-close').addEventListener('click', hideUserDefModal);
document.getElementById('btn-user-def-add').addEventListener('click', addUserDefinition);
document.getElementById('btn-user-def-list').addEventListener('click', showUserDefListModal);
document.getElementById('btn-user-def-list-close').addEventListener('click', hideUserDefListModal);

// User definition export/import
document.getElementById('btn-user-def-export').addEventListener('click', () => {
  const exported = exportUserDefs(state);
  if (exported) {
    showNotice(t('userDefExported'), 'success');
  } else {
    showNotice(t('userDefExportEmpty'), 'error');
  }
});

document.getElementById('btn-user-def-import-trigger').addEventListener('click', () => {
  document.getElementById('file-user-def-import').click();
});

document.getElementById('file-user-def-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const count = await importUserDefs(file, state);
    if (count > 0) {
      showNotice(t('userDefImported'), 'success');
      update();
      if (userDefListModal?.classList.contains('visible')) {
        renderUserDefGroupList();
      }
    } else {
      showNotice(t('userDefImportNone'), 'error');
    }
  } catch (err) {
    showNotice(t('userDefImportFailed') + err.message, 'error', 6500);
  }
  e.target.value = '';
});

if (userDefKindSelect) userDefKindSelect.addEventListener('change', () => {
  clearUserDefFormError();
  refreshUserDefFormVisibility();
  if (userDefListModal?.classList.contains('visible')) renderUserDefGroupList();
});
if (userDefTargetSelect) userDefTargetSelect.addEventListener('change', () => {
  clearUserDefFormError();
  refreshUserDefTypeOptions();
  refreshUserDefFormVisibility();
  if (userDefListModal?.classList.contains('visible')) renderUserDefGroupList();
});
if (userDefTypeSelect) userDefTypeSelect.addEventListener('change', () => {
  clearUserDefFormError();
  applyUserDefDefaultSectionValues();
  if (userDefListModal?.classList.contains('visible')) renderUserDefGroupList();
});

if (userDefModal) {
  userDefModal.addEventListener('click', (e) => {
    if (e.target === userDefModal) hideUserDefModal();
  });
}
if (userDefListModal) {
  userDefListModal.addEventListener('click', (e) => {
    if (e.target === userDefListModal) hideUserDefListModal();
  });
}

resetUserDefForm();

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

// --- Layer Management Modal ---

const layerModal = document.getElementById('layer-modal');
const layerListEl = document.getElementById('layer-list');
const layerFormErrorEl = document.getElementById('layer-form-error');

function clearLayerFormError() {
  if (!layerFormErrorEl) return;
  layerFormErrorEl.hidden = true;
  layerFormErrorEl.textContent = '';
  if (layerListEl) {
    layerListEl.querySelectorAll('.input-error').forEach(el => {
      el.classList.remove('input-error');
    });
  }
}

function showLayerFormError(message, input = null) {
  if (!layerFormErrorEl) {
    showNotice(message, 'error');
    return;
  }
  clearLayerFormError();
  layerFormErrorEl.textContent = message;
  layerFormErrorEl.hidden = false;
  markInputError(input);
}

function renderLayerList() {
  layerListEl.innerHTML = '';

  // Header row
  const header = document.createElement('div');
  header.className = 'layer-header-row';
  header.innerHTML = `
    <span style="min-width:28px">ID</span>
    <span style="flex:1" data-i18n="layerName">${t('layerName')}</span>
    <span style="width:90px" data-i18n="layerZ">${t('layerZ')}</span>
    <span style="width:26px"></span>
  `;
  layerListEl.appendChild(header);

  const sortedLevels = [...state.levels].sort((a, b) => a.z - b.z);
  for (const level of sortedLevels) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.levelId = level.id;

    const idLabel = document.createElement('span');
    idLabel.className = 'layer-row-label';
    idLabel.textContent = level.id;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = level.name;
    nameInput.addEventListener('change', () => {
      clearInputError(nameInput);
      state.updateLevel(level.id, { name: nameInput.value });
      ui.refreshLayerSelectors();
      clearLayerFormError();
      update();
    });

    const zInput = document.createElement('input');
    zInput.type = 'number';
    zInput.value = level.z;
    zInput.step = '100';
    zInput.addEventListener('change', () => {
      clearInputError(zInput);
      const newZ = parseFloat(zInput.value) || 0;
      const duplicate = state.levels.some(l => l.id !== level.id && l.z === newZ);
      if (duplicate) {
        showLayerFormError(t('layerDuplicateZ'), zInput);
        zInput.value = level.z;
        return;
      }
      state.updateLevel(level.id, { z: newZ });
      ui.refreshLayerSelectors();
      clearLayerFormError();
      renderLayerList();
      update();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'layer-delete-btn';
    delBtn.textContent = '\u00D7';
    delBtn.title = t('layerDelete');
    delBtn.addEventListener('click', () => {
      if (state.levels.length <= 1) {
        showNotice(t('layerCannotDeleteLast'), 'error');
        return;
      }
      const usage = state.getLevelUsage(level.id);
      const total = usage.members.length + usage.surfaces.length;
      if (total > 0) {
        showNotice(
          t('layerInUse').replace('{m}', usage.members.length).replace('{s}', usage.surfaces.length),
          'error'
        );
        return;
      }
      state.removeLevel(level.id);
      ui.refreshLayerSelectors();
      clearLayerFormError();
      renderLayerList();
      update();
    });

    row.appendChild(idLabel);
    row.appendChild(nameInput);
    row.appendChild(zInput);
    row.appendChild(delBtn);
    layerListEl.appendChild(row);
  }
}

function showLayerModal() {
  clearLayerFormError();
  renderLayerList();
  layerModal.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  layerModal.classList.add('visible');
}

function hideLayerModal() {
  clearLayerFormError();
  layerModal.classList.remove('visible');
}

document.getElementById('btn-layer-manage').addEventListener('click', showLayerModal);
document.getElementById('btn-layer-close').addEventListener('click', hideLayerModal);

document.getElementById('btn-layer-add').addEventListener('click', () => {
  clearLayerFormError();
  let nextZ = state.levels.length > 0
    ? Math.max(...state.levels.map(l => l.z)) + 2800
    : 0;
  // Ensure no duplicate z
  while (state.levels.some(l => l.z === nextZ)) {
    nextZ += 100;
  }
  const name = `${state.levels.length + 1}F`;
  state.addLevel(name, nextZ);
  ui.refreshLayerSelectors();
  renderLayerList();
  update();
});

layerModal.addEventListener('click', (e) => {
  if (e.target === layerModal) hideLayerModal();
});

// Close modals on Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (userDefListModal.classList.contains('visible')) {
      hideUserDefListModal();
      e.stopPropagation();
    } else if (userDefModal.classList.contains('visible')) {
      hideUserDefModal();
      e.stopPropagation();
    } else if (helpModal.classList.contains('visible')) {
      hideHelpModal();
      e.stopPropagation();
    } else if (layerModal.classList.contains('visible')) {
      hideLayerModal();
      e.stopPropagation();
    } else if (settingsModal.classList.contains('visible')) {
      hideSettingsModal();
      e.stopPropagation();
    }
  }
}, true);

// --- Start ---

// Expose for testing/debugging
window._app = { state, history, canvas2d, ui };

renderLoop();
update();
