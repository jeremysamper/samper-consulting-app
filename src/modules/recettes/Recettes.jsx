import React from 'react';
import { getDemoData, canManageModule } from '../../data/demoData.js';
import { notifyLegacy, readLegacyStorage } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { ALLERGENES_MAP, slug, buildRecettePdfData } from '../../utils/recettePdfData.js';
import { useCartes } from '../../hooks/useCartes.js';
import CarteTabBar from '../../components/cartes/CarteTabBar.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { categorieDuPlat, categoriesPresentes, platCatRank } from '../../utils/categoriesPlat.js';
import { normalizeSearch } from '../../utils/searchText.js';


// CARTES & RECETTES
// ALLERGENES_MAP, slug et buildRecettePdfData sont partagés avec le module
// Consultant via src/utils/recettePdfData.js (source unique de l'export fiche).

// ─── ScalingModal : modale de calculateur de quantités (portions OU grammage cible) ───
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
        <div style={{ ...smStyle.method, background: useGramMode ? 'var(--bg)' : 'var(--warning-bg-soft)' }}>
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
        <div style={{ ...smStyle.method, background: useGramMode ? 'var(--warning-bg-soft)' : 'var(--bg)' }}>
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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning-text)' }}>
              Facteur : × {ratio < 1 ? ratio.toFixed(3) : Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--warning-text)' }}>→ {finalPortions} portion{finalPortions > 1 ? 's' : ''}</div>
            <button
              style={{ marginLeft: 'auto', padding: '4px 10px', background: 'none', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}
              onClick={() => { setScalingPortions(''); setScalingTarget({ ingId: '', targetQty: '' }); }}
            >Réinitialiser</button>
          </div>
        )}

        {/* Tableau ingrédients */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <div style={smStyle.tableHead}>
            <span>Ingrédient</span>
            <span style={{ textAlign: 'right' }}>Base ({basePortions} p.)</span>
            <span style={{ textAlign: 'right', color: isScaled ? 'var(--warning-text)' : 'var(--text2)' }}>{isScaled ? 'Recalculé' : '-'}</span>
          </div>
          {ings.map((ing, idx) => {
            const qBase = Number(ing.quantite) || 0;
            const qCalc = qBase * ratio;
            const isTargetIng = useGramMode && ing.id === scalingTarget.ingId;
            return (
              <div key={ing.id || idx}
                style={{ ...smStyle.tableRow, background: isTargetIng ? 'var(--warning-bg)' : (idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)') }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: isTargetIng ? 700 : 500 }}>
                  {isTargetIng && '🎯 '}{ing.nom || '-'}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right' }}>{fmt(qBase, ing.unite)}</span>
                <span style={{ fontSize: 13, fontWeight: isScaled ? 700 : 400, color: isScaled ? 'var(--warning-text)' : 'var(--text2)', textAlign: 'right' }}>
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
  methodLabel: { fontSize: 11, fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  methodInputs: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  numInput: { width: 80, padding: '7px 10px', border: '2px solid var(--border)', borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text)' },
  select: { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', maxWidth: 240, cursor: 'pointer' },
  result: { padding: '10px 20px', background: 'var(--warning-bg)', borderBottom: '1px solid var(--warning-bd)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
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
      // Flag congélation : suit la recette source (null = à qualifier).
      congelable: recette.congelable ?? null,
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
                    // Chiffrage : consultant uniquement, le budget vit dans Outils
                    // consultant. Pour les autres rôles l'option reste à false, donc
                    // les prix ne sont pas copiés : c'est déjà le défaut historique.
                    ...(user?.role === 'consultant'
                      ? [{ key: 'prix', label: 'Food cost / prix', warn: 'Les prix varient par établissement' }]
                      : []),
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
      notifyLegacy('Erreur : ' + (err?.message || 'enregistrement impossible'), 'error');
    }
    setSavingCong(false);
  };

  // Qui peut dupliquer ? consultant + patron + responsable cuisine
  // (cuisinier/serveur cachés ; chef de production peut être un alias de resp_cuisine)
  const canDuplicate = ['consultant', 'patron', 'resp_cuisine'].includes(user?.role);

  // Données fiche pour l'export jsPDF natif (helper module buildRecettePdfData).
  // On reflète les portions affichées (quantités mises à l'échelle).
  // Pas de food cost : la fiche sortie d'ici est une fiche de production pour la
  // brigade. Le chiffrage reste dans Outils consultant, qui appelle le même
  // helper avec isConsultant.
  const pdfOpts = { portions };

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
  const ingCols = isMobile ? '1fr 54px 38px' : '1fr 80px 60px';
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
      <div className="module-actions no-print" style={{ marginBottom: 16 }}>
        <button style={rs.backBtn} onClick={onBack}>← Retour</button>
        <button
          style={{ ...rs.printBtn, background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)', color: 'var(--warning-text)' }}
          onClick={() => setShowCalc(true)}
        >Calculer</button>
        <button style={rs.printBtn} onClick={printRecipe}>Imprimer</button>
        <button style={rs.printBtn} onClick={exportRecipePdf}>Export PDF</button>
        {canDuplicate && (
          <button style={rs.printBtn} onClick={() => setShowDuplicate(true)}>Dupliquer vers…</button>
        )}
      </div>
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
          <span style={{...rs.badge, background:'var(--success-bg)', color:'var(--success-text)'}}>{recette.statut}</span>
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
            <div style={{...rs.ingHead, gridTemplateColumns: ingCols}}><span>Ingrédient</span><span>Quantité</span><span>Unité</span></div>
            {(recette.ingredients || []).map(i => (
              <div key={i.id} style={{...rs.ingRow, gridTemplateColumns: ingCols}}>
                <span style={sIngName}>{i.nom}</span>
                <span style={sIngQty}>{((i.quantite||0) * ratio % 1 === 0 ? ((i.quantite||0) * ratio).toFixed(0) : ((i.quantite||0) * ratio).toFixed(1))}</span>
                <span style={{fontSize: isMobile ? 14 : 13, color:'var(--text2)'}}>{i.unite}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <div style={rs.detailCard}>
            <div style={rs.cardHeader}><span style={rs.cardTitle}>Congélation</span></div>
            <div style={{padding:'12px 16px', display:'flex', flexDirection:'column', gap:10}}>
              <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                {congelable === true && <span style={{...rs.badge, background:'var(--success-bg)', color:'var(--success-text)'}}>Congelable · grosse production</span>}
                {congelable === false && <span style={{...rs.badge, background:'var(--warning-bg)', color:'var(--warning-text)'}}>Non congelable · urgent</span>}
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
          <div style={rs.detailCard}>
            <div style={rs.cardHeader}><span style={rs.cardTitle}>Allergènes</span></div>
            <div style={{padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:6}}>
              {(recette.allergenesIds || []).map(a => (
                <span key={a} style={{...rs.badge, background:'var(--warning-bg)', color:'var(--warning-text)'}}>{ALLERGENES_MAP[a] || a}</span>
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

  const q = normalizeSearch(query.trim());

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

  const cartesVisibles = (cartes || []).filter(c => q === '' || normalizeSearch(c.nom).includes(q));
  const platGroups = groupByCat(platsActifs
    .filter(p => q === '' || normalizeSearch(p.nom).includes(q))
    .slice()
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || (a.nom || '').localeCompare(b.nom || '')));
  const recetteGroups = groupByCat((recettes || [])
    .filter(r => q === '' || normalizeSearch(r.nom).includes(q))
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
    cartes: 'Coche une carte pour exporter toutes les fiches recette de ses plats, rangées par catégorie.',
    plats: 'Coche des plats : toutes leurs recettes associées seront exportées.',
    recettes: 'Coche des recettes individuelles. La sélection se cumule avec les onglets Cartes et Plats.',
  };

  return (
    <div className="modal-full-overlay" style={smStyle.overlay} onClick={() => !busy && onClose()}>
      <div className="modal-full" style={ms.modal} onClick={e => e.stopPropagation()}>

        {/* ── Zone fixe : titre, onglets, recherche ── */}
        <div style={ms.sticky}>
          <div style={ms.header}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>⤓ Export multiple</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Une fiche par page A4, dans un seul PDF</div>
            </div>
            <button style={smStyle.closeBtn} onClick={() => !busy && onClose()}>✕</button>
          </div>
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
                            {platsC.length} plat{platsC.length > 1 ? 's' : ''} · {nFiches} fiche{nFiches > 1 ? 's' : ''}
                          </span>
                        </label>
                        {platsC.length > 0 && (
                          <button type="button" className="mini" style={ms.expandBtn}
                            title={expanded ? 'Masquer le contenu' : 'Voir le contenu'}
                            onClick={() => toggleSet(setExpandedCartes, c.id)}>
                            {expanded ? '▼' : '▶'}
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
                        <span style={ms.groupCount}>· {items.length}</span>
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
                        <span style={ms.groupCount}>· {items.length}</span>
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
                  {recap} → <strong style={{ color: 'var(--text)' }}>{count} fiche{count > 1 ? 's' : ''}</strong>
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
      </div>
    </div>
  );
};

const ms = {
  // Le conteneur scrolle en bloc (pas de double zone de scroll) : l'en-tête
  // (titre + onglets + recherche) et le pied (récap + export) sont sticky pour
  // rester visibles pendant qu'on parcourt les listes.
  modal: { background: 'var(--surface)', borderRadius: 12, width: 720, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', overscrollBehavior: 'contain', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  sticky: { position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)', borderBottom: '1px solid var(--border)', borderRadius: '12px 12px 0 0' },
  header: { padding: '16px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  controls: { padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 },
  search: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  hint: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  list: { padding: '6px 14px 10px', display: 'flex', flexDirection: 'column', minHeight: 160 },
  groupHead: { display: 'flex', alignItems: 'center', gap: 6, padding: '14px 6px 6px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 },
  groupCount: { fontWeight: 600, color: 'var(--text3)' },
  groupAllBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: '2px 4px', textTransform: 'none', letterSpacing: 0, flexShrink: 0 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', marginBottom: 6, flexShrink: 0 },
  // Shorthand `border` complet (pas `borderColor`) : ms.row pose déjà le
  // shorthand, mélanger les deux fait retirer borderColor au re-render (warning React).
  rowChecked: { border: '1px solid var(--accent)', background: 'var(--accent-light)' },
  rowDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  rowMain: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' },
  rowName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' },
  rowMeta: { fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', flexShrink: 0 },
  tagInclus: { fontSize: 10, fontWeight: 700, background: 'var(--success-bg)', color: 'var(--success-text)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', flexShrink: 0 },
  expandBtn: { background: 'none', border: 'none', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', padding: '4px 6px', fontFamily: 'var(--font)', flexShrink: 0 },
  cartePreview: { margin: '-2px 0 8px 14px', padding: '6px 12px 8px', borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 },
  previewCat: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  previewLine: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
  empty: { padding: '28px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text2)' },
  footer: { position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  footerInfo: { flex: 1, minWidth: 160, fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  clearBtn: { background: 'none', border: 'none', color: 'var(--danger-strong)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: 0 },
  btnGhost: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
};

// ─── IngredientSearchModal : « où se trouve cet ingrédient / allergène ? » ───
// Cherche un terme (ex. « poivre », « gluten ») dans TOUTES les recettes de
// l'établissement et liste précisément lesquelles le contiennent (ingrédient
// matché + allergènes déclarés + plat(s) de rattachement).
const QUICK_ALLERGENES = ['Gluten', 'Lactose', 'Œufs', 'Fruits à coque', 'Arachides', 'Soja', 'Sésame', 'Moutarde'];

const IngredientSearchModal = ({ recettes, plats, onPick, onClose }) => {
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
    return (recettes || []).map(r => {
      const matchedIngs = (r.ingredients || []).filter(i => normalizeSearch(i.nom).includes(q));
      const matchedAllerg = (r.allergenesIds || []).filter(a => normalizeSearch(ALLERGENES_MAP[a] || a).includes(q));
      if (!matchedIngs.length && !matchedAllerg.length) return null;
      return { recette: r, matchedIngs, matchedAllerg };
    }).filter(Boolean);
  }, [q, recettes]);

  return (
    <div className="modal-sheet-overlay" style={smStyle.overlay} onClick={onClose}>
      <div className="modal-sheet" style={smStyle.modal} onClick={e => e.stopPropagation()}>
        <div style={smStyle.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>⚠ Recherche allergène / ingrédient</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Trouvez dans quelles recettes un produit apparaît</div>
          </div>
          <button style={smStyle.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '14px 20px 8px' }}>
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
              {results.map(({ recette, matchedIngs, matchedAllerg }) => {
                const inPlats = platsByRecette.get(recette.id) || [];
                return (
                  <button key={recette.id} style={is.row} onClick={() => { onPick(recette); onClose(); }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={is.rowName}>{recette.nom}</div>
                      <div style={is.rowMeta}>
                        {recette.categorie}
                        {inPlats.length > 0 && ` · ${inPlats.join(', ')}`}
                      </div>
                      <div style={is.matchRow}>
                        {matchedIngs.map(i => (
                          <span key={i.id} style={is.matchIng}>{i.nom}{i.quantite ? ` · ${i.quantite}${i.unite || ''}` : ''}</span>
                        ))}
                        {matchedAllerg.map(a => (
                          <span key={a} style={is.matchAllerg}>⚠ {ALLERGENES_MAP[a] || a}</span>
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
      </div>
    </div>
  );
};

const is = {
  input: { width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 99, background: 'var(--surface)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  results: { flex: 1, overflowY: 'auto', padding: '6px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 },
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
  matchIng: { fontSize: 11, fontWeight: 600, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-bd)', padding: '2px 7px', borderRadius: 99 },
  matchAllerg: { fontSize: 11, fontWeight: 600, background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)', padding: '2px 7px', borderRadius: 99 },
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
  const perms = demoData.permissions[user.role] || {};
  const canManageCartes = canManageModule(user.role, 'recettes');

  // Cartes (menus) de l'établissement - source unique partagée + realtime.
  const { cartes, archivedCartes, addCarte, renameCarte, archiveCarte, deleteCarte } = useCartes(etabId);

  // Chargement Supabase + Realtime (fallback localStorage si pas configuré)
  const [recettes, setRecettes] = React.useState([]);
  const [plats, setPlats] = React.useState([]);
  const [expandedPlats, setExpandedPlats] = React.useState(new Set());
  const [showExportModal, setShowExportModal] = React.useState(false);
  const [showIngredientSearch, setShowIngredientSearch] = React.useState(false);
  // Carte d'accueil = préférence utilisateur par établissement (user_settings,
  // synchro multi-device, cache hydraté au login → lecture instantanée).
  const [defaultCarteId, setDefaultCarteId] = React.useState(null);

  React.useEffect(() => {
    setDefaultCarteId(legacySB?.db?.getUserSettingSync?.('cartes_default:' + etabId, null) || null);
  }, [etabId]);

  const toggleDefaultCarte = async (carteId) => {
    const next = defaultCarteId === carteId ? null : carteId;
    setDefaultCarteId(next);
    try {
      await legacySB?.db?.setUserSetting?.('cartes_default:' + etabId, next);
      notifyLegacy(next ? '★ Carte d\'accueil enregistrée' : 'Carte d\'accueil retirée', 'success');
    } catch (e) { notifyLegacy('Erreur enregistrement : ' + (e.message || e), 'error'); }
  };

  React.useEffect(() => {
    if (!legacySB) {
      setRecettes(readLegacyStorage('sc_recettes', demoData.recettes));
      return;
    }
    let unsubRec = null, unsubPlats = null, unsubPR = null, unsubCP = null, mounted = true;

    (async () => {
      try {
        const [recs, pls] = await Promise.all([
          legacySB.db.listRecettes(etabId),
          legacySB.db.listPlats(etabId),
        ]);
        if (!mounted) return;
        setRecettes(recs);
        setPlats(pls);
      } catch (err) { console.error('[Recettes load]', err); }
    })();

    const refreshRec = async () => {
      try { const r = await legacySB.db.listRecettes(etabId); if (mounted) setRecettes(r); } catch(e) {}
    };
    const refreshPlats = async () => {
      try { const p = await legacySB.db.listPlats(etabId); if (mounted) setPlats(p); } catch(e) {}
    };
    unsubRec = legacySB.realtime.subscribeReload('recettes', refreshRec);
    unsubPlats = legacySB.realtime.subscribeReload('plats', refreshPlats);
    unsubPR = legacySB.realtime.subscribeReload('plat_recettes', refreshPlats);
    unsubCP = legacySB.realtime.subscribeReload('carte_plats', refreshPlats);

    return () => {
      mounted = false;
      unsubRec && unsubRec();
      unsubPlats && unsubPlats();
      unsubPR && unsubPR();
      unsubCP && unsubCP();
    };
  }, [etabId]);

  // Filtrer par établissement courant (déjà filtré par Supabase mais on garde le
  // filtre côté client pour le fallback). Les recettes archivées (statut géré
  // dans Outils consultant) sortent de la bibliothèque, des plats, des exports
  // et de la recherche allergènes.
  const recettesEtab = recettes.filter(r =>
    (r.etablissementId || 'etab-1') === etabId && r.statut !== 'archivée'
  );

  // Onglet carte actif (ou bibliothèque). On garde toujours un onglet valide.
  const isLibrary = activeTab === LIBRARY_TAB;
  const activeCarte = cartes.find(c => c.id === activeTab) || null;
  // Atterrissage : à l'ouverture (activeTab vide) ou si la carte courante a
  // disparu, on bascule sur la carte d'accueil définie par l'utilisateur, sinon
  // la 1re carte. Un choix explicite déjà valide (carte ou bibliothèque) est respecté.
  React.useEffect(() => {
    if (!cartes.length) return;
    if (activeTab === LIBRARY_TAB || cartes.some(c => c.id === activeTab)) return;
    const saved = legacySB?.db?.getUserSettingSync?.('cartes_default:' + etabId, null);
    setActiveTab(saved && cartes.some(c => c.id === saved) ? saved : cartes[0].id);
  }, [cartes, etabId]);

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
  // Recherche insensible aux accents, à la casse et aux espaces parasites
  // (« creme » trouve « Crème brûlée »).
  const q = normalizeSearch(search.trim());
  const filteredPlats = platsCarte.filter(p =>
    p.actif !== false &&
    (catFilterEff === 'Tous' || categorieDuPlat(p) === catFilterEff) &&
    (q === '' || normalizeSearch(p.nom).includes(q))
  );

  if (selectedRecette) return <RecetteDetail recette={selectedRecette} user={user} etablissement={etablissement} onBack={() => setSelectedRecette(null)}/>;

  return (
    <div style={rs.root}>
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
          plats={plats}
          onPick={(r) => setSelectedRecette(r)}
          onClose={() => setShowIngredientSearch(false)}
        />
      )}
      {/* Barre d'outils. Mobile : onglets en bande scrollable (1 ligne) + actions
          compactes (icônes) sur une 2e ligne → pas de pavé qui mange l'écran.
          Desktop : onglets + actions groupées à droite. */}
      <div style={rs.toolbar}>
        <div style={isMobile ? rs.tabsWrapMobile : rs.tabsWrap}>
          <CarteTabBar
            cartes={cartes}
            activeId={activeTab}
            onSelect={setActiveTab}
            extraTabs={[{ id: LIBRARY_TAB, label: 'Bibliothèque recettes' }]}
            canManage={canManageCartes}
            onAddCarte={addCarte}
            onRenameCarte={renameCarte}
            onDeleteCarte={deleteCarte}
            archivedCartes={archivedCartes}
            onArchiveCarte={archiveCarte}
            homeId={defaultCarteId}
          />
        </div>
        <div style={{ ...rs.toolbarActions, ...(isMobile ? rs.toolbarActionsMobile : {}) }} className="no-print">
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher un plat, une recette…" />
          {/* Toujours libellé + teinte "warning" (langage visuel allergènes de l'app) :
              en icône seule, la loupe 🔎 se confondait avec la loupe de recherche. */}
          <button style={{...rs.printBtn, background:'var(--warning-bg)', borderColor:'var(--warning-bd)', color:'var(--warning-text)', fontWeight:600}} onClick={() => setShowIngredientSearch(true)} title="Trouver dans quelles recettes un ingrédient ou allergène apparaît">⚠ Allergènes</button>
          <button style={rs.printBtn} onClick={() => setShowExportModal(true)} title="Exporter une carte entière, des plats ou des recettes dans un seul PDF">{isMobile ? '⤓' : '⤓ Export multiple'}</button>
        </div>
        {/* Le bouton "+ Nouveau plat" a été retiré : la création de plats passe par Outils consultant */}
      </div>

      {!isLibrary ? (
        !activeCarte ? (
          <div style={{padding:40, textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12}}>
            <div style={{fontSize:40, opacity:0.4}}>🍽</div>
            <div style={{fontSize:16, fontWeight:600, marginTop:10, fontFamily:'var(--font-serif)'}}>Aucune carte</div>
            <div style={{fontSize:13, color:'var(--text2)', marginTop:8}}>
              {canManageCartes ? 'Créez une carte avec le bouton « + Carte ».' : 'Aucune carte définie pour cet établissement.'}
            </div>
          </div>
        ) : platsCarte.length === 0 ? (
          <div style={{padding:40, textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12}}>
            <div style={{fontSize:40, opacity:0.4}}>🍽</div>
            <div style={{fontSize:16, fontWeight:600, marginTop:10, fontFamily:'var(--font-serif)'}}>Aucun plat sur « {activeCarte.nom} »</div>
            <div style={{fontSize:13, color:'var(--text2)', marginTop:8}}>Rattachez des plats à cette carte depuis le module "Outils consultant".</div>
          </div>
        ) : (
        <div style={rs.carteWrap}>
          {/* Carte header */}
          <div style={rs.carteHeader}>
            <div>
              <div style={rs.carteName}>{activeCarte.nom}</div>
              <div style={{fontSize:13, color:'var(--text2)'}}>
                {platsCarte.length} plat{platsCarte.length > 1 ? 's' : ''}
                {activeCarte.dateDebut && ` · Du ${activeCarte.dateDebut}${activeCarte.dateFin ? ` au ${activeCarte.dateFin}` : ''}`}
              </div>
            </div>
            <div style={rs.carteHeaderRight} className="no-print">
              {canManageCartes && (
                <button
                  style={{...rs.homeBtn, ...(defaultCarteId === activeCarte.id ? rs.homeBtnActive : {})}}
                  onClick={() => toggleDefaultCarte(activeCarte.id)}
                  title={defaultCarteId === activeCarte.id ? 'Carte d\'accueil - clic pour retirer' : 'Ouvrir cette carte par défaut à l\'arrivée sur le module'}
                >
                  {defaultCarteId === activeCarte.id
                    ? (isMobile ? '★ Accueil' : '★ Carte d\'accueil')
                    : (isMobile ? '☆ Par défaut' : '☆ Définir par défaut')}
                </button>
              )}
              <span style={{...rs.badge, background:'var(--success-bg)', color:'var(--success-text)', padding:'6px 16px', fontSize:12}}>● Active</span>
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

          {/* Plats by category */}
          {catsCarte.map(cat => {
            const platsCat = filteredPlats.filter(p => categorieDuPlat(p) === cat);
            if (!platsCat.length) return null;
            return (
              <div key={cat} style={rs.catSection}>
                <div style={rs.catTitle}>{cat}</div>
                <div style={rs.platGrid}>
                  {platsCat.map(plat => {
                    // Recettes rattachées au plat
                    const recettesIds = (plat.recettes || []).map(pr => pr.recetteId);
                    const recettesPlat = recettesEtab.filter(r => recettesIds.includes(r.id));
                    // Allergènes consolidés depuis toutes les recettes liées
                    const allergsSet = new Set();
                    recettesPlat.forEach(r => (r.allergenesIds || []).forEach(a => allergsSet.add(a)));
                    const allergsList = [...allergsSet];

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
                          {recettesPlat.length > 0 && (
                            <div style={rs.platFooter}>
                              <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                                {recettesPlat.length} recette{recettesPlat.length > 1 ? 's' : ''}
                              </div>
                            </div>
                          )}
                          {recettesPlat.length > 0 && (
                            <div style={rs.recetteLinkListe}>
                              {recettesPlat.map(r => (
                                <button
                                  key={r.id}
                                  style={rs.recetteLink}
                                  onClick={() => setSelectedRecette(r)}
                                >
                                  <span style={rs.recetteLinkNom}>{r.nom}</span>
                                </button>
                              ))}
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
            online
              ? <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize:13}}>Aucune recette pour cet établissement. Créez-en depuis "Outils consultant".</div>
              // Hors-ligne sans cache : état vide propre, pas de chargement infini.
              : <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize:13}}>Hors ligne : les recettes de cet établissement n'ont pas encore été chargées sur cet appareil. Elles s'afficheront au retour du réseau.</div>
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
              !allLinkedRecetteIds.has(r.id) && (q === '' || normalizeSearch(r.nom).includes(q))
            );
            const visiblePlats = (plats || []).filter(p =>
              q === '' ||
              normalizeSearch(p.nom).includes(q) ||
              recettesParPlat[p.id]?.some(r => normalizeSearch(r.nom).includes(q))
            );

            // La ligne reste un <div> plutôt qu'un <button> : la convertir
            // imposerait de neutraliser tous les styles par défaut du bouton et
            // ferait courir un risque de régression visuelle. On lui donne donc
            // le contrat d'accessibilité d'un bouton - rôle, focus au clavier,
            // activation par Entrée et Espace - sans toucher au rendu. Sans ça
            // la ligne était invisible au clavier et aux lecteurs d'écran.
            const activerRecette = (r) => setSelectedRecette(r);
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
                {r.photoUrl ? (
                  <img src={r.photoUrl} alt={r.nom} style={rs.thumb} onError={e => e.currentTarget.style.display = 'none'}/>
                ) : (
                  <div style={rs.thumbPlaceholder}>📖</div>
                )}
                <div style={rs.recetteInfo}>
                  <div style={rs.recetteName}>{r.nom}</div>
                  <div style={rs.recetteMeta}>{r.categorie} · {r.portions} portions · v{r.version} · modifié {r.modifie}</div>
                </div>
                {/* Pastilles d'allergènes plafonnées : une recette en cumulant 5
                    occupait 139px et écrasait le nom à 0px de large sur mobile.
                    Au-delà de 3, le surplus est résumé par un « +N » dont
                    l'infobulle liste les allergènes restants. */}
                <div style={rs.recetteBadges}>
                  {(r.allergenesIds||[]).slice(0, 3).map(a => <span key={a} style={rs.allergeneDot} title={ALLERGENES_MAP[a]||a}>{(ALLERGENES_MAP[a]||a).slice(0,2)}</span>)}
                  {(r.allergenesIds||[]).length > 3 && (
                    <span style={rs.allergeneDot} title={(r.allergenesIds||[]).slice(3).map(a => ALLERGENES_MAP[a]||a).join(', ')}>
                      +{(r.allergenesIds||[]).length - 3}
                    </span>
                  )}
                </div>
                <span style={{...rs.badge, background:'var(--success-bg)', color:'var(--success-text)'}}>{r.statut}</span>
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
                            {' · '}{platRecettes.length} recette{platRecettes.length > 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      {isExpanded && platRecettes.length > 0 && (
                        <div style={rs.sousListe}>
                          {platRecettes.map(r => renderRecetteCard(r, true))}
                        </div>
                      )}
                      {isExpanded && platRecettes.length === 0 && (
                        <div style={rs.sousListeVide}>
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
                {orphelines.length > 0 && (
                  <div style={rs.orphelinListe}>
                    {orphelines.map(r => renderRecetteCard(r, false))}
                  </div>
                )}
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
  toolbar: {display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'},
  tabsWrap: {minWidth:0},
  tabsWrapMobile: {width:'100%',minWidth:0},
  toolbarActions: {display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginLeft:'auto'},
  toolbarActionsMobile: {width:'100%',marginLeft:0},
  addBtn: {padding:'8px 16px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  carteWrap: {display:'flex',flexDirection:'column',gap:20},
  carteHeader: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'18px 22px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'},
  carteHeaderRight: {display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'},
  homeBtn: {padding:'6px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text2)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap'},
  homeBtnActive: {borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-light)'},
  carteName: {fontSize:18,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  catFilter: {display:'flex',gap:6,flexWrap:'wrap'},
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
  allergeneDot: {fontSize:10,fontWeight:700,background:'var(--warning-bg)',color:'var(--warning-text)',padding:'2px 5px',borderRadius:4},
  platFooter: {display:'flex',alignItems:'center',justifyContent:'space-between'},
  // ─── Recettes listées au pied d'une carte de plat ─────────────────────────
  // Mesuré sur iPad paysage (1024px) : c'étaient des liens texte de 11px sans
  // padding, soit 15px de haut séparés de 4px. Un doigt pose ~40px de contact :
  // il couvrait deux à trois lignes à la fois, d'où les ouvertures à côté.
  // La règle globale « min-height 44px » ne s'applique qu'en dessous de 768px,
  // donc elle ne protégeait justement pas la tablette en paysage.
  // Vraies lignes tactiles : 44px de haut, fond distinct, séparées de 6px.
  recetteLinkListe: {marginTop:8,paddingTop:8,borderTop:'1px dashed var(--border)',display:'flex',flexDirection:'column',gap:6},
  recetteLink: {display:'flex',alignItems:'center',gap:8,width:'100%',minHeight:44,padding:'8px 10px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,color:'var(--accent)',fontSize:12,fontWeight:600,textAlign:'left',cursor:'pointer',fontFamily:'var(--font)',transition:'background .12s'},
  recetteLinkNom: {flex:1,minWidth:0,lineHeight:1.3},
  printBtn:{padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'},
  badge: {display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:600},
  congBtn: {padding:'7px 14px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  congBtnActive: {background:'var(--accent)',borderColor:'var(--accent)',color:'#fff'},
  // Recettes list
  recettesWrap: {display:'flex',flexDirection:'column',gap:2,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'},
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
  thumb: { width: 60, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)' },
  thumbPlaceholder: { width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 24, color: 'var(--text2)', flexShrink: 0 },
  platBlock: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--warning-bg-soft)', cursor: 'pointer' },
  platName: { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center' },
  orphelinTitle: { padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--bg)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' },
  recetteName: {fontSize:14,fontWeight:600,color:'var(--text)'},
  recetteMeta: {fontSize:11,color:'var(--text2)',marginTop:2},
  recetteBadges: {display:'flex',gap:4,flexShrink:0},
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
  ingHead: {display:'grid',gridTemplateColumns:'1fr 80px 60px',padding:'8px 16px',background:'var(--bg)',fontSize:10,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:8},
  ingRow: {display:'grid',gridTemplateColumns:'1fr 80px 60px',padding:'9px 16px',borderBottom:'1px solid var(--border)',gap:8,alignItems:'center'},
  ingName: {fontSize:13,color:'var(--text)'},
  ingQty: {fontSize:13,fontWeight:600,color:'var(--text)'},
  etapeRow: {display:'flex',gap:14,marginBottom:12,alignItems:'flex-start'},
  etapeNum: {width:24,height:24,borderRadius:'50%',background:'var(--accent)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0,marginTop:1},
  etapeTxt: {fontSize:13,color:'var(--text)',lineHeight:1.6},
};

export default Recettes;
