#!/usr/bin/env python3
"""Generate Hikaru x BLACKFILM pricing PDF - landscape 16:9 PowerPoint style."""

from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# Register Japanese font
pdfmetrics.registerFont(TTFont('NotoSansJP', '/tmp/fonts/NotoSansCJKjp-VF.ttf'))

# Colors
GOLD = HexColor('#c8a84e')
GOLD_LIGHT = HexColor('#f5efd6')
DARK = HexColor('#1a1a1a')
DARK2 = HexColor('#2a2a2a')
GRAY = HexColor('#6b6b6b')
LIGHT_GRAY = HexColor('#e8e5e0')
RED = HexColor('#d94f4f')
BG = HexColor('#f8f6f3')
CARD_BG = HexColor('#ffffff')
RED_BG = HexColor('#fef0f0')
GOLD_BG = HexColor('#fffbeb')

# 16:9 landscape (PowerPoint standard)
W = 338.67 * mm  # 13.333 inches
H = 190.5 * mm   # 7.5 inches
MARGIN = 18 * mm


def fmt(n):
    if n < 0:
        return f'-¥{abs(n):,}'
    return f'¥{n:,}'


def rounded_rect(c, x, y, w, h, r, fill=None, stroke=None, sw=0.5):
    p = c.beginPath()
    p.roundRect(x, y, w, h, r)
    if fill:
        c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(sw)
        c.drawPath(p, fill=1 if fill else 0, stroke=1 if stroke else 0)
    elif fill:
        c.drawPath(p, fill=1, stroke=0)


def draw_bg(c):
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def gold_line(c, y, x1_ratio=0.3, x2_ratio=0.7):
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.5)
    c.line(W * x1_ratio, y, W * x2_ratio, y)


# ============================================================
# PAGE 1: TITLE + COMPARISON
# ============================================================
def page1(c):
    # Full dark background
    c.setFillColor(DARK)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Decorative gold lines
    gold_line(c, H - 15 * mm, 0.15, 0.85)
    gold_line(c, 18 * mm, 0.15, 0.85)

    # Badge
    badge = 'SPECIAL COLLABORATION'
    c.setFont('NotoSansJP', 8)
    tw = c.stringWidth(badge, 'NotoSansJP', 8)
    bx = (W - tw - 20 * mm) / 2
    by = H - 42 * mm
    rounded_rect(c, bx, by, tw + 20 * mm, 8 * mm, 4 * mm, fill=GOLD)
    c.setFillColor(DARK)
    c.drawCentredString(W / 2, by + 2.2 * mm, badge)

    # Main title
    c.setFillColor(GOLD)
    c.setFont('NotoSansJP', 40)
    c.drawCentredString(W / 2, H - 70 * mm, 'ヒカル × BLACKFILM')

    # Subtitle
    c.setFillColor(HexColor('#999999'))
    c.setFont('NotoSansJP', 14)
    c.drawCentredString(W / 2, H - 82 * mm, 'コラボレーション特別価格のご案内')

    # Comparison boxes
    box_w = 100 * mm
    box_h = 38 * mm
    gap = 20 * mm
    left_x = (W - box_w * 2 - gap) / 2
    right_x = left_x + box_w + gap
    box_y = 35 * mm

    # Normal price
    rounded_rect(c, left_x, box_y, box_w, box_h, 4 * mm, fill=CARD_BG)
    c.setFillColor(GRAY)
    c.setFont('NotoSansJP', 9)
    c.drawCentredString(left_x + box_w / 2, box_y + box_h - 12 * mm, '通常価格（税抜）')
    c.setFillColor(GRAY)
    c.setFont('NotoSansJP', 26)
    price_t = '¥250,000 /本'
    ptw = c.stringWidth(price_t, 'NotoSansJP', 26)
    px = left_x + box_w / 2 - ptw / 2
    py = box_y + 6 * mm
    c.drawString(px, py, price_t)
    c.setStrokeColor(RED)
    c.setLineWidth(2)
    c.line(px - 3, py + 7, px + ptw + 3, py + 7)

    # Arrow
    c.setFillColor(GOLD)
    c.setFont('NotoSansJP', 28)
    c.drawCentredString(left_x + box_w + gap / 2, box_y + box_h / 2 - 4 * mm, '→')

    # Discount price
    rounded_rect(c, right_x, box_y, box_w, box_h, 4 * mm, fill=CARD_BG, stroke=GOLD, sw=2.5)
    c.setFillColor(GRAY)
    c.setFont('NotoSansJP', 9)
    c.drawCentredString(right_x + box_w / 2, box_y + box_h - 12 * mm, '顔全体モニター価格（税抜）')
    c.setFillColor(RED)
    c.setFont('NotoSansJP', 30)
    c.drawCentredString(right_x + box_w / 2, box_y + 5 * mm, '¥150,000 /本〜')


# ============================================================
# PRICE TABLE DRAWING
# ============================================================
def draw_table_page(c, title, badge_text, data, popular_indices, page_subtitle=None):
    draw_bg(c)

    # Top bar
    c.setFillColor(DARK)
    c.rect(0, H - 22 * mm, W, 22 * mm, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont('NotoSansJP', 7)
    c.drawString(MARGIN, H - 8 * mm, 'HIKARU × BLACKFILM')
    gold_line(c, H - 22 * mm, 0, 1)

    # Title
    c.setFillColor(white)
    c.setFont('NotoSansJP', 15)
    c.drawCentredString(W / 2, H - 16 * mm, title)

    # Badge
    c.setFont('NotoSansJP', 9)
    btw = c.stringWidth(badge_text, 'NotoSansJP', 9)
    bx = W - MARGIN - btw - 10 * mm
    rounded_rect(c, bx, H - 18.5 * mm, btw + 10 * mm, 8 * mm, 4 * mm, fill=RED)
    c.setFillColor(white)
    c.drawString(bx + 5 * mm, H - 16 * mm, badge_text)

    if page_subtitle:
        c.setFillColor(GRAY)
        c.setFont('NotoSansJP', 8)
        c.drawCentredString(W / 2, H - 30 * mm, page_subtitle)

    # Table card
    card_x = MARGIN
    card_y = 14 * mm
    card_w = W - 2 * MARGIN
    card_h = H - 38 * mm
    rounded_rect(c, card_x, card_y, card_w, card_h, 4 * mm, fill=CARD_BG,
                 stroke=LIGHT_GRAY, sw=0.5)

    # Column positions (proportional)
    col_qty = card_x + 12 * mm
    col_rate = card_x + 50 * mm
    col_unit = card_x + 105 * mm
    col_save = card_x + 170 * mm
    col_total = card_x + card_w - 12 * mm  # right-aligned

    # Header
    header_y = card_y + card_h - 12 * mm
    c.setFont('NotoSansJP', 8)
    c.setFillColor(GRAY)
    c.drawString(col_qty, header_y, '本数')
    c.drawCentredString(col_rate + 12 * mm, header_y, '割引率')
    c.drawCentredString(col_unit + 12 * mm, header_y, '1本あたり（税抜）')
    c.drawCentredString(col_save + 12 * mm, header_y, 'お得額')
    c.drawRightString(col_total, header_y, '合計（税込）')

    c.setStrokeColor(LIGHT_GRAY)
    c.setLineWidth(1)
    c.line(card_x + 6 * mm, header_y - 3 * mm, card_x + card_w - 6 * mm, header_y - 3 * mm)

    # Rows
    row_h = (header_y - 3 * mm - card_y - 6 * mm) / len(data)
    start_y = header_y - 3 * mm - row_h * 0.7

    for idx, (qty, rate, per_unit, savings, total) in enumerate(data):
        ry = start_y - idx * row_h

        # Highlight popular rows
        if idx in popular_indices:
            rounded_rect(c, card_x + 4 * mm, ry - row_h * 0.3,
                         card_w - 8 * mm, row_h * 0.85, 2 * mm, fill=GOLD_BG)

        # Quantity
        c.setFillColor(DARK)
        c.setFont('NotoSansJP', 16)
        c.drawString(col_qty, ry, str(qty))
        c.setFont('NotoSansJP', 9)
        c.setFillColor(GRAY)
        qw = c.stringWidth(str(qty), 'NotoSansJP', 16)
        c.drawString(col_qty + qw + 1, ry, '本')

        # Popular tag
        if idx in popular_indices:
            tag = 'BEST' if idx == popular_indices[0] else '人気'
            c.setFont('NotoSansJP', 7)
            ttw = c.stringWidth(tag, 'NotoSansJP', 7)
            tx = col_qty + 22 * mm
            rounded_rect(c, tx, ry - 0.5 * mm, ttw + 5 * mm, 5.5 * mm, 2.5 * mm, fill=GOLD)
            c.setFillColor(DARK)
            c.drawString(tx + 2.5 * mm, ry + 0.5 * mm, tag)

        # Discount rate
        c.setFont('NotoSansJP', 9)
        rtw = c.stringWidth(rate, 'NotoSansJP', 9)
        rx = col_rate + 12 * mm - rtw / 2 - 4 * mm
        rounded_rect(c, rx, ry - 1 * mm, rtw + 8 * mm, 6 * mm, 3 * mm, fill=RED_BG)
        c.setFillColor(RED)
        c.drawCentredString(col_rate + 12 * mm, ry, rate)

        # Per unit
        c.setFillColor(DARK)
        c.setFont('NotoSansJP', 11)
        c.drawCentredString(col_unit + 12 * mm, ry, fmt(per_unit))

        # Savings
        c.setFillColor(RED)
        c.setFont('NotoSansJP', 11)
        c.drawCentredString(col_save + 12 * mm, ry, fmt(savings))

        # Total
        c.setFillColor(DARK)
        c.setFont('NotoSansJP', 13)
        c.drawRightString(col_total, ry - 0.5 * mm, fmt(total))

        # Separator
        if idx < len(data) - 1 and idx not in popular_indices:
            next_not_popular = (idx + 1) not in popular_indices
            if next_not_popular:
                c.setStrokeColor(HexColor('#f0ede8'))
                c.setLineWidth(0.3)
                sep_y = ry - row_h * 0.55
                c.line(card_x + 8 * mm, sep_y, card_x + card_w - 8 * mm, sep_y)

    # Footer note
    c.setFillColor(GRAY)
    c.setFont('NotoSansJP', 7)
    c.drawCentredString(W / 2, 8 * mm, '※ 表示価格はすべて税込です（消費税10%）　通常価格: 1本あたり ¥250,000（税抜）')


# ============================================================
# PAGE 4: NOTES
# ============================================================
def page_notes(c):
    draw_bg(c)

    # Top bar
    c.setFillColor(DARK)
    c.rect(0, H - 22 * mm, W, 22 * mm, fill=1, stroke=0)
    gold_line(c, H - 22 * mm, 0, 1)
    c.setFillColor(GOLD)
    c.setFont('NotoSansJP', 7)
    c.drawString(MARGIN, H - 8 * mm, 'HIKARU × BLACKFILM')
    c.setFillColor(white)
    c.setFont('NotoSansJP', 15)
    c.drawCentredString(W / 2, H - 16 * mm, 'ご案内')

    notes = [
        ('通常価格', '1本あたり ¥250,000（税抜）が定価となります'),
        ('セット割引', '本数が多いほど1本あたりの単価がお得になります（最大20%OFF）'),
        ('モニター価格について', '施術部位の写真掲載にご協力いただける方が対象です'),
        ('鼻下モニター', '鼻下部位の施術写真をご提供いただくプラン（最大34%OFF）'),
        ('顔全体モニター', '顔全体の施術写真をご提供いただくプラン（最大40%OFF）'),
        ('税込表示', 'すべての合計価格は消費税10%を含む税込価格です'),
    ]

    card_x = W * 0.15
    card_w = W * 0.7
    card_h = len(notes) * 18 * mm + 10 * mm
    card_y = H - 35 * mm - card_h

    rounded_rect(c, card_x, card_y, card_w, card_h, 5 * mm, fill=CARD_BG,
                 stroke=LIGHT_GRAY, sw=0.5)

    y = card_y + card_h - 16 * mm
    for title, desc in notes:
        # Gold bullet
        c.setFillColor(GOLD)
        c.circle(card_x + 14 * mm, y + 2 * mm, 2.5 * mm, fill=1, stroke=0)

        c.setFillColor(DARK)
        c.setFont('NotoSansJP', 11)
        c.drawString(card_x + 22 * mm, y, title)

        c.setFillColor(GRAY)
        c.setFont('NotoSansJP', 9)
        c.drawString(card_x + 22 * mm, y - 7 * mm, desc)

        y -= 18 * mm

    # Footer
    c.setFillColor(DARK)
    c.setFont('NotoSansJP', 10)
    c.drawCentredString(W / 2, 20 * mm, 'BLACKFILM × ヒカル')
    c.setFillColor(GRAY)
    c.setFont('NotoSansJP', 8)
    c.drawCentredString(W / 2, 12 * mm, 'お気軽にスタッフまでお問い合わせください')
    gold_line(c, 28 * mm, 0.35, 0.65)


# ============================================================
# MAIN
# ============================================================
def main():
    out = '/home/user/shift/hikaru-price.pdf'
    c = canvas.Canvas(out, pagesize=(W, H))

    # Page 1: Title
    page1(c)
    c.showPage()

    # Page 2: Set pricing
    set_data = [
        (20, '20%OFF', 200000, -1000000, 4400000),
        (18, '20%OFF', 200000, -900000, 3960000),
        (16, '20%OFF', 200000, -800000, 3520000),
        (14, '12%OFF', 220000, -420000, 3388000),
        (12, '12%OFF', 220000, -360000, 2904000),
        (10, '12%OFF', 220000, -300000, 2420000),
        (8, '8%OFF', 230000, -160000, 2024000),
        (6, '8%OFF', 230000, -120000, 1518000),
        (4, '8%OFF', 230000, -80000, 1012000),
    ]
    draw_table_page(c, 'ヒカル本数セット価格', '最大20%OFF', set_data, [0, 5])
    c.showPage()

    # Page 3: Nose monitor
    nose_data = [
        (20, '34%OFF', 165000, -1700000, 3630000),
        (18, '34%OFF', 165000, -1530000, 3267000),
        (16, '34%OFF', 165000, -1360000, 2904000),
        (14, '34%OFF', 165000, -1190000, 2541000),
        (12, '30%OFF', 175000, -900000, 2310000),
        (10, '30%OFF', 175000, -750000, 1925000),
        (8, '30%OFF', 175000, -600000, 1540000),
        (6, '26%OFF', 185000, -390000, 1221000),
        (4, '26%OFF', 185000, -260000, 814000),
    ]
    draw_table_page(c, 'ヒカル鼻下モニター価格', '最大34%OFF', nose_data, [0, 4],
                    page_subtitle='鼻下部位の施術写真をご提供いただける方が対象です')
    c.showPage()

    # Page 4: Full face monitor
    face_data = [
        (20, '40%OFF', 150000, -2000000, 3300000),
        (18, '40%OFF', 150000, -1800000, 2970000),
        (16, '40%OFF', 150000, -1600000, 2640000),
        (14, '34%OFF', 165000, -1190000, 2541000),
        (12, '34%OFF', 165000, -1020000, 2178000),
        (10, '34%OFF', 165000, -850000, 1815000),
        (8, '31%OFF', 172500, -620000, 1518000),
        (6, '31%OFF', 172500, -465000, 1138500),
        (4, '31%OFF', 172500, -310000, 759000),
    ]
    draw_table_page(c, 'ヒカル顔全体モニター価格', '最大40%OFF', face_data, [0, 4],
                    page_subtitle='顔全体の施術写真をご提供いただける方が対象です')
    c.showPage()

    # Page 5: Notes
    page_notes(c)
    c.showPage()

    c.save()
    print(f'PDF saved: {out}')


if __name__ == '__main__':
    main()
