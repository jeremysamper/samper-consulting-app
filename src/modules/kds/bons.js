// Bons du passe : recolle les bons KDS d'une même table en un seul bon de
// cuisine, rangé par suite (En direct, À suivre, À suivre 2...).
//
// La caisse crée un bon KDS (kds_orders) à chaque envoi et à chaque
// réclamation, et le KDS ne sait d'un plat que « tenu ou non » (a_suivre) :
// « À suivre » et « À suivre 2 » y sont confondus. Ici :
//   - une clé par ticket de caisse réunit ses bons successifs (un bon
//     Lightspeed reste seul, il porte déjà toute la table) ;
//   - la suite de chaque plat est lue sur sa ligne de caisse (lignes : Map
//     id de ligne -> { suite, ordre }), avec un repli quand elle manque ;
//   - l'état du bon décide de sa place à l'écran :
//       faire   : au moins un plat à faire, le bon est dans la file ;
//       attente : tout ce qui est parti est fait et des suites sont encore
//                 tenues, le bon va à la fin et revient à la réclamation ;
//       pret    : plus rien à faire ni à attendre, il reste à la fin jusqu'à
//                 ce qu'on le termine ;
//       termine : tous ses bons KDS sont terminés au passe ou fermés en caisse.
// Fonctions pures, sans React ni réseau (essais : bons.test.mjs).

const RE_BON = /^caisse:([0-9a-f-]{36}):(\d+):/i;
const RE_LIGNE = /^caisse:([0-9a-f-]{36})$/i;

// Rang de la section « À suivre » quand la suite d'un plat tenu n'est pas
// connue (Lightspeed, ou ligne de caisse illisible) : après toutes les autres.
export const RANG_TENU = 99;

export function cleDuBon(order) {
  const m = RE_BON.exec(order?.lsCheckUuid || '');
  return m
    ? { cle: `caisse:${m[1].toLowerCase()}`, caisse: true, suite: Number(m[2]) }
    : { cle: `bon:${order?.id}`, caisse: false, suite: null };
}

export function idLigneCaisse(item) {
  const m = RE_LIGNE.exec(item?.lineKey || '');
  return m ? m[1].toLowerCase() : null;
}

export const estVivant = (order) => order?.status === 'open' && !order?.completedAt;

function ms(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

const parOrdre = (a, b) => String(a.ordre).localeCompare(String(b.ordre))
  || String(a.nom).localeCompare(String(b.nom))
  || String(a.id).localeCompare(String(b.id));

// Les lignes de caisse à lire pour ranger les plats par suite : celles des
// tickets qui ont encore un bon au passe. Un bon terminé n'en a pas besoin.
export function lignesALire(orders) {
  const vivantes = new Set();
  (orders || []).forEach((o) => { if (estVivant(o)) vivantes.add(cleDuBon(o).cle); });
  const ids = new Set();
  (orders || []).forEach((o) => {
    if (!vivantes.has(cleDuBon(o).cle)) return;
    (o.items || []).forEach((i) => { const id = idLigneCaisse(i); if (id) ids.add(id); });
  });
  return [...ids];
}

function etatDuPlat(item, vivant) {
  if (!item.active) return 'annule';
  if (!vivant) return 'fait';
  if (item.aSuivre) return 'tenu';
  return item.bumpStatus === 'bumped' ? 'fait' : 'faire';
}

function finir(bon) {
  const parRang = new Map();
  bon.plats.forEach((p) => {
    if (!parRang.has(p.rang)) parRang.set(p.rang, []);
    parRang.get(p.rang).push(p);
  });
  const sections = [...parRang.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rang, plats]) => {
      plats.sort(parOrdre);
      const etat = plats.some((p) => p.etat === 'faire')
        ? 'faire'
        : (plats.some((p) => p.etat === 'tenu') ? 'attente' : 'fait');
      const connue = plats.find((p) => p.suite != null);
      return { rang, suite: connue ? connue.suite : null, etat, plats };
    });

  const vivants = bon.orders.filter(estVivant);
  const aFaire = bon.plats.filter((p) => p.etat === 'faire');
  const tenus = bon.plats.filter((p) => p.etat === 'tenu');
  let etat = 'pret';
  if (vivants.length === 0) etat = 'termine';
  else if (aFaire.length > 0) etat = 'faire';
  else if (tenus.length > 0) etat = 'attente';

  // Réclamé : une suite est à faire alors qu'une suite d'avant a déjà des
  // plats faits. C'est le bon qui revient de la fin.
  const reclame = sections.some((s, k) => s.etat === 'faire'
    && sections.slice(0, k).some((t) => t.plats.some((p) => p.etat === 'fait')));

  const ouvertures = bon.orders.map((o) => ms(o.openedAt)).filter((t) => t != null);
  const departs = aFaire.map((p) => p.depuis).filter((t) => t != null);
  const faits = bon.plats.map((p) => ms(p.bumpedAt)).filter((t) => t != null);
  const fins = bon.orders.map((o) => ms(o.completedAt) ?? ms(o.openedAt)).filter((t) => t != null);
  const dernier = bon.orders.reduce((a, o) => ((ms(o.openedAt) ?? 0) >= (ms(a.openedAt) ?? 0) ? o : a), bon.orders[0]);
  const repli = ouvertures.length ? Math.min(...ouvertures) : null;

  return {
    cle: bon.cle,
    caisse: bon.caisse,
    tableNo: dernier?.tableNo || null,
    couverts: dernier?.couverts ?? null,
    etat,
    reclame,
    sections,
    orders: bon.orders,
    vivants,
    nbAFaire: aFaire.length,
    nbTenus: tenus.length,
    // Le chrono et le tri de la file partent du plus ancien plat à faire.
    depuis: departs.length ? Math.min(...departs) : repli,
    valideLe: faits.length ? Math.max(...faits) : repli,
    termineLe: fins.length ? Math.max(...fins) : repli,
    fermeEnCaisse: bon.orders.every((o) => o.status === 'closed'),
  };
}

export function construireBons(orders, lignes) {
  const parCle = new Map();
  (orders || []).forEach((order) => {
    const { cle, caisse, suite: suiteDuBon } = cleDuBon(order);
    let bon = parCle.get(cle);
    if (!bon) { bon = { cle, caisse, orders: [], plats: [] }; parCle.set(cle, bon); }
    bon.orders.push(order);
    const vivant = estVivant(order);
    (order.items || []).forEach((item) => {
      const ligne = (lignes && lignes.get(idLigneCaisse(item))) || null;
      const etat = etatDuPlat(item, vivant);
      // Repli sans la ligne de caisse : un plat parti porte la suite de son
      // bon, un plat tenu reste « À suivre » sans numéro.
      let suite = null;
      if (Number.isInteger(ligne?.suite)) suite = ligne.suite;
      else if (caisse && etat !== 'tenu') suite = suiteDuBon;
      let rang = 0;
      if (suite != null) rang = suite;
      else if (etat === 'tenu') rang = RANG_TENU;
      bon.plats.push({
        ...item,
        orderId: order.id,
        suite,
        rang,
        etat,
        ordre: ligne?.ordre || item.firedAt || order.openedAt || '',
        depuis: (caisse ? ms(item.firedAt) : null) ?? ms(order.openedAt),
      });
    });
  });
  return [...parCle.values()].map(finir);
}

// La place de chaque bon à l'écran.
//   file      : à faire, le plus ancien d'abord. Un bon figé (il vient d'être
//               validé sur cet écran) y garde sa place le temps du délai :
//               rien ne glisse sous le doigt, et le geste se relit.
//   fin       : en attente de réclamation ou tout parti, le dernier validé
//               tout au bout.
//   terminees : les plus récentes d'abord, bornées à une fenêtre et un nombre.
export function rangerBons(bons, {
  figes = new Map(),
  maintenant = Date.now(),
  fenetreMs = 15 * 3600 * 1000,
  maxTerminees = 20,
} = {}) {
  const file = [];
  const fin = [];
  const terminees = [];
  (bons || []).forEach((bon) => {
    const fige = figes.get(bon.cle);
    const retenu = !!fige && fige.jusqua > maintenant;
    if (bon.etat === 'faire' || retenu) {
      // Retenu : il garde aussi son rang, même si son plus ancien plat à
      // faire vient de changer.
      file.push({ ...bon, sortant: bon.etat !== 'faire', tri: (retenu ? fige.depuis : bon.depuis) ?? 0 });
    } else if (bon.etat === 'termine') terminees.push(bon);
    else fin.push(bon);
  });
  file.sort((a, b) => a.tri - b.tri || String(a.cle).localeCompare(String(b.cle)));
  fin.sort((a, b) => (a.valideLe ?? 0) - (b.valideLe ?? 0) || String(a.cle).localeCompare(String(b.cle)));
  const limite = maintenant - fenetreMs;
  return {
    file,
    fin,
    terminees: terminees
      .filter((b) => (b.termineLe ?? 0) >= limite)
      .sort((a, b) => (b.termineLe ?? 0) - (a.termineLe ?? 0))
      .slice(0, maxTerminees),
  };
}
