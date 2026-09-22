/*
 * search.js — 検索エンジン（条件AND・単一選択・フリーワード・フォールバック）（設計書v1.0 4章 / 要件3章・2-4）
 *
 * 仕様:
 *  - 異カテゴリ間はAND、同一カテゴリ内は単一選択（要件3章確定）。
 *  - 存在しない条件値は無視して該当条件を落とし、dropped に返す（要件2-4「見つからなかったため全店舗を表示」）。
 *  - フリーワード対象列: 店舗名・料理名(提供メニュー名)・エリア・最寄駅・紹介文。部分一致・normSearch両辺適用（要件2-4/3章）。
 *  - 公開フラグ=公開のみ対象（要件3章）。マスタも Published のみ選択肢化する前提で参照する。
 *
 * 二重出口（設計書8章）: ブラウザ = window.TS.search / Node = module.exports。
 */
(function () {
  'use strict';

  var U = (typeof window !== 'undefined' && window.TS && window.TS.util)
    ? window.TS.util
    : (typeof require !== 'undefined' ? require('./util.js') : null);

  // 条件カテゴリの順序（見出し表示・dropped列挙の安定化用）
  var CAT_ORDER = ['area', 'station', 'dish', 'scene', 'feature', 'type'];

  // 公開のみのマスタ名Set（norm済み）を作る
  function nameSet(list) {
    var s = {};
    (list || []).forEach(function (m) {
      if (m && m.published) s[U.norm(m.name)] = true;
    });
    return s;
  }

  // storeId -> 公開メニュー/シーン/特徴の名前配列（norm済み） を作る
  function buildStoreNameMap(links, master) {
    var idToName = {};
    (master || []).forEach(function (m) { if (m && m.published) idToName[U.norm(m.id)] = U.norm(m.name); });
    var map = {};
    (links || []).forEach(function (lk) {
      var nm = idToName[U.norm(lk.otherId)];
      if (nm == null) return; // 非公開マスタ・存在しないIDは除外
      var sk = U.norm(lk.storeId);
      (map[sk] || (map[sk] = [])).push(nm);
    });
    return map;
  }

  // run: db と conds({dish,area,station,scene,feature,type,freeword}) から {stores, dropped}。
  //  dropped は落とした条件の [{cat, val}]（ページ側で「『◯◯』の条件が…」を組み立てる用）。
  function run(db, conds) {
    conds = conds || {};
    var published = (db.stores || []).filter(function (s) { return s.published; });

    // 各カテゴリのドメイン（存在チェック用・norm済みSet）
    var areaSet = {}, stationSet = {}, typeSet = {};
    published.forEach(function (s) {
      if (U.norm(s.area)) areaSet[U.norm(s.area)] = true;
      if (U.norm(s.station)) stationSet[U.norm(s.station)] = true;
      if (U.norm(s.storeType)) typeSet[U.norm(s.storeType)] = true;
    });
    var dishSet = nameSet(db.menus);
    var sceneSet = nameSet(db.scenes);
    var featureSet = nameSet(db.features);

    // storeId -> 名前配列（dish/scene/feature の突合・フリーワードの料理名対象に使用）
    var storeDishes = buildStoreNameMap(db.storeMenus, db.menus);
    var storeScenes = buildStoreNameMap(db.storeScenes, db.scenes);
    var storeFeatures = buildStoreNameMap(db.storeFeatures, db.features);

    var domainByCat = { area: areaSet, station: stationSet, type: typeSet, dish: dishSet, scene: sceneSet, feature: featureSet };

    // 条件を「有効（ドメインに存在）」と「dropped（存在しない）」に振り分け
    var active = {};
    var dropped = [];
    CAT_ORDER.forEach(function (cat) {
      var raw = conds[cat];
      if (raw == null || String(raw).trim() === '') return;
      var val = U.norm(raw);
      if (domainByCat[cat][val]) active[cat] = val;
      else dropped.push({ cat: cat, val: String(raw).trim() }); // 無言の誤誘導禁止（要件2-4）
    });

    var fw = conds.freeword != null ? U.normSearch(conds.freeword) : '';

    var out = published.filter(function (s) {
      var sk = U.norm(s.id);
      // 異カテゴリ間AND
      if (active.area && U.norm(s.area) !== active.area) return false;
      if (active.station && U.norm(s.station) !== active.station) return false;
      if (active.type && U.norm(s.storeType) !== active.type) return false;
      if (active.dish && (storeDishes[sk] || []).indexOf(active.dish) < 0) return false;
      if (active.scene && (storeScenes[sk] || []).indexOf(active.scene) < 0) return false;
      if (active.feature && (storeFeatures[sk] || []).indexOf(active.feature) < 0) return false;
      // フリーワード: 店舗名・料理名・エリア・最寄駅・紹介文（部分一致・normSearch）
      if (fw) {
        var hay = [s.name, s.area, s.station, s.description]
          .concat(storeDishes[sk] || [])
          .map(function (x) { return U.normSearch(x); })
          .join('\n'); // 区切りに改行を挟み、語をまたいだ誤ヒット（ガ|パオ→ガパオ）を防ぐ
        if (hay.indexOf(fw) < 0) return false;
      }
      return true;
    });

    return { stores: out, dropped: dropped };
  }

  // condsFromUrl: URLパラメータ → conds。パラメータ名は conds のキーと同一
  //  （dish/area/station/scene/feature/type/freeword）。ホームからの条件適用済み遷移で使う（要件1章）。
  function condsFromUrl() {
    return {
      dish: U.qs('dish'), area: U.qs('area'), station: U.qs('station'),
      scene: U.qs('scene'), feature: U.qs('feature'), type: U.qs('type'),
      freeword: U.qs('freeword'),
    };
  }

  // label: 「新宿 × ガパオライス」のお店（8店舗見つかりました） 形式の見出し文字列（textContentで表示する）。
  // 実装設計書13-I-5: 条件部全体を「」で囲む表記に統一（設計書4章のAPIコントラクト記載どおり）。
  // フリーワードも他条件と同じ×連結の対象に含め、外側の「」1組でまとめて囲む（二重の「」にしない）。
  // 条件なし（全件表示）は現行フォールバック文言を維持する。
  function label(conds, count) {
    conds = conds || {};
    var parts = [];
    CAT_ORDER.forEach(function (cat) {
      var v = conds[cat];
      if (v != null && String(v).trim() !== '') parts.push(String(v).trim());
    });
    if (conds.freeword != null && String(conds.freeword).trim() !== '') parts.push(String(conds.freeword).trim());
    var n = count == null ? 0 : count;
    if (!parts.length) return 'すべてのお店（全' + n + '店舗）';
    return '「' + parts.join(' × ') + '」のお店（' + n + '店舗見つかりました）';
  }

  var api = { run: run, condsFromUrl: condsFromUrl, label: label };

  if (typeof window !== 'undefined') {
    window.TS = window.TS || {};
    window.TS.search = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
