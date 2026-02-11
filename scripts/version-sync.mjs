import { readFile, writeFile } from 'node:fs/promises';

import {
  displayVersionFromPackageVersion,
  readPackageVersion,
  updateIndexHtml,
  updateReadme,
} from './version-shared.mjs';

const packageVersion = await readPackageVersion();
const displayVersion = displayVersionFromPackageVersion(packageVersion);

const indexPath = new URL('../index.html', import.meta.url);
const readmePath = new URL('../README.md', import.meta.url);

const indexSource = await readFile(indexPath, 'utf8');
const readmeSource = await readFile(readmePath, 'utf8');

const nextIndex = updateIndexHtml(indexSource, displayVersion);
const nextReadme = updateReadme(readmeSource, displayVersion);

if (nextIndex !== indexSource) {
  await writeFile(indexPath, nextIndex, 'utf8');
}
if (nextReadme !== readmeSource) {
  await writeFile(readmePath, nextReadme, 'utf8');
}

console.log(`Synced display version to ${displayVersion} (package: ${packageVersion})`);
