// i18n.js - Internationalization (Japanese default, English switch)

const dict = {
  ja: {
    // Toolbar
    tools: 'ツール',
    select: '選択',
    member: '部材',
    snap: 'スナップ',
    grid: 'グリッド',
    export: '保存',
    import: '読込',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    lang: 'EN',
    help: 'ヘルプ',

    // Tabs
    tab2d: '2D CAD',
    tab3d: '3D 表示',

    // Status bar
    snapOn: 'スナップ: ON',
    snapOff: 'スナップ: OFF',
    toolSelect: 'ツール: 選択',
    toolMember: 'ツール: 部材',

    // Property panel
    properties: 'プロパティ',
    noSelection: '未選択',
    propId: 'ID',
    propType: '種別',
    propLevel: 'レベル',
    propWidthB: '幅 b (mm)',
    propHeightH: '高さ h (mm)',
    propMaterial: '材料',
    propColor: '色',
    propLength: '長さ',
    beam: '梁',
    column: '柱',
    brace: 'ブレース',
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
  <tr><td><b>選択</b></td><td>「選択」ツール(Vキー)で部材またはノードをクリック</td></tr>
  <tr><td><b>移動</b></td><td>選択後、ノードまたは部材をドラッグ</td></tr>
  <tr><td><b>削除</b></td><td>部材を選択してDeleteキー</td></tr>
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
  <tr><td><kbd>Esc</kbd></td><td>キャンセル / 選択解除</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>選択部材を削除</td></tr>
  <tr><td><kbd>Ctrl+Z</kbd></td><td>元に戻す</td></tr>
  <tr><td><kbd>Ctrl+Y</kbd></td><td>やり直し</td></tr>
  <tr><td><kbd>Shift</kbd></td><td>角度制限（0/45/90°）</td></tr>
</table>

<h3>プロパティパネル</h3>
<p>部材を選択すると右パネルで以下を編集できます:</p>
<ul>
  <li><b>種別</b> - 梁 / 柱 / ブレース</li>
  <li><b>断面寸法</b> - 幅b, 高さh (mm)</li>
  <li><b>レベル</b> - 3D表示時の高さ</li>
  <li><b>材料</b> - 鉄骨 / RC / 木造</li>
  <li><b>色</b> - 表示色</li>
</ul>

<h3>データ入出力</h3>
<p>「保存」でJSONファイルをダウンロード、「読込」でJSONファイルを読み込みます。</p>
`,
  },

  en: {
    // Toolbar
    tools: 'Tools',
    select: 'Select',
    member: 'Member',
    snap: 'Snap',
    grid: 'Grid',
    export: 'Export',
    import: 'Import',
    themeDark: 'Dark',
    themeLight: 'Light',
    lang: 'JA',
    help: 'Help',

    // Tabs
    tab2d: '2D CAD',
    tab3d: '3D View',

    // Status bar
    snapOn: 'Snap: ON',
    snapOff: 'Snap: OFF',
    toolSelect: 'Tool: Select',
    toolMember: 'Tool: Member',

    // Property panel
    properties: 'Properties',
    noSelection: 'No selection',
    propId: 'ID',
    propType: 'Type',
    propLevel: 'Level',
    propWidthB: 'Width b (mm)',
    propHeightH: 'Height h (mm)',
    propMaterial: 'Material',
    propColor: 'Color',
    propLength: 'Length',
    beam: 'Beam',
    column: 'Column',
    brace: 'Brace',
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
  <tr><td><b>Select</b></td><td>Use "Select" tool (V key), click a member or node</td></tr>
  <tr><td><b>Move</b></td><td>After selecting, drag a node or member</td></tr>
  <tr><td><b>Delete</b></td><td>Select a member and press Delete key</td></tr>
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
  <tr><td><kbd>Esc</kbd></td><td>Cancel / Deselect</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>Delete selected member</td></tr>
  <tr><td><kbd>Ctrl+Z</kbd></td><td>Undo</td></tr>
  <tr><td><kbd>Ctrl+Y</kbd></td><td>Redo</td></tr>
  <tr><td><kbd>Shift</kbd></td><td>Angle constraint (0/45/90°)</td></tr>
</table>

<h3>Property Panel</h3>
<p>Select a member to edit in the right panel:</p>
<ul>
  <li><b>Type</b> - Beam / Column / Brace</li>
  <li><b>Section</b> - Width b, Height h (mm)</li>
  <li><b>Level</b> - Height for 3D display</li>
  <li><b>Material</b> - Steel / RC / Wood</li>
  <li><b>Color</b> - Display color</li>
</ul>

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
