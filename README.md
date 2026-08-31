# Plume

Éditeur PDF de bureau, en un seul fichier. Saisie de texte, signatures,
masquage, réorganisation des pages, export PDF, Word et PNG.

Tout se passe sur votre ordinateur : aucun document n'est envoyé sur Internet.
Les documents récents sont conservés localement pour que vous puissiez reprendre
votre travail ; la liste se vide d'un clic, et cette conservation se coupe.

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
- **Caviarder** : recouvrir une mention. Le texte recouvert est réellement
  supprimé du PDF produit — il ne se copie ni ne s'extrait plus. Seules les
  pages caviardées sont converties en image ; les autres gardent leur texte
  sélectionnable.
- **Annoter** : stylo à main levée, surligneur, rectangle, flèche.
- **Rechercher** (Cmd+F) : trouver un mot dans tout le document, sauter d'une
  occurrence à l'autre, ou toutes les caviarder d'un coup.
- **Annuler / rétablir** (Cmd+Z, Cmd+Maj+Z) sur tous les gestes.
- **Pages** : pivoter, dupliquer, supprimer, réordonner par glisser-déposer,
  insérer une page blanche ou un autre PDF à l'endroit voulu, extraire une
  sélection, séparer en un fichier par page, fusionner plusieurs PDF.
- **Document** : numéroter les pages, poser un filigrane, renseigner titre et
  auteur, imprimer (Cmd+P).
- **Onglets** : plusieurs documents ouverts en parallèle, chacun avec ses
  annotations.
- **Récents** : les documents ouverts sont conservés sur votre ordinateur avec
  vos annotations, pour reprendre là où vous en étiez. Ils ne sont jamais
  envoyés nulle part ; l'écran d'accueil permet de vider la liste ou de ne rien
  conserver du tout.
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

Pour vérifier qu'une modification n'a rien cassé :

```bash
python3 build.py && node tests/verify.mjs
```

Le script pilote un Chromium sans interface sur la version autonome et contrôle
le placement des objets à l'export sur les quatre rotations, le caviardage, la
recherche, l'annulation et les récents. Il demande [Playwright](https://playwright.dev/)
(`npm i -g playwright`).

## Organisation du dépôt

```
index.html                    l'application (charge ses bibliothèques depuis un CDN)
build.py                      fabrique la version autonome hors ligne
tests/verify.mjs              vérification automatisée (Chromium sans interface)
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
