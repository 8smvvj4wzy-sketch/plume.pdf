#!/usr/bin/env python3
"""Construit la version autonome de Plume.

index.html charge ses bibliothèques depuis un CDN : pratique en ligne, mais
inutilisable hors connexion. Ce script produit dist/Plume-PDF-autonome.html,
un fichier unique contenant tout, à envoyer par mail, AirDrop ou clé USB.

    python3 build.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "index.html"
VENDOR = ROOT / "vendor"
OUT = ROOT / "dist" / "Plume-PDF-autonome.html"

LIBS = {
    "pdf.js": VENDOR / "pdf.min.js",
    "pdf-lib": VENDOR / "pdf-lib.min.js",
    "jszip": VENDOR / "jszip.min.js",
    "pdf.worker": VENDOR / "pdf.worker.min.js",
}

CDN_TAGS = [
    (r'<script src="https://cdnjs\.cloudflare\.com/ajax/libs/pdf\.js/[^"]+"></script>', "pdf.js"),
    (r'<script src="https://cdnjs\.cloudflare\.com/ajax/libs/pdf-lib/[^"]+"></script>', "pdf-lib"),
    (r'<script src="https://cdnjs\.cloudflare\.com/ajax/libs/jszip/[^"]+"></script>', "jszip"),
]

WORKER_LINE = (
    'pdfjsLib.GlobalWorkerOptions.workerSrc =\n'
    '  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";'
)
WORKER_LOCAL = (
    'pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob(\n'
    '  [document.getElementById("pdf-worker-src").textContent], { type: "text/javascript" }));'
)


def fail(msg):
    print("Échec : " + msg, file=sys.stderr)
    sys.exit(1)


def main():
    if not SRC.exists():
        fail("index.html est introuvable.")

    code = {}
    for name, path in LIBS.items():
        if not path.exists():
            fail("la bibliothèque %s manque dans vendor/." % path.name)
        text = path.read_text(encoding="utf-8")
        if "</script" in text:
            fail("%s contient une balise fermante qui casserait l'intégration." % path.name)
        code[name] = text

    html = SRC.read_text(encoding="utf-8")

    for pattern, key in CDN_TAGS:
        html, n = re.subn(pattern, lambda m, k=key: "<script>%s</script>" % code[k], html)
        if n != 1:
            fail("la balise %s n'a pas été trouvée une seule fois dans index.html." % key)

    if WORKER_LINE not in html:
        fail("la ligne définissant workerSrc a changé ; adaptez build.py.")
    html = html.replace(WORKER_LINE, WORKER_LOCAL)
    # le tag doit exister AVANT que le script de l'app ne s'exécute et le
    # cherche : inséré juste après <body>, pas juste avant </body> (le script
    # de l'app est le dernier élément du corps de page, donc un ajout en fin
    # de body atterrit après lui, et document.getElementById() y renvoie null
    # au moment où l'app en a besoin).
    if html.count("<body>") != 1:
        fail("la balise <body> n'a pas été trouvée une seule fois.")
    html = html.replace(
        "<body>",
        '<body>\n<script type="text/plain" id="pdf-worker-src">%s</script>' % code["pdf.worker"],
        1,
    )

    if "cdnjs.cloudflare.com" in html:
        fail("il reste une dépendance distante dans le fichier produit.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print("Construit : %s (%.1f Mo)" % (OUT.relative_to(ROOT), OUT.stat().st_size / 1e6))


if __name__ == "__main__":
    main()
