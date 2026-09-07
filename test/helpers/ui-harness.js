import { UI } from '../../js/ui.js';
import { ToolManager } from '../../js/tools.js';
import { AppState } from '../../js/state.js';
import { History } from '../../js/history.js';
import { executeModelCommand } from '../../js/commands/model-command.js';

// Small DOM adapter for rendered controls. Tests exercise events and model
// results rather than asserting the source location of an implementation.
class Element extends EventTarget {
  constructor(document, tagName = 'div') {
    super(); this.ownerDocument = document; this.tagName = tagName.toUpperCase();
    this.children = []; this.dataset = {}; this.value = ''; this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  set innerHTML(html) {
    this._html = html;
    for (const child of this.children) if (child.id) this.ownerDocument.elements.delete(child.id);
    this.children = [];
    for (const match of html.matchAll(/<(input|select|button)\b([^>]*)>/g)) {
      const el = new Element(this.ownerDocument, match[1]);
      const attrs = match[2];
      for (const attr of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
        el[attr[1]] = attr[2];
        if (attr[1].startsWith('data-')) el.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attr[2];
      }
      el.checked = /\bchecked\b/.test(attrs); el.disabled = /\bdisabled\b/.test(attrs);
      if (match[1] === 'select') {
        const content = html.slice(match.index + match[0].length).split('</select>')[0];
        const options = [...content.matchAll(/<option\b([^>]*)>/g)];
        const selected = options.find(m => /\bselected\b/.test(m[1])) || options[0];
        el.value = selected?.[1].match(/value="([^"]*)"/)?.[1] || '';
      }
      if (el.id) this.ownerDocument.elements.set(el.id, el);
      this.children.push(el);
    }
  }
  get innerHTML() { return this._html || ''; }
  appendChild(el) { this.children.push(el); return el; }
  querySelectorAll(selector) {
    if (selector === '[data-diagnostic-target]') return this.children.filter(el => el.dataset.diagnosticTarget !== undefined);
    return [];
  }
  setCustomValidity(message) { this.validationMessage = message; }
  reportValidity() {}
  focus() {}
  change(value) { if (this.type === 'checkbox') this.checked = value; else this.value = String(value); this.dispatchEvent(new Event('change')); }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
export function uiHarness(context, state = new AppState(), callbacks = {}) {
  const before = { document: globalThis.document, localStorage: globalThis.localStorage };
  const document = { elements: new Map(), documentElement: {}, getElementById(id) { return this.elements.get(id) || null; },
    querySelectorAll() { return []; }, createElement(tag) { return new Element(this, tag); } };
  globalThis.document = document;
  globalThis.localStorage = { setItem() {}, getItem() { return null; } };
  context.after(() => Object.assign(globalThis, before));
  const container = new Element(document);
  document.elements.set('prop-content', container);
  const diagnostics = new Element(document);
  document.elements.set('model-check-content', diagnostics);
  const history = new History(state);
  const ui = Object.assign(Object.create(UI.prototype), { state,
    callbacks: { onModelCommand: fn => executeModelCommand(history, state, fn), ...callbacks },
    refreshQuantitySummary() {},
  });
  return { ui, state, history, container, diagnostics, document, get: id => document.getElementById(id) };
}
export function toolHarness(state = new AppState()) {
  const history = new History(state);
  const manager = Object.assign(Object.create(ToolManager.prototype), { state, history, callbacks: {}, onUpdate() {},
    canvas2d: { camera: { scale: 1 }, preview: null, measure: null }, _surfacePolyline: [],
    _getWorldPos: e => e, _getSnappedPos: e => e,
  });
  return { manager, state, history };
}
