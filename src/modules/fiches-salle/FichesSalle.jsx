import React from 'react';
import { ArrowLeft, Clock, Wine } from 'lucide-react';
import { confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { canManageModule } from '../../data/demoData.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { Btn, encadreStyle, encadreTitreStyle } from '../../components/ui/index.jsx';
import { useCartes } from '../../hooks/useCartes.js';
import CarteTabBar from '../../components/cartes/CarteTabBar.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import {
  ALLERGENE_IDS, ALLERGENES_LABELS, labelAllergene,
  normalizeAllergenes, partitionAllergenes,
} from '../../utils/allergenes.js';
import { makeSearchMatcher, normalizeSearch } from '../../utils/searchText.js';
import { BoutonActions } from '../../components/ui/Fenetres.jsx';
import { messageErreur } from '../../utils/messageErreur.js';
import { useEcranModule, ECRAN_ACCUEIL } from '../../components/parcours/useEcranModule.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import BandeauNonActualise from '../previsions/BandeauNonActualise.jsx';
import VignetteFiche from '../../components/fiches/VignetteFiche.jsx';
import SectionFiches, { GrilleFiches } from '../../components/fiches/SectionFiches.jsx';
import PhotoFiche from '../../components/fiches/PhotoFiche.jsx';
import AllergenesFiche from '../../components/fiches/AllergenesFiche.jsx';
import { estCategorieTechnique, photoDeFicheSalle } from '../../components/fiches/rangementFiches.js';
import { categorieDuPlat, categoriesPresentes, grouperParCategorie } from '../../utils/categoriesPlat.js';


// ─────────────────────────────────────────────────────
// FICHES TECHNIQUES SALLE - Descriptions, allergènes, accords mets & vins
// Lecture : serveurs / Édition : consultant, patron, resp_cuisine
// ─────────────────────────────────────────────────────

// Allergènes : référentiel partagé (src/utils/allergenes.js), affichés en
// picto + libellé par AllergenesFiche, dans le langage allergènes de l'app
// (jetons warning). Les couleurs propres au module, en dur, illisibles en
// sombre et sous le seuil AA pour certaines (céleri, moutarde), ont disparu.

// Nouvel essai de lecture des fiches après un échec : 4 s, doublé, 30 s au plus.
const ESSAI_MIN_MS = 4000;
const ESSAI_MAX_MS = 30000;

// Date ISO (2026-10-14) en date suisse (14.10.2026) ; un autre texte passe tel quel.
const dateSuisse = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10).split('-').reverse().join('.') : (v || ''));

// Familles de boissons pour les accords. L'ordre est celui des onglets.
// Les fiches n'avaient que « vin » et « sans_alcool » : une maison qui sert
// ses propres cocktails, ses spiritueux et une carte de thés n'avait aucun
// endroit où les poser, tout finissait empilé sous « Sans alcool ».
const ACCORD_TYPES = [
  { id: 'vin', label: 'Vins' },
  { id: 'cocktail', label: 'Cocktails' },
  { id: 'spiritueux', label: 'Spiritueux' },
  { id: 'the', label: 'Thés & infusions' },
  { id: 'sans_alcool', label: 'Sans alcool' },
];
const ACCORD_TYPE_IDS = ACCORD_TYPES.map(t => t.id);
const accordLabel = (type) => (ACCORD_TYPES.find(t => t.id === type) || {}).label || 'Boisson';

// Catégories de recettes « techniques » (sauces, fonds, bases, garnitures,
// préparations) : pas des plats servis au client, elles ne donnent pas lieu
// à une fiche salle. Liste partagée avec la vitrine des fiches
// (rangementFiches.js) ; une recette sans catégorie reste servie.
const estRecetteServie = (categorie) => !estCategorieTechnique(categorie);

const INITIAL_FICHES = [
  {
    id:'fs1', platId:'p1', nom:'Velouté d\'asperges vertes, crème de chèvre',
    categorie:'Entrées', statut:'active',
    descriptionService:'Velouté onctueux d\'asperges vertes du printemps, servi chaud avec une quenelle de crème de chèvre frais montée, ciboulette ciselée et quelques pointes d\'asperges en décoration. Texture lisse, goût végétal prononcé.',
    temperatureService:'Chaud - servir immédiatement',
    dressageNotes:'Assiette creuse préchauffée. Verser le velouté en salle si possible (effet théâtral).',
    allergenes:['lactose'],
    accords:[
      { type:'vin', nom:'Pouilly-Fumé 2022', region:'Loire', notes:'Minéralité et herbes fraîches, accord parfait avec l\'asperge.' },
      { type:'vin', nom:'Chassagne-Montrachet', region:'Bourgogne', notes:'Pour les amateurs de vin boisé.' },
      { type:'sans_alcool', nom:'Eau pétillante Badoit + citron vert', region:'', notes:'Fraîcheur neutre.' },
    ],
    infosService:'Végétarien. Sans gluten. Peut être adapté sans lactose sur demande (remplacer chèvre par huile d\'olive).',
    tempsPreparation:'8 min',
    modifiePar:'u1', modifie:'2026-04-18',
  },
  {
    id:'fs2', platId:'p2', nom:'Tartare de saumon Label Rouge, condiments',
    categorie:'Entrées', statut:'active',
    descriptionService:'Tartare de saumon Label Rouge coupé au couteau, assaisonné citron-aneth, accompagné de câpres, échalotes confites, crème acidulée et blinis maison tièdes. Servi frais en verrine ou à l\'assiette.',
    temperatureService:'Froid - sortir du réfrigérateur au moment du service.',
    dressageNotes:'Dresser à la dernière minute. Ne pas laisser en salle plus de 5 minutes.',
    allergenes:['poissons','gluten','oeufs','lactose'],
    accords:[
      { type:'vin', nom:'Sancerre blanc 2023', region:'Loire', notes:'Sauvignon minéral, frais, classique avec le saumon.' },
      { type:'vin', nom:'Chablis Premier Cru', region:'Bourgogne', notes:'Iodé et tendu - sublime le poisson cru.' },
      { type:'sans_alcool', nom:'Kombucha gingembre-citron', region:'', notes:'Acidité complémentaire.' },
    ],
    infosService:'Contient poisson cru. Préciser au client en cas de doute. Femmes enceintes : déconseillé.',
    tempsPreparation:'5 min',
    modifiePar:'u1', modifie:'2026-04-15',
  },
  {
    id:'fs3', platId:'p3', nom:'Risotto aux champignons sauvages',
    categorie:'Plats', statut:'active',
    descriptionService:'Risotto mantecato à base de riz Arborio, champignons sauvages sautés à vif (cèpes, girolles, pleurotes selon arrivage). Lié au parmesan AOP et beurre. Crémeux, al dente, parfumé. Plat signature de la maison.',
    temperatureService:'Chaud - service immédiat après dressage. Ne pas faire attendre.',
    dressageNotes:'Assiette creuse préchauffée obligatoire. Copeaux de parmesan + huile de truffe blanche en finition.',
    allergenes:['lactose','gluten','sulfites'],
    accords:[
      { type:'vin', nom:'Barolo 2019', region:'Piémont', notes:'Accord terre-à-terre, truffe et champignons, accord remarquable.' },
      { type:'vin', nom:'Gevrey-Chambertin', region:'Bourgogne', notes:'Pinot Noir sur le terroir, élégant avec les champignons.' },
      { type:'vin', nom:'Barbera d\'Asti', region:'Piémont', notes:'Plus accessible, fruité et équilibré.' },
      { type:'sans_alcool', nom:'Jus de raisin Muscat pétillant', region:'', notes:'Douceur et effervescence légère.' },
    ],
    infosService:'Végétarien. Plat signature - ne pas modifier sans accord chef. Informer le client de la composition exacte (champignons sauvages variables selon saison).',
    tempsPreparation:'20 min',
    modifiePar:'u1', modifie:'2026-04-18',
  },
  {
    id:'fs4', platId:'p4', nom:'Pavé de bœuf Simmental, jus corsé',
    categorie:'Plats', statut:'active',
    descriptionService:'Pavé de bœuf Simmental (race AOP Suisse) grillé en poêle fonte, reposé, servi avec jus de veau corsé monté au beurre. Cuisson proposée : saignant, rosé ou à point - demander impérativement au client.',
    temperatureService:'Chaud - assiette chaude. Servir dans les 2 minutes après dressage.',
    dressageNotes:'Dresser le pavé légèrement en biais. Saucer en salle si possible. Accompagnement selon menu du soir.',
    allergenes:['lactose'],
    accords:[
      { type:'vin', nom:'Saint-Émilion Grand Cru 2018', region:'Bordeaux', notes:'Merlot charnu, tanins soyeux - accord classique avec le bœuf.' },
      { type:'vin', nom:'Châteauneuf-du-Pape 2019', region:'Rhône', notes:'Puissance et épices pour les amateurs de vins de caractère.' },
      { type:'vin', nom:'Amarone della Valpolicella', region:'Vénétie', notes:'Pour les grandes occasions.' },
    ],
    infosService:'Demander systématiquement la cuisson souhaitée. Informer : viande maturée 21 jours, origine Suisse certifiée. Allergie au lactose : possible sans beurre de montage sur demande.',
    tempsPreparation:'12 min',
    modifiePar:'u1', modifie:'2026-04-10',
  },
  {
    id:'fs5', platId:'p6', nom:'Tarte citron meringuée façon Comptoir',
    categorie:'Desserts', statut:'active',
    descriptionService:'Tarte individuelle sur pâte sucrée sablée, garnie d\'une crème au citron frais intense, surmontée d\'une meringue italienne pochée et torchée au chalumeau en salle. Dessert signature acidulé-sucré.',
    temperatureService:'Température ambiante. Sortir 10 min avant le service. Meringue torchée à la minute.',
    dressageNotes:'Proposer le torchage en salle si possible (show). Zestes de citron confits + feuille de mélisse.',
    allergenes:['gluten','oeufs','lactose'],
    accords:[
      { type:'vin', nom:'Sauternes Château d\'Yquem', region:'Bordeaux', notes:'Accord classique acidité-sucre, sublime avec le citron.' },
      { type:'vin', nom:'Muscat de Beaumes-de-Venise', region:'Rhône', notes:'Floral et agrumes, plus accessible.' },
      { type:'sans_alcool', nom:'Thé vert Gyokuro infusé froid', region:'Japon', notes:'Umami et fraîcheur, contraste élégant.' },
    ],
    infosService:'Dessert signature - ne jamais proposer de modification. Peut être servi sans meringue pour allergie aux œufs (crème citron seule). Contient gluten.',
    tempsPreparation:'3 min',
    modifiePar:'u1', modifie:'2026-03-22',
  },
];

const FichesSalle = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const [fiches, setFiches] = React.useState([]);
  const [recettes, setRecettes] = React.useState([]);
  const [plats, setPlats] = React.useState([]);
  // Lecture des fiches : 'loading' | 'ready' | 'error'. Une lecture en échec
  // ne s'affiche jamais comme une liste vide (« Aucune fiche pour ces
  // critères. » faisait passer une panne pour un établissement sans fiche).
  // fichesLues : une lecture a abouti au moins une fois ; un échec ensuite
  // garde les fiches à l'écran, avec le bandeau « non actualisé ».
  const [statutLecture, setStatutLecture] = React.useState(() => (legacySB ? 'loading' : 'ready'));
  const [fichesLues, setFichesLues] = React.useState(!legacySB);
  const lireFichesRef = React.useRef(null);
  const online = useOnlineStatus();
  const [selected, setSelected] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('Tous');
  const [showForm, setShowForm] = React.useState(false);
  const [editFiche, setEditFiche] = React.useState(null);
  const [bulkProgress, setBulkProgress] = React.useState(null);
  const bulkCancelRef = React.useRef(false);
  const [selBusy, setSelBusy] = React.useState(false);
  const [showBulkCartes, setShowBulkCartes] = React.useState(false);
  const sel = useSelection();

  // Le détail d'une fiche est un écran du module : le geste retour et Échap
  // reviennent à la grille au lieu de quitter le module. Aucun écran repris :
  // une fiche ne se rouvre pas d'elle-même à l'ouverture suivante.
  const { ecran, setEcran, retourAccueil } = useEcranModule('fiches_salle', { surRetour: () => setSelected(null) });
  // Au retour, la grille revient sur la fiche quittée plutôt qu'au défilement
  // du détail (on reprenait la recherche du plat depuis le haut).
  const ficheQuitteeRef = React.useRef(null);
  const carteQuitteeRef = React.useRef(null);
  const ouvrirFiche = (f) => { ficheQuitteeRef.current = f.id; setSelected(f); setEcran('fiche'); };
  React.useLayoutEffect(() => {
    if (ecran !== ECRAN_ACCUEIL || !ficheQuitteeRef.current) return;
    const carte = carteQuitteeRef.current;
    const r = carte?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) carte.scrollIntoView({ block: 'center' });
    ficheQuitteeRef.current = null;
  }, [ecran]);

  // Formulaire ouvert depuis le détail : Échap ne referme pas l'écran, la
  // saisie serait perdue (le crochet partagé ignore un Échap déjà annulé).
  React.useEffect(() => {
    if (ecran === ECRAN_ACCUEIL || !showForm) return undefined;
    const garde = (e) => { if (e.key === 'Escape') e.preventDefault(); };
    document.addEventListener('keydown', garde, true);
    return () => document.removeEventListener('keydown', garde, true);
  }, [ecran, showForm]);

  // Cartes (menus) - onglets de filtrage. '__all__' = toutes les fiches.
  const ALL_TAB = '__all__';
  // Rôle transmis au hook : une carte cachée depuis « Cartes & Recettes »
  // disparaît aussi des onglets d'ici pour tout le monde sauf le consultant.
  const { cartes, archivedCartes, addCarte, renameCarte, archiveCarte, deleteCarte } = useCartes(etabId, { role: user.role });
  const [activeCarteTab, setActiveCarteTab] = React.useState(ALL_TAB);

  const canEdit = canManageModule(user.role, 'fiches_salle');
  const canManageCartes = canManageModule(user.role, 'recettes');
  const isConsultant = user.role === 'consultant';
  // Catégories que le formulaire et la génération produisent.
  const FICHE_CATS = ['Entrées','Plats','Desserts','Fromages','Boissons'];

  // ═══ Chargement depuis Supabase + Realtime ═══
  // Fiches en lecture stricte : une erreur remonte, la liste déjà à l'écran
  // n'est jamais écrasée. Recettes et plats restent non stricts : ils ne
  // servent qu'aux photos et au formulaire (un échec = visuel de remplacement,
  // aucune information perdue).
  React.useEffect(() => {
    if (!legacySB) {
      setFiches(INITIAL_FICHES.filter(f => (f.etablissementId || 'etab-1') === etabId));
      setStatutLecture('ready');
      setFichesLues(true);
      return;
    }
    let mounted = true;
    const unsubs = [];
    // Échec : nouvel essai programmé (4 s, puis 8, 16, 30 s au plus), comme
    // Cartes & Recettes. L'écran « Fiches indisponibles » l'annonce.
    // Une seule lecture à la fois : deux événements realtime rapprochés
    // (fiches_salle, carte_fiches_salle) en lançaient deux, et deux échecs
    // programmaient deux essais dont un seul était annulé à la fermeture.
    // Un appel qui arrive pendant une lecture en demande une de plus, à la
    // fin de celle-ci (la modification qu'il signale n'est pas perdue).
    let essaiTimer = null;
    let essaiDelai = ESSAI_MIN_MS;
    let enCours = false;
    let aRelire = false;
    const lireFiches = async () => {
      if (!mounted) return;
      if (enCours) { aRelire = true; return; }
      enCours = true;
      aRelire = false;
      if (essaiTimer) { clearTimeout(essaiTimer); essaiTimer = null; }
      try {
        const rows = await legacySB.db.listFichesSalle(etabId, { strict: true });
        if (mounted) {
          essaiDelai = ESSAI_MIN_MS;
          setFiches(rows);
          setFichesLues(true);
          setStatutLecture('ready');
        }
      } catch (err) {
        if (mounted) {
          console.error('[FichesSalle]', err);
          setStatutLecture('error');
          if (essaiTimer) clearTimeout(essaiTimer);
          essaiTimer = setTimeout(lireFiches, essaiDelai);
          essaiDelai = Math.min(essaiDelai * 2, ESSAI_MAX_MS);
        }
      }
      enCours = false;
      if (aRelire && mounted) lireFiches();
    };
    const lireRecettes = async () => {
      try { const recs = await legacySB.db.listRecettes(etabId); if (mounted) setRecettes(recs); }
      catch (e) {}
    };
    const lirePlats = async () => {
      try { const pls = await legacySB.db.listPlats(etabId); if (mounted) setPlats(pls || []); }
      catch (e) {}
    };
    lireFichesRef.current = lireFiches;
    setStatutLecture('loading');
    lireFiches();
    lireRecettes();
    lirePlats();
    unsubs.push(legacySB.realtime.subscribeReload('fiches_salle', lireFiches));
    unsubs.push(legacySB.realtime.subscribeReload('recettes', lireRecettes));
    unsubs.push(legacySB.realtime.subscribeReload('plats', lirePlats));
    unsubs.push(legacySB.realtime.subscribeReload('plat_recettes', lirePlats));
    unsubs.push(legacySB.realtime.subscribeReload('carte_fiches_salle', lireFiches));
    return () => {
      mounted = false;
      if (essaiTimer) clearTimeout(essaiTimer);
      if (lireFichesRef.current === lireFiches) lireFichesRef.current = null;
      unsubs.forEach(u => u && u());
    };
  }, [etabId]);

  // Réveil de la tablette, retour du réseau : le canal realtime est mort
  // pendant la veille, on relit (resumeCoordinator attend une session saine).
  const relireFiches = React.useCallback(() => (lireFichesRef.current ? lireFichesRef.current() : undefined), []);
  useResumeRefresh(relireFiches);
  // « Réessayer » de l'écran « Fiches indisponibles » (aucune fiche lue) :
  // l'écran repasse en « Chargement des fiches… » le temps de la relecture,
  // au moins un instant, sinon un échec immédiat (hors ligne) laisserait le
  // toucher sans effet visible. Une grille déjà lue n'y passe jamais.
  // La minuterie est gardée : annulée par un second toucher et à la fermeture.
  const reessaiRef = React.useRef(null);
  React.useEffect(() => () => clearTimeout(reessaiRef.current), []);
  const reessayerLecture = () => {
    setStatutLecture('loading');
    clearTimeout(reessaiRef.current);
    reessaiRef.current = setTimeout(relireFiches, 400);
  };

  // Garde un onglet de carte valide quand les cartes changent.
  React.useEffect(() => {
    if (activeCarteTab !== ALL_TAB && !cartes.some(c => c.id === activeCarteTab)) {
      setActiveCarteTab(ALL_TAB);
    }
  }, [cartes]);

  // Onglets de catégories : celles réellement présentes dans l'onglet de carte
  // affiché, dans l'ordre de service (Fromages et Boissons ne s'affichent plus
  // vides). Un filtre qui pointe une catégorie absente de la carte choisie
  // retombe sur « Tous » plutôt que d'afficher une grille vide.
  const fichesCarte = fiches.filter(f => activeCarteTab === ALL_TAB || (f.carteIds || []).includes(activeCarteTab));
  const catsPresentes = categoriesPresentes(fichesCarte);
  const cats = ['Tous', ...catsPresentes];
  const catFilterEff = cats.includes(catFilter) ? catFilter : 'Tous';
  const matchFiche = makeSearchMatcher(search);
  const filtered = fichesCarte.filter(f =>
    (catFilterEff === 'Tous' || categorieDuPlat(f) === catFilterEff) &&
    matchFiche(f.nom)
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const openEdit = (f) => {
    setEditFiche(f || {
      id: null, nom: '', categorie: 'Plats', statut: 'active',
      descriptionService: '', temperatureService: '', dressageNotes: '',
      allergenes: [], accords: [], accordsGeneraux: [], infosService: '', tempsPreparation: '',
      carteIds: activeCarteTab !== ALL_TAB ? [activeCarteTab] : [],
      etablissementId: etabId, modifiePar: user.id, modifie: todayStr,
    });
    setShowForm(true);
  };

  const saveFiche = async (f) => {
    const payload = {
      ...f,
      etablissementId: etabId,
      modifiePar: user.id,
      accordsGeneraux: (f.accordsGeneraux || []).map(s => String(s || '').trim()).filter(Boolean),
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertFicheSalle(payload);
        // Affectation aux cartes (M2M). upsertFicheSalle ne renvoie pas la jointure,
        // on réinjecte donc carteIds localement (le realtime confirmera).
        await legacySB.db.setFicheCartes(saved.id, f.carteIds || []);
        const savedWithCartes = { ...saved, carteIds: f.carteIds || [] };
        setFiches(prev => prev.find(x => x.id === savedWithCartes.id) ? prev.map(x => x.id === savedWithCartes.id ? savedWithCartes : x) : [...prev, savedWithCartes]);
        if (selected?.id === savedWithCartes.id) setSelected(savedWithCartes);
      } catch (err) { notifyLegacy(messageErreur(err, 'fiches salle'), 'error'); return; }
    } else {
      setFiches(prev => prev.find(x=>x.id===f.id) ? prev.map(x=>x.id===f.id?f:x) : [...prev,f]);
      if (selected?.id === f.id) setSelected(f);
    }
    setShowForm(false);
  };

  const deleteFiche = async (id) => {
    if (!confirmLegacy('Supprimer cette fiche salle ?')) return;
    if (legacySB) {
      try { await legacySB.db.deleteFicheSalle(id); }
      catch (err) { notifyLegacy(messageErreur(err, 'fiches salle'), 'error'); return; }
    }
    setFiches(prev => prev.filter(f => f.id !== id));
    if (selected?.id === id) retourAccueil();
  };

  // ── Suppression multiple des fiches salle sélectionnées ──
  const bulkDeleteFiches = async () => {
    if (sel.count === 0) return;
    if (!confirmLegacy(`Supprimer ${sel.count} fiche(s) salle sélectionnée(s) ?`)) return;
    setSelBusy(true);
    let ok = 0;
    for (const id of Array.from(sel.ids)) {
      try {
        if (legacySB) await legacySB.db.deleteFicheSalle(id);
        ok += 1;
      } catch (err) { console.error('[deleteFicheSalle]', err); }
    }
    setFiches(prev => prev.filter(f => !sel.ids.has(f.id)));
    setSelBusy(false);
    sel.exit();
    notifyLegacy(`${ok} fiche(s) salle supprimée(s).`, 'success');
  };

  // ── Attribution en masse des fiches sélectionnées à une ou plusieurs cartes ──
  // Rattrapage des fiches sans carte (générations antérieures au rattachement
  // automatique) et déplacement d'une carte à l'autre au changement de saison.
  const bulkAssignCartes = async (carteIds, mode) => {
    if (sel.count === 0) return;
    setSelBusy(true);
    const updated = new Map();
    let echecs = 0;
    for (const id of Array.from(sel.ids)) {
      const fiche = fiches.find(f => f.id === id);
      if (!fiche) continue;
      const next = mode === 'replace'
        ? [...carteIds]
        : [...new Set([...(fiche.carteIds || []), ...carteIds])];
      try {
        if (legacySB) await legacySB.db.setFicheCartes(id, next);
        updated.set(id, next);
      } catch (err) {
        console.error('[setFicheCartes]', err);
        echecs += 1;
      }
    }
    setFiches(prev => prev.map(f => (updated.has(f.id) ? { ...f, carteIds: updated.get(f.id) } : f)));
    setSelBusy(false);
    setShowBulkCartes(false);
    sel.exit();
    const noms = cartes.filter(c => carteIds.includes(c.id)).map(c => c.nom).join(', ');
    notifyLegacy(
      updated.size === 0
        ? 'Aucune fiche rattachée.'
        : `${updated.size} fiche(s) ${mode === 'replace' ? 'déplacée(s) vers' : 'rattachée(s) à'} ${noms || 'aucune carte'}`
          + `${echecs ? `, ${echecs} échec(s)` : ''}.`,
      updated.size === 0 ? 'error' : 'success',
    );
  };

  // ── Génération IA des fiches salle - une fiche par PLAT FINI de la carte ──
  // Un plat fini = une fiche salle. Les recettes liées à un plat alimentent
  // l'IA (ingrédients, étapes, allergènes) mais ne donnent pas chacune une
  // fiche. À défaut de plats sur la carte, on retombe sur les recettes servies.
  const genererFichesSalleIA = async () => {
    const existingByNom = new Set(fiches.map(f => (f.nom || '').trim().toLowerCase()));
    // Carte affichée : elle borne la génération ET rattache les fiches produites.
    // Sans ce rattachement, les fiches ne ressortent que dans l'onglet « Toutes ».
    const carteActive = activeCarteTab === ALL_TAB ? null : cartes.find(c => c.id === activeCarteTab);

    const recettesActives = (recettes || []).filter(r => r && r.statut !== 'archivée');
    const recetteById = new Map(recettesActives.map(r => [r.id, r]));
    const platsActifs = (plats || []).filter(p => p && p.actif !== false);
    const platsPortee = carteActive
      ? platsActifs.filter(p => (p.carteIds || []).includes(carteActive.id))
      : platsActifs;
    // Plats réellement exploitables : au moins une recette liée connue.
    const platsLies = platsPortee.filter(p => (p.recettes || []).some(pr => recetteById.has(pr.recetteId)));
    // Repli sur les recettes servies : uniquement depuis « Toutes ». Depuis
    // l'onglet d'une carte, ce repli générerait pour tout l'établissement.
    const useRecettesDirect = platsLies.length === 0 && !carteActive;

    if (carteActive && platsLies.length === 0) {
      notifyLegacy(
        `Aucun plat de « ${carteActive.nom} » n'a de recette liée. Rattachez les recettes aux plats dans « Cartes & Recettes ».`,
        'warning',
      );
      return;
    }

    // Unités à transformer en fiche salle : plats finis, ou recettes servies
    // si la carte n'a pas de plats.
    const units = useRecettesDirect
      ? recettesActives
        .filter(r => estRecetteServie(r.categorie))
        .map(r => ({ nom: r.nom || 'Recette', categorie: r.categorie || 'Plats', recettes: [r], carteIds: [] }))
      : platsLies.map(p => ({
        nom: p.nom || 'Plat',
        categorie: p.categorie || 'Plats',
        recettes: (p.recettes || []).map(pr => recetteById.get(pr.recetteId)).filter(Boolean),
        // Depuis une carte : cette carte. Depuis « Toutes » : la fiche hérite
        // des cartes de son plat, elle atterrit donc dans les bons onglets.
        carteIds: carteActive ? [carteActive.id] : (p.carteIds || []),
      }));

    const targets = units.filter(u =>
      u.nom
      && !existingByNom.has(u.nom.trim().toLowerCase())
      && u.recettes.some(r => (r.ingredients || []).length > 0)
    );
    if (!targets.length) {
      notifyLegacy(carteActive
        ? `Tous les plats de « ${carteActive.nom} » ont déjà une fiche salle.`
        : 'Tous les plats ont déjà une fiche salle.', 'info');
      return;
    }
    if (!confirmLegacy(
      `Générer ${targets.length} fiche(s) salle automatiquement ?\n\n`
      + (carteActive
        ? `Une fiche par plat fini de « ${carteActive.nom} », rattachée à cette carte. `
        : 'Une fiche par plat fini, rattachée aux cartes de son plat. ')
      + `Cela effectue ${targets.length} rédaction(s) automatique(s). Les fiches sont créées en statut « Brouillon », à relire avant publication.`
    )) return;
    bulkCancelRef.current = false;
    setBulkProgress({ done: 0, total: targets.length, created: 0 });
    let done = 0;
    let created = 0;
    try {
      const { generateFicheSalle } = await import('../../services/aiService.js');
      for (let i = 0; i < targets.length; i += 3) {
        if (bulkCancelRef.current) break;
        const batch = targets.slice(i, i + 3);
        const results = await Promise.allSettled(batch.map(async (u) => {
          const multi = u.recettes.length > 1;
          // Agrège les composants du plat pour donner le contexte à l'IA.
          const ingredients = u.recettes.flatMap(r => r.ingredients || []);
          const etapes = u.recettes.flatMap(r => (multi
            ? [`- ${r.nom} -`, ...((r.etapes) || [])]
            : (r.etapes || [])));
          // Les recettes portent parfois du texte libre hérité d'imports
          // (« aucun », « crustacés si écrevisse »). On ne recopie que des
          // allergènes du référentiel, et la précision part en info service
          // plutôt que d'être stockée comme un allergène de plus.
          const { ids: allergIds, nuances } = normalizeAllergenes(
            u.recettes.flatMap(r => r.allergenesIds || []),
          );
          const allergLabels = allergIds.map(labelAllergene);
          const platRecipe = { nom: u.nom, categorie: u.categorie, portions: '', ingredients, etapes };
          const ai = await generateFicheSalle(platRecipe, allergLabels);
          const infosService = [ai.infosService, nuances.length ? `Précisions allergènes : ${nuances.join(' ; ')}` : '']
            .filter(Boolean).join(' ');
          const fiche = {
            id: null,
            etablissementId: etabId,
            recetteId: u.recettes[0]?.id || null,
            nom: u.nom,
            categorie: FICHE_CATS.includes(u.categorie) ? u.categorie : 'Plats',
            statut: 'brouillon',
            descriptionService: ai.descriptionService,
            temperatureService: ai.temperatureService,
            dressageNotes: '',
            infosService,
            tempsPreparation: ai.tempsPreparation,
            allergenes: allergIds,
            accords: ai.accords,
            accordsGeneraux: ai.accordsGeneraux || [],
            modifiePar: user.id,
            modifie: todayStr,
          };
          if (legacySB) {
            const saved = await legacySB.db.upsertFicheSalle(fiche);
            // upsertFicheSalle n'écrit pas la jointure carte_fiches_salle : sans
            // ce second appel la fiche n'a aucune carte (cf. saveFiche).
            if (u.carteIds.length) await legacySB.db.setFicheCartes(saved.id, u.carteIds);
            return { ...saved, carteIds: u.carteIds };
          }
          return { ...fiche, carteIds: u.carteIds, id: 'fs-' + Date.now() + Math.round(Math.random() * 1e6) };
        }));
        results.forEach(res => {
          done += 1;
          if (res.status === 'fulfilled' && res.value) {
            created += 1;
            setFiches(prev => prev.some(x => x.id === res.value.id) ? prev : [...prev, res.value]);
          }
        });
        setBulkProgress({ done, total: targets.length, created });
      }
    } catch (err) {
      notifyLegacy('Génération interrompue. ' + messageErreur(err, 'fiches salle'), 'error');
    }
    setBulkProgress(null);
    notifyLegacy(
      `Génération terminée : ${created} fiche(s) salle créée(s) sur ${done} traitée(s)`
      + `${carteActive ? ` dans « ${carteActive.nom} »` : ''}`
      + `${bulkCancelRef.current ? ', interrompu' : ''}.`,
      created > 0 ? 'success' : 'info',
    );
  };

  // ── Détail fiche ──
  if (ecran === 'fiche' && selected) return <FicheDetail fiche={selected} photo={photoDeFicheSalle(selected, plats, recettes)} user={user} canEdit={canEdit} onBack={retourAccueil} onEdit={()=>openEdit(selected)} onDelete={()=>{ deleteFiche(selected.id); }} showForm={showForm} editFiche={editFiche} setEditFiche={setEditFiche} setShowForm={setShowForm} saveFiche={saveFiche} recettes={recettes} cartes={cartes}/>;

  return (
    <div style={fss.root}>
      {/* Onglets de carte (menus) - filtrage des fiches */}
      <CarteTabBar
        cartes={cartes}
        activeId={activeCarteTab}
        onSelect={setActiveCarteTab}
        extraTabs={[{ id: ALL_TAB, label: 'Toutes' }]}
        canManage={canManageCartes}
        onAddCarte={addCarte}
        onRenameCarte={renameCarte}
        onDeleteCarte={deleteCarte}
        archivedCartes={archivedCartes}
        onArchiveCarte={archiveCarte}
      />
      <div style={fss.toolbar}>
        <div style={fss.left}>
          <SearchToggle value={search} onChange={setSearch} placeholder="Je cherche un plat…" />
          {/* Une seule catégorie sur la carte : l'onglet ferait doublon avec
              le titre de section. */}
          {catsPresentes.length > 1 && (
            <SegmentedTabs
              size="sm"
              active={catFilterEff}
              onChange={setCatFilter}
              tabs={cats.map(c => ({ id: c, label: c }))}
            />
          )}
        </div>
        {canEdit && !sel.active && (
          /* L'action principale d'abord ; générer (consultant) et sélectionner
             rangés dans « Gérer ». */
          <div className="module-actions">
            <button style={fss.addBtn} onClick={()=>openEdit(null)}>Nouvelle fiche</button>
            <BoutonActions
              id="fiches-gerer"
              label="Gérer"
              style={fss.selectBtn}
              titre="Gérer les fiches salle"
              sections={[{ items: [
                isConsultant && !bulkProgress && { titre: 'Générer les fiches', detail: 'Une fiche par plat de la carte, à relire ensuite.', onClick: genererFichesSalleIA },
                fiches.length > 0 && { titre: 'Sélectionner plusieurs fiches', detail: 'Pour les supprimer ou les exporter ensemble.', onClick: sel.enter },
              ] }]}
            />
          </div>
        )}
      </div>

      {/* Barre de sélection multiple */}
      {canEdit && sel.active && (
        <SelectionToolbar
          count={sel.count}
          total={filtered.length}
          allSelected={sel.count > 0 && sel.count === filtered.length}
          onToggleAll={() => (sel.count === filtered.length ? sel.clear() : sel.selectAll(filtered.map(f => f.id)))}
          onDelete={bulkDeleteFiches}
          onCancel={sel.exit}
          busy={selBusy}
        >
          {cartes.length > 0 && (
            <Btn small variant="primary" onClick={() => setShowBulkCartes(true)} disabled={sel.count === 0 || selBusy}>
              Attribuer à une carte ({sel.count})
            </Btn>
          )}
        </SelectionToolbar>
      )}

      {/* Progression de la génération IA des fiches salle */}
      {bulkProgress && (
        <div className="no-print" style={{position:'fixed',inset:0,zIndex:9000,background:'rgba(20,16,12,0.55)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,width:'min(420px,94vw)',padding:20,boxShadow:'0 24px 60px rgba(0,0,0,0.35)'}}>
            <div style={{fontSize:15,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)',marginBottom:4}}>Génération des fiches salle</div>
            <div style={{fontSize:13,color:'var(--text2)'}}>
              {bulkProgress.done} / {bulkProgress.total} plat(s), {bulkProgress.created} fiche(s) créée(s)
            </div>
            <div style={{height:10,background:'var(--bg)',borderRadius:6,margin:'12px 0',overflow:'hidden',border:'1px solid var(--border)'}}>
              <div style={{height:'100%',width:`${bulkProgress.total?(bulkProgress.done/bulkProgress.total)*100:0}%`,background:'var(--accent)',transition:'width 0.2s'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button style={{...fss.cancelBtn,color:'var(--danger-strong)',borderColor:'var(--danger-bd)'}} onClick={()=>{bulkCancelRef.current=true;}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Pas de bandeau d'introduction pour le serveur : le titre du module le
          dit, la place rendue va aux fiches. */}
      {!fichesLues ? (
        // Lecture en cours ou en échec : jamais annoncée comme une liste vide.
        <div className="fv-etat" role="status">
          <p className="fv-etat-titre">{statutLecture === 'error' ? 'Fiches indisponibles' : 'Chargement des fiches…'}</p>
          {statutLecture === 'error' && (
            <>
              <p className="fv-etat-texte">
                {online
                  ? 'La connexion a été interrompue. Nouvel essai automatique en cours.'
                  : 'Hors ligne : les fiches s\'afficheront au retour du réseau.'}
              </p>
              <button type="button" className="fv-action" onClick={reessayerLecture}>Réessayer</button>
            </>
          )}
        </div>
      ) : (
        <>
          {statutLecture === 'error' && <BandeauNonActualise onRetry={relireFiches} />}
          {fiches.length === 0 ? (
            <div className="fv-etat">
              <p className="fv-etat-titre">Aucune fiche salle pour le moment.</p>
              {canEdit && <p className="fv-etat-texte">La première se crée avec « Nouvelle fiche ».</p>}
            </div>
          ) : filtered.length === 0 ? (
            <div className="fv-etat">
              <p className="fv-etat-texte">Aucune fiche pour ces critères.</p>
            </div>
          ) : (
            // Vignettes rangées par catégorie, dans l'ordre de service. En
            // sélection, toucher une vignette la coche au lieu de l'ouvrir.
            <GrilleFiches>
              {grouperParCategorie(filtered).map(([cat, items]) => (
                <SectionFiches key={cat} titre={cat} nombre={items.length}>
                  {items.map(f => {
                    const nbAccords = (f.accords || []).length;
                    return (
                      <VignetteFiche
                        key={f.id}
                        refVignette={f.id === ficheQuitteeRef.current ? carteQuitteeRef : undefined}
                        titre={f.nom}
                        photo={photoDeFicheSalle(f, plats, recettes)}
                        categorie={categorieDuPlat(f)}
                        texte={f.descriptionService}
                        allergenes={f.allergenes}
                        meta={[
                          f.tempsPreparation && { cle: 'temps', Icone: Clock, contenu: f.tempsPreparation },
                          nbAccords > 0 && { cle: 'accords', Icone: Wine, contenu: <><span data-no-translate="">{nbAccords}</span> {nbAccords > 1 ? 'accords' : 'accord'}</> },
                        ]}
                        pastille={f.statut === 'brouillon' ? 'Brouillon' : null}
                        onOuvrir={() => ouvrirFiche(f)}
                        selection={sel.active ? { coche: sel.isSelected(f.id), onBasculer: () => sel.toggle(f.id) } : null}
                      />
                    );
                  })}
                </SectionFiches>
              ))}
            </GrilleFiches>
          )}
        </>
      )}

      {showForm && <FicheFormModal fiche={editFiche} setFiche={setEditFiche} onSave={saveFiche} onClose={()=>setShowForm(false)} recettes={recettes} cartes={cartes}/>}
      {showBulkCartes && (
        <BulkCartesModal
          cartes={cartes}
          count={sel.count}
          busy={selBusy}
          onApply={bulkAssignCartes}
          onClose={()=>setShowBulkCartes(false)}
        />
      )}
    </div>
  );
};

// ── Détail d'une fiche ──
const FicheDetail = ({ fiche, photo = null, canEdit, onBack, onEdit, onDelete, showForm, editFiche, setEditFiche, setShowForm, saveFiche, recettes = [], cartes = [] }) => {
  // Un onglet par famille réellement présente sur la fiche. Un type inconnu
  // (import ancien, famille ajoutée plus tard) garde son propre onglet plutôt
  // que d'être avalé : sans ça l'accord n'a pas d'onglet, donc il est invisible
  // en salle - exactement ce qui arrivait aux cocktails et aux thés.
  const groupes = React.useMemo(() => {
    const parType = new Map();
    (fiche.accords || []).forEach(a => {
      const id = (a && a.type) || 'vin';
      if (!parType.has(id)) parType.set(id, []);
      parType.get(id).push(a);
    });
    const connus = ACCORD_TYPES
      .filter(t => parType.has(t.id))
      .map(t => ({ ...t, items: parType.get(t.id) }));
    const inconnus = [...parType.keys()]
      .filter(id => !ACCORD_TYPE_IDS.includes(id))
      .map(id => ({ id, label: id, items: parType.get(id) }));
    return [...connus, ...inconnus];
  }, [fiche.accords]);
  const [accordTab, setAccordTab] = React.useState(null);
  const groupeActif = groupes.find(g => g.id === accordTab) || groupes[0] || null;

  // La fiche s'ouvre en haut de page (Retour, nom du plat), pas au défilement
  // laissé par la grille : ouverte depuis le bas de la grille, elle cachait
  // Retour.
  const hautRef = React.useRef(null);
  React.useLayoutEffect(() => {
    for (let el = hautRef.current?.parentElement; el; el = el.parentElement) if (el.scrollTop > 0) el.scrollTop = 0;
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }, [fiche.id]);

  const familles = (fiche.accordsGeneraux || []).map(g => String(g || '').trim()).filter(Boolean);
  // Température et temps écrits une seule fois, ici, en toutes lettres : la
  // génération les rédige en phrases (« Chaud, assiette chaude. Servir dans
  // les 2 minutes »), trop longues pour une ligne posée sur la photo.
  const auService = [
    fiche.temperatureService && ['Température de service', fiche.temperatureService],
    fiche.tempsPreparation && ['Temps de préparation', fiche.tempsPreparation],
    fiche.dressageNotes && ['Notes de dressage / service', fiche.dressageNotes],
  ].filter(Boolean);

  // Ordre de lecture du serveur : le plat (héros), ce qu'on en dit au client
  // (description en accroche, au service), ce qu'il faut savoir avant de le
  // proposer (allergènes, info service), puis les accords. Au téléphone,
  // allergènes et info service passent en premier (fiches.css).
  // Le formulaire reste hors de la racine .fv (conteneur de requête) : sa
  // fenêtre fixe se cale sur l'écran, pas sur la fiche.
  return (
    <div ref={hautRef} style={fss.detailRoot}>
      <div style={fss.detailBarre}>
        <Btn variant="ghost" onClick={onBack} style={fss.retourBtn}>
          <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Retour</span>
        </Btn>
        {canEdit && (
          <div style={{display:'flex',gap:8,flexShrink:0,marginLeft:'auto'}}>
            <button style={fss.editBtn} onClick={onEdit}>Modifier</button>
            <button style={fss.deleteBtn} onClick={onDelete}>Supprimer</button>
          </div>
        )}
      </div>

      <div className="fv fv-fiche">
        <header className="fv-heros" data-heros="">
          <PhotoFiche src={photo} categorie={fiche.categorie} nom={fiche.nom} variante="heros" />
          <span className="fv-voile" aria-hidden="true" />
          {fiche.statut === 'brouillon' && <span className="fv-pastille">Brouillon</span>}
          <div className="fv-heros-texte">
            {fiche.categorie && <p className="fv-heros-cat">{fiche.categorie}</p>}
            <h2 className="fv-heros-titre">{fiche.nom}</h2>
          </div>
        </header>

        <div className="fv-fiche-cols fv-fiche-cols--salle">
          <div className="fv-col fv-col-a">
            {fiche.descriptionService && <p className="fv-accroche">{fiche.descriptionService}</p>}
            {auService.length > 0 && (
              <section className="fv-bloc">
                <h3 className="fv-titre-section">Au service</h3>
                <dl className="fv-infos">
                  {auService.map(([libelle, valeur]) => (
                    <div key={libelle}>
                      <dt>{libelle}</dt>
                      <dd>{valeur}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
          <div className="fv-col fv-col-b">
            <AllergenesFiche ids={fiche.allergenes} variante="bandeau" />
            {fiche.infosService && (
              <div style={{...encadreStyle('alerte'),fontSize:13,lineHeight:1.5}}>
                <strong style={encadreTitreStyle('alerte')}>Info service :</strong> {fiche.infosService}
              </div>
            )}
          </div>
        </div>

        {/* Accords : un onglet par famille présente, le nombre dans son
            propre nœud ; liste à filets, en deux colonnes dès 600 px. */}
        <section className="fv-bloc">
          <h3 className="fv-titre-section">Accords mets & boissons</h3>
          {familles.length > 0 && (
            <p className="fv-familles">
              <span>Familles recommandées :</span>{' '}
              {familles.map((g, i) => (
                <React.Fragment key={i}>{i > 0 && ', '}<span>{g}</span></React.Fragment>
              ))}
            </p>
          )}
          {groupeActif ? (
            <>
              <SegmentedTabs
                size="sm"
                active={groupeActif.id}
                onChange={setAccordTab}
                tabs={groupes.map(g => ({
                  id: g.id,
                  label: <>{g.label}<span className="fv-onglet-nombre" data-no-translate="">{g.items.length}</span></>,
                }))}
              />
              <ul className="fv-accords">
                {groupeActif.items.map((a, i) => (
                  <li key={i} className="fv-accord">
                    <span className="fv-accord-nom">{a.nom}</span>
                    {a.region && <span className="fv-accord-region">{a.region}</span>}
                    {a.alternative && <span className="fv-accord-alt">{a.alternative}</span>}
                    {a.notes && <span className="fv-accord-notes">{a.notes}</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="fv-vide">Aucun accord renseigné.</p>}
        </section>

        {fiche.modifie && (
          <p className="fv-pied">Modifiée le <span data-no-translate="">{dateSuisse(fiche.modifie)}</span></p>
        )}
      </div>

      {showForm && <FicheFormModal fiche={editFiche} setFiche={setEditFiche} onSave={saveFiche} onClose={()=>setShowForm(false)} recettes={recettes} cartes={cartes}/>}
    </div>
  );
};

// ── Formulaire création/édition ──
const FicheFormModal = ({ fiche, setFiche, onSave, onClose, recettes = [], cartes = [] }) => {
  const allAllergs = ALLERGENE_IDS;
  const toggleAllerg = (a) => setFiche(f=>({...f,allergenes:(f.allergenes || []).includes(a)?f.allergenes.filter(x=>x!==a):[...f.allergenes,a]}));
  // Valeurs hors référentiel (texte libre d'un ancien import) : sans puce
  // dédiée elles n'ont aucun bouton et survivent à chaque enregistrement.
  const { inconnus } = partitionAllergenes(fiche?.allergenes);
  const retirerInconnu = (v) => setFiche(f => ({ ...f, allergenes: (f.allergenes || []).filter(x => x !== v) }));
  // Reprend l'allergène réellement déclaré par la valeur libre et la retire.
  const corrigerInconnu = (v) => setFiche(f => {
    const { ids } = normalizeAllergenes([v]);
    const restant = (f.allergenes || []).filter(x => x !== v);
    return { ...f, allergenes: [...new Set([...restant, ...ids])] };
  });
  const addAccord = (type) => setFiche(f=>({...f,accords:[...(f.accords||[]),{type,nom:'',region:'',alternative:'',notes:''}]}));
  const updateAccord = (i,field,val) => setFiche(f=>({...f,accords:(f.accords || []).map((a,idx)=>idx===i?{...a,[field]:val}:a)}));
  const removeAccord = (i) => setFiche(f=>({...f,accords:f.accords.filter((_,idx)=>idx!==i)}));

  // Importer allergènes depuis une recette liée
  const importFromRecette = (recetteId) => {
    if (!recetteId) return;
    const rec = recettes.find(r => r.id === recetteId);
    if (!rec) return;
    // La recette peut porter du texte libre hérité d'un import : on importe
    // les allergènes normalisés, la précision éventuelle va en info service.
    const { ids, nuances } = normalizeAllergenes(rec.allergenesIds || []);
    const currentAllergs = fiche?.allergenes || [];
    const newAllergs = [...new Set([...currentAllergs, ...ids])];
    setFiche(f => ({
      ...f,
      recetteId,
      allergenes: newAllergs,
      infosService: [f.infosService, nuances.length ? `Précisions allergènes : ${nuances.join(' ; ')}` : '']
        .filter(Boolean).join(' '),
      // Pré-remplir la description si vide
      descriptionService: f.descriptionService || rec.nom,
    }));
  };

  return (
    <div className="modal-full-overlay" style={fss.overlay} onClick={onClose}>
      <div className="modal-full" style={{...fss.modal,width:620}} onClick={e=>e.stopPropagation()}>
        <div style={fss.modalHeader}>
          <div style={fss.modalTitle}>{fiche?.id?.startsWith('fs') && fiche?.nom?'Modifier la fiche':'Nouvelle fiche salle'}</div>
          <button type="button" className="ui-fermer" aria-label="Fermer" style={fss.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={fss.modalBody}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:12,alignItems:'end'}}>
              <div style={fss.field}><label style={fss.fLabel}>Nom du plat *</label><input style={fss.fInput} value={fiche?.nom||''} onChange={e=>setFiche(f=>({...f,nom:e.target.value}))}/></div>
              <div style={fss.field}><label style={fss.fLabel}>Catégorie</label>
                <select style={fss.fInput} value={fiche?.categorie||'Plats'} onChange={e=>setFiche(f=>({...f,categorie:e.target.value}))}>
                  {['Entrées','Plats','Desserts','Fromages','Boissons'].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={fss.field}><label style={fss.fLabel}>Statut</label>
                <select style={fss.fInput} value={fiche?.statut||'active'} onChange={e=>setFiche(f=>({...f,statut:e.target.value}))}>
                  <option value="active">Active</option><option value="brouillon">Brouillon</option>
                </select>
              </div>
            </div>
            {/* Attribution : cartes (menus) où figure cette fiche. Placé haut
                dans le formulaire, c'est ce qui décide de l'onglet où la fiche
                apparaît ; enterré en bas, il passait inaperçu. */}
            <div style={fss.field}>
              <label style={fss.fLabel}>
                Attribution aux cartes
                {(fiche?.carteIds || []).length === 0 && (
                  <span style={{ marginLeft: 8, color: 'var(--warning-text)', fontWeight: 700, textTransform: 'none', letterSpacing: 0 }}>
                    aucune carte, la fiche ne sortira que dans « Toutes »
                  </span>
                )}
              </label>
              {cartes.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
                  Aucune carte. Créez-en dans « Cartes &amp; Recettes » pour pouvoir y rattacher cette fiche.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {cartes.map(c => {
                    const checked = (fiche?.carteIds || []).includes(c.id);
                    return (
                      // touch-target : ce sont des <label>, la regle globale
                      // des 44px sur pointer:coarse ne vise que les boutons.
                      <label key={c.id} className="touch-target"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', minHeight: 36,
                          border: '1.5px solid transparent', borderRadius: 20,
                          background: checked ? 'var(--accent-light)' : 'var(--surface)',
                          color: checked ? 'var(--accent)' : 'var(--text2)', fontSize: 12, cursor: 'pointer', fontWeight: checked ? 700 : 400,
                        }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setFiche(f => {
                            const cur = f.carteIds || [];
                            return { ...f, carteIds: checked ? cur.filter(id => id !== c.id) : [...cur, c.id] };
                          })}
                        />
                        {c.nom}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={fss.field}><label style={fss.fLabel}>Description pour l'équipe salle *</label><textarea style={{...fss.fInput,minHeight:80,resize:'vertical'}} value={fiche?.descriptionService||''} onChange={e=>setFiche(f=>({...f,descriptionService:e.target.value}))}/></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={fss.field}><label style={fss.fLabel}>Température de service</label><input style={fss.fInput} placeholder="ex. Chaud, servir immédiatement" value={fiche?.temperatureService||''} onChange={e=>setFiche(f=>({...f,temperatureService:e.target.value}))}/></div>
              <div style={fss.field}><label style={fss.fLabel}>Temps préparation</label><input style={fss.fInput} placeholder="ex. 12 min" value={fiche?.tempsPreparation||''} onChange={e=>setFiche(f=>({...f,tempsPreparation:e.target.value}))}/></div>
            </div>
            <div style={fss.field}><label style={fss.fLabel}>Notes de dressage / service en salle</label><textarea style={{...fss.fInput,minHeight:56,resize:'vertical'}} placeholder="À compléter manuellement" value={fiche?.dressageNotes||''} onChange={e=>setFiche(f=>({...f,dressageNotes:e.target.value}))}/></div>
            <div style={fss.field}><label style={fss.fLabel}>Info service (allergies, restrictions…)</label><textarea style={{...fss.fInput,minHeight:56,resize:'vertical'}} value={fiche?.infosService||''} onChange={e=>setFiche(f=>({...f,infosService:e.target.value}))}/></div>

            {/* Lien recette → import allergènes automatique */}
            {recettes.length > 0 && (
              <div style={fss.field}>
                <label style={fss.fLabel}>Recette liée (import allergènes automatique)</label>
                <select
                  style={fss.fInput}
                  value={fiche?.recetteId || ''}
                  onChange={e => importFromRecette(e.target.value)}
                >
                  <option value="">Sélectionner une recette (optionnel)</option>
                  {/* Les recettes archivées sont masquées, sauf celle déjà liée (select contrôlé). */}
                  {recettes.filter(r => r.statut !== 'archivée' || r.id === fiche?.recetteId).map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
                {fiche?.recetteId && (
                  <div style={{ fontSize: 11, color: 'var(--success-text)', marginTop: 4, fontWeight: 500 }}>
                    Allergènes importés depuis la recette
                  </div>
                )}
              </div>
            )}

            {/* Allergènes */}
            <div style={fss.field}>
              <label style={fss.fLabel}>
                Allergènes
                {fiche?.allergenes?.length > 0 && (
                  <span style={{ marginLeft: 8, color: 'var(--warning-text)', fontWeight: 700 }}>
                    {fiche.allergenes.length} actif{fiche.allergenes.length > 1 ? 's' : ''}
                  </span>
                )}
              </label>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
                {allAllergs.map(a=>{
                  const sel = (fiche?.allergenes || []).includes(a);
                  // Langage allergènes de l'app : jetons warning, lisibles
                  // dans les deux thèmes.
                  return <button key={a} onClick={()=>toggleAllerg(a)} style={{padding:'4px 10px',border:`1.5px solid ${sel?'var(--warning-bd)':'var(--border)'}`,borderRadius:20,background:sel?'var(--warning-bg)':'var(--surface)',color:sel?'var(--warning-text)':'var(--text2)',fontSize:11,fontWeight:sel?700:400,cursor:'pointer',fontFamily:'var(--font)'}}>
                    {ALLERGENES_LABELS[a]}
                  </button>;
                })}
              </div>
              {inconnus.length > 0 && (
                <div style={{marginTop:10,...encadreStyle('alerte')}}>
                  <div style={{fontSize:11,...encadreTitreStyle('alerte'),marginBottom:6}}>
                    {inconnus.length} valeur{inconnus.length>1?'s':''} hors liste (import ancien), à convertir ou à retirer
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {inconnus.map(v=>{
                      const { ids } = normalizeAllergenes([v]);
                      return (
                        <span key={v} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 6px 4px 10px',border:'1.5px dashed var(--warning-bd)',borderRadius:20,background:'var(--surface)',fontSize:11,color:'var(--warning-text)'}}>
                          {v}
                          {ids.length > 0 && (
                            <button
                              className="touch-target"
                              onClick={()=>corrigerInconnu(v)}
                              title={`Remplacer par ${ids.map(labelAllergene).join(' + ')}`}
                              style={{border:'none',background:'none',color:'var(--warning-text)',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font)',padding:'0 4px'}}
                            >Remplacer par {ids.map(labelAllergene).join(', ')}</button>
                          )}
                          <button
                            className="touch-target"
                            onClick={()=>retirerInconnu(v)}
                            title="Retirer cette valeur"
                            aria-label={`Retirer ${v}`}
                            style={{border:'none',background:'none',color:'var(--text2)',fontSize:13,cursor:'pointer',fontFamily:'var(--font)',padding:'0 4px'}}
                          >×</button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Accords */}
            <div style={fss.field}>
              <div style={{marginBottom:8}}>
                <label style={fss.fLabel}>Accords mets & boissons</label>
                {/* 5 familles : la ligne passe à la ligne plutôt que de forcer
                    un défilement horizontal dans la modale. */}
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
                  {ACCORD_TYPES.map(t=>(
                    <button key={t.id} style={fss.smallBtn} onClick={()=>addAccord(t.id)}>+ {t.label}</button>
                  ))}
                </div>
              </div>
              {(fiche?.accords||[]).map((a,i)=>(
                <div key={i} style={{border:'1px solid var(--border)',borderRadius:8,padding:8,marginBottom:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'auto 1fr 110px 28px',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:12,color:'var(--text2)'}}>{accordLabel(a.type)}</span>
                    <input style={fss.fInput} placeholder="Nom (référence précise)" value={a.nom} onChange={e=>updateAccord(i,'nom',e.target.value)}/>
                    <input style={fss.fInput} placeholder="Région" value={a.region} onChange={e=>updateAccord(i,'region',e.target.value)}/>
                    <button style={{background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:14}} onClick={()=>removeAccord(i)} aria-label="Retirer l'accord">×</button>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'130px 1fr 1fr',gap:8,marginTop:6}}>
                    {/* Changer de famille sans devoir supprimer puis recréer. */}
                    <select style={fss.fInput} value={ACCORD_TYPE_IDS.includes(a.type)?a.type:'vin'} onChange={e=>updateAccord(i,'type',e.target.value)}>
                      {ACCORD_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <input style={fss.fInput} placeholder="Type général (ex. Vin blanc sec)" value={a.alternative||''} onChange={e=>updateAccord(i,'alternative',e.target.value)}/>
                    <input style={fss.fInput} placeholder="Notes d'accord" value={a.notes} onChange={e=>updateAccord(i,'notes',e.target.value)}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Accords généraux - familles de boissons recommandées */}
            <div style={fss.field}>
              <label style={fss.fLabel}>Accords généraux : familles recommandées</label>
              <textarea
                style={{...fss.fInput,minHeight:56,resize:'vertical'}}
                placeholder={'Une famille par ligne, par exemple :\nVin rouge corsé\nVin blanc sec\nVin blanc moelleux'}
                value={(fiche?.accordsGeneraux||[]).join('\n')}
                onChange={e=>setFiche(f=>({...f,accordsGeneraux:e.target.value.split('\n')}))}
              />
              <div style={{fontSize:11,color:'var(--text2)'}}>
                Repli simple pour le service quand la référence précise n'est pas disponible.
              </div>
            </div>
          </div>

          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}>
            <button style={fss.cancelBtn} onClick={onClose}>Annuler</button>
            <button style={fss.saveBtn} onClick={()=>onSave(fiche)}>Enregistrer la fiche</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Attribution en masse : choix des cartes pour les fiches sélectionnées ───
// « Ajouter » cumule avec les cartes déjà rattachées, « Remplacer » écrase.
// Remplacer sans aucune carte cochée détache les fiches de toutes les cartes,
// c'est volontaire (retirer une série de fiches d'une carte de saison).
const BulkCartesModal = ({ cartes, count, busy, onApply, onClose }) => {
  const [ids, setIds] = React.useState([]);
  const [mode, setMode] = React.useState('add');
  const toggle = (id) => setIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const fermer = () => { if (!busy) onClose(); };

  return (
    <div className="modal-sheet-overlay" style={fss.overlay} onClick={fermer}>
      <div className="modal-sheet" style={{ ...fss.modal, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={fss.modalHeader}>
          <div style={fss.modalTitle}>Attribuer {count} fiche{count > 1 ? 's' : ''}</div>
          <button type="button" className="ui-fermer" aria-label="Fermer" style={fss.closeBtn} onClick={fermer}>×</button>
        </div>
        <div style={fss.modalBody}>
          <div style={{ ...fss.field, marginBottom: 16 }}>
            <label style={fss.fLabel}>Cartes (menus)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {cartes.map(c => {
                const checked = ids.includes(c.id);
                return (
                  <label key={c.id} className="touch-target"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', minHeight: 36,
                      border: '1.5px solid transparent', borderRadius: 20,
                      background: checked ? 'var(--accent-light)' : 'var(--surface)',
                      color: checked ? 'var(--accent)' : 'var(--text2)',
                      fontSize: 12, cursor: 'pointer', fontWeight: checked ? 700 : 400,
                    }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                    {c.nom}
                  </label>
                );
              })}
            </div>
          </div>

          <div style={fss.field}>
            <label style={fss.fLabel}>Mode</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {[
                { id: 'add', titre: 'Ajouter', aide: 'Les cartes déjà rattachées sont conservées.' },
                { id: 'replace', titre: 'Remplacer', aide: 'Les cartes actuelles des fiches sont écrasées.' },
              ].map(o => (
                <label key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                  <input type="radio" name="bulk-cartes-mode" checked={mode === o.id} onChange={() => setMode(o.id)} style={{ marginTop: 2 }} />
                  <span>
                    {o.titre}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', lineHeight: 1.3 }}>{o.aide}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {mode === 'replace' && ids.length === 0 && (
            <div style={{ marginTop: 12, ...encadreStyle('alerte'), fontSize: 12 }}>
              Aucune carte cochée : les fiches seront retirées de toutes leurs cartes et ne resteront visibles que dans « Toutes ».
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button style={fss.cancelBtn} onClick={fermer} disabled={busy}>Annuler</button>
            <button
              style={{ ...fss.saveBtn, opacity: busy || (mode === 'add' && ids.length === 0) ? 0.5 : 1 }}
              onClick={() => onApply(ids, mode)}
              disabled={busy || (mode === 'add' && ids.length === 0)}>
              {busy ? 'Attribution…' : 'Appliquer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const fss = {
  root:{display:'flex',flexDirection:'column',gap:14},
  toolbar:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'},
  // Une seule ligne : loupe + onglets de catégories qui coulissent.
  left:{display:'flex',alignItems:'center',gap:8,minWidth:0,maxWidth:'100%'},
  addBtn:{padding:'8px 16px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  aiBtn:{padding:'8px 16px',background:'var(--ai-bg-soft)',color:'var(--ai-text)',border:'1px solid var(--ai-bd)',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  selectBtn:{padding:'8px 16px',background:'var(--surface)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  // Liste et fiche en vitrine : vignettes, héros, sections et accords vivent
  // dans src/components/fiches/fiches.css (classes .fv), hors de portée de la
  // règle « Plus de carrés » qui aplatit les blocs posés en style inline.
  // Detail
  detailRoot:{display:'flex',flexDirection:'column',gap:16},
  // Barre du haut de la fiche : Retour à gauche, actions de gestion à droite.
  detailBarre:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'},
  // 44 px au toucher comme à la souris, comme le Retour des écrans de tâche.
  retourBtn:{minHeight:44,flexShrink:0},
  editBtn:{padding:'6px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,fontSize:12,fontWeight:500,color:'var(--text)',cursor:'pointer',fontFamily:'var(--font)'},
  deleteBtn:{padding:'6px 14px',background: 'var(--danger-bg-soft)',border: '1px solid transparent',borderRadius:7,fontSize:12,fontWeight:500,color:'var(--danger-strong)',cursor:'pointer',fontFamily:'var(--font)'},
  // Form modal
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16},
  modal:{background:'var(--surface)',borderRadius:14,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',maxHeight:'90vh',overflowY:'auto'},
  modalHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:2},
  modalTitle:{fontWeight:700,fontSize:16,fontFamily:'var(--font-serif)',color:'var(--text)'},
  closeBtn:{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'},
  modalBody:{padding:'20px 22px'},
  field:{display:'flex',flexDirection:'column',gap:6},
  fLabel:{fontSize:11,fontWeight:500,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4},
  fInput:{padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',outline:'none',width:'100%',boxSizing:'border-box'},
  smallBtn:{padding:'4px 10px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:500,color:'var(--text)',cursor:'pointer',fontFamily:'var(--font)'},
  cancelBtn:{padding:'8px 16px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  saveBtn:{padding:'9px 20px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
};

export default FichesSalle;
