#!/usr/bin/env python3
"""Generate Hikaru x BLACKFILM pricing PDF - single page, bold design."""

from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(TTFont('NotoSansJP', '/tmp/fonts/NotoSansCJKjp-VF.ttf'))

# Colors
GOLD = HexColor('#c8a84e')
DARK = HexColor('#1a1a1a')
DARK2 = HexColor('#2d2d2d')
GRAY = HexColor('#888888')
LGRAY = HexColor('#e0ddd8')
RED = HexColor('#d94f4f')
BG = HexColor('#f8f6f3')
WHITE = HexColor('#ffffff')
RED_BG = HexColor('#fef0f0')
GOLD_BG = HexColor('#fff9eb')
BLUE_BG = HexColor('#eef5fc')
GREEN_BG = HexColor('#eef8f0')

# A3 Landscape
W = 420 * mm
H = 297 * mm
M = 14 * mm


def fmt(n):
    if n < 0:
        return f'-¥{abs(n):,}'
    return f'¥{n:,}'


def rrect(c, x, y, w, h, r, fill=None, stroke=None, sw=0.5):
    p = c.beginPath()
    p.roundRect(x, y, w, h, r)
    if fill: c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke); c.setLineWidth(sw)
        c.drawPath(p, fill=1 if fill else 0, stroke=1)
    elif fill:
        c.drawPath(p, fill=1, stroke=0)


def main():
    out = '/home/user/shift/hikaru-price.pdf'
    c = canvas.Canvas(out, pagesize=(W, H))

    # Background
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # ===== HEADER BAR =====
    hdr_h = 32 * mm
    c.setFillColor(DARK)
    c.rect(0, H - hdr_h, W, hdr_h, fill=1, stroke=0)

    # Gold accent line
    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    c.line(0, H - hdr_h, W, H - hdr_h)

    # Title
    c.setFillColor(GOLD)
    c.setFont('NotoSansJP', 26)
    c.drawCentredString(W / 2, H - 22 * mm, 'ヒカル × BLACKFILM　特別価格表')

    # Badge top-right
    c.setFont('NotoSansJP', 10)
    c.setFillColor(HexColor('#999'))
    c.drawRightString(W - M - 4*mm, H - 14 * mm, 'SPECIAL COLLABORATION')

    # Normal price reference
    c.setFont('NotoSansJP', 11)
    c.setFillColor(HexColor('#aaa'))
    c.drawString(M + 4*mm, H - 14 * mm, '通常価格  ¥250,000/本（税抜）')

    # ===== 3 COLUMNS =====
    col_gap = 8 * mm
    col_w = (W - 2 * M - 2 * col_gap) / 3
    top_y = H - hdr_h - 8 * mm
    bot_y = 12 * mm

    plans = [
        {
            'title': '本数セット価格',
            'badge': '最大 20%OFF',
            'color': HexColor('#2d6a9f'),
            'bg': BLUE_BG,
            'data': [
                (20, '20%', 200000, 4400000),
                (18, '20%', 200000, 3960000),
                (16, '20%', 200000, 3520000),
                (14, '12%', 220000, 3388000),
                (12, '12%', 220000, 2904000),
                (10, '12%', 220000, 2420000),
                (8, '8%', 230000, 2024000),
                (6, '8%', 230000, 1518000),
                (4, '8%', 230000, 1012000),
            ],
        },
        {
            'title': '鼻下モニター価格',
            'badge': '最大 34%OFF',
            'color': HexColor('#2e7d32'),
            'bg': GREEN_BG,
            'data': [
                (20, '34%', 165000, 3630000),
                (18, '34%', 165000, 3267000),
                (16, '34%', 165000, 2904000),
                (14, '34%', 165000, 2541000),
                (12, '30%', 175000, 2310000),
                (10, '30%', 175000, 1925000),
                (8, '30%', 175000, 1540000),
                (6, '26%', 185000, 1221000),
                (4, '26%', 185000, 814000),
            ],
        },
        {
            'title': '顔全体モニター価格',
            'badge': '最大 40%OFF',
            'color': RED,
            'bg': RED_BG,
            'data': [
                (20, '40%', 150000, 3300000),
                (18, '40%', 150000, 2970000),
                (16, '40%', 150000, 2640000),
                (14, '34%', 165000, 2541000),
                (12, '34%', 165000, 2178000),
                (10, '34%', 165000, 1815000),
                (8, '31%', 172500, 1518000),
                (6, '31%', 172500, 1138500),
                (4, '31%', 172500, 759000),
            ],
        },
    ]

    for i, plan in enumerate(plans):
        cx = M + i * (col_w + col_gap)
        card_h = top_y - bot_y

        # Card
        rrect(c, cx, bot_y, col_w, card_h, 5 * mm, fill=WHITE, stroke=LGRAY, sw=0.8)

        # Column header
        ch_h = 22 * mm
        p = c.beginPath()
        p.roundRect(cx, top_y - ch_h, col_w, ch_h, 5 * mm)
        c.setFillColor(plan['color'])
        c.drawPath(p, fill=1, stroke=0)
        # Fill bottom corners of header
        c.rect(cx, top_y - ch_h, col_w, 5 * mm, fill=1, stroke=0)

        # Title
        c.setFillColor(white)
        c.setFont('NotoSansJP', 16)
        c.drawCentredString(cx + col_w / 2, top_y - 14 * mm, plan['title'])

        # Badge
        badge_t = plan['badge']
        c.setFont('NotoSansJP', 13)
        btw = c.stringWidth(badge_t, 'NotoSansJP', 13)
        bx = cx + col_w / 2 - btw / 2 - 6 * mm
        by = top_y - 22 * mm - 1 * mm
        rrect(c, bx, by, btw + 12 * mm, 9 * mm, 4.5 * mm, fill=plan['bg'])
        c.setFillColor(plan['color'])
        c.drawCentredString(cx + col_w / 2, by + 2 * mm, badge_t)

        # Table headers
        th_y = top_y - 36 * mm
        c.setFont('NotoSansJP', 9)
        c.setFillColor(GRAY)
        c.drawString(cx + 6 * mm, th_y, '本数')
        c.drawCentredString(cx + 35 * mm, th_y, '割引率')
        c.drawCentredString(cx + 68 * mm, th_y, '1本あたり')
        c.drawRightString(cx + col_w - 6 * mm, th_y, '合計（税込）')

        # Header line
        c.setStrokeColor(LGRAY)
        c.setLineWidth(1.2)
        c.line(cx + 5 * mm, th_y - 3 * mm, cx + col_w - 5 * mm, th_y - 3 * mm)

        # Rows
        row_area = th_y - 3 * mm - bot_y - 8 * mm
        row_h = row_area / len(plan['data'])
        start_y = th_y - 3 * mm - row_h * 0.6

        for j, (qty, rate, unit, total) in enumerate(plan['data']):
            ry = start_y - j * row_h

            # Highlight top row
            if j == 0:
                rrect(c, cx + 3 * mm, ry - row_h * 0.35,
                      col_w - 6 * mm, row_h * 0.9, 3 * mm, fill=GOLD_BG)

            # Quantity - BIG
            c.setFillColor(DARK)
            c.setFont('NotoSansJP', 20)
            c.drawString(cx + 6 * mm, ry, str(qty))
            c.setFont('NotoSansJP', 10)
            c.setFillColor(GRAY)
            qw = c.stringWidth(str(qty), 'NotoSansJP', 20)
            c.drawString(cx + 6 * mm + qw + 1, ry + 1, '本')

            # BEST tag on first row
            if j == 0:
                tag = 'BEST'
                c.setFont('NotoSansJP', 8)
                ttw = c.stringWidth(tag, 'NotoSansJP', 8)
                rrect(c, cx + 6*mm + qw + 14, ry - 0.5*mm, ttw + 5*mm, 5.5*mm, 2.5*mm, fill=GOLD)
                c.setFillColor(DARK)
                c.drawString(cx + 6*mm + qw + 16.5, ry + 0.5, tag)

            # Rate badge
            c.setFont('NotoSansJP', 12)
            rtw = c.stringWidth(rate, 'NotoSansJP', 12)
            rx = cx + 35 * mm - rtw / 2 - 4 * mm
            rrect(c, rx, ry - 1.5 * mm, rtw + 8 * mm, 7 * mm, 3.5 * mm, fill=plan['bg'])
            c.setFillColor(plan['color'])
            c.drawCentredString(cx + 35 * mm, ry, rate)

            # Per unit
            c.setFillColor(DARK)
            c.setFont('NotoSansJP', 13)
            c.drawCentredString(cx + 68 * mm, ry, fmt(unit))

            # Total - BOLD
            c.setFillColor(DARK)
            c.setFont('NotoSansJP', 14)
            c.drawRightString(cx + col_w - 6 * mm, ry, fmt(total))

            # Separator
            if j < len(plan['data']) - 1:
                c.setStrokeColor(HexColor('#eeebe6'))
                c.setLineWidth(0.4)
                sep_y = ry - row_h * 0.5
                c.line(cx + 6 * mm, sep_y, cx + col_w - 6 * mm, sep_y)

    # ===== FOOTER NOTES =====
    c.setFillColor(GRAY)
    c.setFont('NotoSansJP', 9)
    c.drawCentredString(W / 2, 5 * mm,
        '※ 税込価格（消費税10%）　※ モニター価格は施術写真のご協力が必要です　※ 本数が多いほどお得です')

    c.showPage()
    c.save()
    print(f'PDF saved: {out}')


if __name__ == '__main__':
    main()
