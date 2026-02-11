// surface-color.js - Shared surface color resolution helpers

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

export function defaultSurfaceColorForType(type) {
  return type === 'floor' ? '#67a9cf' : '#b57a6b';
}

export function resolveSurfaceColor(surface) {
  if (isHexColor(surface?.color)) return surface.color;
  return defaultSurfaceColorForType(surface?.type);
}
