import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import { notifyLegacy, readLegacyStorage } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import BottomActionBar from '../../components/mobile/BottomActionBar.jsx';
import { Calculator, Copy, ArrowLeft } from 'lucide-react';


// CARTES & RECETTES
// ─── ALLERGENES_MAP : constante globale (scope module) ───
const ALLERGENES_MAP = { gluten:'Gluten', lactose:'Lactose', oeufs:'Œufs', poissons:'Poissons', sulfites:'Sulfites', crustaces:'Crustacés', fruits_coque:'Fruits à coque', arachides:'Arachides', soja:'Soja', celeri:'Céleri', moutarde:'Moutarde', sesame:'Sésame', mollusques:'Mollusques', lupin:'Lupin' };

// slug pour nom de fichier PDF (sans accents, kebab-case)
const slug = (s) => String(s || 'recette').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'recette';

// ─── ScalingModal : modale de calculateur de quantités (portions OU grammage cible) ───
// Construit l'objet fiche pour le générateur jsPDF natif (pdf.js).
// La logique de rôle (food cost consultant-only) et la résolution des allergènes
// vivent ici. `portions` permet de refléter une mise à l'échelle (vue détail) ;
// par défaut, les portions de base de la recette.
function buildRecettePdfData(recette, { isConsultant = false, portions } = {}) {
  const p = portions != null ? portions : recette.portions;
  const ratio = (p || 1) / (recette.portions || 1);
  const fmtQty = (n) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1));

  const metaCells = [{ k: 'PORTIONS', v: String(p ?? '') }];
  if (recette.tempsTotal) metaCells.push({ k: 'TEMPS TOTAL', v: `${recette.tempsTotal} min` });
  if (isConsultant && recette.foodCost != null) metaCells.push({ k: 'FOOD COST', v: `${recette.foodCost.toFixed(1)}%` });

  const notes = [];
  if (recette.dressage) notes.push({ label: 'Dressage', text: recette.dressage });
  if (recette.conservation) notes.push({ label: 'Conservation', text: recette.conservation });

  return {
    plat: recette.nom,
    famille: recette.categorie,
    metaCells,
    ingredients: (recette.ingredients || []).map((i) => ({
      qte: fmtQty((i.quantite || 0) * ratio),
      unite: i.unite,
      nom: i.nom,
    })),
    etapes: recette.etapes || [],
    notes,
    allergenesText: (recette.allergenesIds || []).map((a) => ALLERGENES_MAP[a] || a).join(', ') || 'Aucun',
  };
}

const ScalingModal = ({ recette, onClose }) => {
  const [scalingPortions, setScalingPortions] = React.useState('');
  const [scalingTarget, setScalingTarget] = React.useState({ ingId: '', targetQty: '' });

  const basePortions = Number(recette.portions) || 1;
  const ings = recette.ingredients || [];
  const targetIng = scalingTarget.ingId ? ings.find(i => i.id === scalingTarget.ingId) : null;
  const targetQty = parseFloat(scalingTarget.targetQty);
  const useGramMode = targetIng && !isNaN(targetQty) && targetQty > 0 && Number(targetIng.quantite) > 0;

  let ratio = 1;
  if (useGramMode) {
    ratio = targetQty / Number(targetIng.quantite);
  } else {
    const targetP = parseFloat(scalingPortions);
    if (!isNaN(targetP) && targetP > 0) ratio = targetP / basePortions;
  }
  const isScaled = ratio !== 1;
  const finalPortions = useGramMode ? Math.round(basePortions * ratio * 100) / 100 : (parseFloat(scalingPortions) || basePortions);
  const candidateIngs = ings.filter(i => Number(i.quantite) > 0 && i.nom);

  const fmt = (q, unite) => {
    if (q === 0) return '-';
    if (q >= 1000 && unite === 'g') return `${(q/1000).toFixed(q % 1000 === 0 ? 0 : 2)} kg`;
    if (q >= 1000 && unite === 'ml') return `${(q/1000).toFixed(q % 1000 === 0 ? 0 : 2)} L`;
    if (q % 1 === 0) return `${q} ${unite || ''}`;
    if (q < 1) return `${Math.round(q * 1000) / 1000} ${unite || ''}`;
    return `${Math.round(q * 10) / 10} ${unite || ''}`;
  };

  return (
    <div className="modal-sheet-overlay" style={smStyle.overlay} onClick={onClose}>
      <div className="modal-sheet" style={smStyle.modal} onClick={e => e.stopPropagation()}>
        <div style={smStyle.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>⚖ Calculateur de quantités</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Les valeurs de base de la recette ne sont pas modifiées</div>
          </div>
          <button style={smStyle.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Méthode 1 : par portions */}
        <div style={{ ...smStyle.method, background: useGramMode ? 'var(--bg)' : '#fefce8' }}>
          <div style={smStyle.methodLabel}>Méthode 1 : Par nombre de portions</div>
          <div style={smStyle.methodInputs}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              Base : <strong style={{ color: 'var(--text)' }}>{basePortions} portion{basePortions > 1 ? 's' : ''}</strong>
            </span>
            <span style={{ fontSize: 16, color: 'var(--text2)' }}>→</span>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Pour :</label>
            <input
              type="number" min="0.1" step="1"
              value={scalingPortions}
              onChange={e => { setScalingPortions(e.target.value); setScalingTarget({ ingId: '', targetQty: '' }); }}
              placeholder={String(basePortions)}
              style={{ ...smStyle.numInput, borderColor: useGramMode ? 'var(--border)' : 'var(--accent)' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>portions</span>
          </div>
        </div>

        {/* Méthode 2 : par quantité cible */}
        <div style={{ ...smStyle.method, background: useGramMode ? '#fefce8' : 'var(--bg)' }}>
          <div style={smStyle.methodLabel}>Méthode 2 : Par quantité cible d'un ingrédient</div>
          <div style={smStyle.methodInputs}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>Avec</span>
            <select
              value={scalingTarget.ingId}
              onChange={e => { setScalingTarget({ ingId: e.target.value, targetQty: '' }); setScalingPortions(''); }}
              style={smStyle.select}
            >
              <option value="">Choisir un ingrédient</option>
              {candidateIngs.map(i => <option key={i.id} value={i.id}>{i.nom} ({i.quantite} {i.unite})</option>)}
            </select>
            {scalingTarget.ingId && targetIng && (
              <>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>=</span>
                <input
                  type="number" min="0" step="0.01"
                  value={scalingTarget.targetQty}
                  onChange={e => { setScalingTarget(prev => ({ ...prev, targetQty: e.target.value })); setScalingPortions(''); }}
                  placeholder={String(targetIng.quantite)}
                  style={{ ...smStyle.numInput, borderColor: useGramMode ? 'var(--accent)' : 'var(--border)' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{targetIng.unite}</span>
              </>
            )}
          </div>
        </div>

        {/* Résultat */}
        {isScaled && (
          <div style={smStyle.result}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
              Facteur : × {ratio < 1 ? ratio.toFixed(3) : Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: '#92400e' }}>→ {finalPortions} portion{finalPortions > 1 ? 's' : ''}</div>
            <button
              style={{ marginLeft: 'auto', padding: '4px 10px', background: 'none', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}
              onClick={() => { setScalingPortions(''); setScalingTarget({ ingId: '', targetQty: '' }); }}
            >Réinitialiser</button>
          </div>
        )}

        {/* Tableau ingrédients */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <div style={smStyle.tableHead}>
            <span>Ingrédient</span>
            <span style={{ textAlign: 'right' }}>Base ({basePortions} p.)</span>
            <span style={{ textAlign: 'right', color: isScaled ? '#92400e' : 'var(--text2)' }}>{isScaled ? 'Recalculé' : '-'}</span>
          </div>
          {ings.map((ing, idx) => {
            const qBase = Number(ing.quantite) || 0;
            const qCalc = qBase * ratio;
            const isTargetIng = useGramMode && ing.id === scalingTarget.ingId;
            return (
              <div key={ing.id || idx}
                style={{ ...smStyle.tableRow, background: isTargetIng ? '#fef3c7' : (idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)') }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: isTargetIng ? 700 : 500 }}>
                  {isTargetIng && '🎯 '}{ing.nom || '-'}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right' }}>{fmt(qBase, ing.unite)}</span>
                <span style={{ fontSize: 13, fontWeight: isScaled ? 700 : 400, color: isScaled ? '#92400e' : 'var(--text2)', textAlign: 'right' }}>
                  {isScaled ? fmt(qCalc, ing.unite) : '-'}
                </span>
              </div>
            );
          })}
        </div>

        <div style={smStyle.footer}>
          <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>Les valeurs de base restent inchangées.</span>
          <button style={smStyle.ghostBtn} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
};

const smStyle = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 12, width: 620, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  header: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' },
  method: { padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  methodLabel: { fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4 },
  methodInputs: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  numInput: { width: 80, padding: '7px 10px', border: '2px solid var(--border)', borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: '#fff', color: 'var(--text)' },
  select: { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', maxWidth: 240, cursor: 'pointer' },
  result: { padding: '10px 20px', background: '#fef3c7', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  tableHead: { display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 4, padding: '6px 20px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 4, padding: '9px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' },
  footer: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' },
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
    prix: false,        // désactivé par défaut (prix fournisseurs varient par étab)
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
    if (selectedEtabIds.size === 0) { notifyLegacy('Sélectionne au moins un établissement.', 'warning'); return; }
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
      // Prix : si opts.prix désactivé, on remet à 0 pour forcer une revue par l'établissement
      prixVente: opts.prix ? (recette.prixVente || 0) : 0,
      tempsPreparation: recette.tempsPreparation || 0,
      tempsCuisson: recette.tempsCuisson || 0,
      tempsTotal: recette.tempsTotal || 0,
      statut: 'brouillon', // une copie commence en brouillon pour validation côté étab cible
      version: 1,
      allergenesIds: opts.allergenes ? (recette.allergenesIds || []) : [],
      notesConsultant: recette.notesConsultant || '',
      dressage: recette.dressage || '',
      conservation: recette.conservation || '',
      // Ingrédients : si opts.prix désactivé, on remet prixUnit à 0 sur chaque ingrédient
      ingredients: opts.ingredients
        ? (recette.ingredients || []).map(i => ({ ...i, prixUnit: opts.prix ? (i.prixUnit || 0) : 0 }))
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
        failures.push({ etabId, etabNom: targetEtab?.nom, reason: err?.message || 'erreur DB' });
      }
    }

    setSaving(false);

    if (successes.length > 0) {
      const list = successes.map(s => s.etabNom).filter(Boolean).join(', ');
      notifyLegacy(`✓ "${recette.nom}" dupliquée vers ${successes.length} établissement${successes.length > 1 ? 's' : ''} : ${list}`, 'success');
    }
    if (failures.length > 0) {
      const list = failures.map(f => `${f.etabNom} (${f.reason})`).join(' · ');
      notifyLegacy(`⚠ ${failures.length} duplication(s) non effectuée(s) : ${list}`, 'warning');
    }
    if (successes.length > 0) onClose();
  };

  return (
    <div className="modal-full-overlay" style={smStyle.overlay} onClick={() => !saving && onClose()}>
      <div className="modal-full" style={{ ...smStyle.modal, maxWidth: 640, width: '94vw' }} onClick={e => e.stopPropagation()}>
        <div style={smStyle.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>🔀 Dupliquer la recette vers…</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>« {recette.nom} »</div>
          </div>
          <button style={smStyle.closeBtn} onClick={() => !saving && onClose()}>✕</button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

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
                    style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' }}
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
                          border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          background: checked ? 'var(--accent-light)' : 'var(--surface)',
                        }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleEtab(e.id)} />
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.couleur || 'var(--accent)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nom}</span>
                        {hasExisting && <span title="Une recette du même nom existe déjà ici" style={{ fontSize: 10, color: 'var(--warning-text)', fontWeight: 700 }}>⚠ déjà présente</span>}
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
                    { key: 'prix', label: 'Food cost / prix', warn: 'Les prix varient par établissement' },
                    { key: 'allergenes', label: 'Allergènes & HACCP' },
                  ].map(o => (
                    <label key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!opts[o.key]}
                        onChange={e => setOpts(prev => ({ ...prev, [o.key]: e.target.checked }))} />
                      <span>
                        {o.label}
                        {o.warn && <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', lineHeight: 1.2 }}>{o.warn}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Gestion des doublons (si conflit détecté parmi les sélectionnés) ── */}
              {Array.from(selectedEtabIds).some(id => existingByEtab[id]) && (
                <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 8 }}>
                    ⚠ Cette recette existe déjà dans certains établissements sélectionnés
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

          {/* ── Footer ── */}
          <div style={smStyle.footer}>
            <span style={{ flex: 1, fontSize: 12, color: selectedEtabIds.size > 0 ? 'var(--text)' : 'var(--text2)' }}>
              {selectedEtabIds.size > 0
                ? <>Dupliquer vers <strong>{selectedEtabIds.size}</strong> établissement{selectedEtabIds.size > 1 ? 's' : ''}</>
                : 'Sélectionne au moins un établissement'}
            </span>
            <button style={smStyle.ghostBtn} onClick={() => !saving && onClose()} disabled={saving}>Annuler</button>
            <button
              style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', opacity: selectedEtabIds.size === 0 || saving ? 0.5 : 1 }}
              onClick={handleDuplicate}
              disabled={selectedEtabIds.size === 0 || saving}>
              {saving ? '⏳ Duplication…' : `🔀 Dupliquer (${selectedEtabIds.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── RecetteDetail : composant global (extrait hors de Recettes) ───
const RecetteDetail = ({ recette, user, etablissement, onBack }) => {
  const [portions, setPortions] = React.useState(recette.portions);
  const [showCalc, setShowCalc] = React.useState(false);
  const [showDuplicate, setShowDuplicate] = React.useState(false);
  const isMobile = useIsMobile();
  const ratio = portions / (recette.portions || 1);
  const coutAdj = (recette.ingredients || []).reduce((s,i) => s + (i.quantite||0) * ratio * (i.prixUnit||0), 0);

  // Qui peut dupliquer ? consultant + patron + responsable cuisine
  // (cuisinier/serveur cachés ; chef de production peut être un alias de resp_cuisine)
  const canDuplicate = ['consultant', 'patron', 'resp_cuisine'].includes(user?.role);

  // Données fiche pour l'export jsPDF natif (helper module buildRecettePdfData).
  // On reflète les portions affichées (quantités mises à l'échelle).
  const pdfOpts = { isConsultant: user?.role === 'consultant', portions };

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
  const ingCols = isMobile ? '1fr 54px 38px 62px' : '1fr 80px 60px 80px';
  const sIngName = { ...rs.ingName, ...(isMobile ? { fontSize: 15 } : null) };
  const sIngQty = { ...rs.ingQty, ...(isMobile ? { fontSize: 15 } : null) };

  return (
    <div style={rs.detailRoot}>
      {showCalc && <ScalingModal recette={recette} onClose={() => setShowCalc(false)}/>}
      {showDuplicate && (
        <DuplicateRecetteModal
          recette={recette}
          user={user}
          sourceEtab={etablissement}
          onClose={() => setShowDuplicate(false)}
        />
      )}
      <div style={{display:'flex',gap:8,marginBottom:16, flexWrap: 'wrap'}} className='no-print'>
        <button style={rs.backBtn} onClick={onBack}>← Retour</button>
        <button
          className="desktop-toolbar"
          style={{ ...rs.printBtn, background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)', color: 'var(--warning-text)' }}
          onClick={() => setShowCalc(true)}
        >Calculer</button>
        <button style={rs.printBtn} onClick={printRecipe}>Imprimer</button>
        <button style={rs.printBtn} onClick={exportRecipePdf}>Export PDF</button>
        {canDuplicate && (
          <button className="desktop-toolbar" style={rs.printBtn} onClick={() => setShowDuplicate(true)}>Dupliquer vers…</button>
        )}
      </div>
      <BottomActionBar
        actions={[
          { label: 'Calculer', icon: Calculator, onClick: () => setShowCalc(true) },
          canDuplicate ? { label: 'Dupliquer vers…', icon: Copy, onClick: () => setShowDuplicate(true) } : null,
        ].filter(Boolean)}
        primaryAction={{ label: 'Retour', icon: ArrowLeft, onClick: onBack }}
      />
      <div id='fiche-recette-print'>
      <div style={{...rs.detailHeader, ...(isMobile ? { flexDirection: 'column', alignItems: 'flex-start', gap: 12 } : null)}}>
        {recette.photoUrl && (
          <img src={recette.photoUrl} alt={recette.nom}
            style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
            onError={e => e.currentTarget.style.display = 'none'}/>
        )}
        <div style={rs.detailMeta}>
          <div style={rs.detailTitle}>{recette.nom}</div>
          <div style={rs.detailSub}>v{recette.version} · Modifié le {recette.modifie} · {recette.categorie}</div>
          {(recette.tempsPreparation != null || recette.tempsCuisson != null || recette.tempsTotal != null) && (
            <div style={{display:'flex', gap:14, marginTop:8, fontSize:12, color:'var(--text2)'}}>
              {recette.tempsPreparation != null && <span>⏱ Prépa : <strong style={{color:'var(--text)'}}>{recette.tempsPreparation} min</strong></span>}
              {recette.tempsCuisson != null && <span>🔥 Cuisson : <strong style={{color:'var(--text)'}}>{recette.tempsCuisson} min</strong></span>}
              {recette.tempsTotal != null && <span>⏳ Total : <strong style={{color:'var(--accent)'}}>{recette.tempsTotal} min</strong></span>}
            </div>
          )}
        </div>
        <div style={rs.detailBadges}>
          <span style={{...rs.badge, background:'#dcfce7', color:'#15803d'}}>{recette.statut}</span>
          {recette.foodCost && <span style={{...rs.badge, background: recette.foodCost < 30 ? '#dcfce7' : recette.foodCost < 35 ? '#fef9c3' : '#fee2e2', color: recette.foodCost < 30 ? '#15803d' : recette.foodCost < 35 ? '#92400e' : '#dc2626'}}>FC {recette.foodCost.toFixed(1)}%</span>}
        </div>
      </div>

      <div style={{...rs.detailGrid, gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr'}}>
        <div style={rs.detailCard}>
          <div style={rs.cardHeader}>
            <span style={rs.cardTitle}>Ingrédients</span>
            <div style={rs.portionsCtrl}>
              <span style={{fontSize:12, color:'var(--text2)'}}>Portions :</span>
              <button style={rs.portBtn} onClick={() => setPortions(p => Math.max(1, p-1))}>−</button>
              <span style={{fontWeight:700, fontSize:15, minWidth:24, textAlign:'center'}}>{portions}</span>
              <button style={rs.portBtn} onClick={() => setPortions(p => p+1)}>+</button>
              {ratio !== 1 && <span style={{fontSize:11, color:'var(--accent)', fontWeight:600}}>×{ratio.toFixed(2)}</span>}
            </div>
          </div>
          <div style={rs.ingTable}>
            <div style={{...rs.ingHead, gridTemplateColumns: ingCols}}><span>Ingrédient</span><span>Quantité</span><span>Unité</span>{user.role === 'consultant' && <span>Coût</span>}</div>
            {(recette.ingredients || []).map(i => (
              <div key={i.id} style={{...rs.ingRow, gridTemplateColumns: ingCols}}>
                <span style={sIngName}>{i.nom}</span>
                <span style={sIngQty}>{((i.quantite||0) * ratio % 1 === 0 ? ((i.quantite||0) * ratio).toFixed(0) : ((i.quantite||0) * ratio).toFixed(1))}</span>
                <span style={{fontSize: isMobile ? 14 : 13, color:'var(--text2)'}}>{i.unite}</span>
                {user.role === 'consultant' && <span style={{fontSize:12, color:'var(--text2)'}}>CHF {((i.quantite||0) * ratio * (i.prixUnit||0)).toFixed(2)}</span>}
              </div>
            ))}
            {user.role === 'consultant' && (
              <div style={{...rs.ingRow, gridTemplateColumns: ingCols, background:'var(--bg)', fontWeight:700}}>
                <span>Total pour {portions} portions</span><span></span><span></span>
                <span style={{color:'var(--accent)'}}>CHF {coutAdj.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          {user.role === 'consultant' && (
            <div style={rs.detailCard} className='no-print'>
              <div style={rs.cardHeader}><span style={rs.cardTitle}>Analyse économique</span></div>
              <div style={rs.kpiGrid}>
                <div style={rs.kpiItem}><span style={rs.kpiLabel}>Coût matière / portion</span><strong style={{color:'var(--accent)'}}>CHF {portions > 0 ? (coutAdj/portions).toFixed(2) : '-'}</strong></div>
                <div style={rs.kpiItem}><span style={rs.kpiLabel}>Prix de vente</span><strong>CHF {(recette.prixVente || 0).toFixed(2)}</strong></div>
                <div style={rs.kpiItem}><span style={rs.kpiLabel}>Food cost %</span><strong style={{color: recette.foodCost == null ? 'var(--text2)' : recette.foodCost < 30 ? '#16a34a' : recette.foodCost < 35 ? '#d97706' : '#dc2626'}}>{recette.foodCost != null ? recette.foodCost.toFixed(1) + ' %' : '-'}</strong></div>
                <div style={rs.kpiItem}><span style={rs.kpiLabel}>Marge brute</span><strong>CHF {((recette.prixVente || 0) - (portions > 0 ? coutAdj/portions : 0)).toFixed(2)}</strong></div>
              </div>
            </div>
          )}
          <div style={rs.detailCard}>
            <div style={rs.cardHeader}><span style={rs.cardTitle}>Allergènes</span></div>
            <div style={{padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:6}}>
              {(recette.allergenesIds || []).map(a => (
                <span key={a} style={{...rs.badge, background:'#fef3c7', color:'#92400e'}}>{ALLERGENES_MAP[a] || a}</span>
              ))}
            </div>
          </div>
          {recette.notesConsultant && (
            <div style={{...rs.detailCard, borderLeft:'3px solid var(--accent)'}}>
              <div style={rs.cardHeader}><span style={rs.cardTitle}>✦ Notes consultant</span></div>
              <div style={{padding:'12px 16px', fontSize:13, color:'var(--text)', lineHeight:1.6}}>{recette.notesConsultant}</div>
            </div>
          )}
        </div>

        <div style={{...rs.detailCard, gridColumn:'1/-1'}}>
          <div style={rs.cardHeader}><span style={rs.cardTitle}>Préparation</span></div>
          <div style={{padding:'16px'}}>
            {(recette.etapes || []).map((e,i) => (
              <div key={i} style={rs.etapeRow}>
                <div style={rs.etapeNum}>{i+1}</div>
                <div style={{...rs.etapeTxt, ...(isMobile ? { fontSize: 15 } : null)}}>{e}</div>
              </div>
            ))}
          </div>
        </div>

        {recette.dressage && (
          <div style={rs.detailCard}>
            <div style={rs.cardHeader}><span style={rs.cardTitle}>Dressage</span></div>
            <div style={{padding:'12px 16px', fontSize:13, color:'var(--text)', lineHeight:1.6}}>{recette.dressage}</div>
          </div>
        )}
        {recette.conservation && (
          <div style={rs.detailCard}>
            <div style={rs.cardHeader}><span style={rs.cardTitle}>Conservation</span></div>
            <div style={{padding:'12px 16px', fontSize:13, color:'var(--text)', lineHeight:1.6}}>{recette.conservation}</div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

// ─── Export multiple : choisir un plat (→ toutes ses recettes associées) ou des recettes ───
const ExportMultipleModal = ({ plats, recettes, user, etablissement, onClose }) => {
  const [mode, setMode] = React.useState('plat'); // 'plat' | 'recette'
  const [selPlats, setSelPlats] = React.useState(() => new Set());
  const [selRecettes, setSelRecettes] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);

  const recetteById = React.useMemo(() => {
    const m = new Map();
    (recettes || []).forEach(r => m.set(r.id, r));
    return m;
  }, [recettes]);

  const platsList = (plats || []).filter(p => p.actif !== false);

  const resolvePlatRecettes = (plat) =>
    (plat.recettes || [])
      .slice()
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
      .map(pr => recetteById.get(pr.recetteId))
      .filter(Boolean);

  const toggle = (set, setSet, id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  };

  // Recettes résultantes (dédupliquées, ordre conservé)
  const selectedRecettes = (() => {
    if (mode === 'recette') return (recettes || []).filter(r => selRecettes.has(r.id));
    const seen = new Set();
    const out = [];
    platsList.filter(p => selPlats.has(p.id)).forEach(p =>
      resolvePlatRecettes(p).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } })
    );
    return out;
  })();

  const count = selectedRecettes.length;

  const handleExport = async () => {
    if (!count || busy) return;
    if (!pdfUtils?.exportRecettesPdf) { notifyLegacy('Export PDF indisponible pour le moment.', 'error'); return; }
    const isConsultant = user?.role === 'consultant';
    const data = selectedRecettes.map(r => buildRecettePdfData(r, { isConsultant }));

    let filename = 'Fiches_recettes.pdf';
    if (mode === 'plat') {
      const ps = platsList.filter(p => selPlats.has(p.id));
      filename = ps.length === 1 ? `Plat_${slug(ps[0].nom)}.pdf` : `Fiches_${ps.length}_plats.pdf`;
    } else {
      filename = count === 1 ? `Fiche_${slug(selectedRecettes[0].nom)}.pdf` : `Fiches_${count}_recettes.pdf`;
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

  return (
    <div className="modal-sheet-overlay" style={smStyle.overlay} onClick={onClose}>
      <div className="modal-sheet" style={smStyle.modal} onClick={e => e.stopPropagation()}>
        <div style={smStyle.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>⤓ Export multiple</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Une fiche par page A4, dans un seul PDF</div>
          </div>
          <button style={smStyle.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={ms.modeRow}>
          <button style={{ ...ms.modeBtn, ...(mode === 'plat' ? ms.modeActive : {}) }} onClick={() => setMode('plat')}>Par plat</button>
          <button style={{ ...ms.modeBtn, ...(mode === 'recette' ? ms.modeActive : {}) }} onClick={() => setMode('recette')}>Par recette</button>
        </div>
        <div style={ms.hint}>
          {mode === 'plat'
            ? 'Coche un ou plusieurs plats : toutes leurs recettes associées seront exportées.'
            : 'Coche une ou plusieurs recettes à exporter.'}
        </div>

        <div style={ms.list}>
          {mode === 'plat' ? (
            platsList.length === 0
              ? <div style={ms.empty}>Aucun plat disponible.</div>
              : platsList.map(p => {
                  const n = resolvePlatRecettes(p).length;
                  return (
                    <label key={p.id} style={{ ...ms.row, ...(n === 0 ? ms.rowDisabled : {}) }}>
                      <input type="checkbox" checked={selPlats.has(p.id)} disabled={n === 0} onChange={() => toggle(selPlats, setSelPlats, p.id)} />
                      <span style={ms.rowName}>{p.nom}</span>
                      <span style={ms.rowMeta}>{n} recette{n > 1 ? 's' : ''}</span>
                    </label>
                  );
                })
          ) : (
            (recettes || []).length === 0
              ? <div style={ms.empty}>Aucune recette disponible.</div>
              : (recettes || []).map(r => (
                  <label key={r.id} style={ms.row}>
                    <input type="checkbox" checked={selRecettes.has(r.id)} onChange={() => toggle(selRecettes, setSelRecettes, r.id)} />
                    <span style={ms.rowName}>{r.nom}</span>
                    <span style={ms.rowMeta}>{r.categorie}</span>
                  </label>
                ))
          )}
        </div>

        <div style={ms.footer}>
          <span style={ms.count}>{count} fiche{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={ms.btnGhost} onClick={onClose}>Annuler</button>
            <button style={{ ...ms.btnPrimary, ...((count === 0 || busy) ? ms.btnDisabled : {}) }} onClick={handleExport} disabled={count === 0 || busy}>
              {busy ? 'Génération…' : `Exporter le PDF${count ? ` (${count})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ms = {
  modeRow: { display: 'flex', gap: 8, padding: '14px 20px 0' },
  modeBtn: { flex: 1, padding: '8px 0', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  modeActive: { background: 'var(--nav)', color: '#fff', borderColor: 'var(--nav)' },
  hint: { padding: '10px 20px 6px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
  list: { flex: 1, overflowY: 'auto', padding: '4px 12px', margin: '0 8px', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 120 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  rowDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  rowName: { flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 },
  rowMeta: { fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' },
  empty: { padding: '24px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' },
  footer: { padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  count: { fontSize: 12, color: 'var(--text2)', fontWeight: 600 },
  btnGhost: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
};

const Recettes = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [activeTab, setActiveTab] = React.useState('carte');
  const [selectedRecette, setSelectedRecette] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('Tous');
  const perms = demoData.permissions[user.role] || {};

  // Chargement Supabase + Realtime (fallback localStorage si pas configuré)
  const [recettes, setRecettes] = React.useState([]);
  const [cartes, setCartes] = React.useState([]);
  const [plats, setPlats] = React.useState([]);
  const [expandedPlats, setExpandedPlats] = React.useState(new Set());
  const [showExportModal, setShowExportModal] = React.useState(false);

  React.useEffect(() => {
    if (!legacySB) {
      setRecettes(readLegacyStorage('sc_recettes', demoData.recettes));
      setCartes(readLegacyStorage('sc_cartes', demoData.cartes));
      return;
    }
    let unsubRec = null, unsubCart = null, unsubPlats = null, unsubPR = null, mounted = true;

    (async () => {
      try {
        const [recs, crts, pls] = await Promise.all([
          legacySB.db.listRecettes(etabId),
          legacySB.db.listCartes(etabId),
          legacySB.db.listPlats(etabId),
        ]);
        if (!mounted) return;
        setRecettes(recs);
        setCartes(crts);
        setPlats(pls);
      } catch (err) { console.error('[Recettes load]', err); }
    })();

    const refreshRec = async () => {
      try { const r = await legacySB.db.listRecettes(etabId); if (mounted) setRecettes(r); } catch(e) {}
    };
    const refreshCart = async () => {
      try { const c = await legacySB.db.listCartes(etabId); if (mounted) setCartes(c); } catch(e) {}
    };
    const refreshPlats = async () => {
      try { const p = await legacySB.db.listPlats(etabId); if (mounted) setPlats(p); } catch(e) {}
    };
    unsubRec = legacySB.realtime.subscribeReload('recettes', refreshRec);
    unsubCart = legacySB.realtime.subscribeReload('cartes', refreshCart);
    unsubPlats = legacySB.realtime.subscribeReload('plats', refreshPlats);
    unsubPR = legacySB.realtime.subscribeReload('plat_recettes', refreshPlats);

    return () => {
      mounted = false;
      unsubRec && unsubRec();
      unsubCart && unsubCart();
      unsubPlats && unsubPlats();
      unsubPR && unsubPR();
    };
  }, [etabId]);

  const cats = ['Tous','Entrées','Plats','Desserts','Fromages'];

  // Filtrer par établissement courant (déjà filtré par Supabase mais on garde le filtre côté client pour le fallback)
  const recettesEtab = recettes.filter(r => (r.etablissementId || 'etab-1') === etabId);
  const cartesEtab = cartes.filter(c => (c.etablissementId || 'etab-1') === etabId);
  const carte = cartesEtab[0];

  // Plats : on utilise désormais la nouvelle table `plats` (M2M avec recettes)
  // Les plats sans recette rattachée s'affichent quand même sur la carte
  const filteredPlats = (plats || []).filter(p =>
    p.actif !== false &&
    (catFilter === 'Tous' || p.categorie === catFilter) &&
    (search === '' || p.nom.toLowerCase().includes(search.toLowerCase()))
  );

  if (selectedRecette) return <RecetteDetail recette={selectedRecette} user={user} etablissement={etablissement} onBack={() => setSelectedRecette(null)}/>;

  return (
    <div style={rs.root}>
      {showExportModal && (
        <ExportMultipleModal
          plats={plats}
          recettes={recettesEtab}
          user={user}
          etablissement={etablissement}
          onClose={() => setShowExportModal(false)}
        />
      )}
      {/* Tabs */}
      <div style={rs.tabs}>
        {[{id:'carte',label:'Carte active'},{id:'recettes',label:'Bibliothèque recettes'}].map(t => (
          <button key={t.id} style={{...rs.tab, ...(activeTab===t.id?rs.tabActive:{})}} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
        <div style={{flex:1}}/>
        <input style={rs.search} placeholder="Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button style={rs.printBtn} onClick={() => setShowExportModal(true)} title="Exporter plusieurs fiches recette dans un seul PDF">⤓ Export multiple</button>
        {/* Le bouton "+ Nouveau plat" a été retiré : la création de plats passe par Outils consultant */}
      </div>

      {activeTab === 'carte' ? (
        plats.length === 0 ? (
          <div style={{padding:40, textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12}}>
            <div style={{fontSize:40, opacity:0.4}}>🍽</div>
            <div style={{fontSize:16, fontWeight:600, marginTop:10, fontFamily:'var(--font-serif)'}}>Aucun plat sur la carte</div>
            <div style={{fontSize:13, color:'var(--text2)', marginTop:8}}>Créez des plats depuis le module "Outils consultant". Ils apparaîtront ici.</div>
          </div>
        ) : (
        <div style={rs.carteWrap}>
          {/* Carte header */}
          <div style={rs.carteHeader}>
            <div>
              <div style={rs.carteName}>{carte?.nom || 'Carte ' + (etablissement?.nom || '')}</div>
              <div style={{fontSize:13, color:'var(--text2)'}}>
                {plats.length} plat{plats.length > 1 ? 's' : ''}
                {carte?.dateDebut && ` · Du ${carte.dateDebut} au ${carte.dateFin}`}
              </div>
            </div>
            <span style={{...rs.badge, background:'#dcfce7', color:'#15803d', padding:'6px 16px', fontSize:12}}>● Active</span>
          </div>

          {/* Cat filter */}
          <div style={rs.catFilter}>
            {cats.map(c => <button key={c} style={{...rs.catBtn, ...(catFilter===c?rs.catActive:{})}} onClick={()=>setCatFilter(c)}>{c}</button>)}
          </div>

          {/* Plats by category */}
          {cats.filter(c => c !== 'Tous').map(cat => {
            const platsCat = filteredPlats.filter(p => p.categorie === cat);
            if (!platsCat.length) return null;
            return (
              <div key={cat} style={rs.catSection}>
                <div style={rs.catTitle}>{cat}</div>
                <div style={rs.platGrid}>
                  {platsCat.map(plat => {
                    // Recettes rattachées au plat
                    const recettesIds = (plat.recettes || []).map(pr => pr.recetteId);
                    const recettesPlat = recettesEtab.filter(r => recettesIds.includes(r.id));
                    // Food cost agrégé = somme des coûts par portion de toutes les recettes
                    const coutTotalParPortion = recettesPlat.reduce((s, r) => s + (r.coutPortion || 0), 0);
                    // Allergènes consolidés depuis toutes les recettes liées
                    const allergsSet = new Set();
                    recettesPlat.forEach(r => (r.allergenesIds || []).forEach(a => allergsSet.add(a)));
                    const allergsList = [...allergsSet];
                    const fcAgg = (plat.prixVente && coutTotalParPortion > 0) ? (coutTotalParPortion / plat.prixVente * 100) : null;

                    return (
                      <div key={plat.id} style={rs.platCard}>
                        <div style={rs.platImgZone}>
                          {plat.photoUrl ? (
                            <img src={plat.photoUrl} alt={plat.nom}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => e.currentTarget.style.display = 'none'}/>
                          ) : (
                            <div style={rs.platImgPlaceholder}>
                              <span style={{fontSize: 32, opacity: 0.4}}>🍽</span>
                            </div>
                          )}
                        </div>
                        <div style={rs.platBody}>
                          <div style={rs.platCardName}>{plat.nom}</div>
                          {plat.description && (
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>
                              {plat.description}
                            </div>
                          )}
                          <div style={rs.platAllergenes}>
                            {allergsList.map(a => <span key={a} style={rs.allergeneDot} title={ALLERGENES_MAP[a]||a}>{(ALLERGENES_MAP[a]||a).slice(0,2)}</span>)}
                          </div>
                          <div style={rs.platFooter}>
                            <div style={rs.platPrix}>
                              {plat.prixVente != null ? `CHF ${plat.prixVente.toFixed(2)}` : '-'}
                            </div>
                            {recettesPlat.length > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                                {recettesPlat.length} recette{recettesPlat.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                          {recettesPlat.length > 0 && (
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                              {recettesPlat.map(r => (
                                <button
                                  key={r.id}
                                  style={{ ...rs.recetteLink, display: 'block', textAlign: 'left', marginBottom: 4, width: '100%' }}
                                  onClick={() => setSelectedRecette(r)}
                                >
                                  → {r.nom}
                                  {user.role === 'consultant' && r.coutPortion != null && (
                                    <span style={{ float: 'right', fontSize: 10, color: 'var(--text2)' }}>
                                      CHF {r.coutPortion.toFixed(2)}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                          {user.role === 'consultant' && fcAgg != null && (
                            <div style={rs.fcLine}>
                              Food cost agrégé : <strong style={{color: fcAgg < 30 ? '#15803d' : fcAgg < 35 ? '#d97706' : '#dc2626'}}>{fcAgg.toFixed(1)}%</strong>
                              <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 6 }}>(coût matière {coutTotalParPortion.toFixed(2)} / vente {plat.prixVente?.toFixed(2)})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        <div style={rs.recettesWrap}>
          {recettesEtab.length === 0 && plats.length === 0 && (
            <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize:13}}>Aucune recette pour cet établissement. Créez-en depuis "Outils consultant".</div>
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
              !allLinkedRecetteIds.has(r.id) && (search === '' || r.nom.toLowerCase().includes(search.toLowerCase()))
            );
            const visiblePlats = (plats || []).filter(p =>
              search === '' ||
              p.nom.toLowerCase().includes(search.toLowerCase()) ||
              recettesParPlat[p.id]?.some(r => r.nom.toLowerCase().includes(search.toLowerCase()))
            );

            const renderRecetteCard = (r, isSubItem = false) => (
              <div key={r.id + (isSubItem ? '-sub' : '')}
                style={{...rs.recetteRow, marginLeft: isSubItem ? 30 : 0, borderLeft: isSubItem ? '3px solid var(--border)' : 'none'}}
                onClick={() => setSelectedRecette(r)}>
                {r.photoUrl ? (
                  <img src={r.photoUrl} alt={r.nom} style={rs.thumb} onError={e => e.currentTarget.style.display = 'none'}/>
                ) : (
                  <div style={rs.thumbPlaceholder}>📖</div>
                )}
                <div style={rs.recetteInfo}>
                  <div style={rs.recetteName}>{isSubItem && '↳ '}{r.nom}</div>
                  <div style={rs.recetteMeta}>{r.categorie} · {r.portions} portions · v{r.version} · modifié {r.modifie}</div>
                </div>
                <div style={rs.recetteBadges}>
                  {(r.allergenesIds||[]).map(a => <span key={a} style={rs.allergeneDot} title={ALLERGENES_MAP[a]||a}>{(ALLERGENES_MAP[a]||a).slice(0,2)}</span>)}
                </div>
                {user.role === 'consultant' && (
                  <div style={rs.recetteKpis}>
                    <div style={rs.recetteKpi}><span>Coût/portion</span><strong>CHF {(r.coutPortion != null ? r.coutPortion : 0).toFixed(2)}</strong></div>
                    <div style={rs.recetteKpi}><span>Food cost</span><strong style={{color: r.foodCost == null ? 'var(--text2)' : r.foodCost < 30 ? '#16a34a' : r.foodCost < 35 ? '#d97706' : '#dc2626'}}>{r.foodCost != null ? r.foodCost.toFixed(1) + '%' : '-'}</strong></div>
                  </div>
                )}
                <span style={{...rs.badge, background:'#dcfce7', color:'#15803d'}}>{r.statut}</span>
                <span style={{color:'var(--text2)', fontSize:18}}>›</span>
              </div>
            );

            return (
              <>
                {visiblePlats.map(plat => {
                  const platRecettes = recettesParPlat[plat.id] || [];
                  const isExpanded = expandedPlats.has(plat.id);
                  return (
                    <div key={plat.id}>
                      <div style={rs.platBlock}
                        onClick={() => {
                          const next = new Set(expandedPlats);
                          isExpanded ? next.delete(plat.id) : next.add(plat.id);
                          setExpandedPlats(next);
                        }}>
                        {plat.photoUrl ? (
                          <img src={plat.photoUrl} alt={plat.nom} style={rs.thumb} onError={e => e.currentTarget.style.display = 'none'}/>
                        ) : (
                          <div style={rs.thumbPlaceholder}>🍽</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={rs.platName}>
                            <span style={{ marginRight: 8, fontSize: 12, color: 'var(--text2)' }}>{isExpanded ? '▼' : '▶'}</span>
                            {plat.nom}
                          </div>
                          <div style={rs.recetteMeta}>
                            {plat.categorie}
                            {plat.prixVente != null && ` · CHF ${plat.prixVente.toFixed(2)}`}
                            {' · '}{platRecettes.length} recette{platRecettes.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      {isExpanded && platRecettes.map(r => renderRecetteCard(r, true))}
                      {isExpanded && platRecettes.length === 0 && (
                        <div style={{ padding: '8px 14px 8px 60px', fontSize: 11, color: 'var(--text2)', fontStyle: 'italic' }}>
                          Aucune recette rattachée à ce plat.
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ─── Recettes orphelines (non rattachées à un plat) ─── */}
                {orphelines.length > 0 && plats.length > 0 && (
                  <div style={rs.orphelinTitle}>Recettes sans plat ({orphelines.length})</div>
                )}
                {orphelines.map(r => renderRecetteCard(r, false))}
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
  tabs: {display:'flex',gap:4,alignItems:'center'},
  tab: {padding:'8px 18px',border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text2)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  tabActive: {background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  search: {padding:'8px 14px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',outline:'none',fontFamily:'var(--font)',width:180},
  addBtn: {padding:'8px 16px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  carteWrap: {display:'flex',flexDirection:'column',gap:20},
  carteHeader: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'18px 22px',display:'flex',alignItems:'center',justifyContent:'space-between'},
  carteName: {fontSize:18,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  catFilter: {display:'flex',gap:6},
  catBtn: {padding:'6px 16px',border:'1px solid var(--border)',borderRadius:20,background:'var(--surface)',color:'var(--text2)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  catActive: {background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  catSection: {display:'flex',flexDirection:'column',gap:12},
  catTitle: {fontSize:12,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.6,paddingLeft:2},
  platGrid: {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14},
  platCard: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'},
  platImgZone: {height:110,overflow:'hidden'},
  platImgPlaceholder: {height:'100%',background:'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)',display:'flex',alignItems:'center',justifyContent:'center'},
  platBody: {padding:'12px'},
  platCardName: {fontSize:13,fontWeight:700,color:'var(--text)',lineHeight:1.3,marginBottom:6},
  platAllergenes: {display:'flex',gap:4,marginBottom:8,flexWrap:'wrap'},
  allergeneDot: {fontSize:10,fontWeight:700,background:'#fef3c7',color:'#92400e',padding:'2px 5px',borderRadius:4},
  platFooter: {display:'flex',alignItems:'center',justifyContent:'space-between'},
  platPrix: {fontSize:16,fontWeight:700,color:'var(--text)',fontFamily:'var(--font-serif)'},
  recetteLink: {background:'none',border:'none',color:'var(--accent)',fontSize:11,fontWeight:600,cursor:'pointer',padding:0,fontFamily:'var(--font)'},
  printBtn:{padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'},
  fcLine: {fontSize:11,color:'var(--text2)',marginTop:6},
  badge: {display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:600},
  // Recettes list
  recettesWrap: {display:'flex',flexDirection:'column',gap:2,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'},
  recetteRow: {display:'flex',alignItems:'center',gap:14,padding:'14px 18px',borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'background .12s'},
  recetteInfo: {flex:1,minWidth:0},
  thumb: { width: 60, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)' },
  thumbPlaceholder: { width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 24, color: 'var(--text2)', flexShrink: 0 },
  platBlock: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: '#fefce8', cursor: 'pointer' },
  platName: { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center' },
  orphelinTitle: { padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' },
  recetteName: {fontSize:14,fontWeight:600,color:'var(--text)'},
  recetteMeta: {fontSize:11,color:'var(--text2)',marginTop:2},
  recetteBadges: {display:'flex',gap:4},
  recetteKpis: {display:'flex',gap:16},
  recetteKpi: {display:'flex',flexDirection:'column',gap:2,fontSize:12,color:'var(--text2)',textAlign:'right'},
  // Detail
  detailRoot: {display:'flex',flexDirection:'column',gap:18},
  detailHeader: {display:'flex',alignItems:'center',gap:16,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 20px'},
  backBtn: {background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'6px 12px',cursor:'pointer',fontSize:12,color:'var(--text2)',fontFamily:'var(--font)',flexShrink:0},
  detailMeta: {flex:1},
  detailTitle: {fontSize:20,fontWeight:700,color:'var(--text)',fontFamily:'var(--font-serif)'},
  detailSub: {fontSize:12,color:'var(--text2)',marginTop:3},
  detailBadges: {display:'flex',gap:6,flexShrink:0},
  detailGrid: {display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:16},
  detailCard: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'},
  cardHeader: {display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'var(--bg)'},
  cardTitle: {fontSize:12,fontWeight:700,color:'var(--text)',textTransform:'uppercase',letterSpacing:0.4},
  portionsCtrl: {display:'flex',alignItems:'center',gap:8},
  portBtn: {width:24,height:24,borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'},
  ingTable: {display:'flex',flexDirection:'column'},
  ingHead: {display:'grid',gridTemplateColumns:'1fr 80px 60px 80px',padding:'8px 16px',background:'var(--bg)',fontSize:10,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:8},
  ingRow: {display:'grid',gridTemplateColumns:'1fr 80px 60px 80px',padding:'9px 16px',borderBottom:'1px solid var(--border)',gap:8,alignItems:'center'},
  ingName: {fontSize:13,color:'var(--text)'},
  ingQty: {fontSize:13,fontWeight:600,color:'var(--text)'},
  kpiGrid: {display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,padding:'14px 16px'},
  kpiItem: {display:'flex',flexDirection:'column',gap:4},
  kpiLabel: {fontSize:11,color:'var(--text2)',fontWeight:500},
  etapeRow: {display:'flex',gap:14,marginBottom:12,alignItems:'flex-start'},
  etapeNum: {width:24,height:24,borderRadius:'50%',background:'var(--accent)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,marginTop:1},
  etapeTxt: {fontSize:13,color:'var(--text)',lineHeight:1.6},
};

export default Recettes;
