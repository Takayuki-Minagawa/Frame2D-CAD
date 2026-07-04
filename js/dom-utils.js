// dom-utils.js - small shared DOM helpers

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Read a CSS custom property from :root. Values are cached because reads force
// style recalculation; call invalidateCssVarCache() whenever the theme changes.
const cssVarCache = new Map();

export function cssVar(name) {
  let value = cssVarCache.get(name);
  if (value === undefined) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    // An empty value can mean the stylesheet is not applied yet - retry next read.
    if (value !== '') cssVarCache.set(name, value);
  }
  return value;
}

export function invalidateCssVarCache() {
  cssVarCache.clear();
}

// Flag an input as invalid. With a message the browser validity popup is used;
// without one the input is focused instead.
export function markInputInvalid(input, message = '') {
  if (!input) return;
  input.classList.add('input-error');
  if (message) {
    input.setCustomValidity(message);
    input.reportValidity();
  } else {
    input.focus();
  }
}

export function clearInputInvalid(input) {
  if (!input) return;
  input.classList.remove('input-error');
  input.setCustomValidity('');
}
