/*
 * THAI SPOT TOKYO — render.js（共通描画コンポーネント）
 * 実装設計書v1.0 4章のAPIコントラクトに準拠。TS.util(util.js)・TS.config(config.js)に依存。
 *
 * href/srcの扱いについて(重要・Wave2/Wave3引き継ぎ事項):
 *   TS.util.el()の attrs には href/src を渡さない。理由: このファイルの内部リンク(store.html?id=...、
 *   ページ内遷移、assets/img/placeholder.svg等)は相対パスであり、安全なURLスキーム許可リスト
 *   (TS.util.safeUrl、^https?://のみ許可)を通すと弾かれてしまう可能性がある。
 *   そこで本ファイルでは以下のルールに統一している:
 *     1. 内部の相対リンク・ローカル画像 → 要素生成後に直接 el.href / el.src へ代入(このファイル内で
 *        組み立てる文字列なので安全。IDはencodeURIComponentで必ずエスケープする)
 *     2. シート/外部由来の値(広告の画像URL・リンク先URL等) → TS.util.safeUrl() / TS.util.imageUrl() を
 *        明示的に呼び、結果がnullなら該当要素・該当リンクを描画しない(要件2-4章のURLスキーム許可リスト)
 *   Wave2(store.html/contact.html等で公式サイト/Instagram/TikTok/Maps等の外部URLを扱うページ)も同じ
 *   ルールに揃えること。
 */
(function () {
  'use strict';

  window.TS = window.TS || {};
  var TS = window.TS;
  TS.render = TS.render || {};

  // ---- 共通ナビゲーション定義（サイト構造は固定なのでシートデータに依存しない） ----
  var NAV_ITEMS = [
    { pageId: 'home', label: 'ホーム', href: 'index.html' },
    { pageId: 'search', label: 'お店を探す', href: 'search.html' },
    { pageId: 'cafe', label: 'タイカフェ', href: 'cafe.html' },
    { pageId: 'thaiselect', label: 'Thai SELECTとは', href: 'thaiselect.html' },
    // 実装設計書13-H-8: 「About」→仕様書3-11の「このサイトについて」に統一（ヘッダー/フッター共通=NAV_ITEMS）
    { pageId: 'about', label: 'このサイトについて', href: 'about.html' },
    { pageId: 'contact', label: 'お問い合わせ', href: 'contact.html' }
  ];

  // フッターは仕様書3-11の掲載順（お店を探す/タイカフェ/Thai SELECTとは/このサイトについて/
  // 掲載情報について/お問い合わせ/プライバシーポリシー）。先頭のホームは3-11のブランド名リンク相当。
  var FOOTER_LINKS = [
    { pageId: 'home', label: 'ホーム', href: 'index.html' },
    { pageId: 'search', label: 'お店を探す', href: 'search.html' },
    { pageId: 'cafe', label: 'タイカフェ', href: 'cafe.html' },
    { pageId: 'thaiselect', label: 'Thai SELECTとは', href: 'thaiselect.html' },
    { pageId: 'about', label: 'このサイトについて', href: 'about.html' },
    { pageId: 'policy-listing', label: '掲載情報について', href: 'policy-listing.html' },
    { pageId: 'contact', label: 'お問い合わせ', href: 'contact.html' },
    { pageId: 'privacy', label: 'プライバシーポリシー', href: 'privacy.html' }
  ];

  // ---- 内部ユーティリティ ----

  // el()にhref/srcを渡さず直接代入するための小ヘルパー（このファイル冒頭コメントのルール1）
  function setInternalHref(el, path) {
    el.href = path;
  }

  function clear(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function normEq(a, b) {
    if (typeof TS.util === 'undefined' || typeof TS.util.norm !== 'function') {
      return (a || '') === (b || '');
    }
    return TS.util.norm(a || '') === TS.util.norm(b || '');
  }

  // ==========================================================================
  // TS.render.chrome(pageId, db)
  //   共通ヘッダー(ロゴ+ハンバーガーnav)とフッター(nav+Pages公開ONの「お知らせ・特集」自動リスト+注意書き)を描画。
  //   引数形は chrome(pageId, db) を採用（dbは省略可）。
  //   理由: ページは即座にヘッダー/フッターの骨格を表示したい(体感速度)が、フッターの「お知らせ・特集」は
  //   db.pages(公開ONのPages)が確定してから初めて描画できる。そこで db を渡せる場合は即時に、
  //   まだ無い場合(データ取得前)は骨格のみ描画し、データ到着後に TS.render.footerNotices(db) を
  //   呼んでもらう2段構えにした。404.htmlのように最初からdbを渡さない運用も可能。
  // ==========================================================================
  TS.render.chrome = function (pageId, db) {
    renderHeader(pageId);
    renderFooter(pageId, db);
  };

  function renderHeader(pageId) {
    var mount = document.getElementById('site-header');
    if (!mount) return;
    clear(mount);
    // マウント先にクラスを付与。CSSの .site-header(sticky・z-index:100・背景)はこのクラスに
    // 定義されており、未付与だと開いたメニューが後続のヒーロー(position:relative)の下に隠れて
    // 「タップしても何も起きない」ように見えるバグになる(2026-08-25 iPhone実機で発覚・原因特定済み)。
    mount.classList.add('site-header');

    var inner = TS.util.el('div', { class: 'site-header__inner' });

    var logo = TS.util.el('a', { class: 'site-logo' }, ['THAI SPOT TOKYO']);
    setInternalHref(logo, 'index.html');

    // ハンバーガーはbutton+JSトグル方式。当初のlabel+隠しチェックボックス方式は
    // iOS Safariでタップが反応しない実機報告があったため置き換え(2026-08-25・iPhone 17 Pro Max)。
    var hamburger = TS.util.el('button', {
      class: 'hamburger', type: 'button',
      'aria-label': 'メニューを開く', 'aria-expanded': 'false', 'aria-controls': 'site-nav'
    }, [
      TS.util.el('span', {}, []),
      TS.util.el('span', {}, []),
      TS.util.el('span', {}, [])
    ]);

    var nav = TS.util.el('nav', { class: 'site-nav', id: 'site-nav' });
    NAV_ITEMS.forEach(function (item) {
      var isCurrent = item.pageId === pageId;
      var a = TS.util.el('a', { class: 'site-nav__link' + (isCurrent ? ' is-current' : '') }, [item.label]);
      setInternalHref(a, item.href);
      if (isCurrent) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });

    hamburger.onclick = function () {
      var open = nav.classList.toggle('is-open');
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
      hamburger.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    };

    inner.appendChild(logo);
    inner.appendChild(hamburger);
    inner.appendChild(nav);
    mount.appendChild(inner);
  }

  function renderFooter(pageId, db) {
    var mount = document.getElementById('site-footer');
    if (!mount) return;
    clear(mount);
    mount.classList.add('site-footer'); // ヘッダー同様、CSS定義(.site-footer)への結線


    var nav = TS.util.el('nav', { class: 'footer-nav' });
    FOOTER_LINKS.forEach(function (item) {
      var a = TS.util.el('a', { class: 'footer-nav__link' }, [item.label]);
      setInternalHref(a, item.href);
      nav.appendChild(a);
    });
    mount.appendChild(nav);

    // お知らせ・特集(db.pages)とfooter注意書き(texts('footer_caution'))は
    // db確定後にfillFooterData()で埋める。mount先を先に用意しておく。
    var notices = TS.util.el('div', { class: 'footer-notices', id: 'footer-notices' });
    mount.appendChild(notices);

    var caution = TS.util.el('p', { class: 'footer-caution', id: 'footer-caution' });
    mount.appendChild(caution);

    // 実装設計書13-H-4: footer_copyrightをtexts経由で描画（ハードコード廃止）。dbが未確定な初回描画では
    // texts-defaultの値を即時表示し（要件2-2: 文言層無停止・白画面/空欄禁止）、db確定後にfillFooterDataで
    // Site_Textsの値があれば上書きする。
    var initialCopyText = (TS.textsDefault && TS.textsDefault.footer_copyright) || 'Operated by Thailand Market Lab';
    var copy = TS.util.el('p', { class: 'footer-copyright', id: 'footer-copyright' }, [initialCopyText]);
    mount.appendChild(copy);

    if (db) fillFooterData(db);
  }

  function fillFooterData(db) {
    var noticesMount = document.getElementById('footer-notices');
    if (noticesMount) {
      clear(noticesMount);
      var pages = Array.isArray(db.pages) ? db.pages.filter(function (p) { return p && p.published; }) : [];
      if (pages.length) {
        var title = TS.util.el('h3', { class: 'footer-notices__title' }, ['お知らせ・特集']);
        var list = TS.util.el('ul', { class: 'footer-notices__list' });
        pages.forEach(function (p) {
          var li = TS.util.el('li', { class: 'footer-notices__item' });
          var a = TS.util.el('a', { class: 'footer-notices__link' }, [p.title || '(無題)']);
          setInternalHref(a, 'page.html?id=' + encodeURIComponent(p.id || ''));
          li.appendChild(a);
          list.appendChild(li);
        });
        noticesMount.appendChild(title);
        noticesMount.appendChild(list);
      }
      // 公開Pagesが0件なら何も表示しない(孤児ページ防止の自動リストなので空表示は不要)
    }

    var cautionMount = document.getElementById('footer-caution');
    if (cautionMount && typeof db.texts === 'function') {
      var text = db.texts('footer_caution');
      if (text) cautionMount.textContent = text;
    }

    // 実装設計書13-H-4: footer_copyrightをSite_Texts優先で上書き（無ければtexts-default初期値のまま）
    var copyMount = document.getElementById('footer-copyright');
    if (copyMount && typeof db.texts === 'function') {
      var copyText = db.texts('footer_copyright');
      if (copyText) copyMount.textContent = copyText;
    }
  }

  // データ取得後にフッターだけ更新したいページ向けの公開ヘルパー
  // (例: 先にchrome(pageId)を呼んで骨格を出し、TS.data.load()解決後にこれを呼ぶ)
  TS.render.footerNotices = function (db) {
    if (!db) return;
    fillFooterData(db);
  };

  // ==========================================================================
  // TS.render.storeCard(store, db) → Element
  //   検索結果カード(要件1章/3章): 画像(無ければ非表示)/店舗名/エリア/最寄駅・徒歩/紹介文/
  //   Restaurant・Cafeバッジ/Thai SELECTバッジ。カードタップでstore.html?id=へ。
  // ==========================================================================
  TS.render.storeCard = function (store, db) {
    store = store || {};
    var card = TS.util.el('a', { class: 'store-card' });
    setInternalHref(card, 'store.html?id=' + encodeURIComponent(store.id || ''));

    // 画像: 未登録なら要素ごと非表示。登録済みだが変換失敗ならプレースホルダー(要件6章の一般ルール)
    var rawImage = store.exteriorImage || store.foodImage || '';
    if (rawImage) {
      var media = TS.util.el('div', { class: 'store-card__media' });
      var imgResult = (typeof TS.util.imageUrl === 'function') ? TS.util.imageUrl(rawImage) : null;
      var img = TS.util.el('img', { class: 'store-card__img', loading: 'lazy', alt: store.name || '' });
      if (imgResult && imgResult.ok && imgResult.src) {
        img.src = imgResult.src;
      } else {
        img.src = 'assets/img/placeholder.svg';
      }
      media.appendChild(img);
      card.appendChild(media);
    }

    var body = TS.util.el('div', { class: 'store-card__body' });

    // 実装設計書13-H-11: 表示順を仕様書3-3どおり「画像→店舗名→エリア/駅/徒歩→紹介文→バッジ」に変更
    // （旧実装はバッジを店舗名の前に描画していた）。クラス名は一切変更しない(担当Iのページが依存するため)。
    body.appendChild(TS.util.el('div', { class: 'store-card__name' }, [store.name || '']));

    var metaText = buildMetaText(store);
    if (metaText) body.appendChild(TS.util.el('div', { class: 'store-card__meta' }, [metaText]));

    if (store.description) {
      body.appendChild(TS.util.el('p', { class: 'store-card__desc' }, [store.description]));
    }

    // バッジ: 店舗タイプ(Restaurant/Cafe) + Thai SELECT認定(該当時のみ)。表示順は最後(13-H-11)。
    var badges = TS.util.el('div', { class: 'store-card__badges' });
    var type = (store.storeType || '').trim();
    if (type) {
      var typeCls = /cafe/i.test(type) ? 'badge--type-cafe' : 'badge--type-restaurant';
      badges.appendChild(TS.util.el('span', { class: 'badge ' + typeCls }, [type]));
    }
    if (hasThaiSelect(store, db)) {
      badges.appendChild(TS.util.el('span', { class: 'badge badge--thaiselect' }, ['Thai SELECT']));
    }
    if (badges.childNodes.length) body.appendChild(badges);

    card.appendChild(body);
    return card;
  };

  // 「📍 エリア・最寄駅 徒歩X分」形式(デザイン案_CD統合_v1.htmlの.cardmeta表記に準拠)
  //
  // TS.render.metaLine(store) として公開(設計書11章TODO7): store.htmlが個別実装していた
  // buildMetaLine相当のロジックをここに一本化する。挙動は本ファイルの既存ロジックのまま変更しない
  // (store.html側の旧実装は区切りに全角スペースを使っていたが、それはデザイン確定ファイルの
  //  .cardmeta表記「📍 新宿・新宿駅 徒歩3分」=半角スペースと食い違っていた個別実装側の乖離だった)。
  function buildMetaText(store) {
    var parts = [];
    var areaStation = [store.area, store.station].filter(Boolean).join('・');
    if (areaStation) parts.push('📍 ' + areaStation);
    // 担当Iからの申し送り(実装設計書13-I-7): Walk_Minutesは先方の自由入力欄のため「約5」等の非数値混入が
    // あり得る。TS.util.normalizeWalkMinutes()(半角化後 /^\d+$/ 検証・非数値はnull)を通し、数値として
    // 確実な値のみ「徒歩X分」表示する(非数値は「徒歩約5分分」のような誤表示を避けるため表示自体を省略)。
    var walkMin = (typeof TS.util.normalizeWalkMinutes === 'function') ? TS.util.normalizeWalkMinutes(store.walkMinutes) : null;
    if (walkMin) parts.push('徒歩' + walkMin + '分');
    return parts.join(' ');
  }
  TS.render.metaLine = buildMetaText;

  // Thai SELECT認定はFeatures/Store_Featuresの「Thai SELECT」行の紐付けで判定(要件2-4: ID突合は正規化して比較)
  //
  // TS.render.hasThaiSelect(store, db) として公開(設計書11章TODO7): store.htmlが個別実装していた
  // 同名ロジックをここに一本化する。判定内容は変更しない。
  function hasThaiSelect(store, db) {
    if (!db || !store || !Array.isArray(db.features) || !Array.isArray(db.storeFeatures)) return false;
    var targetIds = db.features
      .filter(function (f) { return normEq(f.name, 'Thai SELECT'); })
      .map(function (f) { return f.id; });
    if (!targetIds.length) return false;
    return db.storeFeatures.some(function (sf) {
      if (!normEq(sf.storeId, store.id)) return false;
      return targetIds.some(function (id) { return normEq(id, sf.otherId); });
    });
  }
  TS.render.hasThaiSelect = hasThaiSelect;

  // ==========================================================================
  // TS.render.adSlot(position, db) → Element|null
  //   該当位置(home_bottom/results_bottom/store_bottom)にvisible=trueの広告が無ければ何も返さない。
  // ==========================================================================
  TS.render.adSlot = function (position, db) {
    if (!db || !Array.isArray(db.ads)) return null;
    var ads = db.ads.filter(function (ad) { return ad && ad.position === position && ad.visible; });
    if (!ads.length) return null;

    var wrap = TS.util.el('div', { class: 'ad-slot', 'data-ad-position': position });
    var renderedCount = 0;

    ads.forEach(function (ad) {
      if (!ad.imageUrl) return;
      var imgResult = (typeof TS.util.imageUrl === 'function') ? TS.util.imageUrl(ad.imageUrl) : null;
      if (!imgResult || !imgResult.ok || !imgResult.src) return; // 画像が無効な広告は描画しない

      var img = TS.util.el('img', { class: 'ad-slot__img', loading: 'lazy', alt: '広告' });
      img.src = imgResult.src;

      var safeLink = ad.linkUrl && typeof TS.util.safeUrl === 'function' ? TS.util.safeUrl(ad.linkUrl) : null;
      if (safeLink) {
        var a = TS.util.el('a', { class: 'ad-slot__link', target: '_blank', rel: 'noopener noreferrer' });
        a.href = safeLink; // 外部URL: TS.util.safeUrl()で検証済みの値のみ設定
        a.appendChild(img);
        wrap.appendChild(a);
      } else {
        wrap.appendChild(img);
      }
      renderedCount++;
    });

    return renderedCount ? wrap : null;
  };

  // ==========================================================================
  // TS.render.warningsBanner(db) → Element|null（実装設計書13-H-12で新設）
  //   db.warnings に「必須シート／必須列」欠損系の警告が1件でもあれば、ページ先頭に挿入する小さな
  //   注意バナーを返す。無ければ null（呼び出し側は if (banner) で挿入をガード。search.html等は
  //   実装済み・#warnings-banner-mount への appendChild を想定）。
  //   フィルタ条件: warnings文字列に「必須」を含むもののみ対象（data.jsの実装で「必須シート」取得失敗と
  //   「必須列」欠損の2種類の警告だけがこの語を含む。非必須のURL/画像列欠損や、Site_Texts/Pages/Ads未作成
  //   等の想定内フォールバックは対象外＝実運用で頻発する正常な状態でバナーが出続けるのを避けるため）。
  //   スタイル: style.cssは編集不可のため、既存の警告色コンポーネント(.state-panel--error)を流用しつつ、
  //   フルページ状態表示よりコンパクトに収まるようインラインstyleで最小限だけ上書きする
  //   （全ページ共通で描画される関数のため、特定ページの<style>ブロックには頼れない）。
  TS.render.warningsBanner = function (db) {
    if (!db || !Array.isArray(db.warnings)) return null;
    var hasRequiredMissing = db.warnings.some(function (w) {
      return typeof w === 'string' && w.indexOf('必須') !== -1;
    });
    if (!hasRequiredMissing) return null;

    var banner = TS.util.el('div', { class: 'state-panel state-panel--error' }, [
      TS.util.el('p', { class: 'state-panel__desc' }, ['シート設定に問題がある可能性があります。/check.html で確認してください。'])
    ]);
    banner.style.padding = '10px 16px';
    banner.style.textAlign = 'left';
    banner.style.marginBottom = 'var(--space-4)';
    return banner;
  };

  // ==========================================================================
  // TS.render.chips(items, opts) → Element
  //   items: 文字列配列 または {value,label}の配列
  //   opts:
  //     selectedValue: 現在選択中の値(単一選択・.on付与用)
  //     goldValues: 金縁(.y)にする値の一覧(Array|Set|関数(value)=>bool)
  //     hrefFor(value): 指定時は<a>として描画し、hrefFor(value)の戻り値(相対パス文字列)を
  //                     直接href代入する(遷移モード。例: ホームのおすすめチップ→search.html?dish=...)
  //     onSelect(value, chipEl): 指定時は<button>として描画しクリックで呼び出す(トグルモード。
  //                     例: search.htmlの条件選択チップ。選択状態の管理・再検索は呼び出し側の責務)
  // ==========================================================================
  TS.render.chips = function (items, opts) {
    opts = opts || {};
    var wrap = TS.util.el('div', { class: 'chips' });
    if (opts.name) wrap.setAttribute('data-chip-group', opts.name);

    (items || []).forEach(function (raw) {
      var item = (typeof raw === 'string') ? { value: raw, label: raw } : raw;
      var isSelected = opts.selectedValue != null && normEq(opts.selectedValue, item.value);
      var isGold = resolveGold(opts.goldValues, item.value);

      var cls = 'chip';
      if (isSelected) cls += ' on';
      if (isGold) cls += ' y';

      var chipEl;
      if (typeof opts.hrefFor === 'function') {
        chipEl = TS.util.el('a', { class: cls }, [item.label]);
        setInternalHref(chipEl, opts.hrefFor(item.value));
      } else {
        chipEl = TS.util.el('button', { class: cls, type: 'button' }, [item.label]);
        if (isSelected) chipEl.setAttribute('aria-pressed', 'true');
        if (typeof opts.onSelect === 'function') {
          chipEl.addEventListener('click', function () { opts.onSelect(item.value, chipEl); });
        }
      }
      wrap.appendChild(chipEl);
    });

    return wrap;
  };

  function resolveGold(goldValues, value) {
    if (!goldValues) return false;
    if (typeof goldValues === 'function') return !!goldValues(value);
    if (typeof goldValues.has === 'function') return goldValues.has(value);
    if (Array.isArray(goldValues)) return goldValues.indexOf(value) !== -1;
    return false;
  }
})();
