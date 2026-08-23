import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readProjectFile = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('analysis export settings UI exposes mass factors and self-weight mode', async () => {
  const [html, appSource, modalSource] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('js/app.js'),
    readProjectFile('js/analysis-settings-modal.js'),
  ]);

  for (const id of [
    'btn-analysis-settings',
    'analysis-settings-modal',
    'analysis-settings-form',
    'analysis-mass-source-list',
    'analysis-self-weight-mode',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(appSource, /initAnalysisSettingsModal/);
  assert.match(appSource, /state\.updateAnalysisSettings\(settings\)/);
  assert.match(modalSource, /LOAD_CASES\.map/);
  assert.match(modalSource, /massSources/);
});

test('user definition UI exposes material, section-property, and spring-stiffness inputs', async () => {
  const [html, source, css] = await Promise.all([
    readProjectFile('index.html'),
    readProjectFile('js/user-def-modal.js'),
    readProjectFile('style.css'),
  ]);

  for (const id of [
    'user-def-section-material',
    'user-def-shape',
    'user-def-flange-thickness',
    'user-def-web-thickness',
    'user-def-box-thickness',
    'user-def-A',
    'user-def-Iy',
    'user-def-Iz',
    'user-def-J',
    'btn-user-def-calculate-properties',
    'user-def-shear-area-ratio-y',
    'user-def-shear-area-ratio-z',
    'user-def-kr',
    'user-def-kt',
    'user-def-material-name',
    'user-def-E',
    'user-def-G',
    'user-def-density',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(source, /state\.addMaterial/);
  assert.match(source, /state\.updateMaterial/);
  assert.match(source, /state\.updateSpring\(symbol, \{ kr:/);
  assert.match(source, /patch\[property\] = result\.value/);
  assert.match(source, /calculateSectionPropertiesFromShape/);
  assert.match(source, /Math\.round\(value\)/);
  assert.match(html, /id="user-def-shear-area-ratio-y"[^>]*step="any"/);
  assert.match(html, /id="user-def-shear-area-ratio-z"[^>]*step="any"/);
  assert.match(css, /\[hidden\]\s*\{\s*display: none !important;/);
});
