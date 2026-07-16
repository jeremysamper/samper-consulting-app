import React from 'react';
import { dbService } from '../../services/dbService.js';
import { canManageModule } from '../../data/demoData.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import MepDetail from './MepDetail.jsx';
import MepEditor from './MepEditor.jsx';
import { s, formatDateService } from './MiseEnPlace.styles.js';

// MISE EN PLACE
// Listes de production separant la grosse production (congelable, batch en
// avance) des preparations urgentes (non congelable, J-1/J-0).
// Ecriture regie par le droit « gerer » du module mep (Roles & acces →
// Droits d'action) ; defaut resp_cuisine / cuisinier, consultant / patron = lecture.
const MiseEnPlace = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const canEdit = canManageModule(user?.role, 'mep');

  const [listes, setListes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [view, setView] = React.useState('list'); // 'list' | 'detail' | 'editor'
  const [activeId, setActiveId] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // liste en cours d'edition (null = nouvelle)

  const reload = React.useCallback(async () => {
    if (!legacySB) { setLoading(false); return; }
    try {
      const rows = await legacySB.db.listMepListes(etabId);
      setListes(rows || []);
    } catch (err) {
      console.error('[MEP listMepListes]', err);
    } finally {
      setLoading(false);
    }
  }, [legacySB, etabId]);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => { await reload(); if (!mounted) return; })();
    let unsub = null;
    if (legacySB) {
      unsub = legacySB.realtime.subscribeReload(['mep_listes', 'mep_items'], () => { if (mounted) reload(); });
    }
    return () => { mounted = false; unsub && unsub(); };
  }, [reload, legacySB]);

  const openDetail = (id) => { setActiveId(id); setView('detail'); };
  const openNew = () => { setEditing(null); setView('editor'); };
  const openEdit = (liste) => { setEditing(liste); setView('editor'); };
  const backToList = () => { setView('list'); setActiveId(null); setEditing(null); reload(); };

  const supprimerListe = async (liste) => {
    if (!canEdit) return;
    if (!window.confirm(`Supprimer la liste « ${liste.nom} » et toutes ses préparations ?`)) return;
    try {
      await legacySB.db.deleteMepListe(liste.id);
      notifyLegacy('Liste supprimée.', 'success');
      backToList();
    } catch (err) {
      notifyLegacy('Erreur : ' + (err?.message || 'suppression impossible'), 'error');
    }
  };

  if (view === 'detail') {
    const liste = listes.find(l => l.id === activeId);
    return (
      <MepDetail
        listeId={activeId}
        listeMeta={liste}
        user={user}
        etablissement={etablissement}
        canEdit={canEdit}
        onBack={backToList}
        onEdit={() => liste && openEdit(liste)}
        onDelete={() => liste && supprimerListe(liste)}
      />
    );
  }

  if (view === 'editor') {
    return (
      <MepEditor
        liste={editing}
        user={user}
        etablissement={etablissement}
        onClose={backToList}
      />
    );
  }

  // ─── Vue liste des listes ───
  const q = search.trim().toLowerCase();
  const filtered = (listes || []).filter(l => q === '' || (l.nom || '').toLowerCase().includes(q));

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div>
            <h2 style={s.title}>Mise en place</h2>
            <div style={s.sub}>Grosse production congelable et préparations urgentes non congelables</div>
          </div>
        </div>
        <div style={s.moduleActions} className="module-actions">
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher une liste…" />
          {canEdit && <button style={s.addBtn} onClick={openNew}>+ Nouvelle liste</button>}
        </div>
      </div>

      {loading ? (
        <div style={s.empty}>Chargement des listes…</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          {q ? 'Aucune liste pour cette recherche.' : 'Aucune liste de mise en place pour le moment.'}
          {canEdit && !q && <div style={{ marginTop: 12 }}><button style={s.addBtn} onClick={openNew}>+ Créer la première liste</button></div>}
        </div>
      ) : (
        <div style={s.cardsGrid}>
          {filtered.map(l => {
            const total = l.itemsCount || 0;
            const faits = l.itemsFaits || 0;
            const pct = total > 0 ? Math.round(faits / total * 100) : 0;
            return (
              <button key={l.id} style={s.listeCard} onClick={() => openDetail(l.id)}>
                <div style={s.listeNom}>{l.nom}</div>
                <div style={s.listeDate}>{formatDateService(l.dateService)}</div>
                <div>
                  <div style={s.progressTrack}><div style={{ ...s.progressFill, width: `${pct}%` }} /></div>
                  <div style={s.progressLabel}>{faits} / {total} préparation{total > 1 ? 's' : ''} faite{faits > 1 ? 's' : ''}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MiseEnPlace;
