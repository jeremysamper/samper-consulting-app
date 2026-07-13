import React from 'react';
import { dbService } from '../../services/dbService.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { s } from './MiseEnPlace.styles.js';

let _tmpSeq = 0;
const tmpKey = () => `tmp-${Date.now()}-${_tmpSeq++}`;

// Editeur d'une liste de mise en place : selection de recettes de l'etablissement
// (recherche + multi-selection) AVEC ajouts manuels libres (label + quantite +
// congelable oui/non). Le flag congelable est copie de la recette a l'ajout et
// reste modifiable sur l'item.
const MepEditor = ({ liste, user, etablissement, onClose }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const isEdit = Boolean(liste?.id);

  const [nom, setNom] = React.useState(liste?.nom || '');
  const [dateService, setDateService] = React.useState(liste?.dateService ? String(liste.dateService).slice(0, 10) : '');
  const [recettes, setRecettes] = React.useState([]);
  const [items, setItems] = React.useState([]);        // { key, id?, recetteId|null, label, quantite, unite, congelable }
  const [removedIds, setRemovedIds] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [manual, setManual] = React.useState({ label: '', quantite: '', unite: '', congelable: false });
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  // Chargement des recettes de l'etab + (si edition) des items existants.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!legacySB) { setLoading(false); return; }
      try {
        const recs = await legacySB.db.listRecettes(etabId);
        if (mounted) setRecettes(recs || []);
        if (isEdit) {
          const existing = await legacySB.db.listMepItems(liste.id);
          if (mounted) {
            setItems((existing || []).map(i => ({
              key: i.id, id: i.id, recetteId: i.recetteId, label: i.label,
              quantite: i.quantite != null ? String(i.quantite) : '', unite: i.unite || '', congelable: i.congelable,
            })));
          }
        }
      } catch (err) {
        console.error('[MepEditor load]', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [legacySB, etabId, isEdit, liste?.id]);

  const selectedRecetteIds = new Set(items.filter(i => i.recetteId).map(i => i.recetteId));

  const toggleRecette = (rec) => {
    if (selectedRecetteIds.has(rec.id)) {
      // Deselection : retire l'item ; s'il existait en base, on le marque a supprimer.
      setItems(prev => {
        const target = prev.find(i => i.recetteId === rec.id);
        if (target?.id) setRemovedIds(r => [...r, target.id]);
        return prev.filter(i => i.recetteId !== rec.id);
      });
    } else {
      setItems(prev => [...prev, {
        key: tmpKey(), recetteId: rec.id, label: rec.nom,
        quantite: '', unite: '', congelable: rec.congelable ?? null,
      }]);
    }
  };

  const removeItem = (item) => {
    if (item.id) setRemovedIds(r => [...r, item.id]);
    setItems(prev => prev.filter(i => i.key !== item.key));
  };

  const patchItem = (key, patch) => setItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));

  const addManual = () => {
    const label = manual.label.trim();
    if (!label) { notifyLegacy('Donne un nom à la préparation manuelle.', 'warning'); return; }
    setItems(prev => [...prev, {
      key: tmpKey(), recetteId: null, label,
      quantite: manual.quantite, unite: manual.unite, congelable: manual.congelable,
    }]);
    setManual({ label: '', quantite: '', unite: '', congelable: false });
  };

  const save = async () => {
    if (!nom.trim()) { notifyLegacy('Donne un nom à la liste.', 'warning'); return; }
    if (!legacySB) { notifyLegacy('Base de données indisponible.', 'error'); return; }
    setSaving(true);
    try {
      const savedListe = await legacySB.db.upsertMepListe({
        id: liste?.id,
        etablissementId: etabId,
        nom: nom.trim(),
        dateService: dateService || null,
        createdBy: user?.id || null,
      });
      const listeId = savedListe?.id || liste?.id;
      for (const id of removedIds) {
        try { await legacySB.db.deleteMepItem(id); } catch (e) { console.error('[deleteMepItem]', e); }
      }
      let ordre = 0;
      for (const it of items) {
        await legacySB.db.upsertMepItem({
          id: it.id,
          listeId,
          recetteId: it.recetteId,
          label: it.label,
          quantite: it.quantite,
          unite: it.unite,
          congelable: it.congelable,
          ordre: ordre++,
        });
      }
      notifyLegacy(isEdit ? 'Liste mise à jour.' : 'Liste créée.', 'success');
      onClose();
    } catch (err) {
      console.error('[MepEditor save]', err);
      notifyLegacy('Erreur : ' + (err?.message || 'enregistrement impossible'), 'error');
      setSaving(false);
    }
  };

  const congChip = (val) => {
    if (val === true) return <span style={{ ...s.chipCong, ...s.chipGrosse }}>Congelable</span>;
    if (val === false) return <span style={{ ...s.chipCong, ...s.chipUrgent }}>Non congelable</span>;
    return <span style={{ ...s.chipCong, background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)' }}>À qualifier</span>;
  };

  const q = search.trim().toLowerCase();
  const recettesFiltered = (recettes || [])
    .filter(r => q === '' || (r.nom || '').toLowerCase().includes(q))
    .slice(0, 60);

  return (
    <div style={s.root}>
      <div className="module-actions" style={s.moduleActions}>
        <button style={s.backBtn} onClick={onClose}>← Retour</button>
      </div>
      <h2 style={s.title}>{isEdit ? 'Modifier la liste' : 'Nouvelle liste de mise en place'}</h2>

      {/* Meta */}
      <div style={s.editorCard}>
        <div style={s.formRow2}>
          <div style={s.field}>
            <label style={s.fieldLabel}>Nom de la liste</label>
            <input style={s.input} value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Production week-end" />
          </div>
          <div style={s.field}>
            <label style={s.fieldLabel}>Date de service</label>
            <input type="date" style={s.input} value={dateService} onChange={e => setDateService(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Selection courante */}
      <div style={s.editorCard}>
        <div style={s.fieldLabel}>Préparations de la liste ({items.length})</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Sélectionne des recettes ci-dessous ou ajoute une préparation manuelle.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(it => (
              <div key={it.key} style={s.selItem}>
                <span style={s.selName}>{it.label}{it.recetteId ? '' : ' (manuel)'}</span>
                <div style={s.toggleGroup}>
                  <button type="button" style={{ ...s.toggleBtn, ...(it.congelable === true ? s.toggleActive : null) }} onClick={() => patchItem(it.key, { congelable: true })}>Grosse</button>
                  <button type="button" style={{ ...s.toggleBtn, ...(it.congelable === false ? s.toggleActive : null) }} onClick={() => patchItem(it.key, { congelable: false })}>Urgent</button>
                </div>
                <input style={s.qtyInput} value={it.quantite} onChange={e => patchItem(it.key, { quantite: e.target.value })} placeholder="Qté" inputMode="decimal" />
                <input style={s.uniteInput} value={it.unite} onChange={e => patchItem(it.key, { unite: e.target.value })} placeholder="Unité" />
                <button type="button" style={s.itemDel} title="Retirer" onClick={() => removeItem(it)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ajout manuel */}
      <div style={s.editorCard}>
        <div style={s.fieldLabel}>Ajout manuel</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ ...s.field, flex: 2, minWidth: 160 }}>
            <input style={s.input} value={manual.label} onChange={e => setManual({ ...manual, label: e.target.value })} placeholder="Nom de la préparation" onKeyDown={e => { if (e.key === 'Enter') addManual(); }} />
          </div>
          <input style={s.qtyInput} value={manual.quantite} onChange={e => setManual({ ...manual, quantite: e.target.value })} placeholder="Qté" inputMode="decimal" />
          <input style={s.uniteInput} value={manual.unite} onChange={e => setManual({ ...manual, unite: e.target.value })} placeholder="Unité" />
          <div style={s.toggleGroup}>
            <button type="button" style={{ ...s.toggleBtn, ...(manual.congelable === true ? s.toggleActive : null) }} onClick={() => setManual({ ...manual, congelable: true })}>Grosse</button>
            <button type="button" style={{ ...s.toggleBtn, ...(manual.congelable === false ? s.toggleActive : null) }} onClick={() => setManual({ ...manual, congelable: false })}>Urgent</button>
          </div>
          <button type="button" style={s.addBtn} onClick={addManual}>Ajouter</button>
        </div>
      </div>

      {/* Recettes de l'etablissement */}
      <div style={s.editorCard}>
        <div style={s.fieldLabel}>Recettes de l'établissement</div>
        <input style={s.input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une recette…" />
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Chargement des recettes…</div>
        ) : recettesFiltered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Aucune recette pour cette recherche.</div>
        ) : (
          <div style={s.pickList}>
            {recettesFiltered.map(r => {
              const sel = selectedRecetteIds.has(r.id);
              return (
                <div key={r.id} style={{ ...s.pickRow, ...(sel ? s.pickRowSel : null) }} onClick={() => toggleRecette(r)}>
                  <input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} checked={sel} readOnly />
                  <span style={s.pickName}>{r.nom}</span>
                  {congChip(r.congelable ?? null)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={s.actionsRow}>
        <button style={s.ghostBtn} onClick={onClose} disabled={saving}>Annuler</button>
        <button style={s.addBtn} onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Créer la liste')}</button>
      </div>
    </div>
  );
};

export default MepEditor;
