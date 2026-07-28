# 作業計画: 初期モデル生成の階別設定化 — 階数 → 階高リスト+階別材料登録+自動配置チェック

作成日: 2026-07-28

前提: PR #56(グリッドフレーム生成)・PR #57(拡張: `N@L` 記法、柱・梁断面の一括指定、
床生成チェック、入力永続化+プリセット)がマージ済み。
本計画は生成ダイアログを「階数を起点とした階別設定テーブル」へ再構成し、
階ごとの材料(断面)登録と、要素種別ごとの自動配置チェックによる生成を実現する。

## 1. 機能概要

1. **階数入力**: 階数(1〜`MAX_STORY_COUNT`=50)を数値で設定すると、階別設定テーブルの行が
   自動生成される(既存入力は可能な限り保持)
2. **階高リスト**: テーブル各行に階高(mm)入力欄。既定値は前行の値(初回は 3000 など)
3. **階別材料登録**: 各行に「柱断面」「梁断面」「床断面」「外壁断面」のセレクト。
   選択肢は現在モデルの断面カタログから構築。全階一括設定行(最上部)で縦一括変更も可能
4. **自動配置チェック**: 「柱」「梁」「床」「外壁」のチェックボックスで、生成する要素種別を選択
   - 既定: 柱 ON・梁 ON・床 OFF・外壁 OFF(現状の既定挙動を維持)
   - スパン(X/Y)入力は現行のテキストリスト(`N@L` 記法対応)を継続使用

## 2. 現状コードの前提(調査結果)

- **生成ロジック**: `buildGridFrame({ storyHeights, spansX, spansY, columnSection, beamSection, sectionCatalog, springCatalog, generateFloors })`
  (`js/frame-generator.js:60`)。断面は全階共通で `addMember` / `addSurfaceRect` に
  `sectionName` を渡すだけ。階ループは `storyIndex`(柱)・`levelIndex`(梁・床)で既に階単位に
  分かれており、**階別の断面名を配列で持てば差し込みは小さい**
- **レベル構成**: `configureLevels`(`js/frame-generator.js:247`)が GL, 2F, …, RF を生成。
  `levels[i]` が第 i+1 層の下端。階別設定テーブルの行と `storyIndex` は 1:1 対応
- **床面材**: `addSurfaceRect(x1, y1, x2, y2, { type: 'floor', levelId, topLevelId, sectionName })`
  で生成済み(`js/frame-generator.js:185`)。`sectionName` は options 素通しで
  `_ensureSurfaceSection` がフォールバックするため、床断面の階別指定は安全
- **外壁**: `type: 'exteriorWall'` は**ポリライン(閉多角形)面材**。
  `js/tools.js:791`(`exteriorWall → 'polyline'`)、`js/tools.js:982` の
  `addSurfacePolygon(points, { type, levelId, topLevelId, loadDirection: 'twoWay', sectionName })` が先例。
  **各レベルに 1 つ**という規約がある(`js/tools.js:925-931` で既存があれば置換確認)。
  生成では外周矩形の 4 頂点を渡し、階(層)ごとに 1 面材とする。
  壁高さオプション `_getWallHeightOptions`(tools.js)の要否は実装時に既定値挙動を確認
- **断面カタログ**: surface 側の既定断面は `_S`(floor)/`_OW`(exteriorWall)等
  (`js/section-catalog.js:13-18`)。セレクトの列挙は member 同様
  `state.sectionCatalog` から `target==='surface'` を type で絞る。
  buildGridFrame へは既に `sectionCatalog` 引き継ぎ機構があるため床・外壁断面もそのまま乗る
- **要素数ガード**: `MAX_GRID_FRAME_MEMBERS`=20,000 は「柱+梁+床」の合計判定に変更済み
  (`js/frame-generator.js:86-108`)。外壁(層数×1)を合計に追加する
- **ダイアログ**: `js/grid-frame-modal.js`。`fields` 配列(3 テキスト欄)+断面セレクト 2 つ+
  床チェック+プリセット。入力値は `lineframe-grid-frame-input` /
  `lineframe-grid-frame-presets`(localStorage)に**文字列のまま**保存 → **スキーマ変更に伴う
  互換処理が必要**(§5)
- **テスト**: 純ロジック `test/frame-generator.test.js`、UI `test/grid-frame-ui.test.js`
  (`withFakeBrowser` の fake DOM 方式)。i18n は ja/en 同時追加(`test/i18n-parity.test.js` が強制)

## 3. UI 仕様(ダイアログ再構成)

```
┌ 初期モデル生成 ────────────────────────────────┐
│ プリセット: [▼        ] [保存] [削除]                │
│ 階数: [ 3 ]                                        │
│ 生成する要素: [x]柱 [x]梁 [ ]床 [ ]外壁              │
│ ┌───┬──────┬─────┬─────┬─────┬─────┐ │
│ │ 階 │ 階高(mm) │ 柱断面 │ 梁断面 │ 床断面 │ 外壁断面 │ │
│ ├───┼──────┼─────┼─────┼─────┼─────┤ │
│ │一括│ [ 3000 ] │ [▼]   │ [▼]   │ [▼]   │ [▼]    │ │
│ │ 3F │ [ 3000 ] │ [▼]   │ [▼]   │ [▼]   │ [▼]    │ │
│ │ 2F │ [ 3000 ] │ [▼]   │ [▼]   │ [▼]   │ [▼]    │ │
│ │ 1F │ [ 3500 ] │ [▼]   │ [▼]   │ [▼]   │ [▼]    │ │
│ └───┴──────┴─────┴─────┴─────┴─────┘ │
│ X方向スパン(mm): [ 3@6000        ]                  │
│ Y方向スパン(mm): [ 6000, 5000    ]                  │
│ [キャンセル] [生成]                                  │
└──────────────────────────────────────┘
```

- **階数変更時の挙動**: 増 → 最上行の値を複製して行を追加。減 → 上の階から行を削除。
  既入力の下層行は常に保持(誤操作でも入力が消えない)
- **行の並び**: 上階を上に表示(建築の階表現に合わせる)。内部配列は従来どおり
  1F→上階の昇順で保持し、表示時に反転する
- **一括設定行**: 値を変えたらその列の全行へ反映(その後の行別編集は可能)。
  一括行自体は生成値には使わない
- **チェックと列の連動**: 「床」「外壁」チェック OFF のとき対応する断面列をグレーアウト
  (列は消さない — 値は保持)。柱・梁チェックは既定 ON。
  **柱 OFF・梁 OFF の全 OFF は生成不可としてエラー表示**
- **階高バリデーション**: 既存の `MIN_GRID_DIMENSION_MM`〜`MAX_GRID_DIMENSION_MM` を
  行単位で適用し、不正行をハイライト(既存のエラー表示パターンを流用)
- 既存の「階高リスト」テキスト欄は廃止(テーブルに置換)。`parseMmList` はスパン欄で継続使用

## 4. 生成ロジック仕様(`buildGridFrame` 拡張)

### 4.1 入力形式

```js
buildGridFrame({
  stories: [                       // 1F から昇順
    { height: 3500, columnSection, beamSection, floorSection, wallSection },
    ...
  ],
  spansX, spansY,
  generate: { columns: true, beams: true, floors: false, exteriorWalls: false },
  sectionCatalog, springCatalog,
})
```

- **後方互換**: 既存シグネチャ(`storyHeights` + `columnSection`/`beamSection` +
  `generateFloors`)は残し、内部で `stories`/`generate` 形式へ正規化する。
  既存テスト・呼び出し側を壊さない
- バリデーション: `stories` は 1〜`MAX_STORY_COUNT`。height は既存の範囲チェック。
  断面名は文字列以外を無視(フォールバックに任せる方針を継続)

### 4.2 生成処理

- **柱**: 既存ループで `stories[storyIndex].columnSection` を使用。`generate.columns` が
  false ならスキップ(節点・支点も柱に付随して生成しているため、柱 OFF 時は
  節点生成と支点生成の要否を整理 — 梁側 `addBeam` が節点を自前補充するので柱ループ丸ごと
  スキップで成立する見込み。テストで確認)
- **梁**: 既存ループで `stories[levelIndex - 1].beamSection`
- **床**: 既存ループで `stories[levelIndex - 1].floorSection`
- **外壁**: `generate.exteriorWalls` のとき各層に 1 面材:

  ```js
  state.addSurfacePolygon(
    [{x:0,y:0}, {x:xMax,y:0}, {x:xMax,y:yMax}, {x:0,y:yMax}],
    { type: 'exteriorWall', levelId: levels[i].id, topLevelId: levels[i+1].id,
      loadDirection: 'twoWay', sectionName: stories[i].wallSection }
  )
  ```

  頂点順(時計回り/反時計回り)は tools.js の作図結果・`hitExteriorWallEdges` の前提を
  観察して合わせる。新規生成モデルなので「各レベル 1 つ」規約とは矛盾しない
- **要素数ガード**: `elementCount = columns + beams + floors + walls` に拡張。
  `counts` 詳細に `walls` を追加(エラーメッセージの `{count}/{max}` 表示は既存流用)
- **完了通知**: 「柱{c}・梁{b}・床{f}・外壁{w}」— 生成対象のみ表示するか全件 0 表示かは
  既存の床の通知実装に合わせる

## 5. 永続化・プリセットの互換性

- 保存スキーマに `version: 2` を導入。v2 は
  `{ version: 2, storyCount, stories: [...], spansX, spansY, generate: {...} }`
- **v1 読み込み時のマイグレーション**: `storyHeights` 文字列を `parseMmList` で展開し、
  全行に旧 `columnSection`/`beamSection` を複製、`generateFloors` → `generate.floors`。
  パース不能なら既定値(破損 JSON 無視の既存パターン踏襲)
- プリセット(`lineframe-grid-frame-presets`)も同じマイグレーションを通す。
  保存時は常に v2 で書き出す
- 保存対象は入力文字列/選択値そのまま(パース前)とし、呼出時に通常バリデーションを通す方針を継続

## 6. 作業フェーズ

### Phase 1: 生成ロジック(`frame-generator.js`)
- [x] `stories`/`generate` 形式の受け入れ+旧シグネチャの正規化(後方互換テスト含む)
- [x] 階別断面の適用(柱・梁・床)+テスト(階ごとに異なる断面が載ること、未知名フォールバック)
- [x] 柱/梁の生成 ON/OFF+テスト(柱 OFF 時の節点・支点の扱い、全 OFF エラー)
- [x] 外壁生成+テスト(層数分の exteriorWall、levelId/topLevelId、断面名、validateModel 0 件)
- [x] 要素数ガードへの外壁算入+`counts.walls`+テスト

### Phase 2: ダイアログ UI(`grid-frame-modal.js`, `index.html`, `style.css`)
- [x] 階数入力+階別テーブルの動的行生成(増減時の値保持、上階が上の表示順)
- [x] 断面セレクト 4 種(柱/梁/床/外壁)の行別構築+一括設定行
- [x] 自動配置チェック 4 種+列グレーアウト連動+全 OFF エラー表示
- [x] 行単位バリデーション表示+`grid-frame-ui.test.js` に挙動テスト
- [x] i18n(ja/en)追加

### Phase 3: 永続化マイグレーション
- [x] v2 スキーマでの保存/復元+v1 → v2 マイグレーション+破損データ耐性テスト
- [x] プリセットの v1 互換読み込みテスト

### Phase 4: 仕上げ
- [x] `js/help-content.js` 更新(階別テーブル・材料登録・チェックの説明)
- [x] 手動確認(ブラウザ): 3 階建てで階別断面を変えて生成 → 2D/3D 表示・数量集計・
      外壁の表示オフセット・undo/redo・プリセット v1 復元
- [x] `npm test` / `npm run lint:all` / `npm run version:check` 通過 → コミット → PR 作成

## 7. 影響範囲・注意点

- 生成フロー(`history.save()` → `loadJSON` → UI 再同期)は不変。undo/redo・autosave にそのまま乗る
- 既定値は現状挙動を維持(柱・梁 ON、床・外壁 OFF、断面は既定断面)
- 外壁は「各レベル 1 つ」規約(tools.js の置換確認)と衝突しないが、生成後に手動で
  外壁を描き直すフローが自然に機能することを手動確認に含める
- ダイアログの縦寸法が増える。50 階入力時にテーブルがスクロール可能であること
  (`max-height` + `overflow-y`)を確認
- i18n は ja/en 同時追加を厳守(`test/i18n-parity.test.js`)
- `MAX_STORY_COUNT`=50 の階数入力は number input の min/max とバリデーション両方で拘束

## 8. その他: 初期自動生成に追加した方が良い機能(候補)

前計画(`docs/plan-grid-frame-enhancements.md` §3.5・§3.6・§6)の未実装分+新規案。

| # | 機能 | 概要 | 効果 | コスト | 優先度 |
|---|------|------|------|--------|--------|
| A | 基礎・地中梁の生成 | GL レベルに基礎梁(+基礎柱型)をチェックで生成 | 1F 床・基礎入力の下地。支点は生成済みなので相性が良い | 中 | ★★★ |
| B | 小梁(二次梁)の自動配置 | 各床区画を分割数 or ピッチ指定で小梁分割 | 床組の実務入力を大幅短縮 | 中 | ★★★ |
| C | 外周ブレース自動生成 | 外周構面の指定スパンに vbrace(シングル/襷掛け) | ブレース構造の初期モデルが一発(前計画 #5 未実装分) | 中 | ★★☆ |
| D | 屋根生成との統合 | 最上層に陸屋根(roof 面材)or 勾配屋根(roof-generation.js 連携)を選択生成 | 外皮まで揃った初期モデルになる | 大 | ★★☆ |
| E | 通り芯命名オプション | Y 方向 `A, B, C…` 命名(27 本以上は `AA…`)(前計画 #6 未実装分) | 実務の通り芯表記に一致 | 小 | ★★☆ |
| F | 生成プレビュー | 生成前に要素数(柱/梁/床/外壁)と簡易平面図をダイアログ内に表示 | 上限超過や入力ミスを生成前に気付ける | 中 | ★★☆ |
| G | 基準階コピー | テーブルの任意行を「上へ複製」するボタン | 中高層の同一基準階入力が一瞬 | 小 | ★★☆ |
| H | 床荷重の自動設定 | 床生成時に用途別の面荷重プリセットを適用 | 荷重入力の初期値が揃う | 中 | ★☆☆ |
| I | セットバック対応 | 階ごとに平面範囲(スパン部分集合)を指定 | 上階が細る建物形状に対応 | 大 | ★☆☆ |
| J | 内壁・間仕切の配置 | 指定通り沿いに wall 面材を生成 | 壁量の初期検討 | 中 | ★☆☆ |
| K | 既存モデルへのマージ生成 | 置換ではなく追加、基準点指定 | 増築・別棟(前計画 #7、設計が別物) | 大 | 今回外 |

**次期スコープの推奨**: A・B(構造モデルとしての完成度が上がり、本計画の階別テーブルに
「基礎梁断面」「小梁断面」列を足すだけで UI が再利用できる)。E・G は小コストなので
本計画実装中に余力があれば同梱してもよい。
