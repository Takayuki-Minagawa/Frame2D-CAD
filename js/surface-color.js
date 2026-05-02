// surface-color.js - Shared surface color resolution helpers

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

export function defaultSurfaceColorForType(type) {
  if (type === 'floor') return '#67a9cf';
  if (type === 'roof') return '#8b6f47';
  if (type === 'eave') return '#4f9a8a';
  if (type === 'gableWall') return '#bf6f5e';
  return '#b57a6b';
}

export function resolveSurfaceColor(surface) {
  if (isHexColor(surface?.color)) return surface.color;
  return defaultSurfaceColorForType(surface?.type);
}
