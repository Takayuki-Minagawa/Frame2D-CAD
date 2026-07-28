import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { t, getLang } from '../js/i18n.js';

// The dictionaries are module-private in js/i18n.js, so load the module source
// with an appended export to inspect them without modifying the source file.
// If the internal `dict` variable is renamed during refactoring, update this test.
async function loadDict() {
  const source = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');
  assert.match(source, /const dict = \{/, 'expected js/i18n.js to define a module-level `dict`');
  const augmented = `${source}\nexport { dict as __dict };`;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(augmented).toString('base64')}`);
  return mod.__dict;
}

// Keys knowingly missing from one language. Currently empty: ja and en are in
// full parity. If a refactor intentionally introduces a gap, list it here.
const KNOWN_MISSING_IN_EN = [];
const KNOWN_MISSING_IN_JA = [];

test('ja and en dictionaries expose the same key set', async () => {
  const dict = await loadDict();
  assert.ok(dict.ja && dict.en, 'dict must contain ja and en');

  const jaKeys = Object.keys(dict.ja);
  const enKeys = Object.keys(dict.en);
  assert.ok(jaKeys.length > 0);

  const missingInEn = jaKeys.filter(key => !(key in dict.en)).sort();
  const missingInJa = enKeys.filter(key => !(key in dict.ja)).sort();

  assert.deepEqual(missingInEn, [...KNOWN_MISSING_IN_EN].sort(),
    `keys present in ja but missing in en: ${missingInEn.join(', ')}`);
  assert.deepEqual(missingInJa, [...KNOWN_MISSING_IN_JA].sort(),
    `keys present in en but missing in ja: ${missingInJa.join(', ')}`);
});

test('every dictionary value is a non-empty string', async () => {
  const dict = await loadDict();
  for (const lang of ['ja', 'en']) {
    for (const [key, value] of Object.entries(dict[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} should be a string`);
      assert.ok(value.length > 0, `${lang}.${key} should not be empty`);
    }
  }
});

test('placeholders like {n} match between ja and en for shared keys', async () => {
  const dict = await loadDict();
  const placeholders = value => [...new Set(String(value).match(/\{\w+\}/g) || [])].sort();

  const mismatches = [];
  for (const key of Object.keys(dict.ja)) {
    if (!(key in dict.en)) continue;
    const ja = placeholders(dict.ja[key]);
    const en = placeholders(dict.en[key]);
    if (JSON.stringify(ja) !== JSON.stringify(en)) {
      mismatches.push(`${key}: ja=[${ja}] en=[${en}]`);
    }
  }
  assert.deepEqual(mismatches, []);
});

test('grid frame enhancements expose complete Japanese and English copy', async () => {
  const dict = await loadDict();
  const keys = [
    'gridFrameStoryCount',
    'gridFrameGenerateItems',
    'gridFrameGenerateColumns',
    'gridFrameGenerateBeams',
    'gridFrameGenerateWalls',
    'gridFrameStoryTable',
    'gridFrameStory',
    'gridFrameStoryHeight',
    'gridFrameBulkRow',
    'gridFrameBulkApply',
    'gridFrameColumnSection',
    'gridFrameBeamSection',
    'gridFrameFloorSection',
    'gridFrameWallSection',
    'gridFrameGenerateFoundation',
    'gridFrameFoundation',
    'gridFrameFoundationDepth',
    'gridFrameFoundationColumnSection',
    'gridFrameFoundationBeamSection',
    'gridFrameFoundationDepthInvalid',
    'gridFrameStoryHeightInvalid',
    'gridFrameNoMembers',
    'gridFrameGenerateFloors',
    'gridFramePreset',
    'gridFramePresetNone',
    'gridFramePresetSave',
    'gridFramePresetDelete',
    'gridFramePresetNamePrompt',
    'gridFramePresetNameRequired',
    'gridFramePresetLimit',
    'gridFramePresetSaved',
    'gridFramePresetLoaded',
    'gridFramePresetDeleted',
    'gridFramePresetDeleteConfirm',
    'gridFramePresetSaveFailed',
    'gridFramePresetDeleteFailed',
  ];

  for (const key of keys) {
    assert.ok(key in dict.ja, `ja.${key} should exist`);
    assert.ok(key in dict.en, `en.${key} should exist`);
  }

  assert.match(dict.ja.gridFrameSpansXPlaceholder, /3@6000/);
  assert.match(dict.en.gridFrameSpansXPlaceholder, /3@6000/);
  const doneParams = /\{columns\}.*\{beams\}.*\{floors\}.*\{walls\}.*\{foundationColumns\}.*\{foundationBeams\}/;
  assert.match(dict.ja.gridFrameDone, doneParams);
  assert.match(dict.en.gridFrameDone, doneParams);
  assert.match(dict.ja.gridFrameStoryHeightInvalid, /\{story\}/);
  assert.match(dict.en.gridFrameStoryHeightInvalid, /\{story\}/);
  assert.match(dict.ja.gridFrameTooLarge, /要素数/);
  assert.match(dict.en.gridFrameTooLarge, /element count/);
});

test('t() resolves keys in the default language and echoes unknown keys', () => {
  assert.equal(getLang(), 'ja');
  assert.equal(t('tools'), 'ツール');
  assert.equal(t('no-such-key-xyz'), 'no-such-key-xyz');
});

test('t() substitutes {name} placeholders from params', () => {
  assert.equal(getLang(), 'ja');
  assert.equal(t('roofGeneratedPlanes', { n: 3 }), '3枚の屋根面を生成しました。');
  assert.equal(
    t('layerInUse', { m: 1, s: 2, l: 3, p: 4 }),
    'このレイヤーは使用中です（線材: 1、面材: 2、荷重: 3、支点: 4）。先に要素を削除またはレイヤー変更してください。'
  );
  assert.equal(
    t('memberLayerHintColumn', { base: 'L1 (z=0)', top: 'L2 (z=3000)' }),
    '下端管理: L1 (z=0) / 上端: L2 (z=3000)'
  );
});

test('t() leaves unspecified placeholders untouched', () => {
  assert.equal(
    t('layerInUse', { m: 5 }),
    'このレイヤーは使用中です（線材: 5、面材: {s}、荷重: {l}、支点: {p}）。先に要素を削除またはレイヤー変更してください。'
  );
  assert.equal(t('roofGeneratedPlanes'), '{n}枚の屋根面を生成しました。');
});
