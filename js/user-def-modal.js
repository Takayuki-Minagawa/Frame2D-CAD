// Public coordinator for the creation form, catalog list and file actions.
import { t } from './i18n.js';
import { showNotice } from './notice.js';
import { exportUserDefs } from './io.js';
import { createCatalogCommands } from './ui/user-def/catalog-commands.js';
import { createUserDefForm } from './ui/user-def/form.js';
import { createUserDefList } from './ui/user-def/list.js';

// History is optional for existing standalone consumers. The app supplies its
// shared History instance so every successful catalog action is one Undo entry.
export function initUserDefModal({ state, history = null, onModelChange, refreshDraftSectionSelectors }) {
  const commands = createCatalogCommands({ state, history });
  const form = createUserDefForm({
    state, commands, onModelChange, refreshDraftSectionSelectors,
    onGroupChange: () => list?.refresh(),
  });
  const list = createUserDefList({
    state, commands, onModelChange, refreshDraftSectionSelectors,
    getGroup: form.getGroup,
    refreshMaterialSelectOptions: form.refreshMaterialSelectOptions,
  });

  // User definition export/import
  document.getElementById('btn-user-def-export').addEventListener('click', () => {
    const exported = exportUserDefs(state);
    if (exported) {
      showNotice(t('userDefExported'), 'success');
    } else {
      showNotice(t('userDefExportEmpty'), 'error');
    }
  });

  document.getElementById('btn-user-def-import-trigger').addEventListener('click', () => {
    document.getElementById('file-user-def-import').click();
  });

  document.getElementById('file-user-def-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { added, skipped } = await commands.importFile(file);
      if (added > 0) {
        const msg = skipped > 0
          ? t('userDefImportedWithSkip', { n: added, s: skipped })
          : t('userDefImported', { n: added });
        showNotice(msg, 'success');
        form.refreshUserDefEndSpringVisibility();
        form.refreshMaterialSelectOptions();
        onModelChange();
        refreshDraftSectionSelectors();
        list.refresh();
      } else if (skipped > 0) {
        showNotice(t('userDefImportAllSkipped', { s: skipped }), 'error');
      } else {
        showNotice(t('userDefImportNone'), 'error');
      }
    } catch (err) {
      showNotice(t('userDefImportFailed') + err.message, 'error', 6500);
    }
    e.target.value = '';
  });

  // In-progress forms intentionally close only through their explicit buttons.
  return {
    show: form.show,
    isOpen: () => form.isOpen() || list.isOpen(),
    applyLanguage() {
      form.applyLanguage();
      list.applyLanguage();
    },
  };
}
