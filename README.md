# LineFrame CAD (Ver.Beta01)

ブラウザ上で動作する **2D CAD + 3D Viewer** Webアプリケーションです。
建築の柱・梁・ブレースなどの線材に加えて、床・壁の面材を2D平面上で配置・編集し、同じデータを3Dで可視化できます。

**GitHub Pages** でそのまま動作します（バックエンド不要）。

## Demo

GitHub Pages URL: _(デプロイ後にURLを記載)_

## Features

### 2D CAD
- 線材（梁・柱・ブレース）の作成・選択・移動・削除
- 面材（床 / 壁）の作成・選択・削除（矩形2点指定 / ポリライン閉合）
- 外壁ラインをポリラインで入力し、閉合してポリゴン化（レイヤー管理）
- ノード（端点）のドラッグによる形状変更
- パン（右ドラッグ / 中ボタン / Space+ドラッグ）・ズーム（マウスホイール）
- グリッド表示 + スナップ（グリッド / 既存ノード吸着）
- 原点と軸方向を左下に常時表示（配置の基準）
- レイヤー（Zレベル）管理: 名前・高さの編集、追加・削除（z値ソート表示、重複禁止、使用中レイヤー削除不可）
- ツール選択コンボボックスで選択 / 線材 / 面材 / 荷重を切替
- プロパティパネルで線材/面材属性を編集（種別・断面寸法・レイヤー・色・荷重方向）
- 床スラブの荷重方向（X / Y / 2方向）を矢印表示
- 壁要素は梁線と重なりにくいよう平面上でオフセット表示
- Undo / Redo

### 3D Viewer
- 線材を断面寸法（b x h）を反映した直方体として3D表示
- 面材（床スラブを水平面、壁を鉛直面）として3D表示
- OrbitControls によるカメラ操作（回転 / パン / ズーム）
- グリッド床・座標軸・ライティング

### Data I/O

- JSON Export（ファイルダウンロード）
- JSON Import（ファイル読み込みで状態復元）
- schemaVersion による互換性管理

### UI

- 設定モーダル（⚙ ボタン）: テーマ切替（ダーク/ライト）、言語切替（日本語/英語）、ヘルプ表示
- レイヤー管理モーダル（⚙ ボタン）: レイヤーの追加・名前/高さ編集・削除
- 簡易マニュアル（設定 → ヘルプボタンでモーダル表示、多言語対応）
- 設定はブラウザ（localStorage）に保存

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `M` | Line tool (線材) |
| `F` | Surface tool (面材) |
| `Enter` (Surface Polyline) | Close polyline to polygon |
| `Esc` | Cancel / Deselect / Close modal |
| `Delete` | Delete selected line/surface |
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
│   ├── state.js        # Data model (nodes, members, surfaces, layers) / CRUD / JSON serialization
│   ├── history.js      # Undo/Redo (snapshot, max 50)
│   ├── grid.js         # Grid drawing / Snap calculation
│   ├── canvas2d.js     # 2D canvas (pan/zoom camera, rendering)
│   ├── tools.js        # Select / Member tools / Keyboard shortcuts
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

- **state.js** がノード・線材・面材・レベルなど全データを保持する中心モジュール
- **canvas2d.js** は Canvas 2D API による描画のみを担当し、入力処理は **tools.js** に委譲
- **viewer3d.js** は2Dデータを mm→m 変換して three.js シーンに描画
- **i18n.js** が全UIテキストの日本語/英語辞書を管理し、`t(key)` で取得
- 各モジュールは ES Modules の import/export で疎結合に接続
- テーマ・言語設定は `localStorage` に永続化

## Data Format (JSON)

```json
{
  "schemaVersion": 2,
  "meta": {
    "name": "sample",
    "unit": "mm",
    "createdAt": "2026-02-09T00:00:00Z"
  },
  "settings": {
    "gridSize": 1000,
    "snap": true
  },
  "levels": [
    { "id": "L0", "name": "GL", "z": 0 },
    { "id": "L1", "name": "2F", "z": 2800 }
  ],
  "nodes": [
    { "id": "N1", "x": 0, "y": 0, "z": 0 },
    { "id": "N2", "x": 5000, "y": 0, "z": 0 }
  ],
  "members": [
    {
      "id": "M1",
      "type": "beam",
      "startNodeId": "N1",
      "endNodeId": "N2",
      "section": { "b": 200, "h": 400 },
      "levelId": "L0",
      "material": "steel",
      "color": "#666666"
    }
  ],
  "surfaces": [
    {
      "id": "S1",
      "type": "floor",
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
      "id": "S2",
      "type": "wall",
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
  ]
}
```

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
