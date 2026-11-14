import React from 'react';
import { ChevronsRight, Clock, ConciergeBell, SlidersHorizontal } from 'lucide-react';
import { PLAN_W, PLAN_H } from '../../hooks/planSalleCanevas.js';
import { Btn, Panneau, TabBar } from '../../components/ui/index.jsx';
import { ElementDecor } from '../previsions/planDecor.jsx';
import { readJson, writeJson } from '../../utils/storage.js';
import { useHauteurRestante, useLargeur, useMaintenant } from './mesures.js';
import { ATTENTE_COMMANDE_MIN, cadreDe, decalageBorne, tableSous } from './planService.js';

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
// tables, taille du texte, liste des tables ouvertes, salle ouverte.
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
const AFFICHAGE_DEFAUT = { montant: true, minutes: true, couverts: true, nom: true, grand: false, liste: true, salles: {} };
function lireAffichage() {
  const v = readJson(CLE_AFFICHAGE, null);
  return v && typeof v === 'object' ? { ...AFFICHAGE_DEFAUT, ...v, salles: { ...(v.salles || {}) } } : { ...AFFICHAGE_DEFAUT, salles: {} };
}

// Chaises autour d'une table, en pixels, relatives à la table. Un tabouret
// est déjà une place : pas de chaise.
function chaises(t, w, h, k) {
  const n = Math.min(12, Math.max(0, Number(t.nb_places) || 0));
  if (!n || t.forme === 'tabouret' || k < 0.45) return [];
  const ep = Math.max(5, Math.round(9 * k));
  const ecart = Math.max(3, Math.round(5 * k));
  const res = [];
  if (t.forme === 'ronde') {
    const r = Math.min(w, h) / 2;
    const d = Math.max(8, Math.round(18 * k));
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      res.push({ left: w / 2 + Math.cos(a) * (r + ecart + ep / 2) - d / 2, top: h / 2 + Math.sin(a) * (r + ecart + ep / 2) - ep / 2, width: d, height: ep, rot: (a * 180) / Math.PI + 90 });
    }
    return res;
  }
  // Rectangle : les grands côtés d'abord. Carré : les quatre côtés.
  const cotes = t.forme === 'carree' && n > 2 ? ['haut', 'bas', 'gauche', 'droite'] : (w >= h ? ['haut', 'bas'] : ['gauche', 'droite']);
  const parCote = Object.fromEntries(cotes.map((c) => [c, 0]));
  for (let i = 0; i < n; i += 1) parCote[cotes[i % cotes.length]] += 1;
  Object.entries(parCote).forEach(([cote, m]) => {
    const horizontal = cote === 'haut' || cote === 'bas';
    const long = horizontal ? w : h;
    const pas = long / m;
    const lg = Math.max(8, Math.min(pas * 0.6, 26 * k));
    for (let i = 0; i < m; i += 1) {
      const centre = pas * (i + 0.5);
      if (horizontal) res.push({ left: centre - lg / 2, top: cote === 'haut' ? -ecart - ep : h + ecart, width: lg, height: ep, rot: 0 });
      else res.push({ left: cote === 'gauche' ? -ecart - ep : w + ecart, top: centre - lg / 2, width: ep, height: lg, rot: 0 });
    }
  });
  return res;
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
  }

  // ── Cadrage : la salle prend la largeur de la carte, bornée par la hauteur
  // qui reste sous le haut du plan (la salle se voit sans défiler), sauf au
  // téléphone où la page défile. Hors du mode « Déplacer des tables », la vue
  // se cale sur ce qui est dessiné (tables, décor et place des chaises) : une
  // salle qui n'occupe qu'une part du canevas s'affiche en grand. En mode
  // déplacer, tout le canevas, pour poser une table n'importe où.
  const pad = 14;
  const dispoL = Math.max(0, largeurCol - pad * 2);
  const dispoH = hauteurDispo && largeurCol >= 560 ? Math.max(200, hauteurDispo - pad * 2) : null;
  const vue = cadrage(deplacerActif ? null : [...visibles, ...decor]);
  let k = vue.w ? dispoL / vue.w : 0;
  if (dispoH) k = Math.min(k, dispoH / vue.h);
  k = Math.min(k, 1.6);
  const largeur = Math.round(dispoL);
  const hauteur = Math.round(vue.h * k);
  // Origine du canevas complet dans la vue : la salle est centrée en largeur.
  const origineX = vue.x0 * k - (largeur - vue.w * k) / 2;
  const origineY = vue.y0 * k;
  const echelleTexte = affichage.grand ? 1.2 : 1;

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
    const mode = deplacerActif ? 'deplacer' : (ticket && onTransferer && !choixSeul ? 'transfert' : null);
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

  return (
    <div style={st.racine} data-caisse-plan="">
      {/* Barre du plan : salles, compteurs, déplacer, affichage. */}
      <div style={st.barre}>
        {onglets.length > 1 && <TabBar tabs={onglets} active={actif} onChange={choisirSalle} />}
        <div style={st.compteurs} aria-live="polite">
          <Compteur couleur="var(--border2)" n={compte.libres} un="libre" plusieurs="libres" />
          <Compteur couleur="var(--info-bd)" n={compte.reservees} un="réservée" plusieurs="réservées" />
          <Compteur couleur="var(--accent)" n={compte.occupees} un="occupée" plusieurs="occupées" />
          {compte.prets > 0 && <Compteur couleur="var(--success-fill)" n={compte.prets} un="plats prêts" plusieurs="plats prêts" />}
          {compte.commander > 0 && <Compteur couleur="var(--warning-bd)" n={compte.commander} un="à commander" plusieurs="à commander" />}
        </div>
        <div style={st.actionsBarre}>
          {peutDeplacer && !choixSeul && !deplacer && (
            <Btn variant="ghost" onClick={() => { setDeplacer(true); setReglages(false); }} style={st.btn44}>Déplacer des tables</Btn>
          )}
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
              ref={canevasRef}
              style={{ ...st.canevas, width: largeur, height: hauteur }}
            >
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
                const touchAction = deplacerActif || (ticket && onTransferer && !choixSeul) ? 'none' : 'manipulation';
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

// Vue du plan : le contour de ce qui est dessiné, avec 40 unités autour (la
// place des chaises), au moins 300 sur 210, dans le canevas. Sans rien :
// tout le canevas.
function cadrage(objets) {
  if (!objets?.length) return { x0: 0, y0: 0, w: PLAN_W, h: PLAN_H };
  const marge = 40;
  let x0 = Math.max(0, Math.min(...objets.map((o) => Number(o.pos_x))) - marge);
  let y0 = Math.max(0, Math.min(...objets.map((o) => Number(o.pos_y))) - marge);
  let x1 = Math.min(PLAN_W, Math.max(...objets.map((o) => Number(o.pos_x) + Number(o.largeur))) + marge);
  let y1 = Math.min(PLAN_H, Math.max(...objets.map((o) => Number(o.pos_y) + Number(o.hauteur))) + marge);
  if (x1 - x0 < 300) { const c = (x0 + x1) / 2; x0 = Math.max(0, c - 150); x1 = Math.min(PLAN_W, x0 + 300); }
  if (y1 - y0 < 210) { const c = (y0 + y1) / 2; y0 = Math.max(0, c - 105); y1 = Math.min(PLAN_H, y0 + 210); }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
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
  const place = Math.max(0, Math.floor((h - 10 - fNum * 1.2) / ligneH));
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
