/*
 * config.js — サイト全体の設定値（設計書v1.0 7章）
 * なぜ: 環境依存値（スプシID・GAS URL・トークン）を1か所に集約し、統合工程（Wave3）で実値化するため。
 * 読み込み順は固定: config → texts-default → util → data → render → search → log → ページ固有script（設計書2章）。
 * 名前空間は window.TS に集約する。
 */
window.TS = window.TS || {};

TS.config = {
  // 発注者の公開スプレッドシートID（要件2-1・実データ確認済み 2026-08-20）
  SPREADSHEET_ID: '1-XlTQlemuVNeQQ8fOX9Wc0OmNbTK9UQhwXtCxSLLTcA',

  // GAS WebアプリURL（未設定時 log.js は送信をスキップ・check.html は「未設定」表示。設計書4章）
  // 統合工程で発注者デプロイ後のURLを差し込む（要件7章・11工程Day7）。
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzf3UpkywE9Z5LpDSNvhoctnXcnZFCe6iLL0JN3l3TcW2-LElTRz7fZVZ2sZYOnHd27/exec',

  // サイト埋め込みトークン（GAS側 CONFIG.SITE_TOKEN と一致させる。要件7章・軽量フィルタ）
  // ページ読み込み単位で再利用可。使い捨てにしない（計測定義と整合・要件7章）。
  SITE_TOKEN: 'Sd4NmhpLJkd0nsGH3NxxIp9QHyytQatm', // 2026-08-25発行。GAS側CONFIG.SITE_TOKENと一致させる(要件7章・ソースから読める前提の軽量フィルタ)

  // sessionStorageキャッシュの有効分数（要件2-3・通常反映は最大10分）
  CACHE_MINUTES: 10,

  // gviz接続先ベースURL。空=本番(https://docs.google.com)。ローカル検証でモックサーバーに
  // 向けるときだけ一時的に設定する（本番納品時は必ず空に戻す・check.htmlの診断対象）。
  GVIZ_BASE_URL: '',

  // おすすめ条件チップの最終フォールバック（要件2-4）。
  // 通常は Site_Texts の key「recommend_chips」（カンマ区切り）が優先され、
  // それも空のときにこの配列を使う。要素の形式は texts-default.js の recommend_chips と同じ
  //  = 「表示ラベルのみ」（設計書10-5裁定・パイプ形式廃止）。カテゴリは
  // index.html の resolveChipParamKey がマスタ突合で自動判定し、未解決ラベルは表示しない。
  RECOMMEND_CHIPS: [],

  // ステージングフラグ（要件10章②・設計書13-G-4）。true の間は log.js が送信する
  // body に test:true を含め、GAS側がSearch_Counts/Search_FreeWord/Contact_Logの
  // テストデータを本番集計と区別できる形（月キー'TEST'・行末「テスト」列）で記録する。
  // 検収引き渡し時にfalseへ変更すること（検収チェックリスト項目）。
  STAGING_MODE: true, // 2026-08-31 検収完了→本番運用へ切替（ログのtest印が外れ本番集計が始まる）

  // Google アナリティクス GA4 の測定ID（追加改修⑥-(f)・2026-09-22 発注者支給）。
  // 読み込みは assets/js/ga.js が担当し、STAGING_MODE:true の間は gtag.js を一切読み込まない
  // （ステージングのアクセスが本番の集計に混ざらないようにするため）。空にすれば計測を止められる。
  GA_MEASUREMENT_ID: 'G-Y1ZJ1WDZG2',
};
