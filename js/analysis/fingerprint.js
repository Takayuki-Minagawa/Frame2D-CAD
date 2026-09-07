// Versioned cross-language encoding; see scripts/analysis_common.py.
export const FINGERPRINT_VERSION = 'typed-json-binary64-v1';

export function fingerprintPayload(model) {
  const copy = structuredClone(model);
  if (copy.meta) {
    delete copy.meta.generatedAt;
    delete copy.meta.generator;
  }
  const encode = value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Fingerprint requires finite JSON numbers');
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, value === 0 ? 0 : value, false);
      return ['number', Array.from(new Uint8Array(view.buffer), b => b.toString(16).padStart(2, '0')).join('')];
    }
    if (Array.isArray(value)) return ['array', value.map(encode)];
    if (typeof value === 'object') return ['object', Object.keys(value).sort().map(key => [key, encode(value[key])])];
    throw new Error('Fingerprint requires JSON values');
  };
  return JSON.stringify(encode(copy));
}

export async function modelFingerprint(model) {
  const bytes = new globalThis.TextEncoder().encode(fingerprintPayload(model));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
}
