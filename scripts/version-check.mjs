import { readFile } from 'node:fs/promises';

import {
  displayVersionFromPackageVersion,
  extractIndexDisplayVersion,
  extractReadmeDisplayVersion,
  readPackageVersion,
} from './version-shared.mjs';

const packageVersion = await readPackageVersion();
const displayVersion = displayVersionFromPackageVersion(packageVersion);

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const readmeSource = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const lockSource = await readFile(new URL('../package-lock.json', import.meta.url), 'utf8');
const lock = JSON.parse(lockSource);

const indexVersions = extractIndexDisplayVersion(indexSource);
const readmeVersion = extractReadmeDisplayVersion(readmeSource);

const issues = [];

if (indexVersions.title !== displayVersion) {
  issues.push(`index.html title version mismatch: expected ${displayVersion}, actual ${indexVersions.title || 'not found'}`);
}
if (indexVersions.status !== displayVersion) {
  issues.push(`index.html status version mismatch: expected ${displayVersion}, actual ${indexVersions.status || 'not found'}`);
}
if (readmeVersion !== displayVersion) {
  issues.push(`README.md heading version mismatch: expected ${displayVersion}, actual ${readmeVersion || 'not found'}`);
}

const lockRootVersion = typeof lock?.version === 'string' ? lock.version : null;
const lockPackageVersion = typeof lock?.packages?.['']?.version === 'string'
  ? lock.packages[''].version
  : null;
if (lockRootVersion !== packageVersion) {
  issues.push(`package-lock.json root version mismatch: expected ${packageVersion}, actual ${lockRootVersion || 'not found'}`);
}
if (lockPackageVersion !== packageVersion) {
  issues.push(`package-lock.json packages[\"\"] version mismatch: expected ${packageVersion}, actual ${lockPackageVersion || 'not found'}`);
}

if (issues.length > 0) {
  console.error('Version consistency check failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  console.error('Run `npm run version:sync` and ensure package-lock.json is updated.');
  process.exit(1);
}

console.log(`Version check passed. package=${packageVersion}, display=${displayVersion}`);
