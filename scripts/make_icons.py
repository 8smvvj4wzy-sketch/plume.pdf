#!/usr/bin/env python3
"""Fabrique les icônes de l'app (PNG bruts) à partir d'un tracé vectoriel.

Ni PIL ni Node ne sont disponibles pour produire ces images : ce script les
construit pixel par pixel avec la seule bibliothèque standard (zlib, struct),
à partir d'un simple paraphe dessiné comme une suite de segments.

    python3 scripts/make_icons.py

Les fichiers produits sont commités dans icons/ : ils ne changent que si ce
script change, inutile de les régénérer à chaque publication.
"""
import math
import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / "icons"

BG = (31, 95, 91)      # --accent
FG = (255, 255, 255)

# un paraphe stylisé en une seule ligne, coordonnées sur une grille 0..100
STROKE = [
    (16, 68), (24, 38), (32, 64), (40, 32), (50, 62),
    (60, 30), (70, 60), (80, 30), (90, 42),
]


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    if length2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def make_icon(size):
    pts = [(x / 100 * size, y / 100 * size) for x, y in STROKE]
    stroke_w = size * 0.10
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filtre "aucun" pour cette ligne
        for x in range(size):
            d = min(
                dist_to_segment(x + 0.5, y + 0.5, *pts[i], *pts[i + 1])
                for i in range(len(pts) - 1)
            )
            t = max(0.0, min(1.0, stroke_w / 2 + 0.75 - d))
            rows += bytes(
                round(BG[c] + (FG[c] - BG[c]) * t) for c in range(3)
            )
    return png_bytes(size, size, bytes(rows))


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(
        ">I", zlib.crc32(tag + data)
    )


def png_bytes(w, h, raw):
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8 bits, RGB
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
        path = OUT / name
        path.write_bytes(make_icon(size))
        print("Écrit :", path.relative_to(ROOT), "(%d octets)" % path.stat().st_size)


if __name__ == "__main__":
    main()
