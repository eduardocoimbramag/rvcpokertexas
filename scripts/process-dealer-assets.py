#!/usr/bin/env python3
"""
Pipeline de assets da dealer (docs/scenario.md · dealer em camadas).

Os PNGs originais vieram de gerador de imagem com "transparência falsa"
(xadrez desenhado em RGB). Este script reconstrói o canal alfa:

- flood:   BFS a partir das bordas removendo pixels de fundo (xadrez/branco,
           baixa saturação e alto brilho). Para nas linhas de contorno das
           peças, preservando brancos internos (luvas, dentes).
- ellipse: para olhos/bocas — recorte do conteúdo + máscara superelíptica
           com feather (a pele pintada ao redor casa com a pele do rosto).
- trim:    para o cabelo (já tem alfa real) — só recorte e otimização.

Saída: WebP com alfa em src/features/bac-bo/scene/dealer/assets/ +
manifest.json com os bounding boxes (para o posicionamento no rig).
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path("art/dealer")
OUT = Path("src/features/bac-bo/scene/dealer/assets")
MAX_DIM = 820  # px — suficiente para ~300px de tela em DPR 3

# (arquivo, estratégia)
# - flood:      fundo xadrez/branco removido por BFS das bordas
# - contour:    peças brancas neutras (luva ≈ xadrez): fecha o contorno por
#               morfologia (dilata → preenche → erode) e usa como silhueta
# - whiteflood: BFS estrito por neutralidade (delta ≤ 8) + feather forte —
#               remove o glow branco pintado ao redor de olhos/bocas
# - trim:       já tem alfa real; só recorta
ASSETS: list[tuple[str, str]] = [
    ("rosto.png", "flood"),
    ("pescoco.png", "flood"),
    ("vestido.png", "flood"),
    ("antebraco.png", "flood"),
    ("mao.png", "contour"),
    ("olhosabertos.png", "whiteflood"),
    ("olhosfechados.png", "whiteflood"),
    ("bocanormal.png", "whiteflood"),
    ("bocasorrindo.png", "whiteflood"),
    ("cabelo.png", "trim"),
]


def is_background(r: int, g: int, b: int) -> bool:
    """Pixel de fundo: xadrez/branco — quase sem cor e claro."""
    mx, mn = max(r, g, b), min(r, g, b)
    sat = 0 if mx == 0 else (mx - mn) / mx
    return sat < 0.055 and mx > 185


def flood_alpha(im: Image.Image) -> Image.Image:
    """Remove o fundo por BFS a partir das 4 bordas."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, a = px[x, y]
        if not is_background(r, g, b):
            continue
        px[x, y] = (r, g, b, 0)
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    return feather_edges(im)


def feather_edges(im: Image.Image) -> Image.Image:
    """Suaviza 1px da borda alfa para eliminar serrilhado do recorte."""
    from PIL import ImageFilter

    alpha = im.getchannel("A")
    soft = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    # Usa o mínimo entre alfa original e suavizado (só encolhe, nunca vaza).
    combined = Image.composite(soft, alpha, soft.point(lambda v: 255 if v < 255 else 0))
    im.putalpha(combined)
    return im


def whiteflood_alpha(im: Image.Image) -> Image.Image:
    """
    BFS estrito por neutralidade: remove xadrez + glow branco pintado.
    Pele pintada (delta ≈ 50) e dentes (delta ≈ 15) são preservados;
    um feather forte funde a borda com a pele do rosto por baixo.
    """
    from PIL import ImageFilter

    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, a = px[x, y]
        mx, mn = max(r, g, b), min(r, g, b)
        if not (mx - mn <= 8 and mx >= 195):
            continue
        px[x, y] = (r, g, b, 0)
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    # Feather forte: a borda alfa se dissolve na pele do rosto por baixo.
    alpha = im.getchannel("A")
    soft = alpha.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(5))
    im.putalpha(soft)
    return im


def contour_alpha(im: Image.Image) -> Image.Image:
    """
    Silhueta por fechamento de contorno (para peças brancas neutras como a
    luva, indistinguíveis do fundo por cor): marca a "tinta" (traço escuro
    ou colorido), dilata para fechar falhas, preenche o interior e erode
    de volta.
    """
    from PIL import ImageFilter

    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    # 1) Máscara de tinta: qualquer coisa que não seja branco/xadrez neutro.
    ink = Image.new("L", (w, h), 0)
    ink_px = ink.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            if mx - mn > 10 or mx < 205:
                ink_px[x, y] = 255

    # 2) Dilata para fechar pequenas falhas do traço (raio ~5px).
    closed = ink.filter(ImageFilter.MaxFilter(11))

    # 3) Preenche o interior: BFS do fundo a partir das bordas; o que o
    #    fundo não alcança é interior da peça.
    cl = closed.load()
    outside = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h - 1))
    for y in range(h):
        queue.append((0, y))
        queue.append((w - 1, y))
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if outside[idx]:
            continue
        if cl[x, y] != 0:
            continue
        outside[idx] = 1
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    solid = Image.new("L", (w, h), 255)
    sp = solid.load()
    for y in range(h):
        base = y * w
        for x in range(w):
            if outside[base + x]:
                sp[x, y] = 0

    # 4) Erode de volta o raio da dilatação e suaviza a borda.
    mask = solid.filter(ImageFilter.MinFilter(11)).filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(mask)
    return im


def trim_and_resize(im: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    bbox = im.getbbox()
    if bbox is None:
        bbox = (0, 0, im.size[0], im.size[1])
    # Padding pequeno para não cortar feather.
    pad = 6
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(im.size[0], bbox[2] + pad)
    bottom = min(im.size[1], bbox[3] + pad)
    im = im.crop((left, top, right, bottom))

    w, h = im.size
    scale = min(1.0, MAX_DIM / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    return im, (left, top, right, bottom)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, object]] = {}

    for name, strategy in ASSETS:
        src_path = SRC / name
        im = Image.open(src_path)
        original_size = im.size

        if strategy == "flood":
            im = flood_alpha(im)
        elif strategy == "contour":
            im = contour_alpha(im)
        elif strategy == "whiteflood":
            im = whiteflood_alpha(im)
        else:  # trim
            im = im.convert("RGBA")

        im, bbox = trim_and_resize(im)
        out_name = name.replace(".png", ".webp")
        im.save(OUT / out_name, "WEBP", quality=88, method=6)

        manifest[out_name] = {
            "size": im.size,
            "aspect": round(im.size[0] / im.size[1], 4),
            "bboxInOriginal": bbox,
            "originalSize": original_size,
            "strategy": strategy,
        }
        print(f"{name} [{strategy}] {original_size} → {im.size} ({out_name})")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("manifest.json gravado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
