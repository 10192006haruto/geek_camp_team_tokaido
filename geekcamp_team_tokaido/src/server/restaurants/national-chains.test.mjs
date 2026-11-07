import '../../../scripts/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { matchNationalChain, isNationalChain, normalizeShopName, NATIONAL_CHAIN_NAMES } = await import('./national-chains.ts');

test('typical Places names of national chains are matched at the start of the name', () => {
  for (const name of [
    'ケンタッキーフライドチキン グランスタ東京店', 'ケンタッキー 八重洲店', 'KFC Tokyo Station',
    'マクドナルド 東京駅八重洲店', "McDonald's Tokyo", 'スターバックス コーヒー グランスタ東京店',
    'スターバックスコーヒー丸の内店', 'ドトールコーヒーショップ 八重洲店', '吉野家 東京駅八重洲口店',
    '松屋 八重洲店', 'ガスト 東京駅前店', 'CoCo壱番屋 八重洲店', 'すき家 東京駅前店',
  ]) assert.ok(isNationalChain(name), name);
});

test('width, case and apostrophe variants are normalised', () => {
  for (const name of ['ＫＦＣ 東京駅店', 'kfc 東京駅店', 'McDonald’s 東京', 'ﾏｸﾄﾞﾅﾙﾄﾞ 東京駅店', 'ｽﾀｰﾊﾞｯｸｽ 丸の内']) {
    assert.ok(isNationalChain(name), name);
  }
  assert.equal(normalizeShopName('  ＫＦＣ　東京駅店 '), 'kfc 東京駅店');
});

test('short brand names need a boundary, so similar names are not excluded', () => {
  for (const name of ['ガストロノミー 東京', '松屋銀座', '牛角焼', 'てんやわんや食堂', 'ココスナック']) {
    assert.equal(matchNationalChain(name), null, name);
  }
  for (const name of ['ガスト', '松屋（八重洲店）', '牛角 東京駅前店', 'てんや・八重洲店']) {
    assert.ok(isNationalChain(name), name);
  }
});

test('local shops, regional chains and brand names in the middle are kept', () => {
  for (const name of [
    '崎陽軒 グランスタ東京店', '矢場とん 東京駅グランスタ店', '蕎麦29東京', '駅弁屋 祭 グランスタ東京',
    '【架空】ここメシ食堂', '東京駅前のマクドナルド風ハンバーガー店',
  ]) assert.equal(matchNationalChain(name), null, name);
});

test('the list has no blank or duplicate entries after normalisation', () => {
  const normalized = NATIONAL_CHAIN_NAMES.map(normalizeShopName);
  assert.ok(normalized.every((n) => n.length > 0));
  assert.equal(new Set(normalized).size, normalized.length);
});
