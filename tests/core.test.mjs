/*
 * core.test.mjs — コアJSの単体テスト（設計書v1.0 8章）
 * 実行: node site/tests/core.test.mjs
 * 対象: util(norm/normSearch/safeUrl/imageUrl) ・ search.run ・ data(gvizパース/ヘッダー解決/ID重複先勝ち)
 * CJS(.js)を .mjs から default import（Nodeのinterop: default = module.exports）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import util from '../assets/js/util.js';
import search from '../assets/js/search.js';
import data from '../assets/js/data.js';
import facets from '../assets/js/facets.js';
import seo from '../assets/js/seo.js';
import * as sitemap from '../tools/gen_sitemap.mjs';

// texts-default.js はブラウザ専用（window.TS.textsDefault に代入するだけ）なので、
// 疑似ブラウザ文脈で1回だけ評価して既定文言を取り出す（本体ファイルは改造しない）。
const textsDefault = (() => {
  const src = fs.readFileSync(fileURLToPath(new URL('../assets/js/texts-default.js', import.meta.url)), 'utf8');
  const ctx = {};
  ctx.window = ctx; // ブラウザと同じく window === グローバル
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.TS.textsDefault;
})();

let pass = 0, fail = 0;
const results = [];
function t(name, fn) {
  try { fn(); pass++; results.push('PASS ' + name); }
  catch (e) { fail++; results.push('FAIL ' + name + '  -> ' + (e && e.message ? e.message : e)); }
}

// ===== util: norm / normSearch（NFKC・かな折りたたみ） =====
t('norm: 全角英数→半角 + トリム', () => {
  assert.equal(util.norm('　ＡＢ１２３　'), 'AB123');
});
t('norm: 半角カナ→全角(NFKC)', () => {
  assert.equal(util.norm('ｶﾞﾊﾟｵ'), 'ガパオ');
});
t('normSearch: ひらがな→カタカナ折りたたみ（がぱお=ガパオ）', () => {
  assert.equal(util.normSearch('がぱお'), util.normSearch('ガパオ'));
});
t('normSearch: 英字は小文字化', () => {
  assert.equal(util.normSearch('ThaiSPOT'), 'thaispot');
});

// ===== util: safeUrl（悪性入力） =====
t('safeUrl: https は許可', () => {
  assert.equal(util.safeUrl('https://ok.example.com/a-b_c?x=1'), 'https://ok.example.com/a-b_c?x=1');
});
t('safeUrl: 前後空白はトリムして許可', () => {
  assert.equal(util.safeUrl('   https://ok.example.com   '), 'https://ok.example.com');
});
t('safeUrl: javascript: は null', () => {
  assert.equal(util.safeUrl('javascript:alert(1)'), null);
});
t('safeUrl: java<TAB>script: (スキーム分断) は null', () => {
  assert.equal(util.safeUrl('java\tscript:alert(1)'), null);
});
t('safeUrl: 制御文字混入 java<改行>script: は null', () => {
  assert.equal(util.safeUrl('java\nscript:alert(1)'), null);
});
t('safeUrl: data:text/html は null', () => {
  assert.equal(util.safeUrl('data:text/html;base64,PHNjcmlwdD4='), null);
});
t('safeUrl: //evil は null（スキーム無し）', () => {
  assert.equal(util.safeUrl('//evil.example.com'), null);
});
t('safeUrl: 先頭に空白/制御文字(NUL)を混ぜた https も除去後に許可', () => {
  const injected = ' 	' + String.fromCharCode(0) + 'https://ok.example.com';
  assert.equal(util.safeUrl(injected), 'https://ok.example.com');
})
t('safeUrl: data:image は image オプション時のみ許可', () => {
  assert.equal(util.safeUrl('data:image/png;base64,iVBORw0KGgo=', { image: true }), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(util.safeUrl('data:image/png;base64,iVBORw0KGgo='), null); // 通常は不許可
});
// 実装設計書13-I-8: 制御文字は全位置除去・可視スペースは端のみtrim・内部に可視スペースが残る値はnull
t('safeUrl: 内部の半角スペースは静かな書き換えをせずnull', () => {
  assert.equal(util.safeUrl('https://ok.example.com/a b'), null);
});
t('safeUrl: 内部の全角スペースも同様にnull', () => {
  assert.equal(util.safeUrl('https://ok.example.com/a　b'), null);
});
t('safeUrl: 前後の全角スペースはtrimして許可（端は許可のまま維持）', () => {
  assert.equal(util.safeUrl('　https://ok.example.com　'), 'https://ok.example.com');
});

// ===== util: normalizeWalkMinutes（実装設計書13-I-7・徒歩分数の非数値混入） =====
t('normalizeWalkMinutes: 半角数字はそのまま許可', () => {
  assert.equal(util.normalizeWalkMinutes('5'), '5');
});
t('normalizeWalkMinutes: 全角数字は半角化して許可', () => {
  assert.equal(util.normalizeWalkMinutes('５'), '5');
});
t('normalizeWalkMinutes: 非数値混入（約5分等）はnull（表示自体を省略）', () => {
  assert.equal(util.normalizeWalkMinutes('約5分'), null);
  assert.equal(util.normalizeWalkMinutes('5分'), null);
  assert.equal(util.normalizeWalkMinutes(''), null);
  assert.equal(util.normalizeWalkMinutes(null), null);
});

// ===== util: imageUrl（Drive5形式 + 通常URL + 不正値） =====
const DID = '1AbcDEF_ghiJKLmno-pqrs123456';
const THUMB = 'https://drive.google.com/thumbnail?id=' + DID + '&sz=w800';
t('imageUrl: file/d/{id}/view → thumbnail w800', () => {
  assert.deepEqual(util.imageUrl('https://drive.google.com/file/d/' + DID + '/view'), { src: THUMB, ok: true });
});
t('imageUrl: open?id= → thumbnail w800', () => {
  assert.deepEqual(util.imageUrl('https://drive.google.com/open?id=' + DID), { src: THUMB, ok: true });
});
t('imageUrl: uc?id= → thumbnail w800', () => {
  assert.deepEqual(util.imageUrl('https://drive.google.com/uc?export=view&id=' + DID), { src: THUMB, ok: true });
});
t('imageUrl: thumbnail?id= → thumbnail w800', () => {
  assert.deepEqual(util.imageUrl('https://drive.google.com/thumbnail?id=' + DID), { src: THUMB, ok: true });
});
t('imageUrl: id単体 → thumbnail w800', () => {
  assert.deepEqual(util.imageUrl(DID), { src: THUMB, ok: true });
});
t('imageUrl: 通常の画像直URLはそのまま', () => {
  assert.deepEqual(util.imageUrl('https://cdn.example.com/x.jpg'), { src: 'https://cdn.example.com/x.jpg', ok: true });
});
t('imageUrl: 不正値はプレースホルダー + ok:false', () => {
  assert.deepEqual(util.imageUrl('javascript:alert(1)'), { src: util.PLACEHOLDER, ok: false });
  assert.deepEqual(util.imageUrl(''), { src: util.PLACEHOLDER, ok: false });
});

// ===== search.run（AND / 単一選択 / dropped / フリーワード） =====
function makeDb() {
  return {
    stores: [
      { id: 'S1', name: 'ガパオ食堂サワディー', description: '本格ガパオが看板', area: '新宿', station: '新宿駅', storeType: 'Restaurant', published: true },
      { id: 'S2', name: 'タイカフェ コップン', description: 'ゆったりカフェ', area: '渋谷', station: '渋谷駅', storeType: 'Cafe', published: true },
      { id: 'S3', name: '非公開の店', description: '出てはいけない', area: '新宿', station: '新宿三丁目駅', storeType: 'Restaurant', published: false },
    ],
    menus: [
      { id: 'M1', name: 'ガパオライス', category: 'RICE', published: true },
      { id: 'M2', name: '秘密メニュー', category: 'RICE', published: false },
    ],
    scenes: [{ id: 'SC1', name: '一人ランチ', published: true }],
    features: [{ id: 'F1', name: 'Thai SELECT認定', published: true }],
    storeMenus: [{ storeId: 'S1', otherId: 'M1' }], // ガパオライスはS1のみ提供（フリーワード一意化）
    storeScenes: [{ storeId: 'S1', otherId: 'SC1' }],
    storeFeatures: [{ storeId: 'S1', otherId: 'F1' }],
    texts: () => '', textsMap: {}, pages: [], ads: [], warnings: [],
  };
}
t('search: 公開のみ対象（非公開S3は除外）', () => {
  const r = search.run(makeDb(), { area: '新宿' });
  assert.deepEqual(r.stores.map(s => s.id), ['S1']);
  assert.equal(r.dropped.length, 0);
});
t('search: 異カテゴリAND（新宿 かつ ガパオライス）', () => {
  const r = search.run(makeDb(), { area: '新宿', dish: 'ガパオライス' });
  assert.deepEqual(r.stores.map(s => s.id), ['S1']);
});
t('search: type=Cafe 単一選択（S2のみ）', () => {
  const r = search.run(makeDb(), { type: 'Cafe' });
  assert.deepEqual(r.stores.map(s => s.id), ['S2']);
});
t('search: storeType末尾スペースを吸収して Restaurant 一致', () => {
  const db = makeDb();
  db.stores[0].storeType = 'Restaurant '; // 実データ由来の末尾スペース
  const r = search.run(db, { type: 'Restaurant' });
  assert.deepEqual(r.stores.map(s => s.id), ['S1']);
});
t('search: 存在しない条件は dropped + 全店舗フォールバック', () => {
  const r = search.run(makeDb(), { area: '存在しない街' });
  assert.deepEqual(r.dropped, [{ cat: 'area', val: '存在しない街' }]);
  assert.deepEqual(r.stores.map(s => s.id).sort(), ['S1', 'S2']); // 公開全店
});
t('search: フリーワード部分一致 + かな折りたたみ（がぱお→料理名ガパオライス）', () => {
  const r = search.run(makeDb(), { freeword: 'がぱお' });
  assert.deepEqual(r.stores.map(s => s.id), ['S1']);
});
t('search: フリーワードは紹介文も対象（部分一致）', () => {
  const r = search.run(makeDb(), { freeword: 'ゆったり' });
  assert.deepEqual(r.stores.map(s => s.id), ['S2']);
});
t('search: scene 条件（一人ランチ）', () => {
  const r = search.run(makeDb(), { scene: '一人ランチ' });
  assert.deepEqual(r.stores.map(s => s.id), ['S1']);
});
t('search: 条件なしは公開全店（見出しラベルも確認）', () => {
  const r = search.run(makeDb(), {});
  assert.equal(r.stores.length, 2);
  assert.equal(search.label({}, r.stores.length), 'すべてのお店（全2店舗）');
});
// 実装設計書13-I-5: label新表記（条件部全体を「」で囲む。設計書4章APIコントラクトの記載どおり）
t('search.label: 新表記「新宿 × ガパオライス」のお店（8店舗見つかりました）', () => {
  assert.equal(search.label({ area: '新宿', dish: 'ガパオライス' }, 8), '「新宿 × ガパオライス」のお店（8店舗見つかりました）');
});
t('search.label: フリーワードも他条件と同じ×連結で外側の「」1組にまとめる（二重引用にしない）', () => {
  assert.equal(search.label({ area: '新宿', freeword: 'がぱお' }, 3), '「新宿 × がぱお」のお店（3店舗見つかりました）');
});
t('search.label: 条件なしは現行フォールバック文言を維持', () => {
  assert.equal(search.label(null, 0), 'すべてのお店（全0店舗）');
});

// ===== data: gvizパース / ヘッダー解決 / ID重複先勝ち =====
function gv(headers, rows) {
  return {
    status: 'ok',
    table: {
      cols: headers.map((h, i) => ({ id: 'c' + i, label: h, type: 'string' })),
      rows: rows.map(r => ({ c: r.map(v => (v === null ? null : { v: v })) })),
    },
  };
}
t('data.parseGviz: 外殻 setResponse(...) を剥がして JSON.parse', () => {
  const raw = '/*O_o*/\ngoogle.visualization.Query.setResponse({"status":"ok","table":{"cols":[{"label":"A"}],"rows":[]}});';
  const obj = data._internal.parseGviz(raw);
  assert.equal(obj.status, 'ok');
});
t('data.gvizTable: ヘッダーは trim+NFKC 解決（Description 末尾スペース吸収）', () => {
  const tbl = data._internal.gvizTable(gv(['Store_ID', 'Description '], [['S1', '説明']]));
  assert.ok('Description' in tbl.index); // 末尾スペースを吸収
  assert.equal(data._internal.cellV(tbl.rows[0], tbl.index['Description']), '説明');
});
t('data.gvizTable: cols.label が空なら rows[0] をヘッダーに（列型混在フォールバック）', () => {
  const obj = {
    status: 'ok',
    table: {
      cols: [{ id: 'A', label: '', type: 'string' }, { id: 'B', label: '', type: 'string' }],
      rows: [{ c: [{ v: 'Store_ID' }, { v: 'Area' }] }, { c: [{ v: 'S9' }, { v: '池袋' }] }],
    },
  };
  const tbl = data._internal.gvizTable(obj);
  assert.ok('Store_ID' in tbl.index && 'Area' in tbl.index);
  assert.equal(tbl.rows.length, 1);
  assert.equal(data._internal.cellV(tbl.rows[0], tbl.index['Area']), '池袋');
});
t('data.buildDB: ID重複は先勝ち + warnings、空IDはスキップ、storeType/Descriptionを正しく解決', () => {
  const storesHeaders = ['Store_ID', 'Store_Name', 'Description ', 'Area', 'Nearest_Station', 'Walk_Minutes',
    'Address', 'Store_type', 'Google_Map_URL', 'Official_Website', 'Instagram_URL', 'Lunch', 'Dinner',
    'Store_Video', 'Exterior_Image', 'Food_Image', 'TikTok_URL', 'Video_Creator', 'Pran', 'Verified_Date', 'Published', 'Created_By'];
  const row = (id, name, desc, area, type, lunch, dinner, pub) =>
    [id, name, desc, area, '新宿駅', '3', 'addr', type, '', '', '', lunch, dinner, '', '', '', '', '', 'FREE', '2026/08/08', pub, 'Soa'];
  const tables = {
    Stores: data._internal.gvizTable(gv(storesHeaders, [
      row('S1', '店A', '紹介A', '新宿', 'Restaurant ', 'TRUE', 'FALSE', 'TRUE'),   // 先勝ち
      row('S1', '店A-重複', '紹介dup', '渋谷', 'Cafe', 'FALSE', 'TRUE', 'TRUE'),    // 捨てられる
      row('', '空ID', 'skip', 'X', 'Cafe', '', '', 'TRUE'),                        // スキップ
    ])),
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [['M1', 'ガパオライス', 'RICE', 'TRUE']])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [['SC1', '一人ランチ', 'TRUE']])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [['F1', 'Thai SELECT認定', 'TRUE']])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [['S1', 'M1']])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [['S1', 'SC1']])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [['S1', 'F1']])),
  };
  const db = data._internal.buildDB(tables);
  assert.equal(db.stores.length, 1, '重複・空IDを除いて1件');
  assert.equal(db.stores[0].name, '店A', '先勝ち');
  assert.equal(db.stores[0].storeType, 'Restaurant', 'storeType末尾スペースをトリム');
  assert.equal(db.stores[0].description, '紹介A', 'Description(末尾スペースヘッダ)を解決');
  assert.equal(db.stores[0].lunch, true);
  assert.equal(db.stores[0].dinner, false);
  assert.equal(db.stores[0].published, true);
  assert.ok(db.warnings.some(w => w.indexOf('Store_ID重複') >= 0), '重複warning記録');
  // Scenes/Features は実ヘッダー Scene_Name / Feature_Name で解決される
  assert.equal(db.scenes[0].name, '一人ランチ');
  assert.equal(db.features[0].name, 'Thai SELECT認定');
});
t('data.buildDB: 追加シート(Site_Texts/Pages/Ads)が無ければ空扱い + warnings', () => {
  const tables = {
    Stores: data._internal.gvizTable(gv(['Store_ID', 'Store_Name', 'Area', 'Published'], [['S1', '店', '新宿', 'TRUE']])),
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [])),
  };
  const db = data._internal.buildDB(tables);
  assert.deepEqual(db.pages, []);
  assert.deepEqual(db.ads, []);
  assert.ok(db.warnings.some(w => w.indexOf('Site_Texts') >= 0));
});
t('data.buildDB: 追加シートにStores形状のテーブルが来た場合(gvizが存在しないシート名に既定タブを200で返す静かなフォールバック相当・設計書11章TODO3)、誤取り込みゼロ+新warningが3件積まれる', () => {
  const storesHeaders = ['Store_ID', 'Store_Name', 'Description ', 'Area', 'Nearest_Station', 'Walk_Minutes',
    'Address', 'Store_type', 'Google_Map_URL', 'Official_Website', 'Instagram_URL', 'Lunch', 'Dinner',
    'Store_Video', 'Exterior_Image', 'Food_Image', 'TikTok_URL', 'Video_Creator', 'Pran', 'Verified_Date', 'Published', 'Created_By'];
  const storesRow = ['S1', '店A', '紹介A', '新宿', '新宿駅', '3', 'addr', 'Restaurant ', '', '', '', 'TRUE', 'FALSE', '', '', '', '', '', 'FREE', '2026/08/08', 'TRUE', 'Soa'];
  const storesShaped = data._internal.gvizTable(gv(storesHeaders, [storesRow]));
  const tables = {
    Stores: storesShaped,
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [])),
    // ⚠️ここが本題: 追加3シートに「Stores形状」がそのまま入ってきたケース（存在しないシート名→gvizが既定タブを返す）
    Site_Texts: storesShaped,
    Pages: storesShaped,
    Ads: storesShaped,
  };
  const db = data._internal.buildDB(tables);
  // ①誤取り込みゼロ
  assert.deepEqual(db.textsMap, {}, 'Site_TextsにStores行が文言として混入していない');
  assert.deepEqual(db.pages, [], 'PagesにStores行が混入していない');
  assert.deepEqual(db.ads, [], 'AdsにStores行が混入していない');
  // ②新warningが3件積まれる（テーブルnull時の「取得できませんでした」系warningとは別文言・別条件）
  assert.ok(db.warnings.some(w => w.indexOf('Site_Textsシートに列') >= 0), 'Site_Texts列未解決warning');
  assert.ok(db.warnings.some(w => w.indexOf('Pagesシートに列') >= 0), 'Pages列未解決warning');
  assert.ok(db.warnings.some(w => w.indexOf('Adsシートに列') >= 0), 'Ads列未解決warning');
});

// 実装設計書13-I-11: 回帰テスト拡充（gviz status:error／ネイティブbool・数値セル／全セルnull行／
//  追加シート部分一致ヘッダー）
t('data.gvizTable: status:error 応答は例外を投げる（gvizError付き・data.load()側のreject経路用）', () => {
  const obj = { status: 'error', errors: [{ message: 'INVALID_QUERY', detailed_message: '無効なシート名です' }] };
  assert.throws(() => data._internal.gvizTable(obj), (err) => {
    assert.equal(err.gvizError, true);
    assert.equal(err.message, '無効なシート名です');
    return true;
  });
});
t('data.buildDB: ネイティブbool(v:true)・数値(v:5)セルを正しく解釈する（gvizは列型により生値を返す）', () => {
  const storesHeaders = ['Store_ID', 'Store_Name', 'Area', 'Walk_Minutes', 'Published'];
  const tables = {
    Stores: data._internal.gvizTable(gv(storesHeaders, [
      ['S1', '店A', '新宿', 5, true], // Walk_Minutesは数値セル、Publishedはネイティブbool（文字列'TRUE'ではない）
    ])),
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [])),
  };
  const db = data._internal.buildDB(tables);
  assert.equal(db.stores.length, 1);
  assert.equal(db.stores[0].published, true, 'v:trueのネイティブboolをpublished=trueに解釈');
  assert.equal(db.stores[0].walkMinutes, '5', '数値セル(v:5)を文字列"5"として保持');
});
t('data.buildDB: 全セルnull行はID空行として安全にスキップされる（gvizが空行を返すケース）', () => {
  const storesHeaders = ['Store_ID', 'Store_Name', 'Area', 'Published'];
  const tables = {
    Stores: data._internal.gvizTable(gv(storesHeaders, [
      [null, null, null, null], // 全セルnull
      ['S1', '店A', '新宿', 'TRUE'],
    ])),
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [])),
  };
  const db = data._internal.buildDB(tables);
  assert.equal(db.stores.length, 1, '全セルnull行は例外を投げずにスキップされ、後続行は正常に取り込まれる');
  assert.equal(db.stores[0].id, 'S1');
});
t('data.buildDB: 追加シートが部分一致ヘッダーの場合は「未作成」警告を誤って出さない（列名ゆれの実データを許容）', () => {
  const storesHeaders = ['Store_ID', 'Store_Name', 'Area', 'Published'];
  const tables = {
    Stores: data._internal.gvizTable(gv(storesHeaders, [['S1', '店A', '新宿', 'TRUE']])),
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [])),
    // Key列のみ一致・Text列は未解決(列名ゆれ) → 全滅ではないので「未作成」扱いにしない
    Site_Texts: data._internal.gvizTable(gv(['Key', 'Memo'], [['hero_catch', 'メモ']])),
    Pages: data._internal.gvizTable(gv(['Page_ID', 'Memo'], [['P1', 'メモ']])),
    Ads: data._internal.gvizTable(gv(['Ad_ID', 'Memo'], [['A1', 'メモ']])),
  };
  const db = data._internal.buildDB(tables);
  assert.ok(!db.warnings.some(w => w.indexOf('Site_Textsシートに列') >= 0), 'Site_Texts部分一致は列未解決warningを出さない');
  assert.ok(!db.warnings.some(w => w.indexOf('Pagesシートに列') >= 0), 'Pages部分一致は列未解決warningを出さない');
  assert.ok(!db.warnings.some(w => w.indexOf('Adsシートに列') >= 0), 'Ads部分一致は列未解決warningを出さない');
});
t('data.buildDB: Storesの非必須URL/画像列が未解決なら列名を明示したwarningsを積む（実装設計書13-I-4）', () => {
  const storesHeaders = ['Store_ID', 'Store_Name', 'Area', 'Published']; // 非必須7列(map/web/insta/video/ext/food/tiktok)を欠く
  const tables = {
    Stores: data._internal.gvizTable(gv(storesHeaders, [['S1', '店A', '新宿', 'TRUE']])),
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [])),
  };
  const db = data._internal.buildDB(tables);
  assert.ok(db.warnings.some(w => w.indexOf('Storesシートの列『Official_Website』が見つかりません') >= 0));
  assert.ok(db.warnings.some(w => w.indexOf('Storesシートの列『Exterior_Image』が見つかりません') >= 0));
  assert.ok(db.warnings.some(w => w.indexOf('Storesシートの列『TikTok_URL』が見つかりません') >= 0));
});
t('data.buildDB: Stores必須列欠損warningは日本語ラベル（要件2-3の例示準拠）', () => {
  const tables = {
    Stores: data._internal.gvizTable(gv(['Store_Name'], [['店のみ']])), // Store_ID/Area/Published欠損
    Menus: data._internal.gvizTable(gv(['Menu_ID', 'Menu_Name', 'Category', 'Published'], [])),
    Scenes: data._internal.gvizTable(gv(['Scene_ID', 'Scene_Name', 'Published'], [])),
    Features: data._internal.gvizTable(gv(['Feature_ID', 'Feature_Name', 'Published'], [])),
    Store_Menus: data._internal.gvizTable(gv(['Store_ID', 'Menu_ID'], [])),
    Store_Scenes: data._internal.gvizTable(gv(['Store_ID', 'Scene_ID'], [])),
    Store_Features: data._internal.gvizTable(gv(['Store_ID', 'Feature_ID'], [])),
  };
  const db = data._internal.buildDB(tables);
  assert.ok(db.warnings.indexOf('Storesシートに必須列が見つかりません: Store_ID') >= 0);
  assert.ok(db.warnings.indexOf('Storesシートに必須列が見つかりません: エリア') >= 0);
  assert.ok(db.warnings.indexOf('Storesシートに必須列が見つかりません: 公開フラグ') >= 0);
});

// ===========================================================================
// ===== facets: エリア・最寄駅の検索画面改善（改修① 2026-09-22・内容確認書1.(a)〜(d)） =====
// ===========================================================================

// 実データ（2026-09-22 gviz実測・公開150件）から取った代表値。表記はシートのまま。
const REAL_STATIONS = [
  '渋谷駅', '新宿駅', '中目黒駅', '六本木駅', '新橋駅', '新大久保駅', '東京駅', '神保町駅', '下北沢駅',
  '新宿三丁目駅', '吉祥寺駅', '日比谷駅', '池袋駅', '西武新宿駅', '新宿御苑前駅',
  '勝どき駅', '虎ノ門ヒルズ駅', '御茶ノ水駅', '田町駅・三田駅', '羽田空港第1ターミナル駅', '東銀座',
];
const REAL_AREAS = ['新宿', '渋谷', '中目黒', '六本木', '銀座', '池袋', '新大久保', '神保町', '下北沢', '上野', '練馬'];

// ---- util.normFacet（約束(b) ひらがな・カタカナ・全角半角の吸収） ----
t('normFacet: ひらがな・カタカナ・半角カナが同じ形になる（しんじゅく=シンジュク=ｼﾝｼﾞｭｸ）', () => {
  assert.equal(util.normFacet('しんじゅく'), util.normFacet('シンジュク'));
  assert.equal(util.normFacet('ｼﾝｼﾞｭｸ'), util.normFacet('シンジュク'));
});
t('normFacet: 全角英数は半角になり、英字は小文字化される', () => {
  assert.equal(util.normFacet('ＴＨＡＩ１'), 'thai1');
});
t('normFacet: 半角/全角スペースと中黒を落とす（田町駅・三田駅を「三田」で引ける）', () => {
  assert.equal(util.normFacet('田町駅 ・ 三田駅').indexOf(util.normFacet('三田')) >= 0, true);
  assert.equal(util.normFacet('　渋 谷 駅　'), '渋谷駅');
});

// ---- facets.parseListText（約束(d) 読点区切り） ----
t('facets.parseListText: 読点「、」で分解しトリムする', () => {
  assert.deepEqual(facets.parseListText('新宿、 渋谷 、中目黒'), ['新宿', '渋谷', '中目黒']);
});
t('facets.parseListText: 全角/半角カンマ・改行も区切りとして受ける（運営者の手入力ゆれ対策）', () => {
  assert.deepEqual(facets.parseListText('新宿,渋谷，中目黒\n六本木'), ['新宿', '渋谷', '中目黒', '六本木']);
});
t('facets.parseListText: 空文字・null・空要素だけなら空配列', () => {
  assert.deepEqual(facets.parseListText(''), []);
  assert.deepEqual(facets.parseListText(null), []);
  assert.deepEqual(facets.parseListText('、、 、'), []);
});
t('facets.parseListText: 配列もそのまま受ける', () => {
  assert.deepEqual(facets.parseListText([' 新宿 ', '', '渋谷']), ['新宿', '渋谷']);
});

// ---- facets.dedupOrdered / buildCatItems（複製していた選択肢生成の共通化） ----
t('facets.dedupOrdered: 出現順を保って重複と空欄を落とす', () => {
  assert.deepEqual(facets.dedupOrdered(['渋谷', ' 渋谷 ', '', null, '新宿']), ['渋谷', '新宿']);
});
t('facets.buildCatItems: 非公開の店舗・マスタを選択肢に入れない', () => {
  const db = {
    stores: [
      { area: '新宿', station: '新宿駅', storeType: 'Restaurant', published: true },
      { area: '渋谷', station: '渋谷駅', storeType: 'Cafe', published: true },
      { area: '非公開エリア', station: '非公開駅', storeType: 'Hidden', published: false },
    ],
    scenes: [{ name: 'ひとりごはん', published: true }, { name: '非公開シーン', published: false }],
    features: [{ name: 'テラス席', published: true }],
  };
  const items = facets.buildCatItems(db);
  assert.deepEqual(items.area, ['新宿', '渋谷']);
  assert.deepEqual(items.station, ['新宿駅', '渋谷駅']);
  assert.deepEqual(items.scene, ['ひとりごはん']);
  assert.deepEqual(items.feature, ['テラス席']);
  assert.deepEqual(items.type, ['Restaurant', 'Cafe']);
});

// ---- facets.resolveMajor（約束(d) Site_Textsで並びを変えられる） ----
t('facets.resolveMajor: Site_Textsに書かれた順で並ぶ', () => {
  assert.deepEqual(
    facets.resolveMajor(REAL_AREAS, '渋谷、新宿、上野'),
    ['渋谷', '新宿', '上野']
  );
});
t('facets.resolveMajor: 実データに無い名前は黙って外す（存在しない条件のチップを出さない）', () => {
  assert.deepEqual(facets.resolveMajor(REAL_AREAS, '新宿、京都、渋谷'), ['新宿', '渋谷']);
});
t('facets.resolveMajor: 重複指定は1つにまとめる', () => {
  assert.deepEqual(facets.resolveMajor(REAL_AREAS, '新宿、新宿、渋谷'), ['新宿', '渋谷']);
});
t('facets.resolveMajor: 末尾の「駅」の有無は一意に定まるときだけ吸収しデータ表記で返す', () => {
  assert.deepEqual(facets.resolveMajor(REAL_STATIONS, '東銀座駅、勝どき'), ['東銀座', '勝どき駅']);
});
t('facets.resolveMajor: 「駅」を省いても前方一致では拾わない（新宿→新宿駅だけ・新宿三丁目駅は無関係）', () => {
  // 末尾の「駅」を外した完全一致なので、「新宿」は「新宿駅」にだけ当たる。
  assert.deepEqual(facets.resolveMajor(['新宿駅', '西武新宿駅', '新宿三丁目駅'], '新宿'), ['新宿駅']);
});
t('facets.resolveMajor: 「駅」有無で2つに割れる候補があるときは当てない（別の駅に化けさせない）', () => {
  assert.deepEqual(facets.resolveMajor(['東銀座', '東銀座駅'], '東銀座駅'), ['東銀座駅']); // 完全一致は当たる
  assert.deepEqual(facets.resolveMajor(['東銀座', '東銀座駅'], '東銀座前'), []);            // 曖昧一致はしない
});
t('facets.resolveMajor: Site_Textsが空なら第3引数の既定値を使う', () => {
  assert.deepEqual(facets.resolveMajor(REAL_AREAS, '', '新宿、渋谷'), ['新宿', '渋谷']);
  assert.deepEqual(facets.resolveMajor(REAL_AREAS, null, ['上野']), ['上野']);
});

// ---- facets.filterItems（約束(b) 駅名の入力欄） ----
t('facets.filterItems: 部分一致で絞る', () => {
  assert.deepEqual(facets.filterItems(REAL_STATIONS, '新宿'), ['新宿駅', '新宿三丁目駅', '西武新宿駅', '新宿御苑前駅']);
});
t('facets.filterItems: 空入力は全件（絞り込みなし）', () => {
  assert.equal(facets.filterItems(REAL_STATIONS, '').length, REAL_STATIONS.length);
  assert.equal(facets.filterItems(REAL_STATIONS, '  ').length, REAL_STATIONS.length);
});
t('facets.filterItems: ひらがな・カタカナ・半角カナで同じ結果（どき=ドキ=ﾄﾞｷ→勝どき駅）', () => {
  const a = facets.filterItems(REAL_STATIONS, 'どき');
  const b = facets.filterItems(REAL_STATIONS, 'ドキ');
  const c = facets.filterItems(REAL_STATIONS, 'ﾄﾞｷ');
  assert.deepEqual(a, ['勝どき駅']);
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
});
t('facets.filterItems: の=ノ=ﾉ で虎ノ門ヒルズ駅・御茶ノ水駅が同じように出る', () => {
  const a = facets.filterItems(REAL_STATIONS, 'の門');
  assert.deepEqual(a, ['虎ノ門ヒルズ駅']);
  assert.deepEqual(facets.filterItems(REAL_STATIONS, 'ノ門'), a);
  assert.deepEqual(facets.filterItems(REAL_STATIONS, 'ﾉ門'), a);
});
t('facets.filterItems: 全角数字でも半角数字でも同じ（羽田空港第1ターミナル駅）', () => {
  const a = facets.filterItems(REAL_STATIONS, '第１タ');
  assert.deepEqual(a, ['羽田空港第1ターミナル駅']);
  assert.deepEqual(facets.filterItems(REAL_STATIONS, '第1タ'), a);
});
t('facets.filterItems: 中黒をまたいだ併記も引ける（田町駅・三田駅を「三田」で）', () => {
  assert.deepEqual(facets.filterItems(REAL_STATIONS, '三田'), ['田町駅・三田駅']);
});
t('facets.filterItems: 一致しなければ空配列', () => {
  assert.deepEqual(facets.filterItems(REAL_STATIONS, '博多'), []);
});

// ---- facets.ensureSelected（約束(c) 選択中・URL着地の値は必ず表示） ----
t('facets.ensureSelected: 主要一覧に無い選択値を末尾に足す', () => {
  assert.deepEqual(
    facets.ensureSelected(['渋谷駅', '新宿駅'], REAL_STATIONS, '勝どき駅'),
    ['渋谷駅', '新宿駅', '勝どき駅']
  );
});
t('facets.ensureSelected: すでに表示されていれば足さない', () => {
  assert.deepEqual(facets.ensureSelected(['渋谷駅'], REAL_STATIONS, '渋谷駅'), ['渋谷駅']);
});
t('facets.ensureSelected: 選択値が空なら何もしない', () => {
  assert.deepEqual(facets.ensureSelected(['渋谷駅'], REAL_STATIONS, ''), ['渋谷駅']);
});
t('facets.ensureSelected: データに存在しない値はチップにしない（dropped の一言に任せる）', () => {
  assert.deepEqual(facets.ensureSelected(['渋谷駅'], REAL_STATIONS, '博多駅'), ['渋谷駅']);
});
t('facets.ensureSelected: 全角/半角ゆれのURL値はデータ側の表記で足す', () => {
  assert.deepEqual(facets.ensureSelected([], ['CAFE'], 'ＣＡＦＥ'), ['CAFE']);
});

// ---- facets.visibleItems（初期表示・展開・絞り込みの組み合わせ） ----
const MAJOR_ST = ['渋谷駅', '新宿駅', '中目黒駅'];
t('facets.visibleItems: 既定は主要のみ（約束(a) 初期表示）', () => {
  const v = facets.visibleItems({ all: REAL_STATIONS, major: MAJOR_ST });
  assert.deepEqual(v.items, MAJOR_ST);
  assert.equal(v.mode, 'major');
  assert.equal(v.total, REAL_STATIONS.length);
});
t('facets.visibleItems: 展開すると全件（約束(a) 駅一覧を見る）', () => {
  const v = facets.visibleItems({ all: REAL_STATIONS, major: MAJOR_ST, expanded: true });
  assert.equal(v.mode, 'all');
  assert.equal(v.items.length, REAL_STATIONS.length);
});
t('facets.visibleItems: 入力があれば主要に無い駅も全候補から絞って出す', () => {
  const v = facets.visibleItems({ all: REAL_STATIONS, major: MAJOR_ST, query: 'どき' });
  assert.equal(v.mode, 'filtered');
  assert.deepEqual(v.items, ['勝どき駅']);
});
t('facets.visibleItems: 主要リストが空なら全件表示に落ちる（空のグループを作らない）', () => {
  const v = facets.visibleItems({ all: REAL_STATIONS, major: [] });
  assert.equal(v.mode, 'all');
  assert.equal(v.items.length, REAL_STATIONS.length);
});
t('facets.visibleItems: URL着地の駅が主要に無くても表示される（約束(c)）', () => {
  const v = facets.visibleItems({ all: REAL_STATIONS, major: MAJOR_ST, selected: '御茶ノ水駅' });
  assert.equal(v.items.indexOf('御茶ノ水駅') >= 0, true);
  assert.equal(v.items.length, MAJOR_ST.length + 1);
});
t('facets.visibleItems: 絞り込みで0件でも選択中の駅は残す（解除できなくならない）', () => {
  const v = facets.visibleItems({ all: REAL_STATIONS, major: MAJOR_ST, query: '博多', selected: '渋谷駅' });
  assert.equal(v.matched, 0);
  assert.deepEqual(v.items, ['渋谷駅']);
});

// ---- 既定の主要リスト（約束(d) 既定値は texts-default.js） ----
t('texts-default: major_areas の既定は実データ4件以上の9エリア', () => {
  assert.deepEqual(
    facets.parseListText(textsDefault.major_areas),
    ['新宿', '渋谷', '中目黒', '六本木', '銀座', '池袋', '新大久保', '神保町', '下北沢']
  );
});
t('texts-default: major_stations の既定は実データ3件以上の13駅', () => {
  assert.deepEqual(
    facets.parseListText(textsDefault.major_stations),
    ['渋谷駅', '新宿駅', '中目黒駅', '六本木駅', '新橋駅', '新大久保駅', '東京駅', '神保町駅', '下北沢駅',
      '新宿三丁目駅', '吉祥寺駅', '日比谷駅', '池袋駅']
  );
});
t('texts-default: 既定の主要リストは実データ表記でそのまま解決できる（1件も落ちない）', () => {
  assert.equal(facets.resolveMajor(REAL_AREAS, textsDefault.major_areas).length, 9);
  assert.equal(facets.resolveMajor(REAL_STATIONS, textsDefault.major_stations).length, 13);
});
t('texts-default: 展開ボタン・駅名入力欄の既定文言が揃っている', () => {
  ['search_area_show_all', 'search_area_show_major', 'search_station_show_all',
    'search_station_show_major', 'search_station_filter_label',
    'search_station_filter_placeholder', 'search_station_no_match'].forEach((k) => {
      assert.equal(typeof textsDefault[k] === 'string' && textsDefault[k].length > 0, true, k + ' が空');
    });
});

// ---- 退行防止: 検索ロジック側は触っていない ----
t('退行: エリア/駅の条件は従来どおり完全一致でAND（チップ改修で絞り込み挙動を変えていない）', () => {
  const db = {
    stores: [
      { id: 's1', name: 'A', area: '新宿', station: '新宿駅', storeType: 'Restaurant', published: true },
      { id: 's2', name: 'B', area: '新宿', station: '新宿三丁目駅', storeType: 'Restaurant', published: true },
      { id: 's3', name: 'C', area: '渋谷', station: '渋谷駅', storeType: 'Cafe', published: true },
    ],
    menus: [], scenes: [], features: [], storeMenus: [], storeScenes: [], storeFeatures: [],
  };
  assert.deepEqual(search.run(db, { area: '新宿' }).stores.map(s => s.id), ['s1', 's2']);
  assert.deepEqual(search.run(db, { area: '新宿', station: '新宿駅' }).stores.map(s => s.id), ['s1']);
  // 部分一致はしない（「新宿」で「新宿三丁目駅」は引っかからない＝駅チップの絞り込みとは別物）
  assert.deepEqual(search.run(db, { station: '新宿' }).dropped, [{ cat: 'station', val: '新宿' }]);
});

// ===== sitemap生成（改修6-(a)・tools/gen_sitemap.mjs の純粋関数） =====

// gviz応答の形を作るヘルパー（上の gv() は data.js 用。こちらは生のオブジェクトを渡す）
function gvObj(labels, rows) {
  return {
    table: {
      cols: labels.map((l) => ({ label: l })),
      rows: rows.map((cells) => ({ c: cells.map((v) => (v === null ? null : { v })) })),
    },
  };
}

t('sitemap.xmlEscape: &<>"\' を実体参照に変換する', () => {
  assert.equal(sitemap.xmlEscape(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&apos;f');
});
t('sitemap.buildSitemapXml: 固定ページ8件＋店舗件数＝URL総数（件数が合う）', () => {
  const xml = sitemap.buildSitemapXml({ storeIds: ['S00001', 'S00002', 'S00003'], lastmod: '2026-09-22' });
  assert.equal(sitemap.FIXED_PATHS.length, 8);
  assert.equal((xml.match(/<loc>/g) || []).length, 8 + 3);
});
t('sitemap.buildSitemapXml: トップは / ・店舗は store.html?id= 形式・lastmodが入る', () => {
  const xml = sitemap.buildSitemapXml({ storeIds: ['S00001'], lastmod: '2026-09-22' });
  assert.ok(xml.includes('<loc>https://thaispot-tokyo.com/</loc>'));
  assert.ok(xml.includes('<loc>https://thaispot-tokyo.com/store.html?id=S00001</loc>'));
  assert.ok(xml.includes('<lastmod>2026-09-22</lastmod>'));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
});
t('sitemap.buildSitemapXml: 危険な文字を含むIDでも生XMLに &<> が漏れない（URLエンコード＋実体参照）', () => {
  const xml = sitemap.buildSitemapXml({ storeIds: ['S&1', 'S<2>'], lastmod: '2026-09-22' });
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.some((l) => l.endsWith('id=S%261')));
  assert.ok(locs.some((l) => l.endsWith('id=S%3C2%3E')));
  assert.equal(/<loc>[^<]*[&][^a]/.test(xml), false); // 生の & が残っていない
});
t('sitemap.buildSitemapXml: originを差し替えられる（ステージング用・末尾スラッシュは正規化）', () => {
  const xml = sitemap.buildSitemapXml({ origin: 'https://stg.example.com/', storeIds: [], lastmod: '2026-09-22' });
  assert.ok(xml.includes('<loc>https://stg.example.com/</loc>'));
  assert.ok(xml.includes('<loc>https://stg.example.com/search.html</loc>'));
});
t('sitemap.parseStoreIdsFromGviz: Published TRUE系のみ・空IDスキップ・ID重複は先勝ち', () => {
  const obj = gvObj(['Store_ID', 'Store_Name', 'Published'], [
    ['S00001', 'A', true],
    ['', '空ID', 'TRUE'],
    ['S00002', 'B', 'FALSE'],
    ['S00001', '重複', 'TRUE'],
    ['S00003', 'C', 'YES'],
    ['S00004', 'D', 1],
  ]);
  assert.deepEqual(sitemap.parseStoreIdsFromGviz(obj), ['S00001', 'S00003', 'S00004']);
});
t('sitemap.parseStoreIdsFromGviz: cols.labelが空なら1行目をヘッダー扱い（列型混在フォールバック）', () => {
  const obj = { table: { cols: [{ label: '' }, { label: '' }], rows: [
    { c: [{ v: 'Store_ID' }, { v: 'Published' }] },
    { c: [{ v: 'S00009' }, { v: 'TRUE' }] },
  ] } };
  assert.deepEqual(sitemap.parseStoreIdsFromGviz(obj), ['S00009']);
});
t('sitemap.parseStoreIdsFromGviz: Store_ID列が無ければ例外（誤った空sitemapを書かない）', () => {
  assert.throws(() => sitemap.parseStoreIdsFromGviz(gvObj(['Name'], [['A']])), /Store_ID/);
});
t('sitemap.parseGviz: 外殻 setResponse(...) を剥がして JSON.parse できる', () => {
  const raw = "/*O_o*/\ngoogle.visualization.Query.setResponse({\"table\":{\"cols\":[],\"rows\":[]}});";
  assert.deepEqual(sitemap.parseGviz(raw).table.rows, []);
});
t('sitemap.todayJst: UTC深夜でも日本時間の日付になる（Actionsの実行環境はUTC）', () => {
  assert.equal(sitemap.todayJst(new Date('2026-09-21T16:00:00Z')), '2026-09-22');
  assert.equal(sitemap.todayJst(new Date('2026-09-21T14:59:00Z')), '2026-09-21');
});
t('sitemap.readSpreadsheetId: config.js のソースからスプレッドシートIDを読み出せる', () => {
  assert.equal(sitemap.readSpreadsheetId("  SPREADSHEET_ID: 'ABC-123_x',\n"), 'ABC-123_x');
  assert.throws(() => sitemap.readSpreadsheetId('no id here'), /SPREADSHEET_ID/);
});

// ===== 店舗ページのSEO出力（改修6-(c)(d)・assets/js/seo.js） =====

const STORE_FIXTURE = {
  id: 'S00001',
  name: 'ゲウチャイ 新宿店',
  description: ' タイ直送の食材とスパイスを使った本格タイ料理店。\nランチからディナーまで楽しめます。 ',
  area: '新宿',
  station: '新宿駅',
  walkMinutes: '3',
  address: '東京都新宿区西新宿1-1-1',
  storeType: 'Restaurant',
  mapUrl: 'https://maps.google.com/?cid=12345',
  websiteUrl: 'https://example.com/shop',
  exteriorImage: 'https://example.com/ext.jpg',
};

t('seo.storeTitle: 「店舗名｜THAI SPOT TOKYO」になる', () => {
  assert.equal(seo.storeTitle(STORE_FIXTURE), 'ゲウチャイ 新宿店｜THAI SPOT TOKYO');
});
t('seo.storeTitle: 店舗名が空ならサイト名だけを返す（壊れたtitleを出さない）', () => {
  assert.equal(seo.storeTitle({ name: '  ' }), 'THAI SPOT TOKYO');
});
t('seo.storeDescription: エリア・店舗名・最寄駅・徒歩分・紹介文が入り120字以内に収まる', () => {
  const d = seo.storeDescription(STORE_FIXTURE);
  assert.ok(d.startsWith('新宿のタイ料理店「ゲウチャイ 新宿店」。最寄駅は新宿駅（徒歩3分）。'));
  assert.ok(d.includes('タイ直送の食材'));
  assert.ok(d.length <= 120);
  assert.equal(/[\n\r]/.test(d), false); // 改行は潰してある
});
t('seo.storeDescription: 120字を超える紹介文は…で省略する', () => {
  const d = seo.storeDescription({ ...STORE_FIXTURE, description: 'あ'.repeat(400) });
  assert.equal(d.length, 120);
  assert.ok(d.endsWith('…'));
});
t('seo.storeDescription: Store_typeがCafeなら「タイカフェ」と書く', () => {
  const d = seo.storeDescription({ ...STORE_FIXTURE, storeType: 'Cafe ' });
  assert.ok(d.startsWith('新宿のタイカフェ「'));
});
t('seo.storeDescription: 徒歩分が非数値なら徒歩表記を出さない（誤った分数を断定しない）', () => {
  const d = seo.storeDescription({ ...STORE_FIXTURE, walkMinutes: '徒歩すぐ' });
  assert.ok(d.includes('最寄駅は新宿駅。'));      // 駅名だけ出して徒歩は省く
  assert.equal(/（徒歩.*?）/.test(d), false);    // 「（徒歩…）」の形は一切出さない
  // 全角数字の入力は半角化して採用する（util.normalizeWalkMinutes 経由）
  assert.ok(seo.storeDescription({ ...STORE_FIXTURE, walkMinutes: '５' }).includes('（徒歩5分）'));
});
t('seo.storeJsonLd: Restaurant必須項目（name/url/servesCuisine/address/hasMap/最寄駅）がそろう', () => {
  const ld = seo.storeJsonLd(STORE_FIXTURE);
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'Restaurant');
  assert.equal(ld.name, 'ゲウチャイ 新宿店');
  assert.equal(ld.url, 'https://thaispot-tokyo.com/store.html?id=S00001');
  assert.equal(ld.servesCuisine, 'Thai');
  assert.equal(ld.address['@type'], 'PostalAddress');
  assert.equal(ld.address.streetAddress, '東京都新宿区西新宿1-1-1');
  assert.equal(ld.address.addressLocality, '新宿');
  assert.equal(ld.hasMap, 'https://maps.google.com/?cid=12345');
  assert.equal(ld.additionalProperty[0].value, '新宿駅');
  assert.equal(ld.areaServed.name, '新宿');
  assert.deepEqual(ld.image, ['https://example.com/ext.jpg']);
  assert.deepEqual(ld.sameAs, ['https://example.com/shop']);
});
t('seo.storeJsonLd: Google_Map_URLが無ければ住所からGoogleマップ検索URLを組み立てる', () => {
  const ld = seo.storeJsonLd({ ...STORE_FIXTURE, mapUrl: '' });
  assert.equal(ld.hasMap, 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('東京都新宿区西新宿1-1-1'));
});
t('seo.storeJsonLd: javascript: の地図URL・公式サイトURLは採用しない（safeUrl通過のみ）', () => {
  const ld = seo.storeJsonLd({ id: 'S1', name: 'X', mapUrl: 'javascript:alert(1)', websiteUrl: 'javascript:alert(1)' });
  assert.equal('hasMap' in ld, false);
  assert.equal('sameAs' in ld, false);
});
t('seo.storeJsonLd: 空の項目はキー自体を作らない（未確認の情報を出さない）', () => {
  const ld = seo.storeJsonLd({ id: 'S1', name: '店' });
  assert.deepEqual(Object.keys(ld).sort(), ['@context', '@type', 'description', 'name', 'servesCuisine', 'url']);
});
t('seo.serializeJsonLd: </script>を含むデータでも不等号が生で出ず JSON.parse できる', () => {
  const json = seo.serializeJsonLd(seo.storeJsonLd({ id: 'S1', name: '悪意</script><img src=x>' }));
  assert.equal(json.includes('<'), false);
  assert.equal(JSON.parse(json).name, '悪意</script><img src=x>');
});
t('seo.storeUrl: IDはURLエンコードされる（?id= 付きの絶対URL）', () => {
  assert.equal(seo.storeUrl({ id: 'S 00 1&x' }), 'https://thaispot-tokyo.com/store.html?id=S%2000%201%26x');
});

// ===== 実行サマリ =====
console.log(results.join('\n'));
console.log('\n==== ' + pass + ' PASS / ' + fail + ' FAIL (' + (pass + fail) + ' total) ====');
process.exit(fail ? 1 : 0);
