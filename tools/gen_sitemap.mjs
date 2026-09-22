/*
 * gen_sitemap.mjs — sitemap.xml を生成する（追加改修⑥-(a)・2026-09-22）
 *
 * なぜ必要か: 店舗ページは store.html?id=… の1枚を使い回す作りで、検索エンジンは
 *  リンクをたどるだけでは全店舗にたどり着けない。公開スプレッドシート（gviz）から
 *  公開中の Store_ID を取り出し、固定ページと合わせて sitemap.xml を書き出す。
 *  店舗の増減は GitHub Actions（.github/workflows/sitemap.yml）が週1で拾って自動コミットする。
 *
 * 実行: node tools/gen_sitemap.mjs        （site/ 直下から。依存パッケージなし・Node18以降の fetch を使用）
 *   環境変数:
 *     SITE_ORIGIN   出力するURLの基点。未指定なら CNAME の内容、それも無ければ本番ドメイン。
 *     GVIZ_BASE_URL gviz の接続先（検証でモックに向けるとき用）。未指定なら https://docs.google.com
 *     OUT           出力先（既定 sitemap.xml）
 *
 * テスト: 文字列組み立て部分（parseStoreIdsFromGviz / buildSitemapXml / xmlEscape）は
 *   ネットワークもファイルも触らない純粋関数として export し、tests/core.test.mjs から検証する。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const DEFAULT_ORIGIN = 'https://thaispot-tokyo.com';

// sitemap に載せる固定ページ。
//  除外: check.html（診断ページ・noindex）／404.html／store.html と page.html の素のURL
//  （id が無いと「見つかりませんでした」表示になるため載せない）。
export const FIXED_PATHS = [
  '/',
  '/search.html',
  '/cafe.html',
  '/thaiselect.html',
  '/about.html',
  '/policy-listing.html',
  '/contact.html',
  '/privacy.html',
];

export function xmlEscape(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// gviz応答の外殻 `/*O_o*/ google.visualization.Query.setResponse({...});` を剥がして JSON.parse
// （assets/js/data.js の parseGviz と同じ考え方。生成側は Node なので別実装で持つ）。
export function parseGviz(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0 || e < s) throw new Error('gviz応答の外殻を検出できませんでした');
  return JSON.parse(text.slice(s, e + 1));
}

function normKey(v) { return String(v == null ? '' : v).normalize('NFKC').trim(); }

function isTrue(v) {
  if (v === true) return true;
  return ['TRUE', '1', 'YES'].includes(normKey(v).toUpperCase());
}

// parseStoreIdsFromGviz: gviz JSON → 公開中の Store_ID 配列（重複は先勝ち・空IDはスキップ）。
//  data.js の buildDB と同じ判定（Published が TRUE系・ID空行スキップ・重複先勝ち）にそろえてあるので、
//  sitemap の件数はサイトが実際に表示できる店舗数と一致する。
export function parseStoreIdsFromGviz(obj) {
  const table = (obj && obj.table) || { cols: [], rows: [] };
  const cols = table.cols || [];
  let labels = cols.map((c) => (c && c.label != null ? String(c.label) : ''));
  let rows = table.rows || [];
  if (!labels.some((l) => l.trim() !== '') && rows.length) {
    labels = ((rows[0].c) || []).map((c) => (c && c.v != null ? String(c.v) : ''));
    rows = rows.slice(1);
  }
  const index = {};
  labels.forEach((l, i) => {
    const k = normKey(l);
    if (k && !(k in index)) index[k] = i;
  });
  const idCol = index['Store_ID'];
  const pubCol = index['Published'];
  if (idCol == null) throw new Error('Storesシートに Store_ID 列が見つかりません');

  const seen = new Set();
  const ids = [];
  for (const r of rows) {
    const cell = r.c && r.c[idCol];
    const id = String(cell && cell.v != null ? cell.v : '').trim();
    if (!id) continue;
    const key = normKey(id);
    if (seen.has(key)) continue;
    seen.add(key);
    if (pubCol != null) {
      const p = r.c && r.c[pubCol];
      if (!isTrue(p && p.v)) continue;
    }
    ids.push(id);
  }
  return ids;
}

// buildSitemapXml: URLの組み立て（純粋関数）。storeIds は公開中のStore_ID配列。
export function buildSitemapXml({ origin = DEFAULT_ORIGIN, fixedPaths = FIXED_PATHS, storeIds = [], lastmod }) {
  const base = String(origin).replace(/\/+$/, '');
  const day = lastmod || todayJst();
  const urls = [
    ...fixedPaths.map((p) => base + p),
    ...storeIds.map((id) => base + '/store.html?id=' + encodeURIComponent(id)),
  ];
  const body = urls
    .map((u) => `  <url>\n    <loc>${xmlEscape(u)}</loc>\n    <lastmod>${xmlEscape(day)}</lastmod>\n  </url>`)
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body + '\n' +
    '</urlset>\n'
  );
}

// 生成日（日本時間のYYYY-MM-DD）。Actionsの実行環境はUTCなので明示的にJSTへ寄せる。
export function todayJst(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// ---- ここから下は実行時のみ（ファイル読み書き・ネットワーク） ----

export function readSpreadsheetId(configSource) {
  const m = /SPREADSHEET_ID\s*:\s*'([^']+)'/.exec(configSource);
  if (!m) throw new Error('config.js から SPREADSHEET_ID を読み取れませんでした');
  return m[1];
}

function resolveOrigin() {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/+$/, '');
  const cname = join(ROOT, 'CNAME');
  if (existsSync(cname)) {
    const host = readFileSync(cname, 'utf8').trim();
    if (host) return 'https://' + host;
  }
  return DEFAULT_ORIGIN;
}

async function main() {
  const configSource = readFileSync(join(ROOT, 'assets', 'js', 'config.js'), 'utf8');
  const sheetId = readSpreadsheetId(configSource);
  const gvizBase = (process.env.GVIZ_BASE_URL || 'https://docs.google.com').replace(/\/+$/, '');
  const url = `${gvizBase}/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&sheet=Stores`;

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Stores gviz HTTP ${res.status}`);
  const storeIds = parseStoreIdsFromGviz(parseGviz(await res.text()));
  if (!storeIds.length) throw new Error('公開中の店舗が0件でした（sitemapを壊さないため中止します）');

  const origin = resolveOrigin();
  const xml = buildSitemapXml({ origin, storeIds });
  const out = join(ROOT, process.env.OUT || 'sitemap.xml');
  writeFileSync(out, xml, 'utf8');
  console.log(`sitemap: ${out}  固定 ${FIXED_PATHS.length} 件 + 店舗 ${storeIds.length} 件 = ${FIXED_PATHS.length + storeIds.length} URL  origin=${origin}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('生成に失敗しました:', e.message); process.exit(1); });
}
