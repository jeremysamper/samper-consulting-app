import React from 'react';
import { dbService } from '../../services/dbService.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { s, formatDateService, formatFaitAt } from './MiseEnPlace.styles.js';

// Detail d'une liste : deux sections (Urgent non congelable en premier, puis
// Grosse production congelable), case a cocher en temps reel, barre d'avancement
// par section, export PDF imprimable.
const MepDetail = ({ listeId, listeMeta, user, etablissement, canEdit, onBack, onEdit, onDelete }) => {
  const legacySB = dbService.getBridge();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState(null);

  const reload = React.useCallback(async () => {
    if (!legacySB || !listeId) { setLoading(false); return; }
    try {
      const rows = await legacySB.db.listMepItems(listeId);
      setItems(rows || []);
    } catch (err) {
      console.error('[MEP listMepItems]', err);
    } finally {
      setLoading(false);
    }
  }, [legacySB, listeId]);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    reload();
    let unsub = null;
    if (legacySB) {
      unsub = legacySB.realtime.subscribeReload(['mep_items'], () => { if (mounted) reload(); });
    }
    return () => { mounted = false; unsub && unsub(); };
  }, [reload, legacySB]);

  // Tri : congelable === true -> grosse production ; false OU null -> urgent.
  const urgent = items.filter(i => i.congelable !== true);
  const grosse = items.filter(i => i.congelable === true);

  const toggleFait = async (item) => {
    if (!canEdit) return;
    setBusyId(item.id);
    // Optimiste : on reflete tout de suite, on recale si erreur.
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, fait: !i.fait } : i));
    try {
      await legacySB.db.setMepItemFait(item.id, !item.fait, user?.id || null);
    } catch (err) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, fait: item.fait } : i));
      notifyLegacy('Erreur : ' + (err?.message || 'mise à jour impossible'), 'error');
    }
    setBusyId(null);
  };

  const supprimerItem = async (item) => {
    if (!canEdit) return;
    if (!window.confirm(`Retirer « ${item.label} » de la liste ?`)) return;
    setItems(prev => prev.filter(i => i.id !== item.id));
    try {
      await legacySB.db.deleteMepItem(item.id);
    } catch (err) {
      notifyLegacy('Erreur : ' + (err?.message || 'suppression impossible'), 'error');
      reload();
    }
  };

  const exportPdf = () => {
    const toPdfItem = (i) => ({
      label: i.label || '',
      qtyText: i.quantite != null && i.quantite !== '' ? `${i.quantite}${i.unite ? ' ' + i.unite : ''}` : '',
      aQualifier: i.congelable == null,
      fait: i.fait === true,
    });
    const payload = {
      titre: listeMeta?.nom || 'Mise en place',
      sousTitre: formatDateService(listeMeta?.dateService),
      sections: [
        { titre: 'Urgent, non congelable', hint: 'À produire au plus près du service (J-1 / J-0)', items: urgent.map(toPdfItem) },
        { titre: 'Grosse production, congelable', hint: 'À batcher en avance les jours calmes', items: grosse.map(toPdfItem) },
      ],
    };
    pdfUtils.exportMepPdf(payload, { etablissement, filename: `Mise_en_place_${(listeMeta?.nom || 'liste').replace(/[^a-z0-9]+/gi, '_')}.pdf` });
  };

  const renderSection = (title, hint, list, variant) => {
    const total = list.length;
    const faits = list.filter(i => i.fait).length;
    const pct = total > 0 ? Math.round(faits / total * 100) : 0;
    return (
      <div style={{ ...s.section, ...(variant === 'urgent' ? s.sectionUrgent : s.sectionGrosse) }}>
        <div style={s.sectionHead}>
          <div style={s.sectionTitleRow}>
            <span style={s.sectionTitle}>{title}</span>
            <span style={s.progressLabel}>{faits} / {total}</span>
          </div>
          <div style={s.sectionHint}>{hint}</div>
          <div style={s.progressTrack}><div style={{ ...s.progressFill, width: `${pct}%` }} /></div>
        </div>
        {total === 0 ? (
          <div style={{ padding: '16px', color: 'var(--text2)', fontSize: 13 }}>Aucune préparation dans cette section.</div>
        ) : (
          list.map(i => (
            <div key={i.id} style={s.itemRow}>
              <input
                type="checkbox"
                style={s.checkbox}
                checked={i.fait}
                disabled={!canEdit || busyId === i.id}
                onChange={() => toggleFait(i)}
              />
              <div style={s.itemBody}>
                <div style={{ ...s.itemLabel, ...(i.fait ? s.itemLabelDone : null) }}>{i.label}</div>
                <div style={s.itemMeta}>
                  {i.congelable == null && <span style={s.aQualifier}>à qualifier</span>}
                  {i.fait && i.faitAt && <span>fait le {formatFaitAt(i.faitAt)}</span>}
                </div>
              </div>
              {i.quantite != null && i.quantite !== '' && (
                <span style={s.qtyTag}>{i.quantite}{i.unite ? ` ${i.unite}` : ''}</span>
              )}
              {canEdit && <button style={s.itemDel} title="Retirer" onClick={() => supprimerItem(i)}>✕</button>}
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div style={s.root}>
      <div className="module-actions no-print" style={s.moduleActions}>
        <button style={s.backBtn} onClick={onBack}>← Retour</button>
        <button style={s.ghostBtn} onClick={exportPdf}>Export PDF</button>
        {canEdit && <button style={s.ghostBtn} onClick={onEdit}>Modifier</button>}
        {canEdit && <button style={s.dangerBtn} onClick={onDelete}>Supprimer</button>}
      </div>

      <div>
        <h2 style={s.title}>{listeMeta?.nom || 'Liste'}</h2>
        <div style={s.listeDate}>{formatDateService(listeMeta?.dateService)}</div>
      </div>

      {loading ? (
        <div style={s.empty}>Chargement des préparations…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {renderSection('Urgent, non congelable', 'À produire au plus près du service (J-1 / J-0).', urgent, 'urgent')}
          {renderSection('Grosse production, congelable', 'À batcher en avance les jours calmes.', grosse, 'grosse')}
        </div>
      )}
    </div>
  );
};

export default MepDetail;
