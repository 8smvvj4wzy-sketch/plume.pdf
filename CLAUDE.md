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
projet ouvert ; changer d'onglet réaffecte `S`. `TOOL`, `PENDING`, `SIGS` et
`FIND` sont communs à tous les onglets. Après toute modification de l'état,
appeler `buildRail()`, `renderMain()` puis `syncChrome()`.

Les piles d'annulation (`S.undo`, `S.redo`) appartiennent à l'onglet. Toute
mutation doit appeler `snapshot()` **avant** de modifier quoi que ce soit ; les
gestes continus (déplacement, redimensionnement, tracé) prennent leur
instantané au `pointerdown` et ne l'empilent, par `pushSnapshot()`, qu'au
relâchement et seulement s'ils ont produit un changement. Le clonage est
volontairement superficiel sur les objets : `{...it}` partage la dataURL d'une
signature au lieu de la recopier. Ne pas passer à `structuredClone`.

### Le système de coordonnées, à comprendre avant d'y toucher

Les objets posés sont stockés en **points, origine en haut à gauche, dans
l'espace d'affichage de la page, rotation comprise**. Le PDF, lui, place son
origine en bas à gauche sur la page non pivotée. La conversion se fait
uniquement dans `viewToPdf()`, au moment de l'export.

Deux familles d'objets, et elles ne se traitent pas pareil :

- **Boîtes** (`text`, `image`, `mask`, `rect`, `highlight`) : un coin, une
  largeur, une hauteur. À l'export l'ancre est le **coin bas-gauche affiché**,
  et l'objet reçoit `rotate: degrees(p.rot)`, ce qui compense la rotation
  appliquée par le lecteur PDF. À la rotation d'une page, `turnItems()`
  transporte le coin et échange `w` et `h`.
- **Tracés** (`ink`, `arrow`, reconnus par `isPath()`) : une liste de points,
  pas de coin. Chaque point passe par `viewToPdf()` individuellement et **il
  n'y a pas de `rotate` à passer** — une géométrie décrite par ses points est
  déjà dans l'espace d'arrivée. À la rotation, `turnItems()` transporte chaque
  point ; il n'y a ni `w` ni `h` à échanger.

`pdf.js` reçoit `getViewport({ scale, rotation: p.rot })`, `pdf-lib` reçoit
`page.setRotation(degrees(p.rot))`. Les deux doivent rester d'accord.

**Ajouter un type d'objet demande de toucher quatre endroits**, et en oublier
un donne un objet qui s'affiche puis disparaît à l'export :
`paintItems()` (écran), `turnItems()` (rotation), `buildPdf()` (export PDF) et
`pageToCanvas()` (exports PNG, Word « mise en page fidèle », et pages
aplaties). Le harnais de test contrôle les quatre.

### Le caviardage supprime vraiment le texte

Un cache est un rectangle posé par-dessus la page : le texte qu'il recouvre
resterait dans le PDF et se copierait encore. `buildPdf()` rend donc en image
toute page portant un cache (`hasMask()` → `flattenPage()`), caches compris,
et réintègre cette image : ce qui était dessous n'existe plus dans le fichier.

Deux points à ne pas défaire :

- **Seules** les pages masquées sont aplaties. Les autres sont recopiées telles
  quelles et gardent leur texte sélectionnable et recherchable ; on ne paie la
  perte du texte que là où elle protège quelque chose.
- La page aplatie est **droite et aux dimensions affichées** : `pageToCanvas()`
  a déjà appliqué `rotation: p.rot` au viewport, donc elle ne reçoit ni
  `setRotation()` ni un second dessin des objets. Les redessiner les
  doublerait, la faire pivoter la coucherait.

### La recherche

`pageHits()` compose la matrice du fragment avec celle d'un viewport à
l'échelle 1 : les occurrences sortent donc directement dans l'espace
d'affichage des objets posés, ce qui permet d'en faire des caches sans
conversion. Le rectangle vient de **l'enveloppe des quatre coins transportés** :
décaler l'ordonnée de la hauteur du texte ne vaut qu'à 0°, puisque sur une page
pivotée « au-dessus de la ligne de base » n'est plus la direction des `y`.

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
- L'export Word en mode texte perd tableaux et colonnes ; c'est assumé.
- Les signatures sont conservées dans `localStorage`, donc propres à un
  navigateur et à une machine. `addSignature()` retente à 1000 puis 800 px si
  le quota est dépassé, mais reste par nature limité à cet onglet.
- La recherche ne franchit pas les coupures que le PDF pose au milieu des mots :
  une requête étalée sur deux fragments de texte n'est pas trouvée. Un scan sans
  couche texte ne renvoie rien — il faudrait un OCR.
- Les tracés n'ont pas de poignée de redimensionnement : les étirer les
  déformerait.
- Le titre et l'auteur (`S.meta`) ne passent pas par les piles d'annulation.
- Pas de remplissage de formulaires, pas de chiffrement, pas d'édition du texte
  déjà présent dans le PDF.

## Les documents conservés sur la machine

« Récents » range dans **IndexedDB** (base `plume`, magasin `recents`) les
octets d'origine *et* le projet — ordre des pages, rotations, objets posés —
pour rendre le travail à la réouverture, et pas seulement le fichier.
`localStorage` ne conviendrait pas : quelques mégaoctets contre les vingt d'un
PDF scanné.

Rien ne part sur Internet et la promesse du programme tient : IndexedDB est
cloisonné par origine. Mais c'est le seul endroit du programme où un document
survit à la fermeture de l'onglet, ce qui se décide sur un poste partagé. D'où,
sur l'écran d'accueil et non dans un réglage caché, l'interrupteur « Ne rien
conserver » et le bouton « Vider la liste ». **Couper la conservation efface
aussi ce qui restait** — laisser des documents derrière soi contredirait ce que
la case promet.

Deux comportements à préserver : un quota atteint ou un magasin refusé
n'interrompt jamais l'édition (`recSave()` renonce en silence), et là où
IndexedDB est indisponible — Safari en `file://`, navigation privée — la
section disparaît au lieu d'afficher une liste éternellement vide, tandis que
l'avertissement `beforeunload` reprend du service puisque le travail redevient
volatil.

## Vérifications avant de valider une modification

Un harnais remplace la liste à cliquer d'autrefois :

```bash
python3 build.py && node tests/verify.mjs
```

Il pilote un Chromium sans interface (Playwright) sur
`dist/Plume-PDF-autonome.html` — donc sans réseau, et `build.py` se trouve
validé du même coup. Le script de l'application étant un `<script>` classique,
ses fonctions de premier niveau sont globales et le harnais les appelle
directement : rien à instrumenter dans `index.html`.

Il couvre le contraste, l'aller-retour des coordonnées à l'export sur les
quatre rotations, l'invariant `4 × turnItems() = identité`, le caviardage, les
quatre chemins de sortie de chaque type d'annotation, la recherche, la gestion
des pages, l'annulation et les récents (y compris quand IndexedDB est refusé).

`node tests/verify.mjs contraste caviardage` n'exécute que les sections
nommées. Une nouvelle fonctionnalité mérite sa section : le harnais n'a de
valeur que s'il grandit avec le programme.
