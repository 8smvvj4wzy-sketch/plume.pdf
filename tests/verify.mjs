/* Vérification automatisée de Plume.
 *
 * Il n'y a pas de framework de test : ce fichier est un script Node qui pilote
 * un Chromium sans interface et affirme une série de propriétés. Il remplace la
 * liste de vérifications à cliquer que décrivait CLAUDE.md.
 *
 *     python3 build.py && node tests/verify.mjs
 *
 * Deux partis pris rendent le harnais court :
 *
 *  - il s'exécute sur dist/Plume-PDF-autonome.html, où les trois bibliothèques
 *    sont intégrées : aucune requête réseau, et build.py se trouve validé du
 *    même coup ;
 *  - le script de l'application est un <script> classique, donc ses fonctions
 *    de premier niveau sont globales. page.evaluate() appelle directement
 *    loadPdf, buildPdf, turnItems, pageToCanvas et lit S par son nom. Rien à
 *    instrumenter dans index.html.
 *
 * Playwright est requis (il est fourni par l'environnement de développement ;
 * sinon `npm i -g playwright`).
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

/* Playwright peut être installé localement ou globalement ; un import ESM ne
   regarde que le premier cas, d'où le repli explicite sur la racine globale. */
const pw = await import("playwright").catch(async () => {
  try {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return await import(pathToFileURL(join(root, "playwright", "index.js")).href);
  } catch {
    console.error("Playwright est introuvable. Installez-le : npm i -g playwright");
    process.exit(2);
  }
});
// le paquet global est en CommonJS : ses exports arrivent sous `default`
const chromium = pw.chromium ?? pw.default?.chromium;

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = join(ROOT, "dist", "Plume-PDF-autonome.html");

/* ------------------------------------------------------------- ossature */

let passed = 0;
const failures = [];
let group = "";

const section = (name) => { group = name; console.log("\n\x1b[1m" + name + "\x1b[0m"); };

function check(label, ok, detail) {
  if (ok) { passed++; console.log("  \x1b[32m✓\x1b[0m " + label); }
  else {
    failures.push(group + " — " + label + (detail ? "\n      " + detail : ""));
    console.log("  \x1b[31m✗ " + label + "\x1b[0m" + (detail ? "\n      " + detail : ""));
  }
}

const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

/* ------------------------------------------------------------ démarrage */

if (!existsSync(APP)) {
  console.error("dist/Plume-PDF-autonome.html est absent. Lancez d'abord : python3 build.py");
  process.exit(2);
}

const browser = await chromium.launch();

/** Ouvre l'application dans un contexte neuf et attend qu'elle soit prête. */
async function openApp(opts = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(APP).href);
  await page.waitForFunction(() => typeof loadPdf === "function" && typeof buildPdf === "function");
  return { context, page, errors };
}

/* Le jeu d'essai est fabriqué dans la page avec le pdf-lib déjà chargé :
   deux pages A4 portant chacune un texte connu, à des coordonnées connues.
   Rien à versionner, et le contenu reste sous le contrôle du test. */
const MAKE_FIXTURE = async (marker) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const pg = doc.addPage([595, 842]);
    // le marqueur apparaît deux fois par page : de quoi compter des occurrences
    pg.drawText(marker, { x: 72, y: 742, size: 14, font });
    pg.drawText("page " + (i + 1) + " " + marker, { x: 72, y: 400, size: 14, font });
  }
  return await doc.save();
};

/** Charge le jeu d'essai dans l'application, comme le ferait un glisser-déposer. */
async function loadFixture(page, marker = "CONFIDENTIEL") {
  await page.evaluate(async ({ src, marker }) => {
    const bytes = await new Function("PDFDocument", "StandardFonts", "marker",
      "return (" + src + ")(marker)")(PDFDocument, StandardFonts, marker);
    const file = new File([bytes], "essai.pdf", { type: "application/pdf" });
    await loadPdf(file, false);
  }, { src: MAKE_FIXTURE.toString(), marker });
  await page.waitForFunction(() => S.pages.length === 2);
}

/* ----------------------------------------------------- 1. contraste WCAG */

/* Calcul du ratio WCAG 2.1, exécuté dans la page pour lire les couleurs
   réellement appliquées plutôt que celles écrites dans la feuille de style. */
const CONTRAST_PROBE = () => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
  const ratio = (a, b) => {
    const [la, lb] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (la + 0.05) / (lb + 0.05);
  };
  // fond effectif : on remonte les ancêtres jusqu'à une couleur non transparente
  const backdrop = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.length === 3 || (c[3] ?? 1) > 0.9) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const probe = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color).slice(0, 3);
    const bg = parse(cs.backgroundColor).slice(0, 3);
    const bd = backdrop(el);
    return {
      texte: ratio(fg, bg.length === 3 ? bg : bd),
      bordure: ratio(parse(cs.borderTopColor).slice(0, 3), bd),
      surface: ratio(bg.length === 3 ? bg : bd, bd),
    };
  };
  return {
    "#btn-open": probe("#btn-open"),
    "#btn-open-2": probe("#btn-open-2"),
    "#zoom-fit": probe("#zoom-fit"),
    '.tool[data-tool="text"]': probe('.tool[data-tool="text"]'),
  };
};

async function testContraste() {
  section("Contraste");
  const { context, page } = await openApp();
  const r = await page.evaluate(CONTRAST_PROBE);

  for (const [sel, m] of Object.entries(r)) {
    if (!m) { check(sel + " présent", false); continue; }
    check(`${sel} — texte ${m.texte.toFixed(2)}:1 ≥ 4,5:1`, m.texte >= 4.5);
    // WCAG 1.4.11 : le contour d'un composant doit atteindre 3:1 contre son
    // fond. La surface seule peut rester discrète si la bordure porte le seuil.
    check(`${sel} — contour ${Math.max(m.bordure, m.surface).toFixed(2)}:1 ≥ 3:1`,
      Math.max(m.bordure, m.surface) >= 3);
  }
  await context.close();
}

/* -------------------------------------- 2. aller-retour des coordonnées */

/* Pose un texte et un cache à des positions connues, exporte, relit le PDF
   produit et compare aux coordonnées PDF attendues. Rejoué sur les quatre
   rotations : c'est là que les régressions apparaissent. */
async function testCoordonnees() {
  section("Coordonnées à l'export");
  const { context, page } = await openApp();
  await loadFixture(page);

  for (const rot of [0, 90, 180, 270]) {
    const res = await page.evaluate(async (rot) => {
      const p = S.pages[0];
      p.rot = rot;
      p.items = [{ id: "t1", kind: "text", x: 100, y: 50, text: "REPERE",
                   size: 20, color: "#000000", bold: false }];
      measure(p.items[0]);
      const attendu = viewToPdf(p, 100, 50 + 20 * 0.8); // ancre = ligne de base
      const bytes = await buildPdf([p]);

      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const pg = await doc.getPage(1);
      const tc = await pg.getTextContent();
      const hit = tc.items.find((i) => i.str.includes("REPERE"));
      return hit
        ? { ok: true, rot: (await pg.getViewport({ scale: 1 })).rotation,
            x: hit.transform[4], y: hit.transform[5], ax: attendu.x, ay: attendu.y }
        : { ok: false };
    }, rot);

    check(`rot ${rot}° — le texte est retrouvé dans le PDF produit`, res.ok);
    if (!res.ok) continue;
    check(`rot ${rot}° — position (${res.x.toFixed(1)}, ${res.y.toFixed(1)}) = attendue (${res.ax.toFixed(1)}, ${res.ay.toFixed(1)})`,
      near(res.x, res.ax) && near(res.y, res.ay));
    check(`rot ${rot}° — la rotation est portée par la page produite`, res.rot === rot);
  }
  await context.close();
}

/* ------------------------------------------- 3. invariant de rotation */

/* Quatre rotations dans le même sens ramènent à l'identité. Le test couvre
   tous les types d'items présents, y compris ceux ajoutés par la suite. */
async function testInvariantRotation() {
  section("Invariant de rotation (4 × turnItems = identité)");
  const { context, page } = await openApp();
  await loadFixture(page);

  for (const dir of [1, -1]) {
    const res = await page.evaluate((dir) => {
      const p = S.pages[0];
      p.rot = 0;
      p.items = [
        { id: "a", kind: "text", x: 40, y: 60, text: "A", size: 12, color: "#000", bold: false, w: 10, h: 15 },
        { id: "b", kind: "mask", x: 120, y: 200, w: 80, h: 30, color: "#FFFFFF" },
        { id: "c", kind: "image", src: "", x: 300, y: 500, w: 60, h: 40 },
      ];
      const avant = JSON.stringify(p.items);
      for (let i = 0; i < 4; i++) { turnItems(p, dir); p.rot = (p.rot + dir * 90 + 360) % 360; }
      return { avant, apres: JSON.stringify(p.items), rot: p.rot };
    }, dir);

    check(`sens ${dir > 0 ? "horaire" : "antihoraire"} — items identiques après 360°`,
      res.avant === res.apres, res.avant === res.apres ? "" : `avant ${res.avant}\n      après ${res.apres}`);
    check(`sens ${dir > 0 ? "horaire" : "antihoraire"} — rotation revenue à 0`, res.rot === 0);
  }
  await context.close();
}

/* --------------------------------------------------- 4. rendu à l'écran */

/* Des coordonnées justes n'impliquent pas un dessin au bon endroit : on
   échantillonne le canvas produit par pageToCanvas(), qui sert aux exports
   PNG, Word « mise en page fidèle » et à l'aplatissement. */
async function testRendu() {
  section("Rendu (pageToCanvas)");
  const { context, page } = await openApp();
  await loadFixture(page);

  const res = await page.evaluate(async () => {
    const p = S.pages[0];
    p.rot = 0;
    // un cache noir bien repérable, posé sur une zone vierge de la page
    p.items = [{ id: "m", kind: "mask", x: 200, y: 300, w: 100, h: 60, color: "#000000" }];
    const c = await pageToCanvas(p, 1200);
    const k = c.width / viewW(p);
    const ctx = c.getContext("2d");
    const dans = ctx.getImageData(Math.round(250 * k), Math.round(330 * k), 1, 1).data;
    const hors = ctx.getImageData(Math.round(250 * k), Math.round(150 * k), 1, 1).data;
    return { dans: [...dans].slice(0, 3), hors: [...hors].slice(0, 3) };
  });

  check(`le centre du cache est noir (${res.dans})`, res.dans.every((v) => v < 40));
  check(`un point hors du cache reste blanc (${res.hors})`, res.hors.every((v) => v > 215));
  await context.close();
}

/* ------------------------------------------------------ 5. caviardage */

/* La propriété qui compte : après export, le texte recouvert n'est plus
   extractible du fichier. Et son corollaire, qu'on ne paie l'aplatissement que
   là où il protège quelque chose — une page sans cache garde son texte. */
async function testCaviardage() {
  section("Caviardage");
  const { context, page } = await openApp();
  await loadFixture(page, "SECRETABSOLU");

  for (const rot of [0, 90, 180, 270]) {
    const res = await page.evaluate(async (rot) => {
      // la page 1 est caviardée, la page 2 ne l'est pas
      const p1 = S.pages[0], p2 = S.pages[1];
      p1.rot = rot; p2.rot = rot;
      // un cache large, qui couvre sûrement les deux lignes de la page
      p1.items = [{ id: "m", kind: "mask", x: 0, y: 0,
                    w: viewW(p1), h: viewH(p1), color: "#FFFFFF" }];
      p2.items = [];
      const bytes = await buildPdf([p1, p2]);

      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const texte = async (n) => (await (await doc.getPage(n)).getTextContent())
        .items.map((i) => i.str).join(" ");
      return { p1: await texte(1), p2: await texte(2), taille: bytes.length };
    }, rot);

    check(`rot ${rot}° — le texte caviardé a disparu du fichier`,
      !res.p1.includes("SECRETABSOLU"), "extrait : " + JSON.stringify(res.p1.slice(0, 80)));
    check(`rot ${rot}° — la page sans cache garde son texte`,
      res.p2.includes("SECRETABSOLU"), "extrait : " + JSON.stringify(res.p2.slice(0, 80)));
  }

  /* Le texte disparaît aussi si la page aplatie sort blanche ou de travers.
     On rouvre donc le PDF produit et on compare son rendu à ce que l'écran
     montrait : mêmes dimensions, cache blanc au bon endroit, et le reste du
     contenu toujours là. */
  for (const rot of [0, 90, 270]) {
    const res = await page.evaluate(async (rot) => {
      const p = S.pages[0];
      p.rot = rot;
      // un cache étroit sur la seule ligne du haut ; celle du milieu doit rester
      p.items = [{ id: "m", kind: "mask", x: 60, y: 80, w: 220, h: 30, color: "#FFFFFF" }];
      const bytes = await buildPdf([p]);

      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const pg = await doc.getPage(1);
      const vp = pg.getViewport({ scale: 1 });
      const c = document.createElement("canvas");
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;

      // combien de pixels sombres dans la bande du cache, et dans celle d'en bas
      const sombres = (x, y, w, h) => {
        const d = ctx.getImageData(x, y, w, h).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++;
        return n;
      };
      return {
        larg: vp.width, haut: vp.height,
        attLarg: viewW(p), attHaut: viewH(p),
        // la page aplatie est droite et aux dimensions affichées : le rectangle
        // du cache s'y lit tel quel, sans conversion
        dansCache: sombres(60, 80, 220, 30),
        // le texte se déplace avec la rotation ; on ne cherche donc pas une
        // ligne précise, seulement qu'il reste de l'encre quelque part
        total: sombres(0, 0, c.width, c.height),
      };
    }, rot);

    check(`rot ${rot}° — la page aplatie a les dimensions affichées (${res.larg}×${res.haut})`,
      near(res.larg, res.attLarg, 2) && near(res.haut, res.attHaut, 2),
      `attendu ${res.attLarg}×${res.attHaut}`);
    check(`rot ${rot}° — la zone caviardée est vide (${res.dansCache} px sombres)`,
      res.dansCache === 0);
    check(`rot ${rot}° — la page n'est pas sortie blanche (${res.total} px sombres)`,
      res.total > 100);
  }
  await context.close();
}

/* -------------------------------------------------------- 6. recherche */

/* Le jeu d'essai porte le marqueur deux fois par page, sur deux pages : la
   recherche doit en trouver quatre, et « caviarder toutes les occurrences »
   doit poser quatre caches qu'une seule annulation retire. Le tout rejoué sur
   une page pivotée, où les coordonnées des fragments changent. */
async function testRecherche() {
  section("Recherche");
  const { context, page } = await openApp();
  await loadFixture(page, "MARQUEUR");

  for (const rot of [0, 90, 270]) {
    const res = await page.evaluate(async (rot) => {
      S.pages.forEach((p) => { p.rot = rot; p.items = []; });
      await runFind("MARQUEUR");
      const n = FIND.hits.length;
      // toutes les occurrences doivent tomber dans les limites de leur page
      const dedans = FIND.hits.every((h) => {
        const p = S.pages.find((x) => x.uid === h.uid);
        return h.x >= -2 && h.y >= -2 && h.w > 0 && h.h > 0 &&
               h.x + h.w <= viewW(p) + 2 && h.y + h.h <= viewH(p) + 2;
      });

      const avant = S.undo.length;
      maskAllHits();
      const caches = S.pages.reduce((s, p) => s + p.items.filter((i) => i.kind === "mask").length, 0);
      const pile = S.undo.length - avant;
      undo();
      const apres = S.pages.reduce((s, p) => s + p.items.filter((i) => i.kind === "mask").length, 0);
      return { n, dedans, caches, pile, apres };
    }, rot);

    check(`rot ${rot}° — 4 occurrences trouvées (${res.n})`, res.n === 4);
    check(`rot ${rot}° — toutes tiennent dans les limites de leur page`, res.dedans);
    check(`rot ${rot}° — 4 caches posés (${res.caches})`, res.caches === 4);
    check(`rot ${rot}° — une seule annulation les retire tous`, res.pile === 1 && res.apres === 0,
      `pile +${res.pile}, restants ${res.apres}`);
  }

  /* Tenir dans la page ne prouve pas tomber SUR le mot. On rend donc la page
     et on regarde l'encre sous chaque rectangle : un surlignage bien posé
     recouvre des pixels sombres, un rectangle égaré tomberait sur du papier
     blanc. (Vérifier plutôt que le mot disparaît du PDF exporté ne prouverait
     rien ici : la page entière est aplatie dès qu'elle porte un cache.) */
  for (const rot of [0, 90, 180, 270]) {
    const res = await page.evaluate(async (rot) => {
      S.pages.forEach((p) => { p.rot = rot; p.items = []; });
      await runFind("MARQUEUR");

      const p = S.pages[0];
      const c = await pageToCanvas(p, 1600);
      const k = c.width / viewW(p);
      const ctx = c.getContext("2d");
      const encre = (h) => {
        const d = ctx.getImageData(Math.round(h.x * k), Math.round(h.y * k),
                                   Math.max(1, Math.round(h.w * k)),
                                   Math.max(1, Math.round(h.h * k))).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++;
        return n;
      };
      return FIND.hits.filter((h) => h.uid === p.uid).map(encre);
    }, rot);

    check(`rot ${rot}° — chaque surlignage recouvre du texte (encre : ${res.join(", ")})`,
      res.length > 0 && res.every((n) => n > 15));
  }

  // ce qui n'existe pas ne doit rien renvoyer, sans casser
  const vide = await page.evaluate(async () => {
    await runFind("CHAINEABSENTE");
    return { n: FIND.hits.length, libelle: document.querySelector("#find-count").textContent };
  });
  check("une chaîne absente ne renvoie rien", vide.n === 0);
  check("l'absence est dite à l'utilisateur", /aucune/i.test(vide.libelle), vide.libelle);

  // les occurrences ne doivent pas se reporter d'un onglet à l'autre
  const onglets = await page.evaluate(async () => {
    await runFind("MARQUEUR");
    const avant = FIND.hits.length;
    switchTab(0);
    return { avant, apres: FIND.hits.length };
  });
  check("changer d'onglet remet la recherche à zéro",
    onglets.avant > 0 && onglets.apres === 0);
  await context.close();
}

/* ------------------------------------------------ 7. annuler / rétablir */

/* Enchaîne des gestes de natures différentes, puis affirme qu'une empreinte
   de l'état revient à l'identique après N annulations, et de nouveau après N
   rétablissements. L'empreinte porte sur ce qui se répare : l'ordre des
   pages, leur rotation et leurs objets. */
async function testAnnuler() {
  section("Annuler / rétablir");
  const { context, page } = await openApp();
  await loadFixture(page);

  const res = await page.evaluate(async () => {
    const empreinte = () => JSON.stringify(S.pages.map((p) => ({
      uid: p.uid, rot: p.rot,
      items: p.items.map((it) => ({ ...it, src: it.src ? "…" : undefined })),
    })));

    const etats = [empreinte()];
    const p = () => S.pages[S.cur];

    snapshot(); p().items.push({ id: "t", kind: "text", x: 40, y: 40, text: "A", size: 12, color: "#000", bold: false, w: 6, h: 15 });
    etats.push(empreinte());
    snapshot(); p().items.push({ id: "m", kind: "mask", x: 10, y: 10, w: 50, h: 20, color: "#FFFFFF" });
    etats.push(empreinte());
    snapshot(); p().items[0].x = 200;                      // déplacement
    etats.push(empreinte());
    rotatePage(p(), 1);                                     // rotation (snapshot interne)
    etats.push(empreinte());
    snapshot(); S.pages.reverse();                          // réordonnancement
    etats.push(empreinte());
    removePages([S.pages[0].uid]);                          // suppression (snapshot interne)
    etats.push(empreinte());

    const n = etats.length - 1;
    const remonte = [];
    for (let i = 0; i < n; i++) { undo(); remonte.push(empreinte()); }
    const redescend = [];
    for (let i = 0; i < n; i++) { redo(); redescend.push(empreinte()); }

    return {
      n,
      // après i+1 annulations on doit retrouver l'état etats[n-1-i]
      annule: remonte.every((e, i) => e === etats[n - 1 - i]),
      retabli: redescend.every((e, i) => e === etats[i + 1]),
      depart: remonte[n - 1] === etats[0],
      arrivee: redescend[n - 1] === etats[n],
      undoVide: S.undo.length > 0,
    };
  });

  check(`${res.n} gestes annulés un à un retrouvent chaque état antérieur`, res.annule);
  check("la dernière annulation retrouve le document d'origine", res.depart);
  check(`${res.n} rétablissements retrouvent chaque état`, res.retabli);
  check("le dernier rétablissement retrouve l'état final", res.arrivee);

  // un clic de sélection ne doit pas empiler d'instantané
  const bruit = await page.evaluate(() => {
    const avant = S.undo.length;
    const el = document.querySelector(".item");
    if (el) el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 5, clientY: 5 }));
    return S.undo.length - avant;
  });
  check("un clic sans déplacement ne remplit pas la pile", bruit === 0, "delta " + bruit);
  await context.close();
}

/* ------------------------------------------------- 6. version autonome */

async function testAutonome() {
  section("Version autonome");
  const html = readFileSync(APP, "utf8");
  check("aucune référence à cdnjs.cloudflare.com", !html.includes("cdnjs.cloudflare.com"));

  const { context, page, errors } = await openApp();
  // file:, blob: et data: restent dans la machine — le worker pdf.js de la
  // version autonome est justement servi depuis un blob fabriqué par build.py.
  const local = /^(file|blob|data):/;
  const req = [];
  page.on("request", (r) => { if (!local.test(r.url())) req.push(r.url()); });
  await loadFixture(page);
  check("aucune requête réseau au chargement d'un PDF", req.length === 0, req.join("\n      "));
  check("aucune erreur JavaScript", errors.length === 0, errors.join("\n      "));
  await context.close();
}

/* --------------------------------------------------------------- suite */

const SUITE = [
  ["contraste", testContraste],
  ["coordonnees", testCoordonnees],
  ["rotation", testInvariantRotation],
  ["rendu", testRendu],
  ["caviardage", testCaviardage],
  ["recherche", testRecherche],
  ["annuler", testAnnuler],
  ["autonome", testAutonome],
];

const only = process.argv.slice(2);
for (const [nom, fn] of SUITE) {
  if (only.length && !only.includes(nom)) continue;
  try { await fn(); }
  catch (e) { section(nom); check("le test s'est exécuté jusqu'au bout", false, String(e.stack || e)); }
}

await browser.close();

console.log("");
if (failures.length) {
  console.log(`\x1b[31m${failures.length} échec(s)\x1b[0m sur ${passed + failures.length} vérifications :`);
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log(`\x1b[32m${passed} vérifications passées.\x1b[0m`);
