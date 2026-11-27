import React from 'react';
import { ChevronsRight, Clock, ConciergeBell, Maximize2, Minimize2, Minus, Move, Plus, SlidersHorizontal } from 'lucide-react';
import { PLAN_W, PLAN_H } from '../../hooks/planSalleCanevas.js';
import { Btn, Panneau, TabBar } from '../../components/ui/index.jsx';
import { ElementDecor } from '../previsions/planDecor.jsx';
import { readJson, writeJson } from '../../utils/storage.js';
import { useHauteurRestante, useLargeur, useMaintenant } from './mesures.js';
import { cadreDe, decalageBorne, tableSous } from './planService.js';
import { TABLE_LISIBLE, borne, cadrage, chaises, medianeTables, numeroSeul } from '../salle/planVue.js';
import {
  ETATS_TABLE, LIBELLES_ETAT, aFaireMaintenant, commandeEnRetard, compterEtats, estPret, etatLibre, etatOccupee, etatTicket,
} from './accueilCaisse.js';
import { GestesRetard } from './BandeauService.jsx';
import { zurichNowMinutes } from '../../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plan de salle de la caisse : le plan du service tel que Réservations l'a
// organisé (Caisse.jsx le lit et le passe ici, déjà calculé : tables placées,
// tablées réunies). Le plan prend toute la hauteur de l'écran, décor compris.
//
// Une tablée (tables rapprochées) se lit comme une seule table : ses tables
// prennent le même état, seule la principale porte le numéro et les infos, et
// un toucher sur l'une d'elles agit sur la tablée (Caisse.jsx).
//
// États, un par tablée (accueilCaisse.js, 26.11.2026), dits par le fond et
// l'encre de leurs jetons, écrits en un mot sur la table quand elle a la
// place, et redits par les filtres au-dessus du plan :
//   prête à servir  aplat vert : la cuisine a fini, la salle n'a pas servi
//   à commander     ambre : ticket ouvert, rien d'envoyé (pastille après 10 min)
//   en cuisine      aplat sombre : des plats sont partis, pas encore faits
//   à suivre        violet doux : tout est servi, une suite attend
//   servie          gris doux : tout est servi, rien n'attend
//   réservée        bleu doux : une réservation arrive dans les 45 minutes,
//                   ou est en retard (contour ambre)
//   libre           surface blanche, « jusqu'à » l'heure d'une réservation
//                   plus lointaine
// Toucher un filtre met ses tables en avant, les autres pâlissent ; un second
// toucher les rend toutes. À droite du plan, « À faire maintenant » range ce
// qui presse (aFaireMaintenant) : plats prêts, retards à trancher, commandes
// qui attendent, suites à réclamer.
//
// Gestes :
//   toucher            ouvre le ticket, ou la table (Caisse.jsx), inchangé
//   glisser un ticket  une table occupée posée sur une table libre y passe
//   « Déplacer des tables » (qui écrit dans Réservations) : glisser une table
//                      la déplace pour ce service, la poser sur une autre les
//                      réunit, toucher une tablée propose de la séparer.
//
// Affichage réglé sur l'appareil (sc_caisse_plan) : infos portées par les
// tables, taille du texte, liste des tables ouvertes, salle ouverte, zoom du
// téléphone.
//
// Téléphone (carte de moins de 560 px) : une salle en largeur ne tient pas
// dans un écran en hauteur sans écraser ses tables. Le plan prend toute la
// hauteur qui reste et s'ouvre agrandi, tables lisibles ; on le parcourt au
// doigt, on pince pour zoomer, et trois boutons ronds en bas à droite
// agrandissent, réduisent ou montrent toute la salle. Le glisser d'un ticket
// vers une autre table n'y est pas proposé (il prendrait le doigt qui
// parcourt le plan) : on change de table depuis le ticket, par « Déplacer ».
// Les noms de tables et de clients sont des données : data-no-translate ; les
// mots autour (couv., min, places) passent au glossaire.
// Chaque nombre vit dans son propre nœud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const N = ({ children, style }) => <span data-no-translate="" style={style}>{children}</span>;

// L'état d'un ticket et d'une ligne vivent dans accueilCaisse.js (fonctions
// pures, testées) ; ils restent exportés d'ici pour leurs lecteurs d'avant.
export { etatTicket, estPret };

// ── Affichage gardé sur l'appareil ───────────────────────────────────────────
const CLE_AFFICHAGE = 'sc_caisse_plan';
// sens : 'auto' (au téléphone tenu droit, une salle en largeur tourne pour
// remplir l'écran) ou 'dessin' (toujours comme dessinée).
const AFFICHAGE_DEFAUT = { montant: true, minutes: true, couverts: true, nom: true, grand: false, liste: true, salles: {}, sens: 'auto' };

// Largeur du plan et de sa colonne à partir de laquelle ils se posent côte à
// côte (iPad en paysage, ordinateur), et largeur de la colonne.
const COLONNES_DES = 900;
const LARGEUR_COLONNE = 300;

// Quart de tour dans le sens des aiguilles d'une montre, en unités du
// canevas : le canevas tourné mesure PLAN_H de large sur PLAN_W de haut. Le
// même tour que la feuille de style du décor (translate puis rotate 90deg).
function tourner(o) {
  return {
    ...o,
    pos_x: PLAN_H - (Number(o.pos_y) + Number(o.hauteur)),
    pos_y: Number(o.pos_x),
    largeur: Number(o.hauteur),
    hauteur: Number(o.largeur),
  };
}
const tournerCadre = (v) => ({ x0: PLAN_H - (v.y0 + v.h), y0: v.x0, w: v.h, h: v.w });

// Zoom du téléphone : une table « lisible » mesure TABLE_LISIBLE pixels de côté
// (numéro et montant y tiennent). Le zoom est un facteur de la vue « toute la
// salle » ; null = le zoom lisible, recalculé pour chaque salle. Géométrie
// partagée avec les autres plans : src/modules/salle/planVue.js.
function lireAffichage() {
  const v = readJson(CLE_AFFICHAGE, null);
  return v && typeof v === 'object' ? { ...AFFICHAGE_DEFAUT, ...v, salles: { ...(v.salles || {}) } } : { ...AFFICHAGE_DEFAUT, salles: {} };
}

export default function PlanTables({
  salles, tables, tablees, ticketsParTable, noms = {}, attendues = {}, elements = [],
  onTapTable, onTransferer = null,
  peutDeplacer = false, onDeplacerGroupe, onReunir, onSeparer, onRemettre,
  choixSeul = false,
  // « À faire maintenant » : réservations en retard (reservationsDuService)
  // et leurs deux gestes, que Caisse.jsx pose. actionsResa faux en mode test.
  retards = [], onPoserStatut = null, statutEnCours = null, actionsResa = true, delaiNoShow = 30,
  // Ids des plats vendus depuis une carte de boissons (etatTicket).
  boissons = null,
  // (colonne) => le bandeau du service ; colonne vrai en deux colonnes.
  rendreBandeau = null,
}) {
  const [affichage, setAffichage] = React.useState(lireAffichage);
  // Filtre d'état touché au-dessus du plan, ou null (toutes les tables).
  const [filtre, setFiltre] = React.useState(null);
  const [reglages, setReglages] = React.useState(false);
  const [deplacer, setDeplacer] = React.useState(false);
  const [choisie, setChoisie] = React.useState(null);   // tablée touchée en mode déplacer
  const [remettreArme, setRemettreArme] = React.useState(false);
  const [drag, setDrag] = React.useState(null);         // { ids, dx, dy, cibleId } en pixels
  const dragRef = React.useRef(null);
  const finGesteRef = React.useRef(0);
  const maintenant = useMaintenant();
  const colRef = React.useRef(null);
  const corpsRef = React.useRef(null);
  const canevasRef = React.useRef(null);
  const salleRef = React.useRef(null);   // le canevas complet, mis à l'échelle
  const largeurCol = useLargeur(colRef);
  const hauteurDispo = useHauteurRestante(corpsRef, true, 8, 300);
  const fenetreRef = React.useRef(null);   // au téléphone : la fenêtre qui défile sur la salle
  const ancreRef = React.useRef(null);     // point de la salle à garder sous le doigt après un zoom
  const pincementRef = React.useRef(null);
  const zoomEtat = React.useRef({});
  const [zoomDirect, setZoomDirect] = React.useState(null);   // zoom pendant un pincement
  const [zoomTel, setZoomTel] = React.useState(null);         // zoom choisi, le temps de l'écran
  const racineRef = React.useRef(null);
  const largeurRacine = useLargeur(racineRef);
  const tel = largeurCol > 0 && largeurCol < 560;

  const majAffichage = (patch) => setAffichage((a) => {
    const v = { ...a, ...patch };
    writeJson(CLE_AFFICHAGE, v);
    return v;
  });

  const tablesActives = (tables || []).filter((t) => t.actif !== false);
  const sallesAvecTables = (salles || []).filter((s) => tablesActives.some((t) => t.salle_id === s.id));
  const horsSalle = tablesActives.filter((t) => !t.salle_id);
  const onglets = sallesAvecTables.map((s) => ({ id: s.id, label: s.nom }));
  if (horsSalle.length && onglets.length) onglets.push({ id: '_autres', label: 'Autres tables' });
  const salleMemo = affichage.salles?.[sallesAvecTables[0]?.etablissement_id || '_'] || null;
  const [salleId, setSalleId] = React.useState(salleMemo);
  const actif = onglets.some((o) => o.id === salleId) ? salleId : (onglets[0]?.id || '_autres');
  const visibles = actif === '_autres' || !onglets.length ? horsSalle : tablesActives.filter((t) => t.salle_id === actif);
  const decor = (elements || []).filter((el) => (actif === '_autres' || !onglets.length ? !el.salle_id : el.salle_id === actif));
  const deplacerActif = deplacer && peutDeplacer && !choixSeul;

  function choisirSalle(id) {
    setSalleId(id);
    const cle = sallesAvecTables[0]?.etablissement_id || '_';
    majAffichage({ salles: { ...(affichage.salles || {}), [cle]: id } });
    if (fenetreRef.current) { fenetreRef.current.scrollLeft = 0; fenetreRef.current.scrollTop = 0; }
  }

  // ── Cadrage : la salle prend la largeur de la carte, bornée par la hauteur
  // qui reste sous le haut du plan (la salle se voit sans défiler). Hors du
  // mode « Déplacer des tables », la vue se cale sur ce qui est dessiné
  // (tables, décor et place des chaises) : une salle qui n'occupe qu'une part
  // du canevas s'affiche en grand. En mode déplacer, tout le canevas, pour
  // poser une table n'importe où.
  // Deux colonnes (26.11.2026, iPad en paysage et ordinateur) : le plan à
  // gauche prend toute la hauteur qui reste jusqu'au bas de l'écran, la salle
  // centrée dedans ; à droite, le bandeau du service, les filtres et « À faire
  // maintenant ».
  const deuxColonnes = largeurRacine >= COLONNES_DES && !choixSeul;
  const pad = tel ? 8 : 14;
  const dispoL = Math.max(0, largeurCol - pad * 2);
  const dispoH = hauteurDispo && largeurCol >= 560 ? Math.max(200, hauteurDispo - pad * 2) : null;
  const vueDessin = cadrage(deplacerActif ? null : [...visibles, ...decor]);
  // Téléphone : la fenêtre du plan prend la hauteur qui reste, et au moins les
  // trois quarts de l'écran (la page défile un peu quand le haut est chargé),
  // moins une bande en bas pour les boutons de zoom. Les filtres passent
  // sous le plan.
  const reserveZoom = tel ? 56 : 0;
  const hauteurEcran = typeof document !== 'undefined' ? document.documentElement.clientHeight : 0;
  const fenetreH = tel
    ? Math.max(280, Math.floor((hauteurDispo || 0) - pad * 2 - 2), Math.round(hauteurEcran * 0.75) - pad * 2)
    : 0;
  // Téléphone tenu droit et salle en largeur : la salle tourne d'un quart de
  // tour pour remplir l'écran, la salle entière se voit en grand sans zoomer.
  // Les tables, leurs numéros et leurs pastilles restent droits ; seul le
  // décor tourne avec la salle. Jamais en mode déplacer (le geste écrit dans
  // le plan dessiné) ni si la personne a choisi « Comme dessiné ».
  const pivote = tel && affichage.sens !== 'dessin' && !deplacerActif
    && vueDessin.w > vueDessin.h * 1.15 && (fenetreH - reserveZoom) > dispoL;
  const vue = pivote ? tournerCadre(vueDessin) : vueDessin;
  const visiblesVues = pivote ? visibles.map(tourner) : visibles;
  const vueDe = new Map(visiblesVues.map((t) => [t.id, t]));
  const canevasW = pivote ? PLAN_H : PLAN_W;
  const canevasH = pivote ? PLAN_W : PLAN_H;
  let k = vue.w ? dispoL / vue.w : 0;
  if (dispoH) k = Math.min(k, dispoH / vue.h);
  k = Math.min(k, 1.6);
  // kToute montre toute la salle au-dessus de la bande des boutons ; le zoom
  // multiplie cette échelle, jusqu'à 1,6 au plus. Le plan s'ouvre toujours
  // sur toute la salle : le zoom ne se garde pas d'une ouverture à l'autre.
  const kToute = tel && vue.w ? Math.min(dispoL / vue.w, (fenetreH - reserveZoom) / vue.h) : k;
  const zoomMax = tel && kToute > 0 ? Math.max(1, 1.6 / kToute) : 1;
  const mediane = medianeTables(visiblesVues);
  const zoomLisible = tel && mediane && kToute ? borne(TABLE_LISIBLE / (mediane * kToute), 1, zoomMax) : 1;
  const zoom = tel ? borne(zoomDirect ?? zoomTel ?? 1, 1, zoomMax) : 1;
  if (tel) k = kToute * zoom;
  const largeur = Math.round(dispoL);
  // En deux colonnes, la carte du plan descend jusqu'au bas de l'écran.
  const hauteur = deuxColonnes && dispoH ? Math.round(dispoH) : Math.round(vue.h * k);
  // La surface qui porte la salle : celle de la vue à l'ordinateur ; au
  // téléphone, au moins la fenêtre, plus la bande des boutons de zoom.
  const surfaceW = tel ? Math.max(largeur, Math.ceil(vue.w * k)) : largeur;
  const surfaceH = tel ? Math.max(fenetreH, Math.ceil(vue.h * k) + reserveZoom) : hauteur;
  // Origine du canevas complet dans la vue : la salle est centrée en largeur
  // et en hauteur (au-dessus de la bande des boutons, au téléphone).
  const origineX = vue.x0 * k - (surfaceW - vue.w * k) / 2;
  const origineY = vue.y0 * k - Math.max(0, (surfaceH - reserveZoom - vue.h * k) / 2);
  const echelleTexte = affichage.grand ? 1.2 : 1;
  zoomEtat.current = { zoom, zoomMax, zoomLisible, k };

  // ── Zoom du téléphone ─────────────────────────────────────────────────────
  // Le point de la salle (unités du canevas) sous un point de l'écran.
  const pointSalle = (sx, sy) => {
    const r = salleRef.current?.getBoundingClientRect();
    const kk = zoomEtat.current.k;
    return r && kk ? { ux: (sx - r.left) / kk, uy: (sy - r.top) / kk } : null;
  };
  // Change le zoom en gardant à sa place le point de la salle situé au
  // centre de la fenêtre.
  function zoomer(valeur) {
    const f = fenetreRef.current;
    if (!f) return;
    const r = f.getBoundingClientRect();
    const sx = r.left + r.width / 2;
    const sy = r.top + r.height / 2;
    const p = pointSalle(sx, sy);
    if (p) ancreRef.current = { ...p, sx, sy };
    setZoomTel(borne(valeur, 1, zoomEtat.current.zoomMax));
  }
  // Après un zoom, la fenêtre défile pour remettre le point ancré sous le
  // doigt (ou au centre). À chaque rendu : l'ancre n'existe que juste après
  // un zoom.
  React.useLayoutEffect(() => {
    const a = ancreRef.current;
    const f = fenetreRef.current;
    if (!a || !f) return;
    ancreRef.current = null;
    const r = f.getBoundingClientRect();
    f.scrollLeft = Math.max(0, r.left - origineX + a.ux * k - a.sx);
    f.scrollTop = Math.max(0, r.top - origineY + a.uy * k - a.sy);
  });
  // Pincer à deux doigts. Écouteurs natifs (passive: false) : React pose les
  // siens en passif et ne pourrait pas empêcher le zoom de toute la page.
  React.useEffect(() => {
    const f = fenetreRef.current;
    if (!tel || !f) return undefined;
    const ecart = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const milieu = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const debut = (e) => {
      if (e.touches.length !== 2) return;
      const m = milieu(e.touches);
      const z = zoomEtat.current.zoom;
      pincementRef.current = { d0: ecart(e.touches) || 1, z0: z, dernier: z, ancre: pointSalle(m.x, m.y) };
      if (e.cancelable) e.preventDefault();
    };
    const bouger = (e) => {
      const p = pincementRef.current;
      if (!p || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const m = milieu(e.touches);
      p.dernier = borne((p.z0 * ecart(e.touches)) / p.d0, 1, zoomEtat.current.zoomMax);
      if (p.ancre) ancreRef.current = { ...p.ancre, sx: m.x, sy: m.y };
      setZoomDirect(p.dernier);
    };
    const fin = (e) => {
      const p = pincementRef.current;
      if (!p || e.touches.length >= 2) return;
      pincementRef.current = null;
      // Le toucher qui reste après un pincement n'ouvre pas de table.
      finGesteRef.current = Date.now();
      setZoomDirect(null);
      setZoomTel(p.dernier);
    };
    // Safari : sans cela, le pincement agrandit toute la page.
    const geste = (e) => e.preventDefault();
    f.addEventListener('touchstart', debut, { passive: false });
    f.addEventListener('touchmove', bouger, { passive: false });
    f.addEventListener('touchend', fin);
    f.addEventListener('touchcancel', fin);
    f.addEventListener('gesturestart', geste);
    f.addEventListener('gesturechange', geste);
    return () => {
      f.removeEventListener('touchstart', debut);
      f.removeEventListener('touchmove', bouger);
      f.removeEventListener('touchend', fin);
      f.removeEventListener('touchcancel', fin);
      f.removeEventListener('gesturestart', geste);
      f.removeEventListener('gesturechange', geste);
    };
    // setZoomTel et pointSalle ne lisent que des refs et des mises à jour
    // d'état : les écouteurs n'ont besoin d'être reposés qu'en changeant de
    // présentation.
  }, [tel]);

  // ── États : un par tablée (sa principale), sur toute la maison. Les
  // filtres comptent sur toutes les salles, comme les compteurs d'avant.
  const principales = [];
  const vues = new Set();
  tablesActives.forEach((t) => {
    const p = tablees?.get(t.id)?.principale || t;
    if (!vues.has(p.id)) { vues.add(p.id); principales.push(p); }
  });
  const minutesZurich = zurichNowMinutes();
  const etatsParTablee = new Map();
  principales.forEach((p) => {
    const ticket = ticketsParTable?.[p.id] || null;
    if (ticket) {
      const e = etatTicket(ticket, maintenant, { boissons });
      etatsParTablee.set(p.id, { table: p, ticket, e, etat: etatOccupee(e) });
    } else {
      const l = etatLibre(attendues[p.id], minutesZurich);
      etatsParTablee.set(p.id, { table: p, ticket: null, e: null, ...l });
    }
  });
  const compte = compterEtats([...etatsParTablee.values()].map((x) => x.etat));
  const filtreActif = filtre && compte[filtre] > 0 ? filtre : null;
  const aFaire = aFaireMaintenant({
    tablees: [...etatsParTablee.values()].filter((x) => x.ticket),
    retards: actionsResa ? retards : [],
  });

  // ── Gestes au pointeur ────────────────────────────────────────────────────
  const point = (e) => {
    const r = salleRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };

  function debutGeste(e, t, ticket) {
    if (e.button != null && e.button !== 0) return;
    const membres = tablees?.get(t.id)?.membres || [t];
    const mode = deplacerActif ? 'deplacer' : (ticket && onTransferer && !choixSeul && !tel ? 'transfert' : null);
    if (!mode) return;
    dragRef.current = { mode, t, ticket, membres, ids: new Set(membres.map((m) => m.id)), x0: e.clientX, y0: e.clientY, actif: false };
    const bouger = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.x0;
      const dy = ev.clientY - d.y0;
      if (!d.actif && Math.hypot(dx, dy) < 10) return;
      d.actif = true;
      ev.preventDefault();
      const cible = salleRef.current ? tableSous(visibles, point(ev), d.ids) : null;
      setDrag({ ids: d.ids, dx, dy, cibleId: cible ? (tablees?.get(cible.id)?.principale?.id || cible.id) : null });
    };
    const fin = (ev) => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', annuler);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d?.actif) return;
      finGesteRef.current = Date.now();
      const p = point(ev);
      const cible = tableSous(visibles, p, d.ids);
      const tableeCible = cible ? (tablees?.get(cible.id) || { principale: cible, membres: [cible] }) : null;
      if (d.mode === 'transfert') {
        if (tableeCible) onTransferer(d.ticket, tableeCible.principale);
        return;
      }
      if (tableeCible) onReunir?.({ source: d.membres, cible: tableeCible.membres, centre: p });
      else {
        const dec = decalageBorne(d.membres, (ev.clientX - d.x0) / k, (ev.clientY - d.y0) / k);
        if (dec.dx || dec.dy) onDeplacerGroupe?.({ membres: d.membres, dx: dec.dx, dy: dec.dy });
      }
      setChoisie(null);
    };
    const annuler = () => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', annuler);
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', bouger, { passive: false });
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', annuler);
  }

  function toucher(t, ticket) {
    // Le clic que le navigateur émet juste après un glisser n'ouvre rien.
    if (Date.now() - finGesteRef.current < 350) return;
    if (deplacerActif) {
      const p = tablees?.get(t.id)?.principale || t;
      setChoisie((c) => (c === p.id ? null : p.id));
      return;
    }
    onTapTable(tablees?.get(t.id)?.principale || t, ticketsParTable?.[t.id] || null);
  }

  const tableeChoisie = choisie ? tablesActives.filter((t) => (tablees?.get(t.id)?.principale?.id || t.id) === choisie) : [];

  if (!tablesActives.length) return null;

  // Filtres : un par état présent, du plus pressant au plus calme. Au
  // téléphone, une seule ligne qui défile.
  const filtres = (
        <div style={{ ...st.compteurs, ...(tel ? st.compteursTel : null) }} aria-live="polite" data-caisse-filtres="">
          <button
            type="button"
            aria-pressed={!filtreActif}
            onClick={() => setFiltre(null)}
            style={{ ...st.compteur, ...(!filtreActif ? st.compteurChoisi : null) }}
          >
            Toutes
          </button>
          {ETATS_TABLE.filter((k) => compte[k] > 0).map((k) => (
            <Compteur
              key={k}
              etat={k}
              n={compte[k]}
              choisi={filtreActif === k}
              onClick={() => setFiltre((f) => (f === k ? null : k))}
            />
          ))}
        </div>
  );
  const actionsPlan = (
        <div style={st.actionsBarre}>
          {peutDeplacer && !choixSeul && !deplacer && (tel ? (
            <button
              type="button"
              aria-label="Déplacer des tables"
              title="Déplacer des tables"
              onClick={() => { setDeplacer(true); setReglages(false); }}
              style={st.rond}
            >
              <Move size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <Btn variant="ghost" onClick={() => { setDeplacer(true); setReglages(false); }} style={st.btn44}>Déplacer des tables</Btn>
          ))}
          <button
            type="button"
            aria-label="Affichage du plan"
            title="Affichage du plan"
            aria-expanded={reglages}
            onClick={() => setReglages((v) => !v)}
            style={{ ...st.rond, ...(reglages ? st.rondActif : null) }}
          >
            <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
  );

  const panneauReglages = reglages ? <ReglagesAffichage affichage={affichage} onChange={majAffichage} tel={tel} /> : null;
  // Bandeau du service, rendu par Caisse.jsx : au-dessus du plan, ou en tête
  // de la colonne de droite (deux par deux) en deux colonnes.
  const enTete = rendreBandeau && !choixSeul ? rendreBandeau(deuxColonnes) : null;
  const bandeauDeplacer = deplacerActif ? (
        <div style={st.bandeau} data-caisse-deplacer="">
          <span style={st.bandeauTexte}>
            {tableeChoisie.length > 1
              ? 'Tablée choisie : séparez-la, ou glissez-la pour la déplacer.'
              : 'Glissez une table pour la déplacer, posez-la sur une autre pour les réunir. Pour ce service seulement : Réservations voit le même plan.'}
          </span>
          <span style={st.bandeauActions}>
            {tableeChoisie.length > 1 && (
              <Btn variant="ghost" onClick={() => { onSeparer?.(tableeChoisie); setChoisie(null); }} style={st.btn44}>Séparer la tablée</Btn>
            )}
            <Btn
              variant="ghost"
              onClick={() => {
                if (!remettreArme) { setRemettreArme(true); return; }
                setRemettreArme(false);
                setChoisie(null);
                onRemettre?.();
              }}
              style={st.btn44}
            >
              {remettreArme ? 'Confirmer : plan de base' : 'Remettre comme prévu'}
            </Btn>
            <Btn variant="primary" onClick={() => { setDeplacer(false); setChoisie(null); setRemettreArme(false); }} style={st.btn44}>Terminé</Btn>
          </span>
        </div>
  ) : null;

  // La structure reste la même dans les deux présentations (les mesures du
  // plan suivent toujours les mêmes nœuds) ; seuls les emplacements changent.
  return (
    <div ref={racineRef} style={st.racine} data-caisse-plan="" data-caisse-colonnes={deuxColonnes ? '2' : '1'}>
      {!deuxColonnes && enTete}
      {/* Barre du plan, au-dessus de lui. Plusieurs salles : les salles et les
          gestes du plan sur une ligne, les filtres d'état sur la suivante.
          Une seule salle : les filtres et les gestes partagent la ligne. */}
      {/* Téléphone : au-dessus du plan, les salles et les gestes seulement ;
          les filtres passent dessous, le plan monte. */}
      {!deuxColonnes && (onglets.length > 1 ? (
        <>
          <div style={st.barre}>
            <TabBar tabs={onglets} active={actif} onChange={choisirSalle} deroulant titre="Salles" />
            {actionsPlan}
          </div>
          {!tel && <div style={st.barre}>{filtres}</div>}
        </>
      ) : (
        !tel && <div style={st.barre}>{filtres}{actionsPlan}</div>
      ))}
      {/* Le réglage de l'affichage s'ouvre près de son bouton. */}
      {!deuxColonnes && !(tel && onglets.length <= 1) && panneauReglages}
      {!deuxColonnes && bandeauDeplacer}

      <div style={deuxColonnes ? st.grille : st.corps}>
        <div style={deuxColonnes ? st.gauche : st.colPlan}>
          {deuxColonnes && panneauReglages}
          {deuxColonnes && bandeauDeplacer}
          <div ref={corpsRef}>
        <div ref={colRef}>
          <div className="caisse-plan-carte" data-cadre="" style={{ ...st.carte, padding: pad }}>
            <div
              ref={fenetreRef}
              data-caisse-plan-fenetre={tel ? '' : undefined}
              style={tel ? { ...st.fenetre, width: largeur, height: fenetreH } : { ...st.canevas, width: largeur, height: hauteur }}
            >
            <div ref={canevasRef} style={{ position: 'relative', width: surfaceW, height: surfaceH }}>
              <div
                ref={salleRef}
                style={{ position: 'absolute', left: -origineX, top: -origineY, width: canevasW * k, height: canevasH * k }}
              >
              {/* Décor, à l'échelle du canevas dessiné ; salle tournée : le
                  même quart de tour que tourner(), par la feuille de style. */}
              <div
                aria-hidden="true"
                style={pivote
                  ? { position: 'absolute', left: 0, top: 0, width: PLAN_W * k, height: PLAN_H * k, transform: `translate(${PLAN_H * k}px, 0) rotate(90deg)`, transformOrigin: '0 0', pointerEvents: 'none' }
                  : { position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                {decor.map((el) => <ElementDecor key={el.id} el={el} />)}
              </div>
              {/* Cadre d'une tablée : ses tables se lisent comme une seule. */}
              {largeur > 0 && cadresTablees(visibles, tablees).map(({ id, membres }) => {
                const c = cadreDe(membres.map((m) => vueDe.get(m.id) || m));
                const enDrag = drag?.ids?.has(id);
                const teinte = TEINTES[etatsParTablee.get(id)?.etat || 'libre'];
                return (
                  <span
                    key={'cadre-' + id}
                    aria-hidden="true"
                    style={{
                      ...st.cadreTablee,
                      left: c.x0 * k - 10, top: c.y0 * k - 10, width: c.w * k + 20, height: c.h * k + 20,
                      borderColor: teinte.bord,
                      opacity: filtreActif && etatsParTablee.get(id)?.etat !== filtreActif ? PALE : undefined,
                      transform: enDrag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                    }}
                  />
                );
              })}
              {largeur > 0 && visiblesVues.map((t) => {
                const tablee = tablees?.get(t.id) || { principale: t, membres: [t] };
                const principale = tablee.principale;
                const estPrincipale = principale.id === t.id;
                const ticket = ticketsParTable?.[t.id] || null;
                const info = etatsParTablee.get(principale.id) || { etat: 'libre' };
                const e = ticket ? info.e : null;
                const attendue = !ticket && info.etat === 'reservee' ? attendues[principale.id] : null;
                const enDrag = drag?.ids?.has(t.id);
                const cible = drag?.cibleId && drag.cibleId === principale.id;
                const ronde = t.forme === 'ronde' || t.forme === 'tabouret';
                const w = Math.max(44, t.largeur * k);
                const h = Math.max(44, t.hauteur * k);
                const etat = info.etat;
                const teinte = TEINTES[etat];
                const commander = commandeEnRetard(e);
                const enRetard = etat === 'reservee' && info.retard > 0;
                const pale = filtreActif && etat !== filtreActif;
                const misEnAvant = filtreActif && etat === filtreActif;
                const touchAction = deplacerActif || (ticket && onTransferer && !choixSeul && !tel) ? 'none' : 'manipulation';
                const contenu = estPrincipale ? (
                  <ContenuTable
                    t={principale} w={w} h={h} k={k} echelle={echelleTexte} ronde={ronde}
                    e={e} etat={etat} info={info} attendue={attendue} nom={ticket ? nomDeTablee(tablee, noms) : null}
                    ticket={ticket} affichage={affichage}
                  />
                ) : null;
                return (
                  <div
                    key={t.id}
                    style={{
                      position: 'absolute',
                      left: t.pos_x * k,
                      top: t.pos_y * k,
                      width: w,
                      height: h,
                      transform: enDrag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                      zIndex: enDrag ? 5 : 1,
                      opacity: pale ? PALE : undefined,
                    }}
                  >
                    {chaises(t, w, h, k).map((c, i) => (
                      <span
                        key={i}
                        aria-hidden="true"
                        style={{
                          ...st.chaise, left: c.left, top: c.top, width: c.width, height: c.height,
                          transform: c.rot ? `rotate(${c.rot}deg)` : undefined,
                          background: teinte.chaise,
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      aria-label={estPrincipale ? undefined : `Table ${principale.nom}`}
                      data-no-translate={estPrincipale ? undefined : ''}
                      data-table-ouverte={ticket ? '' : undefined}
                      data-table-etat={etat}
                      data-table-id={t.id}
                      onPointerDown={(ev) => debutGeste(ev, t, ticket)}
                      onClick={() => toucher(t, ticket)}
                      style={{
                        ...st.table,
                        background: commander ? 'var(--warning-bg)' : teinte.fond,
                        color: teinte.encre,
                        borderColor: enRetard ? 'var(--warning-bd)' : teinte.bord,
                        borderWidth: enRetard || commander ? 2 : 1,
                        borderRadius: ronde ? '50%' : (Math.min(w, h) < 70 ? 'var(--r-sm)' : 'var(--r)'),
                        touchAction,
                        cursor: deplacerActif ? 'grab' : 'pointer',
                        ...(enDrag ? st.tableDrag : null),
                        ...(cible || choisie === principale.id || misEnAvant ? st.tableCible : null),
                      }}
                    >
                      {contenu}
                      {estPrincipale && e && e.aSuivre > 0 && (
                        <span style={st.tableRepere} aria-hidden="true"><ChevronsRight size={14} strokeWidth={2.25} /></span>
                      )}
                    </button>
                    {/* Pastilles posées sur les coins, hors du bouton : elles ne
                        couvrent ni le numéro ni le montant et ne prennent pas le
                        toucher. Prêts à gauche, à commander à droite. */}
                    {estPrincipale && e && e.prets > 0 && (
                      <span style={{ ...st.pastille, ...st.pastillePrets, left: -6, top: 0, transform: 'translateY(-70%)' }} data-table-prets="">
                        <ConciergeBell size={13} strokeWidth={2.25} aria-hidden="true" />
                        <span>{e.prets}</span>
                      </span>
                    )}
                    {estPrincipale && commander && (
                      <span style={{ ...st.pastille, ...st.pastilleCommander, right: -6, top: 0, transform: 'translateY(-70%)' }} data-table-commander="">
                        <Clock size={13} strokeWidth={2.25} aria-hidden="true" />
                        <span>{e.sansEnvoi}</span>
                        <span>min</span>
                      </span>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
            </div>
            {tel && (
              <div style={{ ...st.zoom, right: pad + 8, bottom: pad + 8 }} data-caisse-zoom="">
                {zoom > 1.001 ? (
                  <BoutonRond label="Voir toute la salle" onClick={() => zoomer(1)}>
                    <Minimize2 size={18} strokeWidth={2} aria-hidden="true" />
                  </BoutonRond>
                ) : (
                  <BoutonRond label="Agrandir le plan" onClick={() => zoomer(zoomLisible > 1.001 ? zoomLisible : zoomMax)} disabled={zoomMax <= 1.001}>
                    <Maximize2 size={18} strokeWidth={2} aria-hidden="true" />
                  </BoutonRond>
                )}
                <BoutonRond label="Zoom arrière" onClick={() => zoomer(zoom / 1.4)} disabled={zoom <= 1.001}>
                  <Minus size={18} strokeWidth={2} aria-hidden="true" />
                </BoutonRond>
                <BoutonRond label="Zoom avant" onClick={() => zoomer(zoom * 1.4)} disabled={zoom >= zoomMax - 0.001}>
                  <Plus size={18} strokeWidth={2} aria-hidden="true" />
                </BoutonRond>
              </div>
            )}
          </div>
        </div>
          </div>
          {!deuxColonnes && tel && (
            <div style={st.barre}>{filtres}{onglets.length > 1 ? null : actionsPlan}</div>
          )}
          {!deuxColonnes && tel && onglets.length <= 1 && panneauReglages}
        </div>

        {/* Colonne : en deux colonnes, le bandeau du service, « À faire
            maintenant » (en vue sans défiler), puis les filtres et les gestes
            du plan ; sinon cette liste seule, sous le plan ou à côté. */}
        {(deuxColonnes || (affichage.liste && !choixSeul)) && (
        <div style={deuxColonnes ? st.colonne : st.colonnePile}>
        {deuxColonnes && enTete}
        {/* « À faire maintenant » : ce qui presse, sur toute la maison. Une
            tablée s'ouvre d'un toucher, comme sur le plan ; une réservation en
            retard porte ses deux gestes (jamais en mode test). */}
        {affichage.liste && !choixSeul && (
          <div className="caisse-liste" data-cadre="" style={st.liste} data-caisse-a-faire="">
            <div style={st.listeTitre}>À faire maintenant</div>
            {!aFaire.length && <p style={st.listeVide}>Rien ne presse pour le moment.</p>}
            {aFaire.map((a) => {
              if (a.type === 'retard') {
                const r = a.resa;
                return (
                  <div key={a.cle} style={{ ...st.rang, cursor: 'default', flexWrap: 'wrap' }} data-a-faire="retard">
                    <span aria-hidden="true" style={{ ...st.point, background: 'var(--warning-bd)' }} />
                    <span style={st.rangInfos}>
                      <span style={st.rangClient}>
                        <span style={st.num}>{String(r.heure_arrivee || '').slice(0, 5)}</span> <N>{r.nom}</N>
                      </span>
                      <span style={st.rangLigne}>
                        <span style={st.num}>{r.nb_couverts || 0}</span> <span>couv.</span>{' '}
                        <span>en retard de</span> <span style={st.num}>{r.retard}</span> <span>min</span>
                      </span>
                    </span>
                    {onPoserStatut && (
                      <span style={st.rangGestes}>
                        <GestesRetard resa={r} onPoser={onPoserStatut} enCours={statutEnCours === r.id} delaiMinutes={delaiNoShow} />
                      </span>
                    )}
                  </div>
                );
              }
              const { table, ticket, e } = a;
              const client = noms[table.id] && !noms[table.id].attendu ? noms[table.id].nom : null;
              return (
                <button key={a.cle} type="button" style={st.rang} onClick={() => onTapTable(table, ticket)} data-a-faire={a.type}>
                  <span aria-hidden="true" style={{ ...st.point, background: TEINTES[a.etat].point }} />
                  <span style={st.rangNom} data-no-translate>{table.nom}</span>
                  <span style={st.rangInfos}>
                    {client && <span style={st.rangClient} data-no-translate>{client}</span>}
                    {a.type === 'pret' && (
                      <span style={st.rangPret} data-caisse-prets="">
                        <ConciergeBell size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                        <span style={st.num}>{e.prets}</span> <span>{e.prets > 1 ? 'plats prêts à servir' : 'plat prêt à servir'}</span>
                      </span>
                    )}
                    {a.type === 'commander' && (
                      <span style={st.rangLigne}><span>Rien d'envoyé depuis</span> <span style={st.num}>{e.sansEnvoi}</span> <span>min</span></span>
                    )}
                    {a.type === 'suite' && (
                      <span style={st.rangSuivre}>
                        <ChevronsRight size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                        <span>Suite à réclamer</span>
                      </span>
                    )}
                    {a.type === 'suite' && e.minutes != null && (
                      <span style={st.rangLigne}><span>Dernier envoi il y a</span> <span style={st.num}>{e.minutes}</span> <span>min</span></span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {/* En deux colonnes, la salle se choisit avec les filtres et les gestes
            du plan : le plan garde toute la hauteur de sa colonne. */}
        {deuxColonnes && (
          <div style={st.barreColonne}>
            {onglets.length > 1 && <TabBar tabs={onglets} active={actif} onChange={choisirSalle} deroulant titre="Salles" />}
            {filtres}
            {actionsPlan}
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  );
}

// Tablées de plus d'une table dans la salle affichée, une fois chacune.
function cadresTablees(visibles, tablees) {
  const vues = new Map();
  visibles.forEach((t) => {
    const tb = tablees?.get(t.id);
    if (tb && tb.membres.length > 1 && !vues.has(tb.principale.id)) vues.set(tb.principale.id, tb.membres);
  });
  return [...vues].map(([id, membres]) => ({ id, membres }));
}

// Nom de la réservation du ticket d'une tablée (jamais celui d'une réservation
// seulement attendue sur l'une de ses tables), la principale d'abord.
function nomDeTablee(tablee, noms) {
  const m = [tablee.principale, ...tablee.membres].find((x) => noms[x.id] && !noms[x.id].attendu);
  return m ? noms[m.id].nom : null;
}

// Le mot d'état écrit sur une table qui porte un ticket, et la minute qui
// l'accompagne (depuis le dernier envoi, ou depuis l'ouverture sans envoi).
const MOT_ETAT = { pret: 'Prêt', commander: 'Commander', cuisine: 'Cuisine', suite: 'Suite', servi: 'Servi' };
function minutesEtat(etat, e) {
  if (etat === 'commander') return e.sansEnvoi;
  if (etat === 'cuisine') return e.minutes;
  return null;
}

// Ce qu'une table porte, ligne par ligne, selon sa place et l'affichage
// choisi. Le numéro d'abord ; ensuite, par ordre de priorité, le mot d'état
// (et sa minute), le montant, le client, les couverts. Ce qui ne tient pas
// n'est pas rendu : la couleur dit l'état, « À faire maintenant » le détail.
function ContenuTable({ t, w, h, k, echelle, ronde, e, etat, info, attendue, nom, ticket, affichage }) {
  const taille = (base) => Math.round(Math.max(12, Math.min(base * 1.6, base * (0.75 + k * 0.45))) * echelle);
  const fNum = taille(15);
  const fTexte = taille(12);
  const ligneH = fTexte * 1.25;
  // Petite table (salle réduite) : le numéro seul, comme au plan des
  // réservations ; l'état reste dit par la couleur.
  const place = numeroSeul(w, h) ? 0 : Math.max(0, Math.floor((h - 10 - fNum * 1.2) / ligneH));
  // Largeur utile (un rond n'offre que le carré inscrit) et largeur estimée
  // d'un texte : ce qui ne tient pas n'est pas rendu, plutôt que coupé.
  const utile = (ronde ? w * 0.78 : w) - 10;
  const tient = (texte, f) => texte.length * f * 0.58 <= utile;
  // Détail : les morceaux qui tiennent, dans leur ordre de priorité.
  const detail = (morceaux) => {
    let txt = '';
    const gardes = morceaux.filter((m) => {
      const essai = txt ? `${txt}  ${m.txt}` : m.txt;
      if (!tient(essai, fTexte)) return false;
      txt = essai;
      return true;
    });
    return gardes.length ? <span style={{ ...st.tableDetail, fontSize: fTexte }}>{gardes.map((m) => <React.Fragment key={m.cle}>{m.el}</React.Fragment>)}</span> : null;
  };
  const lignes = [];
  const pousser = (cle, el) => { if (el) lignes.push({ cle, el }); };
  // Mot d'état et sa minute : la minute part la première si la place manque.
  const motEtat = (mot, minutes, cle = 'etat') => {
    const morceaux = [{ cle: 'w', txt: mot, el: <span style={st.sepFin}>{mot}</span> }];
    if (affichage.minutes && minutes != null) morceaux.push({ cle: 'm', txt: `${minutes} min`, el: <><span>{minutes}</span><span style={st.sep}>min</span></> });
    const el = detail(morceaux);
    pousser(cle, el ? <span style={{ ...st.tableEtat, fontSize: fTexte }}>{el}</span> : null);
  };
  if (e) {
    motEtat(MOT_ETAT[etat], minutesEtat(etat, e));
    if (affichage.montant && tient(chf(e.montant), fNum)) pousser('montant', <span style={{ ...st.tableMontant, fontSize: fNum }}>{chf(e.montant)}</span>);
    if (affichage.nom && nom && utile >= 40) pousser('nom', <N style={{ ...st.tableTexte, fontSize: fTexte, fontWeight: 'var(--g2)' }}>{nom}</N>);
    if (affichage.couverts && ticket?.couverts) {
      pousser('detail', detail([{ cle: 'c', txt: `${ticket.couverts} couv.`, el: <><span>{ticket.couverts}</span><span style={st.sep}>couv.</span></> }]));
    }
  } else if (attendue) {
    if (info?.arrivee) motEtat('Arrivée', null);
    else if (info?.retard > 0) motEtat('Retard', info.retard);
    if (affichage.nom && utile >= 40) pousser('nom', <N style={{ ...st.tableTexte, fontSize: fTexte, fontWeight: 'var(--g3)' }}>{attendue.nom}</N>);
    const morceaux = [{ cle: 'h', txt: attendue.heure, el: <span style={st.sepFin}>{attendue.heure}</span> }];
    if (affichage.couverts && attendue.couverts) morceaux.push({ cle: 'c', txt: `${attendue.couverts} couv.`, el: <><span>{attendue.couverts}</span><span style={st.sep}>couv.</span></> });
    pousser('detail', detail(morceaux));
  } else {
    // Libre : jusqu'à l'heure d'une réservation plus lointaine, puis ses places.
    if (info?.jusqua) {
      const el = detail([{ cle: 'j', txt: `jusqu'à ${info.jusqua}`, el: <><span style={st.sepFin}>jusqu'à</span><span>{info.jusqua}</span></> }]);
      pousser('jusqua', el ? <span style={{ ...st.tableEtat, fontSize: fTexte }}>{el}</span> : null);
    }
    if (affichage.couverts && t.nb_places && t.forme !== 'tabouret' && tient(`${t.nb_places} places`, fTexte)) {
      pousser('places', <span style={{ ...st.tableDetail, fontSize: fTexte, color: 'var(--text3)' }}><span>{t.nb_places}</span><span style={st.sep}>places</span></span>);
    }
  }
  return (
    <>
      <N style={{ ...st.tableNom, fontSize: fNum }}>{t.nom}</N>
      {lignes.slice(0, place).map((l) => <React.Fragment key={l.cle}>{l.el}</React.Fragment>)}
    </>
  );
}

// Filtre d'un état : sa couleur, son nombre, son nom. Un toucher met ses
// tables en avant, un second les rend toutes.
function Compteur({ etat, n, choisi, onClick }) {
  const [un, plusieurs] = LIBELLES_ETAT[etat];
  return (
    <button
      type="button"
      aria-pressed={choisi}
      onClick={onClick}
      data-caisse-filtre={etat}
      style={{ ...st.compteur, ...(choisi ? st.compteurChoisi : null) }}
    >
      <span aria-hidden="true" style={{ ...st.point, background: TEINTES[etat].point }} />
      <N style={st.num}>{n}</N>
      <span>{n > 1 ? plusieurs : un}</span>
    </button>
  );
}

// Teintes des états, par jetons (direction Galet : un statut se dit par ses
// jetons de fond et d'encre). `point` : la pastille du filtre et de la liste.
const TEINTES = {
  pret: { fond: 'var(--success-fill)', encre: 'var(--on-success)', bord: 'var(--success-fill)', chaise: 'var(--success-fill)', point: 'var(--success-fill)' },
  commander: { fond: 'var(--warning-bg-soft)', encre: 'var(--warning-text)', bord: 'var(--warning-bd)', chaise: 'var(--warning-bd)', point: 'var(--warning-bd)' },
  cuisine: { fond: 'var(--accent)', encre: 'var(--on-accent)', bord: 'var(--accent)', chaise: 'var(--accent)', point: 'var(--accent)' },
  suite: { fond: 'var(--caisse-violet)', encre: 'var(--text)', bord: 'var(--caisse-violet-vif)', chaise: 'var(--caisse-violet-vif)', point: 'var(--caisse-violet-vif)' },
  servi: { fond: 'var(--selection)', encre: 'var(--text)', bord: 'var(--border2)', chaise: 'var(--border2)', point: 'var(--text3)' },
  reservee: { fond: 'var(--info-bg-soft)', encre: 'var(--info-text)', bord: 'var(--info-bd)', chaise: 'var(--info-bd)', point: 'var(--info-bd)' },
  libre: { fond: 'var(--surface)', encre: 'var(--text)', bord: 'var(--border2)', chaise: 'var(--border2)', point: 'var(--border2)' },
};
// Une table hors du filtre touché pâlit sans devenir illisible (0,65 au plus
// bas, direction Galet).
const PALE = 0.65;

// Bouton rond à picto seul qui flotte sur le plan (zoom du téléphone).
function BoutonRond({ label, onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{ ...st.rond, ...st.rondFlottant, ...(disabled ? st.rondEteint : null) }}
    >
      {children}
    </button>
  );
}

function Pilule({ choisi, onClick, children }) {
  return (
    <button type="button" aria-pressed={choisi} onClick={onClick} style={{ ...st.pilule, ...(choisi ? st.piluleChoisie : null) }}>
      {children}
    </button>
  );
}

function ReglagesAffichage({ affichage, onChange, tel = false }) {
  const bascule = (cle) => onChange({ [cle]: !affichage[cle] });
  return (
    <Panneau style={st.reglages}>
      <div style={st.reglagesGroupe}>
        <span style={st.reglagesTitre}>Sur les tables</span>
        <span style={st.pilules}>
          <Pilule choisi={affichage.montant} onClick={() => bascule('montant')}>Montant</Pilule>
          <Pilule choisi={affichage.nom} onClick={() => bascule('nom')}>Nom du client</Pilule>
          <Pilule choisi={affichage.couverts} onClick={() => bascule('couverts')}>Couverts</Pilule>
          <Pilule choisi={affichage.minutes} onClick={() => bascule('minutes')}>Minutes</Pilule>
        </span>
      </div>
      <div style={st.reglagesGroupe}>
        <span style={st.reglagesTitre}>Taille du texte</span>
        <span style={st.pilules}>
          <Pilule choisi={!affichage.grand} onClick={() => onChange({ grand: false })}>Normale</Pilule>
          <Pilule choisi={affichage.grand} onClick={() => onChange({ grand: true })}>Grande</Pilule>
        </span>
      </div>
      <div style={st.reglagesGroupe}>
        <span style={st.reglagesTitre}>À faire maintenant</span>
        <span style={st.pilules}>
          <Pilule choisi={affichage.liste} onClick={() => onChange({ liste: true })}>Affichée</Pilule>
          <Pilule choisi={!affichage.liste} onClick={() => onChange({ liste: false })}>Masquée</Pilule>
        </span>
      </div>
      {tel && (
        <div style={st.reglagesGroupe}>
          <span style={st.reglagesTitre}>Sens du plan</span>
          <span style={st.pilules}>
            <Pilule choisi={affichage.sens !== 'dessin'} onClick={() => onChange({ sens: 'auto' })}>Adapté à l'écran</Pilule>
            <Pilule choisi={affichage.sens === 'dessin'} onClick={() => onChange({ sens: 'dessin' })}>Comme dessiné</Pilule>
          </span>
        </div>
      )}
      <span style={st.reglagesNote}>Réglé pour cet appareil.</span>
    </Panneau>
  );
}

const st = {
  racine: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10, minWidth: 0 },
  barre: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, minWidth: 0 },
  compteurs: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 },
  // Filtre d'état : une pilule de 40 px dans une cible de 44 px, la choisie
  // en aplat sombre (direction Galet).
  compteur: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, margin: '2px 0', padding: '0 14px', borderRadius: 'var(--r-full)',
    background: 'var(--zone)', color: 'var(--text)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', whiteSpace: 'nowrap',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
  },
  compteurChoisi: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  point: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  actionsBarre: { display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  btn44: { minHeight: 44 },
  rond: {
    width: 44, height: 44, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)', cursor: 'pointer', padding: 0, flexShrink: 0,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
  },
  rondActif: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  // Ce qui flotte sur le plan porte l'ombre des éléments flottants.
  rondFlottant: { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--sh-lg)' },
  rondEteint: { opacity: 0.65, cursor: 'default' },
  compteursTel: { flex: '1 1 0', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' },
  // Téléphone : la fenêtre sur la salle défile au doigt dans les deux sens ;
  // le pincement est pris par la page (touchAction), pas par le navigateur.
  fenetre: {
    position: 'relative', overflow: 'auto', background: 'var(--piste)', borderRadius: 'var(--r)', flexShrink: 0,
    userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
  },
  zoom: { position: 'absolute', zIndex: 3, display: 'flex', gap: 8 },
  bandeau: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--r)',
    background: 'var(--info-bg-soft)', color: 'var(--info-text)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--info-bd)',
  },
  bandeauTexte: { flex: '1 1 260px', minWidth: 0, fontSize: 'var(--t2)', lineHeight: 1.45 },
  bandeauActions: { display: 'inline-flex', flexWrap: 'wrap', gap: 8 },
  // Le plan à gauche, la liste des tables ouvertes à droite quand la place le
  // permet ; sinon la liste passe dessous et le plan prend toute la largeur.
  corps: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', minWidth: 0 },
  colPlan: { flex: '1 1 720px', minWidth: 0 },
  colonnePile: { display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 280px', minWidth: 0, maxWidth: 900 },
  // Deux colonnes : le plan à gauche, la colonne de droite à largeur fixe.
  grille: { display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${LARGEUR_COLONNE}px`, gap: 16, alignItems: 'start', minWidth: 0 },
  gauche: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  colonne: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  barreColonne: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 },
  carte: {
    position: 'relative',
    display: 'flex', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--zone)', borderRadius: 'var(--r-lg)',
    boxShadow: 'var(--sh)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  // Le sol de la salle : la tuile intérieure de la carte.
  canevas: { position: 'relative', overflow: 'hidden', background: 'var(--piste)', borderRadius: 'var(--r)', flexShrink: 0, userSelect: 'none', WebkitUserSelect: 'none' },
  chaise: { position: 'absolute', borderRadius: 'var(--r-full)', pointerEvents: 'none' },
  // Cibles tactiles : jamais sous 44 px, même pour un tabouret.
  table: {
    position: 'absolute', inset: 0, width: '100%', height: '100%', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
    background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border2)',
    padding: '2px 4px', fontFamily: 'var(--font)', lineHeight: 1.2, overflow: 'hidden',
    WebkitTapHighlightColor: 'transparent',
  },
  tableDrag: { boxShadow: 'var(--sh-lg)', opacity: 0.9 },
  tableCible: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: 'var(--onglet)', outlineOffset: 3 },
  tableNom: { fontWeight: 'var(--g3)', fontFamily: 'var(--font-num)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
  tableEtat: { fontWeight: 'var(--g3)', display: 'inline-flex', maxWidth: '100%' },
  tableTexte: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
  tableMontant: { fontWeight: 'var(--g2)', fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' },
  tableDetail: { fontFamily: 'var(--font-num)', display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden' },
  sep: { margin: '0 6px 0 2px' },
  sepFin: { marginRight: 8 },
  cadreTablee: { position: 'absolute', zIndex: 0, pointerEvents: 'none', boxSizing: 'border-box', borderRadius: 'var(--r-lg)', borderWidth: 2, borderStyle: 'solid' },
  tableRepere: { position: 'absolute', top: 4, right: 6, display: 'inline-flex' },
  pastille: {
    position: 'absolute', zIndex: 2, pointerEvents: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '2px 8px', borderRadius: 'var(--r-full)', boxShadow: 'var(--sh)', borderWidth: 1, borderStyle: 'solid',
    fontSize: 'var(--t1)', fontWeight: 'var(--g3)', fontFamily: 'var(--font-num)', lineHeight: 1.3, whiteSpace: 'nowrap',
  },
  pastillePrets: { background: 'var(--success-fill)', color: 'var(--on-success)', borderColor: 'var(--success-fill)' },
  pastilleCommander: { background: 'var(--warning-bg)', color: 'var(--warning-text)', borderColor: 'var(--warning-bd)' },
  reglages: { display: 'flex', flexWrap: 'wrap', gap: '14px 28px', alignItems: 'flex-start', padding: '14px 18px' },
  reglagesGroupe: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  reglagesTitre: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' },
  reglagesNote: { flex: '1 1 100%', fontSize: 'var(--t1)', color: 'var(--text3)' },
  pilules: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  pilule: {
    minHeight: 40, padding: '0 14px', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'var(--font)',
    fontSize: 'var(--t2)', fontWeight: 'var(--g2)', background: 'var(--btn-fond)', color: 'var(--btn-texte)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', whiteSpace: 'nowrap',
  },
  piluleChoisie: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  rangPret: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success-text)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)' },
  // Tables ouvertes : une carte blanche à titre (direction Galet), une ligne
  // par tablée séparée par son filet doux ; la dernière n'en porte pas
  // (caisse.css).
  liste: {
    display: 'flex', flexDirection: 'column', minWidth: 0, padding: '4px 18px', boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  listeTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', margin: '12px 0 4px' },
  listeVide: { margin: '4px 0 14px', fontSize: 'var(--t2)', color: 'var(--text3)' },
  rangGestes: { display: 'flex', width: '100%', paddingLeft: 24, boxSizing: 'border-box' },
  rang: {
    display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '10px 0', width: '100%', boxSizing: 'border-box',
    borderRadius: 0, background: 'transparent', color: 'var(--text)',
    borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'var(--t2)', textAlign: 'left',
  },
  rangNom: { fontSize: 'var(--t4)', fontWeight: 'var(--g2)', fontFamily: 'var(--font-num)', minWidth: 44, flexShrink: 0 },
  rangInfos: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  rangClient: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', overflowWrap: 'anywhere' },
  rangLigne: { color: 'var(--text2)', fontSize: 'var(--t1)' },
  rangSuivre: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)' },
  num: { fontFamily: 'var(--font-num)' },
};
