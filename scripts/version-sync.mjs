import { readFile, writeFile } from 'node:fs/promises';

import {
  displayVersionFromPackageVersion,
  readPackageVersion,
  updateAppVersion,
  updateIndexHtml,
  updateReadme,
} from './version-shared.mjs';

const packageVersion = await readPackageVersion();
const displayVersion = displayVersionFromPackageVersion(packageVersion);

const indexPath = new URL('../index.html', import.meta.url);
const readmePath = new URL('../README.md', import.meta.url);
const constantsPath = new URL('../js/constants.js', import.meta.url);

const indexSource = await readFile(indexPath, 'utf8');
const readmeSource = await readFile(readmePath, 'utf8');
const constantsSource = await readFile(constantsPath, 'utf8');

const nextIndex = updateIndexHtml(indexSource, displayVersion, packageVersion);
const nextReadme = updateReadme(readmeSource, displayVersion);
const nextConstants = updateAppVersion(constantsSource, packageVersion);

if (nextIndex !== indexSource) {
  await writeFile(indexPath, nextIndex, 'utf8');
}
if (nextReadme !== readmeSource) {
  await writeFile(readmePath, nextReadme, 'utf8');
}
if (nextConstants !== constantsSource) {
  await writeFile(constantsPath, nextConstants, 'utf8');
}

console.log(`Synced display version to ${displayVersion} (package: ${packageVersion})`);
