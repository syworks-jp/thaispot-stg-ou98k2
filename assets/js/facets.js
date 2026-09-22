/*
 * facets.js — 条件チップ（エリア/最寄駅/シーン/こだわり/店舗タイプ）の選択肢生成と表示制御
 *             （改修①「エリア・最寄駅の検索画面改善」2026-09-22）
 *
 * なぜ作ったか:
 *  - search.html と cafe.html に buildCatItems()/dedupOrdered()/renderCatGroup() が丸ごと複製されており、
 *    片方だけ直す事故が起きやすかった。共通化して1か所にまとめる。
 *  - エリア74種・最寄駅88種（2026-09-22 実データ）が全部並ぶと選べない。主要だけ初期表示し、
 *    「すべて見る」で全件、駅は入力欄で絞り込む。
 *
 * 約束（内容確認書 1.(a)〜(d)）:
 *  (a) 主要エリア・主要駅だけを初期表示。「すべてのエリアを見る」「駅一覧を見る」で全件。
 *  (b) 最寄駅に入力欄。部分一致。ひらがな/カタカナ/全角/半角（半角カナ含む）の違いは吸収。
 *  (c) URL着地や選択中の値が主要一覧に無くても、その値は必ず表示する。
 *  (d) 主要の並びは Site_Texts の major_areas / major_stations（読点「、」区切り）で運営者が変更できる。
 *      既定値は texts-default.js。
 *
 * 変更しないこと: 検索結果の並び順・件数ロジック・料理/シーン/特徴の絞り込み（search.js には触れていない）。
 *
 * 二重出口（設計書8章）: ブラウザ = window.TS.facets / Node = module.exports。
 *  module スコープでは window/document を参照しない（呼び出し時のみ参照）。
 */
(function () {
  'use strict';

  var U = (typeof window !== 'undefined' && window.TS && window.TS.util)
    ? window.TS.util
    : (typeof require !== 'undefined' ? require('./util.js') : null);

  // ===========================================================================
  // 純粋関数（テスト対象・tests/core.test.mjs）
  // ===========================================================================

  // normFacet: チップ候補の突合・部分一致用の正規化（約束(b)）。実体は util.normFacet。
  //  半角カナ「ｼﾝｼﾞｭｸ」・ひらがな「しんじゅく」・カタカナ「シンジュク」・全角英数がすべて同じ形になる。
  function normFacet(s) { return U.normFacet(s); }

  // looseKey: 末尾の「駅」を落とした突合キー。
  //  Site_Texts に「渋谷」と書かれてもデータ側の「渋谷駅」に当てるための“予備の当て先”。
  //  完全一致が取れなかったときだけ、しかも候補が1つに定まるときだけ使う（曖昧一致で別の駅に化けさせない）。
  function looseKey(s) {
    return normFacet(s).replace(/駅$/, '');
  }

  // parseListText: 読点「、」区切りの文字列 → 配列（約束(d)）。
  //  運営者が手で書く欄なので、読点のほかに全角/半角カンマ・改行も区切りとして受ける。
  //  配列をそのまま渡すこともできる（テストと既定値の受け渡し用）。
  function parseListText(text) {
    if (text == null) return [];
    var arr;
    if (Array.isArray(text)) {
      arr = text.slice();
    } else {
      arr = String(text).split(/[、,，\r\n]+/);
    }
    var out = [];
    arr.forEach(function (v) {
      var t = (v == null ? '' : String(v)).trim();
      if (t) out.push(t);
    });
    return out;
  }

  // dedupOrdered: 空白除去 + 重複排除（出現順維持）。search.html/cafe.html から移設（挙動は同一）。
  function dedupOrdered(values) {
    var seen = {};
    var out = [];
    (values || []).forEach(function (v) {
      var t = (v == null ? '' : String(v)).trim();
      if (!t) return;
      var key = U.norm(t);
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  // resolveMajor: 主要リストの決定（約束(d)）。
  //  configuredText（Site_Texts値・既定値は texts-default.js 経由で db.texts() が返す）を読点で分解し、
  //  実データに存在する値だけを、書かれた順に返す。返すのは必ず「データ側の表記」。
  //  なぜデータ表記に寄せるか: チップの value がデータと1字でもずれると search.run() が条件を
  //  落として「見つからなかったため全店舗を表示」になり、運営者から見て原因不明の不具合になるため。
  //  データに無い名前は黙って外す（存在しない条件のチップを出す方が誤誘導になる）。
  function resolveMajor(allItems, configuredText, fallbackText) {
    var all = allItems || [];
    var names = parseListText(configuredText);
    if (!names.length) names = parseListText(fallbackText);
    if (!names.length) return [];

    var byExact = {};
    var byLoose = {};
    var looseDup = {};
    all.forEach(function (v) {
      var n = normFacet(v);
      if (n && !Object.prototype.hasOwnProperty.call(byExact, n)) byExact[n] = v;
      var l = looseKey(v);
      if (!l) return;
      if (Object.prototype.hasOwnProperty.call(byLoose, l)) looseDup[l] = true;
      else byLoose[l] = v;
    });

    var out = [];
    var seen = {};
    names.forEach(function (nm) {
      var n = normFacet(nm);
      if (!n) return;
      var hit = Object.prototype.hasOwnProperty.call(byExact, n) ? byExact[n] : null;
      if (hit == null) {
        var l = looseKey(nm);
        if (l && !looseDup[l] && Object.prototype.hasOwnProperty.call(byLoose, l)) hit = byLoose[l];
      }
      if (hit == null) return; // データに無い名前は出さない
      var k = normFacet(hit);
      if (seen[k]) return;
      seen[k] = true;
      out.push(hit);
    });
    return out;
  }

  // filterItems: 入力文字を含む候補だけに絞る（約束(b)）。空入力なら全件。
  function filterItems(allItems, query) {
    var all = allItems || [];
    var q = normFacet(query);
    if (!q) return all.slice();
    return all.filter(function (v) { return normFacet(v).indexOf(q) >= 0; });
  }

  // ensureSelected: 選択中の値が一覧に無ければ必ず足す（約束(c)）。
  //  突合は util.norm（search.run() が条件の存在判定に使うのと同じ関数）で行う。
  //  ここだけ normFacet を使わない理由: 「チップが選択状態で出ているのに検索側では条件が落ちている」
  //  という食い違いを作らないため、表示の判断を検索側の同値判定に合わせる。
  //  データに存在しない値（例: URL の ?station=存在しない駅）はチップにしない。
  //  → その場合は既存の「『◯◯』の条件が見つからなかったため…」の一言が出る（要件2-4）。
  function ensureSelected(items, allItems, selected) {
    var base = (items || []).slice();
    var sel = selected == null ? '' : String(selected).trim();
    if (!sel) return base;
    var sn = U.norm(sel);
    if (!sn) return base;
    for (var i = 0; i < base.length; i++) {
      if (U.norm(base[i]) === sn) return base;
    }
    var all = allItems || [];
    for (var j = 0; j < all.length; j++) {
      if (U.norm(all[j]) === sn) { base.push(all[j]); return base; }
    }
    return base;
  }

  // visibleItems: 実際に描画する候補と、その理由（mode）を返す。
  //  mode: 'filtered' = 入力で絞り込み中 / 'all' = 全件展開中 / 'major' = 主要のみ
  //  major が空（未設定・Site_Textsが全滅）なら全件表示に落とす（空のグループを作らない）。
  function visibleItems(opts) {
    opts = opts || {};
    var all = opts.all || [];
    var major = opts.major || [];
    var selected = opts.selected || '';
    var hasQuery = normFacet(opts.query) !== '';
    var base, mode;
    if (hasQuery) {
      base = filterItems(all, opts.query);
      mode = 'filtered';
    } else if (opts.expanded || !major.length) {
      base = all.slice();
      mode = 'all';
    } else {
      base = major.slice();
      mode = 'major';
    }
    var items = ensureSelected(base, all, selected);
    return { items: items, mode: mode, matched: base.length, total: all.length };
  }

  // buildCatItems: 実データからカテゴリ別の選択肢を作る（要件2-1: ハードコード禁止）。
  //  search.html と cafe.html に複製されていたものを1つにまとめた。cafe.html は type を使わないだけで、
  //  返す形は共通にする（片方だけ直す事故を防ぐ）。
  function buildCatItems(db) {
    var stores = (db.stores || []).filter(function (s) { return s.published; });
    var scenes = (db.scenes || []).filter(function (s) { return s.published; });
    var features = (db.features || []).filter(function (s) { return s.published; });
    return {
      area: dedupOrdered(stores.map(function (s) { return s.area; })),
      station: dedupOrdered(stores.map(function (s) { return s.station; })),
      scene: dedupOrdered(scenes.map(function (s) { return s.name; })),
      feature: dedupOrdered(features.map(function (s) { return s.name; })),
      type: dedupOrdered(stores.map(function (s) { return s.storeType; }))
    };
  }

  // ===========================================================================
  // DOM側（ブラウザ専用・呼び出し時にだけ document を触る）
  // ===========================================================================

  // 改修①で増えた3クラス分のCSS。既存のデザイントークン（:root変数）だけを使い、新しい配色は足さない。
  // なぜJSから差し込むか: style.css は編集しない取り決め（実装設計書10-3章）で、かつ
  // search.html / cafe.html の <head> は並行作業中の別担当の範囲のため、
  // 2ページで必ず同じ見た目になる置き場所がここしか無い。id付きで1回だけ入れる。
  var STYLE_ID = 'ts-facets-style';
  var STYLE_TEXT = [
    '.facet-filter{margin-bottom:var(--space-3);max-width:320px}',
    '.facet-note{font-size:12px;color:var(--color-muted);margin:var(--space-2) 0 0}',
    '.facet-toggle{display:inline-block;margin-top:var(--space-3);padding:0;background:none;border:0;',
    'font-family:inherit;font-size:13px;line-height:1.6;color:var(--color-primary);',
    'text-decoration:underline;cursor:pointer}',
    '.facet-toggle:hover{text-decoration:none}'
  ].join('');

  function ensureStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = STYLE_TEXT; // 文字列はCSSとしてのみ解釈される（HTML注入ではない）
    (document.head || document.documentElement).appendChild(st);
  }

  // createGroup: 1カテゴリ分のチップ群を受け持つ。search.html / cafe.html の両方から同じ形で使う。
  //  cfg = {
  //    mountId:      チップを描画する要素のid（必須）
  //    toggleId:     「すべて見る/主要だけ表示」ボタンのid（省略可＝トグルなし）
  //    noteId:       一致0件などの一言を出す要素のid（省略可）
  //    inputId:      絞り込み入力欄のid（省略可＝入力欄なし）
  //    inputWrapId:  入力欄の外枠id（データ取得後に表示するため。省略可）
  //    getAll():     全候補（配列）
  //    getMajor():   主要候補（配列。省略/空なら常に全件表示）
  //    getSelected():選択中の値（文字列）
  //    onSelect(v):  チップが押された（選択状態の更新は呼び出し側の責務。描画はこちらでやり直す）
  //    labels:       { showAll, showMajor, noMatch } または それを返す関数
  //                  （文言は Site_Texts 由来＝データ取得後に確定するため、描画のたびに引き直す）
  //  }
  function createGroup(cfg) {
    cfg = cfg || {};
    ensureStyles();
    var expanded = false;
    var query = '';
    var composing = false; // IME変換中（約束(b): 変換中に候補が入れ替わって壊れないようにする）
    var lastView = null;   // 直近の描画結果（入力欄でEnterを押したときの判断に使う）

    var self = {};

    function byId(id) { return id ? document.getElementById(id) : null; }

    function render() {
      var mount = byId(cfg.mountId);
      if (!mount) return;
      var labels = (typeof cfg.labels === 'function' ? cfg.labels() : cfg.labels) || {};
      var all = (cfg.getAll && cfg.getAll()) || [];
      var major = (cfg.getMajor && cfg.getMajor()) || [];
      var selected = (cfg.getSelected && cfg.getSelected()) || '';

      var view = visibleItems({
        all: all, major: major, expanded: expanded, query: query, selected: selected
      });
      lastView = view;

      while (mount.firstChild) mount.removeChild(mount.firstChild);
      mount.appendChild(window.TS.render.chips(view.items, {
        selectedValue: selected || null,
        onSelect: function (value) {
          if (typeof cfg.onSelect === 'function') cfg.onSelect(value);
          render();
        }
      }));

      var note = byId(cfg.noteId);
      if (note) {
        if (view.mode === 'filtered' && view.matched === 0) {
          note.textContent = labels.noMatch || '入力に一致する候補はありませんでした。';
          note.hidden = false;
        } else {
          note.textContent = '';
          note.hidden = true;
        }
      }

      var toggle = byId(cfg.toggleId);
      if (toggle) {
        // 主要リストが無い / 主要だけで全件をカバーしている / 絞り込み中 はトグルを出さない
        var needToggle = major.length > 0 && major.length < all.length && view.mode !== 'filtered';
        toggle.hidden = !needToggle;
        if (needToggle) {
          toggle.textContent = expanded
            ? (labels.showMajor || '主要だけ表示')
            : (labels.showAll || 'すべて見る');
          toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }
      }

      var wrap = byId(cfg.inputWrapId);
      if (wrap) wrap.hidden = all.length === 0;
    }

    function setQueryFromInput() {
      var input = byId(cfg.inputId);
      query = input ? (input.value || '') : '';
      render();
    }

    // reset: 「条件をクリア」から呼ぶ。入力欄と展開状態も初期に戻す（条件も表示も“やり直し”に揃える）。
    self.reset = function () {
      expanded = false;
      query = '';
      var input = byId(cfg.inputId);
      if (input) input.value = '';
      render();
    };
    self.render = render;

    var toggleEl = byId(cfg.toggleId);
    if (toggleEl) {
      toggleEl.addEventListener('click', function () {
        expanded = !expanded;
        render();
      });
    }

    var inputEl = byId(cfg.inputId);
    if (inputEl) {
      inputEl.addEventListener('compositionstart', function () { composing = true; });
      inputEl.addEventListener('compositionend', function () { composing = false; setQueryFromInput(); });
      inputEl.addEventListener('input', function () {
        if (composing) return; // 変換候補を選んでいる最中は描画し直さない
        setQueryFromInput();
      });
      // type=search のクリアボタン（×）対応。Chromeは input も飛ぶが Safari 対策に両方拾う。
      inputEl.addEventListener('search', function () { composing = false; setQueryFromInput(); });
      // この欄でのEnterではフォームを送信しない（約束(b)の入力欄は候補の絞り込みであって検索実行ではない）。
      //  なぜ送信させないか: 駅を選ばずにEnterすると条件なしの検索が走り、結果が全店舗に戻って
      //  「駅で絞ったつもりが増えた」と見える。IME確定のEnter（変換中の1打）も同じ理由で止める。
      //  候補が1つに絞れているときだけ、その駅を選んで手数を減らす。
      inputEl.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.keyCode !== 13) return;
        ev.preventDefault();
        if (ev.isComposing || ev.keyCode === 229 || composing) return; // 変換確定のEnterは何もしない
        if (!lastView || lastView.mode !== 'filtered' || lastView.matched !== 1) return;
        var only = lastView.items[0];
        var selectedNow = (cfg.getSelected && cfg.getSelected()) || '';
        if (U.norm(selectedNow) === U.norm(only)) return; // すでに選択中なら解除しない
        if (typeof cfg.onSelect === 'function') cfg.onSelect(only);
        render();
      });
    }

    return self;
  }

  var api = {
    normFacet: normFacet,
    looseKey: looseKey,
    parseListText: parseListText,
    dedupOrdered: dedupOrdered,
    resolveMajor: resolveMajor,
    filterItems: filterItems,
    ensureSelected: ensureSelected,
    visibleItems: visibleItems,
    buildCatItems: buildCatItems,
    createGroup: createGroup,
    ensureStyles: ensureStyles,
  };

  if (typeof window !== 'undefined') {
    window.TS = window.TS || {};
    window.TS.facets = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
