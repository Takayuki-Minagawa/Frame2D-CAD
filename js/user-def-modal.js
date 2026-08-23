// user-def-modal.js - user-defined section / spring / material modals.
// Covers the definition form (add + validation), the list modal (inline edit,
// update/delete via event delegation) and user-definition export/import.
// Dependencies (state, model-change callback, selector refresh) are injected
// through initUserDefModal().

import { t } from './i18n.js';
import { escapeHtml, markInputInvalid, clearInputInvalid } from './dom-utils.js';
import { showNotice } from './notice.js';
import { exportUserDefs, importUserDefs } from './io.js';
import { calculateSectionPropertiesFromShape, normalizeSectionShape } from './section-catalog.js';

const END_CONDITIONS = ['pin', 'rigid', 'spring'];
const BUILT_IN_MATERIAL_NAMES = new Set(['steel', 'rc', 'wood']);

export function initUserDefModal({ state, onModelChange, refreshDraftSectionSelectors }) {
  const userDefModal = document.getElementById('user-def-modal');
  const userDefKindSelect = document.getElementById('user-def-kind');
  const userDefTargetSelect = document.getElementById('user-def-target');
  const userDefTypeSelect = document.getElementById('user-def-type');
  const userDefSectionGroup = document.getElementById('user-def-section-group');
  const userDefSpringGroup = document.getElementById('user-def-spring-group');
  const userDefMaterialGroup = document.getElementById('user-def-material-group');
  const userDefSizeGroup = document.getElementById('user-def-size-group');
  const userDefSectionMaterialGroup = document.getElementById('user-def-section-material-group');
  const userDefSectionMaterialSelect = document.getElementById('user-def-section-material');
  const userDefPropertiesGroup = document.getElementById('user-def-properties-group');
  const userDefShapeGroup = document.getElementById('user-def-shape-group');
  const userDefShapeSelect = document.getElementById('user-def-shape');
  const userDefHShapeGroup = document.getElementById('user-def-h-shape-group');
  const userDefBoxShapeGroup = document.getElementById('user-def-box-shape-group');
  const userDefFlangeThicknessInput = document.getElementById('user-def-flange-thickness');
  const userDefWebThicknessInput = document.getElementById('user-def-web-thickness');
  const userDefBoxThicknessInput = document.getElementById('user-def-box-thickness');
  const userDefShearAreaRatioGroup = document.getElementById('user-def-shear-area-ratio-group');
  const userDefShearAreaRatioYInput = document.getElementById('user-def-shear-area-ratio-y');
  const userDefShearAreaRatioZInput = document.getElementById('user-def-shear-area-ratio-z');
  const userDefNameInput = document.getElementById('user-def-name');
  const userDefColorInput = document.getElementById('user-def-color');
  const userDefBInput = document.getElementById('user-def-b');
  const userDefHInput = document.getElementById('user-def-h');
  const userDefAInput = document.getElementById('user-def-A');
  const userDefIyInput = document.getElementById('user-def-Iy');
  const userDefIzInput = document.getElementById('user-def-Iz');
  const userDefJInput = document.getElementById('user-def-J');
  const userDefEndPresetGroup = document.getElementById('user-def-end-preset-group');
  const userDefEndIConditionSelect = document.getElementById('user-def-endi-condition');
  const userDefEndJConditionSelect = document.getElementById('user-def-endj-condition');
  const userDefEndISpringSelect = document.getElementById('user-def-endi-spring');
  const userDefEndJSpringSelect = document.getElementById('user-def-endj-spring');
  const userDefSectionMemoInput = document.getElementById('user-def-section-memo');
  const userDefSymbolInput = document.getElementById('user-def-symbol');
  const userDefKrInput = document.getElementById('user-def-kr');
  const userDefKtInput = document.getElementById('user-def-kt');
  const userDefMemoInput = document.getElementById('user-def-memo');
  const userDefMaterialNameInput = document.getElementById('user-def-material-name');
  const userDefEInput = document.getElementById('user-def-E');
  const userDefGInput = document.getElementById('user-def-G');
  const userDefDensityInput = document.getElementById('user-def-density');
  const userDefListModal = document.getElementById('user-def-list-modal');
  const userDefListBody = document.getElementById('user-def-list-body');
  const userDefFormErrorEl = document.getElementById('user-def-form-error');

  function applyI18nTo(root) {
    if (!root) return;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
  }

  // --- Form error display ---

  function clearUserDefFormError() {
    if (!userDefFormErrorEl) return;
    userDefFormErrorEl.hidden = true;
    userDefFormErrorEl.textContent = '';
    clearInputInvalid(userDefNameInput);
    clearInputInvalid(userDefBInput);
    clearInputInvalid(userDefHInput);
    clearInputInvalid(userDefFlangeThicknessInput);
    clearInputInvalid(userDefWebThicknessInput);
    clearInputInvalid(userDefBoxThicknessInput);
    clearInputInvalid(userDefShearAreaRatioYInput);
    clearInputInvalid(userDefShearAreaRatioZInput);
    clearInputInvalid(userDefSymbolInput);
    clearInputInvalid(userDefKrInput);
    clearInputInvalid(userDefKtInput);
    clearInputInvalid(userDefMaterialNameInput);
    clearInputInvalid(userDefEInput);
    clearInputInvalid(userDefGInput);
    clearInputInvalid(userDefDensityInput);
    for (const input of [userDefAInput, userDefIyInput, userDefIzInput, userDefJInput]) {
      clearInputInvalid(input);
    }
  }

  function showUserDefFormError(message, input) {
    if (!userDefFormErrorEl) {
      showNotice(message, 'error');
      return;
    }
    clearUserDefFormError();
    userDefFormErrorEl.textContent = message;
    userDefFormErrorEl.hidden = false;
    markInputInvalid(input);
  }

  // --- Form rendering ---

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
          { value: 'roof', label: t('roof') },
          { value: 'eave', label: t('eave') },
          { value: 'gableWall', label: t('gableWall') },
        ];
    userDefTypeSelect.innerHTML = options
      .map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
      .join('');
    applyUserDefDefaultSectionValues();
  }

  function refreshUserDefFormVisibility() {
    const kind = userDefKindSelect?.value || 'section';
    const isSection = kind === 'section';
    const isSpring = kind === 'spring';
    if (userDefSectionGroup) userDefSectionGroup.style.display = isSection ? '' : 'none';
    if (userDefSpringGroup) userDefSpringGroup.hidden = !isSpring;
    if (userDefMaterialGroup) userDefMaterialGroup.hidden = kind !== 'material';
    const isMemberSection = isSection && userDefTargetSelect?.value === 'member';
    if (userDefSizeGroup) userDefSizeGroup.style.display = isMemberSection ? 'flex' : 'none';
    if (userDefShapeGroup) userDefShapeGroup.style.display = isMemberSection ? '' : 'none';
    if (userDefSectionMaterialGroup) userDefSectionMaterialGroup.style.display = isMemberSection ? '' : 'none';
    if (userDefPropertiesGroup) userDefPropertiesGroup.style.display = isMemberSection ? '' : 'none';
    if (userDefShearAreaRatioGroup) userDefShearAreaRatioGroup.style.display = isMemberSection ? '' : 'none';
    if (userDefEndPresetGroup) userDefEndPresetGroup.style.display = isMemberSection ? 'flex' : 'none';
    refreshUserDefShapeVisibility(isMemberSection);
    refreshMaterialSelectOptions();
    refreshUserDefEndSpringVisibility();
  }

  function refreshUserDefShapeVisibility(isMemberSection = userDefTargetSelect?.value === 'member') {
    const shape = normalizeSectionShape(userDefShapeSelect?.value);
    if (userDefHShapeGroup) userDefHShapeGroup.hidden = !isMemberSection || shape !== 'hSection';
    if (userDefBoxShapeGroup) userDefBoxShapeGroup.hidden = !isMemberSection || shape !== 'boxSection';
  }

  function refreshMaterialSelectOptions(selectedName = '') {
    if (!userDefSectionMaterialSelect) return;
    const materials = state.listMaterials();
    const selected = selectedName || userDefSectionMaterialSelect.value || materials[0]?.name || 'steel';
    userDefSectionMaterialSelect.innerHTML = materials.map(material =>
      `<option value="${escapeHtml(material.name)}" ${material.name === selected ? 'selected' : ''}>${escapeHtml(t(material.name) === material.name ? material.name : t(material.name))}</option>`
    ).join('');
    if (materials.some(material => material.name === selected)) {
      userDefSectionMaterialSelect.value = selected;
    }
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
      userDefColorInput.value = type === 'floor' ? '#67a9cf' : (
        type === 'roof' ? '#8b6f47' : (type === 'eave' ? '#4f9a8a' : (type === 'gableWall' ? '#bf6f5e' : '#b57a6b'))
      );
    } else {
      userDefColorInput.value = '#666666';
    }
    if (target === 'member') {
      if (userDefBInput) userDefBInput.value = String(section?.b || 200);
      if (userDefHInput) userDefHInput.value = String(section?.h || 400);
      if (userDefShapeSelect) userDefShapeSelect.value = normalizeSectionShape(section?.shape);
      if (userDefFlangeThicknessInput) userDefFlangeThicknessInput.value = section?.flangeThickness ?? '';
      if (userDefWebThicknessInput) userDefWebThicknessInput.value = section?.webThickness ?? '';
      if (userDefBoxThicknessInput) userDefBoxThicknessInput.value = section?.boxThickness ?? '';
      if (userDefShearAreaRatioYInput) userDefShearAreaRatioYInput.value = section?.shearAreaRatioY ?? '';
      if (userDefShearAreaRatioZInput) userDefShearAreaRatioZInput.value = section?.shearAreaRatioZ ?? '';
      refreshMaterialSelectOptions(section?.material || 'steel');
      setUserDefEndPresetInputs(section?.defaultEndI, section?.defaultEndJ);
      refreshUserDefShapeVisibility();
    }
  }

  function setUserDefEndPresetInputs(defaultEndI = null, defaultEndJ = null) {
    setEndPresetInput(userDefEndIConditionSelect, userDefEndISpringSelect, defaultEndI);
    setEndPresetInput(userDefEndJConditionSelect, userDefEndJSpringSelect, defaultEndJ);
    refreshUserDefEndSpringVisibility();
  }

  function setEndPresetInput(conditionEl, springEl, endInfo = null) {
    if (!conditionEl) return;
    const condition = END_CONDITIONS.includes(endInfo?.condition) ? endInfo.condition : 'pin';
    conditionEl.value = condition;
    refreshSpringSelectOptions(springEl, endInfo?.springSymbol || '');
  }

  function refreshSpringSelectOptions(selectEl, selectedSymbol = '') {
    if (!selectEl) return;
    const springs = state.listSprings();
    const fallbackSymbol = springs[0]?.symbol || '';
    const selected = selectedSymbol || selectEl.value || fallbackSymbol;
    selectEl.innerHTML = springs.map(s =>
      `<option value="${escapeHtml(s.symbol)}" ${s.symbol === selected ? 'selected' : ''}>${escapeHtml(s.symbol)}</option>`
    ).join('');
    if (selected && springs.some(s => s.symbol === selected)) selectEl.value = selected;
  }

  function refreshUserDefEndSpringVisibility() {
    refreshSpringSelectOptions(userDefEndISpringSelect);
    refreshSpringSelectOptions(userDefEndJSpringSelect);
    syncEndSpringVisibility(userDefEndIConditionSelect, userDefEndISpringSelect);
    syncEndSpringVisibility(userDefEndJConditionSelect, userDefEndJSpringSelect);
  }

  function syncEndSpringVisibility(conditionEl, springEl) {
    if (!conditionEl || !springEl) return;
    springEl.hidden = conditionEl.value !== 'spring';
  }

  function readEndPreset(conditionEl, springEl) {
    const condition = conditionEl?.value || 'pin';
    return {
      condition,
      springSymbol: condition === 'spring' ? (springEl?.value || null) : null,
    };
  }

  function endConditionLabel(condition) {
    if (condition === 'rigid') return t('endRigid');
    if (condition === 'spring') return t('endSpring');
    return t('endPin');
  }

  function formatEndPreset(endInfo) {
    const condition = END_CONDITIONS.includes(endInfo?.condition) ? endInfo.condition : 'pin';
    if (condition === 'spring') {
      return `${t('endSpring')} ${endInfo?.springSymbol || '-'}`;
    }
    return endConditionLabel(condition);
  }

  function renderEndConditionOptions(selectedCondition = 'pin') {
    return END_CONDITIONS.map(condition =>
      `<option value="${condition}" ${condition === selectedCondition ? 'selected' : ''}>${escapeHtml(endConditionLabel(condition))}</option>`
    ).join('');
  }

  function renderSpringOptions(springs, selectedSymbol = '') {
    const selected = selectedSymbol || springs[0]?.symbol || '';
    return springs.map(s =>
      `<option value="${escapeHtml(s.symbol)}" ${s.symbol === selected ? 'selected' : ''}>${escapeHtml(s.symbol)}</option>`
    ).join('');
  }

  function renderEndPresetCell(endInfo, fieldPrefix, editable, springs) {
    const condition = END_CONDITIONS.includes(endInfo?.condition) ? endInfo.condition : 'pin';
    const springSymbol = endInfo?.springSymbol || springs[0]?.symbol || '';
    if (!editable) {
      return escapeHtml(formatEndPreset({ condition, springSymbol }));
    }
    return `
      <select class="user-def-table-input" data-field="${fieldPrefix}Condition">
        ${renderEndConditionOptions(condition)}
      </select>
      <select class="user-def-table-input" data-field="${fieldPrefix}Spring" style="${condition === 'spring' ? '' : 'display:none;'}">
        ${renderSpringOptions(springs, springSymbol)}
      </select>
    `;
  }

  function readRowEndPreset(row, fieldPrefix) {
    return readEndPreset(
      row.querySelector(`[data-field="${fieldPrefix}Condition"]`),
      row.querySelector(`[data-field="${fieldPrefix}Spring"]`)
    );
  }

  function readOptionalPositiveInput(input) {
    const raw = input?.value?.trim() || '';
    if (raw === '') return { valid: true, value: null };
    const value = Number(raw);
    return Number.isFinite(value) && value > 0
      ? { valid: true, value }
      : { valid: false, value: null };
  }

  function readRequiredPositiveInput(input) {
    const value = Number(input?.value);
    return Number.isFinite(value) && value > 0
      ? { valid: true, value }
      : { valid: false, value: null };
  }

  function readOptionalRatioInput(input) {
    const raw = input?.value?.trim() || '';
    if (raw === '') return { valid: true, value: null };
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 && value <= 1
      ? { valid: true, value }
      : { valid: false, value: null };
  }

  function readSectionShapeInputs({ shapeSelect, flangeThicknessInput, webThicknessInput, boxThicknessInput }) {
    const shape = normalizeSectionShape(shapeSelect?.value);
    const values = {
      shape,
      flangeThickness: null,
      webThickness: null,
      boxThickness: null,
    };
    const requiredInputs = shape === 'hSection'
      ? [['flangeThickness', flangeThicknessInput], ['webThickness', webThicknessInput]]
      : (shape === 'boxSection' ? [['boxThickness', boxThicknessInput]] : []);
    for (const [field, input] of requiredInputs) {
      const result = readOptionalPositiveInput(input);
      if (!result.valid || result.value === null) return { valid: false, input, value: values };
      values[field] = result.value;
    }
    return { valid: true, input: null, value: values };
  }

  function calculatedIntegerProperties(section) {
    const calculated = calculateSectionPropertiesFromShape(section);
    if (!calculated) return null;
    return Object.fromEntries(
      Object.entries(calculated).map(([property, value]) => [property, Math.round(value)])
    );
  }

  function applyCalculatedProperties(properties, inputs) {
    for (const property of ['A', 'Iy', 'Iz', 'J']) {
      const input = inputs[property];
      if (input) input.value = String(properties[property]);
    }
  }

  // --- Form actions ---

  function resetUserDefForm() {
    clearUserDefFormError();
    if (userDefKindSelect) userDefKindSelect.value = 'section';
    if (userDefTargetSelect) userDefTargetSelect.value = 'member';
    if (userDefNameInput) userDefNameInput.value = '';
    if (userDefColorInput) userDefColorInput.value = '#666666';
    if (userDefBInput) userDefBInput.value = '200';
    if (userDefHInput) userDefHInput.value = '400';
    for (const input of [userDefAInput, userDefIyInput, userDefIzInput, userDefJInput]) {
      if (input) input.value = '';
    }
    if (userDefSectionMemoInput) userDefSectionMemoInput.value = '';
    if (userDefSymbolInput) userDefSymbolInput.value = '';
    if (userDefKrInput) userDefKrInput.value = '';
    if (userDefKtInput) userDefKtInput.value = '';
    if (userDefMemoInput) userDefMemoInput.value = '';
    if (userDefMaterialNameInput) userDefMaterialNameInput.value = '';
    if (userDefEInput) userDefEInput.value = '';
    if (userDefGInput) userDefGInput.value = '';
    if (userDefDensityInput) userDefDensityInput.value = '';
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

  function calculateUserDefSectionProperties() {
    clearUserDefFormError();
    const b = readRequiredPositiveInput(userDefBInput);
    const h = readRequiredPositiveInput(userDefHInput);
    if (!b.valid || !h.valid) {
      showUserDefFormError(t('userDefInvalidSize'), !b.valid ? userDefBInput : userDefHInput);
      if (!b.valid && !h.valid) markInputInvalid(userDefHInput);
      return;
    }
    const shape = readSectionShapeInputs({
      shapeSelect: userDefShapeSelect,
      flangeThicknessInput: userDefFlangeThicknessInput,
      webThicknessInput: userDefWebThicknessInput,
      boxThicknessInput: userDefBoxThicknessInput,
    });
    if (!shape.valid) {
      showUserDefFormError(t('userDefInvalidShape'), shape.input);
      return;
    }
    const properties = calculatedIntegerProperties({ b: b.value, h: h.value, ...shape.value });
    if (!properties) {
      showUserDefFormError(t('userDefInvalidShape'), shape.input || userDefShapeSelect);
      return;
    }
    applyCalculatedProperties(properties, {
      A: userDefAInput,
      Iy: userDefIyInput,
      Iz: userDefIzInput,
      J: userDefJInput,
    });
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
      const sectionMemo = userDefSectionMemoInput?.value?.trim() || '';
      if (target === 'member') {
        const b = readRequiredPositiveInput(userDefBInput);
        const h = readRequiredPositiveInput(userDefHInput);
        if (!b.valid || !h.valid) {
          showUserDefFormError(t('userDefInvalidSize'), userDefBInput);
          markInputInvalid(userDefHInput);
          return;
        }
        const shape = readSectionShapeInputs({
          shapeSelect: userDefShapeSelect,
          flangeThicknessInput: userDefFlangeThicknessInput,
          webThicknessInput: userDefWebThicknessInput,
          boxThicknessInput: userDefBoxThicknessInput,
        });
        if (!shape.valid || !calculateSectionPropertiesFromShape({ b: b.value, h: h.value, ...shape.value })) {
          showUserDefFormError(t('userDefInvalidShape'), shape.input || userDefShapeSelect);
          return;
        }
        const propertyInputs = {
          A: userDefAInput,
          Iy: userDefIyInput,
          Iz: userDefIzInput,
          J: userDefJInput,
        };
        const properties = {};
        for (const [property, input] of Object.entries(propertyInputs)) {
          const result = readOptionalPositiveInput(input);
          if (!result.valid) {
            showUserDefFormError(t('userDefInvalidProperty'), input);
            return;
          }
          properties[property] = result.value;
        }
        const shearAreaRatioY = readOptionalRatioInput(userDefShearAreaRatioYInput);
        const shearAreaRatioZ = readOptionalRatioInput(userDefShearAreaRatioZInput);
        if (!shearAreaRatioY.valid || !shearAreaRatioZ.valid) {
          showUserDefFormError(
            t('userDefInvalidShearAreaRatio'),
            !shearAreaRatioY.valid ? userDefShearAreaRatioYInput : userDefShearAreaRatioZInput
          );
          return;
        }
        added = state.addSection({
          target,
          type,
          name,
          b: b.value,
          h: h.value,
          material: userDefSectionMaterialSelect?.value || 'steel',
          ...shape.value,
          ...properties,
          shearAreaRatioY: shearAreaRatioY.value,
          shearAreaRatioZ: shearAreaRatioZ.value,
          color,
          memo: sectionMemo,
          defaultEndI: readEndPreset(userDefEndIConditionSelect, userDefEndISpringSelect),
          defaultEndJ: readEndPreset(userDefEndJConditionSelect, userDefEndJSpringSelect),
        });
      } else {
        added = state.addSection({ target, type, name, color, memo: sectionMemo });
      }
    } else if (kind === 'spring') {
      const symbol = userDefSymbolInput?.value?.trim() || '';
      if (symbol.startsWith('_')) {
        showUserDefFormError(t('userDefNoLeadingUnderscore'), userDefSymbolInput);
        return;
      }
      const memo = userDefMemoInput?.value?.trim() || '';
      const kr = readOptionalPositiveInput(userDefKrInput);
      const kt = readOptionalPositiveInput(userDefKtInput);
      if (!kr.valid || !kt.valid) {
        showUserDefFormError(t('userDefInvalidStiffness'), !kr.valid ? userDefKrInput : userDefKtInput);
        return;
      }
      added = state.addSpring({ symbol, kr: kr.value, kt: kt.value, memo });
    } else {
      const name = userDefMaterialNameInput?.value?.trim() || '';
      if (name.startsWith('_')) {
        showUserDefFormError(t('userDefNoLeadingUnderscore'), userDefMaterialNameInput);
        return;
      }
      const E = readRequiredPositiveInput(userDefEInput);
      const G = readRequiredPositiveInput(userDefGInput);
      const density = readRequiredPositiveInput(userDefDensityInput);
      if (!E.valid || !G.valid || !density.valid) {
        const invalid = !E.valid ? userDefEInput : (!G.valid ? userDefGInput : userDefDensityInput);
        showUserDefFormError(t('userDefInvalidMaterial'), invalid);
        return;
      }
      added = state.addMaterial({ name, E: E.value, G: G.value, density: density.value });
    }

    if (!added) {
      const keyInput = kind === 'section'
        ? userDefNameInput
        : (kind === 'spring' ? userDefSymbolInput : userDefMaterialNameInput);
      showUserDefFormError(t('userDefAddFailed'), keyInput);
      return;
    }
    clearUserDefFormError();
    showNotice(t('userDefAdded'), 'success');
    onModelChange();
    refreshDraftSectionSelectors();
    resetUserDefForm();
    if (userDefListModal?.classList.contains('visible')) {
      renderUserDefGroupList();
    }
  }

  // --- List modal rendering ---
  // Tables are generated from column definitions shared between the spring
  // list and the section list; actions are handled by event delegation on
  // the list body (data-action / data-symbol / data-name).

  function currentUserDefGroupLabel() {
    const kind = userDefKindSelect?.value || 'section';
    if (kind === 'spring') return t('userDefSpring');
    if (kind === 'material') return t('userDefMaterial');
    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    return `${target === 'member' ? t('userDefTargetMember') : t('userDefTargetSurface')} / ${t(type)}`;
  }

  function renderMemoCell(item) {
    return item.isDefault
      ? escapeHtml(item.memo || '')
      : `<input type="text" class="user-def-table-input" data-field="memo" value="${escapeHtml(item.memo || '')}">`;
  }

  function renderDefaultFlagCell(item) {
    return item.isDefault ? t('userDefDefaultFlag') : t('userDefCustomFlag');
  }

  function renderActionsCell(item, { saveAction, removeAction, keyAttr, key, calculateAction = null }) {
    if (item.isDefault) return '-';
    return `<div class="user-def-table-actions">
      ${calculateAction ? `<button type="button" class="user-def-table-btn" data-action="${calculateAction}" ${keyAttr}="${escapeHtml(key)}">${t('userDefCalculateProperties')}</button>` : ''}
      <button type="button" class="user-def-table-btn" data-action="${saveAction}" ${keyAttr}="${escapeHtml(key)}">${t('userDefUpdate')}</button>
      <button type="button" class="user-def-table-btn" data-action="${removeAction}" ${keyAttr}="${escapeHtml(key)}">${t('userDefDelete')}</button>
    </div>`;
  }

  function renderSizeCell(item, field) {
    const value = item[field];
    return item.isDefault
      ? `${value ?? '-'}`
      : `<input type="number" class="user-def-table-input" data-field="${field}" min="1" step="1" value="${Number.isFinite(value) ? value : 1}">`;
  }

  function renderOptionalNumberCell(item, field, editable = !item.isDefault) {
    const value = item[field];
    if (!editable) return Number.isFinite(value) ? String(value) : '-';
    return `<input type="number" class="user-def-table-input" data-field="${field}" min="0" step="any" value="${Number.isFinite(value) ? value : ''}" placeholder="auto">`;
  }

  function renderShapeOptions(selectedShape) {
    const shape = normalizeSectionShape(selectedShape);
    return [
      ['rectangle', t('userDefShapeRectangle')],
      ['hSection', t('userDefShapeHSection')],
      ['boxSection', t('userDefShapeBoxSection')],
    ].map(([value, label]) =>
      `<option value="${value}" ${value === shape ? 'selected' : ''}>${escapeHtml(label)}</option>`
    ).join('');
  }

  function renderShapeCell(section) {
    const shape = normalizeSectionShape(section.shape);
    if (section.isDefault) {
      return escapeHtml(t(shape === 'hSection' ? 'userDefShapeHSection' : (
        shape === 'boxSection' ? 'userDefShapeBoxSection' : 'userDefShapeRectangle'
      )));
    }
    return `<select class="user-def-table-input" data-field="shape">${renderShapeOptions(shape)}</select>`;
  }

  function renderOptionalRatioCell(item, field) {
    const value = item[field];
    if (item.isDefault) return Number.isFinite(value) ? String(value) : '-';
    return `<input type="number" class="user-def-table-input" data-field="${field}" min="0" max="1" step="any" value="${Number.isFinite(value) ? value : ''}" placeholder="-">`;
  }

  function renderRequiredNumberCell(item, field) {
    const value = item[field];
    return `<input type="number" class="user-def-table-input" data-field="${field}" min="0" step="any" value="${Number.isFinite(value) ? value : ''}">`;
  }

  function renderMaterialSelectCell(section) {
    if (section.isDefault) return escapeHtml(section.material || 'steel');
    const materials = state.listMaterials();
    return `<select class="user-def-table-input" data-field="material">
      ${materials.map(material => `<option value="${escapeHtml(material.name)}" ${material.name === section.material ? 'selected' : ''}>${escapeHtml(material.name)}</option>`).join('')}
    </select>`;
  }

  function renderColorCell(item) {
    return item.isDefault
      ? `<span style="display:inline-block;width:14px;height:14px;border:1px solid #999;vertical-align:middle;margin-right:6px;background:${escapeHtml(item.color || '#666666')};"></span>${escapeHtml(item.color || '')}`
      : `<input type="color" class="user-def-table-input" data-field="color" value="${escapeHtml(item.color || '#666666')}">`;
  }

  function buildSpringColumns() {
    return [
      { header: t('userDefListColName'), cell: s => escapeHtml(s.symbol) },
      { header: t('userDefListColKr'), cell: s => renderOptionalNumberCell(s, 'kr') },
      { header: t('userDefListColKt'), cell: s => renderOptionalNumberCell(s, 'kt') },
      { header: t('userDefListColMemo'), cell: renderMemoCell },
      { header: t('userDefListColDefault'), cell: renderDefaultFlagCell },
      {
        header: t('userDefListColAction'),
        cell: s => renderActionsCell(s, {
          saveAction: 'save-spring',
          removeAction: 'remove-spring',
          keyAttr: 'data-symbol',
          key: s.symbol,
        }),
      },
    ];
  }

  function buildSectionColumns(hasSize, springDefs) {
    const columns = [
      { header: t('userDefListColName'), cell: s => escapeHtml(s.name) },
    ];
    if (hasSize) {
      columns.push(
        { header: t('userDefListColB'), cell: s => renderSizeCell(s, 'b') },
        { header: t('userDefListColH'), cell: s => renderSizeCell(s, 'h') },
        { header: t('userDefListColShape'), cell: renderShapeCell },
        { header: t('userDefListColFlangeThickness'), cell: s => renderOptionalNumberCell(s, 'flangeThickness') },
        { header: t('userDefListColWebThickness'), cell: s => renderOptionalNumberCell(s, 'webThickness') },
        { header: t('userDefListColBoxThickness'), cell: s => renderOptionalNumberCell(s, 'boxThickness') },
        { header: t('userDefListColMaterial'), cell: renderMaterialSelectCell },
        { header: 'A', cell: s => renderOptionalNumberCell(s, 'A') },
        { header: 'Iy', cell: s => renderOptionalNumberCell(s, 'Iy') },
        { header: 'Iz', cell: s => renderOptionalNumberCell(s, 'Iz') },
        { header: 'J', cell: s => renderOptionalNumberCell(s, 'J') },
        { header: t('userDefListColShearAreaRatioY'), cell: s => renderOptionalRatioCell(s, 'shearAreaRatioY') },
        { header: t('userDefListColShearAreaRatioZ'), cell: s => renderOptionalRatioCell(s, 'shearAreaRatioZ') },
        { header: t('userDefListColEndI'), cell: s => renderEndPresetCell(s.defaultEndI, 'defaultEndI', !s.isDefault, springDefs) },
        { header: t('userDefListColEndJ'), cell: s => renderEndPresetCell(s.defaultEndJ, 'defaultEndJ', !s.isDefault, springDefs) },
      );
    }
    columns.push(
      { header: t('userDefListColColor'), cell: renderColorCell },
      { header: t('userDefListColMemo'), cell: renderMemoCell },
      { header: t('userDefListColDefault'), cell: renderDefaultFlagCell },
      {
        header: t('userDefListColAction'),
        cell: s => renderActionsCell(s, {
          saveAction: 'save-section',
          removeAction: 'remove-section',
          calculateAction: hasSize ? 'calculate-section-row' : null,
          keyAttr: 'data-name',
          key: s.name,
        }),
      },
    );
    return columns;
  }

  function buildMaterialColumns() {
    return [
      { header: t('userDefListColName'), cell: material => escapeHtml(material.name) },
      { header: 'E (N/mm²)', cell: material => renderRequiredNumberCell(material, 'E') },
      { header: 'G (N/mm²)', cell: material => renderRequiredNumberCell(material, 'G') },
      { header: 'ρ (kg/m³)', cell: material => renderRequiredNumberCell(material, 'density') },
      { header: t('userDefListColDefault'), cell: renderDefaultFlagCell },
      {
        header: t('userDefListColAction'),
        cell: material => `<div class="user-def-table-actions">
          <button type="button" class="user-def-table-btn" data-action="save-material" data-material="${escapeHtml(material.name)}">${t('userDefUpdate')}</button>
          ${BUILT_IN_MATERIAL_NAMES.has(material.name) ? '' : `<button type="button" class="user-def-table-btn" data-action="remove-material" data-material="${escapeHtml(material.name)}">${t('userDefDelete')}</button>`}
        </div>`,
      },
    ];
  }

  function renderUserDefListTable(items, columns) {
    return `
      <p><b>${t('userDefListGroup')}:</b> ${escapeHtml(currentUserDefGroupLabel())}</p>
      <table>
        <thead>
          <tr>
            ${columns.map(c => `<th>${c.header}</th>`).join('\n            ')}
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              ${columns.map(c => `<td>${c.cell(item)}</td>`).join('\n              ')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
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
      userDefListBody.innerHTML = renderUserDefListTable(springs, buildSpringColumns());
      return;
    }

    if (kind === 'material') {
      const materials = state.listMaterials();
      userDefListBody.innerHTML = renderUserDefListTable(materials, buildMaterialColumns());
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
    const springDefs = state.listSprings();
    userDefListBody.innerHTML = renderUserDefListTable(sections, buildSectionColumns(hasSize, springDefs));
  }

  // --- List modal actions (event delegation) ---

  function saveSectionRow(btn) {
    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    const name = btn.dataset.name || '';
    const row = btn.closest('tr');
    if (!row) return;

    const patch = {};
    const colorEl = row.querySelector('[data-field="color"]');
    if (colorEl) patch.color = colorEl.value;
    const memoEl = row.querySelector('[data-field="memo"]');
    if (memoEl) patch.memo = memoEl.value;

    if (target === 'member') {
      const bInput = row.querySelector('[data-field="b"]');
      const hInput = row.querySelector('[data-field="h"]');
      clearInputInvalid(bInput);
      clearInputInvalid(hInput);
      const b = parseFloat(bInput?.value || '');
      const h = parseFloat(hInput?.value || '');
      if (!(Number.isFinite(b) && b > 0 && Number.isFinite(h) && h > 0)) {
        markInputInvalid(bInput);
        markInputInvalid(hInput);
        showNotice(t('userDefInvalidSize'), 'error');
        return;
      }
      patch.b = b;
      patch.h = h;
      const shape = readSectionShapeInputs({
        shapeSelect: row.querySelector('[data-field="shape"]'),
        flangeThicknessInput: row.querySelector('[data-field="flangeThickness"]'),
        webThicknessInput: row.querySelector('[data-field="webThickness"]'),
        boxThicknessInput: row.querySelector('[data-field="boxThickness"]'),
      });
      if (!shape.valid || !calculateSectionPropertiesFromShape({ b, h, ...shape.value })) {
        markInputInvalid(shape.input || row.querySelector('[data-field="shape"]'));
        showNotice(t('userDefInvalidShape'), 'error');
        return;
      }
      Object.assign(patch, shape.value);
      patch.material = row.querySelector('[data-field="material"]')?.value || 'steel';
      for (const property of ['A', 'Iy', 'Iz', 'J']) {
        const input = row.querySelector(`[data-field="${property}"]`);
        const result = readOptionalPositiveInput(input);
        if (!result.valid) {
          markInputInvalid(input);
          showNotice(t('userDefInvalidProperty'), 'error');
          return;
        }
        patch[property] = result.value;
      }
      for (const ratio of ['shearAreaRatioY', 'shearAreaRatioZ']) {
        const input = row.querySelector(`[data-field="${ratio}"]`);
        const result = readOptionalRatioInput(input);
        if (!result.valid) {
          markInputInvalid(input);
          showNotice(t('userDefInvalidShearAreaRatio'), 'error');
          return;
        }
        patch[ratio] = result.value;
      }
      patch.defaultEndI = readRowEndPreset(row, 'defaultEndI');
      patch.defaultEndJ = readRowEndPreset(row, 'defaultEndJ');
    }

    const updated = state.updateSection(target, type, name, patch);
    if (!updated) {
      showNotice(t('userDefUpdateFailed'), 'error');
      return;
    }
    showNotice(t('userDefUpdated') || t('userDefUpdate'), 'success');
    onModelChange();
    renderUserDefGroupList();
  }

  function calculateSectionRow(btn) {
    const row = btn.closest('tr');
    if (!row) return;
    const bInput = row.querySelector('[data-field="b"]');
    const hInput = row.querySelector('[data-field="h"]');
    const b = readRequiredPositiveInput(bInput);
    const h = readRequiredPositiveInput(hInput);
    if (!b.valid || !h.valid) {
      markInputInvalid(!b.valid ? bInput : hInput);
      showNotice(t('userDefInvalidSize'), 'error');
      return;
    }
    const shape = readSectionShapeInputs({
      shapeSelect: row.querySelector('[data-field="shape"]'),
      flangeThicknessInput: row.querySelector('[data-field="flangeThickness"]'),
      webThicknessInput: row.querySelector('[data-field="webThickness"]'),
      boxThicknessInput: row.querySelector('[data-field="boxThickness"]'),
    });
    const properties = shape.valid
      ? calculatedIntegerProperties({ b: b.value, h: h.value, ...shape.value })
      : null;
    if (!properties) {
      markInputInvalid(shape.input || row.querySelector('[data-field="shape"]'));
      showNotice(t('userDefInvalidShape'), 'error');
      return;
    }
    applyCalculatedProperties(properties, {
      A: row.querySelector('[data-field="A"]'),
      Iy: row.querySelector('[data-field="Iy"]'),
      Iz: row.querySelector('[data-field="Iz"]'),
      J: row.querySelector('[data-field="J"]'),
    });
  }

  function saveSpringRow(btn) {
    const symbol = btn.dataset.symbol || '';
    const row = btn.closest('tr');
    if (!row) return;
    const memo = row.querySelector('[data-field="memo"]')?.value || '';
    const krInput = row.querySelector('[data-field="kr"]');
    const ktInput = row.querySelector('[data-field="kt"]');
    const kr = readOptionalPositiveInput(krInput);
    const kt = readOptionalPositiveInput(ktInput);
    if (!kr.valid || !kt.valid) {
      markInputInvalid(!kr.valid ? krInput : ktInput);
      showNotice(t('userDefInvalidStiffness'), 'error');
      return;
    }
    const updated = state.updateSpring(symbol, { kr: kr.value, kt: kt.value, memo });
    if (!updated) {
      showNotice(t('userDefUpdateFailed'), 'error');
      return;
    }
    showNotice(t('userDefUpdated') || t('userDefUpdate'), 'success');
    onModelChange();
    renderUserDefGroupList();
  }

  function saveMaterialRow(btn) {
    const name = btn.dataset.material || '';
    const row = btn.closest('tr');
    if (!row) return;
    const values = {};
    for (const field of ['E', 'G', 'density']) {
      const input = row.querySelector(`[data-field="${field}"]`);
      const result = readRequiredPositiveInput(input);
      if (!result.valid) {
        markInputInvalid(input);
        showNotice(t('userDefInvalidMaterial'), 'error');
        return;
      }
      values[field] = result.value;
    }
    if (!state.updateMaterial(name, values)) {
      showNotice(t('userDefUpdateFailed'), 'error');
      return;
    }
    showNotice(t('userDefUpdated'), 'success');
    onModelChange();
    refreshMaterialSelectOptions();
    renderUserDefGroupList();
  }

  function removeSectionRow(btn) {
    const target = userDefTargetSelect?.value || 'member';
    const type = userDefTypeSelect?.value || '';
    const name = btn.dataset.name || '';
    if (!name) return;
    const confirmed = window.confirm(
      t('userDefDeleteConfirm', { name })
    );
    if (!confirmed) return;
    const removed = state.removeSection(target, type, name);
    if (!removed) {
      showNotice(t('userDefDeleteFailed'), 'error');
      return;
    }
    showNotice(t('userDefDeleted') || t('userDefDelete'), 'success');
    onModelChange();
    refreshDraftSectionSelectors();
    renderUserDefGroupList();
  }

  function removeSpringRow(btn) {
    const symbol = btn.dataset.symbol || '';
    if (!symbol) return;
    const confirmed = window.confirm(
      t('userDefDeleteConfirm', { name: symbol })
    );
    if (!confirmed) return;
    const removed = state.removeSpring(symbol);
    if (!removed) {
      showNotice(t('userDefDeleteFailed'), 'error');
      return;
    }
    showNotice(t('userDefDeleted') || t('userDefDelete'), 'success');
    onModelChange();
    refreshDraftSectionSelectors();
    renderUserDefGroupList();
  }

  function removeMaterialRow(btn) {
    const name = btn.dataset.material || '';
    if (!name) return;
    if (!window.confirm(t('userDefDeleteConfirm', { name }))) return;
    if (!state.removeMaterial(name)) {
      showNotice(t('userDefDeleteFailed'), 'error');
      return;
    }
    showNotice(t('userDefDeleted'), 'success');
    onModelChange();
    refreshMaterialSelectOptions();
    renderUserDefGroupList();
  }

  function showUserDefListModal() {
    applyI18nTo(userDefListModal);
    renderUserDefGroupList();
    userDefListModal.classList.add('visible');
  }

  function hideUserDefListModal() {
    userDefListModal.classList.remove('visible');
  }

  // --- Wiring ---

  document.getElementById('btn-user-def-close').addEventListener('click', hideUserDefModal);
  document.getElementById('btn-user-def-add').addEventListener('click', addUserDefinition);
  document.getElementById('btn-user-def-calculate-properties')?.addEventListener('click', calculateUserDefSectionProperties);
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
      const { added, skipped } = await importUserDefs(file, state);
      if (added > 0) {
        const msg = skipped > 0
          ? t('userDefImportedWithSkip', { n: added, s: skipped })
          : t('userDefImported', { n: added });
        showNotice(msg, 'success');
        refreshUserDefEndSpringVisibility();
        refreshMaterialSelectOptions();
        onModelChange();
        refreshDraftSectionSelectors();
        if (userDefListModal?.classList.contains('visible')) {
          renderUserDefGroupList();
        }
      } else if (skipped > 0) {
        showNotice(t('userDefImportAllSkipped', { s: skipped }), 'error');
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
  if (userDefShapeSelect) userDefShapeSelect.addEventListener('change', () => {
    clearUserDefFormError();
    refreshUserDefShapeVisibility();
  });
  if (userDefEndIConditionSelect) userDefEndIConditionSelect.addEventListener('change', refreshUserDefEndSpringVisibility);
  if (userDefEndJConditionSelect) userDefEndJConditionSelect.addEventListener('change', refreshUserDefEndSpringVisibility);

  // Event delegation for the list modal: one change listener keeps end-spring
  // selects in sync, one click listener dispatches on data-action.
  userDefListBody?.addEventListener('change', (event) => {
    const conditionEl = event.target.closest('[data-field$="Condition"]');
    if (!conditionEl) return;
    const springField = conditionEl.dataset.field.replace('Condition', 'Spring');
    const springEl = conditionEl.closest('td')?.querySelector(`[data-field="${springField}"]`);
    syncEndSpringVisibility(conditionEl, springEl);
  });

  userDefListBody?.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'calculate-section-row': calculateSectionRow(btn); break;
      case 'save-section': saveSectionRow(btn); break;
      case 'save-spring': saveSpringRow(btn); break;
      case 'save-material': saveMaterialRow(btn); break;
      case 'remove-section': removeSectionRow(btn); break;
      case 'remove-spring': removeSpringRow(btn); break;
      case 'remove-material': removeMaterialRow(btn); break;
    }
  });

  // User definition modals intentionally do NOT close on overlay (backdrop)
  // click or Escape. These forms hold in-progress input (section/spring
  // definitions, inline table edits), so closing must require an explicit
  // button to avoid losing input.

  resetUserDefForm();

  return {
    show: showUserDefModal,
    isOpen() {
      return userDefModal.classList.contains('visible')
        || userDefListModal.classList.contains('visible');
    },
    applyLanguage() {
      applyI18nTo(userDefModal);
      applyI18nTo(userDefListModal);
      refreshUserDefTypeOptions();
      refreshUserDefFormVisibility();
      clearUserDefFormError();
      if (userDefListModal?.classList.contains('visible')) {
        renderUserDefGroupList();
      }
    },
  };
}
