# -*- coding: utf-8 -*-
"""
gen_ogp.py — SNS共有カード用の共通OGP画像 assets/img/ogp.jpg を生成する（1200x630）。

なぜスクリプトにするか: サイト名やキャッチを変えたくなったとき、同じ手順で作り直せるようにするため。
素材は既存の assets/img/hero.jpg（トップのヒーロー写真）をそのまま使い、新しい配色は増やさない
（ブランド色 #b3282d = style.css の --color-primary）。

実行: python tools/gen_ogp.py   （要 Pillow。site/ ディレクトリ直下から実行する）
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'img', 'hero.jpg')
DST = os.path.join(ROOT, 'assets', 'img', 'ogp.jpg')

TITLE = 'THAI SPOT TOKYO'
LEAD = '東京のタイ料理店・タイカフェ検索'

FONT_BOLD = r'C:\Windows\Fonts\YuGothB.ttc'
FONT_MED = r'C:\Windows\Fonts\YuGothM.ttc'


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def fill_crop(im, w, h):
    """アスペクト比を保って w x h を埋めるようにリサイズ→中央寄りで切り出す。"""
    scale = max(w / im.width, h / im.height)
    new = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left = (new.width - w) // 2
    # 皿の中心（上寄り）が残るように、縦は中央より少し上を採用する
    top = max(0, int((new.height - h) * 0.38))
    return new.crop((left, top, left + w, top + h))


def main():
    # 左=文字パネル（ブランドのクリーム地）／右=ヒーロー写真。
    # 縦長写真(1080x1350)を横長1200x630に全面敷くと料理が分からないほど寄ってしまうため、
    # 写真は右側の縦長エリアに置いて全体が見えるようにする。
    panel_w = 540
    photo_w = W - panel_w

    base = Image.new('RGB', (W, H), (245, 241, 234))  # --color-bg クリーム
    base.paste(fill_crop(Image.open(SRC).convert('RGB'), photo_w, H), (panel_w, 0))

    d = ImageDraw.Draw(base)

    # 写真とパネルの継ぎ目にブランド色の細い縦線
    d.rectangle([panel_w - 6, 0, panel_w - 1, H], fill=(179, 40, 45))

    # ブランド色のアクセントバー
    d.rectangle([72, 228, 72 + 88, 228 + 8], fill=(179, 40, 45))

    d.text((72, 266), 'THAI SPOT', font=load_font(FONT_BOLD, 62), fill=(61, 57, 41))
    d.text((72, 336), 'TOKYO', font=load_font(FONT_BOLD, 62), fill=(168, 50, 38))
    d.text((74, 432), '東京のタイ料理店', font=load_font(FONT_MED, 30), fill=(95, 89, 72))
    d.text((74, 474), 'タイカフェ検索', font=load_font(FONT_MED, 30), fill=(95, 89, 72))

    base.save(DST, 'JPEG', quality=86, optimize=True, progressive=True)
    print('wrote', DST, base.size, os.path.getsize(DST), 'bytes')


if __name__ == '__main__':
    main()
