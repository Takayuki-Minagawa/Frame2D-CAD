# 作業計画: 初期モデル生成の基礎・地中梁生成

作成日: 2026-07-28

前提: PR #56(グリッドフレーム生成)・PR #57(拡張)・PR #58(階別設定化)がマージ済み。
本計画は `docs/plan-grid-frame-story-settings.md` §8 の候補 **A(基礎・地中梁の生成)** を実装する。

## 1. 機能概要

初期モデル生成ダイアログに「基礎」を追加し、GL より下の基礎レベルに
**地中梁**と**基礎柱型**を生成する。あわせて支点を基礎レベルへ移す。

- **基礎チェック**: 「生成する要素」グループに `基礎` を追加(既定 OFF)
- **根入れ深さ(mm)**: GL からの深さ。基礎レベル `FDN` の高さは `z = -根入れ深さ`
- **地中梁断面 / 基礎柱断面**: 現在のモデルの断面カタログから選択(それぞれ member/beam・member/column)
- 生成内容(基礎 ON 時):
  - レベル `FDN` を `z = -根入れ深さ` に追加
  - `FDN` に**地中梁**(各階の梁と同じ格子パターン)
  - 各格子点に**基礎柱型**(`FDN` → `GL` の柱)
  - 支点を `GL` ではなく `FDN` に配置

## 2. 設計判断

### 2.1 根入れ深さは必須(> 0)

「地中梁」は定義上 GL より下にある部材であり、深さ 0 は地中梁ではない。
また深さ 0 では基礎柱型が長さ 0 になり成立しない。よって基礎 ON 時は
`MIN_GRID_DIMENSION_MM` 〜 `MAX_GRID_DIMENSION_MM` の範囲を必須とする(既定 1500)。
これにより「深さ 0 の特例分岐」が不要になり、生成結果の分類も一意になる。

### 2.2 基礎柱型は基礎 ON なら常に生成

支点を `FDN` に置くと、`GL` から始まる 1F 柱は基礎柱型が無ければ支持されない
(浮いたモデルになる)。構造的連続性のため基礎柱型は基礎 ON で常に生成し、
独立したチェックボックスは設けない。

### 2.3 支点の扱い

現状の支点生成は「柱 ON のとき `GL` の各格子点」。基礎 ON では支持点が
`FDN` に下がるため、次のとおりに変更する。

| 柱 | 基礎 | 支点 |
|----|------|------|
| ON | OFF | `GL`(現状どおり) |
| ON | ON | `FDN` |
| OFF | ON | `FDN`(基礎柱型の脚元として必要) |
| OFF | OFF | なし(現状どおり) |

つまり「柱 OR 基礎」が生成されるとき、最下レベルの各格子点に支点を置く。
既存の挙動は基礎 OFF のとき完全に保たれる。

### 2.4 「柱・梁の少なくとも一方」ガードは据え置き

基礎は上部フレームへのアドオンであり、単体生成は想定しない。
`no-members` ガード(柱 OR 梁)は現状のまま維持する。

### 2.5 レベル名

既存のレベル名は `GL` / `2F` … / `RF` の英字表記。基礎レベルは **`FDN`** とする
(`FL` は floor level と紛らわしいため採用しない)。
`state.levels` 配列の末尾に追加する — 読み込み時の `activeLevelId` は
`levels[0]`(= `GL`)を採るため、開いた直後に基礎レベルが選択される違和感を避けられる。
表示側はどこも `z` でソートするため、配列順は表示に影響しない。

負の `z` を持つレベルはアプリ全体で問題なく扱える(調査結果):
`addLevel` / `updateLevel` に非負制約は無く、標高を使う箇所
(`js/elevation-modal.js` の `z - minZ` スケーリング、`js/quantities.js` の
`top - bottom`、`js/analysis-export.js`、`js/viewer3d.js`)はすべて相対値計算。

## 3. UI 仕様

```
生成する要素: [x]柱 [x]梁 [ ]床 [ ]外壁 [ ]基礎
┌ 基礎 ────────────────────────────────────┐
│ 根入れ深さ(mm) [ 1500 ]  基礎柱断面 [▼]  地中梁断面 [▼] │
└──────────────────────────────────────────┘
```

- 基礎チェックが OFF のとき、根入れ深さ・2 つの断面セレクトは `disabled`
- 階別設定テーブルには列を追加しない(基礎レベルは 1 つで階別ではないため)

## 4. `buildGridFrame` API

```js
buildGridFrame({
  stories, spansX, spansY, sectionCatalog, springCatalog,
  generate: { columns, beams, floors, exteriorWalls, foundation },
  foundation: { depth, beamSection, columnSection },
})
```

- `generate.foundation !== true` のときは `foundation` を一切参照しない(後方互換)
- `generate.foundation === true` かつ `foundation.depth` が範囲外/非数のときは
  `reason: 'range'|'invalid'`, `code: 'foundation-depth'` の検証エラー
- 要素数ガードに算入:
  - 地中梁 = `xSpans.length * yGridCount + ySpans.length * xGridCount`
  - 基礎柱型 = `xGridCount * yGridCount`
  - `counts` に `foundationBeams` / `foundationColumns` を追加

## 5. 永続化(v3)

`lineframe-grid-frame-input` / `-presets` のスキーマを v3 に上げる。

```json
{
  "version": 3,
  "stories": [...], "spansX": "...", "spansY": "...",
  "generate": { "columns": true, "beams": true, "floors": false,
                "exteriorWalls": false, "foundation": false },
  "foundation": { "depth": "1500", "beamSection": "", "columnSection": "" }
}
```

v1(フラット)・v2(`stories` あり `foundation` 無し)からの読み込みでは
`generate.foundation = false` / `foundation` を既定値で補完する。
`normalizeStoredInput` が唯一の入口なので、そこに正規化を集約する。

## 6. i18n(ja / en 同時追加)

| キー | ja | en |
|------|----|----|
| `gridFrameGenerateFoundation` | 基礎 | Foundation |
| `gridFrameFoundation` | 基礎設定 | Foundation settings |
| `gridFrameFoundationDepth` | 根入れ深さ | Embedment depth |
| `gridFrameFoundationBeamSection` | 地中梁断面 | Foundation beam section |
| `gridFrameFoundationColumnSection` | 基礎柱断面 | Foundation column section |
| `gridFrameFoundationDepthInvalid` | 根入れ深さが不正です… | Embedment depth is invalid… |

`gridFrameDone` に `{foundationColumns}` / `{foundationBeams}` を追加する
(基礎 OFF のときは 0 と表示。床・外壁と同じ扱い)。

## 7. テスト

- `test/frame-generator.test.js`
  - 基礎 ON で `FDN` レベルが `z = -depth` に 1 つだけ追加される
  - 地中梁の本数・レベル・断面、基礎柱型の本数・`levelId`/`topLevelId`・断面
  - 支点が `FDN` に移る / 柱 OFF + 基礎 ON でも支点が付く
  - 基礎 OFF で従来どおり(レベル数・支点レベル・部材数が不変)
  - 根入れ深さの検証エラー(未指定・0・範囲外)
  - 要素数上限に地中梁・基礎柱型が算入される
- `test/grid-frame-ui.test.js`
  - 基礎チェックで根入れ深さ・断面セレクトの `disabled` が切り替わる
  - 既定値(OFF / 1500)と入力の保持・プリセット往復
  - v2 保存値の読み込みで基礎が既定に補完される
- `test/i18n-parity.test.js` / `test/help-content.test.js`: 新キー・新文言の存在

## 8. 実装フェーズ

1. 計画書(本ファイル)
2. `js/frame-generator.js`: 基礎生成 + 検証 + 要素数ガード
3. `index.html` / `style.css` / `js/grid-frame-modal.js`: UI と永続化 v3
4. i18n・ヘルプ・テスト・lint・ブラウザ確認・PR
