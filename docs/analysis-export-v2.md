# 解析エクスポート v2 仕様

`element-modeler-analysis` version 2 は、element-modeler の幾何モデルを
下流の床振動解析 adapter へ渡すための交換形式です。JSON と CSV は同じ
mm-N 系の値を持ちます。

## 識別と責務境界

- ファイル名は従来どおり `<model>_analysis_<timestamp>.json|csv` です。
- 消費側はファイル名ではなく、JSON の `format` と `version`、または
  CSV の `meta,format` と `meta,version` を使って形式を判定します。
- CSVでも生成器・座標系・節点順・警告を`meta`行、単位宣言を`unit`行として
  出力します。
- element-modeler は幾何、接続、元単位、物性、質量換算前提を出力します。
- 解析メッシュ生成、mm から m へのSI正規化、固有値解析、歩行応答、TMD
  設計は下流 adapter / solver の責務です。
- 未定義値は推定しません。`null` または空欄と `meta.warnings` を出力し、
  下流 validator が停止判断できるようにします。

## ルートフィールド

| フィールド | 内容 |
|---|---|
| `format` | 常に `element-modeler-analysis` |
| `version` | 常に `2` |
| `units` | 各量の元単位 |
| `meta` | 来歴、座標系、節点順、警告 |
| `levels` / `nodes` | レベルと共有3D節点 |
| `elements` | 線材要素 |
| `sections` / `materials` | 使用断面と使用材料 |
| `springs` | 使用中の材端ばね |
| `supports` | 支点 |
| `loadCases` / `loads` / `loadCombinations` | 荷重情報 |
| `massSources` / `selfWeight` | 固有値解析用の質量換算前提 |

## ID と節点順

- `elements[].id`、`supports[].id`、`loads[].id` は、それぞれ独立した
  1始まりの連番数値です。
- 使用断面も `sections[].id` で1始まりに採番し、各要素は `sectionId` で
  参照します。同じ断面名が梁・柱など別種別に存在しても参照は一意です。
- 既存の `sectionName` と `sections[].name` / `type` は互換用に維持します。
- CAD上のIDは各行の `sourceId` に保持されます。
- 通常の部材要素は `sourceBranch: "primary"` です。
- Xブレースは1つのCAD部材から2要素へ展開されます。両要素の `sourceId`
  は同じで、2本目を `sourceBranch: "cross"` として一意に復元できます。
- `nodes` は `id` 昇順です。`meta.nodeOrder` は `ascending-id` であり、
  下流の `node_order_hash` はこの順序を入力とします。
- 節点参照 `nodeI` / `nodeJ` / `nodeId` は数値節点IDです。

## 来歴と座標系

`meta` には次を含みます。

```json
{
  "generator": {
    "name": "element-modeler",
    "formatVersion": 2,
    "appVersion": "1.1.0"
  },
  "generatedAt": "2026-08-08T00:00:00.000Z",
  "coordinates": {
    "verticalAxis": "z",
    "handedness": "right"
  },
  "nodeOrder": "ascending-id"
}
```

`generatedAt` はエクスポート実行時刻の ISO 8601 文字列です。

## 単位

| 量 | 単位 |
|---|---|
| 長さ | `mm` |
| 力 | `N` |
| 線荷重 | `N/mm` |
| 面荷重 | `N/mm2` |
| モーメント | `N*mm` |
| 質量 | `kg` |
| E、G | `N/mm2` |
| 密度 | `kg/m3` |
| A | `mm2` |
| Iy、Iz、J | `mm4` |
| 回転ばね kr | `N*mm/rad` |
| 並進ばね kt | `N/mm` |

画面入力が N/m、N/m²、N·m の荷重だけは、従来どおりエクスポート時に
上表の mm-N 系へ変換されます。

## 材料と断面

使用中の材料は `materials` に出力されます。組み込みの試行値は次のとおりで、
ユーザー定義画面から編集できます。

| name | E (N/mm²) | G (N/mm²) | density (kg/m³) |
|---|---:|---:|---:|
| `steel` | 205000 | 79000 | 7850 |
| `rc` | 24000 | 10000 | 2400 |
| `wood` | 10000 | 650 | 500 |

値が組み込み値と一致すると `isDefault: true` です。変更または追加した材料は
`isDefault: false` です。未登録材料を参照する既存モデルでは E/G/density を
`null` とし、材料名を `undefinedMaterialNames` に列挙します。

`sections` は既存の `b` / `h` に加え、`A` / `Iy` / `Iz` / `J` を持ちます。
明示値がないフィールドは、矩形断面として次のように算定します。

- `A = b h`
- `Iy = b h³ / 12`
- `Iz = h b³ / 12`
- `J = a t³ {1/3 - 0.21(t/a)[1 - (t/a)⁴/12]}`、`a=max(b,h)`、`t=min(b,h)`

各フィールドの `propertySource` は `rectangle` または `explicit` です。
H形鋼などはユーザー定義の明示入力値で上書きしてください。明示された b/h または
A/Iy/Iz/J が0以下・非数値の場合は、既定値や矩形値へ置換せず読込を拒否します。

## ばね

使用ばねは `symbol`、`kr`、`kt`、`memo`、`isDefault` を持ちます。
`kr` は材端回転ばねの基本値、`kt` は任意の並進剛性です。使用中ばねの
`kr` が未定義の場合、`meta.warnings.undefinedSpringStiffness` が `true` と
なり、対象記号を `undefinedSpringSymbols` に列挙します。

## 質量源と自重

`massSources` は荷重ケースごとの無次元換算係数です。既定値は次です。

```json
{
  "DL": 1.0,
  "LL": 0.3,
  "EQX": 0.0,
  "EQY": 0.0,
  "WX": 0.0,
  "WY": 0.0
}
```

空欄にした係数は `null` となり、`undefinedMassSources` と
`undefinedMassSourceCases` で検知できます。

`selfWeight.mode` は次のいずれかです。

- `fromDensity`: 下流が density × A × L から部材自重を算定します。
- `includedInDL`: 自重はDLに含むものとし、密度から再計上しません。

`selfWeight.isDefault` は自重モードが組み込み既定の `fromDensity` かどうかを
示します（質量換算係数の変更とは独立です）。この指定は重力の二重計上を防ぐ
ための契約です。

## 床面区画候補

既存の `areaLoad` は `x1` / `y1` / `x2` / `y2`、`levelId`、`z` を保持します。
下流 adapter はこれを矩形の床面区画候補 (`source_rect`) として利用できます。
独立した床区画エンティティ、床解析メッシュ、合成・非合成、有効幅、直交異方性
は v2 の対象外です。

## 警告ゲート

下流 validator は少なくとも次の真偽値を検査してください。

- `meta.warnings.undefinedSpringStiffness`
- `meta.warnings.undefinedMassSources`
- `meta.warnings.undefinedMaterialProperties`

いずれかが `true` の場合は、対応する配列で対象を表示し、値を推定して解析を
続行しないことを推奨します。

## v1 からの変更

- `version` を1から2へ変更しました。
- 要素・支点・荷重IDを文字列から数値へ変更し、旧IDを `sourceId` に保存します。
- 既存の節点、接続、b/h、材端、荷重値、荷重組合せフィールドは維持します。
- メタデータ、物性、断面特性、ばね剛性、質量源は追加フィールドです。
- CSVは既存列の並びを維持し、追加列と追加セクションを後置します。
