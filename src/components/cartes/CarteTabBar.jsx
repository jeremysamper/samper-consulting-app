import React from 'react';
import { confirmLegacy } from '../../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// CarteTabBar - barre d'onglets « cartes » (menus) partagée par Cartes & Recettes
// et Fiches salle. Un onglet par carte + des onglets supplémentaires fournis par
// le parent (ex. « Bibliothèque recettes », « Toutes »).
//
// Si canManage : bouton « + Carte » et édition (renommer / dates / archiver /
// supprimer) de la carte active. Supprimer une carte ne retire que l'onglet et
// ses liaisons - aucun plat / recette / fiche n'est effacé. Archiver conserve
// tout (liaisons comprises) : la carte sort des onglets et se restaure depuis
// la modale « Archives ».
//
// Styles via tokens CSS (var(--surface/nav/border/text…)), aucune couleur en dur.
// ─────────────────────────────────────────────────────────────────────────────

export default function CarteTabBar({
  cartes = [],
  activeId,
  onSelect,
  extraTabs = [],
  canManage = false,
  onAddCarte,
  onRenameCarte,
  onDeleteCarte,
  // Optionnel : archivage. archivedCartes + onArchiveCarte(id, archived) activent
  // le bouton « Archiver » de la modale d'édition et la modale « Archives ».
  archivedCartes = [],
  onArchiveCarte,
  // Optionnel : id de la carte « d'accueil » → préfixe ★ sur l'onglet.
  // Additif : les autres usages (Fiches salle) ne passent rien → aucun marqueur.
  homeId = null,
}) {
  // modal: null | { mode: 'create' } | { mode: 'edit', carte }
  const [modal, setModal] = React.useState(null);
  const [form, setForm] = React.useState({ nom: '', dateDebut: '', dateFin: '' });
  const [showArchives, setShowArchives] = React.useState(false);

  const openCreate = () => { setForm({ nom: '', dateDebut: '', dateFin: '' }); setModal({ mode: 'create' }); };
  const openEdit = (carte) => {
    setForm({ nom: carte.nom || '', dateDebut: carte.dateDebut || '', dateFin: carte.dateFin || '' });
    setModal({ mode: 'edit', carte });
  };
  const close = () => setModal(null);

  const submit = async () => {
    const nom = form.nom.trim();
    if (!nom) return;
    if (modal.mode === 'create') {
      const created = await onAddCarte?.(nom);
      if (created?.id) onSelect?.(created.id);
    } else {
      await onRenameCarte?.(modal.carte.id, {
        nom,
        dateDebut: form.dateDebut || null,
        dateFin: form.dateFin || null,
      });
    }
    close();
  };

  const remove = async () => {
    if (modal?.mode !== 'edit') return;
    const carte = modal.carte;
    if (!confirmLegacy(`Supprimer la carte « ${carte.nom} » ?\n\nLes plats, recettes et fiches ne sont pas supprimés - ils ne seront simplement plus rattachés à cette carte.`)) return;
    await onDeleteCarte?.(carte.id);
    // Bascule vers une autre carte / le 1er onglet supplémentaire
    const fallback = cartes.find(c => c.id !== carte.id)?.id || extraTabs[0]?.id || null;
    if (activeId === carte.id && fallback) onSelect?.(fallback);
    close();
  };

  const archive = async () => {
    if (modal?.mode !== 'edit' || !onArchiveCarte) return;
    const carte = modal.carte;
    const ok = await onArchiveCarte(carte.id, true);
    if (ok === false) return; // écriture refusée : on garde l'onglet et la modale
    const fallback = cartes.find(c => c.id !== carte.id)?.id || extraTabs[0]?.id || null;
    if (activeId === carte.id && fallback) onSelect?.(fallback);
    close();
  };

  return (
    <div className="segmented-tabs no-print">
      {cartes.map(carte => {
        const active = activeId === carte.id;
        return (
          <div
            key={carte.id}
            role="button"
            className={'segmented-tab' + (active ? ' is-active' : '')}
            onClick={() => onSelect?.(carte.id)}
          >
            <span>{carte.id === homeId && '★ '}{carte.nom}</span>
            {canManage && active && (
              <button
                className="mini"
                style={s.editBtn}
                title="Modifier la carte"
                onClick={(e) => { e.stopPropagation(); openEdit(carte); }}
              >✎</button>
            )}
          </div>
        );
      })}

      {extraTabs.map(t => (
        <button
          key={t.id}
          className={'segmented-tab' + (activeId === t.id ? ' is-active' : '')}
          onClick={() => onSelect?.(t.id)}
        >{t.label}</button>
      ))}

      {canManage && (
        <button className="segmented-tab" style={s.addBtn} onClick={openCreate} title="Ajouter une carte">+ Carte</button>
      )}

      {canManage && onArchiveCarte && archivedCartes.length > 0 && (
        <button
          className="segmented-tab"
          style={s.archivesBtn}
          onClick={() => setShowArchives(true)}
          title="Cartes archivées - cliquer pour restaurer"
        >🗄 Archives ({archivedCartes.length})</button>
      )}

      {modal && (
        <div style={s.overlay} onClick={close}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>{modal.mode === 'create' ? 'Nouvelle carte' : 'Modifier la carte'}</div>
              <button style={s.closeBtn} onClick={close}>✕</button>
            </div>
            <div style={s.modalBody}>
              <label style={s.label}>Nom de la carte *</label>
              <input
                autoFocus
                style={s.input}
                value={form.nom}
                placeholder="Ex : Carte petit-déjeuner, Brunch, Menus spéciaux…"
                onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              />
              <div style={s.dateRow}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Début (optionnel)</label>
                  <input type="date" style={s.input} value={form.dateDebut || ''} onChange={e => setForm(f => ({ ...f, dateDebut: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>Fin (optionnel)</label>
                  <input type="date" style={s.input} value={form.dateFin || ''} onChange={e => setForm(f => ({ ...f, dateFin: e.target.value }))} />
                </div>
              </div>
            </div>
            <div style={s.modalFooter}>
              {modal.mode === 'edit' && (
                <button style={{ ...s.ghostBtn, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }} onClick={remove}>🗑 Supprimer</button>
              )}
              {modal.mode === 'edit' && onArchiveCarte && (
                <button
                  style={s.ghostBtn}
                  onClick={archive}
                  title="Retirer la carte des onglets sans rien supprimer (restaurable via Archives)"
                >🗄 Archiver</button>
              )}
              <div style={{ flex: 1 }} />
              <button style={s.ghostBtn} onClick={close}>Annuler</button>
              <button style={{ ...s.primaryBtn, opacity: form.nom.trim() ? 1 : 0.5 }} onClick={submit} disabled={!form.nom.trim()}>
                {modal.mode === 'create' ? 'Créer la carte' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchives && (
        <div style={s.overlay} onClick={() => setShowArchives(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Cartes archivées</div>
              <button style={s.closeBtn} onClick={() => setShowArchives(false)}>✕</button>
            </div>
            <div style={{ ...s.modalBody, gap: 6, maxHeight: '60vh', overflowY: 'auto' }}>
              {archivedCartes.length === 0 && (
                <div style={s.archiveEmpty}>Aucune carte archivée.</div>
              )}
              {archivedCartes.map(carte => (
                <div key={carte.id} style={s.archiveRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.archiveName}>{carte.nom}</div>
                    {(carte.dateDebut || carte.dateFin) && (
                      <div style={s.archiveMeta}>
                        {carte.dateDebut && `Du ${carte.dateDebut}`}{carte.dateFin && ` au ${carte.dateFin}`}
                      </div>
                    )}
                  </div>
                  <button
                    style={s.restoreBtn}
                    onClick={async () => {
                      await onArchiveCarte?.(carte.id, false);
                      if (archivedCartes.length <= 1) setShowArchives(false);
                    }}
                  >↩ Restaurer</button>
                </div>
              ))}
            </div>
            <div style={s.modalFooter}>
              <div style={{ flex: 1 }} />
              <button style={s.ghostBtn} onClick={() => setShowArchives(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  bar: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  // Mode bande scrollable (mobile) : 1 ligne, défilement horizontal contenu.
  // Le détail anti-rétrécissement des onglets + masquage scrollbar est en CSS
  // (.carte-tab-bar--scroll dans app.css) car non exprimable en style inline.
  barScroll: { flexWrap: 'nowrap', overflowX: 'auto', maxWidth: '100%' },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' },
  tabBtnReset: { outline: 'none' },
  tabActive: { background: 'var(--nav)', color: '#fff', borderColor: 'var(--nav)' },
  tabLabel: { whiteSpace: 'nowrap' },
  editBtn: { background: 'transparent', border: 'none', borderRadius: 5, color: 'var(--accent)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 2px', marginLeft: 2, fontFamily: 'var(--font)' },
  addBtn: { color: 'var(--accent)', border: '1px dashed var(--accent-bd)', fontWeight: 700 },
  archivesBtn: { color: 'var(--text2)', border: '1px dashed var(--border)', fontWeight: 600 },
  archiveRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' },
  archiveName: { fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  archiveMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  archiveEmpty: { padding: '18px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
  restoreBtn: { padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--accent-bd)', color: 'var(--accent)', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', flexShrink: 0 },
  divider: { width: 1, height: 24, background: 'var(--border)', margin: '0 4px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 460, maxWidth: '94vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' },
  modalBody: { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' },
  dateRow: { display: 'flex', gap: 10 },
  modalFooter: { display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px', borderTop: '1px solid var(--border)' },
  ghostBtn: { padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  primaryBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
};
