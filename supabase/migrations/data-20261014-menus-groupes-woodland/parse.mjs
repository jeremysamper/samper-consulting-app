// Lecture des PDF de menus Woodland (dumps JSON de dump.mjs) vers le modèle
// groupe_menus : un menu par palier de prix, lignes marquées par saison.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const lire = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_RE = MOIS.join('|');
const REGIMES = { 'Végétarien': 'vegetarien', 'Poisson': 'poisson', 'Viande': 'viande' };

const police = (it) => it.f.split('|')[1];
const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[’']/g, "'").toLowerCase().replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();

// Fenêtre en tête d'une note : « de mai à juin, même plat... »
function lireFenetre(note) {
  const m = String(note || '').match(new RegExp(`^(?:de |d[’'])?(${MOIS_RE}) à (${MOIS_RE})(?:,\\s*(.*))?$`, 'i'));
  if (!m) return { debut: null, fin: null, reste: String(note || '').trim() };
  return { debut: MOIS.indexOf(m[1].toLowerCase()) + 1, fin: MOIS.indexOf(m[2].toLowerCase()) + 1, reste: (m[3] || '').trim() };
}

function saisonEtFenetre(saison, debut, fin) {
  if (!debut) return { saison, moisDebut: null, moisFin: null };
  const plein = saison === 'ete' ? [5, 9] : [10, 4];
  if (debut === plein[0] && fin === plein[1]) return { saison, moisDebut: null, moisFin: null };
  return { saison, moisDebut: debut, moisFin: fin };
}

// Regroupe les fragments de même ligne (ligatures « fi » coupées par pdf.js).
function lignesTexte(items) {
  const parY = new Map();
  items.forEach((it) => {
    const cle = [...parY.keys()].find((y) => Math.abs(y - it.y) < 0.6) ?? it.y;
    if (!parY.has(cle)) parY.set(cle, []);
    parY.get(cle).push(it);
  });
  return [...parY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, its]) => {
      its.sort((a, b) => a.x - b.x);
      let s = ''; its.forEach((i, k) => { const prev = its[k - 1]; if (prev && i.x - (prev.x + (prev.w || 0)) > 0.8 && !/\s$/.test(s) && !/^\s/.test(i.s)) s += ' '; s += i.s; });
      return { y, x: its[0].x, h: its[0].h, f: police(its[0]), s };
    });
}

const SECTION_DE_TITRE = {
  'Entrées froides': { section: 'entree', rubrique: 'Entrées froides' },
  'Entrées chaudes': { section: 'entree', rubrique: 'Entrées chaudes' },
  'Entrées': { section: 'entree', rubrique: '' },
  'Plats': { section: 'plat', rubrique: '' },
  'Poisson': { section: 'poisson', rubrique: '' },
  'Trou valaisan': { section: 'trou', rubrique: '' },
  'Fromages ou deuxième entrée': { section: 'fromage', rubrique: '' },
  'Fromages': { section: 'fromage', rubrique: '' },
  'Desserts': { section: 'dessert', rubrique: '' },
  'Apéritifs': { section: 'aperitif', rubrique: '' },
  'Mignardises': { section: 'mignardises', rubrique: '' },
};

// Une page de menu → { titre, sousTitre, tables: [{ titre, plats: [...] }], conseille }
function lirePageMenu(items, saison) {
  const titre = items.find((i) => i.h >= 18);
  // La présentation peut tenir sur deux lignes (séminaires) : on les réunit.
  const lignesSousTitre = items.filter((i) => police(i) === 'g_d0_f1' && i.h < 10 && titre && i.y < titre.y && i.y > titre.y - 70)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const sousTitre = lignesSousTitre.length ? { s: lignesSousTitre.map((i) => i.s.trim()).join(' ') } : null;
  // Bornes verticales des tableaux : titres de rubrique (f3, 11 pt) et notes
  // de menu (f3, 9,5 pt, à gauche).
  const reperes = items
    .filter((i) => police(i) === 'g_d0_f3' && i.x < 64 && (i.h >= 10.5 || Math.abs(i.h - 9.5) < 0.2))
    .sort((a, b) => b.y - a.y);
  const tables = [];
  let conseille = null;
  reperes.forEach((r, k) => {
    const bas = reperes[k + 1] ? reperes[k + 1].y : -1;
    const dedans = items.filter((i) => i.y < r.y - 1 && i.y > bas + 1 && i !== r);
    if (r.h >= 10.5) tables.push({ titre: r.s.trim(), items: dedans });
    else if (/^Apéritif conseillé/.test(r.s)) {
      conseille = { formule: /premium/.test(r.s) ? 'premium' : 'classique', items: dedans };
    }
  });
  return {
    titre: titre?.s.trim() || '',
    sousTitre: sousTitre?.s.trim() || '',
    tables: tables.map((t) => ({ titre: t.titre, plats: lirePlats(t.items, saison) })),
    conseille: conseille ? { formule: conseille.formule, plats: lirePlats(conseille.items, saison) } : null,
  };
}

// Plats d'un tableau, avec leur régime (colonne de gauche, centrée sur sa cellule).
function lirePlats(items, saison) {
  const labels = items.filter((i) => police(i) === 'g_d0_f3' && i.x < 75 && REGIMES[i.s.trim()])
    .map((i) => ({ y: i.y, regime: REGIMES[i.s.trim()] }))
    .sort((a, b) => b.y - a.y);
  const cases = items.filter((i) => police(i) === 'g_d0_f4' && i.s.includes('☐')).map((i) => i.y);
  const texte = items.filter((i) => !(police(i) === 'g_d0_f3' && i.x < 75 && REGIMES[i.s.trim()]) && police(i) !== 'g_d0_f4');
  const lignes = lignesTexte(texte);

  const plats = [];
  let courant = null;
  lignes.forEach((l) => {
    const estNote = l.f === 'g_d0_f3' && l.h < 8.6;
    if (estNote) {
      if (courant) courant.notes.push(l.s.trim());
      courant && (courant.bas = l.y);
      return;
    }
    const debut = !courant
      || cases.some((y) => Math.abs(y - l.y) < 0.6)
      || (cases.length === 0 && (courant.notes.length > 0 || courant.bas - l.y > 15));
    if (debut) {
      courant = { haut: l.y, bas: l.y, textes: [l.s.trim()], notes: [] };
      plats.push(courant);
    } else {
      courant.textes.push(l.s.trim());
      courant.bas = l.y;
    }
  });

  // Régimes : partition contiguë des plats qui place chaque étiquette au plus
  // près du centre de sa cellule.
  const regimes = attribuerRegimes(plats, labels);

  return plats
    .map((p, i) => {
      const libelle = p.textes.join(' ').replace(/\s+/g, ' ').replace(/^☐\s*/, '').trim().replace(/[,;]$/, '').trim();
      const note = p.notes.join(' ').trim();
      const fen = lireFenetre(note);
      return {
        libelle,
        regime: regimes[i] || '',
        ...saisonEtFenetre(saison, fen.debut, fen.fin),
        note: fen.reste,
      };
    })
    .filter((p) => p.libelle && !/^Ou une deuxième entrée/.test(p.libelle));
}

function attribuerRegimes(plats, labels) {
  if (!labels.length || !plats.length) return plats.map(() => '');
  if (labels.length === 1) return plats.map(() => labels[0].regime);
  const n = plats.length; const k = labels.length;
  let meilleur = null;
  // Coupes c1 < c2 < ... (k-1 coupes) entre 1 et n-1.
  const essayer = (debut, reste, coupes) => {
    if (reste === 0) {
      const bornes = [0, ...coupes, n];
      let cout = 0;
      for (let g = 0; g < k; g += 1) {
        const a = plats[bornes[g]]; const b = plats[bornes[g + 1] - 1];
        const centre = (a.haut + 6 + b.bas - 3) / 2;
        cout += Math.abs(centre - labels[g].y);
      }
      if (!meilleur || cout < meilleur.cout) meilleur = { cout, bornes };
      return;
    }
    for (let c = debut; c <= n - reste; c += 1) essayer(c + 1, reste - 1, [...coupes, c]);
  };
  essayer(1, k - 1, []);
  const out = [];
  for (let g = 0; g < k; g += 1) {
    for (let i = meilleur.bornes[g]; i < meilleur.bornes[g + 1]; i += 1) out[i] = labels[g].regime;
  }
  return out;
}

// ── Compléments du mariage (fiche de choix) ────────────────────────────────
const STATIONS = [
  [/douzaine/, 'douzaine', 12], [/jambon entier/, 'jambon', 120], [/demi-meule/, 'demi-meule', 40],
  [/la pièce/, 'pièce', 1], [/côté entier/, 'côté', 50], [/boîte de 50 g/, 'boîte', 10], [/par convive/, 'convive', 1],
];
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, dix: 10 };

function lireStation(prix) {
  const p = prix.replace(/\s+/g, ' ');
  const def = STATIONS.find(([re]) => re.test(p)) || [null, 'convive', 1];
  const m = p.match(/dès (\w+)/);
  let minimum = null;
  if (m) minimum = Number(m[1]) || NOMBRES[m[1]] || null;
  return { unite: def[1], portionsParUnite: def[2], minimum };
}

function lireColonnes(items, colonnes) {
  // colonnes : [x d'article] ; chaque article commence quand l'écart dépasse 11 pt
  const parCol = colonnes.map((x) => lignesTexte(items.filter((i) => Math.abs(i.x - x) < 2 || (i.x > x && i.x < x + 175 && police(i) === 'g_d0_f3'))));
  return parCol;
}

function lireComplements() {
  const items = lire('Mariage_Fiche_de_choix.json');
  const p1 = items.filter((i) => i.p === 1);
  const p2 = items.filter((i) => i.p === 2);
  const lignes = [];
  const id = (pre, n) => `mariage-0-${pre}-${String(n).padStart(2, '0')}`;

  // Apéritif : trois colonnes, rubriques en f1 9,3 pt.
  const rubriques = p1.filter((i) => police(i) === 'g_d0_f1' && Math.abs(i.h - 9.3) < 0.2)
    .map((i) => ({ x: i.x, y: i.y, s: i.s.trim() }));
  const colsX = [31.2, 215.1, 398.9];
  let nAp = 0;
  colsX.forEach((cx) => {
    const rubs = rubriques.filter((r) => Math.abs(r.x - cx) < 2).sort((a, b) => b.y - a.y);
    rubs.forEach((r, k) => {
      const bas = rubs[k + 1] ? rubs[k + 1].y : 440;
      const dans = p1.filter((i) => i.y < r.y - 1 && i.y > bas + 1 && i.x > cx + 5 && i.x < cx + 180);
      const articles = [];
      let cur = null;
      lignesTexteCol(dans).forEach((l) => {
        const marque = l.marques;
        if (l.f === 'g_d0_f2') { if (cur) cur.notes.push(l.s.trim()); return; }
        if (!cur || cur.bas - l.y > 11 || cur.notes.length) {
          cur = { textes: [l.s.trim()], notes: [], bas: l.y, premium: false, chaud: false };
          articles.push(cur);
        } else { cur.textes.push(l.s.trim()); cur.bas = l.y; }
        if (marque.includes('premium')) cur.premium = true;
        if (marque.includes('chaud')) cur.chaud = true;
      });
      articles.forEach((a) => {
        nAp += 1;
        const fen = lireFenetre(a.notes.join(' '));
        const sf = fen.debut ? saisonComplete(fen.debut, fen.fin) : { saison: '', moisDebut: null, moisFin: null };
        // Une bouchée de la rubrique « Bouchées chaudes » est chaude : la fiche
        // ne répète pas la marque sur chaque pièce de cette rubrique.
        lignes.push({
          id: id('ap', nAp), section: 'aperitif', rubrique: r.s, libelle: a.textes.join(' ').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim(),
          premium: a.premium, chaud: a.chaud || /chaudes/i.test(r.s), ...sf, note: fen.reste, parPersonne: 2,
        });
      });
    });
  });

  // Stations : 15 articles, trois colonnes.
  const stItems = p1.filter((i) => i.y < 360 && i.y > 100 && i.s.trim() !== 'Quantité');
  let nSt = 0;
  const stArts = [];
  [41, 224.8, 408.7].forEach((cx) => {
    const col = lignesTexte(stItems.filter((i) => Math.abs(i.x - cx) < 2));
    let cur = null;
    col.forEach((l) => {
      if (l.f === 'g_d0_f2') { cur.prix.push(l.s.trim()); return; }
      if (!cur || cur.prix.length) { cur = { y: l.y, x: cx, textes: [l.s.trim()], prix: [] }; stArts.push(cur); } else cur.textes.push(l.s.trim());
    });
  });
  // Ordre de lecture de la fiche : rangée par rangée, de gauche à droite.
  stArts.sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y)).forEach((a) => {
    nSt += 1;
    const prix = a.prix.join(' ').replace(/\s+/g, ' ').trim();
    lignes.push({ id: id('st', nSt), section: 'stations', rubrique: '', libelle: a.textes.join(' ').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim(), prix, ...lireStation(prix), saison: '' });
  });

  // Gâteaux : trois colonnes sous « Gâteaux maison ».
  const gaItems = p2.filter((i) => i.y < 745 && i.y > 610);
  let nGa = 0;
  [41, 224.8, 408.7].forEach((cx) => {
    const col = lignesTexte(gaItems.filter((i) => Math.abs(i.x - cx) < 2));
    let cur = null; const arts = [];
    col.forEach((l) => {
      if (l.f === 'g_d0_f2') { cur.notes.push(l.s.trim()); return; }
      if (!cur || cur.notes.length || cur.bas - l.y > 11) { cur = { textes: [l.s.trim()], notes: [], bas: l.y }; arts.push(cur); } else { cur.textes.push(l.s.trim()); cur.bas = l.y; }
    });
    arts.forEach((a) => {
      nGa += 1;
      const fen = lireFenetre(a.notes.join(' '));
      const sf = fen.debut ? saisonComplete(fen.debut, fen.fin) : { saison: '', moisDebut: null, moisFin: null };
      lignes.push({ id: id('ga', nGa), section: 'gateau', rubrique: '', libelle: a.textes.join(' ').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim(), ...sf, note: fen.reste });
    });
  });

  // Mignardises : cinq, toute l'année.
  const mi = lignesTexte(p2.filter((i) => i.y < 590 && i.y > 525 && police(i) === 'g_d0_f1'));
  const miNotes = lignesTexte(p2.filter((i) => i.y < 590 && i.y > 525 && police(i) === 'g_d0_f2'));
  let nMi = 0;
  mi.sort((a, b) => b.y - a.y || a.x - b.x);
  // les lignes de même y sont séparées par colonne
  p2.filter((i) => i.y < 590 && i.y > 525 && police(i) === 'g_d0_f1')
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((i) => {
      nMi += 1;
      const note = miNotes.length && /tartelette/i.test(i.s)
        ? p2.filter((n) => n.y < i.y && n.y > i.y - 25 && Math.abs(n.x - i.x) < 2 && police(n) === 'g_d0_f2').map((n) => n.s.trim()).join(' ')
        : '';
      lignes.push({ id: id('mi', nMi), section: 'mignardises', rubrique: '', libelle: i.s.trim(), saison: '', note });
    });

  return lignes;
}

// Une ligne de colonne avec ses marques « premium » / « chaud » (f3) rattachées.
function lignesTexteCol(items) {
  const corps = items.filter((i) => police(i) !== 'g_d0_f3');
  const marques = items.filter((i) => police(i) === 'g_d0_f3');
  return lignesTexte(corps).map((l) => ({
    ...l,
    marques: marques.filter((m) => Math.abs(m.y - l.y) < 0.6).map((m) => m.s).join(' '),
  }));
}

function saisonComplete(debut, fin) {
  if (debut === 5 && fin === 9) return { saison: 'ete', moisDebut: null, moisFin: null };
  if (debut === 10 && fin === 4) return { saison: 'hiver', moisDebut: null, moisFin: null };
  const ete = debut >= 5 && debut <= 9;
  return { saison: ete ? 'ete' : 'hiver', moisDebut: debut, moisFin: fin };
}

// ── Menus ──────────────────────────────────────────────────────────────────
function lireMenus(fichierEte, fichierHiver) {
  const parPrix = new Map();
  [['ete', fichierEte], ['hiver', fichierHiver]].forEach(([saison, f]) => {
    const items = lire(f);
    const pages = [...new Set(items.map((i) => i.p))];
    pages.forEach((p) => {
      const its = items.filter((i) => i.p === p);
      const page = lirePageMenu(its, saison);
      const prixTxt = /CHF par personne/.test(page.titre) ? page.titre : page.sousTitre;
      const m = prixTxt.match(/(\d+) CHF par personne/);
      if (!m || !page.tables.length) return;
      const prix = Number(m[1]);
      if (!parPrix.has(prix)) parPrix.set(prix, { prix, pages: {} });
      parPrix.get(prix).pages[saison] = page;
    });
  });
  return [...parPrix.values()].sort((a, b) => a.prix - b.prix);
}

const MOTS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4 };
function compter(description, mot) {
  const m = description.match(new RegExp(`(\\w+) ${mot}`, 'i'));
  return m ? (MOTS[m[1].toLowerCase()] || 1) : 1;
}

function construire(type, menus, complements) {
  return menus.map((m, k) => {
    const numero = k + 1;
    const lignes = [];
    const conseille = {};
    ['ete', 'hiver'].forEach((saison) => {
      const page = m.pages[saison];
      if (!page) return;
      let n = 0;
      page.tables.forEach((t) => {
        const sec = SECTION_DE_TITRE[t.titre];
        if (!sec) throw new Error(`Rubrique inconnue « ${t.titre} » (${type} ${m.prix} ${saison})`);
        t.plats.forEach((p) => {
          n += 1;
          lignes.push({
            id: `${type}-${numero}-${saison}-${String(n).padStart(2, '0')}`,
            section: sec.section, rubrique: sec.rubrique, ...p,
          });
        });
      });
      if (page.conseille && complements) {
        const ids = page.conseille.plats.map((p) => {
          const c = complements.find((x) => x.section === 'aperitif' && norm(x.libelle) === norm(p.libelle));
          if (!c) throw new Error(`Apéritif conseillé introuvable : ${p.libelle}`);
          return c.id;
        });
        conseille[saison] = ids;
        conseille.formule = { ...(conseille.formule || {}), [saison]: page.conseille.formule };
      }
    });
    const pageEte = m.pages.ete || m.pages.hiver;
    let nom = ''; let description = '';
    if (type === 'mariage') nom = pageEte.titre.replace(/’/g, "'") === pageEte.titre ? pageEte.titre : pageEte.titre;
    else description = pageEte.sousTitre;
    if (type === 'seminaire') {
      nom = description.split('.')[0].trim();
    }
    return { type, numero, nom, prixPax: m.prix, description, lignes, regles: regles(type, description, lignes, conseille) };
  });
}

function regles(type, description, lignes, conseille) {
  const sections = {};
  const presentes = new Set(lignes.map((l) => l.section));
  if (type === 'mariage') {
    sections.entree = { mode: 'carte', retenir: 3, dontVege: 1 };
    sections.plat = { mode: 'carte', retenir: 3, dontVege: 1 };
    if (presentes.has('poisson')) sections.poisson = { mode: 'table', nombre: 1, versionVege: true };
    if (presentes.has('trou')) sections.trou = { mode: 'servi' };
    if (presentes.has('fromage')) sections.fromage = { mode: 'table', nombre: 1, versionVege: true, puiserDans: ['entree'], label: 'Fromages ou deuxième entrée' };
    sections.mignardises = { mode: 'table', nombre: 1 };
  } else {
    const d = description.toLowerCase();
    sections.entree = { mode: 'table', nombre: 1, versionVege: true };
    sections.plat = { mode: 'table', nombre: 1, versionVege: true };
    sections.dessert = { mode: 'table', nombre: 1 };
    if (presentes.has('aperitif')) sections.aperitif = { mode: 'table', nombre: compter(d, 'apéritifs?') };
    if (presentes.has('fromage')) sections.fromage = { mode: 'table', nombre: 1 };
    if (presentes.has('mignardises')) sections.mignardises = { mode: 'table', nombre: compter(d, 'mignardises?') };
  }
  const out = { sections };
  if (conseille.ete || conseille.hiver) out.aperitifConseille = conseille;
  return out;
}

const complements = lireComplements();
const mariage = construire('mariage', lireMenus('Woodland_Mariage_Mai_a_Septembre.json', 'Woodland_Mariage_Octobre_a_Avril.json'), complements);
const groupe = construire('groupe', lireMenus('Woodland_Groupes_Mai_a_Septembre_selection.json', 'Woodland_Groupes_Octobre_a_Avril_selection.json'));
const seminaire = construire('seminaire', lireMenus('Woodland_Seminaires_Mai_a_Septembre.json', 'Woodland_Seminaires_Octobre_a_Avril.json'));

const complementsMenu = {
  type: 'mariage', numero: 0, nom: 'Compléments du mariage', prixPax: null,
  description: "Apéritif du vin d'honneur, stations, gâteau et mignardises, communs aux quatre menus.",
  lignes: complements,
  regles: {
    sections: {
      aperitif: {
        mode: 'table', nombre: 4, auMoinsChaud: 1, parPersonne: 2, facultatif: true,
        formules: [
          { id: 'classique', label: 'Formule classique', prix: 20, premium: false },
          { id: 'premium', label: 'Formule premium', prix: 35, premium: true },
        ],
      },
      stations: { mode: 'quantites', facultatif: true },
      gateau: {
        mode: 'table', nombre: 1, facultatif: true,
        formules: [
          { id: 'apporte', label: 'Les mariés apportent leur gâteau', prix: 0, aucunChoix: true },
          { id: 'maison', label: 'Gâteau maison', prix: 9 },
        ],
      },
      mignardises: { mode: 'table', nombre: 1 },
    },
  },
};

const tous = [...mariage, complementsMenu, ...groupe, ...seminaire];
fs.writeFileSync(path.join(DIR, 'menus-woodland.json'), JSON.stringify(tous, null, 1));

// Relevé lisible
const out = [];
tous.forEach((m) => {
  out.push(`\n=== ${m.type} n°${m.numero} ${m.nom || ''} ${m.prixPax ?? ''} CHF | ${m.description}`);
  out.push(`    règles ${JSON.stringify(m.regles)}`);
  m.lignes.forEach((l) => {
    const fen = l.moisDebut ? ` [${MOIS[l.moisDebut - 1]}-${MOIS[l.moisFin - 1]}]` : '';
    const marques = [l.premium ? 'premium' : '', l.chaud ? 'chaud' : ''].filter(Boolean).join(',');
    out.push(`  ${l.id.padEnd(22)} ${String(l.saison || 'année').padEnd(5)} ${l.section.padEnd(11)} ${String(l.regime || '').padEnd(10)} ${l.rubrique ? '(' + l.rubrique + ') ' : ''}${l.libelle}${fen}${marques ? ' {' + marques + '}' : ''}${l.prix ? ' <' + l.prix + ' | ' + l.unite + ' x' + l.portionsParUnite + (l.minimum ? ' min ' + l.minimum : '') + '>' : ''}${l.note ? '  // ' + l.note : ''}`);
  });
});
fs.writeFileSync(path.join(DIR, 'releve.txt'), out.join('\n'));
console.log('menus', tous.length, 'lignes', tous.reduce((s, m) => s + m.lignes.length, 0));
