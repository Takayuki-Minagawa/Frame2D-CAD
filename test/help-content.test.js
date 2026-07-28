import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getHelpContent, helpContentJa, helpContentEn } from '../js/help-content.js';

test('README and in-app help document the roof workflow', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const helpContent = await readFile(new URL('../js/help-content.js', import.meta.url), 'utf8');
  const i18n = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');

  assert.match(readme, /## Roof Workflow/);
  assert.match(readme, /roofGroupId/);
  assert.match(readme, /棟\/谷\/隅木/);
  assert.match(readme, /外周庇/);
  assert.match(readme, /切妻X棟/);
  assert.match(readme, /軸に平行な矩形輪郭/);
  assert.match(readme, /共有辺の高さ不一致/);
  assert.match(readme, /屋根部材の役割別本数・延長/);
  assert.match(readme, /面材明細と屋根部材明細/);
  assert.match(readme, /数量CSV\/詳細CSV出力/);

  assert.match(helpContent, /<h3>屋根入力ワークフロー<\/h3>/);
  assert.match(helpContent, /<h3>Roof Workflow<\/h3>/);
  assert.match(helpContent, /roofGroupId/);
  assert.match(helpContent, /single-plane, X-ridge gable, Y-ridge gable, and hip presets/);
  assert.match(helpContent, /Generate ridge\/valley\/hip members/);
  assert.match(i18n, /Generate Eaves/);
  assert.match(helpContent, /generate eaves and gable walls/);
  assert.match(helpContent, /共有辺高さ不一致/);
  assert.match(helpContent, /summary\/detail CSV files/);
});

test('getHelpContent returns the language-specific help HTML', () => {
  assert.equal(getHelpContent('ja'), helpContentJa);
  assert.equal(getHelpContent('en'), helpContentEn);
  assert.equal(getHelpContent('unknown'), helpContentJa);
  assert.match(helpContentJa, /<h3>基本操作<\/h3>/);
  assert.match(helpContentEn, /<h3>Basic Operations<\/h3>/);
});

test('in-app help documents the enhanced initial grid frame workflow', () => {
  assert.match(helpContentJa, /繰り返し記法 <code>N@L<\/code>/);
  assert.match(helpContentJa, /<code>3@6000, 5000<\/code>/);
  assert.match(helpContentJa, /階数に応じて階別設定テーブルの行が増減します/);
  assert.match(helpContentJa, /柱断面・梁断面・床断面・外壁断面を現在のモデルの断面カタログから選択/);
  assert.match(helpContentJa, /「一括」行/);
  assert.match(helpContentJa, /一括欄は反映後に空欄へ戻る/);
  assert.match(helpContentJa, /柱・梁の少なくとも一方を ON/);
  assert.match(helpContentJa, /外壁は各階の外周に1枚の多角形面材として生成/);
  assert.match(helpContentJa, /「床」「外壁」チェックは既定で OFF/);
  assert.match(helpContentJa, /旧形式で保存された入力値・プリセットも自動変換/);
  assert.match(helpContentJa, /名前付きプリセットは最大20件/);
  assert.match(helpContentJa, /柱・梁・床・外壁の件数/);

  assert.match(helpContentEn, /<code>N@L<\/code> repeat notation/);
  assert.match(helpContentEn, /<code>3@6000, 5000<\/code>/);
  assert.match(helpContentEn, /set the number of stories/);
  assert.match(helpContentEn, /current model's section catalog/);
  assert.match(helpContentEn, /The "All" row at the top/);
  assert.match(helpContentEn, /clears itself after applying/);
  assert.match(helpContentEn, /At least one of columns or beams must be enabled/);
  assert.match(helpContentEn, /one perimeter polygon surface per story/);
  assert.match(helpContentEn, /The "Floors" and "Exterior walls" checkboxes are OFF by default/);
  assert.match(helpContentEn, /converted automatically/);
  assert.match(helpContentEn, /up to 20 named presets/);
  assert.match(helpContentEn, /column, beam, floor, and exterior wall counts/);
});

test('in-app help explains member join and split workflows', () => {
  assert.match(helpContentJa, /<b>線材の連結<\/b>/);
  assert.match(helpContentJa, /断面が異なる場合は連結後の断面を選択/);
  assert.match(helpContentJa, /梁は部材上の分割点をクリック（Escでキャンセル）、柱は中間レイヤーを選択/);
  assert.match(helpContentEn, /<b>Join members<\/b>/);
  assert.match(helpContentEn, /If their sections differ, select the section for the joined member/);
  assert.match(helpContentEn, /For a beam, click the split point on the member \(Esc cancels\)/);
});
