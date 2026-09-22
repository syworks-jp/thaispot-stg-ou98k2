/*
 * util.js — 安全描画・URL許可リスト・正規化・Drive画像URL変換（設計書v1.0 4章 / 要件2-4・11-2章）
 *
 * セキュリティ非交渉（設計書3章）:
 *  - 動的テキストは textContent のみ。innerHTML への文字列挿入は一切しない（反射型・格納型XSS防止）。
 *  - href/src に入る値は必ず safeUrl() を通す（^https?:// のみ許可、画像は data:image/ も可）。
 *
 * 二重出口（設計書8章）: ブラウザ = window.TS.util / Node = module.exports。
 *  module スコープでは window/document/location を参照しない（呼び出し時のみ参照）。
 */
(function () {
  'use strict';

  // ---- 正規化 ----

  // norm: トリム + NFKC（全角英数→半角等）。ID・選択肢の突合用（要件2-4「トリム＋全角→半角正規化」）。
  function norm(s) {
    if (s == null) return '';
    return String(s).normalize('NFKC').trim();
  }

  // normSearch: norm + ひらがな→カタカナ折りたたみ + 小文字化。フリーワード用（両辺に適用・要件2-4）。
  // なぜ: 「がぱお」で「ガパオ」をヒットさせる（かな折りたたみ）＋英字の大小差を無視する。
  function normSearch(s) {
    var t = norm(s).toLowerCase();
    // ひらがな(U+3041〜U+3096)を +0x60 でカタカナ(U+30A1〜U+30F6)へ寄せる
    t = t.replace(/[ぁ-ゖ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 0x60);
    });
    return t;
  }

  // normFacet: 条件チップ（エリア・最寄駅など）の突合と部分一致用の正規化（改修① 2026-09-22）。
  //  normSearch（NFKC＋トリム＋小文字化＋ひらがな→カタカナ折りたたみ）に加えて、空白と中黒を落とす。
  //  NFKC の時点で半角カナ「ｼﾝｼﾞｭｸ」→「シンジュク」、全角英数「１」→「1」、全角スペース→半角スペースまで
  //  済んでいるので、ここでは残りの表記ゆれだけを潰す。
  //  中黒・空白を落とす理由: 実データに「田町駅・三田駅」のような併記があり、「三田」で引けないと
  //  駅名入力欄の意味がないため。normSearch と分けたのは、フリーワード検索（要件2-4）の挙動を
  //  変えずに、チップの絞り込みだけを緩くするため。
  function normFacet(s) {
    if (s == null) return '';
    return normSearch(s).replace(/[ 　・･,]/g, '');
  }

  // normalizeWalkMinutes: 徒歩分数の表示可否を検証する（実装設計書13-I-7）。
  //  Walk_Minutes列は先方の自由入力欄のため「約5」「5分」等の非数値混入があり得る。
  //  半角化（NFKC）した上で /^\d+$/ に一致する値のみ表示用の文字列として返し、非数値は null（=表示自体を省略）。
  //  なぜ静かに丸めないか: 「約5」→「5」等の解釈をこちらで作ってしまうと誤った分数を断定表示することになるため、
  //  数値として確実な値のみ表示し、それ以外は要件2-3の「白画面にしない」の精神と同様に該当箇所を省略する。
  function normalizeWalkMinutes(raw) {
    if (raw == null) return null;
    var s = norm(raw);
    if (!s) return null;
    return /^\d+$/.test(s) ? s : null;
  }

  // ---- URL許可リスト（要件2-4 セキュリティ監査重大2・必須実装） ----

  // stripControl: 制御文字を全位置で除去する（実装設計書13-I-8）。
  // なぜ charCode ループか: 正規表現に制御文字リテラルを書くと環境によって化けるため、
  //  コードポイント判定で確実に落とす。C0(0x00-0x1F)・DEL/C1(0x7F-0xA0)・BOM(0xFEFF) が対象。
  //  半角/全角スペース(0x20/0x3000)はここでは対象外（「可視スペース」として下のtrim専用処理に回す）。
  function stripControl(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code <= 0x1f) continue;                  // C0制御文字（タブ・改行等。java\tscript:対策）
      if (code >= 0x7f && code <= 0xa0) continue;  // DEL・C1制御文字・NBSP
      if (code === 0xfeff) continue;                // BOM
      out += str.charAt(i);
    }
    return out;
  }

  // isSpaceChar: 「可視スペース」＝半角スペース(0x20)・全角スペース(0x3000)。
  function isSpaceChar(code) { return code === 0x20 || code === 0x3000; }

  // trimSpacesEnds: 先頭・末尾の可視スペースのみをtrimする（内部の可視スペースは残したまま返す）。
  function trimSpacesEnds(str) {
    var start = 0, end = str.length;
    while (start < end && isSpaceChar(str.charCodeAt(start))) start++;
    while (end > start && isSpaceChar(str.charCodeAt(end - 1))) end--;
    return str.slice(start, end);
  }

  // hasInnerSpace: trim後の文字列内部に可視スペースが残っているか。
  function hasInnerSpace(str) {
    for (var i = 0; i < str.length; i++) {
      if (isSpaceChar(str.charCodeAt(i))) return true;
    }
    return false;
  }

  // safeUrl: 許可した値だけ返し、危険なスキームは null。opts.image=true のとき data:image/...; も許可。
  // 前処理（実装設計書13-I-8で仕様変更）:
  //  1. 制御文字は位置を問わず除去（`java\tscript:` のようにスキームをタブ等で分断して
  //     許可判定をすり抜けるトリックを無力化するため。除去後 "javascript:" は ^https?:// に一致せず落ちる）
  //  2. 可視スペース（半角/全角）は前後のみtrimして許可（要件どおり「端のスペースはOK」）
  //  3. trim後も内部に可視スペースが残る値は null（値を静かに書き換えて通す=別の値にすり替えることになるため禁止。
  //     利用者に見えない改変をせず、そのまま不許可にして呼び出し側でリンク非表示にする）
  function safeUrl(value, opts) {
    opts = opts || {};
    if (value == null) return null;
    var s = trimSpacesEnds(stripControl(String(value)));
    if (!s) return null;
    if (hasInnerSpace(s)) return null; // 静かな書き換え禁止（実装設計書13-I-8）
    // 画像は data:image/xxx; のみ許可（; を必須にして svg のインラインscript等の余地を狭める）
    if (opts.image && /^data:image\/[a-z0-9.+-]+;/i.test(s)) return s;
    // 通常は http/https のみ許可。//evil や 相対パス・javascript: は不許可
    if (/^https?:\/\//i.test(s)) return s;
    return null;
  }

  // ---- Drive画像URL変換（要件6章） ----

  // Drive共有リンク5形式から fileId を取り出す（file/d/{id}/view, open?id=, uc?id=, thumbnail?id=, id単体）。
  function driveId(s) {
    var m;
    if ((m = s.match(/\/file\/d\/([A-Za-z0-9_-]{20,})/))) return m[1]; // file/d/{id}/view
    if ((m = s.match(/[?&]id=([A-Za-z0-9_-]{20,})/))) return m[1];     // open?id= / uc?id= / thumbnail?id=
    if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;                     // id単体
    return null;
  }

  var PLACEHOLDER = 'assets/img/placeholder.svg'; // 画像なし・不正値時のプレースホルダー（要件6章(c)）

  // imageUrl: 画像URLを {src, ok} に正規化。
  //  Drive共有リンク → thumbnail?id=...&sz=w800 に変換 / 通常URL → safeUrl通過でそのまま /
  //  失敗（不正スキーム・パース不能）→ プレースホルダー + ok:false（「原因不明で写真が出ない」防止）。
  function imageUrl(raw) {
    if (raw == null || String(raw).trim() === '') return { src: PLACEHOLDER, ok: false };
    var s = String(raw).trim();
    // Driveドメイン or 裸のfileIdのときだけid抽出を試す（通常URLの ?id= 誤検出を避ける）
    var isDrive = /drive\.google\.com|docs\.google\.com/.test(s) || /^[A-Za-z0-9_-]{20,}$/.test(s);
    if (isDrive) {
      var id = driveId(s);
      if (id) return { src: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800', ok: true };
    }
    var safe = safeUrl(s, { image: true });
    if (safe) return { src: safe, ok: true };
    return { src: PLACEHOLDER, ok: false };
  }

  // ---- DOM生成（ブラウザ専用） ----

  // el: 安全なDOM生成。attrs の href/src は内部で必ず safeUrl を適用（設計書3章-2）。
  //  children は文字列（textContent化）か Element配列。文字列はHTMLとして解釈されない。
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null) continue;
      if (k === 'class' || k === 'className') {
        node.className = v;
      } else if (k === 'text') {
        node.textContent = String(v); // 明示テキスト（安全）
      } else if (k === 'href' || k === 'src') {
        // href/src は必ず許可リストを通す。通らなければ属性自体を付けない（リンク非表示はページ側判断）。
        var safe = safeUrl(v, { image: k === 'src' });
        if (safe) node.setAttribute(k, safe);
      } else if (k === 'dataset' && typeof v === 'object') {
        for (var d in v) if (Object.prototype.hasOwnProperty.call(v, d)) node.dataset[d] = v[d];
      } else if (k.slice(0, 2) === 'on') {
        // on* は関数のときだけプロパティ登録。文字列を setAttribute しない（インラインハンドラ注入防止）。
        if (typeof v === 'function') node[k] = v;
      } else {
        // その他の属性は属性値として設定（属性値なのでスクリプト実行にはならない）
        node.setAttribute(k, v);
      }
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c == null) continue;
      if (typeof c === 'string' || typeof c === 'number') {
        node.appendChild(document.createTextNode(String(c)));
      } else {
        node.appendChild(c); // Element
      }
    }
  }

  // setText: textContent代入（id文字列 or 要素）。動的テキストの安全な差し込み口。
  function setText(elOrId, text) {
    var node = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (node) node.textContent = text == null ? '' : String(text);
  }

  // qs: URLパラメータ取得（デコード + trim）。URLSearchParamsが自動でデコードする。
  function qs(name) {
    var p = new URLSearchParams(location.search);
    var v = p.get(name);
    return v == null ? '' : String(v).trim();
  }

  var api = {
    el: el,
    setText: setText,
    safeUrl: safeUrl,
    norm: norm,
    normSearch: normSearch,
    normFacet: normFacet,
    normalizeWalkMinutes: normalizeWalkMinutes,
    imageUrl: imageUrl,
    qs: qs,
    PLACEHOLDER: PLACEHOLDER,
  };

  // 二重出口（設計書8章）
  if (typeof window !== 'undefined') {
    window.TS = window.TS || {};
    window.TS.util = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
