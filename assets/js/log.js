/*
 * log.js — GAS送信（検索ログ fire-and-forget・問い合わせ・計測定義）（設計書v1.0 4章 / 要件4章・7章）
 *
 * 送信仕様（GAS thai_spot_backend.gs の doPost に合わせる）:
 *  - POST Content-Type: text/plain（CORSプリフライト回避・要件7章）。body = JSON文字列。
 *  - 共通フィールド: { token: TS.config.SITE_TOKEN, kind: 'search'|'contact', test: bool, ... }
 *  - GAS側は body.token を検証し、search は body.conds([{cat,val}])・body.freeword を、
 *    contact は body.name/email/type/store/message/website(ハニーポット) を受ける。
 *  - test: TS.config.STAGING_MODE をそのまま反映（設計書13-G-4）。GAS側は本番集計と分離して記録する
 *    （Search_Countsの月キー'TEST'・Search_FreeWord/Contact_Logの行末「テスト」列）。既存のsearch/contact
 *    のbody形式はこのフィールドを追加しただけで変えていない。
 *  - GAS_URL 未設定時は静かにスキップ（開発中の動作を保証・設計書4章）。
 *
 * 計測定義（要件4章）: 検索ログはユーザー操作による条件適用時だけ呼ぶ（ページ側の責務）。
 *  リロード/バック再表示は数えない。同一セッション同一条件の連続重複は1回（sessionStorageで直前条件比較）。
 */
(function () {
  'use strict';

  function cfg() { return (window.TS && window.TS.config) || {}; }

  function post(body) {
    // text/plain の simple request（プリフライト回避・要件7章）
    return fetch(cfg().GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
    });
  }

  // conds({dish,area,...,freeword}) → GAS用 [{cat,val}]（空値除外・freewordは別扱い）
  function condsToList(conds) {
    var list = [];
    ['dish', 'area', 'station', 'scene', 'feature', 'type'].forEach(function (cat) {
      var v = conds && conds[cat];
      if (v != null && String(v).trim() !== '') list.push({ cat: cat, val: String(v).trim() });
    });
    return list;
  }

  // search: fire-and-forget。サイト動作に一切影響させない（要件4章）。
  function search(conds, freeword) {
    try {
      if (!cfg().GAS_URL) return; // 未設定は静かにスキップ（設計書4章）
      var list = condsToList(conds);
      var fw = freeword != null ? String(freeword).trim() : '';
      if (!list.length && !fw) return; // 条件なしは記録しない（全件表示はカウント対象外）

      // 同一セッション同一条件の連続重複は1回（計測定義・要件4章）
      var key = JSON.stringify({ c: list, f: fw });
      try {
        if (sessionStorage.getItem('ts_last_log') === key) return;
        sessionStorage.setItem('ts_last_log', key);
      } catch (e) { /* プライベートモード等は素通し（重複排除できなくても送信はする） */ }

      // test: STAGING_MODE中はtrueを付与し、GAS側で本番集計と分離させる（設計書13-G-4）
      post({ token: cfg().SITE_TOKEN, kind: 'search', conds: list, freeword: fw, test: !!cfg().STAGING_MODE })
        .catch(function () { /* 送信失敗は無視（fire-and-forget） */ });
    } catch (e) { /* ログ失敗をUIに波及させない */ }
  }

  // contact: 結果を待ってUI表示する（設計書4章）。→ Promise<{ok, reason}>
  //  payload = { name, email, type, store, message, website(ハニーポット) }
  function contact(payload) {
    if (!cfg().GAS_URL) return Promise.resolve({ ok: false, reason: 'gas_unset' });
    var body = {};
    for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) body[k] = payload[k];
    body.token = cfg().SITE_TOKEN;
    body.kind = 'contact';
    body.test = !!cfg().STAGING_MODE; // 設計書13-G-4: GAS側でテストデータを区別する印
    return post(body)
      .then(function (r) { return r.json(); })
      .then(function (j) { return { ok: !!(j && j.ok), reason: j && j.reason }; })
      .catch(function () { return { ok: false, reason: 'network' }; });
  }

  var api = { search: search, contact: contact };

  if (typeof window !== 'undefined') {
    window.TS = window.TS || {};
    window.TS.log = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
