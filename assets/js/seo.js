/*
 * seo.js — 店舗ページの検索エンジン向け出力（追加改修⑥-(c)(d)・2026-09-22）
 *
 * 役割:
 *  - 店舗データ到着後に title / meta[name=description] / link[rel=canonical] を店舗ごとの値へ差し替える。
 *  - 構造化データ JSON-LD（schema.org Restaurant）を組み立てて <script type="application/ld+json"> を挿入する。
 *  データ未取得・店舗が見つからないときは呼ばれないため、HTMLに静的に書いてある共通文言がそのまま残る。
 *
 * 二重出口（設計書8章の方針を踏襲）: ブラウザ = window.TS.seo / Node = module.exports。
 *  文字列組み立て（storeTitle/storeDescription/storeJsonLd/serializeJsonLd）は DOM に触らない純粋関数にして
 *  tests/core.test.mjs から直接テストする。DOM反映は applyStore に閉じ込める。
 *
 * 値のエスケープ: JSON-LD は必ず JSON.stringify で直列化し、さらに不等号をユニコードエスケープに置換する
 *  （スクリプト要素の中身として安全側に倒す）。title/description/canonical は DOM API 経由で設定する。
 */
(function () {
  'use strict';

  var U = (typeof window !== 'undefined' && window.TS && window.TS.util)
    ? window.TS.util
    : (typeof require !== 'undefined' ? require('./util.js') : null);

  var SITE_NAME = 'THAI SPOT TOKYO';
  var SITE_ORIGIN = 'https://thaispot-tokyo.com';
  var DESC_MAX = 120; // 検索結果に出る長さの目安（超過分は…で省略）

  // ---- 小さな純粋ヘルパー ----

  function s(v) { return String(v == null ? '' : v); }

  // 表示用に空白をならす（実データの説明文には改行・末尾スペースが混ざっている）
  function flat(v) { return s(v).replace(/\s+/g, ' ').trim(); }

  function clamp(str, max) {
    var t = s(str);
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
  }

  // Cafe / Restaurant のどちらとして紹介するか（Store_type 列の値で判定・render.jsのバッジ判定と同じ規則）
  function kindLabel(store) {
    return /cafe/i.test(s(store && store.storeType)) ? 'タイカフェ' : 'タイ料理店';
  }

  function storeUrl(store, origin) {
    return (origin || SITE_ORIGIN) + '/store.html?id=' + encodeURIComponent(flat(store && store.id));
  }

  // ---- (c) 店舗ごとの title / description ----

  function storeTitle(store) {
    var name = flat(store && store.name);
    if (!name) return SITE_NAME;
    return name + '｜' + SITE_NAME;
  }

  // 例: 新宿のタイ料理店「ゲウチャイ 新宿店」。最寄駅は新宿駅（徒歩3分）。タイ直送の食材と…
  function storeDescription(store) {
    store = store || {};
    var name = flat(store.name);
    if (!name) return '';
    var area = flat(store.area);
    var parts = [(area ? area : '東京') + 'の' + kindLabel(store) + '「' + name + '」'];

    var station = flat(store.station);
    if (station) {
      var walk = U && U.normalizeWalkMinutes ? U.normalizeWalkMinutes(store.walkMinutes) : '';
      parts.push('最寄駅は' + station + (walk ? '（徒歩' + walk + '分）' : ''));
    }
    var desc = flat(store.description);
    if (desc) parts.push(desc);

    return clamp(parts.join('。').replace(/。+$/, '') + '。', DESC_MAX);
  }

  // ---- (d) JSON-LD（schema.org Restaurant） ----

  // 地図リンク: Google_Map_URL 列を safeUrl で検証して使う。無ければ住所から検索URLを自前組み立て
  //  （store.html の地図ボタンと同じ規則）。
  function mapLink(store) {
    var raw = flat(store && store.mapUrl);
    var safe = raw && U && U.safeUrl ? U.safeUrl(raw) : null;
    if (safe) return safe;
    var addr = flat(store && store.address);
    if (addr) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
    return '';
  }

  function imageList(store) {
    if (!U || !U.imageUrl) return [];
    var out = [];
    [store && store.exteriorImage, store && store.foodImage].forEach(function (raw) {
      if (!flat(raw)) return;
      var r = U.imageUrl(raw);
      if (r && r.ok && /^https:\/\//i.test(r.src) && out.indexOf(r.src) === -1) out.push(r.src);
    });
    return out;
  }

  // storeJsonLd: 店舗1件 → JSON-LD オブジェクト。空の値のキーは作らない（未確認の情報を断定しない）。
  function storeJsonLd(store, opts) {
    store = store || {};
    var origin = (opts && opts.origin) || SITE_ORIGIN;
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: flat(store.name),
      url: storeUrl(store, origin),
      servesCuisine: 'Thai',
    };

    var addr = flat(store.address);
    var area = flat(store.area);
    if (addr || area) {
      var pa = { '@type': 'PostalAddress', addressCountry: 'JP' };
      if (addr) pa.streetAddress = addr;
      if (area) pa.addressLocality = area;
      ld.address = pa;
    }
    if (area) ld.areaServed = { '@type': 'Place', name: area };

    // 最寄駅は Restaurant に専用プロパティが無いため additionalProperty で表す
    // （description にも「最寄駅は…」の形で入る）。
    var station = flat(store.station);
    if (station) {
      ld.additionalProperty = [{ '@type': 'PropertyValue', name: '最寄駅', value: station }];
    }

    var map = mapLink(store);
    if (map) ld.hasMap = map;

    var imgs = imageList(store);
    if (imgs.length) ld.image = imgs;

    var d = storeDescription(store);
    if (d) ld.description = d;

    var site = flat(store.websiteUrl);
    var safeSite = site && U && U.safeUrl ? U.safeUrl(site) : null;
    if (safeSite) ld.sameAs = [safeSite];

    return ld;
  }

  // serializeJsonLd: <script> の中身として安全な文字列にする。
  //  JSON.stringify だけでも属性値としては安全だが、不等号をユニコードエスケープに逃がして
  //  「</script> を含むデータでタグが閉じる」経路を構造的に潰す。
  function serializeJsonLd(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c');
  }

  // ---- DOM反映（ブラウザ専用） ----

  function setCanonical(href) {
    if (typeof document === 'undefined') return;
    var link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  function setMeta(selector, content) {
    if (typeof document === 'undefined') return;
    var m = document.querySelector(selector);
    if (m) m.setAttribute('content', content);
  }

  function injectJsonLd(obj) {
    if (typeof document === 'undefined') return null;
    var old = document.getElementById('ld-json-store');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var node = document.createElement('script');
    node.type = 'application/ld+json';
    node.id = 'ld-json-store';
    node.textContent = serializeJsonLd(obj);
    document.head.appendChild(node);
    return node;
  }

  // applyStore: 店舗データ到着後に store.html から1回だけ呼ぶ。
  function applyStore(store, opts) {
    if (!store) return;
    var origin = (opts && opts.origin) || SITE_ORIGIN;
    var title = storeTitle(store);
    var desc = storeDescription(store);
    var url = storeUrl(store, origin);

    document.title = title;
    if (desc) setMeta('meta[name="description"]', desc);
    setMeta('meta[property="og:title"]', title);
    if (desc) setMeta('meta[property="og:description"]', desc);
    setMeta('meta[property="og:url"]', url);
    setCanonical(url);
    injectJsonLd(storeJsonLd(store, { origin: origin }));
  }

  var api = {
    SITE_NAME: SITE_NAME,
    SITE_ORIGIN: SITE_ORIGIN,
    storeTitle: storeTitle,
    storeDescription: storeDescription,
    storeUrl: storeUrl,
    storeJsonLd: storeJsonLd,
    serializeJsonLd: serializeJsonLd,
    applyStore: applyStore,
    setCanonical: setCanonical,
  };

  if (typeof window !== 'undefined') {
    window.TS = window.TS || {};
    window.TS.seo = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
