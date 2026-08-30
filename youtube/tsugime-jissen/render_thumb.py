# -*- coding: utf-8 -*-
"""thumb.json -> thumb.pptx （1枚・16:9・YouTubeサムネイル）"""
import json, sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

W, H = Inches(13.333), Inches(7.5)
BG    = RGBColor(0x1C, 0x1A, 0x19)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREY  = RGBColor(0xBD, 0xB6, 0xAF)
FONT  = "Hiragino Sans"

def ea(run, name=FONT):
    rPr = run.font._rPr
    for tag in ("a:ea", "a:cs"):
        el = rPr.find(qn(tag))
        if el is None:
            el = rPr.makeelement(qn(tag), {}); rPr.append(el)
        el.set("typeface", name)

def box(s, x, y, w, h, text, size, color, bold=True, align=PP_ALIGN.LEFT, spacing=1.2):
    tb = s.shapes.add_textbox(x, y, w, h); tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]; p.alignment = align; p.line_spacing = spacing
    r = p.add_run(); r.text = text
    r.font.size = Pt(size); r.font.bold = bold; r.font.color.rgb = color; r.font.name = FONT
    ea(r)
    return tb

def rect(s, x, y, w, h, fill, radius=None):
    shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, x, y, w, h)
    if radius is not None: shp.adjustments[0] = radius
    shp.fill.solid(); shp.fill.fore_color.rgb = fill
    shp.line.fill.background(); shp.shadow.inherit = False
    return shp

def main(cfg_path, out_path):
    c = json.load(open(cfg_path, encoding="utf-8"))
    accent = RGBColor.from_string(c.get("accent", "D65C4C"))
    prs = Presentation(); prs.slide_width, prs.slide_height = W, H
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, W, H, BG)
    rect(s, 0, 0, Inches(0.34), H, accent)

    # 上段（白）／下段（強調色）の2行組み
    def size_for(text): return 66 if len(text) <= 8 else 58 if len(text) <= 10 else 50
    sz = min(size_for(c["line1"]), size_for(c["line2"]))
    box(s, Inches(1.15), Inches(1.75), Inches(11.4), Inches(1.5), c["line1"], sz, WHITE)
    box(s, Inches(1.15), Inches(3.35), Inches(11.4), Inches(1.5), c["line2"], sz, accent)

    rect(s, Inches(1.18), Inches(5.15), Inches(2.3), Inches(0.09), accent)
    box(s, Inches(1.15), Inches(5.45), Inches(11.4), Inches(0.6), c.get("sub", ""), 22, GREY, bold=False)

    if c.get("badge"):
        bw = Inches(1.9)
        rect(s, Inches(10.55), Inches(0.85), bw, Inches(0.62), accent, radius=0.4)
        box(s, Inches(10.55), Inches(1.0), bw, Inches(0.4), c["badge"], 22, WHITE, align=PP_ALIGN.CENTER)

    box(s, Inches(1.15), Inches(6.35), Inches(8.0), Inches(0.5), c.get("channel", ""), 20, GREY, bold=False)
    prs.save(out_path)
    print("wrote", out_path)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
