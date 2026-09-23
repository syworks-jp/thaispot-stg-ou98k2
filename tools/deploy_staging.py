#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deploy_staging.py — 本番用のサイト内容をステージング用に機械変換して出力ディレクトリへ配置する。

なぜ必要か:
  ステージングは本番とは別リポ・別ドメイン（GitHub Pages のサブパス配信）で公開する。
  本番のファイルを手で書き換えると戻し忘れが起きるので、「本番のまま」を唯一の正とし、
  ステージング固有の差分はこのスクリプトが毎回ゼロから機械的に当てる。

やること（この5点だけ。ほかは一切変更しない）:
  1. assets/js/config.js の STAGING_MODE: false -> true
     （問い合わせ・検索ログが GAS 側で test 扱いになり、本番集計に混ざらない。
       あわせて ga.js が gtag.js を読み込まなくなる = ステージングのPVがGA4に入らない）
  2. 全 HTML の <head> 直後に <meta name="robots" content="noindex, nofollow"> を挿入
     （既に robots meta を持つページ = 404.html / check.html は重複させない）
  3. CNAME を出力に含めない（ステージングに独自ドメインを当てない）
  4. robots.txt を「全拒否」に置き換える（Sitemap 行なし。ステージングを検索させない）
  5. 404.html の <base href="/"> を <base href="/<リポ名>/"> に
     （GitHub Pages のプロジェクトページはサブパス配信なので、"/" 固定だとリンクが壊れる）

使い方:
  python tools/deploy_staging.py --out ../stg_repo --base-path thaispot-stg-xxxxxx
  ※ 再実行可能。--out の中身は .git を残して作り直すので、修正が入ったら再実行するだけでよい。
  ※ --base-path はリポ名だけ渡せばよい（前後の / は自動で付く）。Git Bash から
     "/名前/" のように先頭スラッシュ付きで渡すと MSYS がWindowsパスへ勝手に変換して
     壊すので、スラッシュなしで渡すこと（壊れた値は下のチェックで弾く）。

依存なし（標準ライブラリのみ）。
"""

import argparse
import io
import os
import re
import shutil
import sys

# --- 出力に含めないもの ---------------------------------------------------
# .git は作業用リポの履歴なので当然除外。.github は「ステージングでも同じ workflow が
# 動くこと」を確認する対象なので **含める**（依頼書 2-(a)）。
EXCLUDE_DIRS = {'.git'}
EXCLUDE_FILES = {'CNAME'}          # 差し替え3: ステージングには独自ドメインを当てない

STAGING_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n'
NOINDEX_META = '<meta name="robots" content="noindex, nofollow">'

# <head> 開きタグ（属性なし想定だが念のため許容）
RE_HEAD_OPEN = re.compile(r'<head(\s[^>]*)?>', re.IGNORECASE)
RE_ROBOTS_META = re.compile(r'<meta\s+name=["\']robots["\']', re.IGNORECASE)
# 行頭から始まる本物のプロパティ代入だけを対象にする。
# （コメント文中の「STAGING_MODE:true の間は…」に誤爆しないため。2026-09-22 実際に誤爆した）
RE_STAGING_MODE = re.compile(r'^(\s*STAGING_MODE\s*:\s*)false', re.MULTILINE)
RE_STAGING_MODE_TRUE = re.compile(r'^\s*STAGING_MODE\s*:\s*true', re.MULTILINE)
RE_BASE_HREF = re.compile(r'(<base\s+href=["\'])([^"\']*)(["\'])', re.IGNORECASE)


def log_change(path, what, before, after):
    print('  [%s] %s' % (path, what))
    print('      - %s' % before)
    print('      + %s' % after)


def read_text(path):
    # 改行はそのまま保つ（newline='' で変換しない）。サイトは UTF-8。
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write_text(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)


def clean_out_dir(out_dir):
    """出力先を空にする。ただしステージングリポの .git は壊さない。"""
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
        return
    for name in os.listdir(out_dir):
        if name == '.git':
            continue
        p = os.path.join(out_dir, name)
        if os.path.isdir(p) and not os.path.islink(p):
            shutil.rmtree(p)
        else:
            os.remove(p)


def copy_tree(src_dir, out_dir):
    copied = 0
    for root, dirs, files in os.walk(src_dir):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDE_DIRS)
        rel_root = os.path.relpath(root, src_dir)
        if rel_root == '.':
            rel_root = ''
        dst_root = os.path.join(out_dir, rel_root) if rel_root else out_dir
        if not os.path.isdir(dst_root):
            os.makedirs(dst_root)
        for name in sorted(files):
            if rel_root == '' and name in EXCLUDE_FILES:
                print('  [%s] 出力に含めない（ステージングには独自ドメインを当てない）' % name)
                continue
            shutil.copy2(os.path.join(root, name), os.path.join(dst_root, name))
            copied += 1
    return copied


def patch_config(out_dir):
    """差し替え1: STAGING_MODE: false -> true"""
    rel = os.path.join('assets', 'js', 'config.js')
    path = os.path.join(out_dir, rel)
    if not os.path.isfile(path):
        print('  !! %s が見つからない（STAGING_MODE を切り替えられない）' % rel)
        return False
    src = read_text(path)
    new, n = RE_STAGING_MODE.subn(r'\1true', src, count=1)
    if n != 1:
        if RE_STAGING_MODE_TRUE.search(src):
            print('  [%s] STAGING_MODE は既に true（変更なし）' % rel)
            return True
        print('  !! %s の STAGING_MODE: false が見つからない' % rel)
        return False
    write_text(path, new)
    log_change(rel, 'STAGING_MODE を true に', 'STAGING_MODE: false', 'STAGING_MODE: true')
    return True


def patch_html_noindex(out_dir):
    """差し替え2: 全 HTML の <head> 先頭に noindex メタを入れる（重複させない）"""
    ok = True
    for name in sorted(os.listdir(out_dir)):
        if not name.lower().endswith('.html'):
            continue
        path = os.path.join(out_dir, name)
        src = read_text(path)
        head = RE_HEAD_OPEN.search(src)
        if not head:
            print('  !! %s に <head> が無い' % name)
            ok = False
            continue
        if RE_ROBOTS_META.search(src):
            print('  [%s] robots メタは既にある（重複させない）' % name)
            continue
        nl = '\r\n' if '\r\n' in src[:2000] else '\n'
        insert_at = head.end()
        new = src[:insert_at] + nl + NOINDEX_META + ' <!-- staging only -->' + src[insert_at:]
        write_text(path, new)
        log_change(name, '<head> 先頭に noindex を挿入', '(なし)', NOINDEX_META)
    return ok


def patch_robots_txt(out_dir):
    """差し替え4: robots.txt を全拒否に"""
    path = os.path.join(out_dir, 'robots.txt')
    before = read_text(path).strip().replace('\n', ' / ') if os.path.isfile(path) else '(なし)'
    write_text(path, STAGING_ROBOTS_TXT)
    log_change('robots.txt', 'ステージングは全拒否に置き換え', before,
               STAGING_ROBOTS_TXT.strip().replace('\n', ' / '))
    return True


def patch_404_base(out_dir, base_path):
    """差し替え5: 404.html の <base href> をサブパスに"""
    path = os.path.join(out_dir, '404.html')
    if not os.path.isfile(path):
        print('  !! 404.html が見つからない')
        return False
    src = read_text(path)
    m = RE_BASE_HREF.search(src)
    if not m:
        print('  !! 404.html に <base href> が無い')
        return False
    before = m.group(2)
    if before == base_path:
        print('  [404.html] <base href> は既に %s（変更なし）' % base_path)
        return True
    new = src[:m.start()] + m.group(1) + base_path + m.group(3) + src[m.end():]
    write_text(path, new)
    log_change('404.html', '<base href> をサブパス配信に合わせる',
               '<base href="%s">' % before, '<base href="%s">' % base_path)
    return True


def normalize_base_path(value):
    v = (value or '/').strip()
    # Git Bash(MSYS)が "/name/" を "C:/Program Files/Git/name/" に化かすことがある。
    # ドライブレターや Git のインストール先が混ざっていたら値が壊れているので止める。
    if ':' in v or '\\' in v:
        sys.exit('--base-path の値が壊れている（MSYSのパス変換の可能性）: %s\n'
                 '  → スラッシュなしでリポ名だけ渡すこと 例 --base-path thaispot-stg-abc123' % v)
    if not v.startswith('/'):
        v = '/' + v
    if not v.endswith('/'):
        v = v + '/'
    return v


def main():
    # Windows の既定コンソール(cp932)だと差分の日本語が化けるので UTF-8 に固定する。
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    here = os.path.dirname(os.path.abspath(__file__))
    default_src = os.path.dirname(here)  # tools/ の親 = サイトルート

    ap = argparse.ArgumentParser(description='本番の内容をステージング用に変換して配置する')
    ap.add_argument('--src', default=default_src, help='コピー元（既定: このスクリプトの親ディレクトリ）')
    ap.add_argument('--out', required=True, help='出力先（ステージングリポのローカルclone）')
    ap.add_argument('--base-path', default='/',
                    help='GitHub Pages のサブパス 例 /thaispot-stg-abc123/（404.html の <base> に使う）')
    args = ap.parse_args()

    src_dir = os.path.abspath(args.src)
    out_dir = os.path.abspath(args.out)
    base_path = normalize_base_path(args.base_path)

    if not os.path.isfile(os.path.join(src_dir, 'index.html')):
        sys.exit('コピー元がサイトルートに見えない（index.html が無い）: %s' % src_dir)
    if os.path.normcase(out_dir) == os.path.normcase(src_dir):
        sys.exit('出力先とコピー元が同じ。本番の作業ツリーを書き換えてしまうので中止する。')

    print('== deploy_staging ==')
    print('  src       : %s' % src_dir)
    print('  out       : %s' % out_dir)
    print('  base-path : %s' % base_path)

    print('\n-- 1) 出力先を作り直す（.git は残す） --')
    clean_out_dir(out_dir)

    print('\n-- 2) コピー（.git 以外・.github は含む） --')
    n = copy_tree(src_dir, out_dir)
    print('  %d ファイルをコピー' % n)

    print('\n-- 3) ステージング差し替え（5点） --')
    ok = True
    ok &= patch_config(out_dir)
    ok &= patch_html_noindex(out_dir)
    ok &= patch_robots_txt(out_dir)
    ok &= patch_404_base(out_dir, base_path)

    print('\n== %s ==' % ('完了' if ok else '警告あり（上の !! を確認）'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
