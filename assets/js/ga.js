/*
 * ga.js — Google アナリティクス GA4 の読み込み（追加改修⑥-(f)・2026-09-22）
 *
 * なぜ別ファイルか: 「ステージングでは計測しない」を1か所で判定するため。
 *   TS.config.STAGING_MODE === true のあいだは gtag.js を一切読み込まない（ステージングの
 *   アクセスが本番の集計に混ざらない）。false のときだけ動的に読み込んで config する。
 *
 * 読み込み方: 各ページの <head> に `<script defer src="assets/js/ga.js">` として置く。
 *   deferred script は本文中の <script>（config.js 等）の実行が全部終わってから走るため、
 *   body 末尾の config.js より後に実行されることが保証される（読み込み順の規約を崩さない）。
 *
 * 入れないページ: check.html（診断ページ・noindex）と 404.html。
 */
(function () {
  'use strict';

  function start() {
    var cfg = (window.TS && window.TS.config) || {};
    if (cfg.STAGING_MODE === true) return;          // ステージングでは計測しない（⑥-(f)）
    var id = String(cfg.GA_MEASUREMENT_ID || '').trim();
    if (!/^G-[A-Z0-9]+$/i.test(id)) return;         // 未設定・不正値なら何もしない

    if (window.__tsGaLoaded) return;                // 二重読み込み防止
    window.__tsGaLoaded = true;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    gtag('js', new Date());
    gtag('config', id);
  }

  // defer 付きで読み込めばこの時点で config.js は評価済みだが、
  // 万一 head 内で同期読み込みされた場合に備えて DOMContentLoaded まで待つ道も残す。
  if (window.TS && window.TS.config) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
