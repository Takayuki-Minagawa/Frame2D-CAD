# 作業計画: 初期モデル生成(柱・梁グリッドフレーム構築)機能

作成日: 2026-07-19

## 1. 機能概要

階高リスト(mm)、X方向スパンリスト(mm)、Y方向スパンリスト(mm)の 3 つを入力として、
柱・梁の格子フレーム(レベル・通り芯・節点・柱・梁・支点)を一括生成し、**初期モデルとして現在のモデルを置き換える**機能。

入力例:

| 入力 | 例 | 意味 |
|------|----|------|
| 階高リスト | `3500, 3000, 3000` | 3 層(1F 階高 3500、2F 階高 3000、3F 階高 3000) |
| Xスパンリスト | `6000, 6000, 5000` | X 方向 3 スパン → X 通り 4 本 |
| Yスパンリスト | `6000, 6000` | Y 方向 2 スパン → Y 通り 3 本 |

生成内容(階高数 s、Xスパン数 sx、Yスパン数 sy とする):

- **レベル**: s+1 個。GL(z=0)+ 各階高の累積和で上階を作成。命名は `GL, 2F, 3F, …` 最上階は `RF`(s=1 なら GL + RF)
- **通り芯**: X 方向 sx+1 本(`X1…`)、Y 方向 sy+1 本(`Y1…`)。スパンの累積和を座標とする
- **柱**: 全通り交点 × 各層 = (sx+1)(sy+1)×s 本(`levelId`=下階、`topLevelId`=上階)
- **梁**: GL を除く各レベルに X 方向 sx×(sy+1) 本 + Y 方向 sy×(sx+1) 本
- **支点**: GL の全通り交点に固定支点(dx, dy, dz)= (sx+1)(sy+1) 個

断面・材料は `addMember` のデフォルトに任せる(生成後にユーザーが編集する前提)。床・荷重・ブレースは生成しない(§6)。

## 2. 既存コードの前提(調査結果)

- **最も近い既存実装は `buildTwoStoryFrame`**(`js/samples.js:102-174`)。固定値版のグリッドフレーム生成そのもの。通り芯 → 柱+支点 → `findNodeAt` で節点を共有しつつ梁、という生成手順をパラメータ化すればよい
- レベルは `{id, name, z}` の**絶対標高(mm)**で保持(`js/state.js:1616-1620` の `createDefaultLevels`、`addLevel(name, z)` は `js/state.js:1267`)→ 階高リストは累積和に変換して渡す
- 通り芯は `{id, dir:'x'|'y', name, coord}` の**絶対座標**で保持(`addAxis(dir, name, coord)` `js/state.js:1360`)→ スパンリストも累積和に変換
- 柱は `startNodeId === endNodeId` の同一節点 + `levelId`/`topLevelId` で表現(`js/samples.js:118`)
- 支点は `addSupport(x, y, { levelId, dx, dy, dz })`(`js/state.js:1539`)
- **モデル置換フロー**は `loadSample`(`js/app.js:522-536`)が雛形: `history.save()` → `state.loadJSON(生成JSON)` → `syncSettingsControls()` → `ui.refreshLevelSelectors()` → `update()` → 通知。失敗時は `history.undo()` で巻き戻し。undo 1 回で元モデルに戻る
- サンプルビルダーは `new AppState()` に組み立てて `state.toJSON()` を返す純関数(`js/samples.js:9-12` の `buildSampleModel`)→ 生成ロジックは同形式にすると `loadSample` フローとテストをそのまま流用できる
- モーダルの雛形は `js/axes-modal.js`(HTML は `index.html` に静的配置、`initXxxModal({state, onModelChange})` が `{show, hide}` を返し、`.visible` クラス切替 + 表示時に `[data-i18n]` をローカライズ)。`app.js:481` 付近で配線
- サンプル読込ボタンは設定モーダル内(`index.html:373-374` の `#btn-sample-gable` / `#btn-sample-frame`)
- i18n は `js/i18n.js` の `dict.ja` / `dict.en` 両方に同一キーで追加必須(`test/i18n-parity.test.js` が強制)
- テストは `node --test`。生成ロジックの検証は `test/samples.test.js` が雛形(生成 → 要素数 assert → `validateModel()` で error 0 件)

## 3. 仕様詳細

### 3.1 生成ロジック(buildGridFrame)

```js
// js/frame-generator.js(新規)
parseMmList(text)
// → { ok: true, values: [3500, 3000, ...] } | { ok: false, reason: 'empty'|'invalid'|'range'|'count' }
buildGridFrame({ storyHeights, spansX, spansY })
// → 生成モデルの JSON(samples.js と同じく new AppState() に組み立てて toJSON() を返す)
```

**入力パース・バリデーション(parseMmList)**
- 区切りはカンマ・空白・読点(`,`, `、`, 空白)を許容。空要素は無視
- 各値は正の有限数であること。範囲チェック: 1〜100,000 mm
- 個数上限: 階高 ≤ 50、スパン各方向 ≤ 100(暴走生成の防止。超過時はエラー理由 `count`)
- 小数は許容(mm 単位のまま保持)

**生成手順(buildTwoStoryFrame のパラメータ化)**
1. `new AppState()` を作成し、デフォルトレベル(GL/2F)を階高リストに合わせて再構成
   (GL の z=0 は維持、2F の z を storyHeights[0] に更新、3 層目以降は `addLevel`。最上階の name は `RF`)
2. スパン累積和から `addAxis('x', 'X{i+1}', coord)` / `addAxis('y', …)` で通り芯生成
3. 全通り交点で層ごとに `addNode` + `addMember(node.id, node.id, {type:'column', levelId, topLevelId})`、GL に `addSupport(x, y, {levelId: gl.id, dx: true, dy: true, dz: true})`
4. GL 以外の各レベルで、隣接 X 通り間・隣接 Y 通り間に梁を生成(`findNodeAt(x, y, 1)` で柱節点を再利用、なければ `addNode`)
5. `state.meta.name` に生成モデル名(例: `grid_frame`)を設定し `toJSON()` を返す

### 3.2 UI フロー

1. 設定モーダルのサンプル読込ボタン群の並びに「初期モデル生成…」ボタン(`#btn-grid-frame`)を追加
2. クリックで生成モーダル `#grid-frame-modal` を表示。入力欄 3 つ(階高 / Xスパン / Yスパン、テキスト入力 + 単位 mm 表記)+ プレースホルダに入力例。前回入力値はモーダルを閉じても保持(モジュール内変数でよい。永続化はしない)
3. 「生成」ボタン押下:
   - パース失敗 → 該当欄のエラーを `showNotice` で表示(理由別メッセージ)、モーダルは閉じない
   - **現在のモデルに節点または部材が存在する場合**は `confirm` で置換確認(サンプル読込には無い挙動だが、ユーザー作成中モデルの破壊防止のため入れる。undo で戻れる旨もメッセージに含める)
4. `loadSample` と同じ手順で反映: `history.save()` → `state.loadJSON(buildGridFrame(...))` → `syncSettingsControls()` → `ui.refreshLevelSelectors()` → モーダル・設定モーダルを閉じる → `update()` → 完了通知(「格子フレームを生成しました(柱{c}本・梁{b}本)」)。失敗時は `history.undo()` + エラー通知

### 3.3 モジュール構成

| ファイル | 内容 |
|----------|------|
| `js/frame-generator.js`(新規) | `parseMmList` / `buildGridFrame`。DOM 非依存の純ロジック |
| `js/grid-frame-modal.js`(新規) | `initGridFrameModal({state, history, onModelChange, syncSettingsControls, refreshLevelSelectors})`。axes-modal.js の構造を踏襲 |
| `index.html` | `#grid-frame-modal`(modal-overlay 構造)+ 設定モーダル内 `#btn-grid-frame` |
| `js/app.js` | `initGridFrameModal` の配線(`app.js:481` 付近、サンプルボタン配線 `app.js:538` の近くに集約) |

## 4. 作業フェーズ

### Phase 1: 生成ロジック(コア)
- [x] `js/frame-generator.js` 新規作成: `parseMmList` / `buildGridFrame`(`buildTwoStoryFrame` の手順をパラメータ化)
- [x] レベル命名規則(GL/2F/…/RF)と、デフォルトレベル(GL/2F)の z 更新処理の実装

### Phase 2: 単体テスト
- [x] `test/frame-generator.test.js` 新規作成(`test/samples.test.js` を雛形に):
  - 3層 × 3×2 スパンで、レベル数 s+1・通り芯数・柱 (sx+1)(sy+1)s 本・梁数・支点数が式どおり
  - 最小ケース(1層 × 1×1 スパン)の生成
  - 柱節点の共有(梁が柱節点を再利用し、重複節点が増えないこと)
  - `validateModel()` で severity==='error' が 0 件
  - `parseMmList`: 区切り(カンマ/読点/空白)、負値・0・非数・範囲外・個数超過の拒否
  - 生成 JSON を `loadJSON` → `toJSON` して往復可能なこと
- [x] `npm test` 全通過確認

### Phase 3: モーダル UI + 配線
- [x] `index.html`: `#grid-frame-modal` 追加(axes-modal の modal-overlay 構造を踏襲、入力 3 欄 + 生成/キャンセルボタン、`data-i18n` 付与)
- [x] `index.html`: 設定モーダルのサンプルボタン並びに `#btn-grid-frame` 追加
- [x] `js/grid-frame-modal.js` 新規作成: 表示/非表示、入力保持、パース → 置換確認 → `loadSample` 同等の反映フロー
- [x] `js/app.js`: 配線(依存: `history`, `syncSettingsControls`, `ui.refreshLevelSelectors`, `update`, `hideSettingsModal`)

### Phase 4: i18n・仕上げ
- [x] `js/i18n.js`: ja/en 両方にキー追加(例: `gridFrameTitle`, `gridFrameOpen`, `gridFrameStoryHeights`, `gridFrameSpansX`, `gridFrameSpansY`, `gridFrameGenerate`, `gridFrameReplaceConfirm`, `gridFrameDone`, `gridFrameInvalidInput`, `gridFrameTooMany` 等)。`test/i18n-parity.test.js` 通過確認
- [x] `js/help-content.js`: ヘルプに操作説明追記
- [x] 手動確認(ブラウザ): 生成 → 2D/3D 表示・レベルセレクタ・通り芯表示の反映、undo で元モデル復帰、redo、生成後の autosave、解析エクスポート・数量集計が期待どおり
- [x] `npm test` / lint 通過 → コミット → PR 作成

## 5. 影響範囲・注意点

- **モデル置換方式**: `loadSample` と同じ `history.save()` + `loadJSON` 方式のため、既存の undo/redo・autosave・シリアライズにそのまま乗る。生成ロジック側で state を直接触らない(新規 AppState に組み立てる)ことで既存モデルへの副作用を根本的に排除
- **置換確認**: 空でないモデルを上書きするため confirm を挟む(autosave 復元 `app.js:501` と同じ `confirm` パターン)
- **レベル再構成**: デフォルトの GL/2F を消して作り直すのではなく、GL は維持・2F は z 更新とする(レベル ID の欠番や `activeLevelId='L0'` の破綻を避ける)。ただし新規 AppState 上での操作なので厳密には自由度あり — 実装時に `createDefaultLevels` との整合を確認
- **節点共有**: 梁生成時の `findNodeAt(x, y, 1)` は同一レベル判定を持たない(節点は z を持つが柱・梁は levelId で層を表現)。`buildTwoStoryFrame` と同じ規約に従うこと(サンプルが成立している規約をそのまま踏襲)
- **生成量の上限**: 個数上限(§3.1)により最大でも柱 50×101×101 とはならないよう、**合計部材数にも上限**(例: 20,000)を設け超過時はエラーにする — 描画・シリアライズ性能の防衛
- **i18n パリティ**: ja/en 同時追加を厳守(テストで強制)

## 6. 初期スコープ外(将来拡張)

- 床(サーフェス)・荷重・ブレースの自動生成
- 断面記号の一括指定(生成ダイアログでの柱・梁断面選択)
- 既存モデルへの**追加**生成(置換ではなくマージ)、基準点(原点以外)の指定
- 通り芯名のカスタム命名(A, B, C… など)
- スパンの繰り返し記法(例: `3@6000`)
