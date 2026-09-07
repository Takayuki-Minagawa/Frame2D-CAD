import { getLang } from '../i18n.js';

const messages = {
  en: {
    idle: 'Autosave ready', pending: 'Unsaved changes', saving: 'Saving…', saved: 'Saved',
    error: 'Autosave failed', disabled: 'Autosave off', last: 'Last successful save',
    open: 'Recovery history', title: 'Recovery history — latest 5 generations',
    empty: 'No recovery generations yet.', loading: 'Loading…', close: 'Close',
    restore: 'Restore selected generation', retry: 'Save now / retry',
    description: 'Restoring replaces the model and its catalogs. Undo returns to your current work.',
    failure: 'Recovery failed. Your current model and saved generations are retained.',
    conflict: 'Another tab saved a newer generation. Review recovery history and choose a generation before saving again.',
    restored: 'Generation restored. You can undo this change.',
    unavailable: 'Recovery storage is unavailable. Retry or download your CAD file.',
  },
  ja: {
    idle: '自動保存待機中', pending: '未保存の変更あり', saving: '保存中…', saved: '保存済み',
    error: '自動保存失敗', disabled: '自動保存OFF', last: '最終保存成功',
    open: '復元履歴', title: '復元履歴 — 最新5世代', empty: '復元できる保存履歴はありません。',
    loading: '読込中…', close: '閉じる', restore: '選択した世代を復元', retry: '今すぐ保存 / 再試行',
    description: '復元するとモデルとカタログが置き換わります。「元に戻す」で現在の作業に戻れます。',
    failure: '復元できませんでした。現在のモデルと保存済みの世代は保持されています。',
    conflict: '別のタブで新しい世代が保存されました。復元履歴を確認し、世代を選んでから保存してください。',
    restored: '選択した世代を復元しました。「元に戻す」で復元前に戻せます。',
    unavailable: '復元用の保存先を利用できません。再試行するかCADファイルをダウンロードしてください。',
  },
};

// Mounts its own DOM; no index.html or central dictionary edits are required.
// Use the same controller for timer saves and UI actions. Errors stay inline,
// preventing repeated timer failures from generating repeated modal alerts.
export function mountRecoveryUI({
  autosave, host = document.getElementById('status-bar') || document.body,
  documentTarget = document, language = getLang,
} = {}) {
  const make = (tag, parent) => {
    const node = documentTarget.createElement(tag);
    if (parent) parent.appendChild(node);
    return node;
  };
  const root = make('span', host);
  root.dataset.persistenceUi = 'true';
  const status = make('span', root);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const openButton = make('button', root);
  openButton.type = 'button';
  const dialog = make('dialog', documentTarget.body);
  // Native dialogs keep focus inside, but key events still bubble to the
  // document's CAD shortcuts. Preserve native Escape/keyboard behavior while
  // keeping Delete, V, undo, etc. away from the underlying model.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.setAttribute('aria-labelledby', 'recovery-history-title');
  const title = make('h2', dialog);
  title.id = 'recovery-history-title';
  const description = make('p', dialog);
  const feedback = make('p', dialog);
  feedback.setAttribute('role', 'status');
  const select = make('select', dialog);
  select.size = 5;
  select.style.width = '100%';
  const actions = make('p', dialog);
  const restoreButton = make('button', actions);
  const retryButton = make('button', actions);
  const closeButton = make('button', actions);
  for (const button of [restoreButton, retryButton, closeButton]) button.type = 'button';
  let entries = [];
  let busy = false;
  let disposed = false;
  let requestVersion = 0;
  let feedbackKey = '';
  const strings = () => messages[language()] || messages.en;
  const time = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(language() === 'ja' ? 'ja-JP' : 'en-US') : '—';
  };
  const render = () => {
    if (disposed) return;
    const text = strings();
    const current = autosave.getStatus();
    status.textContent = `${text[current.status] || text.idle}${current.lastSavedAt ? ` · ${text.last}: ${time(current.lastSavedAt)}` : ''} `;
    status.dataset.status = current.status;
    openButton.textContent = text.open;
    title.textContent = text.title;
    description.textContent = text.description;
    closeButton.textContent = text.close;
    retryButton.textContent = text.retry;
    restoreButton.textContent = text.restore;
    select.setAttribute('aria-label', text.title);
    const selected = select.value;
    select.replaceChildren();
    for (const entry of entries) {
      const option = make('option', select);
      option.value = String(entry.id);
      // Text only: model names are untrusted imported data.
      option.textContent = `${time(entry.savedAt)} — ${entry.data?.meta?.name || '—'}`;
    }
    if (entries.some(entry => String(entry.id) === selected)) select.value = selected;
    else if (entries.length) select.value = String(entries[0].id);
    restoreButton.disabled = busy || !entries.length;
    retryButton.disabled = busy || current.status === 'disabled';
    select.disabled = busy;
    feedback.textContent = text[feedbackKey] || (current.error
      ? current.error.name === 'AutosaveConflictError' ? text.conflict : text.unavailable
      : entries.length ? '' : text.empty);
  };
  const refresh = async () => {
    const version = ++requestVersion;
    busy = true;
    feedbackKey = 'loading';
    render();
    try {
      const result = await autosave.listGenerations();
      if (disposed || version !== requestVersion) return;
      entries = result;
      feedbackKey = '';
    } catch {
      if (disposed || version !== requestVersion) return;
      entries = [];
      feedbackKey = 'unavailable';
    } finally {
      if (!disposed && version === requestVersion) { busy = false; render(); }
    }
  };
  openButton.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    void refresh();
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => openButton.focus());
  restoreButton.addEventListener('click', async () => {
    const entry = entries.find(item => String(item.id) === select.value);
    if (busy || !entry) return;
    busy = true;
    feedbackKey = 'loading';
    render();
    try { await autosave.restoreGeneration(entry.id); feedbackKey = 'restored'; }
    catch { feedbackKey = 'failure'; }
    finally { busy = false; render(); }
  });
  retryButton.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    feedbackKey = '';
    render();
    await autosave.saveNow();
    await refresh();
  });
  const unsubscribe = autosave.subscribe(render);
  // setLang already changes <html lang>; observe that without modifying it.
  const observer = globalThis.MutationObserver && new globalThis.MutationObserver(render);
  observer?.observe(documentTarget.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return {
    open: () => { if (!dialog.open) dialog.showModal(); return refresh(); },
    refresh, applyLanguage: render,
    destroy() {
      disposed = true;
      requestVersion += 1;
      unsubscribe();
      observer?.disconnect();
      dialog.close();
      dialog.remove();
      root.remove();
    },
  };
}
