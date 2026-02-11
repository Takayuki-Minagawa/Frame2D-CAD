import { readFile } from 'node:fs/promises';

export async function readPackageVersion() {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(raw);
  if (typeof pkg.version !== 'string' || pkg.version.trim() === '') {
    throw new Error('package.json version is missing');
  }
  return pkg.version.trim();
}

export function displayVersionFromPackageVersion(packageVersion) {
  const majorText = String(packageVersion).split('.')[0];
  const major = Number.parseInt(majorText, 10);
  if (!Number.isFinite(major) || major < 0) {
    throw new Error(`Invalid package version: ${packageVersion}`);
  }
  return `Ver.${major}`;
}

export function updateIndexHtml(source, displayVersion) {
  return source
    .replace(
      /<title>Element Modeler - Ver\.[^<]+<\/title>/,
      `<title>Element Modeler - ${displayVersion}</title>`
    )
    .replace(
      /<span id="status-version">Ver\.[^<]+<\/span>/,
      `<span id="status-version">${displayVersion}</span>`
    );
}

export function updateReadme(source, displayVersion) {
  return source.replace(
    /^# Element Modeler \(Ver\.[^)]+\)$/m,
    `# Element Modeler (${displayVersion})`
  );
}

export function extractIndexDisplayVersion(source) {
  const titleMatch = source.match(/<title>Element Modeler - (Ver\.[^<]+)<\/title>/);
  const statusMatch = source.match(/<span id="status-version">(Ver\.[^<]+)<\/span>/);
  return {
    title: titleMatch?.[1] || null,
    status: statusMatch?.[1] || null,
  };
}

export function extractReadmeDisplayVersion(source) {
  const headingMatch = source.match(/^# Element Modeler \((Ver\.[^)]+)\)$/m);
  return headingMatch?.[1] || null;
}
