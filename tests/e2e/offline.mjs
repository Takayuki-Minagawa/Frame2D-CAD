import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const threeRoot = fileURLToPath(new URL('../../node_modules/three/', import.meta.url));
export async function installOfflineRoutes(context, baseURL) {
  const { version } = JSON.parse(await readFile(path.join(threeRoot, 'package.json'), 'utf8'));
  if (version !== '0.170.0') throw new Error(`Offline E2E requires three@0.170.0; installed ${version}`);
  const requests = { three: [], blocked: [] };
  const localOrigin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const prefix = '/npm/three@0.170.0/';
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith(prefix)) {
      const relative = decodeURIComponent(url.pathname.slice(prefix.length));
      const file = path.resolve(threeRoot, relative);
      if (!file.startsWith(`${path.resolve(threeRoot)}${path.sep}`)) return route.abort();
      requests.three.push(relative);
      await route.fulfill({ path: file, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
      return;
    }
    if (url.origin === localOrigin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    requests.blocked.push(url.href);
    await route.abort('blockedbyclient');
  });
  return requests;
}
