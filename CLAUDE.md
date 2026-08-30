# Notes pour Claude Code

Ce fichier décrit le projet à l'assistant. Il est lu automatiquement au début de
chaque session Claude Code dans ce dépôt.

## Ce qu'est ce projet

Plume est un éditeur PDF de bureau : saisie de texte, signatures, masquage,
manipulation des pages, export PDF / Word / PNG. Tout s'exécute dans le
navigateur de l'utilisateur, **aucun fichier ne quitte sa machine**. C'est une
exigence non négociable : le projet sert à traiter des documents professionnels
contenant des données personnelles.

## Contraintes d'architecture

- **Un seul fichier.** `index.html` contient le HTML, le CSS et le JavaScript.
  Ne pas découper en modules, ne pas introduire de bundler, pas de framework.
  L'utilisateur doit pouvoir envoyer un fichier unique à un collègue.
- **Pas d'étape de compilation pour développer.** On ouvre `index.html` dans un
  navigateur et ça marche. `build.py` ne sert qu'à produire la version hors ligne.
- **Trois dépendances, figées dans `vendor/`** : pdf.js (lecture et rendu),
  pdf-lib (écriture), JSZip (fabrication des .docx). Ne pas en ajouter sans
  raison forte. Toute nouvelle version doit aussi être copiée dans `vendor/`.
- **Commentaires et interface en français.**

## Repères dans le code

L'état vit dans `S`, qui pointe vers l'onglet actif. `TABS` contient un état par
projet ouvert ; changer d'onglet réaffecte `S`. `TOOL`, `PENDING` et `SIGS` sont
communs à tous les onglets. Après toute modification de l'état, appeler
`buildRail()`, `renderMain()` puis `syncChrome()`.

### Le système de coordonnées, à comprendre avant d'y toucher

Les objets posés (texte, signature, cache) sont stockés en **points, origine en
haut à gauche, dans l'espace d'affichage de la page, rotation comprise**. Le PDF,
lui, place son origine en bas à gauche sur la page non pivotée. La conversion se
fait uniquement dans `viewToPdf()`, au moment de l'export.

Conséquences à ne pas casser :

- Faire pivoter une page transporte les objets via `turnItems()` pour qu'ils
  suivent l'image ; la rotation absolue est stockée dans `page.rot`.
- À l'export, l'ancre est toujours le **coin bas-gauche affiché** de l'objet, et
  le texte comme les images reçoivent `rotate: degrees(p.rot)`, ce qui compense
  la rotation appliquée par le lecteur PDF.
- `pdf.js` reçoit `getViewport({ scale, rotation: p.rot })`, `pdf-lib` reçoit
  `page.setRotation(degrees(p.rot))`. Les deux doivent rester d'accord.

### Le détourage des signatures

`processSignature()` estime la clarté du papier tuile par tuile, puis compare
chaque pixel à son voisinage. Un seuil global ne fonctionne pas : une photo n'est
jamais éclairée uniformément. La correction `Math.pow(a, 0.45)` rend le trait
opaque au lieu de gris pâle — c'est ce qui distingue un rendu correct d'une
signature délavée. Ne pas la retirer sans une bonne raison.

## Limites connues, à traiter si l'occasion se présente

- Le texte ajouté utilise Helvetica (police standard PDF) : les caractères hors
  WinAnsi sont remplacés par `?` dans `safeText()`. Intégrer une vraie police
  demanderait fontkit.
- Pas d'annuler / rétablir.
- L'export Word en mode texte perd tableaux et colonnes ; c'est assumé.
- Les signatures sont conservées dans `localStorage`, donc propres à un
  navigateur et à une machine.

## Vérifications avant de valider une modification

Il n'y a pas de tests automatisés. Vérifier à la main, dans le navigateur :

1. ouvrir un PDF, ajouter un texte, une signature, un cache, exporter, rouvrir
   le résultat et contrôler que tout est à la bonne place ;
2. refaire l'essai sur une page **pivotée**, c'est là que les régressions
   apparaissent ;
3. ouvrir deux PDF dans deux onglets et vérifier qu'ils ne se mélangent pas ;
4. `python3 build.py` doit se terminer sans erreur.
