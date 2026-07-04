// section-catalog.js - Built-in section/spring catalog definitions and the
// pure normalization helpers around them. Extracted from state.js; nothing in
// this module depends on AppState.

import { DEFAULT_SECTION_B_MM, DEFAULT_SECTION_H_MM } from './constants.js';
import { positiveNumber as sanitizePositiveNumber } from './geometry-utils.js';

export const DEFAULT_SECTION_DEFINITIONS = [
  { target: 'member', type: 'beam', name: '_G', material: 'steel', b: DEFAULT_SECTION_B_MM, h: DEFAULT_SECTION_H_MM, color: '#666666', defaultEndI: { condition: 'pin', springSymbol: null }, defaultEndJ: { condition: 'pin', springSymbol: null }, isDefault: true },
  { target: 'member', type: 'column', name: '_C', material: 'steel', b: 105, h: 105, color: '#666666', defaultEndI: { condition: 'pin', springSymbol: null }, defaultEndJ: { condition: 'pin', springSymbol: null }, isDefault: true },
  { target: 'member', type: 'hbrace', name: '_H', material: 'steel', b: 20, h: 20, color: '#666666', defaultEndI: { condition: 'pin', springSymbol: null }, defaultEndJ: { condition: 'pin', springSymbol: null }, isDefault: true },
  { target: 'member', type: 'vbrace', name: '_V', material: 'steel', b: 20, h: 20, color: '#666666', defaultEndI: { condition: 'pin', springSymbol: null }, defaultEndJ: { condition: 'pin', springSymbol: null }, isDefault: true },
  { target: 'surface', type: 'floor', name: '_S', material: '', b: null, h: null, color: '#67a9cf', isDefault: true },
  { target: 'surface', type: 'exteriorWall', name: '_OW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
  { target: 'surface', type: 'wall', name: '_IW', material: '', b: null, h: null, color: '#b57a6b', isDefault: true },
  { target: 'surface', type: 'roof', name: '_R', material: '', b: null, h: null, color: '#8b6f47', isDefault: true },
  { target: 'surface', type: 'eave', name: '_E', material: '', b: null, h: null, color: '#4f9a8a', isDefault: true },
  { target: 'surface', type: 'gableWall', name: '_GW', material: '', b: null, h: null, color: '#bf6f5e', isDefault: true },
];

export const DEFAULT_SPRING_DEFINITIONS = [
  { symbol: '_SP', memo: '回転バネ', isDefault: true },
];

export const DEFAULT_SECTION_NAME_SET = new Set(DEFAULT_SECTION_DEFINITIONS.map(s => s.name));
export const DEFAULT_SPRING_SYMBOL_SET = new Set(DEFAULT_SPRING_DEFINITIONS.map(s => s.symbol));
export const END_FIXITIES = new Set(['pin', 'rigid', 'spring']);
export const MEMBER_SECTION_TYPE_ALIAS = {
  brace: 'hbrace',
};

// Local copy of the trivial text sanitizer to keep this module dependency-free.
function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSectionType(target, type) {
  if (!type) return '';
  if (target === 'member') {
    return MEMBER_SECTION_TYPE_ALIAS[type] || type;
  }
  return type;
}

export function createDefaultSectionCatalog() {
  return DEFAULT_SECTION_DEFINITIONS.map(s => ({
    ...s,
    type: MEMBER_SECTION_TYPE_ALIAS[s.type] || s.type,
    defaultEndI: s.defaultEndI ? { ...s.defaultEndI } : undefined,
    defaultEndJ: s.defaultEndJ ? { ...s.defaultEndJ } : undefined,
  }));
}

export function createDefaultSpringCatalog() {
  return DEFAULT_SPRING_DEFINITIONS.map(s => ({ ...s }));
}

export function normalizeCatalogSectionEntry(entry) {
  if (!entry || (entry.target !== 'member' && entry.target !== 'surface')) return null;
  const type = entry.target === 'member'
    ? (MEMBER_SECTION_TYPE_ALIAS[entry.type] || entry.type)
    : entry.type;
  const name = sanitizeText(entry.name);
  if (!type || !name) return null;
  const material = sanitizeText(entry.material) || (entry.target === 'member' ? 'steel' : '');

  const normalized = {
    target: entry.target,
    type,
    name,
    material,
    b: entry.target === 'member' ? sanitizePositiveNumber(entry.b, DEFAULT_SECTION_B_MM) : null,
    h: entry.target === 'member' ? sanitizePositiveNumber(entry.h, DEFAULT_SECTION_H_MM) : null,
    color: sanitizeColor(entry.color, defaultColorForSection(entry.target, type)),
    memo: sanitizeText(entry.memo) || '',
  };
  if (entry.target === 'member') {
    normalized.defaultEndI = normalizeSectionDefaultEnd(entry.defaultEndI || entry.endI);
    normalized.defaultEndJ = normalizeSectionDefaultEnd(entry.defaultEndJ || entry.endJ);
  }
  return normalized;
}

export function normalizeSpringEntry(entry) {
  if (!entry) return null;
  const symbol = sanitizeText(entry.symbol || entry.name);
  if (!symbol) return null;
  return {
    symbol,
    memo: sanitizeText(entry.memo) || '',
  };
}

export function isSameSectionDefinition(a, b) {
  return a.target === b.target &&
    (MEMBER_SECTION_TYPE_ALIAS[a.type] || a.type) === (MEMBER_SECTION_TYPE_ALIAS[b.type] || b.type) &&
    a.name === b.name &&
    (a.material || '') === (b.material || '') &&
    sanitizeColor(a.color, defaultColorForSection(a.target, a.type)) ===
      sanitizeColor(b.color, defaultColorForSection(b.target, b.type)) &&
    (a.target !== 'member' || (
      sanitizePositiveNumber(a.b, DEFAULT_SECTION_B_MM) === sanitizePositiveNumber(b.b, DEFAULT_SECTION_B_MM) &&
      sanitizePositiveNumber(a.h, DEFAULT_SECTION_H_MM) === sanitizePositiveNumber(b.h, DEFAULT_SECTION_H_MM) &&
      isSameMemberEnd(a.defaultEndI, b.defaultEndI) &&
      isSameMemberEnd(a.defaultEndJ, b.defaultEndJ)
    ));
}

export function cloneSection(section) {
  return {
    ...section,
    defaultEndI: section.defaultEndI ? { ...section.defaultEndI } : undefined,
    defaultEndJ: section.defaultEndJ ? { ...section.defaultEndJ } : undefined,
  };
}

// Normalizes a member end descriptor to { condition, springSymbol }.
// When a springCatalog is given, a requested spring symbol is validated
// against it (unknown symbols fall back to the catalog's first spring);
// without a catalog the requested symbol is kept as-is, falling back to the
// built-in default spring symbol.
export function normalizeMemberEndInfo(endInfo, springCatalog = null) {
  const raw = endInfo || {};
  const rawCondition = sanitizeText(raw.condition || raw.fixity || raw.type) || 'pin';
  const condition = END_FIXITIES.has(rawCondition) ? rawCondition : 'pin';
  if (condition !== 'spring') {
    return { condition, springSymbol: null };
  }
  const requested = sanitizeText(raw.springSymbol || raw.symbol);
  if (springCatalog) {
    const spring = requested ? springCatalog.find(s => s.symbol === requested) || null : null;
    return { condition, springSymbol: spring?.symbol || springCatalog[0]?.symbol || null };
  }
  return { condition, springSymbol: requested || DEFAULT_SPRING_DEFINITIONS[0]?.symbol || null };
}

// Catalog-free member end normalization (used for raw catalog entries where
// the spring catalog may not be hydrated yet).
export function normalizeSectionDefaultEnd(endInfo) {
  return normalizeMemberEndInfo(endInfo, null);
}

export function isSameMemberEnd(a, b) {
  const endA = normalizeSectionDefaultEnd(a);
  const endB = normalizeSectionDefaultEnd(b);
  return endA.condition === endB.condition && (endA.springSymbol || null) === (endB.springSymbol || null);
}

export function sanitizeColor(value, fallback) {
  const text = sanitizeText(value);
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  const safeFallback = sanitizeText(fallback);
  return /^#[0-9a-fA-F]{6}$/.test(safeFallback) ? safeFallback.toLowerCase() : '#666666';
}

export function defaultColorForSection(target, type) {
  const normalizedType = target === 'member'
    ? (MEMBER_SECTION_TYPE_ALIAS[type] || type)
    : type;
  const def = DEFAULT_SECTION_DEFINITIONS.find(
    s => s.target === target && (MEMBER_SECTION_TYPE_ALIAS[s.type] || s.type) === normalizedType
  );
  if (def && /^#[0-9a-fA-F]{6}$/.test(def.color || '')) {
    return def.color.toLowerCase();
  }
  if (target === 'surface') {
    if (normalizedType === 'floor') return '#67a9cf';
    if (normalizedType === 'roof') return '#8b6f47';
    if (normalizedType === 'eave') return '#4f9a8a';
    if (normalizedType === 'gableWall') return '#bf6f5e';
    return '#b57a6b';
  }
  return '#666666';
}

// Rebuilds a section catalog from raw (loaded) entries on top of the default
// catalog. Throws on reserved default names redefined differently and on
// duplicates.
export function hydrateSectionCatalog(rawCatalog) {
  const catalog = createDefaultSectionCatalog();
  if (!Array.isArray(rawCatalog)) return catalog;

  const defaultsByName = new Map(
    createDefaultSectionCatalog().map(s => [s.name, s])
  );

  for (const raw of rawCatalog) {
    const normalized = normalizeCatalogSectionEntry(raw);
    if (!normalized) continue;

    const defaultDef = defaultsByName.get(normalized.name);
    if (defaultDef) {
      if (!isSameSectionDefinition(defaultDef, normalized)) {
        throw new Error(`Reserved default section name: ${normalized.name}`);
      }
      continue;
    }

    if (catalog.some(s =>
      s.target === normalized.target &&
      s.type === normalized.type &&
      s.name === normalized.name
    )) {
      throw new Error(`Duplicate section name: ${normalized.name}`);
    }
    catalog.push({ ...normalized, isDefault: false });
  }
  return catalog;
}

export function hydrateSpringCatalog(rawCatalog) {
  const catalog = createDefaultSpringCatalog();
  if (!Array.isArray(rawCatalog)) return catalog;

  const defaultsBySymbol = new Map(
    createDefaultSpringCatalog().map(s => [s.symbol, s])
  );

  for (const raw of rawCatalog) {
    const normalized = normalizeSpringEntry(raw);
    if (!normalized) continue;

    const defaultDef = defaultsBySymbol.get(normalized.symbol);
    if (defaultDef) {
      if ((defaultDef.memo || '') !== (normalized.memo || '')) {
        throw new Error(`Reserved default spring symbol: ${normalized.symbol}`);
      }
      continue;
    }

    if (catalog.some(s => s.symbol === normalized.symbol)) {
      throw new Error(`Duplicate spring symbol: ${normalized.symbol}`);
    }
    catalog.push({ ...normalized, isDefault: false });
  }
  return catalog;
}
