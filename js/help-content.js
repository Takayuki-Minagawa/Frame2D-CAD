// help-content.js - Help modal HTML content (extracted from i18n dictionaries)

export const helpContentJa = `
<h3>基本操作</h3>
<table>
  <tr><td><b>線材作成</b></td><td>「線材」ツール(Mキー)を選択し、キャンバス上で始点をクリック → 終点をクリック</td></tr>
  <tr><td><b>面材作成</b></td><td>「面材」ツール(Fキー)。矩形は対角2点、ポリラインは連続クリック→始点クリックまたはEnterで閉合</td></tr>
  <tr><td><b>荷重作成</b></td><td>「荷重」ツール(Lキー)。面荷重は矩形2点、線荷重は線分2点、点荷重は1点クリック</td></tr>
  <tr><td><b>支点配置</b></td><td>「支点」ツール(Sキー)でキャンバス上をクリック。プロパティパネルで6自由度(DX/DY/DZ/RX/RY/RZ)を設定</td></tr>
  <tr><td><b>選択</b></td><td>「要素」ツール(Vキー)で線材・面材・荷重・支点をクリック。3D表示でも部材・面材をクリックで選択できます</td></tr>
  <tr><td><b>複数選択</b></td><td>Shift+クリックで線材を追加/解除。空白からドラッグで矩形範囲選択。右パネルで一括断面変更・ミラー・回転・配列複製・一括削除</td></tr>
  <tr><td><b>計測</b></td><td>「計測」ツール(Dキー)で2点をクリックすると距離・dX・dYを表示。Escで消去</td></tr>
  <tr><td><b>移動</b></td><td>選択後、ノードまたは線材をドラッグ（複数選択中はグループごと移動）。またはプロパティパネルで始点/終点のX,Y座標を数値入力</td></tr>
  <tr><td><b>削除</b></td><td>要素を選択してDeleteキー（複数選択にも対応）</td></tr>
</table>

<h3>通り芯・下絵・軸組図</h3>
<table>
  <tr><td><b>通り芯</b></td><td>ツールバーの「通り芯管理」でX/Y通りの名前と座標を定義。2Dに一点鎖線で表示され、交点にスナップします</td></tr>
  <tr><td><b>下絵DXF</b></td><td>「下絵DXF読込」でDXF(LINE/POLYLINE/CIRCLE/ARC)を下絵表示。「下絵表示」で切替、「下絵クリア」で削除</td></tr>
  <tr><td><b>軸組図</b></td><td>上部「軸組図」ボタンで通り芯を選び、その構面の立面（柱・梁・ブレース・レベル線）を表示</td></tr>
  <tr><td><b>モデル整形</b></td><td>右パネルの「節点マージ」で近接節点を統合、「交差部材を分割」で交差/T字部の梁・水平ブレースを分割し節点共有</td></tr>
</table>

<h3>荷重ケースと解析エクスポート</h3>
<table>
  <tr><td><b>荷重ケース</b></td><td>荷重ツールとプロパティパネルで DL/LL/EQX/EQY/WX/WY を設定</td></tr>
  <tr><td><b>荷重組合せ</b></td><td>設定 → 荷重組合せ でケースごとの係数を編集・追加</td></tr>
  <tr><td><b>解析出力</b></td><td>「解析JSON出力」「解析CSV出力」で共有3D節点・要素・断面・材端・支点・荷重・組合せを出力（単位 mm, N）</td></tr>
  <tr><td><b>図面出力</b></td><td>「図面DXF出力」「PNG出力」で平面図を出力</td></tr>
</table>

<h3>画面操作</h3>
<table>
  <tr><td><b>パン（移動）</b></td><td>右ドラッグ / 中ボタンドラッグ / Space + ドラッグ</td></tr>
  <tr><td><b>ズーム</b></td><td>マウスホイール（カーソル中心）</td></tr>
  <tr><td><b>原点・軸表示</b></td><td>左下に原点と軸方向（X, Y）を常時表示</td></tr>
  <tr><td><b>3D表示</b></td><td>上部「3D 表示」タブをクリック</td></tr>
</table>

<h3>キーボードショートカット</h3>
<table>
  <tr><td><kbd>V</kbd></td><td>要素ツール（選択・編集・削除）</td></tr>
  <tr><td><kbd>M</kbd></td><td>線材ツール</td></tr>
  <tr><td><kbd>F</kbd></td><td>面材ツール</td></tr>
  <tr><td><kbd>L</kbd></td><td>荷重ツール</td></tr>
  <tr><td><kbd>S</kbd></td><td>支点ツール</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>面材ポリラインを閉じて確定</td></tr>
  <tr><td><kbd>Esc</kbd></td><td>キャンセル / 選択解除 / モーダルを閉じる</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>選択要素を削除</td></tr>
  <tr><td><kbd>Ctrl+Z</kbd></td><td>元に戻す</td></tr>
  <tr><td><kbd>Ctrl+Y</kbd></td><td>やり直し</td></tr>
  <tr><td><kbd>Shift</kbd></td><td>角度制限（0/45/90°）</td></tr>
</table>

<h3>プロパティパネル</h3>
<p>要素を選択すると右パネルで以下を編集できます:</p>
<ul>
  <li><b>線材</b> - 断面 / 始点座標(X,Y) / 終点座標(X,Y) / 端部(I/J) / バネ記号（バネ時）</li>
  <li><b>面材</b> - 断面 / 荷重方向（床のみ）</li>
  <li><b>荷重</b> - 種別 / 座標 / 荷重値(面・線) / 力・モーメント(点) / 色</li>
  <li><b>支点</b> - 位置(X,Y) / 並進拘束(DX,DY,DZ) / 回転拘束(RX,RY,RZ) / プリセット(ピン/剛/全解除)</li>
</ul>
<p>線材の始点・終点座標は数値入力で直接編集でき、ノード位置を正確に指定できます。</p>
<p>線材ツールでは梁・水平ブレースは現在レイヤー、柱・鉛直ブレースは下端レイヤーで管理し、上端レイヤーをツールバーに表示します。</p>
<p>種別・レイヤー・幅/高さ・色は表示専用です。断面を変更すると寸法と色が自動反映され、外壁を含む面材の色は平面図と3D表示へ連動します。</p>

<h3>屋根入力ワークフロー</h3>
<ol>
  <li>床・外壁などの輪郭を選択して屋根面を自動生成するか、面材ツールで屋根面または庇・軒を矩形/ポリライン入力します。自動生成は片流れ、切妻X棟、切妻Y棟、寄棟を選べます。</li>
  <li>切妻/寄棟の自動生成は軸に平行な矩形輪郭が対象です。複雑な屋根や穴付き形状は、共有辺を持つ複数の屋根面に分けます。</li>
  <li>同じ棟・谷・隅木を構成する屋根面には同じ <code>roofGroupId</code> を設定します。</li>
  <li>各屋根面で勾配、登り方向、基準高さを設定し、3D表示で傾斜方向を確認します。</li>
  <li>必要に応じて屋根面ごとに外周梁と登り梁を生成します。同一屋根グループ内の共有辺は外周梁ではなく棟/谷/隅木の対象です。</li>
  <li>屋根グループ単位で棟/谷/隅木、外周庇、外周傾斜辺からの妻壁を生成します。再生成前にはグループ検証で自己交差や共有辺高さ不一致を確認し、生成済み要素を削除してから再生成できます。</li>
  <li>単位重量と風圧/地震重量の対象フラグを確認し、数量集計で投影面積、地震用重量、屋根部材の役割別延長を確認します。面材明細と屋根部材明細はパネル内で展開でき、集計CSV/詳細CSVとして出力できます。</li>
</ol>
<p>片流れ/単一面は矩形とポリゴン輪郭に対応します。切妻X棟、切妻Y棟、寄棟は軸に平行な矩形輪郭に対応し、非矩形・回転矩形・穴付き形状では生成されません。</p>

<h3>表示・選択オプション</h3>
<p>ツールバーのチェックボックスで以下を切り替えられます:</p>
<table>
  <tr><td><b>スナップ</b></td><td>ONにするとグリッド/既存ノードに吸着します</td></tr>
  <tr><td><b>支点表示</b></td><td>OFFにすると支点を2D/3Dの両方で非表示にします。非表示中は支点のクリック選択もスキップされます</td></tr>
  <tr><td><b>広域選択</b></td><td>ONにするとクリックの許容範囲が広がり、グリッドからズレた部材も選択しやすくなります（通常 8px → 20px）</td></tr>
  <tr><td><b>2Dレイヤー表示</b></td><td>全レイヤー、現在レイヤーのみ、他レイヤーの薄表示を切り替えます</td></tr>
  <tr><td><b>他レイヤー選択ロック</b></td><td>薄表示中の他レイヤーを参照表示だけにし、選択やドラッグを防ぎます</td></tr>
  <tr><td><b>表示フィルタ</b></td><td>線材・面材・荷重、線材種別、断面、材端記号、配置ラベルを切り替えます</td></tr>
  <tr><td><b>3D線材表示</b></td><td>線材を断面形状または中心線で表示します。梁3D断面で、梁だけをボックス、H形鋼（強軸）、H形鋼（弱軸）に切り替えられます。面材は面表示のままです</td></tr>
  <tr><td><b>階コピー / モデルチェック</b></td><td>現在階の要素を別階へ複製し、欠落参照・重複・ゼロ長などを確認できます</td></tr>
</table>

<h3>設定 / ユーザー定義</h3>
<p>ツールバー上部の ⚙ 設定ボタンから設定モーダルを開きます。</p>
<ul>
  <li><b>テーマ</b> - ダーク / ライトを切替</li>
  <li><b>言語</b> - 日本語 / English を切替</li>
  <li><b>ユーザー定義</b> - 断面定義 / バネ定義を追加・管理</li>
  <li><b>ヘルプ</b> - この簡易マニュアルを表示</li>
</ul>
<p>既定の断面・バネ（例: <code>_G</code>, <code>_C</code>, <code>_S</code>, <code>_OW</code>, <code>_IW</code>, <code>_SP</code>）は編集・削除できません。ユーザー定義名の先頭に <code>_</code> は使えません。線材の断面定義には、配置時に使う I端/J端の材端条件プリセットを設定できます。登録後は名前以外の項目（寸法・色・材端プリセット・メモ）を更新でき、ユーザー定義は削除可能です（使用中の定義は削除できません）。</p>
<p>「同グループ一覧」で現在のグループ定義を別画面で確認できます。</p>
<p>「エクスポート」でユーザー定義をJSONファイルとしてダウンロード、「インポート」で別環境からユーザー定義を読み込めます。</p>

<h3>レイヤー管理</h3>
<p>レイヤー選択横の ⚙ ボタンからレイヤー管理モーダルを開きます。</p>
<ul>
  <li><b>追加</b> - 新しいレイヤーを追加（z値は自動計算）</li>
  <li><b>編集</b> - レイヤー名とz値（高さ mm）を直接編集</li>
  <li><b>削除</b> - 未使用レイヤーのみ削除可能</li>
</ul>
<p>レイヤーはz値（高さ）の昇順で表示されます。同じz値のレイヤーは作成できません。</p>

<h3>データ入出力</h3>
<p>CADデータ（図面情報）とユーザー定義（断面・バネ）は<b>別ファイルとしても分離管理</b>できます。</p>
<table>
  <tr><td><b>CAD保存</b></td><td>ツールバーの「CAD保存」で図面データをJSONファイルとしてダウンロード。使用中のカスタムユーザー定義もCADファイルに含まれます（未使用の定義は含まれません）</td></tr>
  <tr><td><b>CAD読込</b></td><td>ツールバーの「CAD読込」でJSONファイルを読み込み。既にメモリ上にあるカスタム定義は維持されます</td></tr>
  <tr><td><b>定義エクスポート</b></td><td>設定 → ユーザー定義 →「エクスポート」でカスタム定義を別ファイルに保存</td></tr>
  <tr><td><b>定義インポート</b></td><td>設定 → ユーザー定義 →「インポート」で別環境のカスタム定義を読み込み。CADファイルから読込済みの定義を含め、同名の定義はスキップされます</td></tr>
</table>
<p>定義インポート時、追加件数とスキップ件数が通知されます。断面定義・バネ定義にはメモ（説明テキスト）を付与できます。</p>
<p>部材IDは内部管理用で、CADファイルには含まれません。旧バージョンで保存されたファイルも読み込めます。</p>
`;

export const helpContentEn = `
<h3>Basic Operations</h3>
<table>
  <tr><td><b>Create line</b></td><td>Select "Line" tool (M key), click start point → click end point</td></tr>
  <tr><td><b>Create surface</b></td><td>Use "Surface" (F). Rectangle: 2 diagonal points. Polyline: click points, then click first point or Enter to close</td></tr>
  <tr><td><b>Create load</b></td><td>Use "Load" (L). Area load: 2-point rectangle. Line load: 2-point line. Point load: single click</td></tr>
  <tr><td><b>Place support</b></td><td>Use "Support" (S). Click to place. Edit 6 DOFs (DX/DY/DZ/RX/RY/RZ) in the property panel</td></tr>
  <tr><td><b>Select</b></td><td>Use "Element" tool (V key), click a line/surface/load/support element. Members and surfaces can also be picked by clicking in the 3D view</td></tr>
  <tr><td><b>Multi-select</b></td><td>Shift+click toggles members; drag from empty space for a marquee selection. The panel offers batch section change, mirror, rotate, array copy, and batch delete</td></tr>
  <tr><td><b>Measure</b></td><td>Use "Measure" (D). Click two points to show length, dX, and dY. Esc clears</td></tr>
  <tr><td><b>Move</b></td><td>After selecting, drag a node or line element (the whole group moves during multi-selection). Or edit start/end X,Y coordinates in the property panel</td></tr>
  <tr><td><b>Delete</b></td><td>Select element(s) and press Delete key</td></tr>
</table>

<h3>Grid Axes, Underlay &amp; Elevation</h3>
<table>
  <tr><td><b>Grid axes</b></td><td>"Grid Axes" in the toolbar defines named X/Y axis lines. They render as dash-dot lines and snap at intersections</td></tr>
  <tr><td><b>DXF underlay</b></td><td>"Import DXF underlay" shows DXF (LINE/POLYLINE/CIRCLE/ARC) beneath the plan. Toggle with "Show underlay", remove with "Clear underlay"</td></tr>
  <tr><td><b>Elevation</b></td><td>The "Elevation" button renders the frame elevation (columns, beams, braces, level lines) of a selected grid axis</td></tr>
  <tr><td><b>Model cleanup</b></td><td>"Merge nodes" unifies nearby nodes; "Split crossing members" splits beams/horizontal braces at crossings and T-junctions to share nodes</td></tr>
</table>

<h3>Load Cases &amp; Analysis Export</h3>
<table>
  <tr><td><b>Load cases</b></td><td>Assign DL/LL/EQX/EQY/WX/WY in the load tool and property panel</td></tr>
  <tr><td><b>Combinations</b></td><td>Settings → Load Combinations to edit per-case factors</td></tr>
  <tr><td><b>Analysis export</b></td><td>"Analysis JSON" / "Analysis CSV" export shared 3D nodes, elements, sections, end conditions, supports, loads, and combinations (units: mm, N)</td></tr>
  <tr><td><b>Drawing export</b></td><td>"Plan DXF" / "Plan PNG" export the plan drawing</td></tr>
</table>

<h3>View Controls</h3>
<table>
  <tr><td><b>Pan</b></td><td>Right-button drag / Middle-button drag / Space + drag</td></tr>
  <tr><td><b>Zoom</b></td><td>Mouse wheel (centered on cursor)</td></tr>
  <tr><td><b>Origin & Axes</b></td><td>Origin and axis directions (X, Y) shown at bottom-left</td></tr>
  <tr><td><b>3D view</b></td><td>Click "3D View" tab at top</td></tr>
</table>

<h3>Keyboard Shortcuts</h3>
<table>
  <tr><td><kbd>V</kbd></td><td>Element tool (select / edit / delete)</td></tr>
  <tr><td><kbd>M</kbd></td><td>Line tool</td></tr>
  <tr><td><kbd>F</kbd></td><td>Surface tool</td></tr>
  <tr><td><kbd>L</kbd></td><td>Load tool</td></tr>
  <tr><td><kbd>S</kbd></td><td>Support tool</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>Close and confirm surface polyline</td></tr>
  <tr><td><kbd>Esc</kbd></td><td>Cancel / Deselect / Close modal</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>Delete selected element</td></tr>
  <tr><td><kbd>Ctrl+Z</kbd></td><td>Undo</td></tr>
  <tr><td><kbd>Ctrl+Y</kbd></td><td>Redo</td></tr>
  <tr><td><kbd>Shift</kbd></td><td>Angle constraint (0/45/90°)</td></tr>
</table>

<h3>Property Panel</h3>
<p>Select an element to edit in the right panel:</p>
<ul>
  <li><b>Line</b> - Section / Start point (X,Y) / End point (X,Y) / End condition (I/J) / Spring symbol (when spring)</li>
  <li><b>Surface</b> - Section / Load direction (floor only)</li>
  <li><b>Load</b> - Type / Coordinates / Value (area/line) / Force &amp; Moment (point) / Color</li>
  <li><b>Support</b> - Position (X,Y) / Translation (DX,DY,DZ) / Rotation (RX,RY,RZ) / Presets (Pin/Rigid/Free)</li>
</ul>
<p>Start/end point coordinates can be edited numerically to precisely position nodes.</p>
<p>In the line tool, beams and horizontal braces are managed on the current layer; columns and vertical braces are managed by their base layer, with the top layer shown in the toolbar.</p>
<p>Type, layer, width/height, and color are display-only. Changing section automatically updates dimensions and color, including surface color sync in both plan and 3D views.</p>

<h3>Roof Workflow</h3>
<ol>
  <li>Select a floor or exterior wall outline to auto-generate roof planes, or create roof/eave surfaces manually with the Surface tool. Auto-generation supports single-plane, X-ridge gable, Y-ridge gable, and hip presets.</li>
  <li>Gable and hip auto-generation require axis-aligned rectangular outlines. Split complex roofs or openings into multiple roof planes that share edges.</li>
  <li>Assign the same <code>roofGroupId</code> to roof planes that form the same ridge, valley, or hip system.</li>
  <li>Set slope, up direction, and base height on each roof plane, then confirm the slope direction in 3D view.</li>
  <li>Generate edge beams and slope beams per roof plane as needed. Shared edges inside a roof group are treated as ridge/valley/hip joints, not edge beams.</li>
  <li>Generate ridge/valley/hip members from the roof group, then generate eaves and gable walls from the outer edges. Validate self-intersections and shared-edge height mismatches before removing and regenerating generated elements.</li>
  <li>Confirm unit weight and wind/seismic flags, then review projected areas, seismic weight, and roof member lengths by role in the quantity summary. Expand surface and roof member detail tables, or export summary/detail CSV files.</li>
</ol>
<p>Single-plane generation supports rectangular and polygon outlines. X-ridge gable, Y-ridge gable, and hip presets support axis-aligned rectangles only; non-rectangular, rotated, or opening-based shapes should be split into roof planes first.</p>

<h3>Display &amp; Selection Options</h3>
<p>Toggle the following options using toolbar checkboxes:</p>
<table>
  <tr><td><b>Snap</b></td><td>When ON, snaps to grid points and existing nodes</td></tr>
  <tr><td><b>Show Supports</b></td><td>When OFF, hides supports in both 2D and 3D views. Click selection of supports is also skipped</td></tr>
  <tr><td><b>Wide Pick</b></td><td>When ON, widens the click tolerance for easier selection of off-grid elements (8px → 20px)</td></tr>
  <tr><td><b>2D Layers</b></td><td>Switch between all layers, current layer only, or halftone display for other layers</td></tr>
  <tr><td><b>Lock Other Layers</b></td><td>Keeps halftone layers visible for reference while preventing selection and dragging</td></tr>
  <tr><td><b>Display Filters</b></td><td>Toggle members, surfaces, loads, member types, sections, end symbols, and placement labels</td></tr>
  <tr><td><b>3D Lines</b></td><td>Show line members as section solids or center lines. Beam 3D Section switches beams only between box, H-section strong-axis, and H-section weak-axis solids. Surfaces remain as faces</td></tr>
  <tr><td><b>Copy Level / Model Check</b></td><td>Duplicate elements to another level and check missing references, duplicates, and zero-length elements</td></tr>
</table>

<h3>Settings / User Definitions</h3>
<p>Click the ⚙ Settings button at the top of the toolbar to open the settings modal.</p>
<ul>
  <li><b>Theme</b> - Switch between Dark / Light</li>
  <li><b>Language</b> - Switch between Japanese / English</li>
  <li><b>User Definitions</b> - Add/manage section and spring definitions</li>
  <li><b>Help</b> - Opens this quick manual</li>
</ul>
<p>Default definitions (for example <code>_G</code>, <code>_C</code>, <code>_S</code>, <code>_OW</code>, <code>_IW</code>, <code>_SP</code>) cannot be edited or deleted. Custom names cannot start with <code>_</code>. Line section definitions can set I/J end condition presets used when placing new lines. After registration, fields other than name can be updated (size, color, end presets, memo), and custom definitions can be deleted unless they are currently in use.</p>
<p>Use "Group List" to review registered definitions for the current group in a separate dialog.</p>
<p>Use "Export" to download user definitions as a JSON file, and "Import" to load definitions from another environment.</p>

<h3>Layer Management</h3>
<p>Click the ⚙ button next to the layer selector to open the layer management modal.</p>
<ul>
  <li><b>Add</b> - Add a new layer (z value auto-calculated)</li>
  <li><b>Edit</b> - Directly edit layer name and z value (height in mm)</li>
  <li><b>Delete</b> - Only unused layers can be deleted</li>
</ul>
<p>Layers are displayed sorted by z value (ascending). Duplicate z values are not allowed.</p>

<h3>Data I/O</h3>
<p>CAD data (drawing) and user definitions (sections/springs) can also be <b>managed as separate files</b>.</p>
<table>
  <tr><td><b>Save CAD</b></td><td>Click "Save CAD" in the toolbar to download drawing data as JSON. Custom definitions in use are included in the CAD file (unused definitions are excluded)</td></tr>
  <tr><td><b>Load CAD</b></td><td>Click "Load CAD" in the toolbar to load a JSON file. Existing custom definitions in memory are preserved</td></tr>
  <tr><td><b>Export Defs</b></td><td>Settings → User Definitions → "Export" to save custom definitions to a separate file</td></tr>
  <tr><td><b>Import Defs</b></td><td>Settings → User Definitions → "Import" to load custom definitions from another environment. Definitions with duplicate names (including those loaded from CAD files) are skipped</td></tr>
</table>
<p>When importing, the number of added and skipped items is shown. Section and spring definitions can include a memo (description text).</p>
<p>Member IDs are internal and are not written to CAD files. Files saved with older versions can still be loaded.</p>
`;

export function getHelpContent(lang) {
  return lang === 'en' ? helpContentEn : helpContentJa;
}
