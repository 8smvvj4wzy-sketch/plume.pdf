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

`processSignature()` estime la clarté du papier tuile par tuile (90e centile
d'un histogramme, agrégé sur un voisinage 3x3 de tuiles, avec un plancher fondé
sur le 95e centile global), puis compare chaque pixel à son papier local. Un
seuil global ne fonctionne pas : une photo n'est jamais éclairée uniformément,
et une tuile entièrement couverte d'encre sous-estimerait son propre papier
sans ce plancher.

Le seuil de détection (`lo`) ne descend jamais sous un plancher mesuré sur
l'écart papier/pixel de **toute l'image, transparence comprise** — un pixel
déjà transparent compte comme papier (écart nul). Compter uniquement les
pixels non transparents casserait tout sur une image déjà détourée (PNG avec
alpha) : il ne resterait alors à échantillonner que de l'encre, et le plancher
grimperait jusqu'à rendre le trait indétectable. C'est une régression qui s'est
produite une fois ; ne pas réintroduire ce filtre par pixel sans repenser le
calcul du plancher.

Le cœur du trait sort à pleine opacité, sans correction de courbe après le
gain (`Math.pow` a été retiré) : la couleur d'encre par défaut est déjà un noir
franc, et forcer les demi-teintes vers l'opaque ne faisait que boucher les
boucles fines. `despeckle()` (composantes connexes, 8-voisins) élimine les
taches isolées de moins de 0,3 % de la taille du plus grand trait avant le
recadrage, sinon un seul pixel de bruit dans un coin réduit la signature
enregistrée à une fraction du cadre.

## Limites connues, à traiter si l'occasion se présente

- **PNG 16 bits par canal (souvent niveaux de gris + transparence) : Safari
  perd la quasi-totalité de l'encre au décodage.** Constaté avec un vrai
  fichier : 99,8 % des pixels ressortent blancs contre ~93 % attendus, alors
  que Chrome, Firefox et Windows décodent le même fichier correctement.
  C'est un bug du décodeur d'image de Safari, en amont de tout ce que fait
  cette page — impossible à corriger après coup en JavaScript, puisque les
  pixels sont déjà mal décodés au moment où le code y a accès. `pngBitDepth()`
  (juste avant le handler de `#file-sig`) détecte le cas en lisant les 26
  premiers octets du fichier (signature PNG + IHDR) et avertit l'utilisateur
  de réexporter en 8 bits (Aperçu → Fichier → Exporter) plutôt que le laisser
  face à un résultat vide et silencieux.

- Le texte ajouté utilise Helvetica (police standard PDF) : les caractères hors
  WinAnsi sont remplacés par `?` dans `safeText()`. Intégrer une vraie police
  demanderait fontkit.
- Pas d'annuler / rétablir.
- L'export Word en mode texte perd tableaux et colonnes ; c'est assumé.
- Les signatures sont conservées dans `localStorage`, donc propres à un
  navigateur et à une machine. `addSignature()` retente à 1000 puis 800 px si
  le quota est dépassé, mais reste par nature limité à cet onglet.

## Vérifications avant de valider une modification

Il n'y a pas de tests automatisés. Vérifier à la main, dans le navigateur :

1. ouvrir un PDF, ajouter un texte, une signature, un cache, exporter, rouvrir
   le résultat et contrôler que tout est à la bonne place ;
2. refaire l'essai sur une page **pivotée**, c'est là que les régressions
   apparaissent ;
3. ouvrir deux PDF dans deux onglets et vérifier qu'ils ne se mélangent pas ;
4. `python3 build.py` doit se terminer sans erreur.
