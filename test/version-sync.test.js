import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  displayVersionFromPackageVersion,
  extractAppVersion,
  updateAppVersion,
  updateIndexHtml,
  extractIndexDisplayVersion,
  extractIndexAssetVersions,
} from '../scripts/version-shared.mjs';

const SAMPLE_INDEX = `<!DOCTYPE html>
<html lang="ja">
<head>
  <title>Element Modeler - Ver.0.0.1</title>
  <link rel="stylesheet" href="style.css?v=20260210-1">
</head>
<body>
  <span id="status-version">Ver.0.0.1</span>
  <script type="module" src="js/app.js?v=20260210-1"></script>
</body>
</html>`;

test('updateIndexHtml rewrites display version and asset cache-bust versions', () => {
  const displayVersion = displayVersionFromPackageVersion('1.2.3');
  const next = updateIndexHtml(SAMPLE_INDEX, displayVersion, '1.2.3');

  const display = extractIndexDisplayVersion(next);
  assert.equal(display.title, 'Ver.1.2.3');
  assert.equal(display.status, 'Ver.1.2.3');

  const assets = extractIndexAssetVersions(next);
  assert.equal(assets.style, '1.2.3');
  assert.equal(assets.app, '1.2.3');
});

test('updateIndexHtml leaves asset versions untouched when assetVersion is omitted', () => {
  const next = updateIndexHtml(SAMPLE_INDEX, 'Ver.9.9.9');
  const assets = extractIndexAssetVersions(next);
  assert.equal(assets.style, '20260210-1');
  assert.equal(assets.app, '20260210-1');
});

test('updateIndexHtml is idempotent for asset cache-bust versions', () => {
  const once = updateIndexHtml(SAMPLE_INDEX, 'Ver.1.2.3', '1.2.3');
  const twice = updateIndexHtml(once, 'Ver.1.2.3', '1.2.3');
  assert.equal(once, twice);
  const assets = extractIndexAssetVersions(twice);
  assert.equal(assets.style, '1.2.3');
  assert.equal(assets.app, '1.2.3');
});

test('extractIndexAssetVersions returns null when a query string is absent', () => {
  const source = `<link rel="stylesheet" href="style.css">
<script type="module" src="js/app.js"></script>`;
  const assets = extractIndexAssetVersions(source);
  assert.equal(assets.style, null);
  assert.equal(assets.app, null);
});

test('updateAppVersion keeps the analysis generator version in package sync', () => {
  const source = "export const APP_VERSION = '0.0.1';\n";
  const next = updateAppVersion(source, '1.2.3');
  assert.equal(extractAppVersion(next), '1.2.3');
  assert.equal(updateAppVersion(next, '1.2.3'), next);
});
