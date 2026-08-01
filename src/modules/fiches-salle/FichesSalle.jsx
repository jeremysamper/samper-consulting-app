import React from 'react';
import { confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { canManageModule } from '../../data/demoData.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { useCartes } from '../../hooks/useCartes.js';
import CarteTabBar from '../../components/cartes/CarteTabBar.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import {
  ALLERGENE_IDS, ALLERGENES_LABELS, labelAllergene,
  normalizeAllergenes, partitionAllergenes,
} from '../../utils/allergenes.js';
import { normalizeSearch } from '../../utils/searchText.js';


// ─────────────────────────────────────────────────────
// FICHES TECHNIQUES SALLE - Descriptions, allergènes, accords mets & vins
// Lecture : serveurs / Édition : consultant, patron, resp_cuisine
// ─────────────────────────────────────────────────────

// Libellés et liste : référentiel partagé (src/utils/allergenes.js).
// Seules les couleurs sont propres à ce module.
const ALLERGENES_COLORS = {
  gluten:'var(--warning-text)', lactose:'#0369a1', oeufs:'var(--warning-strong)', poissons:'#0891b2',
  crustaces:'var(--danger-strong)', fruits_coque:'var(--ai-text)', sulfites:'#4f7942',
  arachides:'#c2410c', soja:'#059669', celeri:'#84cc16', moutarde:'#ca8a04',
  sesame:'#f97316', mollusques:'#8b5cf6', lupin:'#ec4899',
};

// Familles de boissons pour les accords. L'ordre est celui des onglets.
// Les fiches n'avaient que « vin » et « sans_alcool » : une maison qui sert
// ses propres cocktails, ses spiritueux et une carte de thés n'avait aucun
// endroit où les poser, tout finissait empilé sous « Sans alcool ».
const ACCORD_TYPES = [
  { id: 'vin', label: 'Vins', icon: '🍷' },
  { id: 'cocktail', label: 'Cocktails', icon: '🍹' },
  { id: 'spiritueux', label: 'Spiritueux', icon: '🥃' },
  { id: 'the', label: 'Thés & infusions', icon: '🍵' },
  { id: 'sans_alcool', label: 'Sans alcool', icon: '🥤' },
];
const ACCORD_TYPE_IDS = ACCORD_TYPES.map(t => t.id);
const accordIcon = (type) => (ACCORD_TYPES.find(t => t.id === type) || {}).icon || '🥤';

// Catégories de recettes « techniques » qui ne sont pas des plats servis
// au client - elles ne donnent pas lieu à une fiche salle.
const RECETTE_CATS_NON_SERVIES = [
  'sauce', 'sauces', 'fond', 'fonds', 'garniture', 'garnitures',
  'base', 'bases', 'préparation', 'préparations', 'preparation', 'preparations',
];
const estRecetteServie = (categorie) => {
  const c = (categorie || '').toLowerCase().trim();
  if (!c) return true; // recette sans catégorie : on la garde par défaut
  return !RECETTE_CATS_NON_SERVIES.some(x => c === x || c.startsWith(x + ' '));
};

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
  const [loading, setLoading] = React.useState(true);
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

  // Cartes (menus) - onglets de filtrage. '__all__' = toutes les fiches.
  const ALL_TAB = '__all__';
  const { cartes, archivedCartes, addCarte, renameCarte, archiveCarte, deleteCarte } = useCartes(etabId);
  const [activeCarteTab, setActiveCarteTab] = React.useState(ALL_TAB);

  const canEdit = canManageModule(user.role, 'fiches_salle');
  const canManageCartes = canManageModule(user.role, 'recettes');
  const isConsultant = user.role === 'consultant';
  const FICHE_CATS = ['Entrées','Plats','Desserts','Fromages','Boissons'];
  // Les onglets couvrent toutes les catégories que le formulaire peut produire :
  // « Boissons » manquait, une fiche boisson n'était donc filtrable que par « Tous ».
  const cats = ['Tous', ...FICHE_CATS];

  // ═══ Chargement depuis Supabase + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) {
      setFiches(INITIAL_FICHES.filter(f => (f.etablissementId || 'etab-1') === etabId));
      setLoading(false);
      return;
    }
    let mounted = true;
    const unsubs = [];
    (async () => {
      try {
        const [rows, recs, pls] = await Promise.all([
          legacySB.db.listFichesSalle(etabId),
          legacySB.db.listRecettes(etabId),
          legacySB.db.listPlats(etabId),
        ]);
        if (mounted) { setFiches(rows); setRecettes(recs); setPlats(pls || []); }
      } catch (err) { console.error('[FichesSalle]', err); }
      finally { if (mounted) setLoading(false); }
    })();
    unsubs.push(legacySB.realtime.subscribeReload('fiches_salle', async () => {
      try { const rows = await legacySB.db.listFichesSalle(etabId); if (mounted) setFiches(rows); }
      catch (e) {}
    }));
    unsubs.push(legacySB.realtime.subscribeReload('recettes', async () => {
      try { const recs = await legacySB.db.listRecettes(etabId); if (mounted) setRecettes(recs); }
      catch (e) {}
    }));
    const reloadPlats = async () => {
      try { const pls = await legacySB.db.listPlats(etabId); if (mounted) setPlats(pls || []); }
      catch (e) {}
    };
    unsubs.push(legacySB.realtime.subscribeReload('plats', reloadPlats));
    unsubs.push(legacySB.realtime.subscribeReload('plat_recettes', reloadPlats));
    unsubs.push(legacySB.realtime.subscribeReload('carte_fiches_salle', async () => {
      try { const rows = await legacySB.db.listFichesSalle(etabId); if (mounted) setFiches(rows); }
      catch (e) {}
    }));
    return () => { mounted = false; unsubs.forEach(u => u && u()); };
  }, [etabId]);

  // Garde un onglet de carte valide quand les cartes changent.
  React.useEffect(() => {
    if (activeCarteTab !== ALL_TAB && !cartes.some(c => c.id === activeCarteTab)) {
      setActiveCarteTab(ALL_TAB);
    }
  }, [cartes]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  const filtered = fiches.filter(f =>
    (catFilter === 'Tous' || f.categorie === catFilter) &&
    (activeCarteTab === ALL_TAB || (f.carteIds || []).includes(activeCarteTab)) &&
    (search === '' || normalizeSearch(f.nom).includes(normalizeSearch(search)))
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
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
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
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setFiches(prev => prev.filter(f => f.id !== id));
    if (selected?.id === id) setSelected(null);
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
          + `${echecs ? ` · ${echecs} échec(s)` : ''}.`,
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
      `Générer ${targets.length} fiche(s) salle par IA ?\n\n`
      + (carteActive
        ? `Une fiche par plat fini de « ${carteActive.nom} », rattachée à cette carte. `
        : 'Une fiche par plat fini, rattachée aux cartes de son plat. ')
      + `Cela effectue ${targets.length} appel(s) à l'IA. Les fiches sont créées en statut « Brouillon » - à relire avant publication.`
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
          const infosService = [ai.infosService, nuances.length ? `Précisions allergènes : ${nuances.join(' · ')}` : '']
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
      notifyLegacy('Génération interrompue : ' + (err.message || err), 'error');
    }
    setBulkProgress(null);
    notifyLegacy(
      `Génération terminée : ${created} fiche(s) salle créée(s) sur ${done} traitée(s)`
      + `${carteActive ? ` dans « ${carteActive.nom} »` : ''}`
      + `${bulkCancelRef.current ? ' · interrompu' : ''}.`,
      created > 0 ? 'success' : 'info',
    );
  };

  // ── Détail fiche ──
  if (selected) return <FicheDetail fiche={selected} user={user} canEdit={canEdit} onBack={()=>setSelected(null)} onEdit={()=>openEdit(selected)} onDelete={()=>{ deleteFiche(selected.id); }} showForm={showForm} editFiche={editFiche} setEditFiche={setEditFiche} setShowForm={setShowForm} saveFiche={saveFiche} recettes={recettes} cartes={cartes}/>;

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
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher un plat…" />
          <SegmentedTabs
            size="sm"
            active={catFilter}
            onChange={setCatFilter}
            tabs={cats.map(c => ({ id: c, label: c }))}
          />
        </div>
        {canEdit && !sel.active && (
          <div className="module-actions">
            {fiches.length > 0 && (
              <button style={fss.selectBtn} onClick={sel.enter}>Sélectionner</button>
            )}
            {isConsultant && (
            <button style={fss.aiBtn} onClick={genererFichesSalleIA} disabled={!!bulkProgress}>
              Générer (IA)
            </button>
            )}
            <button style={fss.addBtn} onClick={()=>openEdit(null)}>+ Nouvelle</button>
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
            <div style={{fontSize:15,fontWeight:800,fontFamily:'var(--font-serif)',color:'var(--text)',marginBottom:4}}>✨ Génération des fiches salle</div>
            <div style={{fontSize:13,color:'var(--text2)'}}>
              {bulkProgress.done} / {bulkProgress.total} plat(s) · {bulkProgress.created} fiche(s) créée(s)
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

      {/* Intro banner pour serveurs */}
      {user.role === 'serveur' && (
        <div style={fss.serverBanner}>
          <div style={{fontSize:20}}>🍽</div>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:'var(--text)'}}>Fiches techniques salle</div>
            <div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>Descriptions plats, allergènes et accords mets & vins - pour vous aider à conseiller les clients avec assurance.</div>
          </div>
        </div>
      )}

      <div style={fss.grid}>
        {(filtered || []).map(f => (
          <div
            key={f.id}
            style={{
              ...fss.card,
              position:'relative',
              ...(sel.active && sel.isSelected(f.id) ? { outline:'2px solid var(--accent)', outlineOffset:-2 } : {}),
            }}
            onClick={()=> sel.active ? sel.toggle(f.id) : setSelected(f)}
          >
            {sel.active && (
              <input
                type="checkbox"
                checked={sel.isSelected(f.id)}
                onChange={()=>sel.toggle(f.id)}
                onClick={e=>e.stopPropagation()}
                style={{position:'absolute',top:8,left:8,width:18,height:18,zIndex:2,cursor:'pointer',accentColor:'var(--accent)'}}
              />
            )}
            {/* Placeholder image */}
            <div style={fss.cardImg}>
              <div style={fss.cardImgPlaceholder}>
                <span style={{fontSize:28}}>{f.categorie==='Entrées'?'🥗':f.categorie==='Plats'?'🍽':f.categorie==='Desserts'?'🍰':'🧀'}</span>
                <span style={{fontSize:9,color:'rgba(255,255,255,0.3)',fontFamily:'monospace',marginTop:4}}>photo {f.categorie.toLowerCase()}</span>
              </div>
            </div>
            <div style={fss.cardBody}>
              <div style={fss.cardCat}>{f.categorie}</div>
              <div style={fss.cardNom}>{f.nom}</div>
              <div style={fss.cardDesc}>{f.descriptionService?.slice(0,90)}{f.descriptionService?.length>90?'…':''}</div>
              {/* Allergènes */}
              {f.allergenes?.length > 0 && (
                <div style={fss.allergenesRow}>
                  {(f.allergenes || []).map(a=>(
                    <span key={a} style={{...fss.allergeneBadge, background:(ALLERGENES_COLORS[a]||'var(--text2)')+'22', color:ALLERGENES_COLORS[a]||'var(--text2)'}}>
                      {ALLERGENES_LABELS[a]||a}
                    </span>
                  ))}
                </div>
              )}
              <div style={fss.cardFooter}>
                <span style={fss.tempBadge}>⏱ {f.tempsPreparation}</span>
                <span style={{...fss.statutBadge,background:f.statut==='active'?'var(--success-bg)':'#f1f5f9',color:f.statut==='active'?'var(--success-text)':'var(--text2)'}}>{f.statut==='active'?'Active':'Brouillon'}</span>
                <span style={fss.accordCount}>{f.accords?.length||0} accord{f.accords?.length!==1?'s':''}</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length===0&&<div style={fss.empty}>Aucune fiche pour ces critères.</div>}
      </div>

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
const FicheDetail = ({ fiche, user, canEdit, onBack, onEdit, onDelete, showForm, editFiche, setEditFiche, setShowForm, saveFiche, recettes = [], cartes = [] }) => {
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
      .map(id => ({ id, label: id, icon: '🥤', items: parType.get(id) }));
    return [...connus, ...inconnus];
  }, [fiche.accords]);
  const [accordTab, setAccordTab] = React.useState(null);
  const groupeActif = groupes.find(g => g.id === accordTab) || groupes[0] || null;

  return (
    <div style={fss.detailRoot}>
      <div style={fss.detailHeader}>
        <button style={fss.backBtn} onClick={onBack}>← Retour</button>
        <div style={{flex:1}}>
          <div style={fss.detailCat}>{fiche.categorie}</div>
          <div style={fss.detailTitre}>{fiche.nom}</div>
          <div style={{fontSize:12,color:'var(--text2)',marginTop:3}}>Modifié le {fiche.modifie}</div>
        </div>
        {canEdit && (
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button style={fss.editBtn} onClick={onEdit}>Modifier</button>
            <button style={fss.deleteBtn} onClick={onDelete}>Supprimer</button>
          </div>
        )}
      </div>

      <div style={fss.detailGrid}>
        {/* Description */}
        <div style={fss.detailCard}>
          <div style={fss.detailCardTitle}>Description pour l'équipe salle</div>
          <div style={fss.descText}>{fiche.descriptionService}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}>
            <div style={fss.infoBlock}>
              <div style={fss.infoLabel}>🌡 Température de service</div>
              <div style={fss.infoVal}>{fiche.temperatureService}</div>
            </div>
            <div style={fss.infoBlock}>
              <div style={fss.infoLabel}>⏱ Temps de préparation</div>
              <div style={fss.infoVal}>{fiche.tempsPreparation}</div>
            </div>
          </div>
          {fiche.dressageNotes && (
            <div style={fss.infoBlock}>
              <div style={fss.infoLabel}>🍽 Notes de dressage / service</div>
              <div style={fss.infoVal}>{fiche.dressageNotes}</div>
            </div>
          )}
        </div>

        {/* Allergènes */}
        <div style={fss.detailCard}>
          <div style={fss.detailCardTitle}>⚠ Allergènes</div>
          {fiche.allergenes?.length > 0 ? (
            <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
              {(fiche.allergenes || []).map(a=>(
                <div key={a} style={{...fss.allergeneFull, borderLeft:`3px solid ${ALLERGENES_COLORS[a]||'#888'}`}}>
                  <span style={{fontWeight:700,color:ALLERGENES_COLORS[a]||'#888'}}>{ALLERGENES_LABELS[a]||a}</span>
                </div>
              ))}
            </div>
          ) : <div style={{fontSize:13,color:'var(--success-text)',marginTop:8}}>✓ Aucun allergène majeur déclaré</div>}
          {fiche.infosService && (
            <div style={{marginTop:14,padding:'10px 12px',background:'var(--warning-bg-soft)',border:'1px solid var(--warning-bd)',borderRadius:8,fontSize:12,color:'var(--warning-text)',lineHeight:1.5}}>
              <strong>Info service :</strong> {fiche.infosService}
            </div>
          )}
        </div>

        {/* Accords */}
        <div style={{...fss.detailCard,gridColumn:'1/-1'}}>
          <div style={fss.detailCardTitle}>🍷 Accords mets & boissons</div>
          {fiche.accordsGeneraux?.length > 0 && (
            <div style={{marginTop:10,marginBottom:4}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.3,marginBottom:6}}>
                Familles recommandées
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {(fiche.accordsGeneraux || []).map((g,i)=>(
                  <span key={i} style={fss.familleBadge}>{g}</span>
                ))}
              </div>
            </div>
          )}
          {groupeActif ? (
            <>
              {/* Les onglets défilent horizontalement : sur mobile 4 familles
                  ne tiennent pas sur une ligne et la page ne doit pas paner. */}
              <div style={{display:'flex',gap:6,marginTop:10,marginBottom:14,overflowX:'auto',paddingBottom:2}}>
                {groupes.map(g=>(
                  <button
                    key={g.id}
                    style={{...fss.accordTab,flexShrink:0,...(groupeActif.id===g.id?fss.accordTabActive:{})}}
                    onClick={()=>setAccordTab(g.id)}
                  >{g.icon} {g.label} ({g.items.length})</button>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}}>
                {groupeActif.items.map((a,i)=>(
                  <div key={i} style={fss.accordCard}>
                    <div style={fss.accordIcon}>{groupeActif.icon}</div>
                    <div>
                      <div style={fss.accordNom}>{a.nom}</div>
                      {a.region && <div style={fss.accordRegion}>{a.region}</div>}
                      {a.alternative && <div style={fss.accordAlt}>↪ {a.alternative}</div>}
                      <div style={fss.accordNotes}>{a.notes}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{fontSize:13,color:'var(--text2)',marginTop:10}}>Aucun accord renseigné.</div>}
        </div>
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
      infosService: [f.infosService, nuances.length ? `Précisions allergènes : ${nuances.join(' · ')}` : '']
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
          <button style={fss.closeBtn} onClick={onClose}>✕</button>
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
                          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 20,
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
              <div style={fss.field}><label style={fss.fLabel}>Température de service</label><input style={fss.fInput} placeholder="ex. Chaud - servir immédiatement" value={fiche?.temperatureService||''} onChange={e=>setFiche(f=>({...f,temperatureService:e.target.value}))}/></div>
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
                  <div style={{ fontSize: 11, color: 'var(--success-text)', marginTop: 4, fontWeight: 600 }}>
                    ✓ Allergènes importés depuis la recette
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
                    ⚠ {fiche.allergenes.length} actif{fiche.allergenes.length > 1 ? 's' : ''}
                  </span>
                )}
              </label>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
                {allAllergs.map(a=>{
                  const sel = (fiche?.allergenes || []).includes(a);
                  return <button key={a} onClick={()=>toggleAllerg(a)} style={{padding:'4px 10px',border:`1.5px solid ${sel?(ALLERGENES_COLORS[a]||'#888'):'var(--border)'}`,borderRadius:20,background:sel?(ALLERGENES_COLORS[a]||'#888')+'22':'var(--surface)',color:sel?(ALLERGENES_COLORS[a]||'#888'):'var(--text2)',fontSize:11,fontWeight:sel?700:400,cursor:'pointer',fontFamily:'var(--font)'}}>
                    {ALLERGENES_LABELS[a]}
                  </button>;
                })}
              </div>
              {inconnus.length > 0 && (
                <div style={{marginTop:10,padding:'8px 10px',background:'var(--warning-bg-soft)',border:'1px solid var(--warning-bd)',borderRadius:8}}>
                  <div style={{fontSize:11,color:'var(--warning-text)',fontWeight:700,marginBottom:6}}>
                    {inconnus.length} valeur{inconnus.length>1?'s':''} hors liste (import ancien) - à convertir ou retirer
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
                            >→ {ids.map(labelAllergene).join(' + ')}</button>
                          )}
                          <button
                            className="touch-target"
                            onClick={()=>retirerInconnu(v)}
                            title="Retirer cette valeur"
                            style={{border:'none',background:'none',color:'var(--text2)',fontSize:13,cursor:'pointer',fontFamily:'var(--font)',padding:'0 4px'}}
                          >✕</button>
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
                    <button key={t.id} style={fss.smallBtn} onClick={()=>addAccord(t.id)}>+ {t.icon} {t.label}</button>
                  ))}
                </div>
              </div>
              {(fiche?.accords||[]).map((a,i)=>(
                <div key={i} style={{border:'1px solid var(--border)',borderRadius:8,padding:8,marginBottom:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'auto 1fr 110px 28px',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:16}}>{accordIcon(a.type)}</span>
                    <input style={fss.fInput} placeholder="Nom (référence précise)" value={a.nom} onChange={e=>updateAccord(i,'nom',e.target.value)}/>
                    <input style={fss.fInput} placeholder="Région" value={a.region} onChange={e=>updateAccord(i,'region',e.target.value)}/>
                    <button style={{background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:14}} onClick={()=>removeAccord(i)}>✕</button>
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
              <label style={fss.fLabel}>Accords généraux - familles recommandées</label>
              <textarea
                style={{...fss.fInput,minHeight:56,resize:'vertical'}}
                placeholder={'Une famille par ligne - ex. :\nVin rouge corsé\nVin blanc sec\nVin blanc moelleux'}
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
          <button style={fss.closeBtn} onClick={fermer}>✕</button>
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
                      border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 20,
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
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)', fontSize: 12 }}>
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
  cats:{display:'flex',gap:4,flexWrap:'wrap'},
  catBtn:{padding:'5px 12px',border:'1px solid var(--border)',borderRadius:20,background:'var(--surface)',color:'var(--text2)',fontSize:11,cursor:'pointer',fontFamily:'var(--font)'},
  catActive:{background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  addBtn:{padding:'8px 16px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  aiBtn:{padding:'8px 16px',background:'var(--ai-bg-soft)',color:'var(--ai-text)',border:'1px solid var(--ai-bd)',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  selectBtn:{padding:'8px 16px',background:'var(--surface)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  serverBanner:{background:'var(--accent-light)',border:'1px solid var(--accent)',borderRadius:10,padding:'14px 18px',display:'flex',alignItems:'center',gap:14},
  grid:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14},
  card:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',cursor:'pointer',transition:'box-shadow .15s, transform .15s'},
  cardImg:{height:120,overflow:'hidden'},
  cardImgPlaceholder:{height:'100%',background:'linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'},
  cardBody:{padding:'12px 14px',display:'flex',flexDirection:'column',gap:6},
  cardCat:{fontSize:10,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:0.5},
  cardNom:{fontSize:14,fontWeight:700,color:'var(--text)',lineHeight:1.3},
  cardDesc:{fontSize:12,color:'var(--text2)',lineHeight:1.5},
  allergenesRow:{display:'flex',flexWrap:'wrap',gap:4},
  allergeneBadge:{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:10},
  cardFooter:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'},
  tempBadge:{fontSize:11,color:'var(--text2)'},
  statutBadge:{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:10},
  accordCount:{fontSize:11,color:'var(--text2)',marginLeft:'auto'},
  empty:{gridColumn:'1/-1',padding:'24px',color:'var(--text2)',fontSize:13,textAlign:'center'},
  // Detail
  detailRoot:{display:'flex',flexDirection:'column',gap:16},
  detailHeader:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 20px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'},
  backBtn:{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'6px 12px',cursor:'pointer',fontSize:12,color:'var(--text2)',fontFamily:'var(--font)',flexShrink:0},
  detailCat:{fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:0.5},
  detailTitre:{fontSize:22,fontWeight:700,color:'var(--text)',fontFamily:'var(--font-serif)',marginTop:2},
  editBtn:{padding:'6px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,fontSize:12,fontWeight:600,color:'var(--text)',cursor:'pointer',fontFamily:'var(--font)'},
  deleteBtn:{padding:'6px 14px',background:'none',border:'1px solid var(--danger-bd)',borderRadius:7,fontSize:12,fontWeight:600,color:'var(--danger-strong)',cursor:'pointer',fontFamily:'var(--font)'},
  detailGrid:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14},
  detailCard:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 18px'},
  detailCardTitle:{fontSize:12,fontWeight:700,color:'var(--text)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:10,paddingBottom:8,borderBottom:'1px solid var(--border)'},
  descText:{fontSize:13,color:'var(--text)',lineHeight:1.7},
  infoBlock:{marginTop:10,display:'flex',flexDirection:'column',gap:3},
  infoLabel:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.3},
  infoVal:{fontSize:13,color:'var(--text)',lineHeight:1.5},
  allergeneFull:{padding:'8px 12px',background:'var(--bg)',borderRadius:7,fontSize:13},
  accordTab:{padding:'5px 14px',border:'1px solid var(--border)',borderRadius:20,background:'var(--surface)',color:'var(--text2)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)'},
  accordTabActive:{background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  accordCard:{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',display:'flex',gap:10,alignItems:'flex-start'},
  accordIcon:{fontSize:22,flexShrink:0},
  accordNom:{fontSize:13,fontWeight:700,color:'var(--text)'},
  accordRegion:{fontSize:11,color:'var(--accent)',fontWeight:600,marginTop:1},
  accordAlt:{fontSize:11,color:'var(--text2)',fontStyle:'italic',marginTop:3},
  accordNotes:{fontSize:12,color:'var(--text2)',marginTop:4,lineHeight:1.4},
  familleBadge:{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:12,background:'var(--accent-light)',color:'var(--accent)',border:'1px solid var(--accent)'},
  // Form modal
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16},
  modal:{background:'var(--surface)',borderRadius:14,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',maxHeight:'90vh',overflowY:'auto'},
  modalHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:2},
  modalTitle:{fontWeight:700,fontSize:16,fontFamily:'var(--font-serif)',color:'var(--text)'},
  closeBtn:{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'},
  modalBody:{padding:'20px 22px'},
  field:{display:'flex',flexDirection:'column',gap:6},
  fLabel:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4},
  fInput:{padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',outline:'none',width:'100%',boxSizing:'border-box'},
  smallBtn:{padding:'4px 10px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,fontSize:11,fontWeight:600,color:'var(--text)',cursor:'pointer',fontFamily:'var(--font)'},
  cancelBtn:{padding:'8px 16px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  saveBtn:{padding:'9px 20px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
};

export default FichesSalle;
