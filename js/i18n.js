// i18n.js - Internationalization (Japanese default, English switch)

const dict = {
  ja: {
    // Toolbar
    tools: 'ツール',
    select: '選択',
    member: '部材',
    surface: '面',
    snap: 'スナップ',
    grid: 'グリッド',
    activeLayer: 'レイヤー',
    draftMemberType: '部材種別',
    draftSurfaceType: '面種別',
    surfaceMode: '配置方法',
    rectMode: '矩形',
    polylineMode: 'ポリライン',
    loadDirection: '荷重方向',
    topLayer: '上端レイヤー',
    export: '保存',
    import: '読込',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    lang: 'EN',
    help: 'ヘルプ',
    settings: '設定',
    settingsTitle: '設定',
    themeLabel: 'テーマ',
    langLabel: '言語',
    layerManage: 'レイヤー管理',
    layerName: '名前',
    layerZ: '高さ (mm)',
    layerAdd: '追加',
    layerDelete: '削除',
    layerInUse: 'このレイヤーは使用中です（部材: {m}、面: {s}）。先に要素を削除またはレイヤー変更してください。',
    layerCannotDeleteLast: '最低1つのレイヤーが必要です。',
    layerDuplicateZ: 'この高さ(z値)は既に使用されています。',

    // Tabs
    tab2d: '2D CAD',
    tab3d: '3D 表示',

    // Status bar
    snapOn: 'スナップ: ON',
    snapOff: 'スナップ: OFF',
    toolSelect: 'ツール: 選択',
    toolMember: 'ツール: 部材',
    toolSurface: 'ツール: 面',

    // Property panel
    properties: 'プロパティ',
    noSelection: '未選択',
    propId: 'ID',
    propType: '種別',
    propLevel: 'レイヤー',
    propLayer: 'レイヤー',
    propWidthB: '幅 b (mm)',
    propHeightH: '高さ h (mm)',
    propMaterial: '材料',
    propColor: '色',
    propLength: '長さ',
    propArea: '面積',
    propVertices: '頂点数',
    beam: '梁',
    column: '柱',
    hbrace: '水平ブレース',
    vbrace: '垂直ブレース',
    brace: 'ブレース',
    floor: '床',
    wall: '壁',
    twoWay: '2方向',
    steel: '鉄骨',
    rc: 'RC',
    wood: '木造',

    // Import error
    importFailed: '読込失敗: ',

    // Help modal
    helpTitle: '簡易マニュアル',
    helpClose: '閉じる',
    helpContent: `
<h3>基本操作</h3>
<table>
  <tr><td><b>部材作成</b></td><td>「部材」ツール(Mキー)を選択し、キャンバス上で始点をクリック → 終点をクリック</td></tr>
  <tr><td><b>面作成</b></td><td>「面」ツール(Fキー)。矩形は対角2点、ポリラインは連続クリック→始点クリックまたはEnterで閉合</td></tr>
  <tr><td><b>選択</b></td><td>「選択」ツール(Vキー)で部材またはノードをクリック</td></tr>
  <tr><td><b>移動</b></td><td>選択後、ノードまたは部材をドラッグ</td></tr>
  <tr><td><b>削除</b></td><td>部材または面を選択してDeleteキー</td></tr>
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
  <tr><td><kbd>V</kbd></td><td>選択ツール</td></tr>
  <tr><td><kbd>M</kbd></td><td>部材ツール</td></tr>
  <tr><td><kbd>F</kbd></td><td>面ツール</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>面ポリラインを閉じて確定</td></tr>
  <tr><td><kbd>Esc</kbd></td><td>キャンセル / 選択解除 / モーダルを閉じる</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>選択部材/面を削除</td></tr>
  <tr><td><kbd>Ctrl+Z</kbd></td><td>元に戻す</td></tr>
  <tr><td><kbd>Ctrl+Y</kbd></td><td>やり直し</td></tr>
  <tr><td><kbd>Shift</kbd></td><td>角度制限（0/45/90°）</td></tr>
</table>

<h3>プロパティパネル</h3>
<p>部材/面を選択すると右パネルで以下を編集できます:</p>
<ul>
  <li><b>種別</b> - 梁 / 柱 / 水平ブレース / 垂直ブレース</li>
  <li><b>断面寸法</b> - 幅b, 高さh (mm)</li>
  <li><b>レイヤー</b> - GL/NFLなどの高さ管理 (z値)</li>
  <li><b>材料</b> - 鉄骨 / RC / 木造</li>
  <li><b>色</b> - 表示色</li>
</ul>
<p>床スラブは荷重方向（X/Y/2方向）を矢印で表示します。壁要素は平面上で少しオフセットして表示します。</p>

<h3>設定</h3>
<p>ツールバー上部の ⚙ 設定ボタンから設定モーダルを開きます。</p>
<ul>
  <li><b>テーマ</b> - ダーク / ライトを切替</li>
  <li><b>言語</b> - 日本語 / English を切替</li>
  <li><b>ヘルプ</b> - この簡易マニュアルを表示</li>
</ul>

<h3>レイヤー管理</h3>
<p>レイヤー選択横の ⚙ ボタンからレイヤー管理モーダルを開きます。</p>
<ul>
  <li><b>追加</b> - 新しいレイヤーを追加（z値は自動計算）</li>
  <li><b>編集</b> - レイヤー名とz値（高さ mm）を直接編集</li>
  <li><b>削除</b> - 未使用レイヤーのみ削除可能</li>
</ul>
<p>レイヤーはz値（高さ）の昇順で表示されます。同じz値のレイヤーは作成できません。</p>

<h3>データ入出力</h3>
<p>「保存」でJSONファイルをダウンロード、「読込」でJSONファイルを読み込みます。</p>
`,
  },

  en: {
    // Toolbar
    tools: 'Tools',
    select: 'Select',
    member: 'Member',
    surface: 'Surface',
    snap: 'Snap',
    grid: 'Grid',
    activeLayer: 'Layer',
    draftMemberType: 'Member Type',
    draftSurfaceType: 'Surface Type',
    surfaceMode: 'Placement',
    rectMode: 'Rectangle',
    polylineMode: 'Polyline',
    loadDirection: 'Load Dir',
    topLayer: 'Top Layer',
    export: 'Export',
    import: 'Import',
    themeDark: 'Dark',
    themeLight: 'Light',
    lang: 'JA',
    help: 'Help',
    settings: 'Settings',
    settingsTitle: 'Settings',
    themeLabel: 'Theme',
    langLabel: 'Language',
    layerManage: 'Layer Management',
    layerName: 'Name',
    layerZ: 'Height (mm)',
    layerAdd: 'Add',
    layerDelete: 'Delete',
    layerInUse: 'This layer is in use (members: {m}, surfaces: {s}). Remove or reassign them first.',
    layerCannotDeleteLast: 'At least one layer is required.',
    layerDuplicateZ: 'This height (z value) is already in use.',

    // Tabs
    tab2d: '2D CAD',
    tab3d: '3D View',

    // Status bar
    snapOn: 'Snap: ON',
    snapOff: 'Snap: OFF',
    toolSelect: 'Tool: Select',
    toolMember: 'Tool: Member',
    toolSurface: 'Tool: Surface',

    // Property panel
    properties: 'Properties',
    noSelection: 'No selection',
    propId: 'ID',
    propType: 'Type',
    propLevel: 'Layer',
    propLayer: 'Layer',
    propWidthB: 'Width b (mm)',
    propHeightH: 'Height h (mm)',
    propMaterial: 'Material',
    propColor: 'Color',
    propLength: 'Length',
    propArea: 'Area',
    propVertices: 'Vertices',
    beam: 'Beam',
    column: 'Column',
    hbrace: 'Horizontal Brace',
    vbrace: 'Vertical Brace',
    brace: 'Brace',
    floor: 'Floor',
    wall: 'Wall',
    twoWay: 'Two-way',
    steel: 'Steel',
    rc: 'RC',
    wood: 'Wood',

    // Import error
    importFailed: 'Import failed: ',

    // Help modal
    helpTitle: 'Quick Manual',
    helpClose: 'Close',
    helpContent: `
<h3>Basic Operations</h3>
<table>
  <tr><td><b>Create member</b></td><td>Select "Member" tool (M key), click start point → click end point</td></tr>
  <tr><td><b>Create surface</b></td><td>Use "Surface" (F). Rectangle: 2 diagonal points. Polyline: click points, then click first point or Enter to close</td></tr>
  <tr><td><b>Select</b></td><td>Use "Select" tool (V key), click a member or node</td></tr>
  <tr><td><b>Move</b></td><td>After selecting, drag a node or member</td></tr>
  <tr><td><b>Delete</b></td><td>Select a member or surface and press Delete key</td></tr>
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
  <tr><td><kbd>V</kbd></td><td>Select tool</td></tr>
  <tr><td><kbd>M</kbd></td><td>Member tool</td></tr>
  <tr><td><kbd>F</kbd></td><td>Surface tool</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>Close and confirm surface polyline</td></tr>
  <tr><td><kbd>Esc</kbd></td><td>Cancel / Deselect / Close modal</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>Delete selected member/surface</td></tr>
  <tr><td><kbd>Ctrl+Z</kbd></td><td>Undo</td></tr>
  <tr><td><kbd>Ctrl+Y</kbd></td><td>Redo</td></tr>
  <tr><td><kbd>Shift</kbd></td><td>Angle constraint (0/45/90°)</td></tr>
</table>

<h3>Property Panel</h3>
<p>Select a member/surface to edit in the right panel:</p>
<ul>
  <li><b>Type</b> - Beam / Column / Horizontal Brace / Vertical Brace</li>
  <li><b>Section</b> - Width b, Height h (mm)</li>
  <li><b>Layer</b> - Z-level by name and elevation (GL/NFL etc.)</li>
  <li><b>Material</b> - Steel / RC / Wood</li>
  <li><b>Color</b> - Display color</li>
</ul>
<p>Floor slabs can show load direction arrows (X/Y/Two-way). Wall surfaces are shown with a slight visual offset in plan.</p>

<h3>Settings</h3>
<p>Click the ⚙ Settings button at the top of the toolbar to open the settings modal.</p>
<ul>
  <li><b>Theme</b> - Switch between Dark / Light</li>
  <li><b>Language</b> - Switch between Japanese / English</li>
  <li><b>Help</b> - Opens this quick manual</li>
</ul>

<h3>Layer Management</h3>
<p>Click the ⚙ button next to the layer selector to open the layer management modal.</p>
<ul>
  <li><b>Add</b> - Add a new layer (z value auto-calculated)</li>
  <li><b>Edit</b> - Directly edit layer name and z value (height in mm)</li>
  <li><b>Delete</b> - Only unused layers can be deleted</li>
</ul>
<p>Layers are displayed sorted by z value (ascending). Duplicate z values are not allowed.</p>

<h3>Data I/O</h3>
<p>"Export" downloads a JSON file. "Import" loads a JSON file.</p>
`,
  },
};

let currentLang = 'ja';

export function setLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  localStorage.setItem('lineframe-lang', lang);
}

export function getLang() {
  return currentLang;
}

export function t(key) {
  return dict[currentLang]?.[key] ?? dict.ja[key] ?? key;
}

export function initLang() {
  const saved = localStorage.getItem('lineframe-lang') || 'ja';
  setLang(saved);
}
