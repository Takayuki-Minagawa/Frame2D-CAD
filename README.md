# Element Modeler (Ver.1.1.0)

ブラウザ上で動作する **2D CAD + 3D Viewer** Webアプリケーションです。
建築の柱・梁・ブレースなどの線材に加えて、床・壁の面材を2D平面上で配置・編集し、同じデータを3Dで可視化できます。

**GitHub Pages** でそのまま動作します（バックエンド不要）。

## Demo

GitHub Pages URL: _(デプロイ後にURLを記載)_

## Features

### 2D CAD
- 線材（梁 / 柱 / 水平ブレース / 鉛直ブレース）の作成・選択・移動・削除
- 面材（床 / 外壁 / 壁 / 屋根 / 庇・軒 / 妻壁）の作成・選択・削除（矩形2点指定 / ポリライン閉合）
- 外壁ラインをポリラインで入力し、閉合してポリゴン化（レイヤー管理）
- 壁の高さ種別（全高 / 腰壁 / 垂れ壁 / 任意）を入力し、下端・上端高さを編集
- 屋根面を矩形/ポリラインで入力し、勾配・登り方向・基準高さを設定
- 床・外壁などの輪郭から屋根面を自動生成（片流れ / 切妻X棟 / 切妻Y棟 / 寄棟）
- 庇・軒を屋根面と同じ勾配付き面として入力し、風圧投影面積と地震重量に反映
- 複数の屋根面を屋根グループIDでまとめて管理
- 屋根グループを検証し、空グループ・無効輪郭・自己交差・共有辺高さ不一致を検出
- 屋根グループ単位で生成済みの屋根部材・庇・妻壁を削除/再生成
- 同一屋根グループ内の共有境界から棟木・谷木・隅木系のジョイント部材を生成
- 同一屋根グループの外周屋根端部から妻壁を生成
- 屋根面から外周梁を生成し、3D明示座標を持つ斜め部材として表示
- 屋根面からピッチ指定の登り梁を生成し、勾配方向の3D明示座標部材として表示
- 屋根外周梁と登り梁の交点は外周梁を分割して節点共有
- 屋根部材を外周梁/登り梁/棟木/谷木/隅木などの役割別に色分けし、集計で本数と延長を確認
- X方向/Y方向の風圧用投影面積と、面材単位重量による地震用重量を集計
- 数量集計パネルで面材別・屋根部材別の明細を確認し、集計CSV/詳細CSVとして出力
- 荷重（面荷重 / 線荷重 / 点荷重）の作成・選択・編集・削除
- 支点（境界条件）の配置・編集・削除（6自由度: DX/DY/DZ + RX/RY/RZ をチェックボックスで指定、ピン/剛/全解除プリセット付き）
- 支点の表示/非表示切替（「支点表示」チェックボックス。非表示時は2D/3D描画とクリック選択をスキップ）
- ノード（端点）のドラッグによる形状変更
- 線材のプロパティパネルで始点・終点のX,Y座標を数値入力で直接編集可能
- パン（右ドラッグ / 中ボタン / Space+ドラッグ）・ズーム（マウスホイール）
- グリッド表示 + スナップ（グリッド / 既存ノード吸着）
- 広域選択モード（「広域選択」チェックボックスでON/OFF。ONにするとクリック許容範囲が広がり、グリッドからズレた部材も選択しやすくなる）
- 2Dレイヤー表示モード（全レイヤー / 現在のみ / 他レイヤー薄表示）を切替
- 他レイヤー選択ロックで、薄表示の下階を参照だけにして誤選択を防止
- 表示プリセット（入力用 / 確認用 / 3D確認用）と線材・面材・荷重・線材種別・断面フィルタ
- 原点と軸方向を左下に常時表示（配置の基準）
- レイヤー（Zレベル）管理: 名前・高さの編集、追加・削除（z値ソート表示、重複禁止、使用中レイヤー削除不可）
- 階コピー: コピー元階の線材・面材・荷重・支点をコピー先階へ複製（柱/鉛直ブレースはコピー先階を下端として上端階を再設定）
- ツール選択コンボボックスで要素 / 線材 / 面材 / 荷重 / 支点を切替
- プロパティパネルで線材/面材/荷重/支点属性を編集
- 線材: 断面、始点/終点座標(X,Y)、端部条件 I/J（ピン / 剛 / バネ）、バネ記号を編集
- 線材ツールでは、梁・水平ブレースは現在レイヤー、柱・鉛直ブレースは下端レイヤーで管理し、上端レイヤーを自動表示
- 配置中のプレビューラベルと、2D上の材端条件記号表示を切替可能
- モデルチェック: 欠落ノード/階参照、重複線材、ゼロ長線材、孤立ノードなどを一覧表示
- 面材: 断面、床のみ荷重方向、壁/妻壁の高さ、屋根/庇勾配、単位重量、風圧/地震重量対象を編集
- 屋根面: 外周梁と登り梁をプロパティパネルから生成
- 荷重: 座標、荷重値、色などを編集
- 種別・レイヤー・断面寸法・断面色は表示専用（断面定義から自動反映）
- 床スラブの荷重方向（X / Y / 2方向）を矢印表示
- 壁要素は梁線と重なりにくいよう平面上でオフセット表示
- 断面変更時に色が更新され、平面図と3D表示の両方へ連動
- Undo / Redo
- 通り芯（X/Y方向のグリッド線）の定義・名前/座標編集・2D表示・交点スナップ（通り芯管理モーダル）
- 複数選択（Shift+クリックで追加/解除、空白ドラッグで矩形範囲選択）と一括編集
  - 一括断面変更（種別ごと）、一括削除、グループドラッグ移動
  - ミラーコピー（X=一定 / Y=一定の対称軸を指定）
  - 回転（選択中心まわりに90/180/270°、その場変換）
  - 配列複製（dX/dY オフセット × 複製数）
- 計測ツール（2点間の距離・dX・dYを表示、`D`キー）
- 節点マージ（許容差内の近接節点を統合）と交差部材の自動分割（交差・T字接合部で梁/水平ブレースを分割し節点共有）
- 荷重ケース（DL/LL/EQX/EQY/WX/WY）を荷重ごとに設定、荷重組合せ（ケース×係数）を管理
- DXF下絵インポート（LINE/POLYLINE/CIRCLE/ARC を下絵表示、表示切替・クリア）
- 軸組図ビュー（通り芯を選んで構面の立面を表示。柱・梁・ブレース・レベル線・直交通り芯）
- 自動保存とクラッシュ復元（localStorageへ定期保存、起動時に復元確認）
- サンプルモデル（平屋+切妻屋根 / 2階建フレーム）を設定モーダルからワンクリック読込
- 階高・X/Yスパンのリストから、レベル・通り芯・柱・梁・GL支点を持つ初期格子フレームを一括生成

### 3D Viewer
- 線材を断面寸法（b x h）を反映した直方体として3D表示
- 線材の3D表示は断面形状と線表示を切替可能（面材は面表示のまま）
- 梁の3D断面表示をボックス / H形鋼（強軸） / H形鋼（弱軸）で切替可能
- 3Dレイヤー表示モード（全レイヤー / 現在のみ / 他レイヤー薄表示）を2Dとは独立して切替
- 面材（床スラブを水平面、壁/妻壁を鉛直面）として3D表示
- 屋根面と庇・軒を勾配付きの傾斜面として3D表示
- 3D明示座標を持つ屋根外周梁・登り梁を傾斜部材として3D表示
- 屋根部材の役割色を2D/3D表示で共通化
- 荷重（面荷重=赤スラブ、線荷重=オレンジ線、点荷重=紫球体）を3D表示
- 支点を3D表示（固定=コーン+プレート、ローラー/部分拘束=コーン+球体）
- 3Dビューで部材・面材をクリックすると2Dと共通の選択状態になり、プロパティパネルに反映（選択要素はハイライト表示）
- OrbitControls によるカメラ操作（回転 / パン / ズーム）
- グリッド床・座標軸・ライティング
- CDNからThree.jsの読み込みに失敗した場合はユーザーにエラー通知

## Roof Workflow

屋根入力は以下の順序で進めると、面材、屋根部材、妻壁、数量集計のつながりを確認しやすくなります。

1. 床・外壁などの輪郭を選択して屋根面を自動生成するか、面材ツールで屋根面または庇・軒を矩形/ポリライン入力します。自動生成は片流れ、切妻X棟、切妻Y棟、寄棟を選べます。
2. 切妻/寄棟の自動生成は軸に平行な矩形輪郭が対象です。複雑な屋根、入隅を持つ屋根、穴付き形状は、共有辺を持つ複数の屋根面に分割します。
3. 同じ棟・谷・隅木を構成する屋根面に同じ `roofGroupId` を設定します。庇・軒は勾配付き面として扱いますが、屋根グループ部材生成の対象外です。
4. 各屋根面で勾配、登り方向、基準高さを設定し、3D表示で傾斜方向を確認します。
5. 屋根面ごとに外周梁を生成します。同一 `roofGroupId` 内の共有辺は外周梁ではなく、棟/谷/隅木のジョイントとして扱われます。
6. 必要なピッチで登り梁を生成します。登り梁端部が外周梁の途中に乗る場合は、外周梁が分割されて節点共有されます。
7. 屋根グループ単位で棟/谷/隅木、外周庇、外周傾斜辺からの妻壁を生成します。再生成前にはグループ検証と生成要素削除を使い、自己交差や共有辺高さ不一致を確認してから再生成できます。
8. 風圧対象、地震重量対象、単位重量を設定し、数量集計でX/Y方向投影面積、地震用重量、屋根部材の役割別本数・延長を確認します。面材明細と屋根部材明細はパネル内で展開でき、集計CSV/詳細CSVとして出力できます。

共有辺を持たない独立した庇や片流れ屋根は、屋根グループを分けるか庇・軒として入力すると、部材生成の意図が明確になります。

### Roof Auto-Generation Notes

- **片流れ/単一面**: 矩形とポリゴン輪郭に対応します。複雑な外形をそのまま1枚の屋根面として作りたい場合に使います。
- **切妻X棟 / 切妻Y棟 / 寄棟**: 軸に平行な矩形輪郭に対応します。非矩形・回転矩形・穴付き形状では生成されません。
- 自動生成は屋根面だけを作成します。外周梁、登り梁、棟/谷/隅木、庇、妻壁は屋根面生成後に屋根グループ単位で生成します。
- 屋根グループ検証は、空グループ、3点未満の無効輪郭、自己交差、共有辺の高さ不一致を検出します。問題がある場合は対象屋根面や勾配/基準高さを見直してください。

### Data I/O

CADデータ（図面情報）とユーザー定義（断面・バネ）は**別ファイルとしても分離管理**できます。

- **CAD保存/CAD読込**（ツールバー）: 図面データ（ノード・線材・面材・荷重・支点・レイヤー・設定）をJSONファイルとして保存/読込
  - 使用中のカスタムユーザー定義はCADファイルに含まれます（未使用の定義は含まれません）
  - CAD読込時、既にメモリ上にあるカスタムユーザー定義は維持されます
  - 旧バージョンで保存されたファイルも後方互換で読込可能
- **ユーザー定義エクスポート/インポート**（設定 → ユーザー定義モーダル）: カスタム断面・バネ定義を別のJSONファイルとして管理
  - インポート時、同名の定義が既に存在する場合（CADファイルから読込済みの定義を含む）はスキップされ、件数が通知されます
  - 断面定義・バネ定義にはメモ（説明テキスト）を付与可能
- **数量CSV/詳細CSV出力**（右パネルの集計）: 集計CSVは階別合計と屋根部材の役割別合計、詳細CSVは面材別・屋根部材別の明細を出力
- **解析用モデル出力**（ツールバー）: 共有3D節点・要素コネクティビティ・断面・材端条件・支点・荷重ケース別荷重・荷重組合せをソルバー中立のJSON/CSVで出力（単位: mm, N）
- **図面出力**（ツールバー）: 平面図をDXF（R12系 ENTITIES、部材/面材/通り芯をレイヤー分け。レイヤー名は31文字以内）またはPNGで出力
- **DXF下絵読込**（ツールバー）: DXFのLINE/LWPOLYLINE/POLYLINE/CIRCLE/ARCを下絵として取り込み（CADデータに保存される）
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
  - 面材: 床 `_S`, 外壁 `_OW`, 壁 `_IW`, 屋根 `_R`, 庇/軒 `_E`, 妻壁 `_GW`
  - バネ: `_SP`（回転バネ）
- ユーザー定義名の先頭に `_` は使用不可
- 既定名と同名のユーザー定義は作成不可
- 同グループ一覧で既定値・ユーザー定義を確認可能
- 線材の断面定義では、配置時に使う I端/J端の材端条件プリセット（ピン / 剛 / バネ）を登録可能
- ユーザー定義は登録後に「名前以外（寸法・色・材端プリセット・メモ）」を更新可能
- ユーザー定義は削除可能（ただし使用中の定義は削除不可）

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Element tool - 要素（選択・編集・削除） |
| `M` | Line tool - 線材 |
| `F` | Surface tool - 面材 |
| `L` | Load tool - 荷重 |
| `S` | Support tool - 支点 |
| `D` | Measure tool - 計測 |
| `Shift + Click` (Element tool) | Add / remove member in multi-selection |
| `Drag on empty space` (Element tool) | Marquee (rectangle) member selection |
| `Enter` (Surface Polyline) | Close polyline to polygon |
| `Esc` | Cancel / Deselect / Close modal |
| `Delete` | Delete selected element(s) |
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
│   ├── state.js        # Data model (nodes, members, surfaces, loads, supports, layers) / CRUD / JSON serialization
│   ├── roof-geometry.js # Shared roof plane geometry / projected areas / generated member lines
│   ├── history.js      # Undo/Redo (snapshot, max 50)
│   ├── grid.js         # Grid drawing / Snap calculation
│   ├── canvas2d.js     # 2D canvas (pan/zoom camera, rendering)
│   ├── tools.js        # Select / Member / Surface / Load / Support tools / Keyboard shortcuts
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

- **state.js** がノード・線材・面材・荷重・支点・レベルなど全データを保持する中心モジュール
- **canvas2d.js** は Canvas 2D API による描画のみを担当し、入力処理は **tools.js** に委譲
- **viewer3d.js** は2Dデータを mm→m 変換して three.js シーンに描画
- **i18n.js** が全UIテキストの日本語/英語辞書を管理し、`t(key)` で取得
- 各モジュールは ES Modules の import/export で疎結合に接続
- テーマ・言語設定は `localStorage` に永続化

## Data Format (JSON)

### CADデータ（図面情報）

「CAD保存」で出力されるファイル。デフォルト定義に加え、使用中のカスタムユーザー定義も含まれます。

```json
{
  "schemaVersion": 10,
  "meta": {
    "name": "sample",
    "unit": "mm",
    "createdAt": "2026-02-11T00:00:00Z"
  },
  "settings": {
    "gridSize": 1000,
    "snap": true,
    "wallDisplayOffset": 120,
    "showSupports": true,
    "widePick": false
  },
  "levels": [
    { "id": "L0", "name": "GL", "z": 0 },
    { "id": "L1", "name": "2F", "z": 2800 }
  ],
  "nodes": [
    { "id": 1, "x": 0, "y": 0, "z": 0 },
    { "id": 2, "x": 5000, "y": 0, "z": 0 }
  ],
  "sectionCatalog": [
    { "target": "member", "type": "beam", "name": "_G", "material": "steel", "b": 200, "h": 400, "color": "#666666", "memo": "", "defaultEndI": { "condition": "pin", "springSymbol": null }, "defaultEndJ": { "condition": "pin", "springSymbol": null }, "isDefault": true },
    { "target": "member", "type": "beam", "name": "B300x500", "material": "steel", "b": 300, "h": 500, "color": "#123456", "memo": "カスタム梁", "defaultEndI": { "condition": "rigid", "springSymbol": null }, "defaultEndJ": { "condition": "spring", "springSymbol": "_SP" }, "isDefault": false }
  ],
  "springCatalog": [
    { "symbol": "_SP", "memo": "回転バネ", "isDefault": true }
  ],
  "members": [
    {
      "type": "beam",
      "startNodeId": 1,
      "endNodeId": 2,
      "sectionName": "B300x500",
      "levelId": "L0",
      "color": "#123456",
      "topLevelId": null,
      "bracePattern": "single",
      "endI": { "condition": "rigid", "springSymbol": null },
      "endJ": { "condition": "rigid", "springSymbol": null }
    }
  ],
  "surfaces": [
    {
      "type": "wall",
      "sectionName": "_IW",
      "levelId": "L0",
      "topLevelId": "L1",
      "loadDirection": "twoWay",
      "heightMode": "waist",
      "bottomOffset": 0,
      "topOffset": 1200,
      "includeWind": true,
      "includeSeismicWeight": true,
      "unitWeight": 500,
      "color": "#b57a6b",
      "x1": 0,
      "y1": 0,
      "x2": 5000,
      "y2": 0,
      "shape": "line",
      "points": [{ "x": 0, "y": 0 }, { "x": 5000, "y": 0 }]
    }
  ],
  "loads": [ ... ],
  "supports": [
    {
      "x": 0, "y": 0,
      "levelId": "L0",
      "dx": true, "dy": true, "dz": true,
      "rx": false, "ry": false, "rz": false
    }
  ]
}
```

- `sectionCatalog` / `springCatalog` にはデフォルト定義＋使用中のカスタム定義が含まれます（未使用のカスタム定義は含まれません）
- 断面定義には `memo`（説明テキスト）フィールドが含まれます
- `nodes` / `levels` の `id` はJSONに保存されます。節点IDと `members` の節点参照は数値で出力されます
- `members` / `surfaces` / `loads` の `id` は内部管理のみで、Export時には出力されません（Import時に再採番）
- 旧バージョンで保存されたファイルも後方互換で読込可能
- schemaVersion 10 以降、`endI` / `endJ` が未指定の線材はピンとして読み込まれます（明示された材端条件は保持されます）

### ユーザー定義ファイル

「設定 → ユーザー定義 → エクスポート」で出力されるファイル。カスタム断面・バネ定義のみ含まれます。

```json
{
  "userDefinitions": true,
  "sections": [
    { "target": "member", "type": "beam", "name": "B300x500", "material": "steel", "b": 300, "h": 500, "color": "#123456", "memo": "カスタム梁", "defaultEndI": { "condition": "rigid", "springSymbol": null }, "defaultEndJ": { "condition": "spring", "springSymbol": "SP1" } }
  ],
  "springs": [
    { "symbol": "SP1", "memo": "カスタムバネ" }
  ]
}
```

## Getting Started

```bash
# Clone
git clone https://github.com/<your-username>/Frame2D-CAD.git
cd Frame2D-CAD

# Create a Python environment with uv
uv venv --python 3.13
source .venv/bin/activate

# Start local server (ES Modules require HTTP)
python -m http.server 8080

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
- 線材断面の材端プリセット反映と配置済み部材の材端保持
- CAD JSON Export時のカスタム定義除外・ID非出力
- CAD読込時のカスタム定義保持・後方互換
- 面材色解決の2D/3D共有ロジック（スモーク）

## Version Management

バージョンの正本は `package.json` の `version` です。  
表示用バージョン（`Ver.<semver>`。例: `Ver.1.0.1`）は `index.html` / `README.md` に自動同期します。

```bash
# 例: 1.0.2 -> 1.0.3
npm version 1.0.3

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
