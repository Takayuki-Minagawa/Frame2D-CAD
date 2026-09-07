// Feature-local messages keep diagnostics independent of the application dictionary.
const messages = {
  en: {
    'duplicate-level-z': 'Level {name} has the same elevation as {other}.',
    'missing-node': 'Member {id} references a missing node.',
    'missing-level': '{type} {id} references a missing base level.',
    'missing-top-level': '{type} {id} references a missing top level.',
    'zero-length-member': 'Member {id} has zero length.',
    'missing-section': '{type} {id} references missing section {section}.',
    'same-top-level': 'Member {id} has identical base and top levels.',
    'orphan-node': 'Node {id} is not connected to a member.',
    'duplicate-member': 'Member {id} duplicates {other}.',
    'zero-area-surface': 'Surface {id} has zero area.',
    all: 'All', severity: 'Severity', elementType: 'Type', error: 'Error', warning: 'Warning', info: 'Info',
    member: 'Member', surface: 'Surface', node: 'Node', level: 'Level', load: 'Load', support: 'Support',
    count: '{shown} / {total} issues', noMatches: 'No issues match these filters.',
    hidden: 'Hidden target: selecting reveals its level and display filters.',
    otherLevel: 'Selecting switches to the target level.', missingTarget: 'Target no longer exists.',
  },
  ja: {
    'duplicate-level-z': '階 {name} は {other} と同じz値です',
    'missing-node': '線材 {id} の参照ノードが見つかりません',
    'missing-level': '{type} {id} の管理レイヤーが見つかりません',
    'missing-top-level': '{type} {id} の上端レイヤーが見つかりません',
    'zero-length-member': '線材 {id} の長さが0です',
    'missing-section': '{type} {id} の断面 {section} が見つかりません',
    'same-top-level': '線材 {id} の下端/上端レイヤーが同一です',
    'orphan-node': '孤立ノード {id} があります',
    'duplicate-member': '線材 {id} は {other} と重複しています',
    'zero-area-surface': '面材 {id} の面積が0です',
    all: 'すべて', severity: '重要度', elementType: '種別', error: 'エラー', warning: '警告', info: '情報',
    member: '線材', surface: '面材', node: 'ノード', level: '階', load: '荷重', support: '支点',
    count: '{shown} / {total} 件', noMatches: '条件に一致する診断はありません',
    hidden: '非表示の対象：選択すると対象階と表示条件を切り替えます',
    otherLevel: '選択すると対象の階に切り替えます', missingTarget: '対象は既に削除されています',
  },
};
export function diagnosticText(key, lang = 'ja', params = {}) {
  const dict = messages[lang] || messages.en;
  return (dict[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
}
export function formatDiagnostic(issue, lang = 'ja', translate = key => key) {
  if (!issue.messageKey?.startsWith('diagnostic.')) {
    return issue.messageKey ? translate(issue.messageKey, issue.params) : issue.message || issue.code;
  }
  return diagnosticText(issue.messageKey.slice(11), lang, {
    ...issue.params, type: diagnosticText(issue.params?.type || issue.elementType || '', lang),
  });
}
