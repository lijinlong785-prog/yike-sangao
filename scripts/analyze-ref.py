"""
量母版原图的版面构成（临时用，不进产品）。

对每张 1920x1080 原图：缩到 96x54，把像素按 16 级量化聚色，
报「占面积 >=1.5% 的颜色 + 它们占版面百分之几 + 包围盒（0–1 相对坐标）」。
字是细笔画，量化后会碎成小簇，自然被 1.5% 的阈值滤掉——留下的就是色块。

跑法：python3 scripts/analyze-ref.py
"""
from PIL import Image
from collections import defaultdict

FILES = [
    ("shuangnian", "biennale-yellow-1"),
    ("gulan", "cobalt-grid-3"),
    ("shangwu", "blue-professional-1"),
    ("sanse", "editorial-tri-tone-3"),
    ("lindi", "grove-4"),
    ("changyan", "long-table-3"),
    ("danse", "monochrome-1"),
    ("gangyin", "stencil-tablet-1"),
]

W, H = 96, 54
Q = 16  # 量化步长


def key(rgb):
    return tuple((c // Q) * Q for c in rgb)


def hexs(rgb):
    return "#%02X%02X%02X" % rgb


for fid, name in FILES:
    img = Image.open(f"../screenshots/tpl/{name}.png").convert("RGB").resize((W, H), Image.LANCZOS)
    px = img.load()
    cnt = defaultdict(int)
    box = {}
    for y in range(H):
        for x in range(W):
            k = key(px[x, y])
            cnt[k] += 1
            b = box.get(k)
            if b is None:
                box[k] = [x, y, x, y]
            else:
                if x < b[0]:
                    b[0] = x
                if y < b[1]:
                    b[1] = y
                if x > b[2]:
                    b[2] = x
                if y > b[3]:
                    b[3] = y
    total = W * H
    items = sorted(cnt.items(), key=lambda kv: -kv[1])
    print(f"\n=== {fid} ({name}) ===")
    for k, n in items:
        share = n / total
        if share < 0.015:
            continue
        b = box[k]
        print(
            f"  {hexs(k)}  {share*100:5.1f}%  bbox x {b[0]/W:.3f}–{(b[2]+1)/W:.3f}  y {b[1]/H:.3f}–{(b[3]+1)/H:.3f}"
        )