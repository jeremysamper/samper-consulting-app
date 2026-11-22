import React from 'react';
import { ChevronsRight, Clock, ConciergeBell, Maximize2, Minimize2, Minus, Move, Plus, SlidersHorizontal } from 'lucide-react';
import { PLAN_W, PLAN_H } from '../../hooks/planSalleCanevas.js';
import { Btn, Panneau, TabBar } from '../../components/ui/index.jsx';
import { ElementDecor } from '../previsions/planDecor.jsx';
import { readJson, writeJson } from '../../utils/storage.js';
import { useHauteurRestante, useLargeur, useMaintenant } from './mesures.js';
import { ATTENTE_COMMANDE_MIN, cadreDe, decalageBorne, tableSous } from './planService.js';
import { TABLE_LISIBLE, borne, cadrage, chaises, medianeTables, numeroSeul } from '../salle/planVue.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plan de salle de la caisse : le plan du service tel que Réservations l'a
// organisé (Caisse.jsx le lit et le passe ici, déjà calculé : tables placées,
// tablées réunies). Le plan prend toute la hauteur de l'écran, décor compris.
//
// Une tablée (tables rapprochées) se lit comme une seule table : ses tables
// prennent le même état, seule la principale porte le numéro et les infos, et
// un toucher sur l'une d'elles agit sur la tablée (Caisse.jsx).
//
// États, un par tablée, dits par le fond et l'encre de leurs jetons et redits
// par les compteurs au-dessus du plan :
//   libre       surface blanche
//   réservée    une réservation du service est posée dessus et pas encore assise
//   occupée     un ticket est ouvert (aplat sombre, comme ce qui est en cours)
//   à commander pastille d'alerte : ticket ouvert depuis 10 min, rien d'envoyé
//   plats prêts pastille verte : la cuisine a fini, la salle n'a pas servi
// et le repère « à suivre » dans le coin quand des lignes attendent.
//
// Gestes :
//   toucher            ouvre le ticket, ou la table (Caisse.jsx)
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

// L'état d'un ticket, calculé une fois pour le plan et pour la liste.
export function etatTicket(ticket, maintenant = Date.now()) {
  const lignes = ticket?.lignes || [];
  const envois = lignes.map((l) => (l.envoye_at ? new Date(l.envoye_at).getTime() : 0)).filter(Boolean);
  const dernier = envois.length ? Math.max(...envois) : null;
  const enAttente = lignes.filter((l) => l.statut === 'en_attente');
  const ouvert = ticket?.created_at ? new Date(ticket.created_at).getTime() : null;
  return {
    articles: lignes.reduce((s, l) => s + Number(l.quantite || 0), 0),
    montant: lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0),
    minutes: dernier == null ? null : Math.max(0, Math.floor((maintenant - dernier) / 60000)),
    // Minutes depuis l'ouverture du ticket, tant que rien n'est parti en cuisine.
    sansEnvoi: dernier == null && ouvert != null ? Math.max(0, Math.floor((maintenant - ouvert) / 60000)) : null,
    aEnvoyer: enAttente.filter((l) => l.suite === 1).length,
    aSuivre: enAttente.filter((l) => l.suite > 1).length,
    // v6 : plats que la cuisine a marqués faits au KDS et que la salle n'a
    // pas encore notés servis. Posé par la base (caisse_lignes.pret_at).
    prets: lignes.filter(estPret).length,
  };
}

// Une ligne est « prête » tant que la cuisine l'a marquée faite et que la
// salle ne l'a pas encore servie.
export function estPret(ligne) {
  return Boolean(ligne?.pret_at) && ligne.statut !== 'servi';
}

// ── Affichage gardé sur l'appareil ───────────────────────────────────────────
const CLE_AFFICHAGE = 'sc_caisse_plan';
const AFFICHAGE_DEFAUT = { montant: true, minutes: true, couverts: true, nom: true, grand: false, liste: true, salles: {}, zoomTel: null };

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
}) {
  const [affichage, setAffichage] = React.useState(lireAffichage);
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
  // qui reste sous le haut du plan (la salle se voit sans défiler), sauf au
  // téléphone où la page défile. Hors du mode « Déplacer des tables », la vue
  // se cale sur ce qui est dessiné (tables, décor et place des chaises) : une
  // salle qui n'occupe qu'une part du canevas s'affiche en grand. En mode
  // déplacer, tout le canevas, pour poser une table n'importe où.
  const pad = tel ? 8 : 14;
  const dispoL = Math.max(0, largeurCol - pad * 2);
  const dispoH = hauteurDispo && largeurCol >= 560 ? Math.max(200, hauteurDispo - pad * 2) : null;
  const vue = cadrage(deplacerActif ? null : [...visibles, ...decor]);
  let k = vue.w ? dispoL / vue.w : 0;
  if (dispoH) k = Math.min(k, dispoH / vue.h);
  k = Math.min(k, 1.6);
  // Téléphone : la fenêtre du plan prend la hauteur qui reste. kToute montre
  // toute la salle ; le zoom multiplie cette échelle, jusqu'à 1,6 au plus.
  const fenetreH = tel ? Math.max(280, Math.floor((hauteurDispo || 0) - pad * 2 - 2)) : 0;
  const kToute = tel && vue.w ? Math.min(dispoL / vue.w, fenetreH / vue.h) : k;
  const zoomMax = tel && kToute > 0 ? Math.max(1, 1.6 / kToute) : 1;
  const mediane = medianeTables(visibles);
  const zoomLisible = tel && mediane && kToute ? borne(TABLE_LISIBLE / (mediane * kToute), 1, zoomMax) : 1;
  const zoom = tel ? borne(zoomDirect ?? affichage.zoomTel ?? zoomLisible, 1, zoomMax) : 1;
  if (tel) k = kToute * zoom;
  const largeur = Math.round(dispoL);
  const hauteur = Math.round(vue.h * k);
  // La surface qui porte la salle : celle de la vue à l'ordinateur ; au
  // téléphone, au moins la fenêtre, plus une bande sous la salle pour que les
  // boutons de zoom ne cachent jamais une table.
  const reserveZoom = tel ? 60 : 0;
  const surfaceW = tel ? Math.max(largeur, Math.ceil(vue.w * k)) : largeur;
  const surfaceH = tel ? Math.max(fenetreH, Math.ceil(vue.h * k) + reserveZoom) : hauteur;
  // Origine du canevas complet dans la vue : la salle est centrée en largeur
  // (et en hauteur au-dessus de la bande des boutons, au téléphone).
  const origineX = vue.x0 * k - (surfaceW - vue.w * k) / 2;
  const origineY = vue.y0 * k - (tel ? Math.max(0, (surfaceH - reserveZoom - vue.h * k) / 2) : 0);
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
    majAffichage({ zoomTel: borne(valeur, 1, zoomEtat.current.zoomMax) });
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
      majAffichage({ zoomTel: p.dernier });
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
    // majAffichage et pointSalle ne lisent que des refs et des mises à jour
    // fonctionnelles : les écouteurs n'ont besoin d'être reposés qu'en
    // changeant de présentation.
  }, [tel]);

  // ── Compteurs : une tablée compte une fois, sur toute la maison.
  const principales = [];
  const vues = new Set();
  tablesActives.forEach((t) => {
    const p = tablees?.get(t.id)?.principale || t;
    if (!vues.has(p.id)) { vues.add(p.id); principales.push(p); }
  });
  const compte = { libres: 0, reservees: 0, occupees: 0, prets: 0, commander: 0 };
  principales.forEach((p) => {
    const ticket = ticketsParTable?.[p.id];
    if (ticket) {
      compte.occupees += 1;
      const e = etatTicket(ticket, maintenant);
      if (e.prets > 0) compte.prets += 1;
      if (e.sansEnvoi != null && e.sansEnvoi >= ATTENTE_COMMANDE_MIN) compte.commander += 1;
    } else if (attendues[p.id]) compte.reservees += 1;
    else compte.libres += 1;
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

  // Tickets ouverts dans la salle affichée, un par tablée.
  const ouverts = [];
  const vusTickets = new Set();
  visibles.forEach((t) => {
    const ticket = ticketsParTable?.[t.id];
    if (ticket && !vusTickets.has(ticket.id)) {
      vusTickets.add(ticket.id);
      ouverts.push({ t: tablees?.get(t.id)?.principale || t, ticket });
    }
  });

  if (!tablesActives.length) return null;

  const alertes = (
    <>
      {compte.prets > 0 && <Compteur couleur="var(--success-fill)" n={compte.prets} un="plats prêts" plusieurs="plats prêts" />}
      {compte.commander > 0 && <Compteur couleur="var(--warning-bd)" n={compte.commander} un="à commander" plusieurs="à commander" />}
    </>
  );

  return (
    <div style={st.racine} data-caisse-plan="">
      {/* Barre du plan : salles, compteurs, déplacer, affichage. */}
      <div style={st.barre}>
        {onglets.length > 1 && <TabBar tabs={onglets} active={actif} onChange={choisirSalle} />}
        {/* Au téléphone : une seule ligne qui défile, les alertes d'abord. */}
        <div style={{ ...st.compteurs, ...(tel ? st.compteursTel : null) }} aria-live="polite">
          {tel && alertes}
          <Compteur couleur="var(--border2)" n={compte.libres} un="libre" plusieurs="libres" />
          <Compteur couleur="var(--info-bd)" n={compte.reservees} un="réservée" plusieurs="réservées" />
          <Compteur couleur="var(--accent)" n={compte.occupees} un="occupée" plusieurs="occupées" />
          {!tel && alertes}
        </div>
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
      </div>

      {reglages && <ReglagesAffichage affichage={affichage} onChange={majAffichage} />}

      {deplacerActif && (
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
      )}

      <div ref={corpsRef} style={st.corps}>
        <div ref={colRef} style={st.colPlan}>
          <div className="caisse-plan-carte" data-cadre="" style={{ ...st.carte, padding: pad }}>
            <div
              ref={fenetreRef}
              data-caisse-plan-fenetre={tel ? '' : undefined}
              style={tel ? { ...st.fenetre, width: largeur, height: fenetreH } : { ...st.canevas, width: largeur, height: hauteur }}
            >
            <div ref={canevasRef} style={{ position: 'relative', width: surfaceW, height: surfaceH }}>
              <div
                ref={salleRef}
                style={{ position: 'absolute', left: -origineX, top: -origineY, width: PLAN_W * k, height: PLAN_H * k }}
              >
              {decor.map((el) => <ElementDecor key={el.id} el={el} />)}
              {/* Cadre d'une tablée : ses tables se lisent comme une seule. */}
              {largeur > 0 && cadresTablees(visibles, tablees).map(({ id, membres }) => {
                const c = cadreDe(membres);
                const ticket = ticketsParTable?.[id];
                const enDrag = drag?.ids?.has(id);
                return (
                  <span
                    key={'cadre-' + id}
                    aria-hidden="true"
                    style={{
                      ...st.cadreTablee,
                      left: c.x0 * k - 10, top: c.y0 * k - 10, width: c.w * k + 20, height: c.h * k + 20,
                      borderColor: ticket ? 'var(--accent)' : attendues[id] ? 'var(--info-bd)' : 'var(--border2)',
                      transform: enDrag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                    }}
                  />
                );
              })}
              {largeur > 0 && visibles.map((t) => {
                const tablee = tablees?.get(t.id) || { principale: t, membres: [t] };
                const principale = tablee.principale;
                const estPrincipale = principale.id === t.id;
                const ticket = ticketsParTable?.[t.id] || null;
                const e = ticket ? etatTicket(ticket, maintenant) : null;
                const attendue = !ticket ? attendues[principale.id] : null;
                const enDrag = drag?.ids?.has(t.id);
                const cible = drag?.cibleId && drag.cibleId === principale.id;
                const ronde = t.forme === 'ronde' || t.forme === 'tabouret';
                const w = Math.max(44, t.largeur * k);
                const h = Math.max(44, t.hauteur * k);
                const etat = ticket ? 'occupee' : attendue ? 'reservee' : 'libre';
                const commander = e && e.sansEnvoi != null && e.sansEnvoi >= ATTENTE_COMMANDE_MIN;
                const touchAction = deplacerActif || (ticket && onTransferer && !choixSeul && !tel) ? 'none' : 'manipulation';
                const contenu = estPrincipale ? (
                  <ContenuTable
                    t={principale} w={w} h={h} k={k} echelle={echelleTexte} ronde={ronde}
                    e={e} attendue={attendue} nom={ticket ? nomDeTablee(tablee, noms) : null}
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
                    }}
                  >
                    {chaises(t, w, h, k).map((c, i) => (
                      <span
                        key={i}
                        aria-hidden="true"
                        style={{
                          ...st.chaise, left: c.left, top: c.top, width: c.width, height: c.height,
                          transform: c.rot ? `rotate(${c.rot}deg)` : undefined,
                          background: etat === 'occupee' ? 'var(--accent)' : etat === 'reservee' ? 'var(--info-bd)' : 'var(--border2)',
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
                        ...(etat === 'occupee' ? st.tableOccupee : etat === 'reservee' ? st.tableReservee : null),
                        borderRadius: ronde ? '50%' : (Math.min(w, h) < 70 ? 'var(--r-sm)' : 'var(--r)'),
                        touchAction,
                        cursor: deplacerActif ? 'grab' : 'pointer',
                        ...(enDrag ? st.tableDrag : null),
                        ...(cible || choisie === principale.id ? st.tableCible : null),
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

        {affichage.liste && ouverts.length > 0 && (
          <div className="caisse-liste" data-cadre="" style={st.liste}>
            <div style={st.listeTitre}>Tables ouvertes</div>
            {ouverts.map(({ t, ticket }) => {
              const e = etatTicket(ticket, maintenant);
              return (
                <button key={ticket.id} type="button" style={st.rang} onClick={() => onTapTable(t, ticket)}>
                  <span style={st.rangNom} data-no-translate>{t.nom}</span>
                  <span style={st.rangInfos}>
                    {noms[t.id] && !noms[t.id].attendu && (
                      <span style={st.rangClient} data-no-translate>{noms[t.id].nom}</span>
                    )}
                    <span style={st.rangLigne}>
                      <span style={st.num}>{e.articles}</span> <span>articles</span>
                    </span>
                    <span style={st.rangLigne}>
                      {e.minutes != null
                        ? <><span>Dernier envoi il y a</span> <span style={st.num}>{e.minutes}</span> <span>min</span></>
                        : <span>Rien d'envoyé en cuisine</span>}
                    </span>
                    {e.aSuivre > 0 && (
                      <span style={st.rangSuivre}>
                        <ChevronsRight size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                        <span style={st.num}>{e.aSuivre}</span> <span>à suivre en attente</span>
                      </span>
                    )}
                    {e.prets > 0 && (
                      <span style={st.rangPret} data-caisse-prets="">
                        <ConciergeBell size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                        <span style={st.num}>{e.prets}</span> <span>{e.prets > 1 ? 'prêts en cuisine' : 'prêt en cuisine'}</span>
                      </span>
                    )}
                  </span>
                  <span style={st.rangMontant}><span>{chf(e.montant)}</span> <span style={st.devise}>CHF</span></span>
                </button>
              );
            })}
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

// Ce qu'une table porte, ligne par ligne, selon sa place et l'affichage
// choisi. Le numéro d'abord ; ensuite, par ordre de priorité, le montant, le
// client, le détail (couverts et minutes). Ce qui ne tient pas se lit dans la
// liste des tables ouvertes.
function ContenuTable({ t, w, h, k, echelle, ronde, e, attendue, nom, ticket, affichage }) {
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
  if (e) {
    if (affichage.montant && tient(chf(e.montant), fNum)) pousser('montant', <span style={{ ...st.tableMontant, fontSize: fNum }}>{chf(e.montant)}</span>);
    if (affichage.nom && nom && utile >= 40) pousser('nom', <N style={{ ...st.tableTexte, fontSize: fTexte, fontWeight: 'var(--g2)' }}>{nom}</N>);
    const morceaux = [];
    if (affichage.minutes && e.minutes != null) morceaux.push({ cle: 'm', txt: `${e.minutes} min`, el: <><span>{e.minutes}</span><span style={st.sep}>min</span></> });
    if (affichage.couverts && ticket?.couverts) morceaux.push({ cle: 'c', txt: `${ticket.couverts} couv.`, el: <><span>{ticket.couverts}</span><span style={st.sep}>couv.</span></> });
    pousser('detail', detail(morceaux));
  } else if (attendue) {
    if (affichage.nom && utile >= 40) pousser('nom', <N style={{ ...st.tableTexte, fontSize: fTexte, fontWeight: 'var(--g3)' }}>{attendue.nom}</N>);
    const morceaux = [{ cle: 'h', txt: attendue.heure, el: <span style={st.sepFin}>{attendue.heure}</span> }];
    if (affichage.couverts && attendue.couverts) morceaux.push({ cle: 'c', txt: `${attendue.couverts} couv.`, el: <><span>{attendue.couverts}</span><span style={st.sep}>couv.</span></> });
    pousser('detail', detail(morceaux));
  } else if (affichage.couverts && t.nb_places && t.forme !== 'tabouret' && tient(`${t.nb_places} places`, fTexte)) {
    pousser('places', <span style={{ ...st.tableDetail, fontSize: fTexte, color: 'var(--text3)' }}><span>{t.nb_places}</span><span style={st.sep}>places</span></span>);
  }
  return (
    <>
      <N style={{ ...st.tableNom, fontSize: fNum }}>{t.nom}</N>
      {lignes.slice(0, place).map((l) => <React.Fragment key={l.cle}>{l.el}</React.Fragment>)}
    </>
  );
}

function Compteur({ couleur, n, un, plusieurs }) {
  return (
    <span style={st.compteur}>
      <span aria-hidden="true" style={{ ...st.point, background: couleur }} />
      <N style={st.num}>{n}</N>
      <span>{n > 1 ? plusieurs : un}</span>
    </span>
  );
}

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

function ReglagesAffichage({ affichage, onChange }) {
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
        <span style={st.reglagesTitre}>Liste des tables ouvertes</span>
        <span style={st.pilules}>
          <Pilule choisi={affichage.liste} onClick={() => onChange({ liste: true })}>Affichée</Pilule>
          <Pilule choisi={!affichage.liste} onClick={() => onChange({ liste: false })}>Masquée</Pilule>
        </span>
      </div>
      <span style={st.reglagesNote}>Réglé pour cet appareil.</span>
    </Panneau>
  );
}

const st = {
  racine: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10, minWidth: 0 },
  barre: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, minWidth: 0 },
  compteurs: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 },
  compteur: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 'var(--r-full)',
    background: 'var(--zone)', color: 'var(--text)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', whiteSpace: 'nowrap',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
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
  tableOccupee: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  tableReservee: { background: 'var(--info-bg-soft)', color: 'var(--info-text)', borderColor: 'var(--info-bd)' },
  tableDrag: { boxShadow: 'var(--sh-lg)', opacity: 0.9 },
  tableCible: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: 'var(--onglet)', outlineOffset: 3 },
  tableNom: { fontWeight: 'var(--g3)', fontFamily: 'var(--font-num)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
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
    display: 'flex', flexDirection: 'column', flex: '1 1 280px', minWidth: 0, maxWidth: 900, padding: '4px 18px', boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  listeTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', margin: '12px 0 4px' },
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
  rangMontant: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t3)', flexShrink: 0, whiteSpace: 'nowrap' },
  devise: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
};
