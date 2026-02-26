// i18n.js - Internationalization (Japanese default, English switch)

const dict = {
  ja: {
    // Toolbar
    tools: 'ツール',
    select: '選択',
    selectTool: '選択',
    member: '線材',
    surface: '面材',
    load: '荷重',
    toolLabel: '要素',
    snap: 'スナップ',
    grid: 'グリッド',
    activeLayer: 'レイヤー',
    draftMemberType: '線材種別',
    draftSurfaceType: '面材種別',
    surfaceMode: '形状',
    rectMode: '矩形',
    polylineMode: 'ポリライン',
    loadDirection: '支持方向',
    topLayer: '上端レイヤー',
    export: 'CAD保存',
    import: 'CAD読込',
    cadExported: 'CADデータを保存しました。',
    cadImported: 'CADデータを読み込みました。',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    lang: 'EN',
    help: 'ヘルプ',
    settings: '設定',
    settingsTitle: '設定',
    themeLabel: 'テーマ',
    langLabel: '言語',
    userDefManage: 'ユーザー定義',
    userDefTitle: 'ユーザー定義',
    layerManage: 'レイヤー管理',
    layerName: '名前',
    layerZ: '高さ (mm)',
    layerAdd: '追加',
    layerDelete: '削除',
    layerInUse: 'このレイヤーは使用中です（線材: {m}、面材: {s}）。先に要素を削除またはレイヤー変更してください。',
    layerCannotDeleteLast: '最低1つのレイヤーが必要です。',
    layerDuplicateZ: 'この高さ(z値)は既に使用されています。',
    noLevelAbove: '現在のレイヤーより上にレイヤーがありません。レイヤー管理で追加してください。',
    bracePattern: 'ブレースパターン',
    braceSingle: 'シングル',
    braceCross: '襷掛け',
    hbraceNeedsDiagonal: '水平ブレースは斜め配置のみ可能です（X軸・Y軸に平行な配置はできません）。',
    exteriorWallConfirmReplace: 'このレイヤーには既に外壁線があります。既存の外壁線を削除して新しく入力しますか？',

    // Tabs
    tab2d: '2D CAD',
    tab3d: '3D 表示',

    // Status bar
    snapOn: 'スナップ: ON',
    snapOff: 'スナップ: OFF',
    toolSelect: 'ツール: 要素',
    toolMember: 'ツール: 線材',
    toolSurface: 'ツール: 面材',
    toolLoad: 'ツール: 荷重',

    // Property panel
    properties: 'プロパティ',
    noSelection: '未選択',
    propId: 'ID',
    propType: '種別',
    propLevel: 'レイヤー',
    propLayer: 'レイヤー',
    propSection: '断面',
    propWidthB: '幅 b (mm)',
    propHeightH: '高さ h (mm)',
    propMaterial: '材料',
    propEndI: 'I端部',
    propEndJ: 'J端部',
    propSpringSymbol: 'バネ記号',
    propStartPoint: '始点',
    propEndPoint: '終点',
    propColor: '色',
    propLength: '長さ',
    propArea: '面積',
    propVertices: '頂点数',
    userDefOpen: 'ユーザー定義を追加',
    userDefKind: '定義種別',
    userDefSection: '断面定義',
    userDefSpring: 'バネ定義',
    userDefTarget: '対象',
    userDefTargetMember: '線材',
    userDefTargetSurface: '面材',
    userDefType: '種別',
    userDefName: '名称',
    userDefColor: '色',
    userDefWidthB: '幅 b (mm)',
    userDefHeightH: '高さ h (mm)',
    userDefMemo: 'メモ',
    userDefListOpen: '同グループ一覧',
    userDefListTitle: '同グループ定義一覧',
    userDefListNoItems: '該当する定義はありません。',
    userDefListGroup: 'グループ',
    userDefListColName: '名称',
    userDefListColMaterial: '材料',
    userDefListColB: '幅 b',
    userDefListColH: '高さ h',
    userDefListColColor: '色',
    userDefListColMemo: 'メモ',
    userDefListColDefault: '既定',
    userDefListColAction: '操作',
    userDefDefaultFlag: '既定',
    userDefCustomFlag: 'ユーザー',
    userDefAdd: '追加',
    userDefUpdate: '更新',
    userDefUpdated: '更新しました。',
    userDefDelete: '削除',
    userDefDeleted: '削除しました。',
    userDefDeleteConfirm: '「{name}」を削除します。よろしいですか？',
    userDefInvalidSize: '幅と高さは正の数値で入力してください。',
    userDefNoLeadingUnderscore: 'ユーザー定義名の先頭に「_」は使用できません。',
    userDefAddFailed: '追加できません。名称重複または入力値を確認してください。',
    userDefUpdateFailed: '更新できません。入力値を確認してください。',
    userDefDeleteFailed: '削除できません。既定値または使用中の定義の可能性があります。',
    userDefAdded: '追加しました。',
    endPin: 'ピン',
    endRigid: '剛',
    endSpring: 'バネ',
    beam: '梁',
    column: '柱',
    hbrace: '水平ブレース',
    vbrace: '垂直ブレース',
    brace: 'ブレース',
    floor: '床',
    exteriorWall: '外壁',
    wall: '壁',
    twoWay: '2方向',
    steel: '鉄骨',
    rc: 'RC',
    wood: '木造',

    // Load types
    draftLoadType: '荷重種別',
    areaLoad: '面荷重',
    lineLoad: '線荷重',
    pointLoad: '点荷重',
    loadValue: '荷重値',
    loadUnit_area: 'N/m²',
    loadUnit_line: 'N/m',

    // Support
    support: '支点',
    toolSupport: 'ツール: 支点',
    supportType: '支点',
    supportPos: '位置',
    supportTranslation: '並進拘束',
    supportRotation: '回転拘束',
    supportPin: 'ピン',
    supportRigid: '剛',
    supportFree: '全解除',

    // User definition export/import
    userDefExport: 'エクスポート',
    userDefImport: 'インポート',
    userDefExported: 'ユーザー定義をエクスポートしました。',
    userDefExportEmpty: 'エクスポート対象のユーザー定義がありません。',
    userDefImported: '{n}件のユーザー定義をインポートしました。',
    userDefImportedWithSkip: '{n}件をインポートしました（{s}件は同名の定義が既にあるためスキップ）。',
    userDefImportAllSkipped: 'すべての定義が同名の既存定義と重複するためスキップされました（{s}件）。',
    userDefImportFailed: 'インポートに失敗しました: ',
    userDefImportNone: 'インポート可能な定義がありませんでした。',

    // 3D viewer
    viewer3dLoadFailed: '3Dビューアの読み込みに失敗しました。',

    // Import error
    importFailed: '読込失敗: ',

    // Help modal
    helpTitle: '簡易マニュアル',
    helpClose: '閉じる',
    helpContent: `
<h3>基本操作</h3>
<table>
  <tr><td><b>線材作成</b></td><td>「線材」ツール(Mキー)を選択し、キャンバス上で始点をクリック → 終点をクリック</td></tr>
  <tr><td><b>面材作成</b></td><td>「面材」ツール(Fキー)。矩形は対角2点、ポリラインは連続クリック→始点クリックまたはEnterで閉合</td></tr>
  <tr><td><b>荷重作成</b></td><td>「荷重」ツール(Lキー)。面荷重は矩形2点、線荷重は線分2点、点荷重は1点クリック</td></tr>
  <tr><td><b>支点配置</b></td><td>「支点」ツール(Sキー)でキャンバス上をクリック。プロパティパネルで6自由度(DX/DY/DZ/RX/RY/RZ)を設定</td></tr>
  <tr><td><b>選択</b></td><td>「要素」ツール(Vキー)で線材・面材・荷重・支点をクリック</td></tr>
  <tr><td><b>移動</b></td><td>選択後、ノードまたは線材をドラッグ</td></tr>
  <tr><td><b>削除</b></td><td>要素を選択してDeleteキー</td></tr>
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
  <li><b>線材</b> - 断面 / 端部(I/J) / バネ記号（バネ時）</li>
  <li><b>面材</b> - 断面 / 荷重方向（床のみ）</li>
  <li><b>荷重</b> - 種別 / 座標 / 荷重値(面・線) / 力・モーメント(点) / 色</li>
  <li><b>支点</b> - 位置(X,Y) / 並進拘束(DX,DY,DZ) / 回転拘束(RX,RY,RZ) / プリセット(ピン/剛/全解除)</li>
</ul>
<p>種別・レイヤー・幅/高さ・色は表示専用です。断面を変更すると寸法と色が自動反映され、外壁を含む面材の色は平面図と3D表示へ連動します。</p>

<h3>設定 / ユーザー定義</h3>
<p>ツールバー上部の ⚙ 設定ボタンから設定モーダルを開きます。</p>
<ul>
  <li><b>テーマ</b> - ダーク / ライトを切替</li>
  <li><b>言語</b> - 日本語 / English を切替</li>
  <li><b>ユーザー定義</b> - 断面定義 / バネ定義を追加・管理</li>
  <li><b>ヘルプ</b> - この簡易マニュアルを表示</li>
</ul>
<p>既定の断面・バネ（例: <code>_G</code>, <code>_C</code>, <code>_S</code>, <code>_OW</code>, <code>_IW</code>, <code>_SP</code>）は編集・削除できません。ユーザー定義名の先頭に <code>_</code> は使えません。登録後は名前以外の項目（寸法・色・メモ）を更新でき、ユーザー定義は削除可能です（使用中の定義は削除できません）。</p>
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
<p>CADデータ（図面情報）とユーザー定義（断面・バネ）は<b>別ファイルとして分離管理</b>されます。</p>
<table>
  <tr><td><b>CAD保存</b></td><td>ツールバーの「CAD保存」で図面データをJSONファイルとしてダウンロード。カスタムユーザー定義は含まれません</td></tr>
  <tr><td><b>CAD読込</b></td><td>ツールバーの「CAD読込」でJSONファイルを読み込み。既にロード済みのカスタム定義は維持されます</td></tr>
  <tr><td><b>定義エクスポート</b></td><td>設定 → ユーザー定義 →「エクスポート」でカスタム定義を別ファイルに保存</td></tr>
  <tr><td><b>定義インポート</b></td><td>設定 → ユーザー定義 →「インポート」で別環境のカスタム定義を読み込み</td></tr>
</table>
<p>部材IDは内部管理用で、CADファイルには含まれません。旧バージョンで保存されたファイルも読み込めます。</p>
<p><b>推奨ワークフロー:</b> ユーザー定義をインポート → CADデータを読込</p>
`,
  },

  en: {
    // Toolbar
    tools: 'Tools',
    select: 'Select',
    selectTool: 'Select',
    member: 'Line',
    surface: 'Surface',
    load: 'Load',
    toolLabel: 'Element',
    snap: 'Snap',
    grid: 'Grid',
    activeLayer: 'Layer',
    draftMemberType: 'Line Type',
    draftSurfaceType: 'Surface Type',
    surfaceMode: 'Shape',
    rectMode: 'Rectangle',
    polylineMode: 'Polyline',
    loadDirection: 'Support Dir',
    topLayer: 'Top Layer',
    export: 'Save CAD',
    import: 'Load CAD',
    cadExported: 'CAD data saved.',
    cadImported: 'CAD data loaded.',
    themeDark: 'Dark',
    themeLight: 'Light',
    lang: 'JA',
    help: 'Help',
    settings: 'Settings',
    settingsTitle: 'Settings',
    themeLabel: 'Theme',
    langLabel: 'Language',
    userDefManage: 'User Definitions',
    userDefTitle: 'User Definitions',
    layerManage: 'Layer Management',
    layerName: 'Name',
    layerZ: 'Height (mm)',
    layerAdd: 'Add',
    layerDelete: 'Delete',
    layerInUse: 'This layer is in use (lines: {m}, surfaces: {s}). Remove or reassign them first.',
    layerCannotDeleteLast: 'At least one layer is required.',
    layerDuplicateZ: 'This height (z value) is already in use.',
    noLevelAbove: 'No layer above the current layer. Please add one in Layer Management.',
    bracePattern: 'Brace Pattern',
    braceSingle: 'Single',
    braceCross: 'Cross (X)',
    hbraceNeedsDiagonal: 'Horizontal braces must be placed diagonally (cannot be parallel to X or Y axis).',
    exteriorWallConfirmReplace: 'An exterior wall line already exists on this layer. Delete it and start new input?',

    // Tabs
    tab2d: '2D CAD',
    tab3d: '3D View',

    // Status bar
    snapOn: 'Snap: ON',
    snapOff: 'Snap: OFF',
    toolSelect: 'Tool: Element',
    toolMember: 'Tool: Line',
    toolSurface: 'Tool: Surface',
    toolLoad: 'Tool: Load',

    // Property panel
    properties: 'Properties',
    noSelection: 'No selection',
    propId: 'ID',
    propType: 'Type',
    propLevel: 'Layer',
    propLayer: 'Layer',
    propSection: 'Section',
    propWidthB: 'Width b (mm)',
    propHeightH: 'Height h (mm)',
    propMaterial: 'Material',
    propEndI: 'I End',
    propEndJ: 'J End',
    propSpringSymbol: 'Spring Symbol',
    propStartPoint: 'Start',
    propEndPoint: 'End',
    propColor: 'Color',
    propLength: 'Length',
    propArea: 'Area',
    propVertices: 'Vertices',
    userDefOpen: 'Add User Definition',
    userDefKind: 'Definition Type',
    userDefSection: 'Section Definition',
    userDefSpring: 'Spring Definition',
    userDefTarget: 'Target',
    userDefTargetMember: 'Line',
    userDefTargetSurface: 'Surface',
    userDefType: 'Type',
    userDefName: 'Name',
    userDefColor: 'Color',
    userDefWidthB: 'Width b (mm)',
    userDefHeightH: 'Height h (mm)',
    userDefMemo: 'Memo',
    userDefListOpen: 'View Group List',
    userDefListTitle: 'Definition List (Group)',
    userDefListNoItems: 'No definitions in this group.',
    userDefListGroup: 'Group',
    userDefListColName: 'Name',
    userDefListColMaterial: 'Material',
    userDefListColB: 'Width b',
    userDefListColH: 'Height h',
    userDefListColColor: 'Color',
    userDefListColMemo: 'Memo',
    userDefListColDefault: 'Type',
    userDefListColAction: 'Action',
    userDefDefaultFlag: 'Default',
    userDefCustomFlag: 'User',
    userDefAdd: 'Add',
    userDefUpdate: 'Update',
    userDefUpdated: 'Updated.',
    userDefDelete: 'Delete',
    userDefDeleted: 'Deleted.',
    userDefDeleteConfirm: 'Delete \"{name}\"?',
    userDefInvalidSize: 'Width and height must be positive values.',
    userDefNoLeadingUnderscore: 'User-defined names cannot start with \"_\".',
    userDefAddFailed: 'Could not add. Check duplicate names or input values.',
    userDefUpdateFailed: 'Could not update. Check input values.',
    userDefDeleteFailed: 'Could not delete. The definition may be default or currently in use.',
    userDefAdded: 'Added.',
    endPin: 'Pinned',
    endRigid: 'Rigid',
    endSpring: 'Spring',
    beam: 'Beam',
    column: 'Column',
    hbrace: 'Horizontal Brace',
    vbrace: 'Vertical Brace',
    brace: 'Brace',
    floor: 'Floor',
    exteriorWall: 'Exterior Wall',
    wall: 'Wall',
    twoWay: 'Two-way',
    steel: 'Steel',
    rc: 'RC',
    wood: 'Wood',

    // Load types
    draftLoadType: 'Load Type',
    areaLoad: 'Area Load',
    lineLoad: 'Line Load',
    pointLoad: 'Point Load',
    loadValue: 'Load Value',
    loadUnit_area: 'N/m²',
    loadUnit_line: 'N/m',

    // Support
    support: 'Support',
    toolSupport: 'Tool: Support',
    supportType: 'Support',
    supportPos: 'Position',
    supportTranslation: 'Translation',
    supportRotation: 'Rotation',
    supportPin: 'Pin',
    supportRigid: 'Rigid',
    supportFree: 'Free',

    // User definition export/import
    userDefExport: 'Export',
    userDefImport: 'Import',
    userDefExported: 'User definitions exported.',
    userDefExportEmpty: 'No user definitions to export.',
    userDefImported: '{n} user definition(s) imported.',
    userDefImportedWithSkip: '{n} imported ({s} skipped due to duplicate names).',
    userDefImportAllSkipped: 'All definitions skipped due to duplicate names ({s}).',
    userDefImportFailed: 'Import failed: ',
    userDefImportNone: 'No importable definitions found.',

    // 3D viewer
    viewer3dLoadFailed: 'Failed to load 3D viewer.',

    // Import error
    importFailed: 'Import failed: ',

    // Help modal
    helpTitle: 'Quick Manual',
    helpClose: 'Close',
    helpContent: `
<h3>Basic Operations</h3>
<table>
  <tr><td><b>Create line</b></td><td>Select "Line" tool (M key), click start point → click end point</td></tr>
  <tr><td><b>Create surface</b></td><td>Use "Surface" (F). Rectangle: 2 diagonal points. Polyline: click points, then click first point or Enter to close</td></tr>
  <tr><td><b>Create load</b></td><td>Use "Load" (L). Area load: 2-point rectangle. Line load: 2-point line. Point load: single click</td></tr>
  <tr><td><b>Place support</b></td><td>Use "Support" (S). Click to place. Edit 6 DOFs (DX/DY/DZ/RX/RY/RZ) in the property panel</td></tr>
  <tr><td><b>Select</b></td><td>Use "Element" tool (V key), click a line/surface/load/support element</td></tr>
  <tr><td><b>Move</b></td><td>After selecting, drag a node or line element</td></tr>
  <tr><td><b>Delete</b></td><td>Select an element and press Delete key</td></tr>
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
  <li><b>Line</b> - Section / End condition (I/J) / Spring symbol (when spring)</li>
  <li><b>Surface</b> - Section / Load direction (floor only)</li>
  <li><b>Load</b> - Type / Coordinates / Value (area/line) / Force &amp; Moment (point) / Color</li>
  <li><b>Support</b> - Position (X,Y) / Translation (DX,DY,DZ) / Rotation (RX,RY,RZ) / Presets (Pin/Rigid/Free)</li>
</ul>
<p>Type, layer, width/height, and color are display-only. Changing section automatically updates dimensions and color, including surface color sync in both plan and 3D views.</p>

<h3>Settings / User Definitions</h3>
<p>Click the ⚙ Settings button at the top of the toolbar to open the settings modal.</p>
<ul>
  <li><b>Theme</b> - Switch between Dark / Light</li>
  <li><b>Language</b> - Switch between Japanese / English</li>
  <li><b>User Definitions</b> - Add/manage section and spring definitions</li>
  <li><b>Help</b> - Opens this quick manual</li>
</ul>
<p>Default definitions (for example <code>_G</code>, <code>_C</code>, <code>_S</code>, <code>_OW</code>, <code>_IW</code>, <code>_SP</code>) cannot be edited or deleted. Custom names cannot start with <code>_</code>. After registration, fields other than name can be updated (size, color, memo), and custom definitions can be deleted unless they are currently in use.</p>
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
<p>CAD data (drawing) and user definitions (sections/springs) are <b>managed as separate files</b>.</p>
<table>
  <tr><td><b>Save CAD</b></td><td>Click "Save CAD" in the toolbar to download drawing data as JSON. Custom user definitions are not included</td></tr>
  <tr><td><b>Load CAD</b></td><td>Click "Load CAD" in the toolbar to load a JSON file. Existing custom definitions in memory are preserved</td></tr>
  <tr><td><b>Export Defs</b></td><td>Settings → User Definitions → "Export" to save custom definitions to a separate file</td></tr>
  <tr><td><b>Import Defs</b></td><td>Settings → User Definitions → "Import" to load custom definitions from another environment</td></tr>
</table>
<p>Member IDs are internal and are not written to CAD files. Files saved with older versions can still be loaded.</p>
<p><b>Recommended workflow:</b> Import user definitions → Load CAD data</p>
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
