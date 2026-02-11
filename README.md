# Element Modeler (Ver.100)

ブラウザ上で動作する **2D CAD + 3D Viewer** Webアプリケーションです。
建築の柱・梁・ブレースなどの線材に加えて、床・壁の面材を2D平面上で配置・編集し、同じデータを3Dで可視化できます。

**GitHub Pages** でそのまま動作します（バックエンド不要）。

## Demo

GitHub Pages URL: _(デプロイ後にURLを記載)_

## Features

### 2D CAD
- 線材（梁 / 柱 / 水平ブレース / 鉛直ブレース）の作成・選択・移動・削除
- 面材（床 / 外壁 / 壁）の作成・選択・削除（矩形2点指定 / ポリライン閉合）
- 外壁ラインをポリラインで入力し、閉合してポリゴン化（レイヤー管理）
- 荷重（面荷重 / 線荷重 / 点荷重）の作成・選択・編集・削除
- ノード（端点）のドラッグによる形状変更
- パン（右ドラッグ / 中ボタン / Space+ドラッグ）・ズーム（マウスホイール）
- グリッド表示 + スナップ（グリッド / 既存ノード吸着）
- 原点と軸方向を左下に常時表示（配置の基準）
- レイヤー（Zレベル）管理: 名前・高さの編集、追加・削除（z値ソート表示、重複禁止、使用中レイヤー削除不可）
- ツール選択コンボボックスで要素 / 線材 / 面材 / 荷重を切替
- プロパティパネルで線材/面材/荷重属性を編集
- 線材: 断面、端部条件 I/J（ピン / 剛 / バネ）、バネ記号を編集
- 面材: 断面、床のみ荷重方向を編集
- 荷重: 座標、荷重値、色などを編集
- 種別・レイヤー・断面寸法・断面色は表示専用（断面定義から自動反映）
- 床スラブの荷重方向（X / Y / 2方向）を矢印表示
- 壁要素は梁線と重なりにくいよう平面上でオフセット表示
- 断面変更時に色が更新され、平面図と3D表示の両方へ連動
- Undo / Redo

### 3D Viewer
- 線材を断面寸法（b x h）を反映した直方体として3D表示
- 面材（床スラブを水平面、壁を鉛直面）として3D表示
- 荷重（面荷重=赤スラブ、線荷重=オレンジ線、点荷重=紫球体）を3D表示
- OrbitControls によるカメラ操作（回転 / パン / ズーム）
- グリッド床・座標軸・ライティング

### Data I/O

- JSON Export（ファイルダウンロード）
- JSON Import（ファイル読み込みで状態復元）
- 部材IDはアプリ内部管理のみ（JSONには出力しない）
- schemaVersion による互換性管理

### UI

- 設定モーダル（⚙ ボタン）: テーマ切替（ダーク/ライト）、言語切替（日本語/英語）、ユーザー定義、ヘルプ
- レイヤー管理モーダル（⚙ ボタン）: レイヤーの追加・名前/高さ編集・削除
- 簡易マニュアル（設定 → ヘルプボタンでモーダル表示、多言語対応）
- 設定はブラウザ（localStorage）に保存

### 断面・バネ定義

- 断面とバネは「設定 → ユーザー定義」で管理
- 既定値（削除不可）
  - 線材: 梁 `_G` (b=200, h=400), 柱 `_C` (b=105, h=105), 水平ブレース `_H` (b=20, h=20), 鉛直ブレース `_V` (b=20, h=20)
  - 面材: 床 `_S`, 外壁 `_OW`, 壁 `_IW`
  - バネ: `_SP`（回転バネ）
- ユーザー定義名の先頭に `_` は使用不可
- 既定名と同名のユーザー定義は作成不可
- 同グループ一覧で既定値・ユーザー定義を確認可能
- ユーザー定義は登録後に「名前以外（寸法・色・メモ）」を更新可能

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Element tool - 要素（選択・編集・削除） |
| `M` | Line tool - 線材 |
| `F` | Surface tool - 面材 |
| `L` | Load tool - 荷重 |
| `Enter` (Surface Polyline) | Close polyline to polygon |
| `Esc` | Cancel / Deselect / Close modal |
| `Delete` | Delete selected element |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Right Drag` / `Middle Drag` / `Space + Drag` | Pan |
| `Shift` (Line tool) | Angle constraint (0/45/90) |

## Tech Stack

- **Vanilla JavaScript** (ES Modules) -- ビルドツール不要
- **Canvas 2D API** -- 2D CAD 描画
- **three.js v0.170.0** (CDN / ESM) -- 3D Viewer
- 単位系: **mm**

## Project Structure

```
Frame2D-CAD/
├── index.html          # Entry point / Layout / importmap
├── style.css           # Dark/Light themes / CSS Grid layout / Modal
├── favicon.svg         # Favicon
├── package.json        # Dev dependencies (lint tools)
├── LICENSE             # MIT License
├── THIRD_PARTY_LICENSES.md  # Third-party license details
├── js/
│   ├── app.js          # App init / Module wiring / Theme / Lang / Help
│   ├── state.js        # Data model (nodes, members, surfaces, loads, layers) / CRUD / JSON serialization
│   ├── history.js      # Undo/Redo (snapshot, max 50)
│   ├── grid.js         # Grid drawing / Snap calculation
│   ├── canvas2d.js     # 2D canvas (pan/zoom camera, rendering)
│   ├── tools.js        # Select / Member / Surface / Load tools / Keyboard shortcuts
│   ├── viewer3d.js     # 3D scene (three.js, BoxGeometry, OrbitControls)
│   ├── ui.js           # Toolbar / Property panel / Status bar / i18n apply
│   ├── io.js           # JSON export/import
│   └── i18n.js         # i18n dictionary (ja/en) / t() helper
└── README.md
```

### Architecture

```
app.js ─┬─ state.js      Data model (AppState)
        ├─ history.js    Undo/Redo snapshots
        ├─ canvas2d.js ── grid.js    2D rendering
        ├─ tools.js ──── grid.js     Input handling
        ├─ viewer3d.js               3D rendering (three.js)
        ├─ ui.js ──────── i18n.js    UI controls + i18n
        ├─ io.js                     File I/O
        └─ i18n.js                   Language dictionary
```

- **state.js** がノード・線材・面材・荷重・レベルなど全データを保持する中心モジュール
- **canvas2d.js** は Canvas 2D API による描画のみを担当し、入力処理は **tools.js** に委譲
- **viewer3d.js** は2Dデータを mm→m 変換して three.js シーンに描画
- **i18n.js** が全UIテキストの日本語/英語辞書を管理し、`t(key)` で取得
- 各モジュールは ES Modules の import/export で疎結合に接続
- テーマ・言語設定は `localStorage` に永続化

## Data Format (JSON)

```json
{
  "schemaVersion": 3,
  "meta": {
    "name": "sample",
    "unit": "mm",
    "createdAt": "2026-02-11T00:00:00Z"
  },
  "settings": {
    "gridSize": 1000,
    "snap": true,
    "wallDisplayOffset": 120
  },
  "levels": [
    { "id": "L0", "name": "GL", "z": 0 },
    { "id": "L1", "name": "2F", "z": 2800 }
  ],
  "nodes": [
    { "id": "N1", "x": 0, "y": 0, "z": 0 },
    { "id": "N2", "x": 5000, "y": 0, "z": 0 }
  ],
  "sectionCatalog": [
    { "target": "member", "type": "beam", "name": "_G", "material": "steel", "b": 200, "h": 400, "color": "#666666", "isDefault": true },
    { "target": "surface", "type": "floor", "name": "_S", "material": "", "b": null, "h": null, "color": "#67a9cf", "isDefault": true }
  ],
  "springCatalog": [
    { "symbol": "_SP", "memo": "回転バネ", "isDefault": true }
  ],
  "members": [
    {
      "type": "beam",
      "startNodeId": "N1",
      "endNodeId": "N2",
      "sectionName": "_G",
      "levelId": "L0",
      "color": "#666666",
      "topLevelId": null,
      "bracePattern": "single",
      "endI": { "condition": "rigid", "springSymbol": null },
      "endJ": { "condition": "rigid", "springSymbol": null }
    }
  ],
  "surfaces": [
    {
      "type": "floor",
      "sectionName": "_S",
      "shape": "rect",
      "levelId": "L1",
      "topLevelId": "L1",
      "loadDirection": "twoWay",
      "color": "#67a9cf",
      "x1": 0,
      "y1": 0,
      "x2": 5000,
      "y2": 4000,
      "points": null
    },
    {
      "type": "exteriorWall",
      "sectionName": "_OW",
      "shape": "polygon",
      "levelId": "L0",
      "topLevelId": "L1",
      "loadDirection": "twoWay",
      "color": "#b57a6b",
      "x1": 0,
      "y1": 0,
      "x2": 6000,
      "y2": 5000,
      "points": [
        { "x": 0, "y": 0 },
        { "x": 6000, "y": 0 },
        { "x": 6000, "y": 5000 },
        { "x": 0, "y": 5000 }
      ]
    }
  ],
  "loads": [
    {
      "type": "areaLoad",
      "levelId": "L1",
      "x1": 0, "y1": 0, "x2": 5000, "y2": 4000,
      "value": 3000,
      "color": "#e57373"
    },
    {
      "type": "lineLoad",
      "levelId": "L0",
      "x1": 0, "y1": 0, "x2": 5000, "y2": 0,
      "value": 1500,
      "color": "#ffb74d"
    },
    {
      "type": "pointLoad",
      "levelId": "L0",
      "x1": 2500, "y1": 2000,
      "fx": 0, "fy": 0, "fz": -10000,
      "mx": 0, "my": 0, "mz": 0,
      "color": "#ba68c8"
    }
  ]
}
```

- `nodes` / `levels` の `id` はJSONに保存されます
- `members` / `surfaces` / `loads` の `id` は内部管理のみで、Export時には出力されません（Import時に再採番）

## Getting Started

```bash
# Clone
git clone https://github.com/<your-username>/Frame2D-CAD.git
cd Frame2D-CAD

# Start local server (ES Modules require HTTP)
python3 -m http.server 8080

# Open in browser
# http://localhost:8080
```

## Testing

```bash
# Unit/Smoke tests (node:test)
npm test

# Lint (JS/HTML/CSS)
npm run lint:all
```

主なテスト対象:
- 断面/バネの命名ルール（先頭`_`禁止、既定名重複禁止）
- 断面変更時の寸法・色反映
- JSON Export/Import時のID非出力・再採番
- 面材色解決の2D/3D共有ロジック（スモーク）

## Version Management

バージョンの正本は `package.json` の `version` です。  
表示用バージョン（`Ver.<major>`）は `index.html` / `README.md` に自動同期します。

```bash
# 例: 100.0.0 -> 101.0.0
npm version 101.0.0

# 表示バージョンを同期
npm run version:sync

# 不整合チェック（CIでも実行）
npm run version:check
```

運用ルール:
- `index.html` と `README.md` のバージョン表記は手編集しない
- バージョン更新時は `package.json` を更新し、`version:sync` を実行する
- `version:check` が失敗した場合は同期漏れまたは `package-lock.json` の不整合を修正する

## Deploy to GitHub Pages

1. GitHubにリポジトリをpush
2. **Settings > Pages > Source** で `main` ブランチ / `/ (root)` を選択
3. 数分後に `https://<username>.github.io/Frame2D-CAD/` で公開

## Browser Support

Chrome / Edge / Safari / Firefox (ES Modules + importmap 対応のモダンブラウザ)

## License

MIT License - 詳細は [LICENSE](LICENSE) を参照

### Third-Party Libraries

| ライブラリ | バージョン | ライセンス | 用途 |
|-----------|-----------|-----------|------|
| [three.js](https://github.com/mrdoob/three.js) | 0.170.0 | MIT | 3D Viewer (CDN) |
| [ESLint](https://github.com/eslint/eslint) | ^9.0.0 | MIT | JS Lint (dev) |
| [HTMLHint](https://github.com/htmlhint/HTMLHint) | ^1.1.0 | MIT | HTML Lint (dev) |
| [Stylelint](https://github.com/stylelint/stylelint) | ^16.0.0 | MIT | CSS Lint (dev) |

詳細は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) を参照
