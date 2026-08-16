import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { usePlanSalle, PLAN_W, PLAN_H, PLAN_GRID } from '../../hooks/usePlanSalle.js';
import PlanTableForm from './PlanTableForm.jsx';
import PlanSallesManager from './PlanSallesManager.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Plan de salle - placement des réservations du service sélectionné
// ───────────────────────────────────────────────────────────────────────────
// Deux modes, un seul canevas :
//   • « service » : on fait glisser les réservations du shift sur les tables.
//     Les tables ne bougent pas.
//   • « plan »    : on dessine la salle - on déplace, ajoute et règle les
//     tables. Les réservations ne bougent pas.
// Les mélanger reviendrait à déplacer une table en croyant placer un client.
//
// GLISSER-DÉPOSER AU POINTEUR, PAS EN HTML5
// L'API HTML5 (draggable + dragstart) ne produit rien au doigt : elle
// n'existe pas sur iOS. Or ce module se joue à l'entrée, sur l'iPad de
// l'hôte. Tout passe donc par les Pointer Events, qui couvrent souris,
// stylet et doigt avec le même code.
//
// Les écouteurs sont posés sur `window` et non sur l'élément source : une
// mise à jour optimiste démonte la pastille qu'on est en train de traîner,
// et avec setPointerCapture le geste mourrait avec elle.
//
// `touchAction: 'none'` est obligatoire sur toute poignée : sans lui, le
// navigateur interprète le geste comme un défilement et ne nous envoie plus
// rien. Il n'est posé QUE sur les poignées (le petit ⠿ des cartes, les
// pastilles, les tables en mode plan) pour que la liste reste défilable au
// doigt partout ailleurs.
// ═══════════════════════════════════════════════════════════════════════════

const SERVICES = [
  { id: 'midi',   label: 'Midi' },
  { id: 'soir',   label: 'Soir' },
  { id: 'brunch', label: 'Brunch' },
];

// Distance en pixels avant qu'un appui devienne un glisser. Sans ce seuil,
// le moindre tremblement de doigt sur une pastille la déplacerait au lieu
// d'ouvrir la réservation.
const SEUIL_DRAG = 6;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const snap  = (v) => Math.round(v / PLAN_GRID) * PLAN_GRID;

// ── Une table sur le canevas ───────────────────────────────────────────────
function TableShape({
  table, occupants, mode, estCible, canEdit,
  onPointerDownTable, onPointerDownOccupant, onEditTable, dragLienId,
}) {
  const places   = table.nb_places || 0;
  // `part` et non `nb_couverts` : une tablée étalée sur deux tables ne pèse
  // sur chacune qu'à hauteur de ce qu'elle y assied.
  const assis    = occupants.reduce((s, o) => s + (o.part ?? o.resa.nb_couverts ?? 0), 0);
  const complet  = assis > 0 && assis >= places;
  const deborde  = assis > places;
  const inactive = table.actif === false;

  // Bordure en propriétés séparées : l'état actif surcharge borderColor, et
  // le raccourci `border` à côté ferait râler React à chaque bascule.
  let borderColor = 'var(--border)';
  if (estCible)      borderColor = 'var(--accent)';
  else if (deborde)  borderColor = 'var(--danger-bd)';
  else if (complet)  borderColor = 'var(--success-bd)';

  let background = 'var(--surface)';
  if (estCible)          background = 'var(--ai-bg-soft)';
  else if (deborde)      background = 'var(--danger-bg-soft)';
  else if (occupants.length) background = 'var(--success-bg-soft)';

  const rayon = table.forme === 'ronde' ? '50%' : table.forme === 'carree' ? 10 : 8;
  const modePlan = mode === 'plan';

  return (
    <div
      data-plan-table={table.id}
      onPointerDown={modePlan && canEdit ? (e) => onPointerDownTable(e, table) : undefined}
      onDoubleClick={modePlan && canEdit ? () => onEditTable(table) : undefined}
      title={modePlan ? `${table.nom} · glisser pour déplacer, double-clic pour régler` : `${table.nom} · ${places} place${places > 1 ? 's' : ''}`}
      style={{
        position: 'absolute',
        left:   `${(table.pos_x   / PLAN_W) * 100}%`,
        top:    `${(table.pos_y   / PLAN_H) * 100}%`,
        width:  `${(table.largeur / PLAN_W) * 100}%`,
        height: `${(table.hauteur / PLAN_H) * 100}%`,
        borderWidth: estCible ? 2 : 1,
        borderStyle: inactive ? 'dashed' : 'solid',
        borderColor,
        background,
        borderRadius: rayon,
        boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 1, padding: 3, overflow: 'hidden',
        opacity: inactive ? 0.45 : 1,
        cursor: modePlan && canEdit ? 'grab' : 'default',
        touchAction: modePlan && canEdit ? 'none' : 'auto',
        boxShadow: estCible ? '0 0 0 3px rgba(0,48,66,0.15)' : 'none',
        transition: 'background 0.12s, border-color 0.12s',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {/* Nom + capacité */}
      <div style={{
        fontSize: 11, fontWeight: 800, lineHeight: 1.1,
        color: 'var(--text)', fontFamily: 'var(--font-serif)',
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {table.nom}
      </div>
      <div style={{ fontSize: 9, color: deborde ? 'var(--danger-text)' : 'var(--text3)', lineHeight: 1.1 }}>
        {occupants.length ? `${assis}/${places}` : `${places} pl.`}
      </div>

      {/* Occupants - chaque pastille est une poignée de glisser */}
      {occupants.slice(0, 3).map(({ lien, resa, etale }) => (
        <div
          key={lien.id}
          data-plan-occupant={lien.id}
          onPointerDown={mode === 'service' && canEdit ? (e) => onPointerDownOccupant(e, lien, resa) : undefined}
          style={{
            maxWidth: '100%', padding: '1px 5px', borderRadius: 20,
            background: 'var(--accent)', color: '#fff',
            fontSize: 9, fontWeight: 700, lineHeight: 1.35,
            fontFamily: 'var(--font)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: mode === 'service' && canEdit ? 'grab' : 'default',
            touchAction: mode === 'service' && canEdit ? 'none' : 'auto',
            opacity: dragLienId === lien.id ? 0.35 : 1,
          }}
        >
          {/* ⇄ : la tablée déborde sur une autre table, les couverts affichés
              sont ceux du groupe entier et non de cette seule table. */}
          {etale ? '⇄ ' : ''}{resa.nom} · {resa.nb_couverts}
        </div>
      ))}
      {occupants.length > 3 && (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700 }}>
          +{occupants.length - 3}
        </div>
      )}
    </div>
  );
}

// ── Ligne de réservation dans le panneau latéral ───────────────────────────
// Toutes les réservations du service y restent, placées ou non. Les faire
// disparaître une fois posées interdirait le cas le plus courant des grandes
// tablées : un groupe de 12 dans une maison qui n'a que des tables de 6 doit
// pouvoir recevoir une SECONDE table, et ça se fait en le glissant à nouveau.
function ResaLigne({ resa, tablesOccupees, canEdit, onPointerDownResa, onOpen, enCours }) {
  const placee = tablesOccupees.length > 0;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 9px', borderRadius: 8,
        borderWidth: 1, borderStyle: 'solid',
        borderColor: placee ? 'var(--success-bd)' : 'var(--border)',
        background: placee ? 'var(--success-bg-soft)' : 'var(--surface)',
        opacity: enCours ? 0.35 : 1,
      }}
    >
      {/* Poignée : seule zone où le doigt ne fait pas défiler la liste */}
      {canEdit && (
        <span
          data-plan-poignee={resa.id}
          onPointerDown={(e) => onPointerDownResa(e, resa)}
          aria-label={placee ? `Ajouter une table à ${resa.nom}` : `Placer ${resa.nom}`}
          title={placee ? 'Glisser sur une autre table pour agrandir la tablée' : 'Glisser sur une table'}
          style={{
            // 44 px de haut : une poignée de 32 se rate au doigt, et un
            // glisser raté sur un plan de salle passe pour un bug.
            flexShrink: 0, width: 34, height: 44, marginLeft: -4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab', touchAction: 'none',
            color: 'var(--text3)', fontSize: 15, lineHeight: 1,
            userSelect: 'none', WebkitUserSelect: 'none',
          }}
        >
          ⠿
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpen?.(resa)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
          border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font)',
        }}
      >
        <div style={{
          fontSize: 12, fontWeight: 700, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {resa.nom}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
          {(resa.heure_arrivee || '').slice(0, 5)} · {resa.nb_couverts} pax
          {resa.est_groupe ? ' · groupe' : ''}
        </div>
        <div style={{
          fontSize: 10, marginTop: 2, fontWeight: 700,
          color: placee ? 'var(--success-text)' : 'var(--text3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {placee ? `Table ${tablesOccupees.join(' + ')}` : 'À placer'}
        </div>
      </button>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────
export default function PlanSalle({
  etablissementId, date, resas, canEdit = false, onOpenResa,
}) {
  const isMobile = useIsMobile();
  const plan     = usePlanSalle(etablissementId);
  const canvasRef = useRef(null);

  const [mode,    setMode]    = useState('service');
  const [service, setService] = useState(null);   // null = pas encore résolu
  const [salles,  setSalles]  = useState(null);
  const [salleId, setSalleId] = useState(null);   // null = pas encore résolue
  const [tables,  setTables]  = useState(null);
  const [liens,   setLiens]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [drag,    setDrag]    = useState(null);
  const [editTable,  setEditTable]  = useState(null); // table en cours de réglage
  const [gestionSalles, setGestionSalles] = useState(false);

  // Refs miroir : les gestionnaires de pointeur sont posés une seule fois par
  // geste, ils liraient sinon un état figé au moment de l'appui.
  const dragRef   = useRef(null);
  const tablesRef = useRef(null);
  const liensRef  = useRef(null);
  tablesRef.current = tables;
  liensRef.current  = liens;

  // ── Chargement ──────────────────────────────────────────────────────
  // La clé de rechargement est la LISTE DES IDS sérialisée, pas le tableau
  // `resas` : le parent en reconstruit la référence à chaque rendu (ouverture
  // d'une modale, frappe au clavier) et `load` reboucherait alors sans fin.
  const resaIdsKey = useMemo(
    () => (resas || []).map((r) => r.id).sort().join(','),
    [resas],
  );
  const resasRef = useRef(resas);
  resasRef.current = resas;

  const load = useCallback(async () => {
    if (!etablissementId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: s, error: eS } = await plan.listSalles();
      if (eS) { setError(eS); return; }
      const { data: t, error: eT } = await plan.listTables();
      if (eT) { setError(eT); return; }
      const ids = (resasRef.current || []).map((r) => r.id);
      const { data: l, error: eL } = await plan.listLiensPourResas(ids);
      if (eL) { setError(eL); return; }
      // Adoption des tables orphelines (salle_id null : posées par un bundle
      // antérieur à la migration des salles, ou dont la salle a été
      // supprimée). Tant qu'elles restent orphelines, l'affichage les
      // rattache à la première salle SANS que la base le sache : la
      // suppression d'une salle annoncerait alors plus de tables qu'elle n'en
      // emporte. On répare une fois, pour de bon.
      //
      // Réservé aux rôles qui écrivent : un cuisinier en lecture seule se
      // heurterait à la RLS. Pour lui, le repli d'affichage suffit.
      const orphelines = (t || []).filter((x) => !x.salle_id);
      if (canEdit && orphelines.length > 0 && (s || []).length > 0) {
        const cible = s[0].id;
        const adoptees = await Promise.all(orphelines.map((x) =>
          plan.updateTable(x.id, { salle_id: cible })));
        const parId = new Map();
        adoptees.forEach((r, i) => { if (r?.data) parId.set(orphelines[i].id, r.data); });
        setTables((t || []).map((x) => parId.get(x.id) || x));
      } else {
        setTables(t);
      }
      setSalles(s);
      setLiens(l);
    } finally {
      setLoading(false);
    }
    // resaIdsKey pilote le rechargement : une réservation ajoutée ou annulée
    // change la clé, une simple re-création du tableau ne la change pas.
  }, [etablissementId, plan, resaIdsKey, canEdit]);

  useEffect(() => { load(); }, [load]);

  // Realtime : l'hôte place à l'entrée pendant que le patron regarde le même
  // plan. Sans ça, chacun placerait sur une photo périmée du service.
  useEffect(() => {
    const bridge = dbService.getBridge();
    if (!bridge?.realtime) return undefined;
    const unsub = bridge.realtime.subscribeReload(
      ['salles', 'salle_tables', 'reservation_tables'],
      () => { if (!dragRef.current) load(); },
    );
    return () => { unsub && unsub(); };
  }, [load]);

  // ── Service affiché ─────────────────────────────────────────────────
  // Par défaut celui qui a le plus de couverts ce jour-là : ouvrir sur
  // « Midi » un soir de 60 couverts ferait croire à un plan vide.
  const couvertsParService = useMemo(() => {
    const m = { midi: 0, soir: 0, brunch: 0 };
    for (const r of resas || []) m[r.service] = (m[r.service] || 0) + (r.nb_couverts || 0);
    return m;
  }, [resas]);

  useEffect(() => {
    if (service !== null) return;
    const meilleur = SERVICES
      .map((s) => s.id)
      .reduce((a, b) => (couvertsParService[b] > couvertsParService[a] ? b : a), 'soir');
    setService(meilleur);
  }, [service, couvertsParService]);

  // ── Salle affichée ──────────────────────────────────────────────────
  // Une table sans salle (bundle antérieur, ou salle supprimée entre-temps)
  // est rattachée à la première : mieux vaut une table au mauvais endroit
  // qu'une table invisible que personne ne pourra plus jamais placer.
  const premiereSalleId = (salles || [])[0]?.id ?? null;
  const salleDeTable    = useCallback(
    (t) => t.salle_id || premiereSalleId,
    [premiereSalleId],
  );

  useEffect(() => {
    if (!salles) return;
    const existe = salles.some((s) => s.id === salleId);
    if (!existe) setSalleId(premiereSalleId);
  }, [salles, salleId, premiereSalleId]);

  const tablesSalle = useMemo(() => {
    if (!tables) return [];
    if (!(salles || []).length) return tables;   // pas encore de salles : tout afficher
    return tables.filter((t) => salleDeTable(t) === salleId);
  }, [tables, salles, salleId, salleDeTable]);

  const nbTablesParSalle = useMemo(() => {
    const m = new Map();
    for (const t of tables || []) {
      const id = salleDeTable(t);
      if (!id) continue;
      m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [tables, salleDeTable]);

  // Compte STRICT, pour la confirmation de suppression : seules les tables
  // que la base rattache vraiment à la salle partiront avec elle. Annoncer
  // le compte affiché (qui absorbe les orphelines) promettrait une
  // destruction plus large que celle qui a lieu.
  const nbTablesReellesParSalle = useMemo(() => {
    const m = new Map();
    for (const t of tables || []) {
      if (!t.salle_id) continue;
      m.set(t.salle_id, (m.get(t.salle_id) || 0) + 1);
    }
    return m;
  }, [tables]);

  const serviceActif  = service || 'soir';
  const resasService  = useMemo(
    () => (resas || [])
      .filter((r) => r.service === serviceActif)
      .sort((a, b) => (a.heure_arrivee || '').localeCompare(b.heure_arrivee || '')),
    [resas, serviceActif],
  );

  // Placement du service courant, indexé par table. Les liaisons chargées
  // couvrent toute la journée : ne retenir que les résas du service filtre
  // le midi quand on regarde le soir.
  //
  // RÉPARTITION DES COUVERTS D'UNE TABLÉE ÉTALÉE
  // Un groupe de 12 posé sur une table de 6 et une de 8 n'assied pas 12
  // personnes à chaque table : il en assied 12 sur 14 places. Compter le
  // total sur chacune afficherait deux tables en dépassement alors que le
  // groupe rentre. Les couverts sont donc répartis au prorata des places de
  // chaque table occupée, et la somme retombe juste.
  const occupantsParTable = useMemo(() => {
    const parId       = new Map(resasService.map((r) => [r.id, r]));
    const placesTable = new Map((tables || []).map((t) => [t.id, Number(t.nb_places) || 0]));

    // Capacité cumulée des tables de chaque réservation
    const capaciteParResa = new Map();
    const nbTablesParResa = new Map();
    for (const l of liens || []) {
      if (!parId.has(l.reservation_id)) continue;
      capaciteParResa.set(l.reservation_id,
        (capaciteParResa.get(l.reservation_id) || 0) + (placesTable.get(l.table_id) || 0));
      nbTablesParResa.set(l.reservation_id, (nbTablesParResa.get(l.reservation_id) || 0) + 1);
    }

    const m = new Map();
    for (const l of liens || []) {
      const resa = parId.get(l.reservation_id);
      if (!resa) continue;
      const couverts = resa.nb_couverts || 0;
      const capacite = capaciteParResa.get(l.reservation_id) || 0;
      const nbTables = nbTablesParResa.get(l.reservation_id) || 1;
      const places   = placesTable.get(l.table_id) || 0;
      // Prorata des places ; à capacité inconnue (tables à 0 place), partage
      // à parts égales plutôt que de tout empiler sur la première.
      const part = capacite > 0
        ? Math.round(couverts * (places / capacite))
        : Math.round(couverts / nbTables);
      if (!m.has(l.table_id)) m.set(l.table_id, []);
      m.get(l.table_id).push({ lien: l, resa, part, etale: nbTables > 1 });
    }
    return m;
  }, [liens, resasService, tables]);

  // Tables occupées par chaque réservation, en clair (« 3 + 10 »). Les non
  // placées remontent en tête : c'est ce qui reste à faire.
  const tablesParResa = useMemo(() => {
    const nomParTable = new Map((tables || []).map((t) => [t.id, t.nom]));
    const m = new Map();
    for (const l of liens || []) {
      if (!m.has(l.reservation_id)) m.set(l.reservation_id, []);
      const nom = nomParTable.get(l.table_id);
      if (nom) m.get(l.reservation_id).push(nom);
    }
    for (const noms of m.values()) {
      noms.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    }
    return m;
  }, [liens, tables]);

  const resasTriees = useMemo(() => {
    const rang = (r) => ((tablesParResa.get(r.id) || []).length ? 1 : 0);
    return [...resasService].sort((a, b) => rang(a) - rang(b));
  }, [resasService, tablesParResa]);

  const nbAPlacer = useMemo(
    () => resasService.filter((r) => !(tablesParResa.get(r.id) || []).length).length,
    [resasService, tablesParResa],
  );

  // ── Glisser-déposer ─────────────────────────────────────────────────
  const majDrag = (patch) => {
    dragRef.current = { ...dragRef.current, ...patch };
    setDrag({ ...dragRef.current });
  };

  // Convertit un point écran en unités canevas.
  function versCanevas(clientX, clientY) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width)  * PLAN_W,
      y: ((clientY - rect.top)  / rect.height) * PLAN_H,
    };
  }

  function demarrerGeste(e, payload) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = {
      ...payload,
      pointerId: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      x: e.clientX,  y: e.clientY,
      demarre: false, over: null,
    };
    setDrag({ ...dragRef.current });
    // Écouteurs posés MAINTENANT, pas au prochain rendu : un `useEffect` ne
    // s'exécute qu'après le commit React, et un geste vif peut envoyer son
    // premier pointermove avant. Le glisser partirait alors dans le vide.
    installerEcouteurs();
  }

  const onPointerDownResa = (e, resa) =>
    demarrerGeste(e, { kind: 'resa', resaId: resa.id, resa });

  const onPointerDownOccupant = (e, lien, resa) =>
    demarrerGeste(e, { kind: 'lien', lienId: lien.id, resaId: resa.id, resa, fromTableId: lien.table_id });

  function onPointerDownTable(e, table) {
    const p = versCanevas(e.clientX, e.clientY);
    if (!p) return;
    demarrerGeste(e, {
      kind: 'table', tableId: table.id,
      grabDX: p.x - Number(table.pos_x),
      grabDY: p.y - Number(table.pos_y),
    });
  }

  // Un seul jeu d'écouteurs par geste, posé à l'appui et retiré au relâcher.
  // Les gestionnaires lisent l'état vivant dans les refs : ils ne vieillissent
  // donc jamais, même si le composant se re-rend vingt fois pendant le geste.
  const nettoyageRef = useRef(null);

  function installerEcouteurs() {
    nettoyageRef.current?.();

    function onMove(e) {
      const d = dragRef.current;
      if (!d || (d.pointerId != null && e.pointerId !== d.pointerId)) return;

      if (!d.demarre) {
        const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
        if (dist < SEUIL_DRAG) return;
        d.demarre = true;
      }
      e.preventDefault();

      if (d.kind === 'table') {
        const p = versCanevas(e.clientX, e.clientY);
        const t = (tablesRef.current || []).find((x) => x.id === d.tableId);
        if (!p || !t) return;
        const nx = clamp(snap(p.x - d.grabDX), 0, PLAN_W - Number(t.largeur));
        const ny = clamp(snap(p.y - d.grabDY), 0, PLAN_H - Number(t.hauteur));
        // Déplacement optimiste : le doigt ne doit pas attendre le réseau.
        setTables((prev) => (prev || []).map((x) =>
          x.id === d.tableId ? { ...x, pos_x: nx, pos_y: ny } : x));
        // La position retenue est portée par le geste, PAS relue dans l'état
        // React au moment du dépôt : un relâchement qui tombe dans la même
        // tâche que le dernier déplacement précède le rendu, et on
        // enregistrerait alors la position d'avant le geste.
        majDrag({ x: e.clientX, y: e.clientY, posX: nx, posY: ny });
        return;
      }

      // Placement d'une réservation : on cherche ce qu'il y a sous le doigt.
      // Le fantôme porte pointerEvents:none, il ne se masque donc pas
      // lui-même.
      const el      = document.elementFromPoint(e.clientX, e.clientY);
      const tableEl = el?.closest?.('[data-plan-table]');
      const listeEl = el?.closest?.('[data-plan-liste]');
      majDrag({
        x: e.clientX, y: e.clientY,
        over: tableEl ? { tableId: tableEl.getAttribute('data-plan-table') }
            : listeEl ? { liste: true }
            : null,
      });
    }

    function onUp(e) {
      const d = dragRef.current;
      if (d && d.pointerId != null && e.pointerId !== d.pointerId) return;
      nettoyer();
      if (!d) return;
      if (!d.demarre) return;   // simple appui : géré par onClick
      deposer(d);
    }

    function onCancel() {
      const d = dragRef.current;
      nettoyer();
      // Un geste interrompu (appel entrant, geste système) ne doit pas laisser
      // une table déplacée à l'écran mais pas en base.
      if (d?.kind === 'table') load();
    }

    function nettoyer() {
      dragRef.current = null;
      setDrag(null);
      window.removeEventListener('pointermove',   onMove);
      window.removeEventListener('pointerup',     onUp);
      window.removeEventListener('pointercancel', onCancel);
      nettoyageRef.current = null;
    }

    window.addEventListener('pointermove',   onMove, { passive: false });
    window.addEventListener('pointerup',     onUp);
    window.addEventListener('pointercancel', onCancel);
    nettoyageRef.current = nettoyer;
  }

  // Filet de sécurité : un démontage en plein geste (changement d'onglet,
  // navigation) ne doit pas laisser d'écouteurs sur window.
  useEffect(() => () => nettoyageRef.current?.(), []);

  // ── Écriture du dépôt ───────────────────────────────────────────────
  async function deposer(d) {
    if (d.kind === 'table') {
      if (d.posX == null || d.posY == null) return;   // posée sans avoir bougé
      const { error: e } = await plan.updateTable(d.tableId, { pos_x: d.posX, pos_y: d.posY });
      if (e) { notify(e, 'error'); load(); }
      return;
    }

    const cibleId = d.over?.tableId || null;
    const surListe = !!d.over?.liste;

    // ── Retirer du plan ──
    if (d.kind === 'lien' && surListe) {
      const lienId = d.lienId;
      setLiens((prev) => (prev || []).filter((l) => l.id !== lienId));
      const { error: e } = await plan.retirer(lienId);
      if (e) { notify(e, 'error'); load(); return; }
      notify(`${d.resa.nom} retiré du plan`, 'info');
      return;
    }

    if (!cibleId) return;                              // lâché dans le vide
    if (d.kind === 'lien' && cibleId === d.fromTableId) return;  // même table

    const table = (tablesRef.current || []).find((t) => t.id === cibleId);
    if (!table) return;
    if (table.actif === false) {
      notify(`${table.nom} est inactive : réactive-la dans « Modifier le plan ».`, 'warning');
      return;
    }

    // ── Poser sur une table ──
    const { data: lien, error: e, dejaPlace } = await plan.assigner(d.resaId, cibleId);
    if (e) { notify(e, 'error'); return; }

    if (d.kind === 'lien') {
      // Déplacement : on pose d'abord, on retire ensuite. Dans l'autre ordre,
      // un échec de la pose laisserait la réservation nulle part.
      const { error: eDel } = await plan.retirer(d.lienId);
      if (eDel) { notify(eDel, 'error'); load(); return; }
      setLiens((prev) => {
        const sansAncien = (prev || []).filter((l) => l.id !== d.lienId);
        return lien ? [...sansAncien, lien] : sansAncien;
      });
      notify(`${d.resa.nom} → ${table.nom}`, 'success');
      return;
    }

    if (dejaPlace) return;
    setLiens((prev) => (lien ? [...(prev || []), lien] : prev));
    notify(`${d.resa.nom} · ${d.resa.nb_couverts} pax → ${table.nom}`, 'success');
  }

  // ── Réglage des tables (mode plan) ──────────────────────────────────
  // Numérotation continue à l'échelle de la MAISON et non de la salle : dans
  // un restaurant les numéros de table ne se répètent pas d'une salle à
  // l'autre, sinon « table 3 » ne désigne plus rien au passe.
  function prochainNumero() {
    const nums = (tables || [])
      .map((t) => parseInt(String(t.nom).replace(/\D/g, ''), 10))
      .filter((n) => Number.isFinite(n));
    return String(nums.length ? Math.max(...nums) + 1 : 1);
  }

  // Pose en quinconce pour ne pas empiler les nouvelles tables au même point.
  function positionLibre(index) {
    return {
      pos_x: 40 + (index % 8) * 115,
      pos_y: 40 + Math.floor(index / 8) * 115,
    };
  }

  async function ajouterTable() {
    // Sans salle, on en crée une d'office : une table doit vivre quelque part.
    let cible = salleId;
    if (!cible) {
      const { data: s, error: eS } = await plan.createSalle('Salle', 0);
      if (eS) { notify(eS, 'error'); return; }
      setSalles((prev) => [...(prev || []), s]);
      setSalleId(s.id);
      cible = s.id;
    }

    const { pos_x, pos_y } = positionLibre(tablesSalle.length);
    const { data, error: e } = await plan.createTable({
      nom: prochainNumero(), nb_places: 2, forme: 'ronde',
      salle_id: cible, pos_x, pos_y,
    });
    if (e) { notify(e, 'error'); return; }
    setTables((prev) => [...(prev || []), data]);
    setEditTable(data);
  }

  // Duplication : même gabarit, numéro suivant, décalée pour rester visible.
  async function dupliquerTable(modele) {
    const decale = (v, max) => Math.min(v + 40, max);
    const { data, error: e } = await plan.createTable({
      ...modele,
      nom: prochainNumero(),
      pos_x: decale(Number(modele.pos_x) || 0, PLAN_W - Number(modele.largeur || 90)),
      pos_y: decale(Number(modele.pos_y) || 0, PLAN_H - Number(modele.hauteur || 90)),
    });
    if (e) { notify(e, 'error'); return false; }
    setTables((prev) => [...(prev || []), data]);
    notify(`Table ${data.nom} créée`, 'success');
    return true;
  }

  // ── Gestion des salles ──────────────────────────────────────────────
  async function creerSalle(nom) {
    const ordre = (salles || []).length;
    const { data, error: e } = await plan.createSalle(nom, ordre);
    if (e) { notify(e, 'error'); return false; }
    setSalles((prev) => [...(prev || []), data]);
    if (!salleId) setSalleId(data.id);
    notify(`Salle « ${data.nom} » créée`, 'success');
    return true;
  }

  async function renommerSalle(id, nom) {
    const { data, error: e } = await plan.updateSalle(id, { nom });
    if (e) { notify(e, 'error'); return false; }
    setSalles((prev) => (prev || []).map((s) => (s.id === id ? data : s)));
    return true;
  }

  // Réordonner réécrit l'ordre de TOUTES les salles : renuméroter la liste
  // entière évite les collisions d'index après plusieurs déplacements.
  async function reordonnerSalles(from, to) {
    const liste = [...(salles || [])];
    if (to < 0 || to >= liste.length) return;
    const [deplacee] = liste.splice(from, 1);
    liste.splice(to, 0, deplacee);
    const renumerotees = liste.map((s, i) => ({ ...s, ordre: i }));
    setSalles(renumerotees);   // optimiste : la liste doit suivre le tap
    for (const s of renumerotees) {
      const { error: e } = await plan.updateSalle(s.id, { ordre: s.ordre });
      if (e) { notify(e, 'error'); load(); return; }
    }
  }

  async function supprimerSalle(id) {
    const { error: e } = await plan.deleteSalle(id);
    if (e) { notify(e, 'error'); return false; }
    setSalles((prev) => (prev || []).filter((s) => s.id !== id));
    setTables((prev) => (prev || []).filter((t) => t.salle_id !== id));
    setLiens((prev) => {
      const restantes = new Set((tablesRef.current || [])
        .filter((t) => t.salle_id !== id).map((t) => t.id));
      return (prev || []).filter((l) => restantes.has(l.table_id));
    });
    notify('Salle supprimée', 'info');
    return true;
  }

  async function enregistrerTable(id, patch) {
    const { data, error: e } = await plan.updateTable(id, patch);
    if (e) { notify(e, 'error'); return false; }
    setTables((prev) => (prev || []).map((t) => (t.id === id ? data : t)));
    return true;
  }

  async function supprimerTable(id) {
    const { error: e } = await plan.deleteTable(id);
    if (e) { notify(e, 'error'); return false; }
    setTables((prev) => (prev || []).filter((t) => t.id !== id));
    setLiens((prev) => (prev || []).filter((l) => l.table_id !== id));
    return true;
  }

  // ── Rendu ───────────────────────────────────────────────────────────
  if (loading && tables === null) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>
        Chargement du plan…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg-soft)',
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--danger-bd)',
        color: 'var(--danger-text)', fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <span>{error}</span>
        <button type="button" onClick={load} style={{
          padding: '6px 12px', borderRadius: 6, borderWidth: 1, borderStyle: 'solid',
          borderColor: 'var(--danger-bd)', background: 'transparent',
          color: 'var(--danger-text)', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
          Réessayer
        </button>
      </div>
    );
  }

  const aucuneTable = tablesSalle.length === 0;
  // Distinguer « la maison n'a pas de plan » de « cette salle-ci est vide » :
  // le message et l'action ne sont pas les mêmes.
  const autresSallesGarnies = (tables || []).length > 0;
  // Le mode plan est DÉRIVÉ du droit, pas seulement de l'état : un rôle
  // rétrogradé en cours de session verrait sinon le bouton « Terminer »
  // disparaître et resterait coincé dans l'éditeur.
  const modePlan    = mode === 'plan' && canEdit;
  const totalService = resasService.reduce((s, r) => s + (r.nb_couverts || 0), 0);
  // Places de TOUTES les salles : la question de l'hôte est « est-ce que le
  // service rentre dans la maison », pas « dans cet onglet ».
  const placesTotales = (tables || []).filter((t) => t.actif !== false)
    .reduce((s, t) => s + (t.nb_places || 0), 0);

  return (
    <div>
      {/* ── Barre : service + bascule mode plan ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        flexWrap: 'wrap', marginBottom: 10,
      }}>
        {!modePlan && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <SegmentedTabs
              tabs={SERVICES.map((s) => ({
                id: s.id,
                label: couvertsParService[s.id] ? `${s.label} · ${couvertsParService[s.id]}` : s.label,
              }))}
              active={serviceActif}
              onChange={setService}
              size="sm"
            />
          </div>
        )}
        {modePlan && (
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text2)' }}>
            Glisse les tables pour les déplacer · double-clic pour les régler
          </div>
        )}
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {modePlan && (
              <>
                <button type="button" onClick={ajouterTable} style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                }}>
                  + Table
                </button>
                <button type="button" onClick={() => setGestionSalles(true)} style={{
                  padding: '8px 14px', borderRadius: 8,
                  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                }}>
                  Salles
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setMode(modePlan ? 'service' : 'plan')}
              style={{
                padding: '8px 14px', borderRadius: 8,
                borderWidth: 1, borderStyle: 'solid',
                borderColor: modePlan ? 'var(--accent)' : 'var(--border)',
                background: modePlan ? 'var(--accent)' : 'var(--surface)',
                color: modePlan ? '#fff' : 'var(--text)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
              {modePlan ? 'Terminer' : 'Modifier le plan'}
            </button>
          </div>
        )}
      </div>

      {/* ── Onglets de salle ── */}
      {(salles || []).length > 1 && (
        <SegmentedTabs
          tabs={(salles || []).map((s) => ({
            id: s.id,
            label: modePlan
              ? `${s.nom} · ${nbTablesParSalle.get(s.id) || 0}`
              : s.nom,
          }))}
          active={salleId}
          onChange={setSalleId}
          size="sm"
          style={{ marginBottom: 10 }}
        />
      )}

      {/* ── Plan vide ── */}
      {aucuneTable && (
        <div style={{
          textAlign: 'center', padding: '44px 24px', borderRadius: 12,
          borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)',
          background: 'var(--surface)',
        }}>
          <div style={{ fontSize: 34, opacity: 0.18, marginBottom: 10 }}>▦</div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: 'var(--text)',
            fontFamily: 'var(--font-serif)', marginBottom: 6,
          }}>
            {autresSallesGarnies
              ? 'Cette salle n’a pas encore de table'
              : 'Le plan de salle n’est pas encore dessiné'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 380, margin: '0 auto 14px' }}>
            {canEdit
              ? 'Ajoute les tables une à une, place-les au doigt, puis glisse les réservations dessus.'
              : 'Un responsable doit le dessiner depuis « Modifier le plan ».'}
          </div>
          {canEdit && (
            <button type="button" onClick={() => { setMode('plan'); ajouterTable(); }} style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              + Ajouter une table
            </button>
          )}
        </div>
      )}

      {/* ── Canevas + liste ── */}
      {!aucuneTable && (
        <div style={{
          display: 'flex', gap: 12,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'flex-start',
        }}>
          {/* Canevas. Sur téléphone il garde une largeur plancher et défile
              DANS son cadre : à 335 px de large, une table de deux couverts
              tomberait à 31 px, illisible et increvable au doigt. La page,
              elle, ne pane jamais — le débordement reste enfermé ici. */}
          <div style={{
            flex: 1, minWidth: 0, width: '100%',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
            borderRadius: 12,
          }}>
          <div
            ref={canvasRef}
            style={{
              position: 'relative',
              width: '100%',
              minWidth: isMobile ? 560 : 0,
              aspectRatio: `${PLAN_W} / ${PLAN_H}`,
              background: 'var(--bg)',
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
              borderRadius: 12, overflow: 'hidden',
              backgroundImage:
                'linear-gradient(var(--border) 1px, transparent 1px),' +
                'linear-gradient(90deg, var(--border) 1px, transparent 1px)',
              backgroundSize: '5% 7.15%',
            }}
          >
            {tablesSalle.map((t) => (
              <TableShape
                key={t.id}
                table={t}
                occupants={occupantsParTable.get(t.id) || []}
                mode={modePlan ? 'plan' : 'service'}
                canEdit={canEdit}
                estCible={drag?.demarre && drag?.over?.tableId === t.id}
                dragLienId={drag?.demarre && drag?.kind === 'lien' ? drag.lienId : null}
                onPointerDownTable={onPointerDownTable}
                onPointerDownOccupant={onPointerDownOccupant}
                onEditTable={setEditTable}
              />
            ))}
          </div>
          </div>

          {/* Réservations à placer - aussi zone de dépôt pour retirer du plan */}
          {!modePlan && (
            <div
              data-plan-liste="1"
              style={{
                width: isMobile ? '100%' : 250, flexShrink: 0,
                borderWidth: 1, borderStyle: 'solid',
                borderColor: drag?.demarre && drag?.kind === 'lien' && drag?.over?.liste
                  ? 'var(--accent)' : 'var(--border)',
                borderRadius: 12, background: 'var(--surface)',
                padding: 10, boxSizing: 'border-box',
                maxHeight: isMobile ? 260 : 520, overflowY: 'auto',
              }}
            >
              <div style={{
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: 0.5, color: 'var(--text3)', marginBottom: 8,
              }}>
                {nbAPlacer > 0
                  ? `À placer · ${nbAPlacer}/${resasService.length}`
                  : `Réservations · ${resasService.length}`}
              </div>

              {resasService.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 2px', lineHeight: 1.5 }}>
                  Aucune réservation sur ce service.
                </div>
              )}

              {resasService.length > 0 && nbAPlacer === 0 && (
                <div style={{ fontSize: 12, color: 'var(--success-text)', padding: '2px 2px 8px', lineHeight: 1.5 }}>
                  {drag?.demarre && drag?.kind === 'lien'
                    ? 'Lâche ici pour retirer du plan.'
                    : 'Tout le monde est placé ✓'}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {resasTriees.map((r) => (
                  <ResaLigne
                    key={r.id}
                    resa={r}
                    tablesOccupees={tablesParResa.get(r.id) || []}
                    canEdit={canEdit}
                    enCours={drag?.demarre && drag?.kind === 'resa' && drag.resaId === r.id}
                    onPointerDownResa={onPointerDownResa}
                    onOpen={onOpenResa}
                  />
                ))}
              </div>

              {/* Récap capacité */}
              <div style={{
                marginTop: 10, paddingTop: 8,
                borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
                fontSize: 11, color: 'var(--text3)', lineHeight: 1.5,
              }}>
                {totalService} couvert{totalService > 1 ? 's' : ''} · {placesTotales} place{placesTotales > 1 ? 's' : ''} en salle
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Fantôme qui suit le doigt ── */}
      {drag?.demarre && drag.kind !== 'table' && (
        <div style={{
          position: 'fixed', left: drag.x, top: drag.y,
          transform: 'translate(-50%, -140%)',
          pointerEvents: 'none', zIndex: 2000,
          padding: '5px 10px', borderRadius: 20,
          background: 'var(--accent)', color: '#fff',
          fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)', whiteSpace: 'nowrap',
        }}>
          {drag.resa?.nom} · {drag.resa?.nb_couverts} pax
        </div>
      )}

      {/* ── Réglages d'une table ── */}
      {editTable && (
        <PlanTableForm
          table={editTable}
          salles={salles || []}
          onClose={() => setEditTable(null)}
          onSave={enregistrerTable}
          onDelete={supprimerTable}
          onDuplicate={dupliquerTable}
          nbOccupants={(occupantsParTable.get(editTable.id) || []).length}
        />
      )}

      {/* ── Gestion des salles ── */}
      {gestionSalles && canEdit && (
        <PlanSallesManager
          salles={salles || []}
          nbTablesParSalle={nbTablesParSalle}
          nbTablesReellesParSalle={nbTablesReellesParSalle}
          onClose={() => setGestionSalles(false)}
          onCreate={creerSalle}
          onRename={renommerSalle}
          onReorder={reordonnerSalles}
          onDelete={supprimerSalle}
        />
      )}
    </div>
  );
}
