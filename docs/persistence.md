# Autosave and recovery / 自動保存と復元

## Using recovery

The status bar shows autosave readiness, unsaved changes, saving, saved, failure,
and the last successful save time. Autosave runs every 20 seconds while enabled,
and also attempts a save when the page becomes hidden. Saving a CAD file remains
available independently of recovery storage.

Open **Recovery history** to view the five most recent committed generations.
Choose a generation and select **Restore selected generation**. Recovery replaces
the model and its catalogs, including unused custom definitions. **Undo** returns
to the work present before recovery; **Redo** reapplies recovery. Opening or closing
the picker does not change the model or delete recovery data.

If storage fails, existing generations remain available. **Save now / retry**
retries the current model. A failed write never reports the model as saved. Edits
made during a write remain marked as unsaved until a later save succeeds.

If another tab has saved since this tab last read or saved a generation, this tab
stops saving with a conflict message. Review the recovery history and explicitly
restore a generation before resuming saves. To retain this tab's current model,
download a CAD file first, or undo the recovery before saving again.

The old `lineframe-autosave-v1` localStorage record is migrated once. It is removed
only after the committed copy has been read back and verified. Failed migration
leaves the original record intact and reports a storage error. Retry after storage
becomes available. A malformed legacy record requires repair; it is not silently
deleted. An untouched new canvas does not replace a previous session's recovery.

## 復元の使い方

ステータス表示で「未保存の変更あり」「保存中」「保存済み」「自動保存失敗」と
最終保存成功時刻を確認できます。自動保存は有効なとき20秒ごとに実行されます。
ページを非表示にしたときも保存を試みます。

**復元履歴**から最新5世代の保存履歴を確認し、世代を選んで復元します。
復元時は未使用のカスタム定義も含めてモデルとカタログが置き換わります。
**元に戻す**で復元前の作業に戻り、**やり直し**で再び復元できます。
履歴画面を閉じても保存履歴は削除されません。

保存失敗時も以前の正常な世代は保持されます。**今すぐ保存 / 再試行**で再試行します。
別のタブで新しい世代が保存された場合は、復元履歴を確認してから保存を再開してください。
現在の作業を残すには先にCADファイルをダウンロードするか、復元後に「元に戻す」を使います。

## Implementation and verification

- `initAutosave({ state, history, onRestore })` returns `ready` (a boolean promise),
  `saveNow`, `listGenerations`, `restoreGeneration`, `getStatus`, `subscribe`, and `stop`.
  `saveNow()` resolves to the committed generation or `null` on failure/no work;
  failures are also exposed by `getStatus()` and optional `onError`.
- `mountRecoveryUI({ autosave, host })` creates its own DOM and bilingual labels.
  Its `open()` method displays the picker. It observes the document language;
  `applyLanguage()` also refreshes pending status after app edits. `destroy()`
  removes the UI and listeners.
- `onRestore` should synchronize settings controls, level selectors, and rendering.
  It runs after the one-entry undoable model replacement succeeds.
- History uses dedicated internal snapshots, preserving all model/runtime data and
  counters without CAD catalog merging. Successful undo/redo advances revision.
  Derived private fields containing `index` or `cache` are omitted; the synchronous
  `AppState.invalidateDerivedCaches()` hook initializes derived lookups on detached
  candidates before live state replacement. CAD `toJSON/loadJSON` semantics remain
  separate from History's snapshot helpers.
- `node --test test/io-import.test.js test/history.test.js test/autosave.test.js test/autosave-content.test.js`
  runs import, history, and deterministic failure/concurrency regressions.
- Serve the repository over HTTP and open `test/fixtures/persistence-browser.html`
  to run native IndexedDB retention, two-connection conflict, transaction rollback,
  migration deduplication, and bilingual UI/keyboard/recovery regressions. A browser
  runner can wait for `window.persistenceTestResults` and assert that all entries
  have `passed: true`. Test databases use unique names and are deleted afterward.

IndexedDB write ordering and atomic commit follow the
[IndexedDB transaction specification](https://www.w3.org/TR/IndexedDB-3/#transaction-scheduling).
Generation insertion, head comparison/update, and pruning all occur in one
read/write transaction; reads expose only committed records.
