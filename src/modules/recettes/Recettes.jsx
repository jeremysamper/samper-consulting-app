import React from 'react';
import { getDemoData, canManageModule, getPermissionsForRole } from '../../data/demoData.js';
import { lireCarteAccueil, useCarteAccueil } from './carteAccueil.js';
import { peutGererCartes } from './gardesRecettes.js';
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
import { categorieDuPlat, categoriesPresentes, platCatRank } from '../../utils/categoriesPlat.js';
import { makeSearchMatcher, normalizeSearch } from '../../utils/searchText.js';
import { dureesVie } from '../../utils/etiquettesDlc.js';
import EtiquetteRapideModal from '../haccp/EtiquetteRapideModal.jsx';
import { fmtQte, fmtPortions, fmtFacteur, parseNombre, basePortionsDe, estRecalcule } from '../../utils/echelleRecette.js';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BoutonActions, Fenetre } from '../../components/ui/Fenetres.jsx';
import { messageErreur } from '../../utils/messageErreur.js';
import { Btn, encadreStyle, encadreTitreStyle } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { useEcranModule } from '../../components/parcours/useEcranModule.js';
import ChoixEtiquette from './ChoixEtiquette.jsx';
import RechercheFiches from './RechercheFiches.jsx';
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
import VitrineFiches, { fichesTrouvees } from './VitrineFiches.jsx';
import './recettes.css';


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
  // « Active » : ce que l'éditeur de fiches écrit (brouillon, active, archivée).
  active: { label: 'Active', couleur: 'var(--success-text)' },
  'archivée': { label: 'Archivée', couleur: 'var(--text3)' },
};
// État normal d'une fiche en service : aucune pastille sur sa photo.
const STATUTS_EN_SERVICE = ['validée', 'active'];
const statutRecette = (s) => STATUTS_RECETTE[s] || { label: s || '', couleur: 'var(--text2)' };
// Date ISO (2026-09-29) en date suisse (29.09.2026) ; un autre texte passe tel quel.
const dateSuisse = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10).split('-').reverse().join('.') : (v || ''));
// Temps de la fiche qui valent quelque chose : l'import écrit 0 quand il n'en sait rien.
const tempsFiche = (r) => [['Prépa', r.tempsPreparation], ['Cuisson', r.tempsCuisson], ['Total', r.tempsTotal]].filter(([, v]) => Number(v) > 0);

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
    <div style={{fontSize: 'var(--t3)', fontWeight: 'var(--g3)', marginTop:10, fontFamily:'var(--font)'}}>{titre}</div>
    <div style={{fontSize: 'var(--t2)', color:'var(--text2)', marginTop:8}}>{texte}</div>
    {onRetry && (
      <button
        style={{ ...rs.printBtn, marginTop: 16 }}
        onClick={onRetry}
      >
        Réessayer
      </button>
    )}
  </div>
);

// ─── smStyle : habillage commun des modales du module ─────────────────────
// Les trois fenêtres (DuplicateRecetteModal, ExportMultipleModal,
// IngredientSearchModal) passent par Fenetre ; reste le bouton secondaire.
const smStyle = {
  ghostBtn: { padding: '8px 14px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', cursor: 'pointer' },
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
          <span style={{ flex: 1, fontSize: 'var(--t1)', color: selectedEtabIds.size > 0 ? 'var(--text)' : 'var(--text2)' }}>
            {selectedEtabIds.size > 0
              ? <>Dupliquer vers <strong>{selectedEtabIds.size}</strong> établissement{selectedEtabIds.size > 1 ? 's' : ''}</>
              : 'Sélectionnez au moins un établissement'}
          </span>
          <button style={smStyle.ghostBtn} onClick={() => !saving && onClose()} disabled={saving}>Annuler</button>
          <button
            style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)', opacity: selectedEtabIds.size === 0 || saving ? 0.5 : 1 }}
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
            <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text2)' }}>
              Aucun autre établissement accessible pour cette duplication.
            </div>
          )}

          {!loading && accessibleEtabs.length > 0 && (
            <>
              {/* ── Sélection établissements cibles ── */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' }}>
                    Établissements cibles ({selectedEtabIds.size} sélectionné{selectedEtabIds.size > 1 ? 's' : ''})
                  </label>
                  <button type="button"
                    style={{ padding: '4px 8px', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' }}
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
                          borderRadius: 'var(--r)', fontSize: 'var(--t1)', cursor: 'pointer',
                          background: checked ? 'var(--selection)' : 'var(--surface)',
                        }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleEtab(e.id)} />
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.couleur || 'var(--accent)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nom}</span>
                        {hasExisting && <span title="Une recette du même nom existe déjà ici" style={{ fontSize: 'var(--t1)', color: 'var(--warning-text)', fontWeight: 'var(--g3)' }}>déjà présente</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* ── Options de copie ── */}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                <div style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', marginBottom: 8 }}>Que copier ?</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, fontSize: 'var(--t1)' }}>
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
                  <div style={{ fontSize: 'var(--t1)', ...encadreTitreStyle('alerte'), marginBottom: 8 }}>
                    Cette recette existe déjà dans certains établissements sélectionnés
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t1)', color: 'var(--text)' }}>
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
  const gereLaFiche = canFiches || canDuplicate;

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
  const sIngName = { ...rs.ingName, ...(tactile ? { fontSize: 'var(--t3)' } : (isMobile ? { fontSize: 'var(--t2)' } : null)) };
  const portionsFiche = Number(recette.portions) || 0;
  const statutAffiche = recette.statut && !STATUTS_EN_SERVICE.includes(recette.statut) ? statutRecette(recette.statut).label : null;

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
        {canFiches && (
          <button style={rs.printBtn} onClick={onModifier}>Modifier</button>
        )}
        {canEtiqueter && (
          <button style={rs.etiquetteBtn} onClick={() => setShowEtiquette(true)}>Étiquette DLC</button>
        )}
        {/* Un seul menu pour le reste de l'en-tête : l'export pour tous, et
            pour qui gère la fiche, désarchiver et dupliquer. Sans ces droits,
            le menu garde son nom d'export. */}
        <BoutonActions
          id="fiche-exporter"
          label={gereLaFiche ? 'Actions' : 'Exporter'}
          style={rs.printBtn}
          titre={gereLaFiche ? 'Actions sur la fiche' : 'Exporter la fiche'}
          sousTitre={recette.nom}
          sections={[
            { items: [
              { titre: 'Télécharger le PDF', detail: 'La fiche technique sur une page.', onClick: exportRecipePdf },
              { titre: 'Imprimer', detail: 'La même fiche, envoyée à l\'imprimante.', onClick: printRecipe },
            ] },
            { items: [
              canFiches && recette.statut === 'archivée' && { titre: 'Désarchiver', onClick: onDesarchiver },
              canFiches && { titre: 'Dupliquer', onClick: onDupliquer },
              canDuplicate && { titre: 'Dupliquer vers…', onClick: () => setShowDuplicate(true) },
            ] },
          ]}
        />
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
              <span style={{fontSize: 'var(--t1)', color:'var(--text2)'}}>Portions :</span>
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
                <span style={{fontWeight: 'var(--g3)', color:'var(--warning-text)'}}>
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
                        style={{...rs.ingQtyInput, ...(estRef ? rs.ingQtyInputRef : null), ...(isMobile ? { fontSize: 'var(--t2)' } : null)}}
                        aria-label={`Quantité de ${i.nom || 'l’ingrédient'} : la modifier recalcule la recette`}
                      />
                      {isScaled && <div style={rs.ingQtyBase}>base <span data-no-translate>{fmtQte(base)}</span></div>}
                    </div>
                  ) : (
                    <span style={{...rs.ingQty, ...(isMobile ? { fontSize: 'var(--t2)' } : null)}}>{fmtQte(base)}</span>
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
                  <div className="no-print" style={{fontSize: 'var(--t1)', color:'var(--text2)', fontStyle:'italic'}}>
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
                      <span style={{flex:1, minWidth:0, fontSize: 'var(--t1)', color:'var(--text2)'}}>{f.label}</span>
                      <input
                        type="number" min="1" step="1" inputMode="numeric"
                        value={durees[f.k]}
                        disabled={savingDurees}
                        onChange={e => setDurees(prev => ({ ...prev, [f.k]: e.target.value }))}
                        style={{width:64, flexShrink:0, padding:'7px 8px', border:'1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', textAlign:'right', color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', outline:'none'}}
                        aria-label={f.label}
                      />
                      <span style={{width:38, flexShrink:0, fontSize: 'var(--t1)', color:'var(--text2)'}}>jours</span>
                    </div>
                  ))}
                  <div style={{fontSize: 'var(--t1)', color:'var(--text2)', lineHeight:1.5}}>
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
                <div style={{fontSize: 'var(--t2)', color:'var(--text)', lineHeight:1.7}}>
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
  search: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  hint: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  list: { padding: '6px 0 10px', display: 'flex', flexDirection: 'column', minHeight: 160 },
  groupHead: { display: 'flex', alignItems: 'center', gap: 6, padding: '14px 6px 6px', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' },
  groupCount: { fontWeight: 'var(--g2)', color: 'var(--text3)' },
  groupAllBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--lien)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '2px 4px', textTransform: 'none', letterSpacing: 0, flexShrink: 0 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)', cursor: 'pointer', marginBottom: 6, flexShrink: 0 },
  // Shorthand `border` complet (pas `borderColor`) : ms.row pose déjà le
  // shorthand, mélanger les deux fait retirer borderColor au re-render (warning React).
  rowChecked: { border: '1px solid var(--onglet)', background: 'var(--selection)' },
  rowDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' },
  rowName: { flex: 1, minWidth: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  rowMeta: { fontSize: 'var(--t1)', color: 'var(--text2)', whiteSpace: 'nowrap', flexShrink: 0 },
  tagInclus: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', background: 'var(--success-bg)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap', flexShrink: 0 },
  expandBtn: { background: 'none', border: 'none', color: 'var(--text2)', fontSize: 'var(--t1)', cursor: 'pointer', padding: '4px 6px', fontFamily: 'var(--font)', flexShrink: 0 },
  cartePreview: { margin: '-2px 0 8px 14px', padding: '6px 12px 8px', borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 },
  previewCat: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text3)', marginTop: 4 },
  previewLine: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.5 },
  empty: { padding: '28px 12px', textAlign: 'center', fontSize: 'var(--t2)', color: 'var(--text2)' },
  footer: { position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 0 4px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  footerInfo: { flex: 1, minWidth: 160, fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  clearBtn: { background: 'none', border: 'none', color: 'var(--danger-strong)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 },
  btnGhost: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: 'var(--r)', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
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
                    <span style={{ color: 'var(--text2)', fontSize: 'var(--t3)', flexShrink: 0 }}>›</span>
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
  input: { width: '100%', padding: '10px 14px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-full)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  results: { display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 },
  hint: { padding: '24px 14px', textAlign: 'center', fontSize: 'var(--t2)', color: 'var(--text2)', fontStyle: 'italic' },
  countLine: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', padding: '4px 8px' },
  // flexShrink:0 IMPÉRATIF : la règle globale mobile « button:not(.mini){min-height:44px} »
  // écrase le min-height:auto des flex-items → sans ça, flexbox comprime chaque ligne
  // à 44px dans la liste à hauteur contrainte (clavier ouvert) et le contenu déborde
  // par-dessus les lignes voisines (résultats superposés, illisibles).
  row: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', flexShrink: 0, textAlign: 'left', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--font)' },
  rowName: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  rowMeta: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },
  matchRow: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  matchIng: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', background: 'var(--selection)', color: 'var(--text)', border: '1px solid var(--btn-bord)', padding: '2px 7px', borderRadius: 'var(--r-full)' },
  matchAllerg: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)', padding: '2px 7px', borderRadius: 'var(--r-full)' },
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
  const canManageCartes = peutGererCartes(user.role);
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
  // Bibliothèque : sélection de fiches (rattacher, archiver, supprimer), ouverte
  // par le menu « Gérer ».
  const selection = useSelection();
  const [selectionOccupee, setSelectionOccupee] = React.useState(false);
  const [rattacherSelection, setRattacherSelection] = React.useState(false);
  const [voirArchivees, setVoirArchivees] = React.useState(false);
  // Section « Tous les plats » de la bibliothèque (droit « fiches »), repliée.
  const [voirPlats, setVoirPlats] = React.useState(false);

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
  const [showExportModal, setShowExportModal] = React.useState(false);
  const [showIngredientSearch, setShowIngredientSearch] = React.useState(false);
  // Carte d'accueil = préférence utilisateur par établissement (user_settings,
  // synchro multi-device, cache hydraté au login → lecture instantanée). Un
  // seul état, partagé avec la section « Carte d'accueil » de la page des
  // réglages (carteAccueil.js) : le bouton de la carte en est le raccourci.
  const { carteId: defaultCarteId, choisir: choisirCarteAccueil } = useCarteAccueil(etabId);

  // Écran du module : l'écran d'arrivée (la carte du moment, la recherche, les
  // actions et la gestion, sur place), et l'écran « Une étiquette », qui garde
  // sa liste ouverte d'une étiquette à la suivante. Le geste retour, Échap et
  // « Retour » ramènent de l'étiquette à l'écran d'arrivée, qui garde sa carte
  // et sa recherche. Aucun écran n'est repris d'une visite à l'autre : le
  // module s'ouvre toujours sur l'écran d'arrivée (une clé sc_recettes_ecran
  // d'avant, « carte » ou « chercher », y ramène).
  const { ecran, setEcran, retourAccueil } = useEcranModule('recettes', {
    surRetour: () => setEtiquetteRecette(null),
  });
  // Fenêtres de la barre des cartes (ajouter, modifier, ordre, archives) et
  // détection des allergènes : ouvertes depuis le menu « Gérer ».
  const barreCartesRef = React.useRef(null);
  const detectionRef = React.useRef(null);

  // Fiche ouverte : le geste retour et Échap la referment vers l'écran d'où
  // elle a été ouverte, comme son bouton « Retour ». Échap ne fait rien dans
  // un champ ni sous une fenêtre : une Fenetre se ferme seule, la fenêtre
  // d'étiquette (qui n'en est pas une) reste ouverte comme aujourd'hui, au lieu
  // que l'écran parte sous elle. Elle se reconnaît à ce qu'elle est rendue dans
  // le module (<main>), là où une Fenetre passe en portail sous <body>.
  const fermerFiche = React.useCallback(() => setSelectedRecette(null), []);
  useBackLayer(Boolean(selectedRecette), fermerFiche, 'recettes-fiche');

  // Au retour d'une fiche, l'écran revient là où on l'a quitté (la fiche
  // s'ouvre en haut de page et remet à zéro le défilement de ses parents).
  // À l'ouverture, le défilement de chaque parent qui défile est retenu ; au
  // retour, il est remis tel quel : la bibliothèque et la recherche
  // Allergènes retrouvent leur ligne. La clé dit en plus quelle vignette a
  // été quittée : « plat:<id> » sur une carte, « fiche:<id> » dans la
  // bibliothèque ; si elle n'est plus à l'écran
  // après la remise (liste relue entre-temps), elle y est ramenée. Même motif
  // que les Fiches salle.
  const racineRef = React.useRef(null);
  const ficheQuitteeRef = React.useRef(null);
  const vignetteQuitteeRef = React.useRef(null);
  const defilementQuitteRef = React.useRef(null);
  const ouvrirFiche = React.useCallback((r, cle = null) => {
    const parents = [];
    for (let el = racineRef.current?.parentElement; el; el = el.parentElement) if (el.scrollTop > 0) parents.push([el, el.scrollTop]);
    defilementQuitteRef.current = { parents, fenetre: window.scrollY };
    ficheQuitteeRef.current = cle;
    setSelectedRecette(r);
  }, []);
  React.useLayoutEffect(() => {
    if (selectedRecette || edition) return;
    const defilement = defilementQuitteRef.current;
    const cle = ficheQuitteeRef.current;
    defilementQuitteRef.current = null;
    ficheQuitteeRef.current = null;
    if (defilement) {
      defilement.parents.forEach(([el, haut]) => { if (el.isConnected) el.scrollTop = haut; });
      if (defilement.fenetre > 0) window.scrollTo(0, defilement.fenetre);
    }
    const el = cle ? vignetteQuitteeRef.current : null;
    const r = el?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: 'center' });
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
    // Phase de capture : passe avant le retour à l'écran d'arrivée
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
    try {
      await choisirCarteAccueil(next);
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
  // Sans aucune carte (lecture aboutie), l'écran montre la bibliothèque : le
  // module s'ouvre toujours sur des fiches, jamais sur un panneau vide.
  const sansCarte = cartesStatus === 'ready' && cartes.length === 0;
  const isLibrary = activeTab === LIBRARY_TAB || sansCarte;
  const activeCarte = cartes.find(c => c.id === activeTab) || null;
  // Atterrissage : à l'ouverture (activeTab vide) ou si la carte courante a
  // disparu, on bascule sur la carte d'accueil définie par l'utilisateur, sinon
  // la 1re carte. Un choix explicite déjà valide (carte ou bibliothèque) est respecté.
  // activeTab compte aussi : une carte supprimée ou archivée laisse un onglet
  // qui n'existe plus, la carte d'accueil reprend sa place.
  React.useEffect(() => {
    if (!cartes.length) return;
    if (activeTab === LIBRARY_TAB || cartes.some(c => c.id === activeTab)) return;
    const saved = lireCarteAccueil(etabId);
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
  // (« confit de sanglier » trouve « Sanglier confit »). Elle porte sur toutes
  // les fiches de l'établissement, quelle que soit la carte affichée : dès la
  // première lettre, l'écran montre la bibliothèque filtrée (VitrineFiches :
  // nom de la fiche et des plats qui la contiennent). Vider le champ rend la
  // carte.
  const match = makeSearchMatcher(search);
  const q = match.active;
  const filteredPlats = platsCarte.filter(p =>
    p.actif !== false && (catFilterEff === 'Tous' || categorieDuPlat(p) === catFilterEff)
  );

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

  // Fenêtres du module (étiquette, export, recherche allergène, plat,
  // rattachement) : les mêmes sur chaque écran, posées avant son contenu et
  // hors de .rc-page (un conteneur de requêtes ne porte aucune fenêtre en
  // position fixe). La détection des allergènes (consultant) y vit aussi :
  // elle part du menu « Gérer » et ne rend que son voile de progression.
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
      {isConsultant && (
        <DetectionAllergenes
          recettes={recettesActives}
          style={rs.printBtn}
          commandesRef={detectionRef}
          onFini={() => reloadDataRef.current && reloadDataRef.current()}
        />
      )}
    </>
  );

  if (ecran === 'etiquette') return (
    <div style={rs.root}>
      {fenetres}
      <EcranTache titre="Une étiquette" etat={<>Choisissez la préparation</>} onRetour={retourAccueil} />
      <ChoixEtiquette recettes={recettesEtab} chargement={lectureEnCours(dataStatus)} onChoisir={setEtiquetteRecette} />
    </div>
  );

  // ─── Écran d'arrivée ──────────────────────────────────────────────────────
  // Tout sur un écran, sans accueil à tuiles : la recherche dans toutes les
  // fiches, les actions (Nouvelle fiche, Allergènes, Exporter, Une étiquette),
  // le menu « Gérer » (cartes et fiches, pour qui gère les cartes), les
  // onglets de cartes et l'onglet Bibliothèque. Le module s'ouvre sur la carte
  // du moment : la carte d'accueil choisie, sinon la première ; sans aucune
  // carte, sur la bibliothèque. Une recherche montre la bibliothèque filtrée,
  // quelle que soit la carte ; la vider rend la carte. Chaque contrôle garde
  // sa garde d'avant (canFiches, canManageCartes, canEtiqueter, consultant).
  const vueBiblio = isLibrary || q;
  // Choisir un onglet, c'est demander cette carte (ou toute la bibliothèque) :
  // la recherche se vide et la sélection en cours se referme.
  const choisirOnglet = (id) => { setSearch(''); selection.exit(); setActiveTab(id); };
  // Sélection de fiches (droit « fiches ») : elle se fait dans la bibliothèque.
  const entrerSelection = () => { setActiveTab(LIBRARY_TAB); selection.enter(); };
  // « Tout sélectionner » ne coche que les fiches à l'écran (recherche
  // comprise) et garde celles cochées avant : une suppression en lot ne
  // touche jamais une fiche que l'écran ne montrait pas au moment de cocher.
  const fichesMontrees = selection.active ? fichesTrouvees(recettesEtab, plats, match) : [];
  const toutesCochees = fichesMontrees.length > 0 && fichesMontrees.every(r => selection.isSelected(r.id));
  const basculerTout = () => {
    const montrees = new Set(fichesMontrees.map(r => r.id));
    selection.selectAll(toutesCochees
      ? [...selection.ids].filter(id => !montrees.has(id))
      : [...selection.ids, ...montrees]);
  };
  const nbArchives = archivedCartes.length;
  const biblioVide = recettesEtab.length === 0 && recettesArchivees.length === 0 && (plats.length === 0 || dataStatus !== 'ready');

  return (
    <div ref={racineRef} style={rs.root}>
      {fenetres}
      <div className="rc-page">
        {/* La barre : le champ d'abord, puis l'action principale et les
            actions de tous, « Gérer » en dernier. Pendant une sélection, les
            actions laissent la place à la barre de sélection. */}
        <div className="rc-tete no-print">
          <RechercheFiches value={search} onChange={setSearch} />
          {!selection.active && (
            <div className="module-actions rc-actions">
              {canFiches && <Btn variant="primary" onClick={creerFiche}>Nouvelle fiche</Btn>}
              <Btn onClick={() => setShowIngredientSearch(true)} title="Trouver dans quelles recettes un ingrédient ou allergène apparaît">Allergènes</Btn>
              <Btn onClick={() => setShowExportModal(true)} title="Exporter une carte entière, des plats ou des recettes dans un seul PDF">Exporter</Btn>
              {canEtiqueter && <Btn onClick={() => setEcran('etiquette')} title="DLC d'une préparation">Une étiquette</Btn>}
              {canManageCartes && (
                <BoutonActions
                  id="recettes-gerer"
                  label="Gérer"
                  style={rs.gererBtn}
                  titre="Gérer les cartes et les fiches"
                  sections={[
                    { titre: 'Cartes', items: [
                      { titre: 'Ajouter une carte', detail: 'Un onglet de plus, à remplir de plats', onClick: () => barreCartesRef.current?.creer() },
                      activeCarte && {
                        titre: 'Modifier la carte',
                        detail: <><span data-no-translate="">{String(activeCarte.nom ?? '').trim() || '?'}</span><span>{isConsultant ? ' : nom, dates, archiver, cacher, supprimer' : ' : nom, dates, archiver, supprimer'}</span></>,
                        onClick: () => barreCartesRef.current?.modifier(activeCarte),
                      },
                      cartes.length > 1 && { titre: 'Ordre des cartes', detail: "Changer l'ordre des onglets, de gauche à droite", onClick: () => barreCartesRef.current?.ordre() },
                      nbArchives > 0 && {
                        titre: 'Archives',
                        detail: <><span data-no-translate="">{nbArchives}</span> <span>{nbArchives > 1 ? 'cartes archivées, à restaurer' : 'carte archivée, à restaurer'}</span></>,
                        onClick: () => barreCartesRef.current?.archives(),
                      },
                    ] },
                    { titre: 'Fiches', items: [
                      canFiches && { titre: 'Sélectionner des fiches', detail: 'Pour les rattacher à des plats, les archiver ou les supprimer', onClick: entrerSelection },
                      isConsultant && { titre: 'Détecter les allergènes', detail: 'Analyse des ingrédients de chaque fiche, à vérifier ensuite', onClick: () => detectionRef.current?.lancer() },
                    ] },
                  ]}
                />
              )}
            </div>
          )}
        </div>

        {/* Onglets : une carte par onglet, puis la bibliothèque. La barre ne
            rend que les onglets ; ses fenêtres de gestion s'ouvrent depuis
            « Gérer ». Pendant une recherche, l'onglet montré est la
            bibliothèque : c'est elle que l'écran affiche. L'onglet
            Bibliothèque attend la première lecture des cartes : posé seul
            puis repoussé par elles, il resterait le point d'accroche du
            défilement et la bande s'ouvrirait sur sa fin au téléphone. */}
        <div style={isMobile ? rs.tabsWrapMobile : rs.tabsWrap}>
          <CarteTabBar
            cartes={cartes}
            activeId={vueBiblio ? LIBRARY_TAB : activeTab}
            onSelect={choisirOnglet}
            extraTabs={cartes.length > 0 || cartesStatus !== 'loading' ? [{ id: LIBRARY_TAB, label: 'Bibliothèque recettes' }] : []}
            canManage={canManageCartes}
            onAddCarte={addCarte}
            onRenameCarte={renameCarte}
            onDeleteCarte={deleteCarte}
            archivedCartes={archivedCartes}
            onArchiveCarte={archiveCarte}
            canHide={isConsultant}
            onHideCarte={masquerCarte}
            homeId={defaultCarteId}
            onReorderCartes={reorderCartes}
            commandesRef={barreCartesRef}
          />
        </div>

        {!vueBiblio ? (
          !activeCarte ? (
            // Une lecture en cours ou en échec (tablette qui sort de veille,
            // JWT expiré, réseau coupé) ne s'annonce jamais comme un
            // établissement sans carte : on le dit et on propose un nouvel
            // essai, un rechargement automatique est déjà programmé. Lecture
            // aboutie sur zéro carte : l'écran montre la bibliothèque (isLibrary).
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
            ) : null
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
                  <button style={{ ...rs.printBtn, alignSelf: 'center' }} onClick={() => setPlatEdite({ carteId: activeCarte.id })}>Ajouter un plat</button>
                )}
              </>
            )
          ) : (
          <div style={rs.carteWrap}>
            {/* Carte header */}
            <div style={rs.carteHeader}>
              <div>
                <div style={rs.carteName}>{activeCarte.nom}</div>
                <div style={{fontSize: 'var(--t2)', color:'var(--text2)'}}>
                  {platsCarte.length} plat{platsCarte.length > 1 ? 's' : ''}
                  {activeCarte.dateDebut && <>, du {dateSuisse(activeCarte.dateDebut)}{activeCarte.dateFin && <> au {dateSuisse(activeCarte.dateFin)}</>}</>}
                </div>
              </div>
              <div style={rs.carteHeaderRight} className="no-print">
                {/* Le plat neuf naît sur la carte affichée ; décocher la carte
                    dans sa fenêtre retire ce seul lien. */}
                {canFiches && (
                  <button style={rs.printBtn} onClick={() => setPlatEdite({ carteId: activeCarte.id })}>Ajouter un plat</button>
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
                  <span style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--warning-text)' }} title="Visible du consultant uniquement">Cachée</span>
                ) : (
                  <span style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--success-text)' }}>Carte active</span>
                )}
              </div>
            </div>

            {/* Cat filter - une seule catégorie sur la carte : l'onglet unique
                ferait doublon avec le titre de section, on le masque. */}
            {catsCarte.length > 1 && (
              <SegmentedTabs
                size="sm"
                active={catFilterEff}
                onChange={setCatFilter}
                tabs={cats.map(c => ({ id: c, label: c }))}
              />
            )}

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
        ) : (
          // La bibliothèque : toutes les fiches de l'établissement en grille
          // (VitrineFiches), filtrées par la recherche. Même en-tête qu'une
          // carte : son nom, son nombre, puis « Ajouter un plat » (droit
          // « fiches » : un plat sans carte, à rattacher dans sa fenêtre).
          <div style={rs.carteWrap}>
            <div style={rs.carteHeader}>
              <div>
                <div style={rs.carteName}>Bibliothèque recettes</div>
                <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)' }}>
                  {dataStatus === 'ready'
                    ? <><span data-no-translate="">{recettesEtab.length}</span> {recettesEtab.length > 1 ? 'fiches' : 'fiche'}</>
                    : lectureEnCours(dataStatus)}
                </div>
              </div>
              {canFiches && !selection.active && (
                <div style={rs.carteHeaderRight} className="no-print">
                  <button style={rs.printBtn} onClick={() => setPlatEdite({ carteId: null })}>Ajouter un plat</button>
                </div>
              )}
            </div>

            {selection.active && (
              <SelectionToolbar
                count={selection.count}
                total={recettesEtab.length}
                allSelected={toutesCochees}
                onToggleAll={basculerTout}
                onDelete={supprimerSelection}
                onCancel={selection.exit}
                busy={selectionOccupee}
              >
                <button style={rs.printBtn} onClick={() => setRattacherSelection(true)} disabled={!selection.count || selectionOccupee}>Rattacher</button>
                <button style={rs.printBtn} onClick={archiverSelection} disabled={!selection.count || selectionOccupee}>Archiver</button>
              </SelectionToolbar>
            )}

            {/* Une lecture en cours ou en échec ne s'annonce jamais comme une
                bibliothèque vide (cf. PanneauEtat) : sans aucune fiche lue, des
                plats déjà là (lecture des fiches en échec) ne suffisent pas à
                montrer la grille, elle les donnerait tous « à compléter ». */}
            {biblioVide ? (
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
                : <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize: 'var(--t2)'}}>{canFiches ? 'Aucune recette pour cet établissement. Le bouton « Nouvelle fiche » en crée une.' : 'Aucune recette pour cet établissement.'}</div>
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
                voirPlats={voirPlats}
                onBasculerPlats={() => setVoirPlats(v => !v)}
                selection={selection.active ? selection : null}
                onOuvrir={ouvrirFiche}
                onEtiquette={setEtiquetteRecette}
                onModifierPlat={(plat) => setPlatEdite({ plat })}
                ficheQuitteeId={ficheQuitteeRef.current}
                refQuittee={vignetteQuitteeRef}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const rs = {
  root: {display:'flex',flexDirection:'column',gap:16},
  tabsWrap: {minWidth:0},
  tabsWrapMobile: {width:'100%',minWidth:0},
  addBtn: {padding:'8px 16px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius: 'var(--r)',fontSize: 'var(--t2)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)'},
  carteWrap: {display:'flex',flexDirection:'column',gap:20},
  // Sans cadre (la règle « Plus de carrés » l'aplatissait déjà) ni retrait
  // vertical : la place rendue va aux vignettes des plats.
  carteHeader: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'},
  carteHeaderRight: {display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'},
  homeBtn: {padding:'6px 14px',borderWidth:1,borderStyle:'solid',borderColor: 'var(--btn-bord)',borderRadius: 'var(--r-full)',background: 'var(--btn-fond)',color: 'var(--btn-texte)',fontSize: 'var(--t1)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap'},
  homeBtnActive: {borderColor:'var(--onglet)',color:'var(--text)',background:'var(--selection)'},
  carteName: {fontSize: 'var(--t3)',fontWeight: 'var(--g3)',fontFamily:'var(--font)',color:'var(--text)'},
  // flexShrink 0 : le min-height global de 44px sur les <button> écrase le flex
  // et fait se chevaucher les boutons d'une rangée sur mobile.
  etiquetteBtn:{flexShrink:0,padding:'8px 16px',background:'var(--accent)',border:'none',color:'var(--on-accent)',borderRadius: 'var(--r-full)',fontSize: 'var(--t2)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)'},
  // « Gérer » de la barre : la pilule secondaire de Btn (BoutonActions rend son propre bouton).
  gererBtn:{padding:'8px 14px',background: 'var(--btn-fond)',borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',color: 'var(--btn-texte)', fontWeight: 'var(--g2)',borderRadius: 'var(--r-full)',fontSize: 13,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap'},
  printBtn:{padding:'8px 16px',background: 'var(--btn-fond)',borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',color: 'var(--btn-texte)', fontWeight: 'var(--g2)',borderRadius: 'var(--r-full)',fontSize: 'var(--t2)',cursor:'pointer',fontFamily:'var(--font)'},
  badge: {display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius: 'var(--r)',fontSize: 'var(--t1)',fontWeight: 'var(--g2)'},
  congBtn: {padding:'7px 14px',background: 'var(--btn-fond)',borderWidth:1,borderStyle:'solid',borderColor: 'var(--btn-bord)',color: 'var(--btn-texte)',borderRadius: 'var(--r)',fontSize: 'var(--t1)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)'},
  congBtnActive: {background:'var(--selection)',borderColor:'var(--onglet)',color:'var(--text)'},

  // Detail
  // La fiche ouverte (héros, sections, colonnes) est en classes .fv-fiche de
  // src/components/fiches/fiches.css ; restent ici les contrôles de la fiche.
  detailRoot: {display:'flex',flexDirection:'column',gap:18},
  backBtn: {background: 'var(--btn-fond)',borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',borderRadius: 'var(--r)',padding:'6px 12px',cursor:'pointer',fontSize: 'var(--t1)',color: 'var(--btn-texte)', fontWeight: 'var(--g2)',fontFamily:'var(--font)',flexShrink:0},
  portionsCtrl: {display:'flex',alignItems:'center',gap:6},
  portBtn: {minWidth:30,height:30,borderRadius: 'var(--r)',borderWidth:1,borderStyle:'solid',borderColor: 'var(--btn-bord)',background: 'var(--btn-fond)',color: 'var(--btn-texte)',cursor:'pointer',fontSize: 'var(--t3)',fontWeight: 'var(--g3)',lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontFamily:'var(--font)'},
  portInput: {width:64,padding:'5px 6px',borderWidth:1,borderStyle:'solid',borderColor: 'var(--champ-bord)',borderRadius: 'var(--r)',background:'var(--surface)',color:'var(--text)',fontSize: 'var(--t2)',fontWeight: 'var(--g3)',textAlign:'center',fontFamily:'var(--font)',flexShrink:0},
  // ─── Barre d'échelle sous l'en-tête des ingrédients ───────────────────────
  // Au repos : la phrase qui apprend le geste (taper sur une quantité).
  // Active : d'où l'on part, de combien, et le retour en arrière.
  // Retraits latéraux réduits : la fiche n'est plus une carte, les lignes
  // s'alignent sur le titre de la section.
  echelleBar: {display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'8px 10px',background:'var(--bg)',borderBottomWidth:1,borderBottomStyle:'solid',borderBottomColor:'var(--border)',fontSize: 'var(--t1)',color:'var(--text2)',lineHeight:1.4},
  echelleBarActive: {background:'var(--warning-bg)',borderBottomColor:'var(--warning-bd)'},
  echelleReset: {marginLeft:'auto',padding:'5px 12px',background:'none',borderWidth:1,borderStyle:'solid',borderColor:'var(--warning-bd)',borderRadius: 'var(--r)',color:'var(--warning-text)',fontSize: 'var(--t1)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  ingTable: {display:'flex',flexDirection:'column'},
  ingHead: {display:'grid',gridTemplateColumns:'1fr 80px 60px',padding:'8px 2px',background:'var(--bg)',fontSize: 'var(--t1)',fontWeight: 'var(--g3)',color:'var(--text2)',borderBottom:'1px solid var(--border)',gap:8},
  ingRow: {display:'grid',gridTemplateColumns:'1fr 80px 60px',padding:'9px 2px',borderBottom:'1px solid var(--border)',gap:8,alignItems:'center'},
  ingRowRef: {background:'var(--warning-bg-soft)'},
  ingName: {fontSize: 'var(--t2)',color:'var(--text)'},
  // Ligne sans quantité chiffrée (« 1 feuille de laurier ») : pas de champ,
  // mais le même alignement à droite que les champs voisins.
  ingQty: {fontSize: 'var(--t2)',fontWeight: 'var(--g2)',color:'var(--text)',textAlign:'right'},
  // Le champ porte le recalcul : il reste discret (fond de carte, bord léger)
  // pour ne pas se lire comme une modification de la fiche enregistrée.
  ingQtyInput: {width:'100%',minWidth:0,padding:'5px 6px',borderWidth:1,borderStyle:'solid',borderColor: 'var(--champ-bord)',borderRadius: 'var(--r)',background: 'var(--surface)',color:'var(--text)',fontSize: 'var(--t2)',fontWeight: 'var(--g2)',textAlign:'right',fontFamily:'var(--font)'},
  ingQtyInputRef: {borderColor:'var(--warning-bd)',background:'var(--warning-bg)',color:'var(--warning-text)'},
  ingQtyBase: {fontSize: 'var(--t1)',color:'var(--text3)',textAlign:'right',marginTop:2},
};

export default Recettes;

