import React from 'react';
import { getDemoData, canManageModule, getPermissionsForRole } from '../../data/demoData.js';
import { notifyLegacy, readLegacyStorage } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { ALLERGENES_MAP, slug, buildRecettePdfData } from '../../utils/recettePdfData.js';
import { useCartes } from '../../hooks/useCartes.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import CarteTabBar from '../../components/cartes/CarteTabBar.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { categorieDuPlat, categoriesPresentes, platCatRank } from '../../utils/categoriesPlat.js';
import { makeSearchMatcher, normalizeSearch } from '../../utils/searchText.js';
import { dureesVie } from '../../utils/etiquettesDlc.js';
import EtiquetteRapideModal from '../haccp/EtiquetteRapideModal.jsx';
import { fmtQte, fmtPortions, fmtFacteur, parseNombre, basePortionsDe, estRecalcule } from '../../utils/echelleRecette.js';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BoutonActions, Fenetre } from '../../components/ui/Fenetres.jsx';
import { messageErreur } from '../../utils/messageErreur.js';
import { encadreStyle, encadreTitreStyle } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import AccueilRecettes from './AccueilRecettes.jsx';
import ChoixEtiquette, { champRecherche } from './ChoixEtiquette.jsx';
import FicheEditeur from './editeur/FicheEditeur.jsx';
import PlatFenetre from './editeur/PlatFenetre.jsx';
import PlatPicker from './editeur/PlatPicker.jsx';
import DetectionAllergenes from './editeur/DetectionAllergenes.jsx';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { copieRecette, effacerBrouillon } from '../../utils/brouillonRecette.js';
import { quandRetoursArrives } from '../../services/historyNav.js';
import { readText, removeStorageKeys, UI_STORAGE_KEYS } from '../../utils/storage.js';
import { confirmLegacy, getBrowserWindow } from '../../legacy/legacyApi.js';
import { useShellMode, estTactile } from '../../hooks/useShellMode.js';
import PhotoFiche from '../../components/fiches/PhotoFiche.jsx';
import AllergenesFiche from '../../components/fiches/AllergenesFiche.jsx';
import { photoDeRecette } from '../../components/fiches/rangementFiches.js';
import VitrineCarte, { clePlat } from './VitrineCarte.jsx';
import VitrineFiches from './VitrineFiches.jsx';


// CARTES & RECETTES
// ALLERGENES_MAP, slug et buildRecettePdfData sont partagés avec le module
// Consultant via src/utils/recettePdfData.js (source unique de l'export fiche).

// Réessai des lectures après un échec réseau (réveil de tablette, coupure) :
// on double l'attente à chaque échec, plafonnée à 30 s.
// Raccourci « Étiquette » sur chaque recette : mêmes rôles que le poste
// d'étiquetage du module HACCP (canWrite), qui imprime par le même circuit.
const ROLES_ETIQUETTE = ['consultant', 'patron', 'resp_cuisine', 'cuisinier'];

const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

// Statut d'une fiche, en mots et en couleur : un brouillon ne se lit pas en vert.
const STATUTS_RECETTE = {
  brouillon: { label: 'Brouillon', couleur: 'var(--text2)' },
  'validée': { label: 'Validée', couleur: 'var(--success-text)' },
  'archivée': { label: 'Archivée', couleur: 'var(--text3)' },
};
const statutRecette = (s) => STATUTS_RECETTE[s] || { label: s || '', couleur: 'var(--text2)' };
// Date ISO (2026-09-29) en date suisse (29.09.2026) ; un autre texte passe tel quel.
const dateSuisse = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10).split('-').reverse().join('.') : (v || ''));
// Temps de la fiche qui valent quelque chose : l'import écrit 0 quand il n'en sait rien.
const tempsFiche = (r) => [['Prépa', r.tempsPreparation], ['Cuisson', r.tempsCuisson], ['Total', r.tempsTotal]].filter(([, v]) => Number(v) > 0);
// Allergènes en toutes lettres, jamais en codes de deux lettres.
const nomsAllergenes = (ids) => (ids || []).map((a) => ALLERGENES_MAP[a] || a).join(', ');

// Titres des écrans du parcours qui reprennent la barre et les vues d'aujourd'hui.
const TITRES_ECRAN = { chercher: 'Je cherche une fiche', carte: 'La carte du moment', gerer: 'Gérer les cartes' };
// Où en est une lecture, pour les lignes d'état : rien une fois lue ; sinon le
// chargement, ou le nouvel essai programmé après un échec (réveil, réseau).
const lectureEnCours = (status) => {
  if (status === 'ready') return null;
  return status === 'error' ? <>indisponible, nouvel essai en cours</> : <>Chargement…</>;
};

// ─── PanneauEtat : grand panneau centré (vide, chargement, indisponible) ───
// Un chargement en cours ou une lecture en échec ne doit JAMAIS s'afficher
// comme un établissement vide : la brigade croyait ses cartes perdues au
// réveil de la tablette.
const PanneauEtat = ({ titre, texte, onRetry }) => (
  <div style={{padding:40, textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)', boxShadow: 'var(--sh-xs)'}}>
    <div style={{fontSize:16, fontWeight:700, marginTop:10, fontFamily:'var(--font-serif)'}}>{titre}</div>
    <div style={{fontSize:13, color:'var(--text2)', marginTop:8}}>{texte}</div>
    {onRetry && (
      <button
        style={{marginTop:16, padding:'9px 18px', background:'var(--accent)', color:'var(--on-accent)', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'var(--font)'}}
        onClick={onRetry}
      >
        Réessayer
      </button>
    )}
  </div>
);

// ─── RecettePhoto : photo avec repli d'état ────────────────────────────────
// Une URL cassée ou expirée bascule broken → on rend le placeholder de marque
// (dégradé pétrole) au lieu de l'ancien display:none qui effaçait l'image en
// silence et laissait le cadre se réagencer. Le placeholder est tokenisé :
// l'ancien dégradé #2a2a2a→#1a1a1a rendait un rectangle quasi noir en clair.
const RecettePhoto = ({ src, alt = '', placeholder = '', style }) => {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => { setBroken(false); }, [src]);
  if (!src || broken) {
    // background APRÈS ...style : le style appelant (vignette, héros) peut
    // porter un fond neutre, le placeholder impose le dégradé de marque.
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style, background: 'var(--grad-brand)' }} aria-label={alt}>
        <span style={{ fontSize: 32, opacity: 0.55 }}>{placeholder}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      style={{ objectFit: 'cover', display: 'block', ...style }}
      onError={() => setBroken(true)}
    />
  );
};

// ─── smStyle : habillage commun des modales du module ─────────────────────
// Les trois fenêtres (DuplicateRecetteModal, ExportMultipleModal,
// IngredientSearchModal) passent par Fenetre ; reste le bouton secondaire.
const smStyle = {
  ghostBtn: { padding: '8px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer' },
};

// ─── DuplicateRecetteModal : modale de duplication vers plusieurs établissements ───
// Composant module-level (PAS imbriqué) pour éviter les remounts et stale closures.
const DuplicateRecetteModal = ({ recette, user, sourceEtab, onClose }) => {
  const legacySB = dbService.getBridge();
  const [accessibleEtabs, setAccessibleEtabs] = React.useState([]);
  const [existingByEtab, setExistingByEtab] = React.useState({}); // { etabId: existingRecetteRow|null }
  const [loading, setLoading] = React.useState(true);
  const [selectedEtabIds, setSelectedEtabIds] = React.useState(new Set());
  const [conflictMode, setConflictMode] = React.useState('rename'); // 'rename' | 'overwrite' | 'skip'
  const [opts, setOpts] = React.useState({
    ingredients: true,
    etapes: true,
    photos: true,
    allergenes: true,
  });
  const [saving, setSaving] = React.useState(false);

  // Charger les établissements accessibles au user au mount
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!legacySB) { setLoading(false); return; }
        const all = await legacySB.db.listEtablissements();
        if (!mounted) return;
        // Filtre : exclure l'établissement source + ne garder que ceux où le user a accès
        const isConsultant = user?.role === 'consultant';
        const allowedIds = user?.etablissementIds || [];
        const list = (all || []).filter(e => {
          if (e.id === sourceEtab?.id) return false;
          if (isConsultant) return true;
          return allowedIds.includes(e.id);
        });
        setAccessibleEtabs(list);

        // Pour chaque étab, détecter si une recette du même nom existe
        const existing = {};
        await Promise.all(list.map(async (e) => {
          try {
            const recs = await legacySB.db.listRecettes(e.id);
            const found = (recs || []).find(r => (r.nom || '').trim().toLowerCase() === (recette.nom || '').trim().toLowerCase());
            existing[e.id] = found || null;
          } catch (err) {
            existing[e.id] = null;
          }
        }));
        if (mounted) setExistingByEtab(existing);
      } catch (err) {
        console.error('[DuplicateRecette] load etabs', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [sourceEtab?.id, recette?.nom, legacySB, user]);

  const toggleEtab = (id) => {
    setSelectedEtabIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = accessibleEtabs.length > 0 && accessibleEtabs.every(e => selectedEtabIds.has(e.id));

  const handleDuplicate = async () => {
    if (selectedEtabIds.size === 0) { notifyLegacy('Sélectionnez au moins un établissement.', 'warning'); return; }
    if (!legacySB) { notifyLegacy('Base de données indisponible.', 'error'); return; }

    setSaving(true);
    const successes = [];
    const failures = [];

    // Construit le payload à copier selon les options. Les champs non cochés sont vidés/zéroés.
    const buildPayload = (targetEtabId, overrideId, overrideNom) => ({
      // Si overwrite : on garde l'id existant pour upsert ; sinon nouvel id
      id: overrideId || ('rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
      etablissementId: targetEtabId,
      nom: overrideNom || recette.nom,
      categorie: recette.categorie,
      portions: recette.portions,
      // Aucun prix ne part d'ici (décision du 27.10.2026) : le prix de vente
      // n'est pas transmis (enregistré à 0) et les prix des lignes repartent à
      // 0, à chiffrer dans l'établissement d'arrivée. Recopier les prix : Outils
      // consultant, Chiffrage, Transférer.
      tempsPreparation: recette.tempsPreparation || 0,
      tempsCuisson: recette.tempsCuisson || 0,
      tempsTotal: recette.tempsTotal || 0,
      statut: 'brouillon', // une copie commence en brouillon pour validation côté étab cible
      version: 1,
      allergenesIds: opts.allergenes ? (recette.allergenesIds || []) : [],
      notesConsultant: recette.notesConsultant || '',
      dressage: recette.dressage || '',
      conservation: recette.conservation || '',
      // Flag congélation : suit la recette source (null = à qualifier).
      congelable: recette.congelable ?? null,
      ingredients: opts.ingredients
        ? (recette.ingredients || []).map(i => ({ ...i, prixUnit: 0 }))
        : [],
      etapes: opts.etapes ? (recette.etapes || []) : [],
      modifiePar: user?.id || null,
      photoUrl: opts.photos ? (recette.photoUrl || null) : null,
    });

    for (const etabId of selectedEtabIds) {
      const targetEtab = accessibleEtabs.find(e => e.id === etabId);
      const existing = existingByEtab[etabId];
      try {
        if (existing && conflictMode === 'skip') {
          failures.push({ etabId, etabNom: targetEtab?.nom, reason: 'ignoré (recette déjà présente)' });
          continue;
        }
        let payload;
        if (existing && conflictMode === 'overwrite') {
          payload = buildPayload(etabId, existing.id, existing.nom);
        } else if (existing && conflictMode === 'rename') {
          payload = buildPayload(etabId, null, `${recette.nom} (copie)`);
        } else {
          payload = buildPayload(etabId, null, null);
        }
        const saved = await legacySB.db.upsertRecette(payload);
        successes.push({ etabId, etabNom: targetEtab?.nom, recetteId: saved?.id });
      } catch (err) {
        console.error('[DuplicateRecette] target', etabId, err);
        failures.push({ etabId, etabNom: targetEtab?.nom, reason: messageErreur(err, 'recettes', 'Enregistrement impossible.') });
      }
    }

    setSaving(false);

    if (successes.length > 0) {
      const list = successes.map(s => s.etabNom).filter(Boolean).join(', ');
      notifyLegacy(`"${recette.nom}" dupliquée vers ${successes.length} établissement${successes.length > 1 ? 's' : ''} : ${list}`, 'success');
    }
    if (failures.length > 0) {
      const list = failures.map(f => `${f.etabNom} (${f.reason})`).join(' ; ');
      notifyLegacy(`${failures.length} duplication(s) non effectuée(s) : ${list}`, 'warning');
    }
    if (successes.length > 0) onClose();
  };

  // Fenetre : portail, rôle de dialogue, Échap, « × » nommé, geste retour. La
  // fermeture reste possible pendant la duplication, qui se poursuit.
  return (
    <Fenetre
      id="recette-dupliquer"
      titre="Dupliquer la recette vers…"
      sousTitre={`« ${recette.nom} »`}
      onClose={onClose}
      largeur={640}
      pied={(
        <>
          <span style={{ flex: 1, fontSize: 12, color: selectedEtabIds.size > 0 ? 'var(--text)' : 'var(--text2)' }}>
            {selectedEtabIds.size > 0
              ? <>Dupliquer vers <strong>{selectedEtabIds.size}</strong> établissement{selectedEtabIds.size > 1 ? 's' : ''}</>
              : 'Sélectionnez au moins un établissement'}
          </span>
          <button style={smStyle.ghostBtn} onClick={() => !saving && onClose()} disabled={saving}>Annuler</button>
          <button
            style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', opacity: selectedEtabIds.size === 0 || saving ? 0.5 : 1 }}
            onClick={handleDuplicate}
            disabled={selectedEtabIds.size === 0 || saving}>
            {saving ? 'Duplication…' : `Dupliquer (${selectedEtabIds.size})`}
          </button>
        </>
      )}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {loading && <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 20 }}>Chargement des établissements…</div>}

          {!loading && accessibleEtabs.length === 0 && (
            <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }}>
              Aucun autre établissement accessible pour cette duplication.
            </div>
          )}

          {!loading && accessibleEtabs.length > 0 && (
            <>
              {/* ── Sélection établissements cibles ── */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    Établissements cibles ({selectedEtabIds.size} sélectionné{selectedEtabIds.size > 1 ? 's' : ''})
                  </label>
                  <button type="button"
                    style={{ padding: '4px 8px', fontSize: 11, fontWeight: 500, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' }}
                    onClick={() => {
                      if (allSelected) setSelectedEtabIds(new Set());
                      else setSelectedEtabIds(new Set(accessibleEtabs.map(e => e.id)));
                    }}>
                    {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {accessibleEtabs.map(e => {
                    const checked = selectedEtabIds.has(e.id);
                    const hasExisting = !!existingByEtab[e.id];
                    return (
                      <label key={e.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          border: '1px solid transparent',
                          borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          background: checked ? 'var(--accent-light)' : 'var(--surface)',
                        }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleEtab(e.id)} />
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.couleur || 'var(--accent)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nom}</span>
                        {hasExisting && <span title="Une recette du même nom existe déjà ici" style={{ fontSize: 11, color: 'var(--warning-text)', fontWeight: 700 }}>déjà présente</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ── Options de copie ── */}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Que copier ?</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, fontSize: 12 }}>
                  {[
                    { key: 'ingredients', label: 'Ingrédients' },
                    { key: 'etapes', label: 'Étapes de préparation' },
                    { key: 'photos', label: 'Photo' },
                    { key: 'allergenes', label: 'Allergènes & HACCP' },
                  ].map(o => (
                    <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!opts[o.key]}
                        onChange={e => setOpts(prev => ({ ...prev, [o.key]: e.target.checked }))} />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Gestion des doublons (si conflit détecté parmi les sélectionnés) ── */}
              {Array.from(selectedEtabIds).some(id => existingByEtab[id]) && (
                <div style={{ ...encadreStyle('alerte') }}>
                  <div style={{ fontSize: 12, ...encadreTitreStyle('alerte'), marginBottom: 8 }}>
                    Cette recette existe déjà dans certains établissements sélectionnés
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                    {[
                      { v: 'rename', label: 'Créer en doublon avec suffixe « (copie) »' },
                      { v: 'overwrite', label: 'Écraser la recette existante' },
                      { v: 'skip', label: 'Ignorer cet établissement' },
                    ].map(opt => (
                      <label key={opt.v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="dupRecConflictMode" value={opt.v}
                          checked={conflictMode === opt.v}
                          onChange={() => setConflictMode(opt.v)} />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </Fenetre>
  );
};

// ─── RecetteDetail : composant global (extrait hors de Recettes) ───
// canFiches : droit « Créer et modifier les fiches » ; la fiche ouvre alors
// l'éditeur (Modifier), en fait une copie (Dupliquer) ou la sort des archives.
// photo : calculée par Recettes (photoDeRecette : la sienne, sinon celle du
// plat dont elle est la première fiche) ; null = visuel de remplacement.
// Ordre de lecture du service : héros, allergènes, puis ingrédients à gauche
// et étapes à droite dès 760 px de fiche (iPad portrait compris) ; la
// conservation (congélation, durées de vie : des réglages) vient ensuite.
const RecetteDetail = ({ recette, photo = null, user, etablissement, onBack, canEtiqueter = false, canFiches = false, onModifier, onDupliquer, onDesarchiver }) => {
  const [showDuplicate, setShowDuplicate] = React.useState(false);
  const [showEtiquette, setShowEtiquette] = React.useState(false);
  const isMobile = useIsMobile();
  // Coque tactile (iPad, téléphone) : ingrédients et étapes en 16 px.
  const tactile = estTactile(useShellMode());

  // La fiche s'ouvre en haut (Retour, nom du plat), pas au défilement laissé
  // par la liste : ouverte depuis le bas de la carte, elle cachait son titre.
  // Même motif que la fiche des Fiches salle.
  const hautRef = React.useRef(null);
  React.useLayoutEffect(() => {
    for (let el = hautRef.current?.parentElement; el; el = el.parentElement) if (el.scrollTop > 0) el.scrollTop = 0;
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }, [recette.id]);

  // ─── Recalcul des quantités, dans la fiche ────────────────────────────────
  // Il y avait une modale « Calculateur » : elle recouvrait les étapes et le
  // reste de la fiche, donc on faisait l'aller-retour pour chaque quantité.
  // Tout se règle maintenant sur place, et les deux entrées d'origine sont
  // conservées : le nombre de portions, ou la quantité réelle d'un ingrédient.
  // `portions` reste l'unique source de vérité (le ratio en découle) : l'export
  // PDF et l'impression reflètent donc exactement ce qui est à l'écran.
  // Formatage et parsing viennent de utils/echelleRecette.js, partagés avec
  // l'éditeur de recette d'Outils consultant.
  const basePortions = basePortionsDe(recette);
  const [portions, setPortions] = React.useState(basePortions);
  // Index de l'ingrédient qui a servi de référence au dernier recalcul (🎯).
  const [refIdx, setRefIdx] = React.useState(null);
  // Saisies en cours : tant qu'un champ a le focus, on affiche la frappe brute.
  // Sans cela la valeur recalculée réécrirait le champ à chaque caractère
  // (taper « 750 » sur une base de 500 renvoyait « 7 » puis « 75 » recalculés).
  const [saisiePortions, setSaisiePortions] = React.useState(null);
  const [saisieQte, setSaisieQte] = React.useState(null); // { idx, texte }

  const ratio = portions > 0 ? portions / basePortions : 1;
  const isScaled = estRecalcule(ratio);
  const facteurAffiche = fmtFacteur(ratio);
  const rappelBase = `${basePortions > 1 ? 'portions' : 'portion'}, fiche enregistrée inchangée`;

  const revenirBase = () => {
    setPortions(basePortions);
    setRefIdx(null);
    setSaisiePortions(null);
    setSaisieQte(null);
  };

  // Entrée 1 : le nombre de portions. Les pas ± repartent d'un entier même si
  // l'échelle courante vient d'une quantité (6,67 → 7 / 6).
  const changePortions = (n) => {
    if (!(n > 0)) return;
    setPortions(n);
    setRefIdx(null);
  };
  const pasPortions = (sens) => {
    setSaisiePortions(null);
    changePortions(sens > 0 ? Math.floor(portions) + 1 : Math.max(1, Math.ceil(portions) - 1));
  };

  // Entrée 2 : la quantité réelle d'un ingrédient. Toute la recette se cale
  // dessus : l'ancienne « méthode 2 » (choisir l'ingrédient dans une liste puis
  // saisir la cible) tient désormais dans la case qu'on lit déjà.
  const changeQuantite = (idx, base, texte) => {
    setSaisieQte({ idx, texte });
    const n = parseNombre(texte);
    if (n > 0 && base > 0) {
      setPortions(basePortions * (n / base));
      setRefIdx(idx);
      setSaisiePortions(null);
    }
  };

  // ─── Flag congelation (utilise par le module Mise en place) ───
  // Editable par consultant/patron uniquement ; les autres roles voient le statut.
  // null = « a qualifier » (traite comme non congelable, choix prudent).
  const canEditCongelable = ['consultant', 'patron'].includes(user?.role);
  const [congelable, setCongelable] = React.useState(recette.congelable ?? null);
  const [savingCong, setSavingCong] = React.useState(false);
  const saveCongelable = async (val) => {
    const legacySB = dbService.getBridge();
    if (!legacySB) { notifyLegacy('Base de données indisponible.', 'error'); return; }
    const prev = congelable;
    setCongelable(val);
    setSavingCong(true);
    try {
      await legacySB.db.upsertRecette({ ...recette, congelable: val, modifiePar: user?.id || null });
      notifyLegacy('Qualification congélation enregistrée.', 'success');
    } catch (err) {
      console.error('[saveCongelable]', err);
      setCongelable(prev);
      notifyLegacy(messageErreur(err, 'recettes', 'Enregistrement impossible.'), 'error');
    }
    setSavingCong(false);
  };

  // ─── Durées de vie (DLC) : alimentent le poste d'étiquetage HACCP ───
  // La durée de vie relève de l'autocontrôle de l'établissement : elle est
  // saisie ici par consultant/patron/resp_cuisine, jamais calculée par le
  // système ni modifiable par un exécutant. C'est le seul endroit où elle
  // s'édite - l'onglet Étiquettes la lit sans jamais l'écrire.
  const canEditDurees = ['consultant', 'patron', 'resp_cuisine'].includes(user?.role);
  // Référence enregistrée : sert de base de comparaison pour activer le bouton.
  // Remise à jour après un enregistrement réussi, sinon le bouton resterait actif
  // tant que la fiche parente n'a pas été rechargée.
  const [dureesRef, setDureesRef] = React.useState(() => dureesVie(recette));
  const [durees, setDurees] = React.useState({
    frais: String(dureesRef.frais),
    congele: dureesRef.congele == null ? '' : String(dureesRef.congele),
    decongele: String(dureesRef.decongele),
  });
  const [savingDurees, setSavingDurees] = React.useState(false);
  const dureesModifiees = durees.frais !== String(dureesRef.frais)
    || durees.congele !== (dureesRef.congele == null ? '' : String(dureesRef.congele))
    || durees.decongele !== String(dureesRef.decongele);

  const saveDurees = async () => {
    const legacySB = dbService.getBridge();
    if (!legacySB) { notifyLegacy('Base de données indisponible.', 'error'); return; }
    const entier = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : NaN; };
    const frais = entier(durees.frais);
    const decongele = entier(durees.decongele);
    // Vide = préparation non congelable (les modes surgélation et décongélation
    // deviennent indisponibles à l'étiquetage).
    const congele = durees.congele.trim() === '' ? null : entier(durees.congele);
    if (!(frais > 0) || !(decongele > 0) || (congele !== null && !(congele > 0))) {
      notifyLegacy('Les durées de vie doivent être des nombres de jours supérieurs à zéro.', 'warning');
      return;
    }
    setSavingDurees(true);
    try {
      await legacySB.db.upsertRecette({
        ...recette,
        dureeVieJours: frais,
        dureeVieCongeleJours: congele,
        dureeVieDecongeleJours: decongele,
        modifiePar: user?.id || null,
      });
      setDureesRef({ frais, congele, decongele });
      notifyLegacy('Durées de vie enregistrées.', 'success');
    } catch (err) {
      console.error('[saveDurees]', err);
      notifyLegacy(messageErreur(err, 'recettes', 'Enregistrement impossible.'), 'error');
    }
    setSavingDurees(false);
  };

  // Qui peut dupliquer ? consultant + patron + responsable cuisine
  // (cuisinier/serveur cachés ; chef de production peut être un alias de resp_cuisine)
  const canDuplicate = ['consultant', 'patron', 'resp_cuisine'].includes(user?.role);

  // Données fiche pour l'export jsPDF natif (helper module buildRecettePdfData).
  // On reflète les portions affichées (quantités mises à l'échelle).
  // Pas de food cost : la fiche sortie d'ici est une fiche de production pour la
  // brigade. Le chiffrage reste dans Outils consultant, qui appelle le même
  // helper avec isConsultant.
  // Arrondi : une échelle posée depuis une quantité donne des portions
  // décimales (6,666…), qui partiraient telles quelles dans l'entête du PDF.
  const pdfOpts = { portions: Math.round(portions * 100) / 100 };

  const printRecipe = () => {
    if (!pdfUtils?.exportRecettePdf) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    // Génération jsPDF native → impression directe (autoPrint).
    pdfUtils.exportRecettePdf(buildRecettePdfData(recette, pdfOpts), { etablissement, autoPrint: true });
  };

  const exportRecipePdf = () => {
    if (!pdfUtils?.exportRecettePdf) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    pdfUtils.exportRecettePdf(buildRecettePdfData(recette, pdfOpts), { etablissement, filename: `Fiche_${slug(recette.nom)}.pdf` });
  };

  // ─── Bloc 2 : lisibilité mobile (fiche à l'écran) ───
  // Styles inline → pas de @media : on bascule via le hook useIsMobile.
  // Grille 2 col → 1 col, en-tête empilé, colonnes ingrédients resserrées
  // et police agrandie pour rester lisible sous 400 px.
  // Colonne quantité élargie : elle porte un champ, et sur tablette la règle
  // globale « pointer: coarse » impose 16px de police (anti-zoom iOS).
  const ingCols = isMobile ? '1fr 78px 34px' : '1fr 96px 60px';
  const sIngName = { ...rs.ingName, ...(tactile ? { fontSize: 16 } : (isMobile ? { fontSize: 15 } : null)) };
  const portionsFiche = Number(recette.portions) || 0;
  const statutAffiche = recette.statut && recette.statut !== 'validée' ? statutRecette(recette.statut).label : null;

  return (
    <div ref={hautRef} style={rs.detailRoot}>
      {showDuplicate && (
        <DuplicateRecetteModal
          recette={recette}
          user={user}
          sourceEtab={etablissement}
          onClose={() => setShowDuplicate(false)}
        />
      )}
      {/* Durées relues depuis la référence enregistrée dans cette fiche : une
          durée corrigée ici vaut tout de suite pour l'étiquette. */}
      {showEtiquette && (
        <EtiquetteRapideModal
          recette={{
            ...recette,
            dureeVieJours: dureesRef.frais,
            dureeVieCongeleJours: dureesRef.congele,
            dureeVieDecongeleJours: dureesRef.decongele,
          }}
          etabId={etablissement?.id || 'etab-1'}
          user={user}
          onClose={() => setShowEtiquette(false)}
        />
      )}
      <div className="module-actions no-print" style={{ marginBottom: 16 }}>
        <button style={rs.backBtn} onClick={onBack}>Retour</button>
        {canFiches && recette.statut === 'archivée' && (
          <button style={rs.etiquetteBtn} onClick={onDesarchiver}>Désarchiver</button>
        )}
        {canFiches && (
          <button style={rs.etiquetteBtn} onClick={onModifier}>Modifier</button>
        )}
        {canFiches && (
          <button style={rs.printBtn} onClick={onDupliquer}>Dupliquer</button>
        )}
        {canEtiqueter && (
          <button style={rs.etiquetteBtn} onClick={() => setShowEtiquette(true)}>Étiquette DLC</button>
        )}
        <BoutonActions
          id="fiche-exporter"
          label="Exporter"
          style={rs.printBtn}
          titre="Exporter la fiche"
          sousTitre={recette.nom}
          sections={[{ items: [
            { titre: 'Télécharger le PDF', detail: 'La fiche technique sur une page.', onClick: exportRecipePdf },
            { titre: 'Imprimer', detail: 'La même fiche, envoyée à l\'imprimante.', onClick: printRecipe },
          ] }]}
        />
        {canDuplicate && (
          <button style={rs.printBtn} onClick={() => setShowDuplicate(true)}>Dupliquer vers…</button>
        )}
      </div>
      <div id='fiche-recette-print' className={`fv fv-fiche${tactile ? ' fv-fiche--tactile' : ''}`}>
      {/* Bandeau héros, toujours : la photo (ou le visuel de remplacement de
          la catégorie) porte la fiche, catégorie, nom, temps et portions posés
          sur le voile. Le statut ne s'écrit que s'il n'est pas « Validée ».
          L'export PDF et Imprimer passent par le jsPDF vectoriel
          (buildRecettePdfData) : ce héros est purement écran. */}
      <header className="fv-heros" data-heros="">
        <PhotoFiche src={photo} categorie={recette.categorie} nom={recette.nom} variante="heros" />
        <span className="fv-voile" aria-hidden="true" />
        {statutAffiche && <span className="fv-pastille">{statutAffiche}</span>}
        <div className="fv-heros-texte">
          {recette.categorie && <p className="fv-heros-cat">{recette.categorie}</p>}
          <h2 className="fv-heros-titre">{recette.nom}</h2>
          {(tempsFiche(recette).length > 0 || portionsFiche > 0) && (
            <p className="fv-heros-meta">
              {tempsFiche(recette).map(([libelle, minutes]) => (
                <span key={libelle}>{libelle} <span data-no-translate="">{minutes}</span> min</span>
              ))}
              {portionsFiche > 0 && (
                <span><span data-no-translate="">{fmtPortions(portionsFiche)}</span> {portionsFiche > 1 ? 'portions' : 'portion'}</span>
              )}
            </p>
          )}
        </div>
      </header>

      <AllergenesFiche ids={recette.allergenesIds} variante="bandeau" />

      <div className="fv-fiche-cols">
        <section className="fv-bloc" data-fiche-section="ingredients">
          <div className="fv-bloc-tete">
            <h3 className="fv-titre-section">Ingrédients</h3>
            <div className="no-print" style={rs.portionsCtrl}>
              <span style={{fontSize:12, color:'var(--text2)'}}>Portions :</span>
              <button type="button" className="touch-target" style={rs.portBtn} onClick={() => pasPortions(-1)} aria-label="Une portion de moins">−</button>
              <input
                type="number" min="0.1" step="1" inputMode="decimal"
                value={saisiePortions !== null ? saisiePortions : fmtPortions(portions)}
                onChange={e => { setSaisiePortions(e.target.value); changePortions(parseNombre(e.target.value)); }}
                onFocus={e => e.target.select()}
                onWheel={e => e.target.blur()}
                onBlur={() => setSaisiePortions(null)}
                style={rs.portInput}
                aria-label="Nombre de portions"
              />
              <button type="button" className="touch-target" style={rs.portBtn} onClick={() => pasPortions(1)} aria-label="Une portion de plus">+</button>
            </div>
          </div>
          {/* Barre d'échelle : remplace l'ancienne modale « Calculateur ». Elle
              dit d'où l'on part, où l'on en est, et comment revenir en arrière,
              sans jamais masquer les étapes. */}
          <div className="no-print" style={{...rs.echelleBar, ...(isScaled ? rs.echelleBarActive : null)}}>
            {isScaled ? (
              <>
                {/* Les nombres sont isolés en data-no-translate, et les mots
                    restants forment UN seul nœud texte : sans cela le moteur
                    i18n verrait « Recalculé × 1.50 » comme une phrase inédite
                    et paierait une traduction IA par facteur affiché. */}
                <span style={{fontWeight:700, color:'var(--warning-text)'}}>
                  Recalculé <span data-no-translate>{facteurAffiche}</span>
                </span>
                <span style={{color:'var(--warning-text)'}}>
                  base <span data-no-translate>{basePortions}</span> {rappelBase}
                </span>
                <button type="button" style={rs.echelleReset} onClick={revenirBase}>Revenir à la base</button>
              </>
            ) : (
              <span>Changez les portions, ou tapez la quantité que vous avez sur une ligne : toute la recette suit.</span>
            )}
          </div>
          <div style={rs.ingTable}>
            <div style={{...rs.ingHead, gridTemplateColumns: ingCols}}><span>Ingrédient</span><span>Quantité</span><span>Unité</span></div>
            {(recette.ingredients || []).map((i, idx) => {
              const base = Number(i.quantite) || 0;
              const estRef = isScaled && refIdx === idx;
              const enSaisie = saisieQte && saisieQte.idx === idx;
              return (
                <div key={i.id || idx} data-ligne="" style={{...rs.ingRow, gridTemplateColumns: ingCols, ...(estRef ? rs.ingRowRef : null)}}>
                  <span style={sIngName}>{i.nom}{estRef ? ' (réf.)' : ''}</span>
                  {base > 0 ? (
                    <div style={{minWidth:0}}>
                      <input
                        type="number" min="0" step="any" inputMode="decimal"
                        value={enSaisie ? saisieQte.texte : fmtQte(base * ratio)}
                        onChange={e => changeQuantite(idx, base, e.target.value)}
                        onFocus={e => e.target.select()}
                        /* Molette : au-dessus d'un champ nombre focalisé, un
                           simple défilement de la fiche modifierait la valeur
                           sans que personne ne le voie. On rend la main. */
                        onWheel={e => e.target.blur()}
                        onBlur={() => setSaisieQte(null)}
                        style={{...rs.ingQtyInput, ...(estRef ? rs.ingQtyInputRef : null), ...(isMobile ? { fontSize: 15 } : null)}}
                        aria-label={`Quantité de ${i.nom || 'l’ingrédient'} : la modifier recalcule la recette`}
                      />
                      {isScaled && <div style={rs.ingQtyBase}>base <span data-no-translate>{fmtQte(base)}</span></div>}
                    </div>
                  ) : (
                    <span style={{...rs.ingQty, ...(isMobile ? { fontSize: 15 } : null)}}>{fmtQte(base)}</span>
                  )}
                  <span style={{fontSize: isMobile ? 14 : 13, color:'var(--text2)'}}>{i.unite}</span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="fv-col">
          {(recette.etapes || []).length > 0 && (
            <section className="fv-bloc" data-fiche-section="etapes">
              <h3 className="fv-titre-section">Étapes</h3>
              <ol className="fv-etapes">
                {recette.etapes.map((e, i) => (
                  <li key={i} className="fv-etape">
                    <span className="fv-etape-num" data-no-translate="">{i + 1}</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {recette.dressage && (
            <section className="fv-bloc">
              <h3 className="fv-titre-section">Dressage</h3>
              <p className="fv-texte-long">{recette.dressage}</p>
            </section>
          )}
        </div>
      </div>

      {/* Conservation : le texte, puis Congélation et Durées de vie (des
          réglages, lus par la Mise en place et le poste d'étiquetage). */}
      <section className="fv-bloc" data-fiche-section="conservation">
        <h3 className="fv-titre-section">Conservation</h3>
        {recette.conservation && <p className="fv-texte-long">{recette.conservation}</p>}
        <div className="fv-conservation-cols">
          <div className="fv-bloc">
            <h4 className="fv-sous-titre">Congélation</h4>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                {congelable === true && <span style={{...rs.badge, background:'var(--success-bg)', color:'var(--success-text)'}}>Congelable, grosse production</span>}
                {congelable === false && <span style={{...rs.badge, background:'var(--warning-bg)', color:'var(--warning-text)'}}>Non congelable, urgent</span>}
                {congelable == null && <span style={{...rs.badge, background:'var(--bg)', color:'var(--text2)', border:'1px solid var(--border)'}}>À qualifier</span>}
              </div>
              {canEditCongelable ? (
                <div className="no-print" style={{display:'flex', flexDirection:'column', gap:8}}>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    <button
                      type="button"
                      disabled={savingCong}
                      onClick={() => saveCongelable(true)}
                      style={{...rs.congBtn, ...(congelable === true ? rs.congBtnActive : null)}}
                    >Congelable</button>
                    <button
                      type="button"
                      disabled={savingCong}
                      onClick={() => saveCongelable(false)}
                      style={{...rs.congBtn, ...(congelable === false ? rs.congBtnActive : null)}}
                    >Non congelable</button>
                  </div>
                </div>
              ) : (
                congelable == null && (
                  <div className="no-print" style={{fontSize:11, color:'var(--text2)', fontStyle:'italic'}}>
                    Non qualifiée : à faire renseigner par le consultant ou le patron.
                  </div>
                )
              )}
            </div>
          </div>
          {/* Durées de vie : lues par le poste d'étiquetage DLC (module HACCP). */}
          <div className="fv-bloc">
            <h4 className="fv-sous-titre">Durées de vie (DLC)</h4>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {canEditDurees ? (
                <div className="no-print" style={{display:'flex', flexDirection:'column', gap:8}}>
                  {[
                    { k: 'frais',     label: 'Froid positif (0 à 3 °C)' },
                    { k: 'congele',   label: 'Surgelé (-18 °C)' },
                    { k: 'decongele', label: 'Après décongélation' },
                  ].map(f => (
                    <div key={f.k} style={{display:'flex', alignItems:'center', gap:10}}>
                      <span style={{flex:1, minWidth:0, fontSize:12, color:'var(--text2)'}}>{f.label}</span>
                      <input
                        type="number" min="1" step="1" inputMode="numeric"
                        value={durees[f.k]}
                        disabled={savingDurees}
                        onChange={e => setDurees(prev => ({ ...prev, [f.k]: e.target.value }))}
                        style={{width:64, flexShrink:0, padding:'7px 8px', border:'1px solid var(--border)', borderRadius:7, fontSize:13, fontWeight:700, textAlign:'right', color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', outline:'none'}}
                        aria-label={f.label}
                      />
                      <span style={{width:38, flexShrink:0, fontSize:11, color:'var(--text2)'}}>jours</span>
                    </div>
                  ))}
                  <div style={{fontSize:11, color:'var(--text2)', lineHeight:1.5}}>
                    Surgelé vide = préparation non congelable : les modes surgélation et décongélation
                    sont alors indisponibles à l'étiquetage.
                  </div>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    <button
                      type="button"
                      disabled={savingDurees || !dureesModifiees}
                      onClick={saveDurees}
                      style={{...rs.congBtn, ...(dureesModifiees ? rs.congBtnActive : null), opacity: savingDurees || !dureesModifiees ? 0.55 : 1}}
                    >{savingDurees ? 'Enregistrement…' : 'Enregistrer les durées'}</button>
                  </div>
                </div>
              ) : (
                <div style={{fontSize:13, color:'var(--text)', lineHeight:1.7}}>
                  <div>Froid positif : <strong>{dureesRef.frais} jours</strong></div>
                  <div>Surgelé : <strong>{dureesRef.congele == null ? 'non congelable' : `${dureesRef.congele} jours`}</strong></div>
                  <div>Après décongélation : <strong>{dureesRef.decongele} jours</strong></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {recette.notesConsultant && (
        <section className="fv-bloc">
          <h3 className="fv-titre-section">Notes consultant</h3>
          <p className="fv-texte-long">{recette.notesConsultant}</p>
        </section>
      )}

      <p className="fv-pied">
        Version <span data-no-translate="">{recette.version || 1}</span>
        {recette.modifie && <>, modifiée le <span data-no-translate="">{dateSuisse(recette.modifie)}</span></>}
      </p>
      </div>
    </div>
  );
};

// ─── Export multiple : une carte entière, des plats ou des recettes, rangés par catégories ───
// Les trois onglets alimentent UNE même sélection (cumulable) ; les doublons
// sont retirés à l'export : une recette cochée ET présente via une carte ou un
// plat sélectionné ne sort qu'une seule fois. L'ordre des pages du PDF suit le
// rangement affiché : cartes (catégorie > ordre du plat > ordre des recettes),
// puis plats, puis recettes individuelles.
// Ordre des pages = ordre de service du référentiel partagé (Entrées → Menus).
// Les catégories de recette qui n'y figurent pas (Sauces, Fonds, Garnitures…)
// passent en fin de liste, rangées entre elles par ordre alphabétique.
const exportCatRank = platCatRank;

const ExportMultipleModal = ({ cartes, plats, recettes, etablissement, onClose }) => {
  const [tab, setTab] = React.useState('cartes'); // 'cartes' | 'plats' | 'recettes'
  const [query, setQuery] = React.useState('');
  const [selCartes, setSelCartes] = React.useState(() => new Set());
  const [selPlats, setSelPlats] = React.useState(() => new Set());
  const [selRecettes, setSelRecettes] = React.useState(() => new Set());
  const [expandedCartes, setExpandedCartes] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);

  const match = makeSearchMatcher(query);
  const q = match.active;

  const recetteById = React.useMemo(() => {
    const m = new Map();
    (recettes || []).forEach(r => m.set(r.id, r));
    return m;
  }, [recettes]);

  const platsActifs = React.useMemo(() => (plats || []).filter(p => p.actif !== false), [plats]);

  // Recettes d'un plat, dans l'ordre de composition (les archivées sont déjà exclues en amont).
  const recettesDuPlat = React.useMemo(() => {
    const m = new Map();
    platsActifs.forEach(p => m.set(p.id,
      (p.recettes || [])
        .slice()
        .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
        .map(pr => recetteById.get(pr.recetteId))
        .filter(Boolean)
    ));
    return m;
  }, [platsActifs, recetteById]);

  // Plats d'une carte, rangés par catégorie puis ordre : c'est aussi l'ordre des pages du PDF.
  const platsDeCarte = React.useMemo(() => {
    const m = new Map();
    (cartes || []).forEach(c => m.set(c.id,
      platsActifs
        .filter(p => (p.carteIds || []).includes(c.id))
        .sort((a, b) =>
          exportCatRank(a.categorie) - exportCatRank(b.categorie) ||
          (a.ordre || 0) - (b.ordre || 0) ||
          (a.nom || '').localeCompare(b.nom || ''))
    ));
    return m;
  }, [cartes, platsActifs]);

  const fichesDeCarte = (carteId) => {
    const seen = new Set();
    (platsDeCarte.get(carteId) || []).forEach(p => (recettesDuPlat.get(p.id) || []).forEach(r => seen.add(r.id)));
    return seen.size;
  };

  // Ce que les cartes / plats cochés couvrent déjà : alimente les badges « déjà inclus ».
  const couverture = React.useMemo(() => {
    const platIds = new Set();
    const recetteIds = new Set();
    (cartes || []).filter(c => selCartes.has(c.id)).forEach(c =>
      (platsDeCarte.get(c.id) || []).forEach(p => {
        platIds.add(p.id);
        (recettesDuPlat.get(p.id) || []).forEach(r => recetteIds.add(r.id));
      }));
    platsActifs.filter(p => selPlats.has(p.id)).forEach(p =>
      (recettesDuPlat.get(p.id) || []).forEach(r => recetteIds.add(r.id)));
    return { platIds, recetteIds };
  }, [cartes, platsActifs, selCartes, selPlats, platsDeCarte, recettesDuPlat]);

  const toggleSet = (setter, id) => setter(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── Sélection effective → liste ordonnée et dédupliquée des fiches à exporter ──
  const selectedCartesList = (cartes || []).filter(c => selCartes.has(c.id));
  const selectedPlatsList = platsActifs
    .filter(p => selPlats.has(p.id))
    .sort((a, b) => exportCatRank(a.categorie) - exportCatRank(b.categorie) || (a.ordre || 0) - (b.ordre || 0));
  const selectedRecettesList = (recettes || [])
    .filter(r => selRecettes.has(r.id))
    .sort((a, b) => exportCatRank(a.categorie) - exportCatRank(b.categorie) || (a.nom || '').localeCompare(b.nom || ''));

  const fichesFinales = (() => {
    const seen = new Set();
    const out = [];
    const push = (r) => { if (r && !seen.has(r.id)) { seen.add(r.id); out.push(r); } };
    selectedCartesList.forEach(c => (platsDeCarte.get(c.id) || []).forEach(p => (recettesDuPlat.get(p.id) || []).forEach(push)));
    selectedPlatsList.forEach(p => (recettesDuPlat.get(p.id) || []).forEach(push));
    selectedRecettesList.forEach(push);
    return out;
  })();
  const count = fichesFinales.length;
  const hasSelection = selectedCartesList.length + selectedPlatsList.length + selectedRecettesList.length > 0;

  // ── Listes affichées : filtrées par la recherche (sans accents), groupées par catégorie ──
  const groupByCat = (items) => {
    const m = new Map();
    items.forEach(it => {
      const cat = it.categorie || 'Autres';
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(it);
    });
    return [...m.entries()].sort((a, b) => exportCatRank(a[0]) - exportCatRank(b[0]) || a[0].localeCompare(b[0]));
  };

  const cartesVisibles = (cartes || []).filter(c => match(c.nom));
  const platGroups = groupByCat(platsActifs
    .filter(p => match(p.nom))
    .slice()
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || (a.nom || '').localeCompare(b.nom || '')));
  const recetteGroups = groupByCat((recettes || [])
    .filter(r => match(r.nom))
    .slice()
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '')));

  const toggleAllPlats = (items) => {
    const eligibles = items.filter(p => (recettesDuPlat.get(p.id) || []).length > 0);
    const allOn = eligibles.length > 0 && eligibles.every(p => selPlats.has(p.id));
    setSelPlats(prev => {
      const next = new Set(prev);
      eligibles.forEach(p => { if (allOn) next.delete(p.id); else next.add(p.id); });
      return next;
    });
  };
  const toggleAllRecettes = (items) => {
    const allOn = items.length > 0 && items.every(r => selRecettes.has(r.id));
    setSelRecettes(prev => {
      const next = new Set(prev);
      items.forEach(r => { if (allOn) next.delete(r.id); else next.add(r.id); });
      return next;
    });
  };

  const handleExport = async () => {
    if (!count || busy) return;
    if (!pdfUtils?.exportRecettesPdf) { notifyLegacy('Export PDF indisponible pour le moment.', 'error'); return; }
    // Fiches de production : jamais de food cost (cf. RecetteDetail).
    const data = fichesFinales.map(r => buildRecettePdfData(r));

    let filename = `Fiches_${count}_recettes.pdf`;
    if (selectedCartesList.length === 1 && !selectedPlatsList.length && !selectedRecettesList.length) {
      filename = `Carte_${slug(selectedCartesList[0].nom)}.pdf`;
    } else if (!selectedCartesList.length && selectedPlatsList.length === 1 && !selectedRecettesList.length) {
      filename = `Plat_${slug(selectedPlatsList[0].nom)}.pdf`;
    } else if (count === 1) {
      filename = `Fiche_${slug(fichesFinales[0].nom)}.pdf`;
    }

    setBusy(true);
    try {
      await pdfUtils.exportRecettesPdf(data, { etablissement, filename });
      notifyLegacy(`Export PDF généré (${count} fiche${count > 1 ? 's' : ''}).`, 'success');
      onClose();
    } catch (e) {
      /* notify déjà géré dans le service */
    } finally {
      setBusy(false);
    }
  };

  const recap = [
    selectedCartesList.length ? `${selectedCartesList.length} carte${selectedCartesList.length > 1 ? 's' : ''}` : null,
    selectedPlatsList.length ? `${selectedPlatsList.length} plat${selectedPlatsList.length > 1 ? 's' : ''}` : null,
    selectedRecettesList.length ? `${selectedRecettesList.length} recette${selectedRecettesList.length > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' + ');

  const hints = {
    cartes: 'Cochez une carte pour exporter toutes les fiches recette de ses plats, rangées par catégorie.',
    plats: 'Cochez des plats : toutes leurs recettes associées seront exportées.',
    recettes: 'Cochez des recettes individuelles. La sélection se cumule avec les onglets Cartes et Plats.',
  };

  // Fenetre (portail, rôle de dialogue, Échap, « × » nommé, geste retour). La
  // fenêtre défile en bloc ; onglets et recherche, puis le pied, restent
  // collés en haut et en bas pendant qu'on parcourt les listes.
  return (
    <Fenetre
      id="recettes-exporter"
      titre="Exporter des fiches"
      sousTitre="Une fiche par page A4, dans un seul PDF"
      onClose={onClose}
      largeur={720}
    >
          <div style={ms.controls}>
            <SegmentedTabs
              size="sm"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'cartes', label: `Cartes${selCartes.size ? ` (${selCartes.size})` : ''}` },
                { id: 'plats', label: `Plats${selPlats.size ? ` (${selPlats.size})` : ''}` },
                { id: 'recettes', label: `Recettes${selRecettes.size ? ` (${selRecettes.size})` : ''}` },
              ]}
            />
            <input
              type="text"
              style={ms.search}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={tab === 'cartes' ? 'Rechercher une carte…' : tab === 'plats' ? 'Rechercher un plat…' : 'Rechercher une recette…'}
            />
            <div style={ms.hint}>{hints[tab]}</div>
          </div>

        {/* ── Liste ── */}
        <div style={ms.list}>
          {tab === 'cartes' && (
            cartesVisibles.length === 0
              ? <div style={ms.empty}>{q ? `Aucune carte ne correspond à « ${query.trim()} ».` : 'Aucune carte pour cet établissement.'}</div>
              : cartesVisibles.map(c => {
                  const platsC = platsDeCarte.get(c.id) || [];
                  const nFiches = fichesDeCarte(c.id);
                  const checked = selCartes.has(c.id);
                  const disabled = nFiches === 0;
                  const expanded = expandedCartes.has(c.id);
                  return (
                    <div key={c.id}>
                      <div style={{ ...ms.row, ...(checked ? ms.rowChecked : {}) }}>
                        <label style={{ ...ms.rowMain, ...(disabled ? ms.rowDisabled : {}) }}>
                          <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleSet(setSelCartes, c.id)} />
                          <span style={ms.rowName}>{c.nom}</span>
                          <span style={ms.rowMeta}>
                            {platsC.length} plat{platsC.length > 1 ? 's' : ''}, {nFiches} fiche{nFiches > 1 ? 's' : ''}
                          </span>
                        </label>
                        {platsC.length > 0 && (
                          <button type="button" className="mini" style={ms.expandBtn}
                            title={expanded ? 'Masquer le contenu' : 'Voir le contenu'}
                            onClick={() => toggleSet(setExpandedCartes, c.id)}>
                            {expanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                          </button>
                        )}
                      </div>
                      {expanded && (
                        <div style={ms.cartePreview}>
                          {groupByCat(platsC).map(([cat, items]) => (
                            <div key={cat}>
                              <div style={ms.previewCat}>{cat}</div>
                              {items.map(p => {
                                const recs = recettesDuPlat.get(p.id) || [];
                                return (
                                  <div key={p.id} style={ms.previewLine}>
                                    <strong style={{ color: 'var(--text)' }}>{p.nom}</strong>
                                    {recs.length
                                      ? <> : {recs.map(r => r.nom).join(', ')}</>
                                      : <span style={{ fontStyle: 'italic' }}> : aucune fiche recette</span>}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
          )}

          {tab === 'plats' && (
            platGroups.length === 0
              ? <div style={ms.empty}>{q ? `Aucun plat ne correspond à « ${query.trim()} ».` : 'Aucun plat disponible.'}</div>
              : platGroups.map(([cat, items]) => {
                  const eligibles = items.filter(p => (recettesDuPlat.get(p.id) || []).length > 0);
                  const allOn = eligibles.length > 0 && eligibles.every(p => selPlats.has(p.id));
                  return (
                    <div key={cat}>
                      <div style={ms.groupHead}>
                        <span>{cat}</span>
                        <span style={ms.groupCount}>({items.length})</span>
                        {eligibles.length > 0 && (
                          <button type="button" className="mini" style={ms.groupAllBtn} onClick={() => toggleAllPlats(items)}>
                            {allOn ? 'Tout retirer' : 'Tout sélectionner'}
                          </button>
                        )}
                      </div>
                      {items.map(p => {
                        const n = (recettesDuPlat.get(p.id) || []).length;
                        const checked = selPlats.has(p.id);
                        return (
                          <label key={p.id} style={{ ...ms.row, ...(checked ? ms.rowChecked : {}), ...(n === 0 ? ms.rowDisabled : {}) }}>
                            <input type="checkbox" checked={checked} disabled={n === 0} onChange={() => toggleSet(setSelPlats, p.id)} />
                            <span style={ms.rowName}>{p.nom}</span>
                            {couverture.platIds.has(p.id) && <span style={ms.tagInclus}>déjà via carte</span>}
                            <span style={ms.rowMeta}>{n} fiche{n > 1 ? 's' : ''}</span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })
          )}

          {tab === 'recettes' && (
            recetteGroups.length === 0
              ? <div style={ms.empty}>{q ? `Aucune recette ne correspond à « ${query.trim()} ».` : 'Aucune recette disponible.'}</div>
              : recetteGroups.map(([cat, items]) => {
                  const allOn = items.length > 0 && items.every(r => selRecettes.has(r.id));
                  return (
                    <div key={cat}>
                      <div style={ms.groupHead}>
                        <span>{cat}</span>
                        <span style={ms.groupCount}>({items.length})</span>
                        <button type="button" className="mini" style={ms.groupAllBtn} onClick={() => toggleAllRecettes(items)}>
                          {allOn ? 'Tout retirer' : 'Tout sélectionner'}
                        </button>
                      </div>
                      {items.map(r => {
                        const checked = selRecettes.has(r.id);
                        return (
                          <label key={r.id} style={{ ...ms.row, ...(checked ? ms.rowChecked : {}) }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleSet(setSelRecettes, r.id)} />
                            <span style={ms.rowName}>{r.nom}</span>
                            {couverture.recetteIds.has(r.id) && <span style={ms.tagInclus}>déjà incluse</span>}
                            {r.portions ? <span style={ms.rowMeta}>{r.portions} port.</span> : null}
                          </label>
                        );
                      })}
                    </div>
                  );
                })
          )}
        </div>

        {/* ── Pied : récapitulatif + export ── */}
        <div style={ms.footer}>
          <div style={ms.footerInfo}>
            {hasSelection
              ? <>
                  {recap} : <strong style={{ color: 'var(--text)' }}>{count} fiche{count > 1 ? 's' : ''}</strong>
                  {' '}
                  <button type="button" className="mini" style={ms.clearBtn}
                    onClick={() => { setSelCartes(new Set()); setSelPlats(new Set()); setSelRecettes(new Set()); }}>
                    Tout effacer
                  </button>
                </>
              : 'Aucune sélection pour le moment.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button style={ms.btnGhost} onClick={() => !busy && onClose()} disabled={busy}>Annuler</button>
            <button style={{ ...ms.btnPrimary, ...((count === 0 || busy) ? ms.btnDisabled : {}) }} onClick={handleExport} disabled={count === 0 || busy}>
              {busy ? 'Génération…' : `Exporter le PDF${count ? ` (${count})` : ''}`}
            </button>
          </div>
        </div>
    </Fenetre>
  );
};

const ms = {
  // La fenêtre (Fenetre) défile en bloc (pas de double zone de défilement) :
  // les onglets avec la recherche, et le pied (récap + export), sont collants pour
  // rester visibles pendant qu'on parcourt les listes.
  controls: { position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)', padding: '4px 0 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 },
  search: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  hint: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  list: { padding: '6px 0 10px', display: 'flex', flexDirection: 'column', minHeight: 160 },
  groupHead: { display: 'flex', alignItems: 'center', gap: 6, padding: '14px 6px 6px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupCount: { fontWeight: 500, color: 'var(--text3)' },
  groupAllBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: '2px 4px', textTransform: 'none', letterSpacing: 0, flexShrink: 0 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', marginBottom: 6, flexShrink: 0 },
  // Shorthand `border` complet (pas `borderColor`) : ms.row pose déjà le
  // shorthand, mélanger les deux fait retirer borderColor au re-render (warning React).
  rowChecked: { border: '1px solid var(--accent)', background: 'var(--accent-light)' },
  rowDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' },
  rowName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)', overflowWrap: 'anywhere' },
  rowMeta: { fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', flexShrink: 0 },
  tagInclus: { fontSize: 11, fontWeight: 700, background: 'var(--success-bg)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', flexShrink: 0 },
  expandBtn: { background: 'none', border: 'none', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', padding: '4px 6px', fontFamily: 'var(--font)', flexShrink: 0 },
  cartePreview: { margin: '-2px 0 8px 14px', padding: '6px 12px 8px', borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 },
  previewCat: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  previewLine: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
  empty: { padding: '28px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' },
  footer: { position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 0 4px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  footerInfo: { flex: 1, minWidth: 160, fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  clearBtn: { background: 'none', border: 'none', color: 'var(--danger-strong)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 },
  btnGhost: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
};

// ─── IngredientSearchModal : « où se trouve cet ingrédient / allergène ? » ───
// Cherche un terme (ex. « poivre », « gluten ») dans TOUTES les recettes de
// l'établissement et liste précisément lesquelles le contiennent (ingrédient
// matché + allergènes déclarés + plat(s) de rattachement).
const QUICK_ALLERGENES = ['Gluten', 'Lactose', 'Œufs', 'Fruits à coque', 'Arachides', 'Soja', 'Sésame', 'Moutarde'];

const IngredientSearchModal = ({ recettes, recettesCachees = [], plats, onPick, onClose }) => {
  const [query, setQuery] = React.useState('');

  // plat(s) contenant chaque recette → contexte d'affichage
  const platsByRecette = React.useMemo(() => {
    const m = new Map();
    (plats || []).forEach(p => (p.recettes || []).forEach(pr => {
      if (!m.has(pr.recetteId)) m.set(pr.recetteId, []);
      m.get(pr.recetteId).push(p.nom);
    }));
    return m;
  }, [plats]);

  const q = normalizeSearch(query.trim());
  const results = React.useMemo(() => {
    if (q.length < 2) return [];
    // Par mots : « beurre doux » trouve « Doux beurre » et « Beurre demi-sel doux ».
    const match = makeSearchMatcher(q);
    const chercher = (r, cachee) => {
      const matchedIngs = (r.ingredients || []).filter(i => match(i.nom));
      const matchedAllerg = (r.allergenesIds || []).filter(a => match(ALLERGENES_MAP[a] || a));
      if (!matchedIngs.length && !matchedAllerg.length) return null;
      return { recette: r, matchedIngs, matchedAllerg, cachee };
    };
    // Une recette cachée n'est ni listée ni ouvrable, mais si elle entre dans
    // un plat, ce plat doit ressortir : c'est la question posée en salle
    // (« y a-t-il du gluten dans ce plat ? »).
    return [
      ...(recettes || []).map(r => chercher(r, false)),
      ...(recettesCachees || []).filter(r => platsByRecette.has(r.id)).map(r => chercher(r, true)),
    ].filter(Boolean);
  }, [q, recettes, recettesCachees, platsByRecette]);

  // Fenetre : portail, rôle de dialogue, Échap, « × » nommé, geste retour.
  return (
    <Fenetre
      id="recettes-recherche-allergene"
      titre="Recherche allergène / ingrédient"
      sousTitre="Trouvez dans quelles recettes un produit apparaît"
      onClose={onClose}
      largeur={620}
    >
        <div>
          <input
            autoFocus
            style={is.input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ex : poivre, gluten, noisette, crème…"
          />
          <div style={is.chips}>
            {QUICK_ALLERGENES.map(a => (
              <button key={a} style={is.chip} onClick={() => setQuery(a)}>{a}</button>
            ))}
          </div>
        </div>

        <div style={is.results}>
          {q.length < 2 ? (
            <div style={is.hint}>Tapez au moins 2 lettres. La recherche ignore les accents et la casse.</div>
          ) : results.length === 0 ? (
            <div style={is.hint}>Aucune recette ne contient « {query.trim()} ».</div>
          ) : (
            <>
              <div style={is.countLine}>
                {results.length} recette{results.length > 1 ? 's' : ''} contien{results.length > 1 ? 'nent' : 't'} « {query.trim()} »
              </div>
              {results.map(({ recette, matchedIngs, matchedAllerg, cachee }) => {
                const inPlats = platsByRecette.get(recette.id) || [];
                // Recette cachée : on nomme le plat, pas la préparation, et la
                // ligne n'ouvre rien (ni fiche, ni quantités).
                if (cachee) return (
                  <div key={recette.id} style={{ ...is.row, cursor: 'default' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={is.rowName}>{inPlats.join(', ')}</div>
                      <div style={is.rowMeta}>Préparation non affichée dans la bibliothèque</div>
                      <div style={is.matchRow}>
                        {matchedIngs.map(i => (
                          <span key={i.id} style={is.matchIng}>{i.nom}</span>
                        ))}
                        {matchedAllerg.map(a => (
                          <span key={a} style={is.matchAllerg}>{ALLERGENES_MAP[a] || a}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <button key={recette.id} style={is.row} onClick={() => { onPick(recette); onClose(); }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={is.rowName}>{recette.nom}</div>
                      <div style={is.rowMeta}>
                        {recette.categorie}
                        {inPlats.length > 0 && `, dans ${inPlats.join(', ')}`}
                      </div>
                      <div style={is.matchRow}>
                        {matchedIngs.map(i => (
                          <span key={i.id} style={is.matchIng}>{i.nom}{i.quantite ? ` (${i.quantite}${i.unite || ''})` : ''}</span>
                        ))}
                        {matchedAllerg.map(a => (
                          <span key={a} style={is.matchAllerg}>{ALLERGENES_MAP[a] || a}</span>
                        ))}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text2)', fontSize: 18, flexShrink: 0 }}>›</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
    </Fenetre>
  );
};

const is = {
  input: { width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 99, background: 'var(--surface)', color: 'var(--text2)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' },
  results: { display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 },
  hint: { padding: '24px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
  countLine: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 8px' },
  // flexShrink:0 IMPÉRATIF : la règle globale mobile « button:not(.mini){min-height:44px} »
  // écrase le min-height:auto des flex-items → sans ça, flexbox comprime chaque ligne
  // à 44px dans la liste à hauteur contrainte (clavier ouvert) et le contenu déborde
  // par-dessus les lignes voisines (résultats superposés, illisibles).
  row: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', flexShrink: 0, textAlign: 'left', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--font)' },
  rowName: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  rowMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  matchRow: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  matchIng: { fontSize: 11, fontWeight: 500, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-bd)', padding: '2px 7px', borderRadius: 99 },
  matchAllerg: { fontSize: 11, fontWeight: 500, background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)', padding: '2px 7px', borderRadius: 99 },
};

const Recettes = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const isMobile = useIsMobile();
  const online = useOnlineStatus();
  // Onglet actif : id d'une carte, ou 'recettes' (bibliothèque).
  // Démarre vide → l'effet ci-dessous bascule sur la 1re carte une fois chargée
  // (comportement historique : on atterrit sur la carte, pas la bibliothèque).
  const LIBRARY_TAB = 'recettes';
  const [activeTab, setActiveTab] = React.useState('');
  const [selectedRecette, setSelectedRecette] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('Tous');
  const perms = getPermissionsForRole(user.role);
  const canManageCartes = canManageModule(user.role, 'recettes');
  // Créer, modifier, dupliquer les fiches et les plats (éditeur venu des Outils
  // consultant le 27.10.2026) : droit d'action « fiches » ET « Modifier » du
  // module. Garde de présentation : la base n'en vérifie pas d'autre que
  // l'établissement.
  const canFiches = canManageCartes && canManageModule(user.role, 'fiches');
  // Cacher une carte est réservé au consultant : lui seul continue de la voir.
  const isConsultant = user.role === 'consultant';
  // Le raccourci suit aussi l'accès au module HACCP : un rôle à qui on a retiré
  // HACCP n'imprime pas d'étiquettes d'autocontrôle depuis les recettes.
  const canEtiqueter = ROLES_ETIQUETTE.includes(user.role) && perms.haccp !== false;
  // Recette dont la fenêtre d'étiquette est ouverte depuis la liste.
  const [etiquetteRecette, setEtiquetteRecette] = React.useState(null);
  // Éditeur ouvert : { id, nomEnMain } (nom sélectionné pour une fiche neuve
  // ou une copie). Il se pose au-dessus de l'écran ou de la fiche ouverte, avec
  // sa propre entrée d'historique : un retour le referme, un second referme la
  // fiche.
  const [edition, setEdition] = React.useState(null);
  // Fenêtre du plat : { plat } pour modifier, { carteId } pour un plat neuf.
  const [platEdite, setPlatEdite] = React.useState(null);
  // Bibliothèque de Gérer : sélection de fiches (rattacher, archiver, supprimer).
  const selection = useSelection();
  const [selectionOccupee, setSelectionOccupee] = React.useState(false);
  const [rattacherSelection, setRattacherSelection] = React.useState(false);
  const [voirArchivees, setVoirArchivees] = React.useState(false);

  // Cartes (menus) de l'établissement - source unique partagée + realtime.
  // `cartesStatus` distingue « pas encore chargé / lecture en échec » de
  // « réellement aucune carte » : au réveil d'une tablette la lecture peut
  // repartir en 401 et il ne faut surtout pas annoncer un établissement vide.
  // Le rôle est passé au hook : les cartes cachées ne sont servies qu'au consultant.
  const { cartes, archivedCartes, status: cartesStatus, reload: reloadCartes,
          addCarte, renameCarte, archiveCarte, masquerCarte, deleteCarte,
          reorderCartes } = useCartes(etabId, { role: user.role });

  // Chargement Supabase + Realtime (fallback localStorage si pas configuré)
  const [recettes, setRecettes] = React.useState([]);
  const [plats, setPlats] = React.useState([]);
  // Même contrat que cartesStatus, pour les recettes et les plats.
  const [dataStatus, setDataStatus] = React.useState(() => (legacySB ? 'loading' : 'ready'));
  const reloadDataRef = React.useRef(null);
  const [expandedPlats, setExpandedPlats] = React.useState(new Set());
  const [showExportModal, setShowExportModal] = React.useState(false);
  const [showIngredientSearch, setShowIngredientSearch] = React.useState(false);
  // Carte d'accueil = préférence utilisateur par établissement (user_settings,
  // synchro multi-device, cache hydraté au login → lecture instantanée).
  const [defaultCarteId, setDefaultCarteId] = React.useState(null);

  React.useEffect(() => {
    setDefaultCarteId(legacySB?.db?.getUserSettingSync?.('cartes_default:' + etabId, null) || null);
  }, [etabId]);

  // Écran du parcours : l'accueil (une tuile par tâche), puis un écran par
  // tâche. La carte du moment et la recherche se rouvrent à la visite suivante
  // (lecture en service) ; Une étiquette et Gérer repartent de l'accueil.
  // Revenir à l'accueil vide la frappe, referme l'étiquette et quitte
  // l'onglet Bibliothèque de Gérer (la carte du moment rouvre une carte).
  const { ecran, setEcran, retourAccueil } = useEcranModule('recettes', {
    repris: ['carte', 'chercher'],
    surRetour: () => {
      setSearch('');
      setEtiquetteRecette(null);
      selection.exit();
      setActiveTab(t => (t === LIBRARY_TAB ? '' : t));
    },
  });
  // Le champ de « Je cherche une fiche » prend la main quand on vient de toucher
  // sa tuile, pas quand l'écran se rouvre seul à l'arrivée sur le module : Échap
  // y resterait sans effet tant que le champ a la main.
  const [champAuToucher, setChampAuToucher] = React.useState(false);

  // Fiche ouverte : le geste retour et Échap la referment vers l'écran d'où
  // elle a été ouverte, comme son bouton « Retour ». Échap ne fait rien dans
  // un champ ni sous une fenêtre : une Fenetre se ferme seule, la fenêtre
  // d'étiquette (qui n'en est pas une) reste ouverte comme aujourd'hui, au lieu
  // que l'écran parte sous elle. Elle se reconnaît à ce qu'elle est rendue dans
  // le module (<main>), là où une Fenetre passe en portail sous <body>.
  const fermerFiche = React.useCallback(() => setSelectedRecette(null), []);
  useBackLayer(Boolean(selectedRecette), fermerFiche, 'recettes-fiche');

  // Au retour d'une fiche, la vitrine revient sur la vignette quittée plutôt
  // qu'en haut de la liste (la fiche s'ouvre en haut de page). La clé dit
  // laquelle : « plat:<id> » sur la carte du moment, « fiche:<id> » dans Je
  // cherche une fiche ; sans clé (recherche allergène, bibliothèque de Gérer),
  // rien n'est ramené. Même motif que les Fiches salle.
  const ficheQuitteeRef = React.useRef(null);
  const vignetteQuitteeRef = React.useRef(null);
  const ouvrirFiche = React.useCallback((r, cle = null) => {
    ficheQuitteeRef.current = cle;
    setSelectedRecette(r);
  }, []);
  React.useLayoutEffect(() => {
    if (selectedRecette || edition || !ficheQuitteeRef.current) return;
    const el = vignetteQuitteeRef.current;
    const r = el?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: 'center' });
    ficheQuitteeRef.current = null;
  }, [selectedRecette, edition]);
  const fermerEditeur = React.useCallback(() => setEdition(null), []);
  useBackLayer(Boolean(edition), fermerEditeur, 'recettes-editeur');
  React.useEffect(() => {
    if (!selectedRecette && !etiquetteRecette && !edition) return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[data-fenetre]')) return;
      if (document.querySelector('main .modal-sheet-overlay, main .modal-full-overlay')) { e.preventDefault(); return; }
      if ((!selectedRecette && !edition) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      e.preventDefault();
      // L'éditeur d'abord : Échap revient à la fiche, un second Échap la referme.
      if (edition) fermerEditeur(); else fermerFiche();
    };
    // Phase de capture : passe avant le retour à l'accueil du module
    // (useEcranModule), qui laisse la main à un Échap déjà traité.
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [selectedRecette, etiquetteRecette, edition, fermerFiche, fermerEditeur]);

  // Fiche supprimée depuis l'éditeur : l'éditeur se referme d'abord, la fiche
  // ensuite, une fois le retour de l'éditeur arrivé. Deux calques refermés dans
  // le même geste laisseraient une entrée d'historique orpheline.
  const fermerFicheApresEditeur = React.useCallback(() => {
    setTimeout(() => quandRetoursArrives(() => setSelectedRecette(null)), 0);
  }, []);

  const toggleDefaultCarte = async (carteId) => {
    const next = defaultCarteId === carteId ? null : carteId;
    setDefaultCarteId(next);
    try {
      await legacySB?.db?.setUserSetting?.('cartes_default:' + etabId, next);
      notifyLegacy(next ? 'Carte d\'accueil enregistrée' : 'Carte d\'accueil retirée', 'success');
    } catch (e) { notifyLegacy('Enregistrement impossible. ' + messageErreur(e, 'recettes'), 'error'); }
  };

  React.useEffect(() => {
    if (!legacySB) {
      setRecettes(readLegacyStorage('sc_recettes', demoData.recettes));
      setDataStatus('ready');
      return;
    }
    let unsubRec = null, unsubPlats = null, unsubPR = null, unsubCP = null, mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    // Lectures en mode strict : une erreur remonte au lieu de renvoyer []. Les
    // listes déjà à l'écran ne sont donc jamais écrasées par un échec réseau
    // (réveil de tablette, JWT expiré) et un essai est reprogrammé.
    const runLoad = async (loader) => {
      try {
        await loader();
        if (!mounted) return;
        loadedOnce = true;
        retryDelay = RETRY_MIN_MS;
        setDataStatus('ready');
      } catch (err) {
        if (!mounted) return;
        console.error('[Recettes load]', err);
        if (!loadedOnce) setDataStatus('error');
        // Réessai programmé même onglet caché : cf. useCartes.
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(reloadAll, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
      }
    };

    const fetchRecettes = async () => {
      const r = await legacySB.db.listRecettes(etabId, { strict: true });
      if (mounted) setRecettes(r);
    };
    const fetchPlats = async () => {
      const p = await legacySB.db.listPlats(etabId, { strict: true });
      if (mounted) setPlats(p || []);
    };

    function reloadAll() {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      return runLoad(() => Promise.all([fetchRecettes(), fetchPlats()]));
    }
    const refreshRec = () => runLoad(fetchRecettes);
    const refreshPlats = () => runLoad(fetchPlats);

    reloadDataRef.current = reloadAll;
    setDataStatus('loading');
    reloadAll();

    unsubRec = legacySB.realtime.subscribeReload('recettes', refreshRec);
    unsubPlats = legacySB.realtime.subscribeReload('plats', refreshPlats);
    unsubPR = legacySB.realtime.subscribeReload('plat_recettes', refreshPlats);
    unsubCP = legacySB.realtime.subscribeReload('carte_plats', refreshPlats);

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (reloadDataRef.current === reloadAll) reloadDataRef.current = null;
      unsubRec && unsubRec();
      unsubPlats && unsubPlats();
      unsubPR && unsubPR();
      unsubCP && unsubCP();
    };
  }, [etabId]);

  const reloadData = React.useCallback(() => { reloadDataRef.current && reloadDataRef.current(); }, []);
  // Réveil de la tablette / retour d'onglet / retour du réseau : le canal
  // realtime est mort pendant la veille, on refait une lecture.
  useResumeRefresh(reloadData);

  // Rechargement manuel (bouton « Réessayer ») : cartes + recettes + plats.
  const retryAll = React.useCallback(() => { reloadCartes(); reloadData(); }, [reloadCartes, reloadData]);

  // Filtrer par établissement courant (déjà filtré par Supabase mais on garde le
  // filtre côté client pour le fallback). Les recettes archivées (statut géré
  // dans Outils consultant) sortent de la bibliothèque, des plats, des exports
  // et de la recherche allergènes.
  const recettesActives = recettes.filter(r =>
    (r.etablissementId || 'etab-1') === etabId && r.statut !== 'archivée'
  );
  // Recettes cachées (colonne `masquee`, bascule dans Outils consultant) : elles
  // ne s'affichent nulle part ici, pour aucun rôle. Elles comptent pourtant
  // toujours dans les allergènes et le temps des plats qui les contiennent :
  // cacher une préparation ne doit jamais retirer un allergène d'un plat servi.
  const recettesEtab = recettesActives.filter(r => r.masquee !== true);
  const recettesCachees = recettesActives.filter(r => r.masquee === true);
  // Archivées : pour qui a le droit « fiches », une section repliée de la
  // bibliothèque, d'où on les rouvre et les désarchive. Les cachées n'y
  // figurent pas plus qu'ailleurs.
  const recettesArchivees = canFiches
    ? recettes.filter(r => (r.etablissementId || 'etab-1') === etabId && r.statut === 'archivée' && r.masquee !== true)
    : [];

  // ─── Éditeur de fiches (droit « fiches ») ────────────────────────────────
  // Mise à jour immédiate de la liste du module : la fiche rouverte après
  // l'éditeur montre la saisie sans attendre la relecture realtime.
  const majRecetteLocale = React.useCallback((r) => {
    setRecettes(prev => (prev.some(x => x.id === r.id) ? prev.map(x => (x.id === r.id ? r : x)) : [r, ...prev]));
  }, []);

  const enregistrerNouvelle = async (r, messageEchec) => {
    majRecetteLocale(r);
    if (!legacySB) return true;
    try { await legacySB.db.upsertRecette(r); return true; }
    catch (err) {
      setRecettes(prev => prev.filter(x => x.id !== r.id));
      notifyLegacy(messageEchec + ' ' + messageErreur(err, 'recettes'), 'error');
      return false;
    }
  };

  // Nouvelle fiche : créée tout de suite (brouillon), ouverte nom en main.
  const creerFiche = async () => {
    const r = {
      id: 'rec-' + Date.now(),
      etablissementId: etabId,
      nom: 'Nouvelle recette',
      portions: 4,
      categorie: 'Plats',
      statut: 'brouillon',
      version: 1,
      tempsPreparation: 0,
      tempsCuisson: 0,
      tempsTotal: 0,
      allergenesIds: [],
      notesConsultant: '',
      modifie: new Date().toISOString().slice(0, 10),
      modifiePar: user.id,
      ingredients: [],
      etapes: [],
      dressage: '',
      conservation: '',
    };
    setEdition({ id: r.id, nomEnMain: true });
    if (!(await enregistrerNouvelle(r, 'Création impossible.'))) setEdition(null);
  };

  // Dupliquer : la copie (prix compris) s'ouvre dans l'éditeur, nom en main ;
  // l'originale ne change pas. L'abandonner, c'est la supprimer.
  const dupliquerFiche = async (r) => {
    const copie = copieRecette(r, user.id);
    setEdition({ id: copie.id, nomEnMain: true });
    if (await enregistrerNouvelle(copie, 'Duplication impossible.')) {
      notifyLegacy(`Copie de « ${r.nom} » créée.`, 'success');
    } else {
      setEdition(null);
    }
  };

  const desarchiverFiche = async (r) => {
    const next = { ...r, statut: 'brouillon', modifiePar: user.id };
    try {
      if (legacySB) await legacySB.db.upsertRecette(next);
      majRecetteLocale(next);
      notifyLegacy(`« ${r.nom} » restaurée en brouillon.`, 'success');
    } catch (err) {
      notifyLegacy('Restauration impossible. ' + messageErreur(err, 'recettes'), 'error');
    }
  };

  const surSuppression = (id) => {
    setRecettes(prev => prev.filter(r => r.id !== id));
    setEdition(null);
    if (selectedRecette?.id === id) fermerFicheApresEditeur();
    reloadDataRef.current && reloadDataRef.current();
  };

  // « Modifier la fiche » du Chiffrage (Outils consultant) : clé ponctuelle
  // lue à l'arrivée, ou événement quand le module est déjà monté.
  React.useEffect(() => {
    if (!canFiches) return undefined;
    const ouvrir = (id) => { if (id) setEdition({ id, nomEnMain: false }); };
    const cle = readText(UI_STORAGE_KEYS.recettesEditer, '');
    if (cle) { removeStorageKeys([UI_STORAGE_KEYS.recettesEditer]); ouvrir(cle); }
    const w = getBrowserWindow();
    if (!w) return undefined;
    const surEvenement = (e) => { removeStorageKeys([UI_STORAGE_KEYS.recettesEditer]); ouvrir(e?.detail?.id); };
    w.addEventListener('sc:recettes-editer', surEvenement);
    return () => w.removeEventListener('sc:recettes-editer', surEvenement);
  }, [canFiches]);

  // Sélection de la bibliothèque : archiver, supprimer, rattacher à des plats.
  const archiverSelection = async () => {
    if (!selection.count) return;
    if (!confirmLegacy(`Archiver ${selection.count} fiche(s) ?\n\nElles sortent de la bibliothèque et des plats, sans être supprimées. Restaurables depuis la section Archivées.`)) return;
    setSelectionOccupee(true);
    let ok = 0;
    for (const id of selection.ids) {
      const r = recettes.find(x => x.id === id);
      if (!r || r.statut === 'archivée') continue;
      try { if (legacySB) await legacySB.db.upsertRecette({ ...r, statut: 'archivée', modifiePar: user.id }); ok += 1; }
      catch (err) { console.error('[archiverSelection]', err); }
    }
    setRecettes(prev => prev.map(r => (selection.ids.has(r.id) ? { ...r, statut: 'archivée' } : r)));
    setSelectionOccupee(false);
    selection.exit();
    notifyLegacy(`${ok} fiche(s) archivée(s).`, 'success');
  };

  const supprimerSelection = async () => {
    if (!selection.count) return;
    if (!confirmLegacy(`Supprimer ${selection.count} fiche(s) ? La suppression est définitive.`)) return;
    setSelectionOccupee(true);
    let ok = 0;
    for (const id of selection.ids) {
      try { if (legacySB) await legacySB.db.deleteRecette(id); effacerBrouillon(id); ok += 1; }
      catch (err) { console.error('[supprimerSelection]', err); }
    }
    setRecettes(prev => prev.filter(r => !selection.ids.has(r.id)));
    setSelectionOccupee(false);
    selection.exit();
    reloadDataRef.current && reloadDataRef.current();
    notifyLegacy(`${ok} fiche(s) supprimée(s).`, 'success');
  };

  const rattacherSelectionAuxPlats = async (platsCibles) => {
    if (!legacySB || !platsCibles.length) return;
    setSelectionOccupee(true);
    let total = 0, deja = 0, ko = 0;
    for (const plat of platsCibles) {
      const dejaLiees = new Set((plat.recettes || []).map(pr => pr.recetteId));
      for (const rid of selection.ids) {
        if (dejaLiees.has(rid)) { deja += 1; continue; }
        try { await legacySB.db.linkRecetteToPlat(plat.id, rid, 'composant', 0); total += 1; }
        catch (err) { console.error('[linkRecetteToPlat]', err); ko += 1; }
      }
    }
    setSelectionOccupee(false);
    setRattacherSelection(false);
    selection.exit();
    reloadDataRef.current && reloadDataRef.current();
    const parts = [];
    if (total) parts.push(`${total} rattachement${total > 1 ? 's' : ''}`);
    if (deja) parts.push(`${deja} déjà lié${deja > 1 ? 's' : ''}`);
    if (ko) parts.push(`${ko} en erreur`);
    notifyLegacy(parts.join(', ') || 'Aucune fiche à rattacher.', ko ? 'warning' : 'success');
  };

  // Onglet carte actif (ou bibliothèque). On garde toujours un onglet valide.
  const isLibrary = activeTab === LIBRARY_TAB;
  const activeCarte = cartes.find(c => c.id === activeTab) || null;
  // Atterrissage : à l'ouverture (activeTab vide) ou si la carte courante a
  // disparu, on bascule sur la carte d'accueil définie par l'utilisateur, sinon
  // la 1re carte. Un choix explicite déjà valide (carte ou bibliothèque) est respecté.
  // activeTab compte aussi : le retour à l'accueil depuis la bibliothèque de
  // Gérer le vide, pour que la carte du moment rouvre une carte.
  React.useEffect(() => {
    if (!cartes.length) return;
    if (activeTab === LIBRARY_TAB || cartes.some(c => c.id === activeTab)) return;
    const saved = legacySB?.db?.getUserSettingSync?.('cartes_default:' + etabId, null);
    setActiveTab(saved && cartes.some(c => c.id === saved) ? saved : cartes[0].id);
  }, [cartes, etabId, activeTab]);

  // Plats de la carte active (M2M via carteIds). Les plats sans recette
  // rattachée s'affichent quand même sur la carte.
  const platsCarte = activeCarte
    ? (plats || []).filter(p => (p.carteIds || []).includes(activeCarte.id))
    : [];
  // Onglets de catégories : déduits des plats réellement présents sur la carte,
  // dans l'ordre de service du référentiel partagé. Une liste figée laissait
  // les plats Boissons, Poissons, Viandes, Pâtes & Risottos et Menus enregistrés
  // en base mais absents de la carte, sans onglet pour les atteindre.
  const catsCarte = categoriesPresentes(platsCarte.filter(p => p.actif !== false));
  const cats = ['Tous', ...catsCarte];
  // Le filtre survit au changement d'onglet de carte : s'il pointe une catégorie
  // absente de la nouvelle carte, on retombe sur « Tous » plutôt que d'afficher
  // une carte vide sans onglet actif.
  const catFilterEff = cats.includes(catFilter) ? catFilter : 'Tous';
  // Recherche par mots, dans n'importe quel ordre, sans accents ni petits mots
  // (« confit de sanglier » trouve « Sanglier confit »). Sur une carte, elle
  // porte sur le nom du plat ET sur les recettes qui le composent : avant,
  // seul le nom du plat comptait, une recette cherchée par son nom ne sortait
  // jamais. Pendant une recherche, l'onglet de catégorie est ignoré (sinon un
  // plat rangé dans un autre onglet semblait introuvable).
  const match = makeSearchMatcher(search);
  const q = match.active;
  const recetteNomById = React.useMemo(() => {
    const m = new Map();
    recettesEtab.forEach(r => m.set(r.id, r.nom));
    return m;
  }, [recettesEtab]);
  const platMatches = (p) => match(p.nom, (p.recettes || []).map(pr => recetteNomById.get(pr.recetteId)));
  const filteredPlats = platsCarte.filter(p =>
    p.actif !== false &&
    (q || catFilterEff === 'Tous' || categorieDuPlat(p) === catFilterEff) &&
    platMatches(p)
  );
  // Résultats hors de la carte affichée (autres cartes, bibliothèque) : on les
  // compte pour proposer d'y aller, plutôt que de laisser un écran vide.
  // Une recette déjà comptée via son plat n'est pas recomptée : le nombre
  // annoncé correspond aux blocs que l'on verra dans la bibliothèque.
  const ailleursCount = (() => {
    if (!q || isLibrary) return 0;
    const platsAilleurs = (plats || []).filter(p => p.actif !== false && !(p.carteIds || []).includes(activeCarte?.id) && platMatches(p));
    const dejaVues = new Set([...platsCarte, ...platsAilleurs].flatMap(p => (p.recettes || []).map(pr => pr.recetteId)));
    return platsAilleurs.length + recettesEtab.filter(r => match(r.nom) && !dejaVues.has(r.id)).length;
  })();
  const voirDansBibliotheque = ailleursCount > 0 ? (
    <button type="button" style={rs.searchElsewhereBtn} onClick={() => (ecran === 'carte' ? setEcran('chercher') : setActiveTab(LIBRARY_TAB))}>
      {ailleursCount} autre{ailleursCount > 1 ? 's' : ''} résultat{ailleursCount > 1 ? 's' : ''} hors de cette carte : voir dans la bibliothèque ›
    </button>
  ) : null;

  // Éditeur : au-dessus de tout le reste. Il n'est monté qu'une fois la fiche
  // dans la liste (arrivée depuis le Chiffrage avant la fin de la lecture).
  if (edition) {
    const ficheEditee = recettes.find(r => r.id === edition.id);
    if (!ficheEditee && dataStatus !== 'ready') {
      return (
        <div style={rs.root}>
          <EcranTache titre="Fiche" etat={lectureEnCours(dataStatus)} onRetour={fermerEditeur} />
        </div>
      );
    }
    return (
      <div style={rs.root}>
        {ficheEditee ? (
          <FicheEditeur
            key={edition.id}
            recette={ficheEditee}
            user={user}
            etablissement={etablissement}
            plats={plats}
            cartes={cartes}
            reloadCartes={reloadCartes}
            nomEnMain={edition.nomEnMain}
            onChange={majRecetteLocale}
            onFermer={fermerEditeur}
            onSupprimee={surSuppression}
            onRecharger={() => reloadDataRef.current && reloadDataRef.current()}
          />
        ) : (
          <EcranTache titre="Fiche introuvable" etat={<>supprimée ou déplacée</>} onRetour={fermerEditeur} />
        )}
      </div>
    );
  }

  if (selectedRecette) {
    // Relue dans la liste : après l'éditeur, la fiche montre la saisie.
    const ouverte = recettes.find(r => r.id === selectedRecette.id) || selectedRecette;
    return (
      <RecetteDetail
        recette={ouverte}
        photo={photoDeRecette(ouverte, plats, recettesEtab)}
        user={user}
        etablissement={etablissement}
        canEtiqueter={canEtiqueter}
        canFiches={canFiches}
        onModifier={() => setEdition({ id: ouverte.id, nomEnMain: false })}
        onDupliquer={() => dupliquerFiche(ouverte)}
        onDesarchiver={() => desarchiverFiche(ouverte)}
        onBack={() => setSelectedRecette(null)}
      />
    );
  }

  // Fenêtres du module (étiquette, export, recherche allergène) : les mêmes sur
  // chaque écran, posées avant son contenu.
  const fenetres = (
    <>
      {etiquetteRecette && (
        <EtiquetteRapideModal
          recette={etiquetteRecette}
          etabId={etabId}
          user={user}
          onClose={() => setEtiquetteRecette(null)}
        />
      )}
      {showExportModal && (
        <ExportMultipleModal
          cartes={cartes}
          plats={plats}
          recettes={recettesEtab}
          etablissement={etablissement}
          onClose={() => setShowExportModal(false)}
        />
      )}
      {showIngredientSearch && (
        <IngredientSearchModal
          recettes={recettesEtab}
          recettesCachees={recettesCachees}
          plats={plats}
          onPick={(r) => ouvrirFiche(r)}
          onClose={() => setShowIngredientSearch(false)}
        />
      )}
      {platEdite && (
        <PlatFenetre
          key={platEdite.plat?.id || 'nouveau'}
          plat={platEdite.plat || null}
          carteIdDefaut={platEdite.carteId || null}
          etabId={etabId}
          cartes={cartes}
          recettes={recettesEtab}
          onClose={() => setPlatEdite(null)}
          onEnregistre={() => reloadDataRef.current && reloadDataRef.current()}
        />
      )}
      {rattacherSelection && (
        <PlatPicker
          title="Rattacher la sélection à des plats"
          subtitle={`${selection.count} fiche${selection.count > 1 ? 's' : ''} sélectionnée${selection.count > 1 ? 's' : ''} : cochez les plats qui les recevront comme composants.`}
          plats={plats}
          cartes={cartes}
          confirmLabel={(n) => `Rattacher à ${n} plat${n > 1 ? 's' : ''}`}
          emptyHint="Aucun plat. « Ajouter un plat » sur une carte en crée un."
          busy={selectionOccupee}
          onConfirm={(ids) => rattacherSelectionAuxPlats(plats.filter(p => ids.includes(p.id)))}
          onClose={() => setRattacherSelection(false)}
        />
      )}
    </>
  );

  if (ecran === ECRAN_ACCUEIL) return (
    <div style={rs.root}>
      {fenetres}
      <AccueilRecettes
        fiches={dataStatus === 'ready' ? recettesEtab.length : null}
        lectureFiches={lectureEnCours(dataStatus)}
        carte={activeCarte}
        lectureCartes={lectureEnCours(cartesStatus)}
        canEtiqueter={canEtiqueter}
        canGerer={canManageCartes}
        canFiches={canFiches}
        consultant={isConsultant}
        onNouvelle={creerFiche}
        onChercher={() => { setChampAuToucher(true); setEcran('chercher'); }}
        onCarte={() => setEcran('carte')}
        onAllergenes={() => setShowIngredientSearch(true)}
        onEtiquette={() => setEcran('etiquette')}
        onExporter={() => setShowExportModal(true)}
        onGerer={() => setEcran('gerer')}
      />
    </div>
  );

  if (ecran === 'etiquette') return (
    <div style={rs.root}>
      {fenetres}
      <EcranTache titre="Une étiquette" etat={<>Choisissez la préparation</>} onRetour={retourAccueil} />
      <ChoixEtiquette recettes={recettesEtab} chargement={lectureEnCours(dataStatus)} onChoisir={setEtiquetteRecette} />
    </div>
  );

  // La carte du moment, Je cherche une fiche, Gérer les cartes : la barre et
  // les vues d'aujourd'hui sous l'en-tête de l'écran. La carte du moment garde
  // les onglets de cartes sans les outils de gestion, la loupe passe dans
  // l'en-tête ; Gérer garde la barre entière, onglet Bibliothèque compris ;
  // Je cherche une fiche ouvre la bibliothèque sous un champ toujours ouvert.
  const gerer = ecran === 'gerer';
  const vueBiblio = ecran === 'chercher' || (gerer && isLibrary);
  // La loupe : dans l'en-tête de la carte du moment, dans la barre de Gérer.
  const loupe = <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher un plat, une recette…" />;
  return (
    <div style={rs.root}>
      {fenetres}
      <EcranTache
        titre={TITRES_ECRAN[ecran]}
        etat={ecran === 'chercher' ? <>par nom de plat ou de recette</> : null}
        onRetour={retourAccueil}
        actions={ecran === 'carte' ? loupe : null}
      />
      {ecran === 'chercher' && (
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoFocus={champAuToucher}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Nom d'un plat ou d'une recette"
          aria-label="Nom d'un plat ou d'une recette"
          style={champRecherche}
        />
      )}
      {/* Barre d'outils. Mobile : onglets en bande scrollable (1 ligne) + actions
          compactes (icônes) sur une 2e ligne → pas de pavé qui mange l'écran.
          Desktop : onglets + actions groupées à droite. */}
      {ecran !== 'chercher' && (
        <div style={rs.toolbar}>
          <div style={isMobile ? rs.tabsWrapMobile : rs.tabsWrap}>
            <CarteTabBar
              cartes={cartes}
              activeId={activeTab}
              onSelect={setActiveTab}
              extraTabs={gerer ? [{ id: LIBRARY_TAB, label: 'Bibliothèque recettes' }] : []}
              canManage={gerer && canManageCartes}
              onAddCarte={addCarte}
              onRenameCarte={renameCarte}
              onDeleteCarte={deleteCarte}
              archivedCartes={archivedCartes}
              onArchiveCarte={archiveCarte}
              canHide={gerer && isConsultant}
              onHideCarte={masquerCarte}
              homeId={defaultCarteId}
              onReorderCartes={reorderCartes}
            />
          </div>
          {gerer && (
            <div style={{ ...rs.toolbarActions, ...(isMobile ? rs.toolbarActionsMobile : {}) }} className="no-print">
              {loupe}
              {/* Toujours libellé + teinte "warning" (langage visuel allergènes de l'app) :
                  en icône seule (une loupe), il se confondait avec la loupe de recherche. */}
              <button style={rs.printBtn} onClick={() => setShowIngredientSearch(true)} title="Trouver dans quelles recettes un ingrédient ou allergène apparaît">Allergènes</button>
              <button style={rs.printBtn} onClick={() => setShowExportModal(true)} title="Exporter une carte entière, des plats ou des recettes dans un seul PDF">Exporter</button>
              {/* Bibliothèque, droit « fiches » : un plat sans carte, la
                  sélection de fiches ; IA en lot pour le consultant. */}
              {isLibrary && canFiches && (
                <>
                  <button style={rs.printBtn} onClick={() => setPlatEdite({ carteId: null })}>Ajouter un plat</button>
                  {!selection.active && <button style={rs.printBtn} onClick={selection.enter}>Sélectionner</button>}
                </>
              )}
              {isLibrary && isConsultant && (
                <DetectionAllergenes recettes={recettesActives} style={rs.printBtn} onFini={() => reloadDataRef.current && reloadDataRef.current()} />
              )}
            </div>
          )}
        </div>
      )}

      {!vueBiblio ? (
        !activeCarte ? (
          // « Aucune carte » ne s'affiche que si la lecture a VRAIMENT abouti sur
          // zéro carte. Tant qu'elle est en cours ou en échec (tablette qui sort
          // de veille, JWT expiré, réseau coupé), on le dit et on propose un
          // nouvel essai - un rechargement automatique est déjà programmé.
          cartesStatus !== 'ready' ? (
            <PanneauEtat
              titre={cartesStatus === 'loading' ? 'Chargement des cartes…' : 'Cartes indisponibles'}
              texte={cartesStatus === 'loading'
                ? 'Les cartes de cet établissement arrivent.'
                : (online
                  ? 'La connexion a été interrompue (mise en veille de l’appareil, réseau instable). Les cartes ne sont pas perdues : nouvel essai automatique en cours.'
                  : 'Hors ligne : les cartes s’afficheront au retour du réseau.')}
              onRetry={cartesStatus === 'error' ? retryAll : null}
            />
          ) : (
            <PanneauEtat
              titre="Aucune carte"
              texte={canManageCartes ? 'Créez une carte avec le bouton « Ajouter une carte ».' : 'Aucune carte définie pour cet établissement.'}
            />
          )
        ) : platsCarte.length === 0 ? (
          // Même règle pour les plats : un échec de lecture ne doit pas passer
          // pour une carte vide.
          dataStatus !== 'ready' ? (
            <PanneauEtat
              titre={dataStatus === 'loading' ? 'Chargement des plats…' : 'Plats indisponibles'}
              texte={dataStatus === 'loading'
                ? `Les plats de « ${activeCarte.nom} » arrivent.`
                : (online
                  ? 'La connexion a été interrompue. Nouvel essai automatique en cours.'
                  : 'Hors ligne : les plats s’afficheront au retour du réseau.')}
              onRetry={dataStatus === 'error' ? retryAll : null}
            />
          ) : (
            <>
              <PanneauEtat
                titre={`Aucun plat sur « ${activeCarte.nom} »`}
                texte={canFiches ? 'Ajoutez le premier plat de cette carte.' : 'Aucun plat sur cette carte pour le moment.'}
              />
              {canFiches && (
                <button style={{ ...rs.etiquetteBtn, alignSelf: 'center' }} onClick={() => setPlatEdite({ carteId: activeCarte.id })}>Ajouter un plat</button>
              )}
            </>
          )
        ) : (
        <div style={rs.carteWrap}>
          {/* Carte header */}
          <div style={rs.carteHeader}>
            <div>
              <div style={rs.carteName}>{activeCarte.nom}</div>
              <div style={{fontSize:13, color:'var(--text2)'}}>
                {platsCarte.length} plat{platsCarte.length > 1 ? 's' : ''}
                {activeCarte.dateDebut && <>, du {dateSuisse(activeCarte.dateDebut)}{activeCarte.dateFin && <> au {dateSuisse(activeCarte.dateFin)}</>}</>}
              </div>
            </div>
            <div style={rs.carteHeaderRight} className="no-print">
              {/* Le plat neuf naît sur la carte affichée ; décocher la carte
                  dans sa fenêtre retire ce seul lien. */}
              {canFiches && (
                <button style={rs.etiquetteBtn} onClick={() => setPlatEdite({ carteId: activeCarte.id })}>Ajouter un plat</button>
              )}
              {canManageCartes && (
                <button
                  style={{...rs.homeBtn, ...(defaultCarteId === activeCarte.id ? rs.homeBtnActive : {})}}
                  onClick={() => toggleDefaultCarte(activeCarte.id)}
                  title={defaultCarteId === activeCarte.id ? 'Carte par défaut : cliquer pour retirer' : 'Ouvrir cette carte par défaut à l\'arrivée sur le module'}
                >
                  {defaultCarteId === activeCarte.id
                    ? 'Carte par défaut'
                    : (isMobile ? 'Par défaut' : 'Définir par défaut')}
                </button>
              )}
              {/* Une carte cachée n'est servie qu'au consultant : le badge dit
                  explicitement que la brigade ne la voit pas, sinon rien ne
                  distingue à l'écran une carte publiée d'une carte masquée. */}
              {activeCarte.masquee === true ? (
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--warning-text)' }} title="Visible du consultant uniquement">Cachée</span>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--success-text)' }}>Carte active</span>
              )}
            </div>
          </div>

          {/* Cat filter - une seule catégorie sur la carte : l'onglet unique
              ferait doublon avec le titre de section, on le masque. */}
          {catsCarte.length > 1 && !q && (
            <SegmentedTabs
              size="sm"
              active={catFilterEff}
              onChange={setCatFilter}
              tabs={cats.map(c => ({ id: c, label: c }))}
            />
          )}

          {q && filteredPlats.length === 0 && (
            <div style={rs.searchEmpty}>
              Aucun plat de « {activeCarte.nom} » ne correspond à « {search.trim()} ».
              {voirDansBibliotheque}
            </div>
          )}
          {q && filteredPlats.length > 0 && voirDansBibliotheque}

          {/* Plats par catégorie, en vignettes : toucher un plat ouvre sa
              première fiche (VitrineCarte). */}
          <VitrineCarte
            plats={filteredPlats}
            categories={catsCarte}
            recettesActives={recettesActives}
            recettesVisibles={recettesEtab}
            canFiches={canFiches}
            onOuvrirRecette={(r, plat) => ouvrirFiche(r, clePlat(plat))}
            onModifierPlat={(plat) => setPlatEdite({ plat })}
            ficheQuitteeId={ficheQuitteeRef.current}
            refQuittee={vignetteQuitteeRef}
          />
        </div>
        )
      ) : ecran === 'chercher' ? (
        // Je cherche une fiche : une grille de fiches (VitrineFiches). Une
        // lecture en cours ou en échec ne s'annonce jamais comme une
        // bibliothèque vide (cf. PanneauEtat).
        recettesEtab.length === 0 && plats.length === 0 && recettesArchivees.length === 0 ? (
          dataStatus !== 'ready'
            ? <PanneauEtat
                titre={dataStatus === 'loading' ? 'Chargement des recettes…' : 'Recettes indisponibles'}
                texte={dataStatus === 'loading'
                  ? 'La bibliothèque de cet établissement arrive.'
                  : (online
                    ? 'La connexion a été interrompue. Rien n’est perdu : nouvel essai automatique en cours.'
                    : 'Hors ligne : les recettes de cet établissement n’ont pas encore été chargées sur cet appareil. Elles s’afficheront au retour du réseau.')}
                onRetry={dataStatus === 'error' ? retryAll : null}
              />
            : <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize:13}}>{canFiches ? 'Aucune recette pour cet établissement. La tuile « Nouvelle fiche » en crée une.' : 'Aucune recette pour cet établissement.'}</div>
        ) : (
          <VitrineFiches
            recettesEtab={recettesEtab}
            recettesArchivees={recettesArchivees}
            plats={plats}
            match={match}
            q={q}
            recherche={search}
            canFiches={canFiches}
            canEtiqueter={canEtiqueter}
            voirArchivees={voirArchivees}
            onBasculerArchivees={() => setVoirArchivees(v => !v)}
            onOuvrir={ouvrirFiche}
            onEtiquette={setEtiquetteRecette}
            onModifierPlat={(plat) => setPlatEdite({ plat })}
            ficheQuitteeId={ficheQuitteeRef.current}
            refQuittee={vignetteQuitteeRef}
          />
        )
      ) : (
        <div style={rs.recettesWrap}>
          {recettesEtab.length === 0 && plats.length === 0 && (
            dataStatus !== 'ready'
              // Lecture en cours ou en échec : surtout ne pas annoncer une
              // bibliothèque vide (cf. PanneauEtat).
              ? <PanneauEtat
                  titre={dataStatus === 'loading' ? 'Chargement des recettes…' : 'Recettes indisponibles'}
                  texte={dataStatus === 'loading'
                    ? 'La bibliothèque de cet établissement arrive.'
                    : (online
                      ? 'La connexion a été interrompue. Rien n’est perdu : nouvel essai automatique en cours.'
                      : 'Hors ligne : les recettes de cet établissement n’ont pas encore été chargées sur cet appareil. Elles s’afficheront au retour du réseau.')}
                  onRetry={dataStatus === 'error' ? retryAll : null}
                />
              : <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize:13}}>{canFiches ? 'Aucune recette pour cet établissement. La tuile « Nouvelle fiche » en crée une.' : 'Aucune recette pour cet établissement.'}</div>
          )}

          {selection.active && (
            <SelectionToolbar
              count={selection.count}
              total={recettesEtab.length}
              allSelected={selection.count > 0 && selection.count === recettesEtab.length}
              onToggleAll={() => (selection.count === recettesEtab.length ? selection.clear() : selection.selectAll(recettesEtab.map(r => r.id)))}
              onDelete={supprimerSelection}
              onCancel={selection.exit}
              busy={selectionOccupee}
            >
              <button style={rs.printBtn} onClick={() => setRattacherSelection(true)} disabled={!selection.count || selectionOccupee}>Rattacher</button>
              <button style={rs.printBtn} onClick={archiverSelection} disabled={!selection.count || selectionOccupee}>Archiver</button>
            </SelectionToolbar>
          )}

          {/* ─── Hiérarchie plats avec leurs recettes ─── */}
          {(() => {
            const recettesParPlat = {};
            (plats || []).forEach(p => {
              const ids = (p.recettes || []).map(pr => pr.recetteId);
              recettesParPlat[p.id] = recettesEtab.filter(r => ids.includes(r.id));
            });
            const allLinkedRecetteIds = new Set();
            (plats || []).forEach(p => (p.recettes || []).forEach(pr => allLinkedRecetteIds.add(pr.recetteId)));
            const orphelines = recettesEtab.filter(r =>
              !allLinkedRecetteIds.has(r.id) && match(r.nom)
            );
            // Un plat sort si son nom correspond, ou si l'une de ses recettes
            // correspond : il est alors déplié d'office pour la montrer.
            const recetteTrouvee = (p) => q && (recettesParPlat[p.id] || []).some(r => match(r.nom));
            const visiblePlats = (plats || []).filter(p =>
              match(p.nom, (recettesParPlat[p.id] || []).map(r => r.nom))
            );

            // La ligne reste un <div> plutôt qu'un <button> : la convertir
            // imposerait de neutraliser tous les styles par défaut du bouton et
            // ferait courir un risque de régression visuelle. On lui donne donc
            // le contrat d'accessibilité d'un bouton - rôle, focus au clavier,
            // activation par Entrée et Espace - sans toucher au rendu. Sans ça
            // la ligne était invisible au clavier et aux lecteurs d'écran.
            // En sélection, toucher une fiche la coche au lieu de l'ouvrir.
            const activerRecette = (r) => (selection.active ? selection.toggle(r.id) : ouvrirFiche(r));
            const togglePlat = (platId, estDeplie) => {
              const next = new Set(expandedPlats);
              estDeplie ? next.delete(platId) : next.add(platId);
              setExpandedPlats(next);
            };
            const renderRecetteCard = (r, isSubItem = false) => (
              <div key={r.id + (isSubItem ? '-sub' : '')}
                role="button"
                tabIndex={0}
                aria-label={`Ouvrir la recette ${r.nom}`}
                style={isSubItem ? {...rs.recetteRow, ...rs.recetteRowSub} : {...rs.recetteRow, ...rs.recetteRowOrphelin}}
                onClick={() => activerRecette(r)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); // Espace ferait défiler la page sinon
                    activerRecette(r);
                  }
                }}>
                {selection.active && (
                  <input
                    type="checkbox"
                    checked={selection.isSelected(r.id)}
                    onChange={() => selection.toggle(r.id)}
                    onClick={e => e.stopPropagation()}
                    aria-label={`Sélectionner ${r.nom}`}
                    style={{ width: 20, height: 20, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                )}
                <RecettePhoto src={r.photoUrl} alt={r.nom} style={rs.thumb} />
                <div style={rs.recetteInfo}>
                  <div style={rs.recetteName}>{r.nom}</div>
                  <div style={rs.recetteMeta}>{r.categorie}, {r.portions} portions, v{r.version}, modifié le {dateSuisse(r.modifie)}</div>
                </div>
                {/* Pastilles d'allergènes plafonnées : une recette en cumulant 5
                    occupait 139px et écrasait le nom à 0px de large sur mobile.
                    Au-delà de 3, le surplus est résumé par un « +N » dont
                    l'infobulle liste les allergènes restants. */}
                <div style={rs.recetteBadges}>
                  {(r.allergenesIds||[]).length > 0 && (
                    <span style={{ ...rs.allergenesTexte, ...rs.allergenesLigne }} title={nomsAllergenes(r.allergenesIds)}>{nomsAllergenes(r.allergenesIds)}</span>
                  )}
                </div>
                <span style={{...rs.badge, background:'none', color: statutRecette(r.statut).couleur}}>{statutRecette(r.statut).label}</span>
                {/* Raccourci d'étiquette : le clic et le clavier s'arrêtent au
                    bouton, sinon ils ouvriraient aussi la fiche. */}
                {canEtiqueter && r.statut !== 'archivée' && (
                  <button
                    type="button"
                    style={rs.etiquetteBtn}
                    aria-label={`Imprimer l'étiquette DLC de ${r.nom}`}
                    onClick={e => { e.stopPropagation(); setEtiquetteRecette(r); }}
                    onKeyDown={e => e.stopPropagation()}
                  >Étiquette</button>
                )}
                <span style={{color:'var(--text2)', fontSize:18}}>›</span>
              </div>
            );

            return (
              <>
                {q && visiblePlats.length === 0 && orphelines.length === 0 && !recettesArchivees.some(r => match(r.nom)) && (
                  <div style={rs.searchEmpty}>
                    Aucun plat ni recette ne correspond à « {search.trim()} ».
                  </div>
                )}
                {visiblePlats.map(plat => {
                  const platRecettes = recettesParPlat[plat.id] || [];
                  const isExpanded = expandedPlats.has(plat.id) || recetteTrouvee(plat);
                  return (
                    <div key={plat.id}>
                      <div style={rs.platBlock} className="recette-plat-ligne"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Replier' : 'Déplier'} les recettes de ${plat.nom}`}
                        onClick={() => togglePlat(plat.id, isExpanded)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            togglePlat(plat.id, isExpanded);
                          }
                        }}>
                        <RecettePhoto src={plat.photoUrl} alt={plat.nom} style={rs.thumb} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={rs.platName}>
                            <span style={{ marginRight: 8, fontSize: 12, color: 'var(--text2)' }}>{isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}</span>
                            {plat.nom}
                          </div>
                          <div style={rs.recetteMeta}>
                            {plat.categorie}
                            {', '}{platRecettes.length} recette{platRecettes.length > 1 ? 's' : ''}
                          </div>
                        </div>
                        {canFiches && (
                          <button
                            type="button"
                            style={rs.printBtn}
                            aria-label={`Modifier le plat ${plat.nom}`}
                            onClick={e => { e.stopPropagation(); setPlatEdite({ plat }); }}
                            onKeyDown={e => e.stopPropagation()}
                          >Modifier</button>
                        )}
                      </div>
                      {isExpanded && platRecettes.length > 0 && (
                        <div style={rs.sousListe}>
                          {platRecettes.map(r => renderRecetteCard(r, true))}
                        </div>
                      )}
                      {isExpanded && platRecettes.length === 0 && (
                        <div style={rs.sousListeVide}>
                          Aucune recette rattachée à ce plat.
                          {/* Ouvre la fenêtre du plat, section « Recettes du plat ». */}
                          {canFiches && (
                            <>{' '}<button type="button" style={rs.lienAction} onClick={() => setPlatEdite({ plat })}>Rattacher une recette</button></>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ─── Recettes orphelines (non rattachées à un plat) ─── */}
                {orphelines.length > 0 && plats.length > 0 && (
                  <div style={rs.orphelinTitle}>Recettes sans plat ({orphelines.length})</div>
                )}
                {orphelines.length > 0 && (
                  <div style={rs.orphelinListe}>
                    {orphelines.map(r => renderRecetteCard(r, false))}
                  </div>
                )}

                {/* ─── Archivées (droit « fiches ») : repliées, ouvertes
                    d'office par une recherche qui en trouve ─── */}
                {(() => {
                  const archivees = recettesArchivees.filter(r => match(r.nom));
                  if (!archivees.length || selection.active) return null;
                  const ouvert = voirArchivees || q;
                  return (
                    <>
                      <button type="button" style={{ ...rs.orphelinTitle, ...rs.archiveesTitre }} aria-expanded={!!ouvert} onClick={() => setVoirArchivees(v => !v)}>
                        {ouvert ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                        <span>Archivées ({archivees.length})</span>
                      </button>
                      {ouvert && (
                        <div style={{ ...rs.orphelinListe, opacity: 0.75 }}>
                          {archivees.map(r => renderRecetteCard(r, false))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const rs = {
  root: {display:'flex',flexDirection:'column',gap:16},
  searchEmpty: {display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:'28px 16px',textAlign:'center',color:'var(--text2)',fontSize:13,background:'var(--surface)',border:'1px dashed var(--border)',borderRadius:'var(--r)'},
  searchElsewhereBtn: {alignSelf:'flex-start',padding:'8px 12px',borderRadius:8,border: '1px solid transparent',background:'var(--accent-light)',color:'var(--accent)',fontFamily:'var(--font)',fontSize:12,fontWeight:500,cursor:'pointer',textAlign:'left'},
  toolbar: {display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'},
  tabsWrap: {minWidth:0},
  tabsWrapMobile: {width:'100%',minWidth:0},
  toolbarActions: {display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginLeft:'auto'},
  toolbarActionsMobile: {width:'100%',marginLeft:0},
  addBtn: {padding:'8px 16px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  carteWrap: {display:'flex',flexDirection:'column',gap:20},
  // Sans cadre (la règle « Plus de carrés » l'aplatissait déjà) ni retrait
  // vertical : la place rendue va aux vignettes des plats.
  carteHeader: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'},
  carteHeaderRight: {display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'},
  homeBtn: {padding:'6px 12px',borderWidth:1,borderStyle:'solid',borderColor:'var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text2)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap'},
  homeBtnActive: {borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-light)'},
  carteName: {fontSize:18,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  // Les plats de la carte et les fiches de Je cherche une fiche sont des
  // vignettes (VitrineCarte, VitrineFiches) : leur forme vit dans
  // src/components/fiches/fiches.css, hors de portée de la règle « Plus de
  // carrés » qui aplatissait les tuiles posées en style inline.
  lienAction: {background:'none',border:'none',padding:0,color:'var(--accent)',fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',fontSize:'inherit',textDecoration:'underline'},
  // Allergènes en texte simple, noms complets séparés par des virgules.
  allergenesTexte: {fontSize:12,fontWeight:400,color:'var(--text2)',lineHeight:1.4},
  // Dans une ligne de liste : une seule ligne, le reste au survol (title).
  allergenesLigne: {minWidth:0,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  // flexShrink 0 : le min-height global de 44px sur les <button> écrase le flex
  // et fait se chevaucher les boutons d'une rangée sur mobile.
  etiquetteBtn:{flexShrink:0,padding:'8px 14px',background:'var(--accent)',border:'none',color:'var(--on-accent)',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  printBtn:{padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'},
  badge: {display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:500},
  congBtn: {padding:'7px 14px',background:'var(--surface)',borderWidth:1,borderStyle:'solid',borderColor:'var(--border)',color:'var(--text2)',borderRadius:8,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  congBtnActive: {background:'var(--accent)',borderColor:'var(--accent)',color:'var(--on-accent)'},
  // Recettes list
  recettesWrap: {display:'flex',flexDirection:'column',gap:2,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',overflow:'hidden',boxShadow:'var(--sh-xs)'},
  // flexWrap : sur mobile la rangee (vignette + nom + pastilles + statut +
  // chevron) depasse la largeur disponible. Sans wrap, soit le nom s'ecrase a
  // 0px, soit le contenu sort de la carte. En passant a la ligne, les elements
  // secondaires descendent et le nom garde sa place.
  recetteRow: {display:'flex',alignItems:'center',gap:14,padding:'14px 18px',borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'background .12s',flexWrap:'wrap'},

  // ─── Recettes rattachées à un plat : cartes détachées ─────────────────────
  // Mesuré sur mobile : les lignes se touchaient bord à bord (0px d'écart), y
  // compris entre l'en-tête du plat et sa première recette. Un doigt à quelques
  // pixels de la frontière ouvrait la recette voisine - ou repliait le plat et
  // faisait perdre sa position dans la liste.
  // Les gouttières de 8px appartiennent à `sousListe`, qui n'a aucun onClick :
  // un quasi-raté ne déclenche donc plus rien au lieu de déclencher la mauvaise
  // ligne. Le fond en retrait (--bg) rend ces gouttières visibles.
  sousListe: {display:'flex',flexDirection:'column',gap:8,padding:'8px 10px',background:'var(--bg)',borderBottom:'1px solid var(--border)'},
  sousListeVide: {padding:'12px 10px 12px 40px',background:'var(--bg)',borderBottom:'1px solid var(--border)',fontSize:11,color:'var(--text2)',fontStyle:'italic'},
  // Rail d'accent à gauche pour garder la hiérarchie visuelle ; minHeight pose
  // un plancher de rythme vertical (les hauteurs mesurées allaient de 91 à 123px).
  recetteRowSub: {marginLeft:22,border:'1px solid var(--border)',borderLeft:'3px solid var(--accent-bd)',borderRadius:10,background:'var(--surface)',minHeight:72},
  // Recettes sans plat : meme traitement que les sous-lignes, mais sans
  // indentation ni rail puisqu'elles ne dependent d'aucun plat. Elles etaient
  // separees de 2px seulement (le gap de recettesWrap), donc pas visables non
  // plus au doigt.
  orphelinListe: {display:'flex',flexDirection:'column',gap:8,padding:'8px 10px',background:'var(--bg)'},
  recetteRowOrphelin: {border:'1px solid var(--border)',borderRadius:10,background:'var(--surface)',minHeight:72},
  // minWidth 96 : avec minWidth:0 le nom cedait toute sa place aux elements de
  // droite (pastilles, statut) et tombait a 0px de large, le texte se lisant
  // alors verticalement. Le nom est l'information qu'on cherche : c'est lui qui
  // garde un plancher, ce sont les pastilles qui se plafonnent.
  recetteInfo: {flex:'1 1 140px',minWidth:96},
  // 72px : la photo redevient une information (60px la réduisait à un point de
  // couleur). Le placeholder est rendu par RecettePhoto avec ce même style.
  thumb: { width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--r-sm)', flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)' },
  platBlock: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' },
  platName: { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center' },
  orphelinTitle: { padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' },
  // Titre repliable de la section Archivées : la même ligne, en bouton.
  archiveesTitre: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, borderLeft: 'none', borderRight: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)' },
  recetteName: {fontSize:14,fontWeight:500,color:'var(--text)'},
  recetteMeta: {fontSize:11,color:'var(--text2)',marginTop:2},
  recetteBadges: {display:'flex',gap:4,flexShrink:0},
  // Detail
  // La fiche ouverte (héros, sections, colonnes) est en classes .fv-fiche de
  // src/components/fiches/fiches.css ; restent ici les contrôles de la fiche.
  detailRoot: {display:'flex',flexDirection:'column',gap:18},
  backBtn: {background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'6px 12px',cursor:'pointer',fontSize:12,color:'var(--text2)',fontFamily:'var(--font)',flexShrink:0},
  portionsCtrl: {display:'flex',alignItems:'center',gap:6},
  portBtn: {minWidth:30,height:30,borderRadius:8,borderWidth:1,borderStyle:'solid',borderColor:'var(--border)',background:'var(--surface)',color:'var(--text)',cursor:'pointer',fontSize:16,fontWeight:700,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:'var(--font)'},
  portInput: {width:64,padding:'5px 6px',borderWidth:1,borderStyle:'solid',borderColor:'var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text)',fontSize:15,fontWeight:700,textAlign:'center',fontFamily:'var(--font)',flexShrink:0},
  // ─── Barre d'échelle sous l'en-tête des ingrédients ───────────────────────
  // Au repos : la phrase qui apprend le geste (taper sur une quantité).
  // Active : d'où l'on part, de combien, et le retour en arrière.
  // Retraits latéraux réduits : la fiche n'est plus une carte, les lignes
  // s'alignent sur le titre de la section.
  echelleBar: {display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'8px 10px',background:'var(--bg)',borderBottomWidth:1,borderBottomStyle:'solid',borderBottomColor:'var(--border)',fontSize:11,color:'var(--text2)',lineHeight:1.4},
  echelleBarActive: {background:'var(--warning-bg)',borderBottomColor:'var(--warning-bd)'},
  echelleReset: {marginLeft:'auto',padding:'5px 12px',background:'none',borderWidth:1,borderStyle:'solid',borderColor:'var(--warning-bd)',borderRadius:7,color:'var(--warning-text)',fontSize:11,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  ingTable: {display:'flex',flexDirection:'column'},
  ingHead: {display:'grid',gridTemplateColumns:'1fr 80px 60px',padding:'8px 2px',background:'var(--bg)',fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:8},
  ingRow: {display:'grid',gridTemplateColumns:'1fr 80px 60px',padding:'9px 2px',borderBottom:'1px solid var(--border)',gap:8,alignItems:'center'},
  ingRowRef: {background:'var(--warning-bg-soft)'},
  ingName: {fontSize:13,color:'var(--text)'},
  // Ligne sans quantité chiffrée (« 1 feuille de laurier ») : pas de champ,
  // mais le même alignement à droite que les champs voisins.
  ingQty: {fontSize:13,fontWeight:500,color:'var(--text)',textAlign:'right'},
  // Le champ porte le recalcul : il reste discret (fond de carte, bord léger)
  // pour ne pas se lire comme une modification de la fiche enregistrée.
  ingQtyInput: {width:'100%',minWidth:0,padding:'5px 6px',borderWidth:1,borderStyle:'solid',borderColor:'var(--border)',borderRadius:7,background:'var(--bg)',color:'var(--text)',fontSize:13,fontWeight:500,textAlign:'right',fontFamily:'var(--font)'},
  ingQtyInputRef: {borderColor:'var(--warning-bd)',background:'var(--warning-bg)',color:'var(--warning-text)'},
  ingQtyBase: {fontSize:11,color:'var(--text3)',textAlign:'right',marginTop:2},
};

export default Recettes;

