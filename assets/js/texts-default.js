/*
 * texts-default.js — Site_Texts全キーの組み込みデフォルト文言（設計書v1.0 5章・6章・10章 / 要件2-2）
 *
 * 役割: 文言層の無停止（要件2-2）。Site_Textsシートに同名キーがあればそちらが優先され、
 *  無ければ・取得失敗時はここが使われる（プライバシーポリシーが消える事故を構造的に防ぐ）。
 *  ここに書く文言は「初回リリース原稿」そのもの（要件2-2: 組み込みデフォルト＝初回リリース原稿と同一）。
 *  「（仮）」等の未完成マーカーは残さない。発注者本人しか書けない情報（事業者名・連絡先等）のみ
 *  【発注者確認】マーカーで明示し、検収前に発注者原稿へ差し替える（要件工程Day10）。
 *
 * 所有権: Wave2-E（文章担当）に移管済み（実装設計書v1.0 10-5）。キー体系は他ページ実装（index.html /
 *  render.js / store.html / contact.html / check.html）が既に参照しているため、既存キー名は維持し、
 *  実際に使われているのに欠けていたキー（hero_catch / footer_caution）のみ追加し、内容を全面的に
 *  初回リリース品質へ引き上げた（2026-08-24）。
 *
 * recommend_chips の形式（★確定・パイプ形式は廃止。設計書10-5裁定）:
 *  カンマ区切りの「表示ラベルのみ」の文字列。ラベル自体が実マスタ（Menus/Scenes/Features/Stores.Area/
 *  Stores.Nearest_Station/Stores.Store_type）のいずれかの値と完全一致する必要がある
 *  （index.html の resolveChipParamKey / check.html の整合チェックが同一ロジックでカテゴリを自動判定する）。
 *  一致しないラベルは表示されない（無言で消える＝要件2-4の「無言の誤誘導禁止」に反しないよう、
 *  check.html 側で警告表示される設計）。下記の値は実データ実測（2026-08-20 SA読取）で存在確認済み。
 */
window.TS = window.TS || {};

TS.textsDefault = {
  // ===== サイト共通 =====
  site_brand: 'THAI SPOT TOKYO',
  site_tagline: '東京のタイ料理店・タイカフェを、料理・エリア・駅・シーンから探せます。',

  // ===== 各ページ title / description（要件1章・9章 SEO基本） =====
  meta_title_home: 'THAI SPOT TOKYO｜東京のタイ料理店・タイカフェ検索',
  meta_desc_home: '東京都内のタイ料理店・タイカフェを、料理・エリア・駅・シーン・特徴から探せる検索サイトです。',
  meta_title_search: 'お店を探す｜THAI SPOT TOKYO',
  meta_desc_search: '料理・エリア・駅・シーン・特徴・フリーワードを組み合わせて、東京のタイ料理店を検索できます。',
  meta_title_store: '店舗詳細｜THAI SPOT TOKYO',
  meta_desc_store: '店舗の紹介・アクセス・メニュー・特徴・地図情報をまとめて掲載しています。',
  meta_title_cafe: '東京のタイカフェを探す｜THAI SPOT TOKYO',
  meta_desc_cafe: '東京にあるタイカフェを一覧から探せます。エリアやメニューなど、追加条件での絞り込みにも対応しています。',
  meta_title_thaiselect: 'Thai SELECTとは？｜THAI SPOT TOKYO',
  meta_desc_thaiselect: 'タイ国政府商務省が認定する「Thai SELECT」について、THAI SPOT TOKYOでのご案内です。',
  meta_title_about: 'THAI SPOT TOKYOについて｜THAI SPOT TOKYO',
  meta_desc_about: 'THAI SPOT TOKYOの運営方針・掲載についてのご案内です。',
  meta_title_policy_listing: '掲載情報について｜THAI SPOT TOKYO',
  meta_desc_policy_listing: '掲載情報の確認方法や、修正のご依頼方法について説明しています。',
  meta_title_contact: 'お問い合わせ｜THAI SPOT TOKYO',
  meta_desc_contact: '掲載情報の修正、店舗掲載、お仕事・連携についてなど、各種お問い合わせはこちらから受け付けています。',
  meta_title_privacy: 'プライバシーポリシー｜THAI SPOT TOKYO',
  meta_desc_privacy: '個人情報の取り扱いや、アクセス解析・検索データの利用について説明しています。',
  meta_title_page: 'お知らせ｜THAI SPOT TOKYO',
  meta_desc_page: 'THAI SPOT TOKYOからのお知らせ・特集ページです。',
  meta_title_404: 'ページが見つかりません｜THAI SPOT TOKYO',
  meta_desc_404: 'お探しのページは見つかりませんでした。ホームまたはお店を探すページをご利用ください。',

  // ===== ホーム（要件1章・仕様書3-1） =====
  hero_image_url: '', // 空ならCSSグラデで代替（設計書1章・6章）。統合工程で最適化版URLを設定
  // 実装設計書10-4で必須と確定したキー名。index.htmlが db.texts('hero_catch') で参照する（仕様書3-1メインコピー）。
  // 改行位置は発注者指定（2026-08-26）: 「今日行きたい、」の後で改行して2行に。hero__titleはwhite-space:pre-wrapのため\nが反映される。
  hero_catch: '今日行きたい、\n東京のタイを見つけよう。',
  // 仕様書3-1「説明」（最終ゲート仕上げで追加）
  hero_lead: '食べたい料理・場所・利用シーンから、東京のタイ料理店＆タイカフェを探せます。',
  // 仕様書3-1メインボタン（実装設計書13-H-2で新設）: ヒーロー内［条件からお店を探す →］→search.html
  hero_cta_label: '条件からお店を探す →',
  home_search_placeholder: '店名・料理名・駅名で検索',
  home_search_button: '検索',
  home_explore_heading: '何から探す？',
  home_block_dish: '料理から探す',
  home_block_area: 'エリアから探す',
  home_block_station: '駅から探す',
  home_block_scene: 'シーンから探す',
  home_block_feature: '特徴から探す',
                                    // タイル自体のラベルはhtml直書き(hardcode)のまま(item7の対象は説明文のみ)。削除は指示範囲外のため維持し報告に記載。
  // 6ブロック各タイルの説明文（仕様書3-1本文・実装設計書13-H-7で新設。index.htmlのexplore-tile内に表示）
  home_block_dish_desc: 'ガパオ、カオマンガイ、パッタイなど、食べたいタイ料理からお店を探せます。',
  home_block_area_desc: '新宿、渋谷、池袋など、街・エリアからお店を探せます。',
  home_block_station_desc: '新宿駅、高田馬場駅、代々木駅など、最寄駅からお店を探せます。',
  home_block_scene_desc: '一人ランチ、デート、女子会、家族など、今日の利用シーンに合うお店を探せます。',
  home_block_feature_desc: 'Thai SELECT、タイスイーツ、タイドリンクなど、お店の特徴から探せます。',
  // 実装設計書13-H-6: 6番目タイルの説明文(旧「タイプから探す」→「タイカフェ」置換後の説明文)
  home_block_cafe_desc: 'タイティーやタイスイーツを楽しみたい日に。東京のタイカフェを探せます。',
  home_recommend_heading: 'おすすめの条件から探す',
  // 実データ実在値のみで構成（2026-08-20 SA読取・実測確認済み）。実装設計書13-H-10裁定で
  // 仕様書3-1の初期表示例（ガパオ／カオマンガイ／パッタイ／一人ランチ／デート／タイスイーツあり／
  // Thai SELECT認定）に寄せた。「ガパオ」は実在値「ガパオライス」に置換（fixtures/Menus.json確認済み。
  // 置換対応表は報告書へ）。ガパオライス・カオマンガイ・パッタイ=Menus.Menu_Name／
  // 一人ランチ・デート=Scenes.Scene_Name／タイスイーツあり・Thai SELECT認定=Features.Feature_Name。
  // ラベル＝検索条件の値そのもの（設計書10-5裁定）なので、実マスタと文字が違う「呼びかけ風」の表記
  // （例:「新宿のお店」「タイカフェ」）は使わない＝マスタ名と一致しないと check.html で警告・非表示になる。
  recommend_chips: 'ガパオライス,カオマンガイ,パッタイ,一人ランチ,デート,タイスイーツあり,Thai SELECT認定',

  // --- タイ料理、何を食べる？（仕様書3-1・実装設計書13-H-1で新設） ---
  // チップはindex.htmlのresolveChipParamKey(recommend_chipsと同一の解決関数・重複実装なし)でMenusと
  // 突合し、未解決ラベルは非表示。仕様書の「ガパオ」は実在値「ガパオライス」に置換済み（他9件は実在値と一致・
  // fixtures/Menus.json確認済み。置換対応表は報告書へ）。
  home_dishes_heading: 'タイ料理、何を食べる？',
  home_dishes_lead: '「タイ料理が食べたい。でも、何を選べばいい？ そんなときは料理から探してみてください。」',
  home_dishes_popular_heading: '定番から探す',
  home_dishes_popular: 'ガパオライス,カオマンガイ,パッタイ,グリーンカレー,トムヤムクン',
  home_dishes_rare_heading: 'ちょっと珍しいタイ料理',
  home_dishes_rare: 'カオソーイ,カオカームー,パネンカレー,ラートナー,カオヤム',
  home_dishes_cta_label: 'すべてのメニューから探す →',

  // 仕様書3-1「タイカフェ」セクションの逐語文言（最終ゲート仕上げで原典準拠に更新）
  home_cafe_title: '東京でタイカフェへ。',
  home_cafe_desc: 'タイティーやタイスイーツを楽しめる、東京のタイカフェを探してみませんか？',
  home_cafe_button: 'タイカフェを見る →', // 実装設計書13-H-9: 仕様書の［→］表記に統一(未使用キーを実際に使う形に=13-H-5)
  home_thaiselect_title: 'Thai SELECT認定店を探す',
  home_thaiselect_desc: 'タイ国政府が認定する「Thai SELECT」。東京の認定店から探すこともできます。',
  home_thaiselect_button: 'Thai SELECT認定店を見る →', // 実装設計書13-H-9(未使用キーを実際に使う形に=13-H-5)
  // Thai SELECT導線2ボタン化（実装設計書13-H-5・仕様書3-1「［Thai SELECT認定店を見る →］［Thai SELECTとは？ →］」）
  home_thaiselect_secondary_button: 'Thai SELECTとは？ →',

  // --- About導線（ホーム・仕様書3-1/3-7・実装設計書13-H-3で新設。promo-panelとして追加） ---
  home_about_title: '東京のタイ料理を、もっと探しやすく。',
  home_about_desc: 'THAI SPOT TOKYOは、東京のタイ料理店・タイカフェを、料理・場所・利用シーン・特徴から探せるサービスです。',
  home_about_button: 'THAI SPOT TOKYOについて →',

  // ===== お店を探す / 検索結果（要件1章・3章・仕様書3-2/3-3 の文言どおり） =====
  search_heading: '今日行きたいお店を探す',
  search_lead: '気になる条件を組み合わせて、今日行きたいお店を探してみてください。',
  search_freeword_label: 'キーワード',
  search_freeword_placeholder: '店名・料理名・駅名で検索',
  search_cat_dish: '食べたいもの',
  search_cat_area: 'エリア',
  search_cat_station: '最寄駅',
  search_cat_scene: '利用シーン',
  search_cat_feature: 'こだわり',
  search_cat_type: '店舗タイプ',
  search_button: 'この条件で探す',
  search_clear: '条件をクリア',
  search_results_heading: '検索結果',
  search_change: '条件を変更する',
  // 0件時（仕様書3-3の文言どおり）
  search_zero: '条件に合うお店が見つかりませんでした。条件を減らして、もう一度探してみてください。',
  // 条件フォールバック時の一言（要件2-4）。ページ側で対象値を前に付けて表示する
  search_dropped_note: 'の条件が見つからなかったため、全店舗を表示しています。',

  // ===== エリア・最寄駅の主要リスト（改修① 2026-09-22・内容確認書 1.(d)） =====
  // 運営者が Site_Texts の同名キーで並びを変えられる。区切りは読点「、」。
  // ここに書いた名前のうち、Stores シートに実在する値だけがチップになる（存在しない名前は黙って外す）。
  // 既定値の根拠: 2026-09-22 時点の公開店舗150件の実データ集計。
  //  エリア=掲載4件以上の9エリア（新宿13/渋谷11/中目黒6/六本木5/銀座5/池袋4/新大久保4/神保町4/下北沢4・
  //  全74エリア中この9つで56店舗＝37%をカバー）。
  //  最寄駅=掲載3件以上の13駅（渋谷10/新宿7/中目黒5/六本木4/新橋4/新大久保4/東京4/神保町4/下北沢4/
  //  新宿三丁目3/吉祥寺3/日比谷3/池袋3・全88駅中この13駅で58店舗＝39%をカバー）。
  major_areas: '新宿、渋谷、中目黒、六本木、銀座、池袋、新大久保、神保町、下北沢',
  major_stations: '渋谷駅、新宿駅、中目黒駅、六本木駅、新橋駅、新大久保駅、東京駅、神保町駅、下北沢駅、新宿三丁目駅、吉祥寺駅、日比谷駅、池袋駅',

  // 展開/折りたたみのボタン文言と駅名入力欄（改修① 1.(a)(b)）。
  // Site_Texts に同名キーを足せば上書きできるが、運営者に用意してもらう必須行は
  // major_areas / major_stations の2つだけ（ここは組み込み既定で足りる）。
  search_area_show_all: 'すべてのエリアを見る',
  search_area_show_major: '主要なエリアだけ表示',
  search_station_show_all: '駅一覧を見る',
  search_station_show_major: '主要な駅だけ表示',
  search_station_filter_label: '駅名で絞り込む',
  search_station_filter_placeholder: '駅名を入力（例: 渋谷）',
  search_station_no_match: '入力に一致する駅はありませんでした。別の言葉で試してください。',

  // Menus.Categoryの日本語見出し一元化（実装設計書11章TODO10・13-H-15で追加）。
  // search.html/cafe.html側は db.texts('menu_category_'+category.toLowerCase()) を先に引き、
  // 空なら各ページのハードコード表→キー自体/その他の順で解決する（実装設計書13-I-6）。
  menu_category_rice: 'ご飯もの',
  menu_category_curry: 'カレー',
  menu_category_noodle: '麺類',
  menu_category_salad: 'サラダ',
  menu_category_soup: 'スープ',
  menu_category_grill: '焼き物',
  menu_category_fried: '揚げ物',
  menu_category_stir_fry: '炒め物',
  menu_category_hot_pot: '鍋物',
  menu_category_dessert: 'デザート',
  menu_category_drink: 'ドリンク',
  menu_category_other: 'その他',

  // ===== 店舗詳細（要件5章・仕様書3-4） =====
  store_menu_heading: 'このお店で食べられるもの',
  store_scene_heading: 'こんな時におすすめ',
  store_feature_heading: 'お店の特徴',
  store_info_heading: '店舗情報',
  store_maps_button: 'Google Mapsで見る →', // 実装設計書13-H-9: 仕様書の［→］表記に統一
  store_official_button: '公式サイトを見る →', // 実装設計書13-H-9
  store_instagram_button: 'Instagramを見る →', // 実装設計書13-H-9
  store_tiktok_button: 'Soaの紹介動画を見る', // TikTok_URLがある時のみ（8/20先方指定・文言確定。矢印は付与しない=先方指定文言が優先）
  store_video_heading: 'このお店を動画で見る',
  store_video_button: '動画を見る →', // 実装設計書13-H-9
  store_lunch_on: 'ランチ営業○',
  store_dinner_on: 'ディナー営業○',
  store_walk_prefix: '徒歩',
  store_walk_suffix: '分',
  // 実装設計書10-5裁定: Verified_Date列は画面非表示（8/20先方指定が後勝ち）。
  // 「情報確認日：」を具体的な日付と一緒に出す運用は行わない＝store_verified_prefixは現状どのページからも
  // 参照しない想定（store.html実装済み・store_verified_noteのみ使用を確認済み）。将来的な用途のためキー自体は残す。
  store_verified_prefix: '情報確認日：',
  // 仕様書3-4/3-11で共通の注意書き文言（footer_cautionと同一文面）
  store_verified_note: '※掲載情報は確認日時点のものです。営業時間・メニュー等は変更される場合があります。ご来店前に店舗の公式情報をご確認ください。',
  store_report_button: '掲載情報の修正を連絡する →', // 実装設計書13-H-9
  // 実装設計書13-H-13: badge_restaurant/badge_cafeは未使用キーのため削除済み
  // （バッジはStore_type生値表示を維持=仕様書のRestaurant/Cafe英語表記と一致。render.js/store.htmlは
  //  db.texts()を経由せずstore.storeType生値をそのまま表示している）。
  badge_thaiselect: 'Thai SELECT',

  // ===== タイカフェ（要件1章5番・仕様書3-5） =====
  cafe_heading: '東京のタイカフェを探す',
  cafe_catch: '東京で、ちょっとタイ気分。',
  cafe_lead: '東京にあるタイカフェを集めました。タイティーやタイスイーツなど、気になるメニューから探すこともできます。',

  // ===== お問い合わせ（要件7章・仕様書3-9） =====
  contact_heading: 'お問い合わせ',
  contact_lead: 'THAI SPOT TOKYOをご利用いただきありがとうございます。掲載情報の修正、店舗掲載、お仕事・連携についてなどのお問い合わせはこちらからお願いいたします。',
  contact_name_label: 'お名前',
  contact_email_label: 'メールアドレス',
  contact_type_label: 'お問い合わせ種別',
  // 種別5択（仕様書3-9の文言どおり・カンマ区切り）
  contact_types: '掲載情報の修正,店舗掲載について,お仕事・連携について,サイトについて,その他',
  contact_store_label: '店舗名（店舗に関するお問い合わせの場合・任意）',
  contact_message_label: 'お問い合わせ内容',
  contact_submit: '送信する',
  contact_sending: '送信中…',
  // 送信完了（仕様書3-9の文言どおり）
  contact_success: 'お問い合わせありがとうございます。内容を確認のうえ、必要に応じてご連絡いたします。',
  contact_error: '送信に失敗しました。時間をおいて再度お試しください。',

  // ===== 文章ページ本文（Site_Texts駆動・pre-wrap表示・要件1章6〜10・仕様書3-6〜3-8/3-10） =====

  // --- Thai SELECTとは（仕様書3-6を基に構成。事実ベースの説明のみ・公式ロゴ画像は使わない=要件0-2） ---
  thaiselect_title: 'Thai SELECTとは？',
  thaiselect_body:
    'タイ料理店選びのひとつの目印に。\n' +
    '\n' +
    'Thai SELECTについて\n' +
    'Thai SELECTは、タイ国政府商務省が認定するタイ料理店・タイ食品の認証制度です。THAI SPOT TOKYOでは、Thai SELECTの認定を確認できた店舗を検索できます。\n' +
    '\n' +
    '認定店を探してみよう\n' +
    '東京にはThai SELECTに認定されたタイ料理店があります。お店選びのひとつの参考として、認定店から探してみてください。\n' +
    '\n' +
    '※制度の詳細や最新の認定状況については、Thai SELECTの公式情報をご確認ください。当サイトでは公式ロゴ等は掲載せず、テキストでのご案内のみとしています。',
  thaiselect_cta_label: 'Thai SELECT認定店を見る →', // 実装設計書13-H-9

  // --- About（仕様書3-7を基に構成） ---
  about_title: 'THAI SPOT TOKYOについて',
  about_body:
    '東京のタイ料理を、もっと探しやすく。\n' +
    '\n' +
    'THAI SPOT TOKYOは、東京都内のタイ料理店・タイカフェを、料理・場所・利用シーン・特徴などから探せる店舗検索サービスです。\n' +
    '\n' +
    '「ガパオが食べたい」「新宿でタイ料理を探したい」「一人でも入りやすいお店が知りたい」「タイスイーツを楽しみたい」——そんな“今日行きたい”に合わせて、お店を探せる場所を目指しています。\n' +
    '\n' +
    'お店の探し方\n' +
    '料理・エリア・駅・利用シーン・店舗の特徴など、さまざまな条件からお店を探せます。\n' +
    '\n' +
    '運営について\n' +
    'Operated by Thailand Market Lab（TML）\n' +
    'THAI SPOT TOKYOは、タイに関する市場・店舗・旅行などの情報を調査・発信するThailand Market Lab（TML）が運営しています。\n' +
    '\n' +
    '【発注者確認】運営者の代表者名・所在地・連絡先など、追加で記載したい情報があればご記入ください。',
  about_cta_label: 'お店を探してみる →', // 実装設計書13-H-9

  // --- 掲載情報について（仕様書3-8を基に構成。Verified_Date非表示の裁定=設計書10-5に合わせ、
  //     「店舗ごとに情報確認日を表示している」という誤った説明にならないよう文言を調整している） ---
  policy_listing_title: '掲載情報について',
  policy_listing_body:
    '掲載情報の確認について\n' +
    'THAI SPOT TOKYOでは、公開されている店舗情報等をもとに、店舗情報や提供メニュー等を確認・整理したうえで掲載しています。確認や整理のタイミングは、店舗ごとに異なります。\n' +
    '\n' +
    '最新情報について\n' +
    '営業時間、メニュー、価格、店舗情報等は、確認後に変更されている場合があります。ご来店前には、必ず店舗の公式サイト・公式SNS等で最新情報をご確認ください。\n' +
    '\n' +
    '掲載内容の修正について\n' +
    '掲載情報に変更や誤り等がございましたら、お問い合わせフォームよりお知らせください。内容を確認のうえ、対応いたします。\n' +
    '\n' +
    'ご利用にあたって\n' +
    '当サイトへの店舗掲載に費用はいただいておりません。掲載情報の正確性については十分に注意しておりますが、内容を保証するものではありませんので、あらかじめご了承ください。',
  policy_listing_cta_label: '掲載情報の修正を連絡する →', // 実装設計書13-H-9

  // --- プライバシーポリシー（要件11-2の必須項目を全て含む。事業者固有の情報は【発注者確認】） ---
  privacy_title: 'プライバシーポリシー',
  privacy_body:
    'THAI SPOT TOKYO（以下「当サイト」といいます）は、以下のとおり個人情報およびアクセス情報を取り扱います。\n' +
    '\n' +
    '事業者名\n' +
    '【発注者確認】事業者名（屋号・運営者名等）を記載してください。\n' +
    '\n' +
    '取得する情報と利用目的\n' +
    '当サイトでは、次の情報を取得する場合があります。\n' +
    '\n' +
    '（1）お問い合わせフォームにご入力いただいた情報\n' +
    'お名前、メールアドレス、お問い合わせ種別、店舗名（任意）、お問い合わせ内容を取得します。いただいた情報は、お問い合わせへの回答および対応のためにのみ利用し、法令に基づく場合を除き、ご本人の同意なく第三者に提供することはありません。\n' +
    '\n' +
    '（2）検索条件のご利用状況\n' +
    '当サイトの改善のため、検索時に選択された条件（料理・エリア・駅・利用シーン・特徴・店舗タイプ）の利用回数を記録します。あわせて、フリーワード検索欄にご入力いただいた検索語も記録します。これらは特定の個人を識別する目的では取得していませんが、入力内容によっては結果的に個人に関する情報が含まれる可能性があります。取得したデータは公開されていない社内用の記録として保管し、公開ページに掲載することはありません。\n' +
    '\n' +
    '（3）アクセス解析（Google アナリティクス4）\n' +
    '当サイトはアクセス状況の把握のため、Googleが提供するアクセス解析ツール「Googleアナリティクス4（GA4）」を利用しています。GA4はCookie等を利用してブラウザの利用状況（閲覧ページ、滞在時間、参照元、おおよその地域等）を取得します。取得した情報の送信先はGoogle社であり、Google社のプライバシーポリシーに基づいて管理されます。\n' +
    'Google社のプライバシーポリシー：https://policies.google.com/privacy\n' +
    'Cookieの利用やGA4によるデータ取得を望まれない場合は、ブラウザの設定でCookieを無効にする、またはGoogleが提供する「Googleアナリティクス オプトアウト アドオン」をご利用いただくことで、データの収集を停止できます。\n' +
    '\n' +
    '保存期間\n' +
    '取得した情報は、利用目的の達成に必要な期間を目安に保管し、不要となったものから順次削除します。\n' +
    '\n' +
    '第三者提供について\n' +
    '取得した情報は、法令に基づく場合を除き、ご本人の同意なく第三者に提供することはありません。\n' +
    '\n' +
    '開示・訂正・削除等のご請求について\n' +
    'ご自身の個人情報の開示・訂正・削除等をご希望の場合は、下記のお問い合わせ窓口までご連絡ください。内容を確認のうえ、法令に従って対応いたします。\n' +
    '\n' +
    'お問い合わせ窓口\n' +
    '事業者名：【発注者確認】事業者名を記載してください\n' +
    '連絡先メールアドレス：【発注者確認】個人情報に関するお問い合わせ受付用のメールアドレスを記載してください\n' +
    '\n' +
    '本ポリシーの変更について\n' +
    '本ポリシーの内容は、法令の改正やサービス内容の変更等に応じて、予告なく変更する場合があります。変更後の内容は、当ページに掲載した時点から効力を生じるものとします。\n' +
    '\n' +
    '制定日：【発注者確認】ポリシーの制定日（公開日）を記載してください',
  privacy_cta_label: 'お問い合わせはこちら',

  // ===== フッター（要件1章・Pages自動リスト・render.jsが db.texts('footer_caution') で参照） =====
  footer_pages_heading: 'お知らせ・特集',
  // 実装設計書10-4で必須と確定したキー名。未設定時は段落非表示（render.js側の仕様）。仕様書3-11の注意書きと同文。
  footer_caution: '※掲載情報は確認日時点のものです。営業時間・メニュー等は変更される場合があります。ご来店前に店舗の公式情報をご確認ください。',
  // 実装設計書13-H-4: 仕様書3-11「Operated by Thailand Market Lab」に一致させた（旧値は「© THAI SPOT TOKYO」
  // のハードコードだった。render.js側もこのキーをtexts経由で描画するよう修正済み・ハードコード廃止）。
  footer_copyright: 'Operated by Thailand Market Lab',

  // ===== 404（要件1章11番） =====
  notfound_title: 'ページが見つかりませんでした',
  notfound_body: 'URLが変更されたか、削除された可能性があります。下記からお探しのページをご覧ください。',
  notfound_home_button: 'ホームへ戻る',
  notfound_search_button: 'お店を探す',

  // ===== page.html（Pagesシート駆動の自由ページ）の状態表示 =====
  page_notfound_title: 'ページが見つかりませんでした',
  page_notfound_body: 'お探しのページは存在しないか、現在非公開になっている可能性があります。下記からお探しのページをご覧ください。',
};
