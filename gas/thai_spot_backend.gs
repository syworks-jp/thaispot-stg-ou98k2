/**
 * THAI SPOT TOKYO バックエンド（Google Apps Script）
 * 役割: ①検索ログの記録・集計 ②お問い合わせの受付・記録・メール通知 ③週1自己診断
 *
 * デプロイ: ウェブアプリ／次のユーザーとして実行=自分（発注者）／アクセスできるユーザー=全員
 * タイムゾーン: プロジェクト設定で Asia/Tokyo にすること（appsscript.json の timeZone）
 * 実装方針の正: 要件定義書v1.2改訂2（4章・7章・11-2章）
 */

// ================= 設定（着手時にここだけ書き換える） =================
const CONFIG = {
  LOG_SPREADSHEET_ID: 'PASTE_LOG_SPREADSHEET_ID', // 非公開ログ用スプシ（発注者所有・共有リンクなし）
  NOTIFY_EMAIL: 'PASTE_NOTIFY_EMAIL',             // 問い合わせ通知先（発注者指定）
  SITE_TOKEN: 'PASTE_RANDOM_TOKEN',               // サイト埋め込みトークン（サイト側と一致させる）
  MAIL_DAILY_LIMIT: 80,                            // 通知メールの1日上限（無料枠100通の保護・超過時は要約1通）
  RATE_LIMIT_PER_MIN: 30,                          // 同一トークンの分あたり受付上限（フラッド対策）
  FREEWORD_LOG_MAX_ROWS: 5000,                     // フリーワード生ログの上限（超えたら古い行から削除）
};

// シート名（非公開ログスプシ内）
const SHEET_COUNTS = 'Search_Counts';      // 条件別カウンタ（月別ロールアップ）
const SHEET_FREEWORD = 'Search_FreeWord';  // フリーワード生ログ（ローテーション）
const SHEET_CONTACT = 'Contact_Log';       // 問い合わせ記録
const SHEET_META = 'Meta';                 // 死活・メール件数などの内部管理

// お問い合わせ種別の許可リスト（仕様書3-9の5択。texts-default.jsのcontact_typesと同じ値を複製）
// 設計書13-G-2: サーバー側でも突合し、不一致は「その他」に丸める（拒否より安全側=記録は残す）
const CONTACT_TYPES = ['掲載情報の修正', '店舗掲載について', 'お仕事・連携について', 'サイトについて', 'その他'];

// ================= エントリポイント =================

/** 疎通確認用（ブラウザでURLを開くと動作確認できる） */
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: 'THAI SPOT TOKYO backend', time: new Date().toISOString() })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 受付本体。サイトからは Content-Type: text/plain で JSON文字列をPOSTする（CORSプリフライト回避）。
 * body: { token, kind: 'search'|'contact', ...payload, website: ''(ハニーポット) }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // 防御1: トークン検証（ソースから読める前提の軽量フィルタ。※完全防御ではない=仕様確認書に開示済み）
    if (!body || body.token !== CONFIG.SITE_TOKEN) return jsonOut({ ok: false, reason: 'token' });
    // 防御2: ハニーポット（画面に見えない入力欄が埋まっていたら機械投稿）
    if (body.website) return jsonOut({ ok: true }); // 気づかせず握りつぶす
    // 防御3: 分あたり受付上限（内容可変フラッド対策）
    if (isRateLimited()) return jsonOut({ ok: false, reason: 'busy' });

    if (body.kind === 'search') return handleSearch(body);
    if (body.kind === 'contact') return handleContact(body);
    return jsonOut({ ok: false, reason: 'kind' });
  } catch (err) {
    return jsonOut({ ok: false, reason: 'error' });
  }
}

// ================= 検索ログ（カウンタ加算方式・行枯渇しない） =================

/**
 * body: { kind:'search', conds: [{cat:'dish', val:'ガパオ'}, ...], freeword: 'トムヤム', test: bool }
 * Search_Counts: [月(yyyy-MM) | カテゴリ | 値 | 回数] — 同キー行に加算
 * 設計書13-G-4: body.testがtrueならステージング中の送信＝月キーを'TEST'にして本番集計と分離
 *   （移管時に月='TEST'の行だけ削除すればテストデータをクリアできる）
 */
function handleSearch(body) {
  const ss = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
  const isTest = !!body.test;
  const month = isTest ? 'TEST' : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');

  const conds = Array.isArray(body.conds) ? body.conds.slice(0, 12) : [];
  if (conds.length) {
    const lock = LockService.getScriptLock();
    lock.waitLock(5000); // 同時アクセスでのカウント欠落防止
    try {
      const sh = getOrCreateSheet(ss, SHEET_COUNTS, ['月', 'カテゴリ', '値', '回数']);
      const data = sh.getDataRange().getValues(); // ヘッダ込み
      const index = {}; // "月|cat|val" -> 行番号(1始まり)。キーは生値で組む（sanitizeForSheetのアポストロフィはシート格納時にGoogle側が剥がすため、
      // 既存行を読み直した値と一致させるには生値同士で比較する必要がある＝新規追記の書き込み時だけsanitizeを掛ける）
      for (let r = 1; r < data.length; r++) index[data[r][0] + '|' + data[r][1] + '|' + data[r][2]] = r + 1;
      conds.forEach(function (c) {
        const cat = clip(String(c.cat || ''), 30), val = clip(String(c.val || ''), 60);
        if (!cat || !val) return;
        const key = month + '|' + cat + '|' + val;
        if (index[key]) {
          const cell = sh.getRange(index[key], 4);
          cell.setValue(Number(cell.getValue() || 0) + 1);
        } else {
          // 設計書13-G-1: 直POSTでcat/valに=+-@始まりの文字列を送られても数式評価させない
          sh.appendRow([month, sanitizeForSheet(cat), sanitizeForSheet(val), 1]);
          index[key] = sh.getLastRow();
        }
      });
    } finally {
      lock.releaseLock();
    }
  }

  // フリーワード生ログ（別タブ・上限ローテーション）
  const fw = clip(String(body.freeword || '').trim(), 60);
  if (fw) {
    const sh = getOrCreateSheet(ss, SHEET_FREEWORD, ['日時', '検索語', 'テスト']);
    // 設計書13-G-1: フリーワードは利用者の自由入力＝数式インジェクション対策必須
    // 設計書13-G-4: テスト送信は行末「テスト」列に印を付け、移管時にフィルタ削除できる形にする
    sh.appendRow([now(), sanitizeForSheet(fw), isTest ? 'テスト' : '']);
    const over = sh.getLastRow() - 1 - CONFIG.FREEWORD_LOG_MAX_ROWS;
    if (over > 0) sh.deleteRows(2, over); // 古い行から削除
  }

  touchMeta('last_search'); // 死活監視用
  return jsonOut({ ok: true });
}

// ================= お問い合わせ =================

/**
 * body: { kind:'contact', name, email, type, store, message, test: bool }
 * Contact_Log(非公開)に記録 → 通知メール（プレーンテキスト・上限保護つき）
 * 設計書13-G-3: 記録（sh.appendRow）をメール送信より先に確定させる。メール送信はtry/catchで包み、
 *   失敗しても問い合わせの記録自体は残っているのでok応答を返す（利用者からは正常に見える）
 */
function handleContact(body) {
  const name = clip(String(body.name || '').trim(), 60);
  const email = clip(String(body.email || '').trim(), 120);
  // 設計書13-G-2: 仕様書5択の許可リスト突合。不一致は拒否せず「その他」に丸めて記録は残す
  const type = normalizeContactType(clip(String(body.type || '').trim(), 30));
  const store = clip(String(body.store || '').trim(), 80);
  const message = clip(String(body.message || '').trim(), 2000);
  if (!name || !email || !message) return jsonOut({ ok: false, reason: 'required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonOut({ ok: false, reason: 'email' });

  // 同一内容の短時間連投を破棄（5分窓）
  const cache = CacheService.getScriptCache();
  const dupKey = 'dup_' + Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, email + '|' + message, Utilities.Charset.UTF_8));
  if (cache.get(dupKey)) return jsonOut({ ok: true }); // 受け付けたふりで握りつぶす
  cache.put(dupKey, '1', 300);

  const isTest = !!body.test; // 設計書13-G-4: ステージング送信は行末「テスト」列に印を付ける
  const ss = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
  const sh = getOrCreateSheet(ss, SHEET_CONTACT, ['日時', 'お名前', 'メール', '種別', '店舗名', '内容', '通知', 'テスト']);

  // 記録を先に確定（メール送信の成否に関わらずここまでで問い合わせは残る）
  // 設計書13-G-1: 利用者由来の全文字列(name/email/type/store/message)はsanitizeForSheetを通す
  sh.appendRow([
    now(), sanitizeForSheet(name), sanitizeForSheet(email), sanitizeForSheet(type),
    sanitizeForSheet(store), sanitizeForSheet(message), '送信待ち', isTest ? 'テスト' : '',
  ]);
  const rowNum = sh.getLastRow();
  touchMeta('last_contact');

  // 通知メール（プレーンテキスト・利用者入力はラベル付き無加工・リンク化しない）
  // 失敗してもここまでの記録は既に残っているため、利用者へはok応答を返す
  let notified;
  try {
    notified = 'メール送信';
    const sentToday = incrementMeta('mail_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd'));
    if (sentToday <= CONFIG.MAIL_DAILY_LIMIT) {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL,
        subject: '【THAI SPOT】新しいお問い合わせ（' + (type || '種別なし') + '）',
        body: 'サイトに新しいお問い合わせが届きました。\n\n' +
          '▼利用者の入力（無加工で掲載しています。本文中のリンク等は不用意に開かないでください）\n' +
          '種別: ' + type + '\n店舗名: ' + (store || '（記載なし）') + '\nお名前: ' + name + '\n' +
          '返信先メール: ' + email + '\n----\n' + message + '\n----\n\n' +
          '全件の記録: ログ用スプレッドシートの「' + SHEET_CONTACT + '」タブ',
      });
    } else if (sentToday === CONFIG.MAIL_DAILY_LIMIT + 1) {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL,
        subject: '【THAI SPOT】お問い合わせ多数のため通知を一時まとめます',
        body: '本日の通知が上限に達しました。以降の本日分はスプレッドシートでご確認ください（全件記録されています）。',
      });
      notified = '上限超過(要約済)';
    } else {
      notified = '上限超過';
    }
  } catch (mailErr) {
    notified = '送信失敗'; // メール送信の失敗をここで握りつぶし、記録は既に残っているのでok応答を維持する
  }

  try {
    sh.getRange(rowNum, 7).setValue(notified); // 通知列だけ後追いで更新（記録本体には触れない）
  } catch (e) { /* 通知列の更新失敗は記録本体の成功に影響させない */ }

  return jsonOut({ ok: true });
}

// ================= 週1自己診断（時間主導トリガーで setupTriggers() から登録） =================

/** 初回セットアップ時に1回実行: 週1自己診断トリガーを登録 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklySelfCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklySelfCheck').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
}

/** 週1: ログ記録が長期間止まっていたら発注者へ知らせる（静かな死の防止） */
function weeklySelfCheck() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
    const meta = getOrCreateSheet(ss, SHEET_META, ['キー', '値']);
    const last = getMetaValue(meta, 'last_search');
    const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : 999;
    if (days > 14) {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL,
        subject: '【THAI SPOT】検索データの記録が止まっている可能性があります',
        body: '検索データの最終記録から' + Math.floor(days) + '日が経過しています。\n' +
          'サイトの診断ページ（/check.html）を開いて状態をご確認ください。\n' +
          '直らない場合は制作者（エスワイワークス）へご連絡ください。',
      });
    }
  } catch (e) { /* 自己診断自体の失敗は握りつぶす */ }
}

// ================= 内部ユーティリティ =================

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function now() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'); }
function clip(s, n) { return s.length > n ? s.slice(0, n) : s; }

/**
 * 設計書13-G-1: 数式インジェクション対策。
 * シートに書き込む文字列の先頭が = + - @ のいずれかならアポストロフィを前置し、
 * スプレッドシート/CSVエクスポート先での数式評価（外部データ引き込み等）を防ぐ。
 * 文字列のみを判定対象にする＝数値・Date等はそのまま通す（値の型を変えない）。
 */
function sanitizeForSheet(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

/** 設計書13-G-2: お問い合わせ種別のサーバー側検証。CONTACT_TYPESに無ければ「その他」に丸める */
function normalizeContactType(type) {
  return CONTACT_TYPES.indexOf(type) !== -1 ? type : 'その他';
}

function getOrCreateSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

function isRateLimited() {
  const cache = CacheService.getScriptCache();
  const key = 'rate_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmm');
  const cur = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(cur), 90);
  return cur > CONFIG.RATE_LIMIT_PER_MIN;
}

/**
 * Metaシートのキーに現在時刻を記録（死活監視用）
 * 設計書13-G-3: Search_Countsと同じLockServiceで保護（同時アクセスでの上書き競合防止）
 */
function touchMeta(key) {
  try {
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const ss = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
      const meta = getOrCreateSheet(ss, SHEET_META, ['キー', '値']);
      setMetaValue(meta, key, now());
    } finally {
      lock.releaseLock();
    }
  } catch (e) { /* ログ本体の成功を優先 */ }
}

/**
 * Metaシートのカウンタをインクリメントして現在値を返す（メール日次上限用）
 * 設計書13-G-3: Search_Countsと同じLockServiceで保護（同時問い合わせでのカウント欠落防止）。
 * 呼び出し元(handleContact)がtry/catchで包むため、ここでは例外を握りつぶさない。
 */
function incrementMeta(key) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.LOG_SPREADSHEET_ID);
    const meta = getOrCreateSheet(ss, SHEET_META, ['キー', '値']);
    const cur = Number(getMetaValue(meta, key) || 0) + 1;
    setMetaValue(meta, key, cur);
    return cur;
  } finally {
    lock.releaseLock();
  }
}

function getMetaValue(sheet, key) {
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) if (data[r][0] === key) return data[r][1];
  return null;
}
function setMetaValue(sheet, key, value) {
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (data[r][0] === key) { sheet.getRange(r + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}
