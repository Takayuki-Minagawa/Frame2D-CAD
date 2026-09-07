// Optional isolated validation runtime, without changing the app import map or
// shared package files: THREE_TEST_ROOT=/path/to/node_modules/three node --test.
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (process.env.THREE_TEST_ROOT && (specifier === 'three' || specifier.startsWith('three/addons/'))) {
    const path = specifier === 'three' ? 'build/three.module.js' : specifier.replace('three/addons/', 'examples/jsm/');
    return { url: pathToFileURL(resolvePath(process.env.THREE_TEST_ROOT, path)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
