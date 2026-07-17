# 作業計画: 線材要素の連結・任意点分割機能

作成日: 2026-07-17

## 1. 機能概要

| 機能 | 内容 |
|------|------|
| 連結(Join) | 連続する(端点を共有し一直線上にある)梁・柱の複数部材を 1 本の部材に統合する |
| 分割(Split) | 単独の部材を任意点で 2 本に分割する |

### 断面記号の扱い(要件)
- **連結時に断面記号が同じ** → そのまま同じ断面を設定(確認なし)
- **連結時に断面記号が異なる** → ダイアログを表示し、対象部材が持つ断面記号の中からユーザーが選択
- **分割時** → 両方の部材に元と同じ断面記号を設定(確認なし)

## 2. 既存コードの前提(調査結果)

- 部材は `state.members`(`js/state.js:855-901` の `addMember`)。`type`(beam/column/hbrace/vbrace)、`startNodeId`/`endNodeId`、`sectionName`、`levelId`/`topLevelId`、端部条件 `endI`/`endJ`(pin/rigid/spring)を持つ。
- **柱は始点・終点が同一ノード**で、`levelId`(下端)→`topLevelId`(上端)で高さを表現(`js/tools.js:588`)。
- 交差点分割 `splitIntersectingMembers`(`js/model-ops.js:299-389`)が最も近い既存実装。分割で生じる**内部端は `rigid`**、外側端は元の `endI`/`endJ` を維持する規約 → 連結はこの逆操作(外側端の条件を復元し、内部ノードを消す)。
- `removeMember`(`js/state.js:959-983`)は孤立ノードを自動削除する。
- Undo は `history.transact(fn)`(`js/history.js:23-34`、fn が truthy を返した時のみ記録)。一括操作のUIパターンは `app.js:227-257` の `#btn-merge-nodes` / `#btn-split-members` と、複数選択パネル `_renderMultiMemberProperties`(`js/ui.js:536-682`)の `runBatch`。
- モーダルの雛形は `js/combo-modal.js`(`#x-modal` + `.modal-overlay` + `visible` クラス切替、`[data-i18n]` を表示時にローカライズ)。
- i18n は `js/i18n.js` の `dict.ja` / `dict.en` 両方に同一キー・同一プレースホルダで追加必須(`test/i18n-parity.test.js` が強制)。
- 幾何ユーティリティ: `segmentParameter`(射影 t)、`pointToSegmentDist` は `js/geometry-utils.js` にあり。**共線判定は未実装**(方向ベクトルの外積で新設)。
- 許容値は `js/constants.js`(`MEMBER_SPLIT_TOLERANCE_MM = 1` 等)。

## 3. 仕様詳細

### 3.1 連結(joinMembers)

対象: 複数選択された 2 本以上の部材。

**連結可能条件(すべて満たすこと)**
1. `type` がすべて同一(beam 同士、column 同士。hbrace/vbrace は初期スコープ外 → §6)
2. `roofRole` なし、`geometryMode` が `explicit3d` でない
3. **梁**: 同一 `levelId`、端点ノードを共有して一続きのチェーンを成し、全体が一直線上(共線判定: 方向ベクトル外積 < 許容値)
4. **柱**: 同一 (x, y) 位置で、レベルが連続(部材Aの `topLevelId` = 部材Bの `levelId` のように上下に連鎖)
5. 中間ノード(チェーン内部の共有ノード)に、連結対象外の部材・支点・荷重が取り付いていても連結自体は許可するが、中間ノードは削除せず残す(取り付きがない場合のみ孤立ノードとして削除)

**結果**
- チェーン両端のノードを結ぶ 1 本の新部材を `addMember` で生成し、元部材を削除
- `endI`/`endJ` はチェーン両端の部材の外側端条件を引き継ぐ(内部の rigid 端は消滅)
- `sectionName`: 全部材で同一ならそのまま。異なる場合は呼び出し側(UI)から指定された断面記号を使用
- 柱の場合は `levelId` = 最下部材の `levelId`、`topLevelId` = 最上部材の `topLevelId`

**API 形式(2段階)**
```js
// js/model-ops.js
canJoinMembers(state, memberIds)
// → { ok, reason?, sections: [重複除去した断面記号], chain: [...] }
joinMembers(state, memberIds, { sectionName })
// → { joined: 元部材数, memberId: 新部材ID } / null
```
`canJoinMembers` で連結可否と断面記号一覧を先に取得し、UI が「異なる場合のみ」選択ダイアログを出してから `joinMembers` を実行する。

### 3.2 任意点分割(splitMemberAtPoint)

対象: 単一選択された部材 1 本。

**梁(beam)**
- キャンバス上のクリック点を部材線分に射影(`segmentParameter`)し、その位置に分割
- 端点から `MEMBER_SPLIT_TOLERANCE_MM` 以内は無効(`interiorProjection` の内部判定を流用)
- 分割点に既存ノードがあれば再利用(`findNodeAt`)、なければ `addNode`
- 2 本とも元の `sectionName` を引き継ぎ、外側端は元の `endI`/`endJ`、**新しい内部端は `rigid`**(交差点分割と同じ規約)

**柱(column)**
- 「任意点」は高さ方向の位置 → **中間レベルを指定して分割**する方式とする
  (`levelId` と `topLevelId` の間に存在するレベルをダイアログの選択肢として提示)
- 任意高さ(mm 指定)での分割は explicit3d 化が必要なため初期スコープ外(§6)

**API 形式**
```js
// js/model-ops.js
splitMemberAtPoint(state, memberId, { x, y })          // 梁
splitColumnAtLevel(state, memberId, { levelId })       // 柱
// → { createdMemberIds: [id1, id2] } / null
```

### 3.3 UI フロー

**連結**
1. 部材を複数選択(Shift+クリック or 矩形選択)
2. 複数選択プロパティパネル(`_renderMultiMemberProperties`)に「連結」ボタンを追加
3. クリック → `canJoinMembers` で判定
   - 不可 → 理由を `showNotice` で表示(型不一致/非共線/不連続 等)
   - 断面が同一 → 即実行
   - 断面が異なる → **断面選択モーダル**(対象部材の断面記号一覧から 1 つ選択)→ 実行
4. `history.transact` で undo 1 回分にまとめ、完了通知(「{n}本を連結しました」)

**分割**
1. 部材を単一選択 → プロパティパネル(`_renderMemberProperties`)に「分割」ボタンを追加
2. 梁: ボタン押下で「分割点指定モード」に入り、カーソル追従で部材上の分割点プレビュー(`canvas2d.preview` 流用)を表示 → クリックで確定。Esc でキャンセル。スナップ(グリッド/軸)適用後に部材へ射影
3. 柱: ボタン押下で中間レベル選択(中間レベルが 1 つだけなら即実行、複数ならモーダルで選択、0 なら不可通知)
4. `history.transact` で記録、完了通知

## 4. 作業フェーズ

### Phase 1: 幾何・モデル操作(コア)
- [ ] `js/geometry-utils.js`: 共線判定ヘルパー `areCollinear`(外積 + 許容値)追加
- [ ] `js/constants.js`: `MEMBER_JOIN_TOLERANCE_MM` 追加
- [ ] `js/model-ops.js`: `canJoinMembers` / `joinMembers` 実装(梁チェーン + 柱レベル連鎖)
- [ ] `js/model-ops.js`: `splitMemberAtPoint` / `splitColumnAtLevel` 実装(`splitIntersectingMembers` のチェーン再構築ロジックを共通化して流用)
- [ ] `js/state.js:1309-1335` 付近に委譲メソッド追加(`splitIntersectingMembers` と同列)

### Phase 2: 単体テスト
- [ ] `test/model-transform-ops.test.js` に追加:
  - 梁 2 本連結(同一断面) → 部材数 1、中間ノード削除、外側端条件維持
  - 梁 3 本チェーン連結、断面が異なる場合の `canJoinMembers` の `sections` 返却
  - 非共線・型不一致・レベル不一致・不連続の拒否
  - 中間ノードに他部材が取り付く場合のノード温存
  - 柱の上下連結(`levelId`/`topLevelId` の統合)
  - 梁の任意点分割 → 部材数 2、内部端 rigid、断面引き継ぎ、端点近傍の拒否
  - 柱のレベル分割
  - 分割 → 連結で元に戻る(往復不変性)
- [ ] `npm test` 全通過確認(quantity/serialization への回帰がないこと)

### Phase 3: 断面選択モーダル + UI 配線
- [ ] `index.html`: 断面選択モーダル(`#join-section-modal`)と柱レベル選択を兼ねる汎用選択モーダル追加(`combo-modal.js` の構造を踏襲)
- [ ] `js/join-split-modal.js`(新規): 選択肢リスト + OK/キャンセルの小モーダル。`Promise` ベースで選択値を返す
- [ ] `js/ui.js` `_renderMultiMemberProperties`: 「連結」ボタン(`runBatch` は使わず、モーダル経由の非同期フローのため `history.transact` を直接使用)
- [ ] `js/ui.js` `_renderMemberProperties`: 「分割」ボタン
- [ ] `js/tools.js`: 分割点指定モード(`state.currentTool` に `'splitPoint'` 相当の一時モード追加、`_onMouseMove` でプレビュー、`_onMouseDown` で確定、Esc/選択解除でキャンセル)

### Phase 4: i18n・仕上げ
- [ ] `js/i18n.js`: ja/en 両方にキー追加(例: `joinMembers`, `joinMembersDone`, `joinMembersNoneCollinear`, `joinSelectSection`, `splitAtPoint`, `splitAtPointHint`, `splitColumnSelectLevel`, 各種エラー理由)。`test/i18n-parity.test.js` 通過確認
- [ ] `js/help-content.js`: ヘルプに操作説明追記
- [ ] 手動確認(ブラウザ): 連結/分割の一連操作、undo/redo、3D ビュー反映、解析エクスポート(`analysis-export.js`)・数量集計(`quantities.js`)で部材数・総長が期待通りか
- [ ] `npm test` / lint 通過 → コミット → PR 作成

## 5. 影響範囲・注意点

- **端部条件の規約**: 分割の内部端 = `rigid` は既存の交差点分割と統一。連結はその逆で外側端条件を保持する。解析エクスポートの連続性表現がこの規約に依存(`js/analysis-export.js`)
- **孤立ノード**: `removeMember` の孤立ノード自動削除に任せつつ、連結時の中間ノードに支点・荷重・他部材が付く場合は残す
- **数量集計**: 連結・分割で (type, section) ごとの総長は不変、本数は変わる → 既存テストへの影響なし(確認は行う)
- **undo**: モーダルを挟む非同期フローでは、ユーザー確定後に `history.transact` を開始すること(キャンセル時に履歴を汚さない)
- **選択状態**: undo/redo で選択はリセットされる仕様(`resetRuntimeState`)のため、操作直後は新部材を `select('member', id)` しておく

## 6. 初期スコープ外(将来拡張)

- ブレース(hbrace/vbrace)の連結・分割
- `explicit3d` 部材、屋根部材(`roofRole` 付き)の対応
- 柱の任意高さ(mm)分割(explicit3d 化が必要)
- 分割点の数値入力(i端からの距離指定)
