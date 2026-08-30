# Plume

Éditeur PDF de bureau, en un seul fichier. Saisie de texte, signatures,
masquage, réorganisation des pages, export PDF, Word et PNG.

Tout se passe sur votre ordinateur : aucun document n'est envoyé sur Internet.

## Utiliser l'application

Téléchargez `dist/Plume-PDF-autonome.html` et ouvrez-le d'un double-clic. Rien à
installer. Ce fichier contient tout ce dont il a besoin et fonctionne sans
connexion — vous pouvez le transmettre par AirDrop, par mail ou sur une clé USB.

Une version en ligne, tout aussi autonome (aucune requête vers un CDN), est
publiée à chaque mise à jour du dépôt sur GitHub Pages. Pour l'installer comme
une application de bureau : ouvrez l'URL dans Safari, puis **Fichier → Ajouter
au Dock** (sur Chrome : menu ⋮ → *Diffuser, enregistrer et partager* →
*Installer*). Elle fonctionne ensuite sans connexion, comme la version
téléchargée.

## Ce que fait le programme

- **Texte** : cliquer sur la page pour écrire, réglages de corps, couleur, gras.
- **Signatures** : les dessiner au trackpad, ou importer une photo, un scan, un
  PNG, un JPEG, un WEBP, un GIF, un BMP, un SVG ou un PDF. Le fond du papier est
  retiré automatiquement et le trait ramené à un noir franc. Les signatures
  restent enregistrées pour les fois suivantes.
- **Masquer** : recouvrir une mention d'un cache blanc.
- **Pages** : pivoter, supprimer, réordonner par glisser-déposer, extraire une
  sélection, séparer en un fichier par page, fusionner plusieurs PDF.
- **Onglets** : plusieurs documents ouverts en parallèle, chacun avec ses
  annotations.
- **Exports** : PDF modifié, PDF partiel, un PDF par page, images PNG, Word en
  texte modifiable ou en mise en page fidèle.

## Développer

Ouvrez `index.html` dans un navigateur : c'est tout, il n'y a pas d'étape de
compilation. Le code source tient dans ce fichier unique.

Pour reconstruire la version autonome après une modification :

```bash
python3 build.py
```

Le fichier produit atterrit dans `dist/`.

## Organisation du dépôt

```
index.html                    l'application (charge ses bibliothèques depuis un CDN)
build.py                      fabrique la version autonome hors ligne
scripts/make_icons.py         régénère les icônes dans icons/
vendor/                       pdf.js, pdf-lib et JSZip, figés
icons/                        icônes de l'app (favicon, PWA, Dock)
manifest.webmanifest, sw.js   installation comme application de bureau, mode hors ligne
dist/                         version autonome produite (non versionnée)
.github/workflows/pages.yml   construction et publication automatiques
CLAUDE.md                     notes d'architecture pour Claude Code
```

## Bibliothèques utilisées

- [pdf.js](https://mozilla.github.io/pdf.js/) — lecture et rendu (Apache 2.0)
- [pdf-lib](https://pdf-lib.js.org/) — écriture des PDF (MIT)
- [JSZip](https://stuk.github.io/jszip/) — fabrication des fichiers Word (MIT)

Leurs licences respectives se trouvent dans `vendor/`.
