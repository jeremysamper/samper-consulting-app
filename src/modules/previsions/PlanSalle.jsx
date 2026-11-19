import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Ellipsis, LayoutGrid, Maximize2, Minimize2, Minus, PanelRightClose, PanelRightOpen, Plus, Undo2, X } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { BoutonActions, Fenetre, st as stF } from '../../components/ui/Fenetres.jsx';
import { readJson, writeJson } from '../../utils/storage.js';
import { useVuePlan } from '../salle/useVuePlan.js';
import { useLargeur } from '../caisse/mesures.js';
import { aligner } from '../salle/planVue.js';
import { bornesCurseur, enRetard, etatTablee, hhmm, minutesDe, planifier, proposer, tableesLibres, PAS_CURSEUR } from '../salle/planTemps.js';
import PlanTable, { COULEUR_ETAT } from './PlanTable.jsx';
import PlanListe from './PlanListe.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { ouvrirCompte } from '../../services/navigationService.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';
import { demanderDessin } from './planSalleDessin.js';
import { usePlanSalle, PLAN_W, PLAN_H, PLAN_GRID, tailleParDefaut } from '../../hooks/usePlanSalle.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import BandeauNonActualise from './BandeauNonActualise.jsx';
import PlanTableForm from './PlanTableForm.jsx';
import PlanSallesManager from './PlanSallesManager.jsx';
import PlanElementForm from './PlanElementForm.jsx';
import {
  ELEMENTS, ELEMENT_PAR_TYPE, ElementDecor, GrillePlan, estObstacle,
  redimensionner, apresQuartDeTour as quartDeTourElement,
} from './planDecor.jsx';
import TableServiceSheet from './TableServiceSheet.jsx';
import ReservationForm from './ReservationForm.jsx';
import { useReservations } from '../../hooks/useReservations.js';
import { zurichClock, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
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
// Depuis le 12.11.2026, le mode « plan » ne s'ouvre plus dans le service : le
// plan de base (salles, tables, décor, places de bar, rotation) se dessine
// dans la page des réglages, section 'plan_salle' (SectionPlanSalle.jsx), où
// ce composant est monté en variante 'dessin'. « Dessiner la salle » y mène,
// par-dessus le service et sur la même salle ; « J'ai fini » ramène au
// service, resté sur son jour, son service et sa salle. Les écarts datés
// (« Déplacer des tables ») restent ici, dans le service.
//
// PLAN DE BASE ET AJUSTEMENTS DU SERVICE
// Le plan dessiné (« Dessiner la salle », pour tous les services) est le plan
// de base : chaque service repart de lui. Pendant un service, « Déplacer des
// tables » (ce service seulement) permet de déplacer une table ou d'en
// rapprocher plusieurs en une tablée (lâcher une table sur une autre) : ces
// écarts sont datés (salle_tables_service, date + service) et ne touchent
// jamais au plan de base. Le service suivant n'en a aucun. Les deux boutons
// disent leur portée sous leur libellé, un bandeau rappelle le mode en cours,
// et « Dessiner la salle » n'est pas proposé pendant un déplacement : les
// deux se confondaient.
// Une tablée rapprochée se place comme une seule table : y poser une
// réservation l'assied sur toutes ses tables.
//
// Toucher une table en service ouvre TableServiceSheet : client de passage,
// réserver la table, assigner une réservation, et les clients déjà assis.
//
// DÉCOR ET PLACES DE BAR
// Murs, baies, porte, bar, accueil... (salle_elements, voir planDecor.jsx) se
// dessinent dans « Dessiner la salle » et restent inertes partout ailleurs,
// sous les tables. Une place de bar est une table de forme 'tabouret' :
// petite, numérotée à part (B1, B2...), placée comme une table, jamais
// rapprochée en tablée. Le quadrillage n'apparaît que dans « Dessiner la
// salle » : en service, il brouillait la lecture de la salle.
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

const parNumero = (a, b) => String(a.nom).localeCompare(String(b.nom), undefined, { numeric: true });

// Place de bar : une table dessinée petite, numérotée à part.
const estTabouret = (t) => t?.forme === 'tabouret';

// Pas entre deux places de bar posées à la suite (tabouret de 50 + 10).
const PAS_TABOURET = 60;

// Le mode en cours, dit en clair au-dessus du plan.
const bandeauMode = {
  flex: '1 1 100%', minWidth: 0, padding: '8px 12px', borderRadius: 'var(--r)',
  background: 'var(--info-bg-soft)', color: 'var(--info-text)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--info-bd)',
  fontSize: 'var(--t1)', lineHeight: 1.45,
};

// Table dont la tablée porte le numéro. La clé de fusion EST l'id de cette
// table : choisir le numéro d'une tablée, c'est réécrire sa clé. Si la table
// désignée a été séparée entre-temps, la plus petite des restantes prend le
// relais.
function principaleDe(tablee) {
  if (!tablee.length) return null;
  return tablee.find((t) => t.id === tablee[0].fusion) || [...tablee].sort(parNumero)[0];
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Contour d'un groupe de tables (canevas), et son centre.
function cadreDe(membres) {
  const x0 = Math.min(...membres.map((t) => Number(t.pos_x)));
  const y0 = Math.min(...membres.map((t) => Number(t.pos_y)));
  const x1 = Math.max(...membres.map((t) => Number(t.pos_x) + Number(t.largeur)));
  const y1 = Math.max(...membres.map((t) => Number(t.pos_y) + Number(t.hauteur)));
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// Une tablée rapprochée se DESSINE comme un seul rectangle, quelles que
// soient les formes réunies : un rond collé à un carré ne ressemble pas à des
// tables poussées l'une contre l'autre. Le contour de la tablée est découpé
// en tranches, une par table, dans l'ordre où elles se suivent (en ligne si
// elles se suivent de gauche à droite sans se chevaucher, sinon en colonne).
// Seul le dessin change : les positions et tailles en base restent celles
// des tables, et une table séparée retrouve sa forme.
function trancherTablee(membres) {
  const c = cadreDe(membres);
  const enLigne = (() => {
    const triX = [...membres].sort((a, b) => Number(a.pos_x) - Number(b.pos_x));
    if (triX.every((t, i) => i === 0
      || Number(t.pos_x) >= Number(triX[i - 1].pos_x) + Number(triX[i - 1].largeur) - 1)) return true;
    const triY = [...membres].sort((a, b) => Number(a.pos_y) - Number(b.pos_y));
    if (triY.every((t, i) => i === 0
      || Number(t.pos_y) >= Number(triY[i - 1].pos_y) + Number(triY[i - 1].hauteur) - 1)) return false;
    return (c.x1 - c.x0) >= (c.y1 - c.y0);
  })();
  const deb = enLigne ? 'pos_x' : 'pos_y';
  const lon = enLigne ? 'largeur' : 'hauteur';
  const centre = (t) => Number(t[deb]) + Number(t[lon]) / 2;
  const tri = [...membres].sort((a, b) => centre(a) - centre(b));
  // Limite entre deux voisines : au milieu de l'espace qui les sépare, ou de
  // leurs centres si elles se chevauchent.
  const bornes = [enLigne ? c.x0 : c.y0];
  for (let i = 0; i < tri.length - 1; i++) {
    const finA = Number(tri[i][deb]) + Number(tri[i][lon]);
    const debB = Number(tri[i + 1][deb]);
    bornes.push(debB >= finA ? (finA + debB) / 2 : (centre(tri[i]) + centre(tri[i + 1])) / 2);
  }
  bornes.push(enLigne ? c.x1 : c.y1);
  const m = new Map();
  tri.forEach((t, i) => {
    m.set(t.id, enLigne
      ? { pos_x: bornes[i], pos_y: c.y0, largeur: bornes[i + 1] - bornes[i], hauteur: c.y1 - c.y0 }
      : { pos_x: c.x0, pos_y: bornes[i], largeur: c.x1 - c.x0, hauteur: bornes[i + 1] - bornes[i] });
  });
  return m;
}
const snap  = (v) => Math.round(v / PLAN_GRID) * PLAN_GRID;

// Repli de la colonne des réservations à la tablette, gardé sur l'appareil.
const CLE_LISTE_REPLIEE = 'sc_plan_liste_repliee';
// Pile d'annulation du dessin : les derniers gestes, pas l'historique entier.
const ANNULATIONS_MAX = 30;

// Modèles de la rangée « Ajouter » du dessin : les tables qu'une maison pose
// le plus, d'un seul toucher, à leur taille par défaut.
const MODELES_TABLE = [
  { cle: 't2', label: 'Table de 2', forme: 'carree', nb_places: 2 },
  { cle: 't4', label: 'Table de 4', forme: 'carree', nb_places: 4 },
  { cle: 't6', label: 'Table de 6', forme: 'rectangle', nb_places: 6 },
  { cle: 'r8', label: 'Ronde de 8', forme: 'ronde', nb_places: 8 },
];

// Styles de l'écran, par les jetons : carte blanche, sol de la salle en
// tuile intérieure, pilules et cercles des contrôles.
const ui = {
  racine: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  barre: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, minWidth: 0 },
  corps: { display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 },
  carte: {
    position: 'relative', flex: '1 1 0', minWidth: 0, boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', padding: 14,
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  liste: {
    flexShrink: 0, boxSizing: 'border-box', background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', padding: '6px 16px 10px', overflowY: 'auto',
  },
  // L'en-tête du plan et le bandeau d'une réservation choisie ont la même
  // hauteur : choisir ne fait pas sauter le plan sous le doigt.
  enteteCarte: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', minWidth: 0, minHeight: 54 },
  compteurs: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', flex: '1 1 auto', minWidth: 0 },
  sol: { position: 'relative', overflow: 'hidden', background: 'var(--piste)', borderRadius: 'var(--r)', userSelect: 'none', WebkitUserSelect: 'none' },
  fenetreTel: {
    position: 'relative', overflow: 'auto', background: 'var(--piste)', borderRadius: 'var(--r)',
    userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
  },
  rond: {
    width: 40, height: 40, minHeight: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)', cursor: 'pointer', padding: 0, flexShrink: 0,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', boxShadow: 'var(--sh)',
  },
  puce: {
    flexShrink: 0, minHeight: 40, padding: '8px 14px', borderRadius: 'var(--r-full)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)',
    fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  bandeauChoix: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '6px 6px 6px 14px', minHeight: 54, boxSizing: 'border-box', borderRadius: 'var(--r)',
    background: 'var(--info-bg-soft)', color: 'var(--info-text)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--info-bd)',
  },
  bandeauTexte: { flex: '1 1 220px', minWidth: 0, fontSize: 'var(--t2)', lineHeight: 1.4 },
};

// Un état et son nombre, comme les compteurs de la caisse : un point de
// couleur, le chiffre, le mot.
function Compteur({ couleur, n, un, plusieurs }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t2)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: couleur, flexShrink: 0 }} />
      <span data-no-translate="" style={{ fontFamily: 'var(--font-num)', color: 'var(--text)', fontSize: 'var(--t3)' }}>{n}</span>
      <span>{n > 1 ? plusieurs : un}</span>
    </span>
  );
}

function BoutonRond({ label, onClick, disabled = false, actif = false, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={actif || undefined}
      onClick={onClick}
      disabled={disabled}
      style={{ ...ui.rond, ...(actif ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' } : null), opacity: disabled ? 0.65 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      {children}
    </button>
  );
}

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
  // Écran Le plan de salle : service et salle sur la même ligne que les
  // boutons, pour que le plan se voie sans descendre la page.
  compact = false,
  // Variante 'dessin' (page des réglages) : la salle ouverte à l'arrivée, la
  // première table à poser d'office (venu d'un plan vide), et le retour au
  // service quand on vient de lui.
  salleInitiale = null, ajouterAuDepart = false, onAjoutFait, onFini = null,
}) {
  const plan     = usePlanSalle(etablissementId);
  const reservations = useReservations(etablissementId);
  const enService = variante === 'service';
  const enDessin  = variante === 'dessin';

  // 'plan' seulement dans la section des réglages : le service n'y passe plus.
  const [mode] = useState(enDessin ? 'plan' : 'service');
  const [service, setService] = useState(null);   // null = pas encore résolu
  const [salles,  setSalles]  = useState(null);
  const [salleId, setSalleId] = useState(salleInitiale);   // null = pas encore résolue
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
  // Vrai tant que la migration 20261005_plan_salle_pivot n'est pas passée :
  // la rotation reste possible sur le plan de base, pas pour un service.
  const [pivotIndispo, setPivotIndispo] = useState(false);
  const [ajuster,      setAjuster]      = useState(false);   // « Déplacer des tables »
  const [tableOuverte, setTableOuverte] = useState(null);    // id de la table touchée
  const [reserverSur,  setReserverSur]  = useState(null);    // table de « Réserver la table »
  const reservePoseeRef = useRef(false);
  // Décor de la salle (murs, baies, bar...), vrai tant que la migration
  // 20261007_plan_salle_elements n'est pas passée : décor et place de bar
  // restent alors masqués.
  const [elements,        setElements]        = useState([]);
  const [elementsIndispo, setElementsIndispo] = useState(false);
  const [selection,       setSelection]       = useState(null);  // id de l'élément choisi
  const [supprEnAttente,  setSupprEnAttente]  = useState(false); // « Supprimer » touché une fois
  const [nommer,          setNommer]          = useState(null);  // élément dont on règle le nom

  // Refs miroir : les gestionnaires de pointeur sont posés une seule fois par
  // geste, ils liraient sinon un état figé au moment de l'appui.
  const dragRef   = useRef(null);
  const tablesRef = useRef(null);
  const liensRef  = useRef(null);
  const elementsRef = useRef([]);
  tablesRef.current = tables;
  liensRef.current  = liens;
  elementsRef.current = elements;
  // Heure du dernier glisser relâché : le clic que le navigateur émet parfois
  // juste après ne doit pas ouvrir la réservation qu'on vient de déplacer.
  const finGesteRef = useRef(0);

  // ── Placement au toucher, heure affichée, dessin ─────────────────────
  // Une réservation choisie dans la liste allume sa table ; « armée », elle
  // se pose au toucher d'une table (placer, changer de table, en ajouter une).
  const [choisieId, setChoisieId] = useState(null);
  const [armee,     setArmee]     = useState(null);   // 'placer' | 'deplacer' | 'ajouter' | null
  // Heure montrée par le plan, en minutes. null : maintenant le jour même,
  // sinon le début du service.
  const [heureVue,  setHeureVue]  = useState(null);
  const [vueTel,    setVueTel]    = useState('plan');   // téléphone : 'plan' | 'liste'
  const [listeRepliee, setListeRepliee] = useState(() => readJson(CLE_LISTE_REPLIEE, false) === true);
  const [tableChoisie, setTableChoisie] = useState(null);   // dessin : table choisie
  const [guides,       setGuides]       = useState([]);     // dessin : lignes d'alignement
  const [annulations,  setAnnulations]  = useState([]);     // dessin : gestes à défaire
  const [planTous,     setPlanTous]     = useState(null);   // « placer les restants » à confirmer
  const [minute, setMinute] = useState(() => zurichNowMinutes());
  useEffect(() => {
    const id = setInterval(() => setMinute(zurichNowMinutes()), 30000);
    return () => clearInterval(id);
  }, []);
  const jourMeme = !!date && date === zurichToday();
  const maintenant = jourMeme ? minute : null;

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
      const { data: aj, error: eA, indispo, pivotIndispo: sansPivot } = date
        ? await plan.listAjustements(date)
        : { data: [], error: null, indispo: false, pivotIndispo: false };
      if (eA) { echec(eA); return; }
      const { data: el, error: eE, indispo: sansDecor } = await plan.listElements();
      if (eE) { echec(eE); return; }
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
      setPivotIndispo(!!sansPivot);
      setElements(el || []);
      setElementsIndispo(!!sansDecor);
      setLoading(false);
      setError(null);
      setNonActualise(false);
    } catch (e) {
      console.error('[PlanSalle] lecture du plan', e);
      echec('Erreur technique. Réessayez ou contactez le support.');
    }
    // resaIdsKey pilote le rechargement : une réservation ajoutée ou annulée
    // change la clé, une simple re-création du tableau ne la change pas.
  }, [etablissementId, date, plan, resaIdsKey, canEdit, lectures]);

  useEffect(() => { load(); }, [load]);

  // Plan de base redessiné dans la page des réglages : le service resté monté
  // derrière le relit au retour, sans attendre le temps réel.
  useReglageModifie('plan_salle', () => { if (!enDessin && !dragRef.current) load(); });

  // Realtime : l'hôte place à l'entrée pendant que le patron regarde le même
  // plan. Sans ça, chacun placerait sur une photo périmée du service.
  useEffect(() => {
    const bridge = dbService.getBridge();
    if (!bridge?.realtime) return undefined;
    // salle_elements seulement une fois la table créée : un canal ouvert sur
    // une table qui n'existe pas encore ne recevrait rien.
    const unsub = bridge.realtime.subscribeReload(
      ['salles', 'salle_tables', 'reservation_tables', 'salle_tables_service',
        ...(elementsIndispo ? [] : ['salle_elements'])],
      () => { if (!dragRef.current) load(); },
    );
    return () => { unsub && unsub(); };
  }, [load, elementsIndispo]);

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
  // Plan de base + écarts du service affiché. En « Dessiner la salle », on
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
      // Quart de tour pour ce service : largeur et hauteur échangées.
      const pivotee = !!a.pivotee;
      return {
        ...t,
        pos_x: deplacee ? Number(a.pos_x) : t.pos_x,
        pos_y: deplacee ? Number(a.pos_y) : t.pos_y,
        largeur: pivotee ? t.hauteur : t.largeur,
        hauteur: pivotee ? t.largeur : t.hauteur,
        fusion: a.fusion || null,
        deplacee,
        pivotee,
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

  // Venu du bouton « Ajouter une table » d'un plan vide : la première table
  // est posée à l'arrivée, une seule fois, comme le bouton le faisait. La
  // salle doit être connue (ou absente : salleCible crée alors la première).
  const ajoutFaitRef = useRef(false);
  useEffect(() => {
    if (!enDessin || !ajouterAuDepart || ajoutFaitRef.current || tables === null || salles === null) return;
    if (salles.length > 0 && !salles.some((s) => s.id === salleId)) return;
    ajoutFaitRef.current = true;
    onAjoutFait?.();
    ajouterTable();
  }, [enDessin, ajouterAuDepart, tables, salles, salleId]);

  const tablesSalle = useMemo(() => {
    if (!tablesVues) return [];
    if (!(salles || []).length) return tablesVues;   // pas encore de salles : tout afficher
    return tablesVues.filter((t) => salleDeTable(t) === salleId);
  }, [tablesVues, salles, salleId, salleDeTable]);

  // Décor de la salle affichée. Les zones d'abord : elles se dessinent au
  // sol, sous les murs et le mobilier.
  const elementsSalle = useMemo(() => (elements || [])
    .filter((e) => e.salle_id === salleId)
    .sort((a, b) => (a.type === 'zone' ? 0 : 1) - (b.type === 'zone' ? 0 : 1)),
  [elements, salleId]);

  // ── Vue du plan à l'écran : échelle, cadrage, zoom (useVuePlan) ──────
  // Le dessin et le déplacement de tables montrent tout le canevas ; le
  // service se cale sur ce qui est dessiné dans la salle.
  const dessinBase = mode === 'plan' && canEdit;
  const deplacementTables = ajuster && canEdit && !dessinBase && !ajustIndispo;
  const vuePlan = useVuePlan({
    objets: [...tablesSalle, ...elementsSalle],
    tables: tablesSalle,
    toutLeCanevas: dessinBase || deplacementTables,
    hauteurMin: 320,
  });
  // Largeur de l'écran du plan : sous 900 px, plan et réservations ne tiennent
  // plus côte à côte et passent l'un sous l'autre (bascule Plan, Réservations).
  const [racineEl, setRacineEl] = useState(null);
  const racineW = useLargeur(useMemo(() => ({ current: racineEl }), [racineEl]));

  // Changer de salle ou quitter le dessin désélectionne : la barre d'actions
  // parlerait d'un élément qu'on ne voit plus.
  useEffect(() => { setSelection(null); setTableChoisie(null); setSupprEnAttente(false); }, [salleId, mode]);

  // Contour des tablées rapprochées de la salle affichée : un cadre autour
  // des tables réunies.
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
        return { cle, x0, y0, x1, y1 };
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
  // Une tablée rapprochée s'annonce par SON numéro (celui choisi à la
  // fusion), pas par la liste de ses tables : c'est ce numéro qu'on dit au
  // passe.
  const tablesParResa = useMemo(() => {
    const liste = tablesVues || [];
    const parFusion = new Map();
    for (const t of liste) {
      if (!t.fusion) continue;
      if (!parFusion.has(t.fusion)) parFusion.set(t.fusion, []);
      parFusion.get(t.fusion).push(t);
    }
    const nomParTable = new Map(liste.map((t) => {
      const tablee = t.fusion ? parFusion.get(t.fusion) : null;
      return [t.id, tablee && tablee.length > 1 ? principaleDe(tablee).nom : t.nom];
    }));
    const m = new Map();
    for (const l of liens || []) {
      if (!m.has(l.reservation_id)) m.set(l.reservation_id, []);
      const nom = nomParTable.get(l.table_id);
      const noms = m.get(l.reservation_id);
      if (nom && !noms.includes(nom)) noms.push(nom);
    }
    for (const noms of m.values()) {
      noms.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    }
    return m;
  }, [liens, tablesVues]);

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
    const rect = vuePlan.salleRef.current?.getBoundingClientRect();
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
    // Prendre une table lâche l'élément de décor choisi.
    setSelection(null);
    setSupprEnAttente(false);
    demarrerGeste(e, {
      kind: 'table', tableId: table.id,
      avant: { pos_x: Number(table.pos_x), pos_y: Number(table.pos_y) },
      grabDX: p.x - Number(table.pos_x),
      grabDY: p.y - Number(table.pos_y),
    });
  }

  // Déplacer des tables : on traîne la tablée entière (une table seule, ou
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

  // Décor (« Dessiner la salle ») : glisser l'élément, ou tirer sa poignée.
  // La géométrie d'avant le geste voyage avec lui : si l'écriture échoue, on
  // la remet sans dépendre d'une relecture qui peut échouer aussi.
  const geometrie = (el) => ({
    pos_x: el.pos_x, pos_y: el.pos_y, largeur: el.largeur, hauteur: el.hauteur, rotation: el.rotation,
  });

  function onPointerDownElement(e, el) {
    const p = versCanevas(e.clientX, e.clientY);
    if (!p) return;
    setSupprEnAttente(false);
    demarrerGeste(e, {
      kind: 'element', elementId: el.id, avant: geometrie(el),
      grabDX: p.x - Number(el.pos_x),
      grabDY: p.y - Number(el.pos_y),
    });
  }

  function onPointerDownPoignee(e, el) {
    setSupprEnAttente(false);
    demarrerGeste(e, { kind: 'elementTaille', elementId: el.id, avant: geometrie(el) });
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
        // Guides d'alignement : près du bord ou du centre d'une autre table de
        // la salle, la table s'y cale et une ligne le montre ; sinon, la grille.
        const brut = { pos_x: p.x - d.grabDX, pos_y: p.y - d.grabDY, largeur: Number(t.largeur), hauteur: Number(t.hauteur) };
        const autres = (tablesRef.current || []).filter((x) => x.id !== t.id && x.salle_id === t.salle_id);
        const cale = aligner(brut, autres);
        const nx = cale.guides.some((g) => g.axe === 'x') ? cale.pos_x : clamp(snap(brut.pos_x), 0, PLAN_W - brut.largeur);
        const ny = cale.guides.some((g) => g.axe === 'y') ? cale.pos_y : clamp(snap(brut.pos_y), 0, PLAN_H - brut.hauteur);
        setGuides(cale.guides);
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

      if (d.kind === 'element' || d.kind === 'elementTaille') {
        const p = versCanevas(e.clientX, e.clientY);
        const el = (elementsRef.current || []).find((x) => x.id === d.elementId);
        if (!p || !el) return;
        const patch = d.kind === 'element'
          ? {
            pos_x: clamp(snap(p.x - d.grabDX), 0, PLAN_W - Number(el.largeur)),
            pos_y: clamp(snap(p.y - d.grabDY), 0, PLAN_H - Number(el.hauteur)),
          }
          : redimensionner(el, p.x, p.y);
        setElements((prev) => (prev || []).map((x) => (x.id === d.elementId ? { ...x, ...patch } : x)));
        // Comme pour les tables, la géométrie retenue est portée par le geste.
        majDrag({ x: e.clientX, y: e.clientY, patch });
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
        // Une place de bar ne se rapproche pas en tablée : traînée, elle se
        // déplace seulement, et une table lâchée sur elle aussi.
        const tabourets = new Set((tablesRef.current || []).filter(estTabouret).map((t) => t.id));
        const traineTabouret = m.some((t) => tabourets.has(t.id));
        let cible = null;
        for (const el of traineTabouret ? [] : document.elementsFromPoint(e.clientX, e.clientY)) {
          const tEl = el.closest?.('[data-plan-table]');
          const id = tEl?.getAttribute('data-plan-table');
          if (id && !ids.has(id) && !tabourets.has(id)) { cible = id; break; }
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
      if (d?.avant && (d.kind === 'element' || d.kind === 'elementTaille')) {
        setElements((prev) => (prev || []).map((x) => (x.id === d.elementId ? { ...x, ...d.avant } : x)));
      }
    }

    function nettoyer() {
      dragRef.current = null;
      setDrag(null);
      setGuides([]);
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
      setTableChoisie(d.tableId);
      if (d.avant) pousserAnnulation({ kind: 'table', id: d.tableId, avant: d.avant });
      const { error: e } = await plan.updateTable(d.tableId, { pos_x: d.posX, pos_y: d.posY });
      if (e) { notify(e, 'error'); load(); }
      return;
    }

    if (d.kind === 'element' || d.kind === 'elementTaille') {
      // L'élément manipulé reste choisi : sa poignée apparaît, on peut
      // l'allonger juste après l'avoir posé.
      setSelection(d.elementId);
      setTableChoisie(null);
      if (!d.patch) return;
      pousserAnnulation({ kind: 'element', id: d.elementId, avant: d.avant });
      const { error: e } = await plan.updateElement(d.elementId, d.patch);
      if (e) {
        setElements((prev) => (prev || []).map((x) => (x.id === d.elementId ? { ...x, ...d.avant } : x)));
        notify(e, 'error');
      }
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
      notify(`${d.resa.nom} : ${nomTablee(cibleId)}`, 'success');
      return;
    }

    await poserSurTablee(d.resa, cibleId);
  }

  // ── Placement sur une tablée ────────────────────────────────────────
  // « Table 4 » ou « Tables 3 + 4 » : le nom tel qu'on le dit au passe.
  function nomTablee(tableId) {
    const principale = principaleDe(tableeDe(tableId));
    return `${estTabouret(principale) ? 'place de bar' : 'table'} ${principale?.nom ?? ''}`;
  }

  // Numéro d'une tablée : toutes ses tables reçoivent pour clé l'id de la
  // table choisie. Les positions du service restent telles quelles.
  async function choisirNumero(tableId, principaleId) {
    const tablee = tableeDe(tableId);
    if (tablee.length < 2 || !tablee.some((t) => t.id === principaleId)) return;
    const lignes = tablee.map((t) => {
      const a = ajustRef.current.get(t.id);
      return { table_id: t.id, pos_x: a?.pos_x ?? null, pos_y: a?.pos_y ?? null, fusion: principaleId };
    });
    if (await ecrireAjustements(lignes)) {
      notify(`Tablée ${tablee.map((t) => t.nom).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })).join(' + ')} : table ${nomTable(principaleId)}`, 'success');
    }
  }

  // Assied une réservation sur toutes les tables actives de la tablée.
  // Rend vrai si elle y est (déjà placée compris).
  async function poserSurTablee(resa, tableId, { silencieux = false } = {}) {
    const tablee = tableeDe(tableId);
    const actives = tablee.filter((t) => t.actif !== false);
    if (!actives.length) {
      notify(`${tablee[0]?.nom ?? 'Cette table'} est inactive : réactivez-la dans « Dessiner la salle ».`, 'warning');
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
      notify(`${resa.nom} (${resa.nb_couverts} pax) à la ${nomTablee(tableId)}`, 'success');
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
    notify(`${resa.nom} (${resa.nb_couverts} pax) à la ${nomTablee(tableId)}`, 'success');
  }

  const relireResas = () => (onResasModifiees || onRelireResas)?.();

  // Client de passage : créé « arrivé », à l'heure qu'il est, et assis.
  // Origine 'passage' : le rapport le compte à part de l'équipe et du site.
  async function clientDePassage(tableId, nbCouverts) {
    const nom = `Passage, ${nomTablee(tableId)}`;
    const { data: resa, error: e } = await reservations.create({
      date_service:  date,
      service:       serviceActif,
      heure_arrivee: zurichClock(),
      nb_couverts:   nbCouverts,
      nom:           nom.charAt(0).toUpperCase() + nom.slice(1),
      est_groupe:    false,
      statut:        'arrive',
      origine:       'passage',
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

  async function ecrireAjustements(lignesBrutes, supprimes = []) {
    // Une ligne qui ne dit rien du quart de tour garde celui de la table :
    // déplacer ou rapprocher une table tournée ne doit pas la redresser.
    const lignes = lignesBrutes.map((l) => ({
      ...l,
      pivotee: l.pivotee ?? !!ajustRef.current.get(l.table_id)?.pivotee,
    }));
    majAjustementsLocaux(lignes, supprimes);
    if (supprimes.length) {
      const { error: e } = await plan.effacerAjustements(date, serviceActif, supprimes);
      if (e) { notify(e, 'error'); load(); return false; }
    }
    if (lignes.length) {
      const { error: e, pivotIndispo: sansPivot } = await plan.enregistrerAjustements(date, serviceActif, lignes);
      if (sansPivot) setPivotIndispo(true);
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
    // Le décor compte aussi (mur, bar, pilier...), sauf les zones, qui ne
    // sont qu'un marquage au sol.
    const obstacles = [
      ...(tablesVuesRef.current || []).filter((t) =>
        !idsBouges.has(t.id) && salleDeTable(t) === salleCible),
      ...(elementsRef.current || []).filter((el) => el.salle_id === salleCible && estObstacle(el)),
    ];
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
    notify(`Tables ${noms.join(' + ')} rapprochées, ${places} places`, 'success');
    // La fiche de la tablée s'ouvre aussitôt : c'est là qu'on choisit le
    // numéro qu'elle portera (celui de la table visée par défaut).
    setTableOuverte(cibleId);
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
      if ((a?.pos_x != null && a?.pos_y != null) || a?.pivotee) {
        lignes.push({ table_id: r.id, pos_x: a.pos_x ?? null, pos_y: a.pos_y ?? null, fusion: null });
      } else supprimes.push(r.id);
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

  // ── Quart de tour ───────────────────────────────────────────────────
  // Une table tournée échange sa largeur et sa hauteur autour de son centre :
  // elle pivote sur place au lieu de partir vers la droite. Bornée au canevas
  // et sans aimantation. Près d'un mur, la borne la décale : un second quart
  // de tour fait au même endroit la ramène alors à sa place de départ, et non
  // à un centre déjà décalé (voir dernierQuartRef et commeLaBase).
  const memePlace = (a, b) => Math.abs(Number(a.pos_x) - Number(b.pos_x)) < 0.5
    && Math.abs(Number(a.pos_y) - Number(b.pos_y)) < 0.5;
  // Plan de base : dernier quart de tour de chaque table, { avant, apres }.
  const dernierQuartRef = useRef(new Map());

  function apresQuartDeTour(t) {
    const w = Number(t.largeur);
    const h = Number(t.hauteur);
    return {
      largeur: h,
      hauteur: w,
      pos_x: clamp(Number(t.pos_x) + (w - h) / 2, 0, PLAN_W - h),
      pos_y: clamp(Number(t.pos_y) + (h - w) / 2, 0, PLAN_H - w),
    };
  }

  // Plan de base (« Dessiner la salle ») : la table elle-même change de sens.
  async function tournerTableBase(tableId) {
    const t = (tablesRef.current || []).find((x) => x.id === tableId);
    if (!t) return;
    // Retour du quart de tour précédent, la table n'ayant pas bougé depuis :
    // elle reprend exactement sa place d'avant.
    const dernier = dernierQuartRef.current.get(tableId);
    const patch = dernier && memePlace(t, dernier.apres) && Number(t.largeur) === dernier.apres.largeur
      ? { ...dernier.avant }
      : apresQuartDeTour(t);
    pousserAnnulation({ kind: 'table', id: tableId, avant: { largeur: Number(t.largeur), hauteur: Number(t.hauteur), pos_x: Number(t.pos_x), pos_y: Number(t.pos_y) } });
    dernierQuartRef.current.set(tableId, {
      avant: { largeur: Number(t.largeur), hauteur: Number(t.hauteur), pos_x: Number(t.pos_x), pos_y: Number(t.pos_y) },
      apres: patch,
    });
    setTables((prev) => (prev || []).map((x) => (x.id === tableId ? { ...x, ...patch } : x)));
    const { error: e } = await plan.updateTable(tableId, patch);
    if (e) { notify(`Table ${t.nom} non tournée : ${e}`, 'error'); load(); }
  }

  // Service (ou « Déplacer des tables ») : un écart de plus, daté, le plan de
  // base ne bouge pas. Revenue dans son sens et à sa place, seule, la table
  // n'a plus d'écart : la ligne est effacée.
  async function tournerTableService(tableId) {
    if (pivotIndispo) {
      notify('Tourner une table pour un service demande une mise à jour de la base (migration 20261005_plan_salle_pivot).', 'warning');
      return;
    }
    const vue  = (tablesVuesRef.current || []).find((x) => x.id === tableId);
    const base = (tablesRef.current || []).find((x) => x.id === tableId);
    if (!vue || !base) return;
    const a = ajustRef.current.get(tableId);
    const pivotee = !a?.pivotee;
    // Tournée depuis sa place de base sans avoir bougé depuis : le quart de
    // tour inverse la remet à sa place de base, même si la borne du canevas
    // l'avait décalée.
    const commeLaBase = !pivotee && memePlace(vue, apresQuartDeTour(base));
    if (commeLaBase && !a?.fusion) { await ecrireAjustements([], [tableId]); return; }
    const { pos_x, pos_y } = commeLaBase ? base : apresQuartDeTour(vue);
    if (!pivotee && !a?.fusion && memePlace({ pos_x, pos_y }, base)) { await ecrireAjustements([], [tableId]); return; }
    await ecrireAjustements([{ table_id: tableId, pos_x, pos_y, fusion: a?.fusion ?? null, pivotee }]);
  }

  // Tablée rapprochée : elle tourne d'un bloc autour de son centre, chaque
  // table pivotant avec elle. Un quart de tour dans un sens, puis dans
  // l'autre (le sens suit la table qui porte le numéro), pour qu'un aller-
  // retour la remette en place ; la borne du canevas décale le bloc entier,
  // d'où le même souvenir du dernier quart de tour que pour une table seule.
  const dernierQuartTableeRef = useRef(new Map());

  async function tournerTablee(tableId) {
    if (pivotIndispo) {
      notify('Tourner une table pour un service demande une mise à jour de la base (migration 20261005_plan_salle_pivot).', 'warning');
      return;
    }
    const membres = tableeDe(tableId);
    if (membres.length < 2) { await tournerTableService(tableId); return; }
    const cle = membres[0].fusion;
    const actuel = membres.map((t) => ({
      table_id: t.id, pos_x: Number(t.pos_x), pos_y: Number(t.pos_y),
      fusion: cle, pivotee: !!ajustRef.current.get(t.id)?.pivotee,
    }));
    const dernier = dernierQuartTableeRef.current.get(cle);
    let lignes;
    if (dernier && dernier.avant.length === membres.length
        && membres.every((t) => dernier.apres.has(t.id) && memePlace(t, dernier.apres.get(t.id)))) {
      lignes = dernier.avant;
    } else {
      const { cx, cy } = cadreDe(membres);
      const horaire = !principaleDe(membres)?.pivotee;
      const tournees = membres.map((t) => {
        const x = Number(t.pos_x); const y = Number(t.pos_y);
        const w = Number(t.largeur); const h = Number(t.hauteur);
        return {
          id: t.id, largeur: h, hauteur: w,
          pos_x: horaire ? cx - (y + h - cy) : cx + (y - cy),
          pos_y: horaire ? cy + (x - cx) : cy - (x + w - cx),
        };
      });
      const c = cadreDe(tournees);
      const dx = c.x0 < 0 ? -c.x0 : c.x1 > PLAN_W ? PLAN_W - c.x1 : 0;
      const dy = c.y0 < 0 ? -c.y0 : c.y1 > PLAN_H ? PLAN_H - c.y1 : 0;
      lignes = tournees.map((t) => ({
        table_id: t.id, pos_x: t.pos_x + dx, pos_y: t.pos_y + dy,
        fusion: cle, pivotee: !ajustRef.current.get(t.id)?.pivotee,
      }));
    }
    dernierQuartTableeRef.current.set(cle, {
      avant: actuel,
      apres: new Map(lignes.map((l) => [l.table_id, { pos_x: l.pos_x, pos_y: l.pos_y }])),
    });
    await ecrireAjustements(lignes);
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
  // Les places de bar ont leur propre suite (B1, B2...) : « B3 » ne doit pas
  // faire sauter la table suivante au numéro 4.
  const numeroDe = (t) => parseInt(String(t.nom).replace(/\D/g, ''), 10);

  function prochainNumero() {
    const nums = (tables || []).filter((t) => !estTabouret(t))
      .map(numeroDe)
      .filter((n) => Number.isFinite(n));
    return String(nums.length ? Math.max(...nums) + 1 : 1);
  }

  function prochainNumeroBar() {
    const nums = (tables || []).filter(estTabouret)
      .map(numeroDe)
      .filter((n) => Number.isFinite(n));
    return `B${nums.length ? Math.max(...nums) + 1 : 1}`;
  }

  // Première place libre de la salle, en lisant de gauche à droite et de haut
  // en bas : une table neuve ne se pose jamais sur une autre ni sur un mur.
  // Sans place libre, en quinconce comme avant.
  function positionLibre(index, taille = { largeur: 90, hauteur: 90 }) {
    const w = Number(taille.largeur) || 90;
    const h = Number(taille.hauteur) || 90;
    const obstacles = [
      ...tablesSalle,
      ...elementsSalle.filter((el) => estObstacle(el)),
    ];
    const libre = (x, y) => obstacles.every((o) => {
      const ox = Number(o.pos_x) - 20; const oy = Number(o.pos_y) - 20;
      return x + w <= ox || x >= ox + Number(o.largeur) + 40 || y + h <= oy || y >= oy + Number(o.hauteur) + 40;
    });
    for (let y = 40; y + h <= PLAN_H - 20; y += 20) {
      for (let x = 40; x + w <= PLAN_W - 20; x += 20) {
        if (libre(x, y)) return { pos_x: x, pos_y: y };
      }
    }
    return {
      pos_x: 40 + (index % 8) * 115,
      pos_y: 40 + Math.floor(index / 8) * 115,
    };
  }

  // Sans salle, on en crée une d'office : une table ou un mur doit vivre
  // quelque part.
  async function salleCible() {
    if (salleId) return salleId;
    const { data: s, error: eS } = await plan.createSalle('Salle', 0);
    if (eS) { notify(eS, 'error'); return null; }
    setSalles((prev) => [...(prev || []), s]);
    setSalleId(s.id);
    return s.id;
  }

  // Place de bar suivante : à côté de la dernière, dans le sens du bar. La
  // première se pose le long du bar de la salle, du côté où il reste de la
  // place ; sans bar dessiné, comme une table.
  function positionTabouret() {
    const T = 50;
    const bar = elementsSalle.find((el) => el.type === 'bar');
    const vertical = bar ? Number(bar.hauteur) > Number(bar.largeur) : false;
    const derniere = [...tablesSalle.filter(estTabouret)].sort(parNumero).pop();
    let x;
    let y;
    if (derniere) {
      x = Number(derniere.pos_x) + (vertical ? 0 : PAS_TABOURET);
      y = Number(derniere.pos_y) + (vertical ? PAS_TABOURET : 0);
    } else if (bar) {
      const bx = Number(bar.pos_x); const by = Number(bar.pos_y);
      const bw = Number(bar.largeur); const bh = Number(bar.hauteur);
      if (vertical) {
        x = bx + bw + 10 + T <= PLAN_W ? bx + bw + 10 : bx - 10 - T;
        y = by + 10;
      } else {
        x = bx + 10;
        y = by + bh + 10 + T <= PLAN_H ? by + bh + 10 : by - 10 - T;
      }
    } else {
      return positionLibre(tablesSalle.length);
    }
    return { pos_x: clamp(x, 0, PLAN_W - T), pos_y: clamp(y, 0, PLAN_H - T) };
  }

  async function ajouterTabouret() {
    const cible = await salleCible();
    if (!cible) return;
    const { data, error: e } = await plan.createTable({
      nom: prochainNumeroBar(), nb_places: 1, forme: 'tabouret',
      salle_id: cible, ...positionTabouret(),
    });
    if (e) { notify(e, 'error'); return; }
    // Pas de réglages ouverts : on pose une rangée de tabourets d'affilée.
    setTables((prev) => [...(prev || []), data]);
    pousserAnnulation({ kind: 'creationTable', id: data.id });
    setTableChoisie(data.id);
  }

  // Un modèle de la rangée « Ajouter » pose la table et la choisit, sans
  // ouvrir ses réglages ; « Autre table » ouvre les réglages comme avant.
  async function ajouterTable(modele = null) {
    const cible = await salleCible();
    if (!cible) return;
    const forme = modele?.forme ?? 'ronde';
    const nbPlaces = modele?.nb_places ?? 2;
    const { pos_x, pos_y } = positionLibre(tablesSalle.length, tailleParDefaut(forme, nbPlaces));
    const { data, error: e } = await plan.createTable({
      nom: prochainNumero(), nb_places: nbPlaces, forme,
      salle_id: cible, pos_x, pos_y,
    });
    if (e) { notify(e, 'error'); return; }
    setTables((prev) => [...(prev || []), data]);
    pousserAnnulation({ kind: 'creationTable', id: data.id });
    if (modele) { setSelection(null); setTableChoisie(data.id); return; }
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
      nom: estTabouret(modele) ? prochainNumeroBar() : prochainNumero(),
      pos_x: decale(Number(modele.pos_x) || 0, PLAN_W - Number(modele.largeur || 90)),
      pos_y: decale(Number(modele.pos_y) || 0, PLAN_H - Number(modele.hauteur || 90)),
    });
    if (e) { notify(`Duplication de la table ${modele.nom} impossible : ${e}`, 'error'); return false; }
    setTables((prev) => [...(prev || []), data]);
    pousserAnnulation({ kind: 'creationTable', id: data.id });
    notify(`${estTabouret(data) ? 'Place de bar' : 'Table'} ${data.nom} créée`, 'success');
    return true;
  }

  // ── Décor (mode plan) ───────────────────────────────────────────────
  // Nouvel élément au milieu du plan, décalé à chaque ajout pour ne pas
  // empiler deux murs au même endroit. Il arrive choisi : on le glisse et on
  // l'allonge dans la foulée.
  async function ajouterElement(type) {
    const def = ELEMENT_PAR_TYPE.get(type);
    if (!def) return;
    const cible = await salleCible();
    if (!cible) return;
    const n = elementsSalle.length % 6;
    const { data, error: e } = await plan.createElement({
      type, salle_id: cible, largeur: def.largeur, hauteur: def.hauteur,
      pos_x: clamp(snap((PLAN_W - def.largeur) / 2 + n * 20), 0, PLAN_W - def.largeur),
      pos_y: clamp(snap((PLAN_H - def.hauteur) / 2 + n * 20), 0, PLAN_H - def.hauteur),
    });
    if (e) { notify(`Ajout impossible (${def.label}) : ${e}`, 'error'); return; }
    setElements((prev) => [...(prev || []), data]);
    pousserAnnulation({ kind: 'creationElement', id: data.id });
    setSupprEnAttente(false);
    setTableChoisie(null);
    setSelection(data.id);
    // Une zone ne dit rien sans son nom (cuisine, WC...) : on le demande tout
    // de suite.
    if (type === 'zone') setNommer(data);
  }

  async function enregistrerElement(id, patch) {
    const { data, error: e } = await plan.updateElement(id, patch);
    if (e) { notify(e, 'error'); return false; }
    setElements((prev) => (prev || []).map((x) => (x.id === id ? data : x)));
    return true;
  }

  async function tournerElement(el) {
    const avant = geometrie(el);
    pousserAnnulation({ kind: 'element', id: el.id, avant });
    const patch = quartDeTourElement(el);
    setElements((prev) => (prev || []).map((x) => (x.id === el.id ? { ...x, ...patch } : x)));
    const { error: e } = await plan.updateElement(el.id, patch);
    if (e) {
      setElements((prev) => (prev || []).map((x) => (x.id === el.id ? { ...x, ...avant } : x)));
      notify(e, 'error');
    }
  }

  async function dupliquerElement(el) {
    const w = Number(el.largeur);
    const h = Number(el.hauteur);
    const { data, error: e } = await plan.createElement({
      type: el.type, libelle: el.libelle, salle_id: el.salle_id,
      largeur: w, hauteur: h, rotation: el.rotation,
      pos_x: clamp(Number(el.pos_x) + 20, 0, PLAN_W - w),
      pos_y: clamp(Number(el.pos_y) + 20, 0, PLAN_H - h),
    });
    if (e) { notify(e, 'error'); return; }
    setElements((prev) => [...(prev || []), data]);
    pousserAnnulation({ kind: 'creationElement', id: data.id });
    setSelection(data.id);
  }

  // Deux temps : le premier appui arme, le second supprime. Retiré tout de
  // suite de l'écran, remis tel quel si la base refuse.
  async function supprimerElement(el) {
    if (!supprEnAttente) { setSupprEnAttente(true); return; }
    setSupprEnAttente(false);
    setSelection(null);
    setElements((prev) => (prev || []).filter((x) => x.id !== el.id));
    const { error: e } = await plan.deleteElement(el.id);
    if (e) {
      setElements((prev) => ((prev || []).some((x) => x.id === el.id) ? prev : [...(prev || []), el]));
      notify(e, 'error');
    }
  }

  // Premier toucher : choisir l'élément (sa poignée apparaît). Toucher un
  // élément déjà choisi ouvre son nom, s'il en porte un.
  function toucherElement(el) {
    if (Date.now() - finGesteRef.current < 400) return;   // clic émis après un glisser
    if (selection === el.id) {
      if (ELEMENT_PAR_TYPE.get(el.type)?.nomme) setNommer(el);
      return;
    }
    setSupprEnAttente(false);
    setSelection(el.id);
  }

  // ── Annuler et pousser au clavier (dessin) ──────────────────────────
  // Chaque geste du dessin (déplacer, tourner, ajouter) garde ce qu'il faut
  // pour revenir en arrière. « Annuler » ou Ctrl + Z défait le dernier.
  const annulationsRef = useRef([]);
  annulationsRef.current = annulations;
  function pousserAnnulation(entree) {
    setAnnulations((prev) => [...prev.slice(-(ANNULATIONS_MAX - 1)), entree]);
  }

  async function annulerDernier() {
    const liste = annulationsRef.current;
    const dernier = liste[liste.length - 1];
    if (!dernier) return;
    setAnnulations((prev) => prev.slice(0, -1));
    if (dernier.kind === 'table') {
      setTables((prev) => (prev || []).map((x) => (x.id === dernier.id ? { ...x, ...dernier.avant } : x)));
      const { error: e } = await plan.updateTable(dernier.id, dernier.avant);
      if (e) { notify(e, 'error'); load(); }
    } else if (dernier.kind === 'element') {
      setElements((prev) => (prev || []).map((x) => (x.id === dernier.id ? { ...x, ...dernier.avant } : x)));
      const { error: e } = await plan.updateElement(dernier.id, dernier.avant);
      if (e) { notify(e, 'error'); load(); }
    } else if (dernier.kind === 'creationTable') {
      setTableChoisie((c) => (c === dernier.id ? null : c));
      await supprimerTable(dernier.id);
    } else if (dernier.kind === 'creationElement') {
      setSelection((c) => (c === dernier.id ? null : c));
      setElements((prev) => (prev || []).filter((x) => x.id !== dernier.id));
      const { error: e } = await plan.deleteElement(dernier.id);
      if (e) { notify(e, 'error'); load(); }
    }
  }

  // Flèches : la table ou l'élément choisi avance d'un pas de grille (de 50
  // avec Maj). Une rafale de flèches ne fait qu'une écriture, et qu'une
  // entrée d'annulation.
  const pousseRef = useRef(null);
  async function ecrirePousse(c) {
    if (!c?.pos) return;
    const { error: e } = c.kind === 'table'
      ? await plan.updateTable(c.id, c.pos)
      : await plan.updateElement(c.id, c.pos);
    if (e) { notify(e, 'error'); load(); }
  }
  function pousser(dx, dy) {
    const kind = tableChoisie ? 'table' : selection ? 'element' : null;
    const id = tableChoisie || selection;
    if (!kind) return;
    const x = ((kind === 'table' ? tablesRef.current : elementsRef.current) || []).find((o) => o.id === id);
    if (!x) return;
    const nx = clamp(Number(x.pos_x) + dx, 0, PLAN_W - Number(x.largeur));
    const ny = clamp(Number(x.pos_y) + dy, 0, PLAN_H - Number(x.hauteur));
    let c = pousseRef.current;
    if (!c || c.id !== id) {
      if (c) { clearTimeout(c.timer); ecrirePousse(c); }
      c = { kind, id, avant: { pos_x: Number(x.pos_x), pos_y: Number(x.pos_y) } };
      pousseRef.current = c;
      pousserAnnulation({ kind, id, avant: c.avant });
    }
    c.pos = { pos_x: nx, pos_y: ny };
    const maj = (prev) => (prev || []).map((o) => (o.id === id ? { ...o, pos_x: nx, pos_y: ny } : o));
    if (kind === 'table') setTables(maj); else setElements(maj);
    clearTimeout(c.timer);
    c.timer = setTimeout(() => { const fin = pousseRef.current; pousseRef.current = null; ecrirePousse(fin); }, 450);
  }

  // Clavier : au dessin, annuler, pousser, lâcher ; au service, Échap
  // lâche la réservation choisie. Rien quand on tape dans un champ ou qu'une
  // fenêtre est ouverte.
  useEffect(() => {
    const surTouche = (e) => {
      const cible = e.target;
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName || ''))) return;
      if (document.querySelector('[data-fenetre]')) return;
      if (dessinBase) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && String(e.key).toLowerCase() === 'z') {
          e.preventDefault();
          annulerDernier();
          return;
        }
        const pas = e.shiftKey ? 50 : PLAN_GRID;
        const dir = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[e.key];
        if (dir && (tableChoisie || selection)) { e.preventDefault(); pousser(dir[0], dir[1]); return; }
        if (e.key === 'Escape') { setTableChoisie(null); setSelection(null); setSupprEnAttente(false); }
        return;
      }
      if (e.key === 'Escape' && (choisieId || armee)) { setChoisieId(null); setArmee(null); }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  });

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
    setElements((prev) => (prev || []).filter((el) => el.salle_id !== id));
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
  // En dessin, le canevas n'est posé qu'une fois le plan lu : pas de salle
  // vide affichée le temps de la lecture, et sa mesure (quadrillage fin) part
  // d'un canevas déjà à sa place.
  if ((loading || enDessin) && tables === null && !error) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 'var(--t2)' }}>
        Chargement du plan…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--danger-bg-soft)',
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--danger-bd)',
        color: 'var(--danger-text)', fontSize: 'var(--t2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <span>{error}</span>
        <button type="button" onClick={load} style={{
          padding: '6px 12px', borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid',
          borderColor: 'var(--danger-bd)', background: 'transparent',
          color: 'var(--danger-text)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)',
          cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
          Réessayer
        </button>
      </div>
    );
  }

  // Le mode plan est DÉRIVÉ du droit, pas seulement de l'état : un rôle
  // rétrogradé en cours de session verrait sinon le bouton « Terminer »
  // disparaître et resterait coincé dans l'éditeur.
  const modePlan    = dessinBase;
  // « Dessiner la salle » : la section 'plan_salle' de la page des réglages,
  // ouverte par-dessus le service avec ce qu'il montre (salle, jour, service,
  // clients placés). Le geste retour et « J'ai fini » ramènent ici.
  const ouvrirDessin = (ajouterTableAuDepart = false) => {
    setAjuster(false);
    demanderDessin({
      etablissementId, salleId, date, service: serviceActif,
      resas: resasRef.current || [], ajouterTable: ajouterTableAuDepart,
    });
    ouvrirCompte('plan_salle', { parDessus: true });
  };
  // Salle sans rien à montrer. En dessin, le canevas reste affiché même vide :
  // c'est là qu'on pose le premier mur.
  const aucuneTable = tablesSalle.length === 0 && elementsSalle.length === 0 && !modePlan;
  // Distinguer « la maison n'a pas de plan » de « cette salle-ci est vide » :
  // le message et l'action ne sont pas les mêmes.
  const autresSallesGarnies = (tables || []).length > 0;
  // Élément de décor choisi (mode plan) : la barre propose ses actions.
  const elementChoisi = modePlan && selection
    ? elementsSalle.find((el) => el.id === selection) || null
    : null;
  const defChoisi = elementChoisi ? ELEMENT_PAR_TYPE.get(elementChoisi.type) : null;
  // « Déplacer des tables » : même dérivation du droit, et seulement une fois
  // la migration des ajustements passée.
  const ajusterActif = deplacementTables;
  const tableDessinChoisie = modePlan && tableChoisie
    ? tablesSalle.find((t) => t.id === tableChoisie) || null
    : null;
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
  const tablesPosees = enDeplacement
    ? tablesSalle.map((t) => {
      const m = enDeplacement.get(t.id);
      return m ? { ...t, pos_x: m.x0 + drag.dx, pos_y: m.y0 + drag.dy } : t;
    })
    : tablesSalle;
  // Tablées dessinées en un seul rectangle (voir trancherTablee).
  const tablesDessinees = (() => {
    if (modePlan) return tablesPosees;
    const parFusion = new Map();
    for (const t of tablesPosees) {
      if (!t.fusion) continue;
      if (!parFusion.has(t.fusion)) parFusion.set(t.fusion, []);
      parFusion.get(t.fusion).push(t);
    }
    const tranches = new Map();
    for (const membres of parFusion.values()) {
      if (membres.length < 2) continue;
      for (const [id, g] of trancherTablee(membres)) tranches.set(id, g);
    }
    if (!tranches.size) return tablesPosees;
    return tablesPosees.map((t) => (tranches.has(t.id)
      ? { ...t, ...tranches.get(t.id), forme: 'rectangle' }
      : t));
  })();

  // Rôle de chaque table dans sa tablée, et clients de toute la tablée pour
  // celle qui porte le numéro (un client par réservation, pas un par table).
  const roleTablee = new Map();
  if (!modePlan) {
    const parFusion = new Map();
    for (const t of tablesSalle) {
      if (!t.fusion) continue;
      if (!parFusion.has(t.fusion)) parFusion.set(t.fusion, []);
      parFusion.get(t.fusion).push(t);
    }
    for (const membres of parFusion.values()) {
      if (membres.length < 2) continue;
      const principale = principaleDe(membres);
      for (const m of membres) roleTablee.set(m.id, m.id === principale.id ? 'principale' : 'secondaire');
    }
  }

  // Bouton ⟳ posé sur la table elle-même, là où on manipule le meuble :
  // dessin du plan de base, ou ajustement de la salle pour ce service. En
  // service, le quart de tour passe par la fiche de la table (le toucher
  // sert déjà à l'ouvrir). Une table ronde ou carrée seule n'a pas de sens ;
  // une tablée rapprochée tourne d'un bloc, par le bouton de la table qui
  // porte son numéro.
  const nonCarree = (t) => Number(t.largeur) !== Number(t.hauteur);
  const tournerSurCanevas = (t) => {
    if (!canEdit) return null;
    if (modePlan) return nonCarree(t) ? tournerTableBase : null;
    if (!ajusterActif || pivotIndispo) return null;
    const role = roleTablee.get(t.id);
    if (role === 'principale') return tournerTablee;
    if (role) return null;
    return nonCarree(t) ? tournerTableService : null;
  };

  // Fiche de la table touchée : la tablée entière, ses places, ses clients.
  const ficheTablee = tableOuverte ? tableeDe(tableOuverte) : [];
  const ficheOccupants = (() => {
    if (!ficheTablee.length) return [];
    const ici = new Set(ficheTablee.map((t) => t.id));
    const ids = new Set((liens || []).filter((l) => ici.has(l.table_id)).map((l) => l.reservation_id));
    return resasService.filter((r) => ids.has(r.id));
  })();
  const ficheTriee    = [...ficheTablee].sort(parNumero);
  const fichePrincipale = principaleDe(ficheTablee);
  // Même règle que partout ailleurs : un no-show n'est pas un couvert.
  const totalService = resasService.filter((r) => r.statut !== 'no_show')
    .reduce((s, r) => s + (r.nb_couverts || 0), 0);
  // Places de TOUTES les salles : la question de l'hôte est « est-ce que le
  // service rentre dans la maison », pas « dans cet onglet ».
  const placesTotales = (tables || []).filter((t) => t.actif !== false)
    .reduce((s, t) => s + (t.nb_places || 0), 0);

  // ── Tablées de toute la maison : propositions, compteurs, états ───────
  // Une table seule forme sa propre tablée. Les places d'une table inactive
  // ne comptent pas.
  const groupes = (() => {
    const parCle = new Map();
    for (const t of tablesVues || []) {
      const cle = t.fusion || t.id;
      if (!parCle.has(cle)) parCle.set(cle, []);
      parCle.get(cle).push(t);
    }
    return [...parCle.values()].map((membres) => {
      const principale = membres.length > 1 ? principaleDe(membres) : membres[0];
      return {
        id: principale.id,
        nom: principale.nom,
        salleId: salleDeTable(principale),
        places: membres.reduce((n, t) => n + (t.actif === false ? 0 : (Number(t.nb_places) || 0)), 0),
        tabouret: membres.length === 1 && estTabouret(principale),
        tableIds: membres.map((t) => t.id),
        actif: membres.some((t) => t.actif !== false),
      };
    }).filter((g) => g.actif);
  })();
  const groupeDeTable = new Map();
  groupes.forEach((g) => g.tableIds.forEach((id) => groupeDeTable.set(id, g)));

  // Réservations du service posées sur chaque table.
  const resaParId = new Map(resasService.map((r) => [r.id, r]));
  const occupations = new Map();
  for (const l of liens || []) {
    const r = resaParId.get(l.reservation_id);
    if (!r) continue;
    if (!occupations.has(l.table_id)) occupations.set(l.table_id, []);
    occupations.get(l.table_id).push(r);
  }
  const resasDeGroupe = (g) => {
    const vus = new Map();
    for (const id of g.tableIds) for (const r of occupations.get(id) || []) vus.set(r.id, r);
    return [...vus.values()];
  };

  // Heure montrée : celle du curseur, sinon maintenant le jour même pendant
  // le service, sinon chaque table montre sa première réservation.
  const bornes = modePlan ? null : bornesCurseur(resasService);
  const heureAuto = jourMeme && bornes && minute >= bornes.min && minute <= bornes.max ? minute : null;
  const heureEffective = heureVue ?? heureAuto;
  const etats = new Map(groupes.map((g) => [g.id, etatTablee(resasDeGroupe(g), heureEffective, maintenant)]));
  const compte = { libre: 0, reservee: 0, atable: 0, retard: 0 };
  etats.forEach((e) => { compte[e.etat] += 1; });
  const nbRetard = resasService.filter((r) => enRetard(r, maintenant)).length;

  // À placer : ni partie, ni no-show, ni demande à confirmer, sans table.
  const aPlacer = resasService.filter((r) => r.statut !== 'parti' && r.statut !== 'no_show'
    && r.statut !== 'demande' && !(tablesParResa.get(r.id) || []).length);
  const optsProp = { maintenant, salleId };
  const propositions = new Map();
  if (canEdit && !modePlan) {
    for (const r of aPlacer) {
      const g = proposer(r, groupes, occupations, optsProp);
      if (g) propositions.set(r.id, g);
    }
  }
  const nomsProposes = new Map([...propositions].map(([id, g]) => [id, g.nom]));

  // Réservation choisie dans la liste, et ce qu'elle allume sur le plan.
  const resaChoisie = choisieId ? resasService.find((r) => r.id === choisieId) || null : null;
  const armeeActive = armee && resaChoisie && canEdit && !modePlan ? armee : null;
  const libresChoisie = armeeActive
    ? new Set(tableesLibres(resaChoisie, groupes, occupations, optsProp).flatMap((g) => g.tableIds))
    : null;
  const proposeeChoisie = armeeActive && armeeActive !== 'ajouter' ? proposer(resaChoisie, groupes, occupations, optsProp) : null;
  const idsProposes = new Set(proposeeChoisie?.tableIds || []);
  const tablesDeChoisie = new Set(resaChoisie
    ? (liens || []).filter((l) => l.reservation_id === resaChoisie.id).map((l) => l.table_id)
    : []);

  const tel = vuePlan.tel;
  const k = vuePlan.k;
  // Sous 900 px d'écran, plan et réservations passent l'un sous l'autre :
  // l'iPad en portrait garde ainsi toute la largeur pour la salle.
  const empile = racineW > 0 && racineW < 900;
  const nomService = SERVICES.find((x) => x.id === serviceActif)?.label || '';

  // ── Gestes du service ───────────────────────────────────────────────
  const montrerTable = (tableId) => {
    const t = (tablesVues || []).find((x) => x.id === tableId);
    if (!t) return;
    const sid = salleDeTable(t);
    if (sid && sid !== salleId) setSalleId(sid);
    setTimeout(() => vuePlan.montrer(Number(t.pos_x) + Number(t.largeur) / 2, Number(t.pos_y) + Number(t.hauteur) / 2), 60);
  };

  function choisirResa(resa) {
    if (choisieId === resa.id) { setChoisieId(null); setArmee(null); return; }
    const placee = (tablesParResa.get(resa.id) || []).length > 0;
    const termine = resa.statut === 'parti' || resa.statut === 'no_show';
    setChoisieId(resa.id);
    setArmee(canEdit && !placee && !termine && resa.statut !== 'demande' ? 'placer' : null);
    if (empile) setVueTel('plan');
    const lien = (liens || []).find((l) => l.reservation_id === resa.id);
    if (lien) montrerTable(lien.table_id);
    else {
      const g = proposer(resa, groupes, occupations, optsProp);
      if (g) montrerTable(g.id);
    }
  }

  async function placerProposee(resa) {
    const g = proposer(resa, groupes, occupations, optsProp);
    if (!g) return;
    if (choisieId === resa.id) { setChoisieId(null); setArmee(null); }
    await poserSurTablee(resa, g.id);
  }

  async function toucherTableService(table) {
    if (Date.now() - finGesteRef.current < 400) return;
    if (Date.now() - vuePlan.finPincementRef.current < 400) return;
    if (armeeActive && resaChoisie) {
      const resa = resaChoisie;
      const geste = armeeActive;
      setChoisieId(null);
      setArmee(null);
      if (geste === 'deplacer') await assignerIci(resa, table.id);
      else await poserSurTablee(resa, table.id);
      return;
    }
    setChoisieId(null);
    setArmee(null);
    setTableOuverte(table.id);
  }

  function toucherTableDessin(table) {
    if (Date.now() - finGesteRef.current < 400) return;
    setSelection(null);
    setSupprEnAttente(false);
    const vraie = (tables || []).find((x) => x.id === table.id) || table;
    if (tableChoisie === table.id) { setEditTable(vraie); return; }
    setTableChoisie(table.id);
  }

  async function supprimerTableChoisie() {
    if (!tableDessinChoisie) return;
    if (!supprEnAttente) { setSupprEnAttente(true); return; }
    setSupprEnAttente(false);
    const { id, nom } = tableDessinChoisie;
    setTableChoisie(null);
    if (await supprimerTable(id)) notify(`Table ${nom} supprimée`, 'info');
  }

  async function confirmerTous() {
    const liste = (planTous || []).filter((p) => p.tablee);
    setPlanTous(null);
    let n = 0;
    for (const p of liste) {
      if (await poserSurTablee(p.resa, p.tablee.id, { silencieux: true })) n += 1;
    }
    if (n) notify(`${n} réservation${n > 1 ? 's' : ''} placée${n > 1 ? 's' : ''}`, 'success');
  }

  async function imprimerPlan() {
    try {
      const { exporterPlanServicePdf } = await import('./planServicePdf.js');
      await exporterPlanServicePdf({
        date, nomService,
        salles: salles || [], tables: tablesVues || [], elements: elements || [],
        groupes, resasParGroupe: new Map(groupes.map((g) => [g.id, resasDeGroupe(g)])),
        resas: resasService, tablesParResa,
      });
    } catch (e) {
      console.error('[PlanSalle] impression du plan', e);
      notify('Le plan du service n’a pas pu être préparé. Réessayez.', 'error');
    }
  }

  // ── Plan vide ───────────────────────────────────────────────────────
  const planVide = (
    <div data-cadre="" style={{ ...ui.carte, alignItems: 'center', textAlign: 'center', padding: '44px 24px' }}>
      <span aria-hidden="true" style={{
        width: 56, height: 56, borderRadius: '50%', background: 'var(--piste)', color: 'var(--text2)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <LayoutGrid size={24} strokeWidth={1.75} />
      </span>
      <div style={{ fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' }}>
        {autresSallesGarnies ? 'Cette salle n’a pas encore de table' : 'Le plan de salle n’est pas encore dessiné'}
      </div>
      <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)', maxWidth: 420, lineHeight: 1.5 }}>
        {canEdit
          ? 'Posez les tables, placez-les au doigt, puis touchez une réservation et sa table pour l’y asseoir.'
          : 'Un responsable doit le dessiner depuis « Dessiner la salle ».'}
      </div>
      {canEdit && <Btn variant="ghost" onClick={() => ouvrirDessin(true)} style={{ minHeight: 44 }}>Ajouter une table</Btn>}
    </div>
  );

  // ── En-tête : service, salle, actions ───────────────────────────────
  const ongletsService = !modePlan && !serviceControle ? (
    <SegmentedTabs
      tabs={SERVICES.map((sv) => ({
        id: sv.id,
        label: couvertsParService[sv.id] ? `${sv.label} (${couvertsParService[sv.id]})` : sv.label,
      }))}
      active={serviceActif}
      onChange={(v) => { setService(v); setHeureVue(null); setChoisieId(null); setArmee(null); }}
      size="sm"
    />
  ) : null;
  const ongletsSalles = (salles || []).length > 1 ? (
    <SegmentedTabs
      tabs={(salles || []).map((sa) => ({
        id: sa.id,
        label: modePlan ? `${sa.nom} (${nbTablesParSalle.get(sa.id) || 0})` : sa.nom,
      }))}
      active={salleId}
      onChange={setSalleId}
      size="sm"
    />
  ) : null;

  const menuService = !modePlan && !ajusterActif ? (
    <BoutonActions
      id="plan-salle-plus"
      titre="Plan de salle"
      label={<Ellipsis size={18} strokeWidth={2} aria-hidden="true" />}
      style={{ ...ui.rond, boxShadow: 'none' }}
      sections={[{
        items: [
          canEdit && !ajustIndispo && (tel || empile) && { titre: 'Déplacer des tables', detail: 'Pour ce service seulement : rapprocher, séparer, tourner.', onClick: () => setAjuster(true) },
          canEdit && { titre: 'Dessiner la salle', detail: 'Le plan de base, pour tous les services.', onClick: () => ouvrirDessin() },
          { titre: 'Imprimer le plan du service', detail: 'Un PDF avec chaque table, ses clients et leurs heures.', onClick: imprimerPlan },
        ],
      }]}
    />
  ) : null;

  const actions = (() => {
    if (modePlan) {
      return (
        <>
          <Btn variant="ghost" onClick={annulerDernier} disabled={!annulations.length} title="Annuler le dernier geste (Ctrl + Z)" style={{ minHeight: 44 }}>
            <Undo2 size={16} strokeWidth={2} aria-hidden="true" /> Annuler
          </Btn>
          <Btn variant="ghost" onClick={() => setGestionSalles(true)} style={{ minHeight: 44 }}>Salles</Btn>
          {onFini && <Btn variant="primary" onClick={() => onFini()} style={{ minHeight: 44 }}>J’ai fini</Btn>}
        </>
      );
    }
    if (ajusterActif) {
      return (
        <>
          {ajustParTable.size > 0 && <Btn variant="ghost" onClick={revenirAuPlanDeBase} style={{ minHeight: 44 }}>Tout remettre en place</Btn>}
          <Btn variant="primary" onClick={() => setAjuster(false)} style={{ minHeight: 44 }}>J’ai fini</Btn>
        </>
      );
    }
    return (
      <>
        {canEdit && !ajustIndispo && !tel && !empile && (
          <Btn variant="ghost" onClick={() => { setAjuster(true); setChoisieId(null); setArmee(null); }} style={{ minHeight: 44 }}>Déplacer des tables</Btn>
        )}
        {menuService}
        {canEdit && propositions.size > 0 && (
          <Btn variant="primary" onClick={() => setPlanTous(planifier(aPlacer, groupes, occupations, optsProp))} style={{ minHeight: 44 }}>
            {empile || aPlacer.length < 2
              ? <><span>Placer</span> <span data-no-translate="">{aPlacer.length}</span></>
              : <><span>Placer les</span> <span data-no-translate="">{aPlacer.length}</span> <span>restants</span></>}
          </Btn>
        )}
      </>
    );
  })();

  // ── Curseur horaire ─────────────────────────────────────────────────
  const curseur = bornes && !ajusterActif ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 260px', minWidth: 0, maxWidth: 460 }}>
      <span style={{ fontSize: 'var(--t2)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
        {heureEffective == null
          ? 'Tout le service'
          : <><span>Salle à</span> <span data-no-translate="" style={{ fontFamily: 'var(--font-num)', color: 'var(--text)' }}>{hhmm(heureEffective)}</span></>}
      </span>
      <input
        type="range"
        min={bornes.min}
        max={bornes.max}
        step={PAS_CURSEUR}
        value={clamp(heureEffective ?? bornes.min, bornes.min, bornes.max)}
        onChange={(e) => setHeureVue(Number(e.target.value))}
        aria-label="Heure montrée par le plan"
        style={{ flex: 1, minWidth: 80, accentColor: 'var(--accent)', minHeight: 32 }}
      />
      {heureVue != null && (
        <button type="button" style={ui.puce} onClick={() => setHeureVue(null)}>
          {heureAuto != null ? 'Maintenant' : 'Tout le service'}
        </button>
      )}
    </div>
  ) : null;

  // ── Bandeau de la réservation choisie ───────────────────────────────
  const bandeauChoix = resaChoisie && !modePlan && !ajusterActif ? (() => {
    const heure = hhmm(minutesDe(resaChoisie.heure_arrivee) ?? 0);
    const nomsTables = tablesParResa.get(resaChoisie.id) || [];
    const fermer = () => { setChoisieId(null); setArmee(null); };
    const fiche = onOpenResa ? <Btn variant="ghost" onClick={() => { fermer(); onOpenResa(resaChoisie); }} style={{ minHeight: 40 }}>Détails</Btn> : null;
    let texte;
    let boutons;
    if (armeeActive === 'placer') {
      texte = (
        <>
          <span>Touchez une table pour placer</span>{' '}
          <span data-no-translate="" style={{ fontWeight: 'var(--g3)' }}>{resaChoisie.nom}</span>
          <span>, </span><span data-no-translate="">{resaChoisie.nb_couverts}</span><span> couv. à </span><span data-no-translate="">{heure}</span><span>.</span>
          {proposeeChoisie && <><span> Table proposée : </span><span data-no-translate="" style={{ fontWeight: 'var(--g3)' }}>{proposeeChoisie.nom}</span><span>.</span></>}
          {!proposeeChoisie && <span> Aucune table libre n’a assez de places : rapprochez des tables ou choisissez-en une.</span>}
        </>
      );
      boutons = <>{proposeeChoisie && <Btn variant="ghost" onClick={() => placerProposee(resaChoisie)} style={{ minHeight: 40 }}><span>Table</span> <span data-no-translate="">{proposeeChoisie.nom}</span></Btn>}{fiche}</>;
    } else if (armeeActive === 'deplacer' || armeeActive === 'ajouter') {
      texte = (
        <>
          <span>{armeeActive === 'deplacer' ? 'Touchez la nouvelle table de' : 'Touchez la table à ajouter pour'}</span>{' '}
          <span data-no-translate="" style={{ fontWeight: 'var(--g3)' }}>{resaChoisie.nom}</span><span>.</span>
        </>
      );
      boutons = <Btn variant="ghost" onClick={() => setArmee(null)} style={{ minHeight: 40 }}>Annuler</Btn>;
    } else {
      const termine = resaChoisie.statut === 'parti' || resaChoisie.statut === 'no_show';
      texte = (
        <>
          <span data-no-translate="" style={{ fontWeight: 'var(--g3)' }}>{resaChoisie.nom}</span>
          <span>, </span><span data-no-translate="">{resaChoisie.nb_couverts}</span><span> couv. à </span><span data-no-translate="">{heure}</span>
          {nomsTables.length > 0 && <><span>, table </span><span data-no-translate="">{nomsTables.join(' + ')}</span></>}
          <span>.</span>
        </>
      );
      boutons = (
        <>
          {canEdit && !termine && nomsTables.length > 0 && (
            <Btn variant="ghost" onClick={() => setArmee('deplacer')} style={{ minHeight: 40 }}>Changer de table</Btn>
          )}
          {fiche}
          {canEdit && !termine && nomsTables.length > 0 && (
            <BoutonActions
              id="plan-salle-resa"
              titre={resaChoisie.nom}
              label="Plus"
              style={{ ...ui.puce, minHeight: 40 }}
              sections={[{
                items: [
                  { titre: 'Ajouter une table', detail: 'La tablée s’étend sur une table de plus.', onClick: () => setArmee('ajouter') },
                  {
                    titre: 'Retirer du plan',
                    detail: 'La réservation repasse dans « À placer ».',
                    onClick: async () => {
                      const ids = new Set(tablesDeChoisie);
                      const resa = resaChoisie;
                      fermer();
                      if (await retirerLiens((liensRef.current || []).filter((l) => l.reservation_id === resa.id && ids.has(l.table_id)))) {
                        notify(`${resa.nom} retiré du plan`, 'info');
                      }
                    },
                  },
                ],
              }]}
            />
          )}
        </>
      );
    }
    return (
      <div style={ui.bandeauChoix} data-plan-choix="">
        <span style={ui.bandeauTexte}>{texte}</span>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {boutons}
          <button type="button" aria-label="Lâcher la réservation" title="Lâcher (Échap)" onClick={fermer} style={{ ...ui.rond, boxShadow: 'none' }}>
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      </div>
    );
  })() : null;

  // ── Rangées du dessin ───────────────────────────────────────────────
  const supprimerStyle = {
    ...ui.puce,
    borderColor: supprEnAttente ? 'var(--danger-fill)' : 'var(--btn-bord)',
    background: supprEnAttente ? 'var(--danger-fill)' : 'var(--btn-fond)',
    color: supprEnAttente ? 'var(--on-danger)' : 'var(--danger-text)',
  };
  const rangeeDessin = modePlan ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
      {elementChoisi ? (
        <>
          <span style={{ flexShrink: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginRight: 4, whiteSpace: 'nowrap' }}>
            {defChoisi?.label}
            {defChoisi?.nomme && elementChoisi.libelle ? ` « ${elementChoisi.libelle} »` : ''}
          </span>
          {(elementChoisi.type === 'porte' || Number(elementChoisi.largeur) !== Number(elementChoisi.hauteur)) && (
            <button type="button" style={ui.puce} onClick={() => tournerElement(elementChoisi)}>Tourner</button>
          )}
          {defChoisi?.nomme && <button type="button" style={ui.puce} onClick={() => setNommer(elementChoisi)}>Nommer</button>}
          <button type="button" style={ui.puce} onClick={() => dupliquerElement(elementChoisi)}>Dupliquer</button>
          <button type="button" onClick={() => supprimerElement(elementChoisi)} style={supprimerStyle}>
            {supprEnAttente ? 'Confirmer la suppression' : 'Supprimer'}
          </button>
          <button type="button" style={{ ...ui.puce, marginLeft: 'auto' }} onClick={() => { setSelection(null); setSupprEnAttente(false); }}>Fermer</button>
        </>
      ) : tableDessinChoisie ? (
        <>
          <span style={{ flexShrink: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginRight: 4, whiteSpace: 'nowrap' }}>
            <span>{estTabouret(tableDessinChoisie) ? 'Place de bar' : 'Table'}</span>{' '}
            <span data-no-translate="">{tableDessinChoisie.nom}</span>
            {!estTabouret(tableDessinChoisie) && (
              <span style={{ fontWeight: 'var(--g1)', color: 'var(--text2)' }}>
                <span>, </span><span data-no-translate="">{tableDessinChoisie.nb_places || 0}</span> <span>places</span>
              </span>
            )}
          </span>
          <button type="button" style={ui.puce} onClick={() => setEditTable(tableDessinChoisie)}>Régler</button>
          {nonCarree(tableDessinChoisie) && <button type="button" style={ui.puce} onClick={() => tournerTableBase(tableDessinChoisie.id)}>Tourner</button>}
          <button type="button" style={ui.puce} onClick={() => dupliquerTable(tableDessinChoisie)}>Dupliquer</button>
          <button type="button" onClick={supprimerTableChoisie} style={supprimerStyle}>
            {supprEnAttente ? 'Confirmer la suppression' : 'Supprimer'}
          </button>
          <button type="button" style={{ ...ui.puce, marginLeft: 'auto' }} onClick={() => { setTableChoisie(null); setSupprEnAttente(false); }}>Fermer</button>
        </>
      ) : (
        <>
          <span style={{ flexShrink: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text2)', marginRight: 2, whiteSpace: 'nowrap' }}>Ajouter</span>
          {MODELES_TABLE.map((m) => (
            <button key={m.cle} type="button" style={ui.puce} onClick={() => ajouterTable(m)}>{m.label}</button>
          ))}
          <button type="button" style={ui.puce} onClick={() => ajouterTable()}>Autre table</button>
          {!elementsIndispo && (
            <>
              <button type="button" style={ui.puce} onClick={ajouterTabouret}>Place de bar</button>
              {ELEMENTS.map((def) => (
                <button key={def.type} type="button" style={ui.puce} onClick={() => ajouterElement(def.type)}>{def.label}</button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  ) : null;

  // ── La salle à l'échelle ────────────────────────────────────────────
  const cadres = modePlan ? [] : groupes
    .filter((g) => g.tableIds.length > 1)
    .map((g) => {
      const membres = tablesPosees.filter((t) => g.tableIds.includes(t.id));
      return membres.length > 1 ? { g, c: cadreDe(membres) } : null;
    })
    .filter(Boolean);

  const salle = (
    <div
      ref={vuePlan.salleRef}
      onClick={modePlan ? (e) => {
        if (e.target !== e.currentTarget) return;
        setSelection(null);
        setTableChoisie(null);
        setSupprEnAttente(false);
      } : undefined}
      style={{ position: 'absolute', left: -vuePlan.origineX, top: -vuePlan.origineY, width: vuePlan.canevasW, height: vuePlan.canevasH }}
    >
      {modePlan && <GrillePlan fine={vuePlan.canevasW >= 700} />}
      {elementsSalle.map((el) => (
        <ElementDecor
          key={el.id}
          el={el}
          editable={modePlan}
          selectionne={modePlan && selection === el.id}
          onPointerDown={onPointerDownElement}
          onPoignee={onPointerDownPoignee}
          onClick={(x) => { setTableChoisie(null); toucherElement(x); }}
          onDoubleClick={(x) => { if (ELEMENT_PAR_TYPE.get(x.type)?.nomme) setNommer(x); }}
        />
      ))}
      {guides.map((gd) => (
        <span
          key={`${gd.axe}-${gd.v}`}
          aria-hidden="true"
          style={gd.axe === 'x'
            ? { position: 'absolute', left: gd.v * k, top: 0, bottom: 0, width: 0, borderLeftWidth: 1, borderLeftStyle: 'dashed', borderLeftColor: 'var(--accent)', pointerEvents: 'none', zIndex: 8 }
            : { position: 'absolute', top: gd.v * k, left: 0, right: 0, height: 0, borderTopWidth: 1, borderTopStyle: 'dashed', borderTopColor: 'var(--accent)', pointerEvents: 'none', zIndex: 8 }}
        />
      ))}
      {cadres.map(({ g, c }) => (
        <span
          key={`cadre-${g.id}`}
          aria-hidden="true"
          style={{
            position: 'absolute', zIndex: 1, pointerEvents: 'none', boxSizing: 'border-box',
            left: c.x0 * k - 9, top: c.y0 * k - 9, width: (c.x1 - c.x0) * k + 18, height: (c.y1 - c.y0) * k + 18,
            borderRadius: 'var(--r-lg)', borderWidth: 2, borderStyle: 'solid',
            borderColor: COULEUR_ETAT[etats.get(g.id)?.etat || 'libre'],
          }}
        />
      ))}
      {tablesDessinees.map((t) => {
        const g = groupeDeTable.get(t.id);
        const e = etats.get(g?.id || t.id) || null;
        const role = roleTablee.get(t.id) || null;
        const parle = role !== 'secondaire';
        const lienAffiche = e?.affichee && g
          ? (liens || []).find((l) => l.reservation_id === e.affichee.id && g.tableIds.includes(l.table_id))
          : null;
        const glisseResa = modeTable === 'service' && canEdit && !tel && !!lienAffiche;
        let onDown;
        if (modeTable === 'plan') onDown = (ev) => onPointerDownTable(ev, t);
        else if (modeTable === 'ajuster') onDown = (ev) => onPointerDownTableService(ev, t);
        else if (glisseResa) onDown = (ev) => onPointerDownOccupant(ev, lienAffiche, e.affichee);
        return (
          <PlanTable
            key={t.id}
            t={t}
            k={k}
            mode={modeTable}
            etat={e?.etat || 'libre'}
            role={role}
            info={parle ? e : null}
            places={g?.places ?? (Number(t.nb_places) || 0)}
            deplacable={modeTable !== 'service' ? canEdit : glisseResa}
            cible={!!cibleIds?.has(t.id)}
            convient={!!libresChoisie?.has(t.id) && !idsProposes.has(t.id)}
            proposee={idsProposes.has(t.id)}
            choisie={modePlan ? tableChoisie === t.id : armeeActive !== 'placer' && tablesDeChoisie.has(t.id)}
            enGlisse={!!enDeplacement?.has(t.id) || (!!drag?.demarre && drag.kind === 'table' && drag.tableId === t.id)}
            onPointerDown={onDown}
            onClick={modeTable === 'plan' ? () => toucherTableDessin(t) : () => toucherTableService(t)}
            onDoubleClick={modeTable === 'plan' && canEdit ? () => setEditTable((tables || []).find((x) => x.id === t.id) || t) : undefined}
            onTourner={tournerSurCanevas(t)}
          />
        );
      })}
    </div>
  );

  const zoomTel = tel ? (
    <div style={{ position: 'absolute', right: 24, bottom: 24, zIndex: 3, display: 'flex', gap: 8 }}>
      {vuePlan.zoom > 1.001 ? (
        <BoutonRond label="Voir toute la salle" onClick={() => vuePlan.zoomer(1)}><Minimize2 size={18} strokeWidth={2} aria-hidden="true" /></BoutonRond>
      ) : (
        <BoutonRond label="Agrandir le plan" onClick={() => vuePlan.zoomer(vuePlan.zoomLisible > 1.001 ? vuePlan.zoomLisible : vuePlan.zoomMax)} disabled={vuePlan.zoomMax <= 1.001}>
          <Maximize2 size={18} strokeWidth={2} aria-hidden="true" />
        </BoutonRond>
      )}
      <BoutonRond label="Zoom arrière" onClick={() => vuePlan.zoomer(vuePlan.zoom / 1.4)} disabled={vuePlan.zoom <= 1.001}><Minus size={18} strokeWidth={2} aria-hidden="true" /></BoutonRond>
      <BoutonRond label="Zoom avant" onClick={() => vuePlan.zoomer(vuePlan.zoom * 1.4)} disabled={vuePlan.zoom >= vuePlan.zoomMax - 0.001}><Plus size={18} strokeWidth={2} aria-hidden="true" /></BoutonRond>
    </div>
  ) : null;

  const cartePlan = (
    <div style={ui.carte} data-cadre="" data-plan-carte="">
      {!modePlan && !ajusterActif && !bandeauChoix && (
        <div style={ui.enteteCarte}>
          <div style={tel ? { ...ui.compteurs, flexWrap: 'nowrap', overflowX: 'auto', flex: '1 1 100%', scrollbarWidth: 'none' } : ui.compteurs} aria-live="polite">
            <Compteur couleur={COULEUR_ETAT.libre} n={compte.libre} un="libre" plusieurs="libres" />
            <Compteur couleur={COULEUR_ETAT.reservee} n={compte.reservee} un="réservée" plusieurs="réservées" />
            <Compteur couleur={COULEUR_ETAT.atable} n={compte.atable} un="à table" plusieurs="à table" />
            {nbRetard > 0 && <Compteur couleur={COULEUR_ETAT.retard} n={nbRetard} un="en retard" plusieurs="en retard" />}
          </div>
          {curseur}
          {!empile && (
            <BoutonRond
              label={listeRepliee ? 'Afficher les réservations' : 'Masquer les réservations'}
              onClick={() => setListeRepliee((v) => { writeJson(CLE_LISTE_REPLIEE, !v); return !v; })}
            >
              {listeRepliee ? <PanelRightOpen size={18} strokeWidth={2} aria-hidden="true" /> : <PanelRightClose size={18} strokeWidth={2} aria-hidden="true" />}
            </BoutonRond>
          )}
        </div>
      )}
      {ajusterActif && (
        <div style={ui.bandeauChoix}>
          <span style={ui.bandeauTexte}>
            <span style={{ fontWeight: 'var(--g3)' }}>Vous déplacez des tables pour ce service seulement.</span>{' '}
            <span>Glissez une table pour la déplacer, lâchez-la sur une autre pour les rapprocher, touchez-la pour la séparer ou la tourner.</span>
          </span>
        </div>
      )}
      {bandeauChoix}
      {rangeeDessin}
      <div ref={vuePlan.colRef} style={{ width: '100%', minWidth: 0 }}>
        {vuePlan.pret && (tel ? (
          <div ref={vuePlan.fenetreRef} data-plan-fenetre="" style={{ ...ui.fenetreTel, width: vuePlan.largeur, height: vuePlan.fenetreH }}>
            <div style={{ position: 'relative', width: vuePlan.surfaceW, height: vuePlan.surfaceH }}>{salle}</div>
          </div>
        ) : (
          <div data-plan-sol="" style={{ ...ui.sol, width: vuePlan.largeur, height: vuePlan.hauteur }}>{salle}</div>
        ))}
      </div>
      {modePlan && !tel && (
        <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)', lineHeight: 1.5 }}>
          Touchez une table ou un élément pour le choisir, glissez pour le déplacer. Flèches du clavier pour l’ajuster, Ctrl + Z pour annuler.
        </div>
      )}
      {zoomTel}
    </div>
  );

  const listeVisible = !modePlan && (empile ? vueTel === 'liste' : !listeRepliee);
  const liste = listeVisible ? (() => {
    const survolRetrait = drag?.demarre && drag?.kind === 'lien' && drag?.over?.liste;
    const contenu = (
      <>
        <PlanListe
          resas={resasService}
          tablesParResa={tablesParResa}
          minute={maintenant}
          canEdit={canEdit}
          glisser={!tel && !empile}
          choisieId={choisieId}
          dragResaId={drag?.demarre && drag?.kind === 'resa' ? drag.resaId : null}
          retraitPossible={!!(drag?.demarre && drag?.kind === 'lien')}
          propositions={nomsProposes}
          onChoisir={choisirResa}
          onPointerDownResa={onPointerDownResa}
          onPlacer={placerProposee}
          onStatut={onStatut}
          onTraiter={onTraiter}
        />
        <div style={{
          marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)',
          fontSize: 'var(--t1)', color: 'var(--text3)', lineHeight: 1.5,
        }}>
          <span data-no-translate="">{totalService}</span> <span>{totalService > 1 ? 'couverts' : 'couvert'}</span>
          <span>, </span><span data-no-translate="">{placesTotales}</span> <span>{placesTotales > 1 ? 'places en salle' : 'place en salle'}</span>
        </div>
      </>
    );
    if (empile) {
      return (
        <div data-plan-liste="1" data-cadre="" style={{ ...ui.liste, width: '100%', borderColor: 'var(--rule-soft)' }}>
          {contenu}
        </div>
      );
    }
    return (
      <div style={{ position: 'relative', alignSelf: 'stretch', width: 'clamp(280px, 30%, 360px)', flexShrink: 0, minHeight: 320 }}>
        <div
          data-plan-liste="1"
          data-cadre=""
          style={{ ...ui.liste, position: 'absolute', inset: 0, borderColor: survolRetrait ? 'var(--accent)' : 'var(--rule-soft)' }}
        >
          {contenu}
        </div>
      </div>
    );
  })() : null;

  return (
    <div ref={setRacineEl} style={ui.racine} data-plan-salle="">
      {(nonActualise || resasNonActualisees) && (
        <BandeauNonActualise onRetry={() => Promise.all([onRelireResas?.(), load()])} />
      )}

      <div style={ui.barre}>
        {ongletsService}
        {ongletsSalles}
        <div style={{ flex: 1 }} />
        {!(empile && !modePlan && !aucuneTable) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div>
        )}
      </div>

      {empile && !modePlan && !aucuneTable && (
        <div style={ui.barre}>
          <SegmentedTabs
            tabs={[
              { id: 'plan', label: 'Plan' },
              { id: 'liste', label: aPlacer.length ? <><span>Réservations</span> <span data-no-translate="">{`(${aPlacer.length})`}</span></> : 'Réservations' },
            ]}
            active={vueTel}
            onChange={setVueTel}
            size="sm"
          />
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{actions}</div>
        </div>
      )}

      {aucuneTable && !enService && planVide}

      {(!aucuneTable || enService) && (
        <div style={ui.corps}>
          {aucuneTable ? <div style={{ flex: 1, minWidth: 0 }}>{planVide}</div> : (!empile || vueTel === 'plan' || modePlan) && cartePlan}
          {liste}
        </div>
      )}

      {/* ── Fantôme qui suit le doigt ── */}
      {drag?.demarre && (drag.kind === 'resa' || drag.kind === 'lien') && (
        <div style={{
          position: 'fixed', left: drag.x, top: drag.y,
          transform: 'translate(-50%, -140%)',
          pointerEvents: 'none', zIndex: 2000,
          padding: '6px 12px', borderRadius: 'var(--r-full)',
          background: 'var(--accent)', color: 'var(--on-accent)',
          fontSize: 'var(--t2)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)',
          boxShadow: 'var(--sh-lg)', whiteSpace: 'nowrap',
        }} data-no-translate>
          {drag.resa?.nom}, {drag.resa?.nb_couverts} pax
        </div>
      )}

      {/* ── Placer les restants : la proposition, validée en un geste ── */}
      {planTous && (
        <Fenetre
          id="plan-placer-tous"
          titre="Placer les réservations restantes"
          sousTitre="Chacune sur la plus petite table libre qui la tient."
          onClose={() => setPlanTous(null)}
          pied={(
            <>
              <button type="button" style={stF.secondaire} onClick={() => setPlanTous(null)}>Annuler</button>
              {planTous.some((p) => p.tablee) && (
                <button type="button" style={stF.primaire} onClick={confirmerTous}>
                  <span>Placer</span> <span data-no-translate="">{planTous.filter((p) => p.tablee).length}</span>
                </button>
              )}
            </>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {planTous.map(({ resa, tablee }) => (
              <div key={resa.id} style={{
                display: 'flex', alignItems: 'baseline', gap: 10, minHeight: 44, padding: '8px 0',
                borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
              }}>
                <span data-no-translate="" style={{ fontFamily: 'var(--font-num)', color: 'var(--text2)', flexShrink: 0 }}>{hhmm(minutesDe(resa.heure_arrivee) ?? 0)}</span>
                <span data-no-translate="" style={{ fontWeight: 'var(--g2)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resa.nom}</span>
                <span style={{ color: 'var(--text2)', flexShrink: 0 }}><span data-no-translate="">{resa.nb_couverts}</span> <span>couv.</span></span>
                <span style={{ flexShrink: 0, fontWeight: 'var(--g2)', color: tablee ? 'var(--text)' : 'var(--warning-text)' }}>
                  {tablee ? <><span>Table</span> <span data-no-translate="">{tablee.nom}</span></> : 'Aucune table libre'}
                </span>
              </div>
            ))}
          </div>
        </Fenetre>
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
          tabouretPossible={!elementsIndispo}
        />
      )}

      {/* ── Nom d'un élément de décor (zone, bar, accueil) ── */}
      {nommer && modePlan && (
        <PlanElementForm
          key={nommer.id}
          element={nommer}
          onClose={() => setNommer(null)}
          onSave={enregistrerElement}
        />
      )}

      {/* ── Table touchée : passage, réserver, assigner, clients assis ──
          key : une fiche par table, l'étape en cours ne passe pas à la
          suivante. */}
      {tableOuverte && ficheTablee.length > 0 && !modePlan && (
        <TableServiceSheet
          key={tableOuverte}
          titre={`${estTabouret(fichePrincipale) ? 'Place de bar' : 'Table'} ${fichePrincipale?.nom ?? ''}`}
          composition={ficheTriee.length > 1 ? `Tables ${ficheTriee.map((t) => t.nom).join(' + ')} rapprochées` : ''}
          numeros={ficheTriee.length > 1 ? ficheTriee.map((t) => ({ id: t.id, nom: t.nom })) : []}
          numeroActuel={fichePrincipale?.id}
          onChoisirNumero={canEdit && !ajustIndispo ? (id) => choisirNumero(tableOuverte, id) : undefined}
          places={ficheTablee.reduce((n, t) => n + (t.actif === false ? 0 : (t.nb_places || 0)), 0)}
          occupants={ficheOccupants}
          resasService={resasService}
          tablesParResa={tablesParResa}
          canEdit={canEdit}
          ajuster={ajusterActif}
          groupe={ficheTablee.length > 1}
          deplacee={!!(ficheTablee[0]?.deplacee || ficheTablee[0]?.pivotee)}
          verticale={ficheTablee.length > 0 && (() => {
            const c = cadreDe(ficheTablee);
            return c.y1 - c.y0 > c.x1 - c.x0;
          })()}
          onTourner={canEdit && !ajustIndispo && !pivotIndispo
            && (ficheTablee.length > 1 || nonCarree(ficheTablee[0]))
            ? () => tournerTablee(tableOuverte) : undefined}
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
