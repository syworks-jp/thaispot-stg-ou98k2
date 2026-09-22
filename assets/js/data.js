/*
 * data.js — gviz取得・ヘッダーラベル解決・検証・キャッシュ・整形（設計書v1.0 4章・5章 / 要件2-1〜2-4）
 *
 * 方針:
 *  - 列参照は実行時にヘッダーラベルで解決（列レター固定禁止・要件2-3）。発注者の列挿入で壊れない。
 *  - ヘッダーは trim + NFKC して照合（Stores の `Description `末尾スペースを吸収・要件2-1）。
 *  - セル値は cell?.v ?? ""。日付列は f値優先（月ズレ防止・要件2-3）。
 *  - 公開フラグ Published は TRUE系のみ掲載。ID空行スキップ。ID重複は先勝ち + warnings記録（要件2-4）。
 *  - 追加シート(Site_Texts/Pages/Ads)はタブが無ければ空扱い + warnings（設計書5章）。
 *
 * 二重出口（設計書8章のテスト方針を data層にも適用）:
 *  ブラウザ = window.TS.data / Node = module.exports。module スコープでは fetch/DOM/sessionStorage を触らない。
 *  内部の純粋関数（parseGviz / gvizTable / buildDB 等）を _internal で公開しテスト可能にする。
 */
(function () {
  'use strict';

  // util参照: ブラウザは window.TS.util / Node は require（テスト用二重出口）
  var U = (typeof window !== 'undefined' && window.TS && window.TS.util)
    ? window.TS.util
    : (typeof require !== 'undefined' ? require('./util.js') : null);

  var REQUIRED_SHEETS = ['Stores', 'Menus', 'Scenes', 'Features', 'Store_Menus', 'Store_Scenes', 'Store_Features'];
  var OPTIONAL_SHEETS = ['Site_Texts', 'Pages', 'Ads'];

  // ---- gviz パース ----

  // parseGviz: `/*O_o*/\ngoogle.visualization.Query.setResponse({...});` の外殻を剥がして JSON.parse。
  // 最初の '{' から最後の '}' までを切り出す（外殻には波括弧が無いので確実）。
  function parseGviz(text) {
    var s = text.indexOf('{');
    var e = text.lastIndexOf('}');
    if (s < 0 || e < 0 || e < s) throw new Error('gviz応答の外殻を検出できませんでした');
    return JSON.parse(text.slice(s, e + 1));
  }

  // gvizTable: gviz JSON → {index: {正規化ヘッダー名 -> 列番号}, rows: [dataRow...]}
  //  ヘッダーは cols.label 優先。全ラベルが空なら rows[0] をヘッダーとして扱う（列型混在で gviz が
  //  ヘッダー行検出に失敗する場合のフォールバック・設計書5章）。
  function gvizTable(obj) {
    if (obj && obj.status === 'error') {
      var er = (obj.errors && obj.errors[0]) || {};
      var msg = er.detailed_message || er.message || er.reason || 'gviz error';
      var e = new Error(msg);
      e.gvizError = true;
      throw e;
    }
    var table = (obj && obj.table) || { cols: [], rows: [] };
    var cols = table.cols || [];
    var rows = table.rows || [];

    var labels = cols.map(function (c) { return (c && c.label != null) ? String(c.label) : ''; });
    var dataRows = rows;
    var hasLabels = labels.some(function (l) { return l.trim() !== ''; });
    if (!hasLabels && rows.length) {
      // フォールバック: 1行目をヘッダーに、以降をデータに
      labels = ((rows[0].c) || []).map(function (cell) { return cell && cell.v != null ? String(cell.v) : ''; });
      dataRows = rows.slice(1);
    }

    var index = {};
    labels.forEach(function (l, i) {
      var key = normKey(l);
      if (key && !(key in index)) index[key] = i; // 同名は先勝ち
    });
    return { index: index, rows: dataRows };
  }

  function normKey(s) { return String(s == null ? '' : s).normalize('NFKC').trim(); }

  // resolve: 候補ヘッダー名の配列から最初に存在する列番号を返す。無ければ -1。
  //  なぜ候補配列か: 要件/設計書で緩く書かれた列名（例: Scenes の Name）と実ヘッダー(Scene_Name)の
  //  両方を吸収するため。実データ実測(2026-08-24)では Scene_ID/Scene_Name・Feature_ID/Feature_Name。
  function resolve(index, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var key = normKey(candidates[i]);
      if (key in index) return index[key];
    }
    return -1;
  }

  // ---- セルアクセス（要件2-3 nullセーフ） ----

  function cellV(row, idx) {
    if (idx == null || idx < 0) return '';
    var c = row.c && row.c[idx];
    return c && c.v != null ? c.v : '';
  }
  // 日付など表示文字列が要る列は f値優先（gvizのDate()生値による月ズレ防止・要件2-3）
  function cellF(row, idx) {
    if (idx == null || idx < 0) return '';
    var c = row.c && row.c[idx];
    if (!c) return '';
    if (c.f != null) return c.f;
    return c.v != null ? c.v : '';
  }

  // TRUE系判定（boolean true もしくは "TRUE"/"1"/"YES"）。gvizはbool列を v:true で返すことがある。
  function isTrue(v) {
    if (v === true) return true;
    var s = String(v == null ? '' : v).normalize('NFKC').trim().toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'YES';
  }

  function str(v) { return String(v == null ? '' : v); }
  function trimStr(v) { return str(v).trim(); }

  // ---- DB構築 ----

  // buildDB: シート名 -> gvizTable結果({index,rows})|null のマップから DB を組み立てる。
  //  テスト可能にするため fetch から分離した純粋関数。
  function buildDB(tables) {
    var warnings = [];
    function need(name) {
      var t = tables[name];
      if (!t) { warnings.push('必須シート「' + name + '」を取得できませんでした'); return { index: {}, rows: [] }; }
      return t;
    }

    // --- Stores（要件2-1 確定マッピング・実ヘッダー名） ---
    var st = need('Stores');
    var col = {
      id: resolve(st.index, ['Store_ID']),
      name: resolve(st.index, ['Store_Name']),
      desc: resolve(st.index, ['Description']), // 実ヘッダーは `Description `(末尾スペース)→normKeyで吸収
      area: resolve(st.index, ['Area']),
      station: resolve(st.index, ['Nearest_Station']),
      walk: resolve(st.index, ['Walk_Minutes']),
      address: resolve(st.index, ['Address']),
      type: resolve(st.index, ['Store_type', 'Store_Type']),
      map: resolve(st.index, ['Google_Map_URL']),
      web: resolve(st.index, ['Official_Website']),
      insta: resolve(st.index, ['Instagram_URL']),
      lunch: resolve(st.index, ['Lunch']),
      dinner: resolve(st.index, ['Dinner']),
      video: resolve(st.index, ['Store_Video']),
      ext: resolve(st.index, ['Exterior_Image']),
      food: resolve(st.index, ['Food_Image']),
      tiktok: resolve(st.index, ['TikTok_URL']),
      verified: resolve(st.index, ['Verified_Date']),
      pub: resolve(st.index, ['Published']),
    };
    // 必須列の欠損は warnings（要件2-3・白画面にせず check.html で気づける）。
    // ラベルは要件2-3の例示準拠で日本語化（実装設計書13-I-4）: id=Store_ID・name=店舗名・area=エリア・pub=公開フラグ
    var REQUIRED_COL_LABEL = { id: 'Store_ID', name: '店舗名', area: 'エリア', pub: '公開フラグ' };
    ['id', 'name', 'area', 'pub'].forEach(function (k) {
      if (col[k] < 0) warnings.push('Storesシートに必須列が見つかりません: ' + (REQUIRED_COL_LABEL[k] || k));
    });

    // 非必須のURL/画像列も未解決(-1)ならwarningsに積む（実装設計書13-I-4）。
    // なぜ必須列と同様に扱うか: 列名の変更・削除は先方作業で起こり得て、これらが欠けても白画面にはならないが
    // 「なぜかリンクや写真だけ全店舗で出ない」状態になり得るため、check.htmlで気づけるようにする。
    var OPTIONAL_COL_INFO = {
      map: { header: 'Google_Map_URL', effect: '地図の直接リンクが使われません（住所からの自動生成にフォールバックします）' },
      web: { header: 'Official_Website', effect: '公式サイトリンクが表示されません' },
      insta: { header: 'Instagram_URL', effect: 'Instagramリンクが表示されません' },
      video: { header: 'Store_Video', effect: '「このお店を動画で見る」ボタンが表示されません' },
      ext: { header: 'Exterior_Image', effect: '外観写真が表示されません' },
      food: { header: 'Food_Image', effect: '料理写真が表示されません' },
      tiktok: { header: 'TikTok_URL', effect: '「Soaの紹介動画を見る」リンクが表示されません' },
    };
    ['map', 'web', 'insta', 'video', 'ext', 'food', 'tiktok'].forEach(function (k) {
      if (col[k] < 0) {
        var info = OPTIONAL_COL_INFO[k];
        warnings.push('Storesシートの列『' + info.header + '』が見つかりません（' + info.effect + '）');
      }
    });

    var stores = [];
    var seenStore = {};
    st.rows.forEach(function (r) {
      var id = trimStr(cellV(r, col.id));
      if (!id) return; // ID空行スキップ（要件2-3）
      var key = normKey(id);
      if (seenStore[key]) { warnings.push('Store_ID重複（先勝ち採用）: ' + id); return; } // 先勝ち（要件2-4）
      seenStore[key] = true;
      stores.push({
        id: id,
        name: str(cellV(r, col.name)),
        description: str(cellV(r, col.desc)),
        area: str(cellV(r, col.area)),
        station: str(cellV(r, col.station)),
        walkMinutes: str(cellV(r, col.walk)),
        address: str(cellV(r, col.address)),
        // storeType は Cafe/Restaurant判定・バッジに使う制御値。実データに `Restaurant `末尾スペースが
        // 混入していたため trim して伝播（要件2-4 突合前トリム。他の表示文字列は生値のまま）。
        storeType: trimStr(cellV(r, col.type)),
        mapUrl: str(cellV(r, col.map)),
        websiteUrl: str(cellV(r, col.web)),
        instagramUrl: str(cellV(r, col.insta)),
        lunch: isTrue(cellV(r, col.lunch)),
        dinner: isTrue(cellV(r, col.dinner)),
        videoUrl: str(cellV(r, col.video)),        // Store_Video（「このお店を動画で見る」用）
        exteriorImage: str(cellV(r, col.ext)),
        foodImage: str(cellV(r, col.food)),
        tiktokUrl: str(cellV(r, col.tiktok)),       // TikTok_URL（「Soaの紹介動画を見る」用）
        verifiedDate: str(cellF(r, col.verified)),  // 日付はf値優先
        published: isTrue(cellV(r, col.pub)),
      });
    });

    // --- Menus ---
    var menus = buildSimple(need('Menus'), {
      id: ['Menu_ID'], name: ['Menu_Name'], extra: { category: ['Category'] }, pub: ['Published'],
    }, warnings, 'Menu_ID');
    // --- Scenes（実ヘッダー: Scene_ID / Scene_Name） ---
    var scenes = buildSimple(need('Scenes'), {
      id: ['Scene_ID', 'ID'], name: ['Scene_Name', 'Name'], pub: ['Published'],
    }, warnings, 'Scene_ID');
    // --- Features（実ヘッダー: Feature_ID / Feature_Name） ---
    var features = buildSimple(need('Features'), {
      id: ['Feature_ID', 'ID'], name: ['Feature_Name', 'Name'], pub: ['Published'],
    }, warnings, 'Feature_ID');

    // --- 中間シート（storeId, otherId） ---
    var storeMenus = buildLink(need('Store_Menus'), ['Store_ID'], ['Menu_ID']);
    var storeScenes = buildLink(need('Store_Scenes'), ['Store_ID'], ['Scene_ID']);
    var storeFeatures = buildLink(need('Store_Features'), ['Store_ID'], ['Feature_ID']);

    // --- 追加シート（無ければ空扱い + warnings・設計書5章） ---
    var textsMap = {};
    if (tables.Site_Texts) {
      var stx = tables.Site_Texts;
      var kc = resolve(stx.index, ['Key', 'キー']);
      var tc = resolve(stx.index, ['Text', '本文', 'Value']);
      // 設計書11章TODO3: gvizは存在しないシート名にも200+既定タブ内容を返すことがある。
      // その場合テーブル自体はnullにならないため、期待列が1つも解決できないことで別テーブル誤取り込みを検知する
      // （テーブルnullの「取得できませんでした」warningとは別種の警告として区別する）。
      if (kc < 0 && tc < 0) {
        warnings.push('Site_Textsシートに列「Key」「Text」が見つかりません（タブ未作成の可能性・既定文言で動作中）');
      }
      stx.rows.forEach(function (r) {
        var k = trimStr(cellV(r, kc));
        if (!k) return;
        if (!(k in textsMap)) textsMap[k] = str(cellV(r, tc)); // キー重複は先勝ち
      });
    } else {
      warnings.push('Site_Textsシートが未作成のため組み込みデフォルト文言を使用します');
    }

    var pages = [];
    if (tables.Pages) {
      var pg = tables.Pages;
      var pcol = {
        id: resolve(pg.index, ['Page_ID', 'ID']), title: resolve(pg.index, ['Title']),
        body: resolve(pg.index, ['Body']), img: resolve(pg.index, ['Image_URL', 'Image']),
        pub: resolve(pg.index, ['Published']),
      };
      // 設計書11章TODO3: id/title/body/imgが1つも解決できなければ別テーブル誤取り込みの疑い
      // （pubはStores.Publishedと列名が重なり得るため誤検知源から除外して判定する）
      if (pcol.id < 0 && pcol.title < 0 && pcol.body < 0 && pcol.img < 0) {
        warnings.push('Pagesシートに列「Page_ID」「Title」「Body」「Image_URL」が見つかりません（タブ未作成の可能性・固定ページ非表示で動作中）');
      }
      var seenP = {};
      pg.rows.forEach(function (r) {
        var id = trimStr(cellV(r, pcol.id));
        if (!id) return;
        var pk = normKey(id);
        if (seenP[pk]) { warnings.push('Page_ID重複（先勝ち）: ' + id); return; }
        seenP[pk] = true;
        pages.push({
          id: id, title: str(cellV(r, pcol.title)), body: str(cellV(r, pcol.body)),
          imageUrl: str(cellV(r, pcol.img)), published: isTrue(cellV(r, pcol.pub)),
        });
      });
    } else {
      warnings.push('Pagesシートが未作成のため固定ページは空です');
    }

    var ads = [];
    if (tables.Ads) {
      var ad = tables.Ads;
      var acol = {
        id: resolve(ad.index, ['Ad_ID', 'ID']), img: resolve(ad.index, ['Image_URL', 'Image']),
        link: resolve(ad.index, ['Link_URL', 'Link']), pos: resolve(ad.index, ['Position']),
        vis: resolve(ad.index, ['Visible']),
      };
      // 設計書11章TODO3: id/img/link/posが1つも解決できなければ別テーブル誤取り込みの疑い
      // （visはStores側に同名列が無いが、判定基準をPages/Site_Textsと揃えるため他の必須列と同様に扱う）
      if (acol.id < 0 && acol.img < 0 && acol.link < 0 && acol.pos < 0) {
        warnings.push('Adsシートに列「Ad_ID」「Image_URL」「Link_URL」「Position」が見つかりません（タブ未作成の可能性・広告非表示で動作中）');
      }
      ad.rows.forEach(function (r) {
        var id = trimStr(cellV(r, acol.id));
        if (!id) return;
        ads.push({
          id: id, imageUrl: str(cellV(r, acol.img)), linkUrl: str(cellV(r, acol.link)),
          position: trimStr(cellV(r, acol.pos)), visible: isTrue(cellV(r, acol.vis)),
        });
      });
    } else {
      warnings.push('Adsシートが未作成のため広告枠は表示されません');
    }

    return {
      stores: stores, menus: menus, scenes: scenes, features: features,
      storeMenus: storeMenus, storeScenes: storeScenes, storeFeatures: storeFeatures,
      texts: makeTexts(textsMap), textsMap: textsMap,
      pages: pages, ads: ads, warnings: warnings,
    };
  }

  // buildSimple: マスタ系（ID/Name/(extra)/Published）を組み立て。ID空行スキップ・ID重複先勝ち。
  function buildSimple(t, spec, warnings, label) {
    var ci = resolve(t.index, spec.id);
    var cn = resolve(t.index, spec.name);
    var cp = spec.pub ? resolve(t.index, spec.pub) : -1;
    var extra = spec.extra || {};
    var extraCols = {};
    for (var ek in extra) if (Object.prototype.hasOwnProperty.call(extra, ek)) extraCols[ek] = resolve(t.index, extra[ek]);
    var out = [];
    var seen = {};
    t.rows.forEach(function (r) {
      var id = trimStr(cellV(r, ci));
      if (!id) return;
      var k = normKey(id);
      if (seen[k]) { warnings.push(label + '重複（先勝ち）: ' + id); return; }
      seen[k] = true;
      var rec = { id: id, name: str(cellV(r, cn)), published: isTrue(cellV(r, cp)) };
      for (var xk in extraCols) if (Object.prototype.hasOwnProperty.call(extraCols, xk)) rec[xk] = str(cellV(r, extraCols[xk]));
      out.push(rec);
    });
    return out;
  }

  // buildLink: 中間シート → [{storeId, otherId}]。どちらか空はスキップ。
  function buildLink(t, storeCand, otherCand) {
    var cs = resolve(t.index, storeCand);
    var co = resolve(t.index, otherCand);
    var out = [];
    t.rows.forEach(function (r) {
      var s = trimStr(cellV(r, cs));
      var o = trimStr(cellV(r, co));
      if (!s || !o) return;
      out.push({ storeId: s, otherId: o });
    });
    return out;
  }

  // makeTexts: Site_Texts値 → 無ければ texts-default へフォールバック（文言層無停止・要件2-2）。
  function makeTexts(textsMap) {
    return function (key) {
      if (textsMap && Object.prototype.hasOwnProperty.call(textsMap, key) && String(textsMap[key]).trim() !== '') {
        return textsMap[key];
      }
      var d = (typeof window !== 'undefined' && window.TS && window.TS.textsDefault) ? window.TS.textsDefault : {};
      return (key in d) ? d[key] : '';
    };
  }

  // ---- 取得・キャッシュ（ブラウザ専用） ----

  var CACHE_KEY = 'ts_db_cache_v1';

  function gvizUrl(sheet, bust) {
    var id = (window.TS && window.TS.config && window.TS.config.SPREADSHEET_ID) || '';
    // 接続先ベースはconfigで差し替え可能（ローカル検証でモックに向ける用途のみ・URL等の外部入力からは変更不可）
    var base = (window.TS && window.TS.config && window.TS.config.GVIZ_BASE_URL) || 'https://docs.google.com';
    var u = base + '/spreadsheets/d/' + encodeURIComponent(id) +
      '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheet);
    if (bust) u += '&_cb=' + Date.now();
    return u;
  }

  function fetchTable(sheet, bust) {
    return fetch(gvizUrl(sheet, bust), { credentials: 'omit' }).then(function (res) {
      if (!res.ok) { var e = new Error(sheet + ' HTTP ' + res.status); e.httpStatus = res.status; throw e; }
      return res.text();
    }).then(function (text) {
      return gvizTable(parseGviz(text));
    });
  }

  // load: DBを返す。opts.nocache=true でキャッシュ破棄→再取得→上書き（要件2-3）。
  // opts.nocache未指定時はURLの ?nocache=1 を既定値として読む（設計書11章TODO1: 全ページ一元対応。
  // 明示指定が勝つのでcheck.htmlの個別制御とも両立。locationはNode実行時に無いためガード）。
  function load(opts) {
    opts = opts || {};
    if (!('nocache' in opts)) {
      opts.nocache = (typeof location !== 'undefined') &&
        /(?:^|[?&])nocache=1(?:&|$)/.test(location.search);
    }
    var minutes = (window.TS && window.TS.config && window.TS.config.CACHE_MINUTES) || 10;

    if (!opts.nocache) {
      var cached = readCache(minutes);
      if (cached) return Promise.resolve(rehydrate(cached));
    }

    // 必須シートは1つでも通信/パース失敗なら reject（白画面禁止・呼び出し側でエラー表示・要件2-3）。
    var reqP = REQUIRED_SHEETS.map(function (s) { return fetchTable(s, opts.nocache); });
    // 追加シートは失敗（未作成含む）を空扱いにして続行（設計書5章）。
    var optP = OPTIONAL_SHEETS.map(function (s) {
      return fetchTable(s, opts.nocache).catch(function () { return null; });
    });

    return Promise.all(reqP.concat(optP)).then(function (results) {
      var tables = {};
      REQUIRED_SHEETS.forEach(function (s, i) { tables[s] = results[i]; });
      OPTIONAL_SHEETS.forEach(function (s, i) { tables[s] = results[REQUIRED_SHEETS.length + i]; });
      var db = buildDB(tables);
      writeCache(db); // キャッシュ上書き（nocache時も新データで更新）
      return db;
    });
  }

  function readCache(minutes) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj._t) return null;
      if (Date.now() - obj._t > minutes * 60000) return null; // 期限切れ
      return obj;
    } catch (e) { return null; } // プライベートモード等の例外は握って素通し
  }

  function writeCache(db) {
    try {
      var payload = {
        _t: Date.now(),
        stores: db.stores, menus: db.menus, scenes: db.scenes, features: db.features,
        storeMenus: db.storeMenus, storeScenes: db.storeScenes, storeFeatures: db.storeFeatures,
        textsMap: db.textsMap, pages: db.pages, ads: db.ads, warnings: db.warnings,
      };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload)); // texts関数は保存不可なので除外
    } catch (e) { /* 保存失敗は無視（キャッシュは最適化であって必須ではない） */ }
  }

  // キャッシュ復元時は texts関数を作り直す（関数はJSON化できないため）
  function rehydrate(obj) {
    return {
      stores: obj.stores || [], menus: obj.menus || [], scenes: obj.scenes || [], features: obj.features || [],
      storeMenus: obj.storeMenus || [], storeScenes: obj.storeScenes || [], storeFeatures: obj.storeFeatures || [],
      texts: makeTexts(obj.textsMap || {}), textsMap: obj.textsMap || {},
      pages: obj.pages || [], ads: obj.ads || [], warnings: obj.warnings || [],
    };
  }

  // loadError: 共通のエラー表示（再読込ボタン付き・白画面禁止・要件2-3）
  function loadError(elm, err) {
    if (!elm || !U) return;
    elm.textContent = '';
    var box = U.el('div', { class: 'ts-load-error' }, [
      U.el('p', null, 'データを読み込めませんでした。通信環境をご確認のうえ、再読み込みしてください。'),
      U.el('button', { class: 'ts-reload', type: 'button', onclick: function () { location.reload(); } }, '再読み込み'),
    ]);
    elm.appendChild(box);
    if (err && typeof console !== 'undefined') console.error('[TS.data] load失敗:', err);
  }

  var api = {
    load: load,
    loadError: loadError,
    _internal: {
      parseGviz: parseGviz, gvizTable: gvizTable, buildDB: buildDB,
      resolve: resolve, isTrue: isTrue, makeTexts: makeTexts, cellV: cellV, cellF: cellF,
    },
  };

  if (typeof window !== 'undefined') {
    window.TS = window.TS || {};
    window.TS.data = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
