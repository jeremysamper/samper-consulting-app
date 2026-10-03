import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { usePlanSalle, PLAN_W, PLAN_H, PLAN_GRID } from '../../hooks/usePlanSalle.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import BandeauNonActualise from './BandeauNonActualise.jsx';
import PlanTableForm from './PlanTableForm.jsx';
import PlanSallesManager from './PlanSallesManager.jsx';
import ServicePanneau from './ServicePanneau.jsx';
import TableServiceSheet from './TableServiceSheet.jsx';
import ReservationForm from './ReservationForm.jsx';
import { useReservations } from '../../hooks/useReservations.js';
import { zurichClock } from '../../utils/zurichTime.js';
import { serviceAffiche } from './statutsReservation.js';

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
// PLAN DE BASE ET AJUSTEMENTS DU SERVICE
// Le plan dessiné (« Modifier le plan ») est le plan de base : chaque service
// repart de lui. Pendant un service, « Ajuster la salle » permet de déplacer
// une table ou d'en rapprocher plusieurs en une tablée (lâcher une table sur
// une autre) : ces écarts sont datés (salle_tables_service, date + service)
// et ne touchent jamais au plan de base. Le service suivant n'en a aucun.
// Une tablée rapprochée se place comme une seule table : y poser une
// réservation l'assied sur toutes ses tables.
//
// Toucher une table en service ouvre TableServiceSheet : client de passage,
// réserver la table, assigner une réservation, et les clients déjà assis.
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

// Deux services : le brunch est placé avec le midi, c'est le midi du
// dimanche (voir serviceAffiche).
const SERVICES = [
  { id: 'midi',   label: 'Midi' },
  { id: 'soir',   label: 'Soir' },
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
  onPointerDownTable, onPointerDownOccupant, onEditTable, dragLienId, onOpenOccupant, onTap,
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
  // Glisser la table elle-même : dessin du plan de base, ou ajustement de la
  // salle pour ce service.
  const deplacable = (modePlan || mode === 'ajuster') && canEdit;

  let titre = `${table.nom} · ${places} place${places > 1 ? 's' : ''}`;
  if (modePlan) titre = `${table.nom} · glisser pour déplacer, double-clic pour régler`;
  else if (mode === 'ajuster') titre = `${table.nom} · glisser pour déplacer, lâcher sur une autre table pour les rapprocher`;

  return (
    <div
      data-plan-table={table.id}
      onPointerDown={deplacable ? (e) => onPointerDownTable(e, table) : undefined}
      onDoubleClick={modePlan && canEdit ? () => onEditTable(table) : undefined}
      onClick={!modePlan && onTap ? () => onTap(table) : undefined}
      title={titre}
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
        cursor: deplacable ? 'grab' : onTap ? 'pointer' : 'default',
        touchAction: deplacable ? 'none' : 'auto',
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
          // Toucher la pastille ouvre la réservation : en service, c'est depuis
          // la table qu'on cherche qui est assis là. Le reste de la table
          // ouvre la fiche de la table : le clic ne doit pas remonter.
          onClick={mode === 'service' && onOpenOccupant
            ? (e) => { e.stopPropagation(); onOpenOccupant(resa); }
            : undefined}
          style={{
            maxWidth: '100%', padding: '1px 5px', borderRadius: 20,
            // Une table occupée par des clients déjà assis se distingue de
            // celle qui les attend : c'est la question qu'on se pose en
            // regardant le plan pendant le service.
            background: resa.statut === 'arrive' ? 'var(--success-text)'
                      : resa.statut === 'parti'  ? 'var(--text3)'
                      : 'var(--accent)',
            color: '#fff',
            fontSize: 9, fontWeight: 700, lineHeight: 1.35,
            fontFamily: 'var(--font)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: mode === 'service' && canEdit ? 'grab' : mode === 'service' && onOpenOccupant ? 'pointer' : 'default',
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
  // Relecture des résas en échec côté VueJour : un seul bandeau en vue plan,
  // qui relit les deux (les résas placées viennent de VueJour).
  resasNonActualisees = false, onRelireResas,
  // Mode service (écran scindé) : le service est choisi par l'écran parent,
  // qui affiche ses onglets dans sa propre barre ; la colonne de droite
  // devient celle du service (attendus, à table, partis) avec ses actions.
  variante = 'jour', service: serviceControle = null, onStatut, onTraiter,
  // Une réservation créée depuis le plan (client de passage, « Réserver la
  // table ») : le parent relit ses réservations (et sa semaine).
  onResasModifiees,
}) {
  const isMobile = useIsMobile();
  const plan     = usePlanSalle(etablissementId);
  const reservations = useReservations(etablissementId);
  const canvasRef = useRef(null);
  const enService = variante === 'service';

  const [mode,    setMode]    = useState('service');
  const [service, setService] = useState(null);   // null = pas encore résolu
  const [salles,  setSalles]  = useState(null);
  const [salleId, setSalleId] = useState(null);   // null = pas encore résolue
  const [tables,  setTables]  = useState(null);
  const [liens,   setLiens]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [nonActualise, setNonActualise] = useState(false);
  const [drag,    setDrag]    = useState(null);
  const [editTable,  setEditTable]  = useState(null); // table en cours de réglage
  const [gestionSalles, setGestionSalles] = useState(false);
  // Écarts au plan de base pour la journée (les deux services), et vrai tant
  // que la migration 20261003_plan_salle_service n'est pas passée.
  const [ajustements,  setAjustements]  = useState([]);
  const [ajustIndispo, setAjustIndispo] = useState(false);
  const [ajuster,      setAjuster]      = useState(false);   // « Ajuster la salle »
  const [tableOuverte, setTableOuverte] = useState(null);    // id de la table touchée
  const [reserverSur,  setReserverSur]  = useState(null);    // table de « Réserver la table »
  const reservePoseeRef = useRef(false);

  // Refs miroir : les gestionnaires de pointeur sont posés une seule fois par
  // geste, ils liraient sinon un état figé au moment de l'appui.
  const dragRef   = useRef(null);
  const tablesRef = useRef(null);
  const liensRef  = useRef(null);
  tablesRef.current = tables;
  liensRef.current  = liens;
  // Heure du dernier glisser relâché : le clic que le navigateur émet parfois
  // juste après ne doit pas ouvrir la réservation qu'on vient de déplacer.
  const finGesteRef = useRef(0);

  // ── Plan à la hauteur de l'écran (mode service, hors téléphone) ─────
  // L'écran scindé ne défile pas : sur un grand écran, un plan calé sur la
  // largeur dépasserait en bas. On mesure la zone disponible et le plan prend
  // la plus grande taille qui y tient, proportions gardées.
  const ajusteHauteur = enService && !isMobile;
  const [zone, setZone] = useState(null);
  const observateurRef = useRef(null);
  const zoneRef = useCallback((el) => {
    observateurRef.current?.disconnect();
    observateurRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entree]) => {
      const { width, height } = entree.contentRect;
      setZone((z) => (z && z.w === width && z.h === height ? z : { w: width, h: height }));
    });
    ro.observe(el);
    observateurRef.current = ro;
  }, []);
  useEffect(() => () => observateurRef.current?.disconnect(), []);
  const largeurPlan = ajusteHauteur && zone && zone.h > 0
    ? Math.max(240, Math.floor(Math.min(zone.w, zone.h * (PLAN_W / PLAN_H))))
    : null;

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
  // Realtime, reprise après veille et changement de résas relancent `load` en
  // rafale : voir useOrdreLectures pour l'ordre d'application des réponses.
  const lectures = useOrdreLectures();

  const load = useCallback(async () => {
    if (!etablissementId) return;
    // Clé = établissement + résas du jour : une lecture faite pour l'ancienne
    // liste de résas ne s'affiche plus une fois la liste changée.
    const lecture = lectures.lancer(`${etablissementId}|${resaIdsKey}`);
    // Plan déjà à l'écran (relecture realtime ou de reprise) : il reste affiché
    // pendant la lecture et, si elle échoue, n'est pas remplacé par l'erreur.
    const silencieux = tablesRef.current !== null;
    const echec = (e) => {
      if (!lecture.signalerEchec()) return;
      setLoading(false);
      if (silencieux) setNonActualise(true);
      else setError(e);
    };
    if (!silencieux) {
      setLoading(true);
      setError(null);
    }
    try {
      const { data: s, error: eS } = await plan.listSalles();
      if (eS) { echec(eS); return; }
      const { data: t, error: eT } = await plan.listTables();
      if (eT) { echec(eT); return; }
      const ids = (resasRef.current || []).map((r) => r.id);
      const { data: l, error: eL } = await plan.listLiensPourResas(ids);
      if (eL) { echec(eL); return; }
      const { data: aj, error: eA, indispo } = date
        ? await plan.listAjustements(date)
        : { data: [], error: null, indispo: false };
      if (eA) { echec(eA); return; }
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
      let tablesLues = t;
      if (canEdit && orphelines.length > 0 && (s || []).length > 0) {
        const cible = s[0].id;
        const adoptees = await Promise.all(orphelines.map((x) =>
          plan.updateTable(x.id, { salle_id: cible })));
        const parId = new Map();
        adoptees.forEach((r, i) => { if (r?.data) parId.set(orphelines[i].id, r.data); });
        tablesLues = (t || []).map((x) => parId.get(x.id) || x);
      }
      if (!lecture.appliquer()) return;
      setTables(tablesLues);
      setSalles(s);
      setLiens(l);
      setAjustements(aj || []);
      setAjustIndispo(!!indispo);
      setLoading(false);
      setError(null);
      setNonActualise(false);
    } catch (e) {
      console.error('[PlanSalle] lecture du plan', e);
      echec('Erreur technique. Réessaie ou contacte le support.');
    }
    // resaIdsKey pilote le rechargement : une réservation ajoutée ou annulée
    // change la clé, une simple re-création du tableau ne la change pas.
  }, [etablissementId, date, plan, resaIdsKey, canEdit, lectures]);

  useEffect(() => { load(); }, [load]);

  // Realtime : l'hôte place à l'entrée pendant que le patron regarde le même
  // plan. Sans ça, chacun placerait sur une photo périmée du service.
  useEffect(() => {
    const bridge = dbService.getBridge();
    if (!bridge?.realtime) return undefined;
    const unsub = bridge.realtime.subscribeReload(
      ['salles', 'salle_tables', 'reservation_tables', 'salle_tables_service'],
      () => { if (!dragRef.current) load(); },
    );
    return () => { unsub && unsub(); };
  }, [load]);

  // ── Service affiché ─────────────────────────────────────────────────
  // Par défaut celui qui a le plus de couverts ce jour-là : ouvrir sur
  // « Midi » un soir de 60 couverts ferait croire à un plan vide.
  const couvertsParService = useMemo(() => {
    const m = { midi: 0, soir: 0 };
    for (const r of resas || []) {
      const s = serviceAffiche(r.service);
      m[s] = (m[s] || 0) + (r.nb_couverts || 0);
    }
    return m;
  }, [resas]);

  useEffect(() => {
    if (service !== null || serviceControle) return;
    const meilleur = SERVICES
      .map((s) => s.id)
      .reduce((a, b) => (couvertsParService[b] > couvertsParService[a] ? b : a), 'soir');
    setService(meilleur);
  }, [service, serviceControle, couvertsParService]);

  const serviceActif = serviceControle || service || 'soir';
  const editionBase  = mode === 'plan' && canEdit;

  // ── Plan effectif du service ────────────────────────────────────────
  // Plan de base + écarts du service affiché. En « Modifier le plan », on
  // dessine le plan de base : les écarts du jour n'y apparaissent pas.
  const ajustParTable = useMemo(() => {
    const m = new Map();
    if (editionBase) return m;
    for (const a of ajustements || []) {
      if (a.service === serviceActif) m.set(a.table_id, a);
    }
    return m;
  }, [ajustements, serviceActif, editionBase]);
  const ajustRef = useRef(ajustParTable);
  ajustRef.current = ajustParTable;

  const tablesVues = useMemo(() => {
    if (!tables) return tables;
    if (!ajustParTable.size) return tables;
    return tables.map((t) => {
      const a = ajustParTable.get(t.id);
      if (!a) return t;
      const deplacee = a.pos_x != null && a.pos_y != null;
      return {
        ...t,
        pos_x: deplacee ? Number(a.pos_x) : t.pos_x,
        pos_y: deplacee ? Number(a.pos_y) : t.pos_y,
        fusion: a.fusion || null,
        deplacee,
      };
    });
  }, [tables, ajustParTable]);
  const tablesVuesRef = useRef(tablesVues);
  tablesVuesRef.current = tablesVues;

  // Tables d'une même tablée rapprochée. Une table seule forme sa propre
  // tablée : tout ce qui place « sur une table » place en réalité sur sa
  // tablée, et le cas simple n'a pas de chemin à part.
  const tableeDe = useCallback((tableId) => {
    const liste = tablesVuesRef.current || [];
    const t = liste.find((x) => x.id === tableId);
    if (!t) return [];
    if (!t.fusion) return [t];
    return liste.filter((x) => x.fusion === t.fusion);
  }, []);

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
    if (!tablesVues) return [];
    if (!(salles || []).length) return tablesVues;   // pas encore de salles : tout afficher
    return tablesVues.filter((t) => salleDeTable(t) === salleId);
  }, [tablesVues, salles, salleId, salleDeTable]);

  // Contour des tablées rapprochées de la salle affichée : un cadre autour
  // des tables réunies, avec leurs numéros et leurs places cumulées.
  const tablees = useMemo(() => {
    const parCle = new Map();
    for (const t of tablesSalle) {
      if (!t.fusion) continue;
      if (!parCle.has(t.fusion)) parCle.set(t.fusion, []);
      parCle.get(t.fusion).push(t);
    }
    return [...parCle.entries()]
      .filter(([, membres]) => membres.length > 1)
      .map(([cle, membres]) => {
        const x0 = Math.min(...membres.map((t) => Number(t.pos_x)));
        const y0 = Math.min(...membres.map((t) => Number(t.pos_y)));
        const x1 = Math.max(...membres.map((t) => Number(t.pos_x) + Number(t.largeur)));
        const y1 = Math.max(...membres.map((t) => Number(t.pos_y) + Number(t.hauteur)));
        const noms = membres.map((t) => t.nom)
          .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        const places = membres.reduce((s, t) => s + (t.actif === false ? 0 : (t.nb_places || 0)), 0);
        return { cle, x0, y0, x1, y1, noms, places };
      });
  }, [tablesSalle]);

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

  const resasService  = useMemo(
    () => (resas || [])
      .filter((r) => serviceAffiche(r.service) === serviceActif)
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

  // Une tablée partie ou un no-show n'est plus « à placer » : les compter
  // annonçait du travail qui n'existe pas.
  const nbAPlacer = useMemo(
    () => resasService.filter((r) => r.statut !== 'parti' && r.statut !== 'no_show'
      && !(tablesParResa.get(r.id) || []).length).length,
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

  // Ajuster la salle : on traîne la tablée entière (une table seule, ou
  // toutes les tables déjà rapprochées), positions de départ figées à
  // l'appui. Le dépôt écrit l'écart du service, jamais le plan de base.
  function onPointerDownTableService(e, table) {
    const p = versCanevas(e.clientX, e.clientY);
    if (!p) return;
    const membres = tableeDe(table.id).map((t) => ({
      id: t.id, x0: Number(t.pos_x), y0: Number(t.pos_y),
      w: Number(t.largeur), h: Number(t.hauteur),
    }));
    if (!membres.length) return;
    demarrerGeste(e, { kind: 'tableService', tableId: table.id, membres, grabX: p.x, grabY: p.y, dx: 0, dy: 0 });
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

      if (d.kind === 'tableService') {
        const p = versCanevas(e.clientX, e.clientY);
        if (!p) return;
        const m = d.membres;
        const minX = Math.min(...m.map((t) => t.x0));
        const minY = Math.min(...m.map((t) => t.y0));
        const maxX = Math.max(...m.map((t) => t.x0 + t.w));
        const maxY = Math.max(...m.map((t) => t.y0 + t.h));
        // Décalage commun à toute la tablée, borné pour qu'elle reste
        // entière dans le canevas.
        const dx = clamp(snap(p.x - d.grabX), -minX, PLAN_W - maxX);
        const dy = clamp(snap(p.y - d.grabY), -minY, PLAN_H - maxY);
        // Table d'une AUTRE tablée sous le doigt : lâcher là rapproche les
        // deux. Les tables traînées sont elles-mêmes sous le doigt, d'où
        // elementsFromPoint (toute la pile) et non elementFromPoint.
        const ids = new Set(m.map((t) => t.id));
        let cible = null;
        for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
          const tEl = el.closest?.('[data-plan-table]');
          const id = tEl?.getAttribute('data-plan-table');
          if (id && !ids.has(id)) { cible = id; break; }
        }
        majDrag({ x: e.clientX, y: e.clientY, dx, dy, over: cible ? { tableId: cible } : null });
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
      finGesteRef.current = Date.now();
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

    if (d.kind === 'tableService') {
      if (d.over?.tableId) { await rapprocher(d.membres, d.over.tableId); return; }
      if (!d.dx && !d.dy) return;
      await ecrireAjustements(d.membres.map((m) => ({
        table_id: m.id,
        pos_x: m.x0 + d.dx,
        pos_y: m.y0 + d.dy,
        fusion: ajustRef.current.get(m.id)?.fusion ?? null,
      })));
      return;
    }

    const cibleId = d.over?.tableId || null;
    const surListe = !!d.over?.liste;

    // ── Retirer du plan : la réservation quitte toute la tablée d'où on l'a
    //    tirée (une tablée rapprochée se libère d'un seul geste). ──
    if (d.kind === 'lien' && surListe) {
      await liberer(d.resa, d.fromTableId);
      return;
    }

    if (!cibleId) return;                              // lâché dans le vide

    const tablee = tableeDe(cibleId);
    if (d.kind === 'lien' && tablee.some((t) => t.id === d.fromTableId)) return;  // même tablée
    if (!tablee.length) return;

    if (d.kind === 'lien') {
      // Déplacement : on pose d'abord, on retire ensuite. Dans l'autre ordre,
      // un échec de la pose laisserait la réservation nulle part.
      const posee = await poserSurTablee(d.resa, cibleId, { silencieux: true });
      if (!posee) return;
      const depart = new Set(tableeDe(d.fromTableId).map((t) => t.id));
      const anciens = (liensRef.current || [])
        .filter((l) => l.reservation_id === d.resaId && depart.has(l.table_id));
      if (!(await retirerLiens(anciens))) return;
      notify(`${d.resa.nom} → ${nomTablee(cibleId)}`, 'success');
      return;
    }

    await poserSurTablee(d.resa, cibleId);
  }

  // ── Placement sur une tablée ────────────────────────────────────────
  // « Table 4 » ou « Tables 3 + 4 » : le nom tel qu'on le dit au passe.
  function nomTablee(tableId) {
    const noms = tableeDe(tableId).map((t) => t.nom)
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    return noms.length > 1 ? `tables ${noms.join(' + ')}` : `table ${noms[0] ?? ''}`;
  }

  // Assied une réservation sur toutes les tables actives de la tablée.
  // Rend vrai si elle y est (déjà placée compris).
  async function poserSurTablee(resa, tableId, { silencieux = false } = {}) {
    const tablee = tableeDe(tableId);
    const actives = tablee.filter((t) => t.actif !== false);
    if (!actives.length) {
      notify(`${tablee[0]?.nom ?? 'Cette table'} est inactive : réactive-la dans « Modifier le plan ».`, 'warning');
      return false;
    }
    const nouveaux = [];
    for (const t of actives) {
      const { data: lien, error: e } = await plan.assigner(resa.id, t.id);
      if (e) {
        if (nouveaux.length) setLiens((prev) => [...(prev || []), ...nouveaux]);
        notify(e, 'error');
        return false;
      }
      if (lien) nouveaux.push(lien);
    }
    if (nouveaux.length) setLiens((prev) => [...(prev || []), ...nouveaux]);
    if (!silencieux && nouveaux.length) {
      notify(`${resa.nom} · ${resa.nb_couverts} pax → ${nomTablee(tableId)}`, 'success');
    }
    return true;
  }

  async function retirerLiens(aRetirer) {
    if (!aRetirer.length) return true;
    const ids = new Set(aRetirer.map((l) => l.id));
    setLiens((prev) => (prev || []).filter((l) => !ids.has(l.id)));
    for (const l of aRetirer) {
      const { error: e } = await plan.retirer(l.id);
      if (e) { notify(e, 'error'); load(); return false; }
    }
    return true;
  }

  // Libère la tablée de cette réservation (elle garde ses autres tables).
  async function liberer(resa, tableId) {
    const ici = new Set(tableeDe(tableId).map((t) => t.id));
    const ok = await retirerLiens((liensRef.current || [])
      .filter((l) => l.reservation_id === resa.id && ici.has(l.table_id)));
    if (ok) notify(`${resa.nom} retiré du plan`, 'info');
  }

  // « Assigner la table » : la réservation vient ici. Déjà placée ailleurs,
  // elle est déplacée (pas dédoublée) ; agrandir une tablée sur une seconde
  // table se fait en rapprochant les tables, ou en glissant depuis la liste.
  async function assignerIci(resa, tableId) {
    const ici = new Set(tableeDe(tableId).map((t) => t.id));
    const ailleurs = (liensRef.current || [])
      .filter((l) => l.reservation_id === resa.id && !ici.has(l.table_id));
    const posee = await poserSurTablee(resa, tableId, { silencieux: true });
    if (!posee) return;
    if (!(await retirerLiens(ailleurs))) return;
    notify(`${resa.nom} · ${resa.nb_couverts} pax → ${nomTablee(tableId)}`, 'success');
  }

  const relireResas = () => (onResasModifiees || onRelireResas)?.();

  // Client de passage : créé « arrivé », à l'heure qu'il est, et assis.
  async function clientDePassage(tableId, nbCouverts) {
    const nom = `Passage · ${nomTablee(tableId)}`;
    const { data: resa, error: e } = await reservations.create({
      date_service:  date,
      service:       serviceActif,
      heure_arrivee: zurichClock(),
      nb_couverts:   nbCouverts,
      nom:           nom.charAt(0).toUpperCase() + nom.slice(1),
      est_groupe:    false,
      statut:        'arrive',
    });
    if (e || !resa) { notify(e || 'Client de passage non enregistré.', 'error'); return; }
    await poserSurTablee(resa, tableId);
    relireResas();
  }

  // ── Ajustements du service ──────────────────────────────────────────
  // Écriture optimiste : la table suit le doigt, la base suit. En cas
  // d'échec on relit plutôt que de laisser l'écran mentir.
  function majAjustementsLocaux(lignes, supprimes = []) {
    const touchees = new Set([...supprimes, ...lignes.map((l) => l.table_id)]);
    setAjustements((prev) => [
      ...(prev || []).filter((a) => !(a.service === serviceActif && touchees.has(a.table_id))),
      ...lignes.map((l) => ({ ...l, service: serviceActif, date_service: date })),
    ]);
  }

  async function ecrireAjustements(lignes, supprimes = []) {
    majAjustementsLocaux(lignes, supprimes);
    if (supprimes.length) {
      const { error: e } = await plan.effacerAjustements(date, serviceActif, supprimes);
      if (e) { notify(e, 'error'); load(); return false; }
    }
    if (lignes.length) {
      const { error: e } = await plan.enregistrerAjustements(date, serviceActif, lignes);
      if (e) { notify(e, 'error'); load(); return false; }
    }
    return true;
  }

  // Lâcher une tablée sur une autre table : elle vient se coller à côté
  // (à droite, sinon à gauche, dessous, dessus) et les deux ne font plus
  // qu'une. Les clients déjà assis sur l'une s'étendent à toute la tablée.
  async function rapprocher(membres, cibleId) {
    const cible = tableeDe(cibleId);
    if (!cible.length) return;
    const cle = cible[0].fusion || cibleId;
    const bx0 = Math.min(...cible.map((t) => Number(t.pos_x)));
    const by0 = Math.min(...cible.map((t) => Number(t.pos_y)));
    const bx1 = Math.max(...cible.map((t) => Number(t.pos_x) + Number(t.largeur)));
    const by1 = Math.max(...cible.map((t) => Number(t.pos_y) + Number(t.hauteur)));
    const mx0 = Math.min(...membres.map((t) => t.x0));
    const my0 = Math.min(...membres.map((t) => t.y0));
    const mw  = Math.max(...membres.map((t) => t.x0 + t.w)) - mx0;
    const mh  = Math.max(...membres.map((t) => t.y0 + t.h)) - my0;
    // Premier côté qui tient dans le plan SANS recouvrir une autre table de
    // la salle ; à défaut, le premier qui tient dans le plan. Coller à
    // droite par principe posait la table sur sa voisine.
    const idsBouges = new Set([...membres.map((m) => m.id), ...cible.map((t) => t.id)]);
    const salleCible = salleDeTable(cible[0]);
    const obstacles = (tablesVuesRef.current || []).filter((t) =>
      !idsBouges.has(t.id) && salleDeTable(t) === salleCible);
    const libre = (x, y) => obstacles.every((t) => {
      const ox = Number(t.pos_x); const oy = Number(t.pos_y);
      return x + mw <= ox || x >= ox + Number(t.largeur) || y + mh <= oy || y >= oy + Number(t.hauteur);
    });
    const candidats = [
      [bx1, by0], [bx0, by1], [bx0 - mw, by0], [bx0, by0 - mh],
    ].filter(([x, y]) => x >= 0 && y >= 0 && x + mw <= PLAN_W && y + mh <= PLAN_H);
    const [cx, cy] = candidats.find(([x, y]) => libre(x, y)) || candidats[0] || [bx1, by0];
    const nx = clamp(cx, 0, PLAN_W - mw);
    const ny = clamp(cy, 0, PLAN_H - mh);
    const ddx = nx - mx0;
    const ddy = ny - my0;

    const lignes = [
      ...membres.map((m) => ({ table_id: m.id, pos_x: m.x0 + ddx, pos_y: m.y0 + ddy, fusion: cle })),
      ...cible.map((t) => {
        const a = ajustRef.current.get(t.id);
        return { table_id: t.id, pos_x: a?.pos_x ?? null, pos_y: a?.pos_y ?? null, fusion: cle };
      }),
    ];
    if (!(await ecrireAjustements(lignes))) return;

    // Clients déjà assis : ils occupent maintenant toute la tablée.
    const toutes = (tablesRef.current || []).filter((t) => lignes.some((l) => l.table_id === t.id));
    const actives = toutes.filter((t) => t.actif !== false).map((t) => t.id);
    const idsService = new Set(resasService.map((r) => r.id));
    const occupees = new Map();
    for (const l of liensRef.current || []) {
      if (!idsService.has(l.reservation_id) || !toutes.some((t) => t.id === l.table_id)) continue;
      if (!occupees.has(l.reservation_id)) occupees.set(l.reservation_id, new Set());
      occupees.get(l.reservation_id).add(l.table_id);
    }
    const nouveaux = [];
    for (const [resaId, deja] of occupees) {
      for (const id of actives) {
        if (deja.has(id)) continue;
        const { data: lien, error: e } = await plan.assigner(resaId, id);
        if (e) { notify(e, 'error'); break; }
        if (lien) nouveaux.push(lien);
      }
    }
    if (nouveaux.length) setLiens((prev) => [...(prev || []), ...nouveaux]);

    const noms = toutes.map((t) => t.nom)
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const places = toutes.reduce((s, t) => s + (t.actif === false ? 0 : (t.nb_places || 0)), 0);
    notify(`Tables ${noms.join(' + ')} rapprochées · ${places} places`, 'success');
  }

  // Sortir une table de sa tablée : elle retourne seule à sa place de base.
  // Un client assis sur la tablée reste sur les tables qui restent.
  async function separer(tableId) {
    const tablee = tableeDe(tableId);
    const restants = tablee.filter((t) => t.id !== tableId);
    const supprimes = [tableId];
    const lignes = [];
    if (restants.length === 1) {
      const r = restants[0];
      const a = ajustRef.current.get(r.id);
      if (a?.pos_x != null && a?.pos_y != null) lignes.push({ table_id: r.id, pos_x: a.pos_x, pos_y: a.pos_y, fusion: null });
      else supprimes.push(r.id);
    }
    if (!(await ecrireAjustements(lignes, supprimes))) return;
    const idsRestants = new Set(restants.map((t) => t.id));
    const resasRestantes = new Set((liensRef.current || [])
      .filter((l) => idsRestants.has(l.table_id)).map((l) => l.reservation_id));
    await retirerLiens((liensRef.current || [])
      .filter((l) => l.table_id === tableId && resasRestantes.has(l.reservation_id)));
    notify(`Table ${tablee.find((t) => t.id === tableId)?.nom ?? ''} séparée`, 'info');
  }

  async function remettreEnPlace(tableId) {
    if (await ecrireAjustements([], [tableId])) {
      notify(`Table ${nomTable(tableId)} remise à sa place`, 'info');
    }
  }

  async function revenirAuPlanDeBase() {
    if (!window.confirm('Remettre toutes les tables de ce service à leur place habituelle ? Les clients placés restent sur leurs tables.')) return;
    const ids = [...ajustParTable.keys()];
    setAjustements((prev) => (prev || []).filter((a) => a.service !== serviceActif));
    const { error: e } = await plan.effacerAjustements(date, serviceActif);
    if (e) { notify(e, 'error'); load(); return; }
    if (ids.length) notify('Plan de base rétabli pour ce service', 'info');
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
    // Création lente : si l'on a ouvert les réglages d'une autre table en
    // attendant, on ne les lui prend pas.
    setEditTable((cur) => cur ?? data);
  }

  // Nom d'une table pour les messages d'échec : le formulaire de réglage a pu
  // être fermé pendant l'écriture, le toast doit dire de quelle table il parle.
  const nomTable = (id) => (tablesRef.current || []).find((t) => t.id === id)?.nom ?? '';

  // Duplication : même gabarit, numéro suivant, décalée pour rester visible.
  async function dupliquerTable(modele) {
    const decale = (v, max) => Math.min(v + 40, max);
    const { data, error: e } = await plan.createTable({
      ...modele,
      nom: prochainNumero(),
      pos_x: decale(Number(modele.pos_x) || 0, PLAN_W - Number(modele.largeur || 90)),
      pos_y: decale(Number(modele.pos_y) || 0, PLAN_H - Number(modele.hauteur || 90)),
    });
    if (e) { notify(`Duplication de la table ${modele.nom} impossible : ${e}`, 'error'); return false; }
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
    if (e) { notify(`Réglages de la table ${nomTable(id)} non enregistrés : ${e}`, 'error'); return false; }
    setTables((prev) => (prev || []).map((t) => (t.id === id ? data : t)));
    return true;
  }

  async function supprimerTable(id) {
    const { error: e } = await plan.deleteTable(id);
    if (e) { notify(`Table ${nomTable(id)} non supprimée : ${e}`, 'error'); return false; }
    setTables((prev) => (prev || []).filter((t) => t.id !== id));
    setLiens((prev) => (prev || []).filter((l) => l.table_id !== id));
    // Réglages rouverts entre-temps sur CETTE table (formulaire fermé pendant
    // la suppression) : ils portent sur une table qui n'existe plus.
    setEditTable((cur) => (cur?.id === id ? null : cur));
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
  // « Ajuster la salle » : même dérivation du droit, et seulement une fois
  // la migration des ajustements passée.
  const ajusterActif = ajuster && canEdit && !modePlan && !ajustIndispo;
  const modeTable    = modePlan ? 'plan' : ajusterActif ? 'ajuster' : 'service';

  // Tablée survolée pendant un glisser : toutes ses tables s'allument, c'est
  // là que la réservation (ou la table traînée) va atterrir.
  const cibleIds = drag?.demarre && drag?.over?.tableId
    ? new Set(tableeDe(drag.over.tableId).map((t) => t.id))
    : null;
  // Tablée traînée en ajustement : elle suit le doigt avant d'être écrite.
  const enDeplacement = drag?.demarre && drag.kind === 'tableService'
    ? new Map(drag.membres.map((m) => [m.id, m]))
    : null;
  const tablesDessinees = enDeplacement
    ? tablesSalle.map((t) => {
      const m = enDeplacement.get(t.id);
      return m ? { ...t, pos_x: m.x0 + drag.dx, pos_y: m.y0 + drag.dy } : t;
    })
    : tablesSalle;

  // Fiche de la table touchée : la tablée entière, ses places, ses clients.
  const ficheTablee = tableOuverte ? tableeDe(tableOuverte) : [];
  const ficheOccupants = (() => {
    if (!ficheTablee.length) return [];
    const ici = new Set(ficheTablee.map((t) => t.id));
    const ids = new Set((liens || []).filter((l) => ici.has(l.table_id)).map((l) => l.reservation_id));
    return resasService.filter((r) => ids.has(r.id));
  })();
  const ficheNoms = ficheTablee.map((t) => t.nom)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  // Même règle que partout ailleurs : un no-show n'est pas un couvert.
  const totalService = resasService.filter((r) => r.statut !== 'no_show')
    .reduce((s, r) => s + (r.nb_couverts || 0), 0);
  // Places de TOUTES les salles : la question de l'hôte est « est-ce que le
  // service rentre dans la maison », pas « dans cet onglet ».
  const placesTotales = (tables || []).filter((t) => t.actif !== false)
    .reduce((s, t) => s + (t.nb_places || 0), 0);

  // Plan pas encore dessiné (ou salle vide). En mode service, la colonne des
  // réservations reste affichée à côté : on peut suivre le service sans plan.
  const planVide = (
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
  );

  // En mode service, les onglets de service sont dans la barre de l'écran
  // parent : la barre d'ici ne sert plus qu'au bouton « Modifier le plan ».
  const barre = !serviceControle || canEdit;

  return (
    <div style={ajusteHauteur
      ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }
      : undefined}>
      {/* ── Relecture en échec (plan ou résas) : l'affichage reste en place ── */}
      {(nonActualise || resasNonActualisees) && (
        <BandeauNonActualise onRetry={() => Promise.all([onRelireResas?.(), load()])} />
      )}

      {/* ── Barre : service + bascule mode plan ── */}
      {barre && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        flexWrap: 'wrap', marginBottom: 10,
      }}>
        {ajusterActif && (
          <div style={{ flex: '1 1 100%', minWidth: 0, fontSize: 12, color: 'var(--text2)', order: 2 }}>
            Ce service seulement : glisse une table pour la déplacer, lâche-la sur une autre pour les rapprocher, touche-la pour la séparer.
          </div>
        )}
        {!modePlan && serviceControle && <div style={{ flex: 1 }} />}
        {!modePlan && !serviceControle && (
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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {!modePlan && !ajustIndispo && ajusterActif && ajustParTable.size > 0 && (
              <button type="button" onClick={revenirAuPlanDeBase} style={{
                minHeight: 40, padding: '8px 14px', borderRadius: 8,
                borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                background: 'var(--surface)', color: 'var(--text)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
                Plan de base
              </button>
            )}
            {!modePlan && !ajustIndispo && (
              <button
                type="button"
                onClick={() => setAjuster((v) => !v)}
                aria-pressed={ajusterActif}
                style={{
                  minHeight: 40, padding: '8px 14px', borderRadius: 8,
                  borderWidth: 1, borderStyle: 'solid',
                  borderColor: ajusterActif ? 'var(--accent)' : 'var(--border)',
                  background: ajusterActif ? 'var(--accent)' : 'var(--surface)',
                  color: ajusterActif ? 'var(--on-accent)' : 'var(--text)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {ajusterActif ? 'Terminer l’ajustement' : 'Ajuster la salle'}
              </button>
            )}
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
              onClick={() => { setAjuster(false); setMode(modePlan ? 'service' : 'plan'); }}
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
      )}

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
      {aucuneTable && !enService && planVide}

      {/* ── Canevas + liste ── */}
      {(!aucuneTable || enService) && (
        <div style={{
          display: 'flex', gap: 12,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: ajusteHauteur ? 'stretch' : 'flex-start',
          ...(ajusteHauteur ? { flex: 1, minHeight: 0 } : {}),
        }}>
          {/* Canevas. Sur téléphone il garde une largeur plancher et défile
              DANS son cadre : à 335 px de large, une table de deux couverts
              tomberait à 31 px, illisible et increvable au doigt. La page,
              elle, ne pane jamais — le débordement reste enfermé ici. */}
          {aucuneTable ? (
            <div style={{ flex: 1, minWidth: 0, width: '100%' }}>{planVide}</div>
          ) : (
          <div
            ref={ajusteHauteur ? zoneRef : undefined}
            style={{
              flex: 1, minWidth: 0, width: '100%',
              overflowX: 'auto', WebkitOverflowScrolling: 'touch',
              borderRadius: 12,
              ...(ajusteHauteur ? { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: 0 } : {}),
            }}
          >
          <div
            ref={canvasRef}
            style={{
              position: 'relative',
              width: largeurPlan ? largeurPlan : '100%',
              flexShrink: 0,
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
            {/* Tablées rapprochées pour ce service : un cadre autour des
                tables réunies, numéros et places cumulées. */}
            {tablees
              .filter((g) => !(enDeplacement && tablesSalle.some((t) => t.fusion === g.cle && enDeplacement.has(t.id))))
              .map((g) => (
                <div
                  key={g.cle}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left:   `${((g.x0 - 6) / PLAN_W) * 100}%`,
                    top:    `${((g.y0 - 6) / PLAN_H) * 100}%`,
                    width:  `${((g.x1 - g.x0 + 12) / PLAN_W) * 100}%`,
                    height: `${((g.y1 - g.y0 + 12) / PLAN_H) * 100}%`,
                    borderWidth: 2, borderStyle: 'dashed', borderColor: 'var(--accent)',
                    borderRadius: 12, pointerEvents: 'none', boxSizing: 'border-box',
                  }}
                >
                  {/* Étiquette au-dessus du cadre, ou dessous quand la
                      tablée touche le haut du plan (sinon coupée). */}
                  <span style={{
                    position: 'absolute', left: 6,
                    ...(g.y0 < 24 ? { bottom: -9 } : { top: -9 }),
                    padding: '0 6px', borderRadius: 10,
                    background: 'var(--accent)', color: 'var(--on-accent)',
                    fontSize: 9, fontWeight: 700, lineHeight: '16px', whiteSpace: 'nowrap',
                    fontFamily: 'var(--font)',
                  }}>
                    {g.noms.join(' + ')} · {g.places} pl.
                  </span>
                </div>
              ))}
            {tablesDessinees.map((t) => (
              <TableShape
                key={t.id}
                table={t}
                occupants={occupantsParTable.get(t.id) || []}
                mode={modeTable}
                canEdit={canEdit}
                estCible={!!cibleIds?.has(t.id)}
                dragLienId={drag?.demarre && drag?.kind === 'lien' ? drag.lienId : null}
                onPointerDownTable={ajusterActif ? onPointerDownTableService : onPointerDownTable}
                onPointerDownOccupant={onPointerDownOccupant}
                onEditTable={setEditTable}
                onTap={(table) => {
                  if (Date.now() - finGesteRef.current < 400) return;
                  setTableOuverte(table.id);
                }}
                onOpenOccupant={onOpenResa ? (resa) => {
                  if (Date.now() - finGesteRef.current < 400) return;
                  onOpenResa(resa);
                } : undefined}
              />
            ))}
          </div>
          </div>
          )}

          {/* Réservations du service - aussi zone de dépôt pour retirer du plan */}
          {!modePlan && (
            <div
              data-plan-liste="1"
              style={{
                width: isMobile ? '100%' : enService ? 'clamp(300px, 36%, 440px)' : 250,
                flexShrink: 0,
                borderWidth: 1, borderStyle: 'solid',
                borderColor: drag?.demarre && drag?.kind === 'lien' && drag?.over?.liste
                  ? 'var(--accent)' : 'var(--border)',
                borderRadius: 12, background: enService ? 'var(--bg)' : 'var(--surface)',
                padding: 10, boxSizing: 'border-box',
                overflowY: 'auto',
                ...(ajusteHauteur
                  ? { height: '100%', minHeight: 0 }
                  : { maxHeight: enService ? 'none' : isMobile ? 260 : 520 }),
              }}
            >
              {enService ? (
                <ServicePanneau
                  resas={resasService}
                  date={date}
                  tablesParResa={tablesParResa}
                  canEdit={canEdit}
                  dragResaId={drag?.demarre && drag?.kind === 'resa' ? drag.resaId : null}
                  retraitPossible={!!(drag?.demarre && drag?.kind === 'lien')}
                  onPointerDownResa={onPointerDownResa}
                  onOpen={onOpenResa}
                  onStatut={onStatut}
                  onTraiter={onTraiter}
                />
              ) : (
              <>
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
              </>
              )}

              {/* Récap capacité */}
              <div style={{
                marginTop: 10, paddingTop: 8,
                borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
                fontSize: 11, color: 'var(--text3)', lineHeight: 1.5,
              }}>
                {totalService} couvert{totalService > 1 ? 's' : ''} · {placesTotales} place{placesTotales > 1 ? 's' : ''} en salle
                {enService && nbAPlacer > 0 ? ` · ${nbAPlacer} à placer` : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Fantôme qui suit le doigt ── */}
      {drag?.demarre && (drag.kind === 'resa' || drag.kind === 'lien') && (
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

      {/* ── Réglages d'une table ──
          key : une instance par table ouverte. Sans elle, passer d'une table
          à l'autre réutiliserait le formulaire (champs et écriture en cours
          de la précédente). */}
      {editTable && (
        <PlanTableForm
          key={editTable.id}
          table={editTable}
          salles={salles || []}
          onClose={() => setEditTable(null)}
          onSave={enregistrerTable}
          onDelete={supprimerTable}
          onDuplicate={dupliquerTable}
          nbOccupants={(occupantsParTable.get(editTable.id) || []).length}
        />
      )}

      {/* ── Table touchée : passage, réserver, assigner, clients assis ──
          key : une fiche par table, l'étape en cours ne passe pas à la
          suivante. */}
      {tableOuverte && ficheTablee.length > 0 && !modePlan && (
        <TableServiceSheet
          key={tableOuverte}
          titre={ficheNoms.length > 1 ? `Tables ${ficheNoms.join(' + ')}` : `Table ${ficheNoms[0]}`}
          places={ficheTablee.reduce((s, t) => s + (t.actif === false ? 0 : (t.nb_places || 0)), 0)}
          occupants={ficheOccupants}
          resasService={resasService}
          tablesParResa={tablesParResa}
          canEdit={canEdit}
          ajuster={ajusterActif}
          groupe={ficheTablee.length > 1}
          deplacee={!!ficheTablee[0]?.deplacee}
          onClose={() => setTableOuverte(null)}
          onPassage={(n) => clientDePassage(tableOuverte, n)}
          onReserver={() => { reservePoseeRef.current = false; setReserverSur(tableOuverte); }}
          onAssigner={(resa) => assignerIci(resa, tableOuverte)}
          onOpenResa={onOpenResa}
          onStatut={onStatut}
          onLiberer={(resa) => liberer(resa, tableOuverte)}
          onSeparer={() => separer(tableOuverte)}
          onRemettre={() => remettreEnPlace(tableOuverte)}
        />
      )}

      {/* ── « Réserver la table » : le formulaire habituel, pré-rempli sur le
             jour et le service ; la première réservation enregistrée est
             posée sur la table. ── */}
      {reserverSur && canEdit && (
        <ReservationForm
          etablissementId={etablissementId}
          initialDate={date}
          initialService={serviceActif}
          onClose={() => setReserverSur(null)}
          onSaved={async (resa) => {
            const tableId = reserverSur;
            // « Enregistrer et continuer » enchaîne d'autres réservations :
            // seule la première prend la table.
            if (resa && !reservePoseeRef.current
                && resa.date_service === date && serviceAffiche(resa.service) === serviceActif) {
              reservePoseeRef.current = true;
              await poserSurTablee(resa, tableId);
            }
            relireResas();
          }}
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
