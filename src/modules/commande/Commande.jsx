import React from 'react';
import { dbService } from '../../services/dbService.js';
import { confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { computeBesoins, appendStaples, applyDedupeGroups, formatBesoin } from './computeBesoins.js';
import { dedupeCommande } from '../../services/aiService.js';
import { Sparkles, Loader2, Trash2, Plus, Printer, FileDown, Pencil } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// COMMANDE — liste de produits a commander, partagee par etablissement.
// Visible de tous : cocher + saisir une quantite (optionnelle), ajouter un produit.
// Bouton de generation (agrege les produits de toutes les cartes) : consultant only.
// ─────────────────────────────────────────────────────────────────────────────

const PRINT_ID = 'commande-print';

const Commande = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const isConsultant = user?.role === 'consultant';

  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('Tous');
  const [collapsed, setCollapsed] = React.useState(new Set());
  const [busy, setBusy] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  // Modale de generation : selection des cartes a agreger.
  const [showGen, setShowGen] = React.useState(false);
  const [genData, setGenData] = React.useState(null); // { cartes, plats, recettes, catalogue }
  const [genLoading, setGenLoading] = React.useState(false);
  // Libelle des cartes retenues a la derniere generation (affiche dans le PDF).
  const [cartesLabel, setCartesLabel] = React.useState('');
  // Saisie locale des quantites (persistee au blur) pour ne pas perdre le focus.
  const [draftQty, setDraftQty] = React.useState({});
  // Renommage en ligne d'un produit : id de la ligne en cours d'edition + brouillon du nom.
  const [editingId, setEditingId] = React.useState(null);
  const [draftName, setDraftName] = React.useState('');

  // ── Chargement + realtime (liste partagee) ──
  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return undefined; }
    let mounted = true;
    const reload = async () => {
      try { const rows = await legacySB.db.listCommandeItems(etabId); if (mounted) setItems(Array.isArray(rows) ? rows : []); }
      catch (e) { /* realtime relancera */ }
      finally { if (mounted) setLoading(false); }
    };
    reload();
    const unsub = legacySB.realtime.subscribeReload('commande_items', reload);
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // ── Generation depuis les cartes (consultant only) ──
  // Etape 1 : charger les cartes + dependances et ouvrir la modale de selection.
  const openGenModal = async () => {
    if (!isConsultant || !legacySB) return;
    setShowGen(true);
    setGenLoading(true);
    try {
      const [cartes, plats, recettes, catalogue] = await Promise.all([
        legacySB.db.listCartes(etabId),
        legacySB.db.listPlats(etabId),
        legacySB.db.listRecettes(etabId),
        legacySB.db.listProduits(etabId),
      ]);
      setGenData({ cartes: cartes || [], plats: plats || [], recettes: recettes || [], catalogue: catalogue || [] });
    } catch (err) {
      notifyLegacy('Chargement des cartes impossible : ' + (err.message || err), 'error');
      setShowGen(false);
    } finally {
      setGenLoading(false);
    }
  };

  // Etape 2 : agreger (sans doublons) les produits des cartes cochees et persister.
  const confirmGen = async (selectedIds) => {
    if (!genData || !legacySB) return;
    const selCartes = genData.cartes.filter(c => selectedIds.includes(c.id));
    if (!selCartes.length) { notifyLegacy('Sélectionnez au moins une carte.', 'info'); return; }
    if (items.length && !confirmLegacy('Régénérer la liste à partir des cartes sélectionnées ?\n\nLes produits déjà cochés et les quantités saisies sont conservés. Les produits ajoutés à la main ne sont pas touchés.')) return;
    setBusy(true);
    try {
      const recipeItems = computeBesoins({
        cartes: selCartes,
        plats: genData.plats,
        recettes: genData.recettes,
        catalogue: genData.catalogue,
      });
      // Dédup sémantique par l'IA : regroupe les noms qui désignent le même
      // produit (singulier/pluriel, accents, synonymes) que la fusion exacte
      // ne rattrape pas. L'IA ne renomme que ; la fusion reste déterministe.
      // Confort : si l'IA échoue, on conserve la liste déterministe.
      let deduped = recipeItems;
      try {
        const noms = [...new Set(recipeItems.map(i => i.nom).filter(Boolean))];
        if (noms.length > 1) {
          const { groupes } = await dedupeCommande(noms);
          if (groupes.length) deduped = applyDedupeGroups(recipeItems, groupes);
        }
      } catch (e) {
        console.warn('[commande] dédup IA indisponible:', e?.message || e);
      }
      // Ajoute toujours les fonds de cuisine (secs + hygiène), sans doublon avec
      // les produits issus des recettes ni ceux déjà saisis à la main. On ne
      // déduplique que contre les lignes manuelles : sinon, à la régénération,
      // les staples auto déjà en base seraient « présents » donc supprimés.
      const manualNames = items.filter(i => i.source === 'manual').map(i => i.nom);
      const computed = appendStaples(deduped, manualNames);
      if (!computed.length) {
        notifyLegacy('Aucun produit à générer.', 'info');
        setBusy(false);
        return;
      }
      const n = await legacySB.db.generateCommande(etabId, computed);
      const rows = await legacySB.db.listCommandeItems(etabId);
      setItems(Array.isArray(rows) ? rows : []);
      setCartesLabel(selCartes.map(c => c.nom).filter(Boolean).join(' · '));
      setShowGen(false);
      notifyLegacy(`Liste générée : ${n} produit(s) pour ${selCartes.length} carte${selCartes.length > 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      notifyLegacy('Génération impossible : ' + (err.message || err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const viderAuto = async () => {
    if (!isConsultant || !legacySB) return;
    if (!confirmLegacy('Vider les produits générés automatiquement ?\n\nLes produits ajoutés à la main sont conservés.')) return;
    setBusy(true);
    try {
      await legacySB.db.generateCommande(etabId, []); // supprime toutes les lignes auto
      const rows = await legacySB.db.listCommandeItems(etabId);
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err) {
      notifyLegacy('Erreur : ' + (err.message || err), 'error');
    } finally { setBusy(false); }
  };

  // ── Edition d'une ligne ──
  const toggleCoche = async (item) => {
    const next = !item.coche;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, coche: next } : i));
    if (legacySB) {
      try { await legacySB.db.upsertCommandeItem({ ...item, coche: next }); }
      catch (err) { notifyLegacy('Erreur : ' + (err.message || err), 'error'); }
    }
  };

  const persistQuantite = async (item) => {
    const raw = draftQty[item.id];
    if (raw === undefined) return;
    const val = raw === '' ? null : Number(raw);
    setDraftQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    if (val === item.quantite) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantite: val } : i));
    if (legacySB) {
      try { await legacySB.db.upsertCommandeItem({ ...item, quantite: val }); }
      catch (err) { notifyLegacy('Erreur : ' + (err.message || err), 'error'); }
    }
  };

  const startRename = (item) => { setEditingId(item.id); setDraftName(item.nom || ''); };
  const renameItem = async (item, newNom) => {
    const nom = String(newNom || '').trim();
    setEditingId(null);
    if (!nom || nom === item.nom) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, nom } : i));
    if (legacySB) {
      try { await legacySB.db.upsertCommandeItem({ ...item, nom }); }
      catch (err) { notifyLegacy('Erreur : ' + (err.message || err), 'error'); }
    }
  };

  const removeItem = async (item) => {
    setItems(prev => prev.filter(i => i.id !== item.id));
    if (legacySB) {
      try { await legacySB.db.deleteCommandeItem(item.id); }
      catch (err) { notifyLegacy('Erreur : ' + (err.message || err), 'error'); }
    }
  };

  const addManual = async ({ nom, categorie, unite }) => {
    const cleanNom = String(nom || '').trim();
    if (!cleanNom) return;
    const item = {
      etablissementId: etabId,
      cle: 'manual:' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      produitId: null,
      nom: cleanNom,
      categorie: categorie || 'Autres',
      unite: unite || '',
      besoin: 0,
      quantite: null,
      coche: false,
      source: 'manual',
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertCommandeItem(item);
        setItems(prev => [...prev, saved]);
      } catch (err) { notifyLegacy('Erreur : ' + (err.message || err), 'error'); return; }
    } else {
      setItems(prev => [...prev, { ...item, id: item.cle }]);
    }
    setShowAdd(false);
  };

  // ── Derives ──
  const searchVal = search.trim().toLowerCase();
  const filtered = items.filter(i =>
    (catFilter === 'Tous' || i.categorie === catFilter) &&
    (searchVal === '' || (i.nom || '').toLowerCase().includes(searchVal))
  );
  const categories = ['Tous', ...[...new Set(items.map(i => i.categorie || 'Autres'))].sort(catSort)];
  const groups = groupByCategorie(filtered);
  const totalCount = items.length;
  const cocheCount = items.filter(i => i.coche).length;

  // Construit la charge utile pour l'export PDF natif (mise en page DA Samper).
  // On exporte la liste complète (indépendamment de la recherche / du filtre).
  const buildPdfPayload = () => {
    const fmtQty = (q) => (Math.round(Number(q) * 100) / 100).toString().replace('.', ',');
    return {
      totalCount: items.length,
      cocheCount: items.filter(i => i.coche).length,
      cartesLabel,
      groups: groupByCategorie(items).map(g => ({
        categorie: g.categorie,
        items: g.items.map(it => ({
          nom: it.nom,
          besoinText: it.besoin > 0 ? formatBesoin(it.besoin, it.unite) : '',
          qtyText: it.quantite != null ? `${fmtQty(it.quantite)}${it.unite ? ' ' + it.unite : ''}` : '',
          coche: it.coche,
        })),
      })),
    };
  };
  const exportPdf = () => {
    if (!items.length) { notifyLegacy('La liste est vide.', 'info'); return; }
    pdfUtils?.exportCommandePdf?.(buildPdfPayload(), {
      etablissement, filename: `commande-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };
  const printList = () => {
    if (!items.length) { notifyLegacy('La liste est vide.', 'info'); return; }
    pdfUtils?.exportCommandePdf?.(buildPdfPayload(), { etablissement, autoPrint: true });
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  return (
    <div style={s.root}>
      {/* Barre d'actions */}
      <div style={s.toolbar} className="no-print">
        <div style={s.left}>
          <input style={s.search} placeholder="Rechercher un produit…" value={search} onChange={e => setSearch(e.target.value)} />
          <div style={s.cats}>
            {categories.map(c => (
              <button key={c} style={{ ...s.catBtn, ...(catFilter === c ? s.catActive : {}) }} onClick={() => setCatFilter(c)}>{c}</button>
            ))}
          </div>
        </div>
        <div style={s.actions}>
          {totalCount > 0 && (
            <>
              <button style={s.ghostBtn} onClick={printList} title="Imprimer"><Printer size={14} /> Imprimer</button>
              <button style={s.ghostBtn} onClick={exportPdf} title="Export PDF"><FileDown size={14} /> Export PDF</button>
            </>
          )}
          <button style={s.ghostBtn} onClick={() => setShowAdd(true)}><Plus size={14} /> Produit</button>
          {isConsultant && (
            <>
              {totalCount > 0 && <button style={s.ghostBtn} onClick={viderAuto} disabled={busy}>Vider</button>}
              <button style={s.aiBtn} onClick={openGenModal} disabled={busy}>
                {busy ? <Loader2 size={14} /> : <Sparkles size={14} />} {busy ? 'Génération…' : 'Générer depuis les cartes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Compteur */}
      {totalCount > 0 && (
        <div style={s.progress} className="no-print">
          <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${totalCount ? (cocheCount / totalCount) * 100 : 0}%` }} /></div>
          <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{cocheCount} / {totalCount} coché{cocheCount > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Liste */}
      <div id={PRINT_ID} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {totalCount === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize: 40, opacity: 0.4 }}>🛒</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10, fontFamily: 'var(--font-serif)' }}>Liste de commande vide</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, maxWidth: 420 }}>
              {isConsultant
                ? 'Cliquez sur « Générer la liste » pour rassembler automatiquement les produits nécessaires à toutes les cartes, ou ajoutez un produit manuellement.'
                : 'Aucun produit pour le moment. Vous pouvez ajouter un produit, ou demander au consultant de générer la liste depuis les cartes.'}
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div style={s.empty}><div style={{ fontSize: 13, color: 'var(--text2)' }}>Aucun produit pour ce filtre.</div></div>
        ) : (
          groups.map(group => {
            const isCollapsed = collapsed.has(group.categorie);
            return (
              <div key={group.categorie} style={s.section}>
                <div
                  style={s.sectionHead}
                  onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(group.categorie) ? n.delete(group.categorie) : n.add(group.categorie); return n; })}
                >
                  <span style={{ fontSize: 10, color: 'var(--text2)' }} className="no-print">{isCollapsed ? '▶' : '▼'}</span>
                  <span style={s.sectionTitle}>{group.categorie}</span>
                  <span style={s.sectionCount}>{group.items.length}</span>
                </div>
                {!isCollapsed && group.items.map(item => (
                  <div key={item.id} style={{ ...s.row, ...(item.coche ? s.rowChecked : {}) }}>
                    <input
                      type="checkbox"
                      checked={item.coche}
                      onChange={() => toggleCoche(item)}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingId === item.id ? (
                        <input
                          autoFocus
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          onBlur={() => renameItem(item, draftName)}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setEditingId(null); }}
                          style={s.nameInput}
                        />
                      ) : (
                        <div
                          style={{ ...s.rowName, ...(item.coche ? { textDecoration: 'line-through', color: 'var(--text2)' } : {}) }}
                          onDoubleClick={() => startRename(item)}
                          title="Double-cliquer pour renommer"
                        >
                          {item.nom}
                          {item.source === 'manual' && <span style={s.manualTag}>ajouté</span>}
                        </div>
                      )}
                      {item.besoin > 0 && <div style={s.besoin}>Besoin {formatBesoin(item.besoin, item.unite)}</div>}
                    </div>
                    <div style={s.qtyWrap}>
                      <input
                        type="number" min="0" step="any"
                        value={draftQty[item.id] !== undefined ? draftQty[item.id] : (item.quantite ?? '')}
                        placeholder="Qté"
                        onChange={e => setDraftQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={() => persistQuantite(item)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        style={s.qtyInput}
                      />
                      <span style={s.qtyUnit}>{item.unite}</span>
                    </div>
                    <button style={s.delBtn} className="no-print" onClick={() => startRename(item)} title="Renommer"><Pencil size={14} /></button>
                    <button style={s.delBtn} className="no-print" onClick={() => removeItem(item)} title="Retirer"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {showAdd && <AddProductModal onClose={() => setShowAdd(false)} onAdd={addManual} />}
      {showGen && (
        <GenerateModal
          loading={genLoading}
          busy={busy}
          cartes={genData?.cartes || []}
          plats={genData?.plats || []}
          onClose={() => setShowGen(false)}
          onConfirm={confirmGen}
        />
      )}
    </div>
  );
};

// ── Modale de selection des cartes pour la generation ──
// Coche les cartes a agreger ; la liste produite est dedupliquee par computeBesoins.
const GenerateModal = ({ loading, busy, cartes, plats, onClose, onConfirm }) => {
  const [selected, setSelected] = React.useState(() => new Set());
  const [touched, setTouched] = React.useState(false);

  // Par defaut : toutes les cartes cochees une fois chargees.
  React.useEffect(() => {
    if (!loading && !touched && cartes.length) setSelected(new Set(cartes.map(c => c.id)));
  }, [loading, cartes, touched]);

  // Nombre de plats rattaches a chaque carte (indicatif).
  const platCount = React.useMemo(() => {
    const m = new Map();
    (plats || []).forEach(p => (p.carteIds || []).forEach(cid => m.set(cid, (m.get(cid) || 0) + 1)));
    return m;
  }, [plats]);

  const toggle = (id) => {
    setTouched(true);
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const allOn = cartes.length > 0 && selected.size === cartes.length;
  const toggleAll = () => {
    setTouched(true);
    setSelected(allOn ? new Set() : new Set(cartes.map(c => c.id)));
  };

  return (
    <div className="modal-full-overlay" style={s.overlay} onClick={onClose}>
      <div className="modal-full" style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div style={s.modalTitle}>Générer depuis les cartes</div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={s.genBody}>
          <div style={s.genHint}>
            Cochez les cartes à inclure. Les produits sont regroupés sans doublon pour faciliter la commande.
          </div>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>Chargement des cartes…</div>
          ) : cartes.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
              Aucune carte trouvée pour cet établissement.
            </div>
          ) : (
            <>
              <button style={s.selectAllBtn} onClick={toggleAll}>
                {allOn ? 'Tout décocher' : 'Tout cocher'}
              </button>
              <div style={s.carteList}>
                {cartes.map(c => {
                  const on = selected.has(c.id);
                  const cnt = platCount.get(c.id) || 0;
                  return (
                    <label key={c.id} style={{ ...s.carteRow, ...(on ? s.carteRowOn : {}) }}>
                      <input
                        type="checkbox" checked={on} onChange={() => toggle(c.id)}
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.carteName}>{c.nom || 'Carte sans nom'}</div>
                        <div style={s.carteMeta}>
                          {cnt} plat{cnt > 1 ? 's' : ''}{formatCartePeriode(c) ? ' · ' + formatCartePeriode(c) : ''}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose}>Annuler</button>
          <button
            style={{ ...s.primaryBtn, opacity: (selected.size && !busy) ? 1 : 0.5 }}
            disabled={!selected.size || busy}
            onClick={() => onConfirm([...selected])}
          >
            {busy ? 'Génération…' : `Générer${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// Periode d'une carte, format court fr-CH, si renseignee.
function formatCartePeriode(c) {
  const fmt = (d) => { try { return new Date(d).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return ''; } };
  if (c.dateDebut && c.dateFin) return `${fmt(c.dateDebut)} – ${fmt(c.dateFin)}`;
  if (c.dateDebut) return `dès le ${fmt(c.dateDebut)}`;
  if (c.dateFin) return `jusqu'au ${fmt(c.dateFin)}`;
  return '';
}

// ── Modale d'ajout manuel ──
const AddProductModal = ({ onClose, onAdd }) => {
  const [nom, setNom] = React.useState('');
  const [categorie, setCategorie] = React.useState('Autres');
  const [unite, setUnite] = React.useState('');
  const CATS = ['Viandes', 'Poissons', 'Légumes', 'Fruits', 'Crémerie', 'Épicerie', 'Boissons', 'Surgelés', 'Autres'];
  const UNITES = ['', 'g', 'kg', 'ml', 'L', 'pcs'];
  return (
    <div className="modal-full-overlay" style={s.overlay} onClick={onClose}>
      <div className="modal-full" style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div style={s.modalTitle}>Ajouter un produit</div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={s.label}>Produit *</label>
            <input autoFocus style={s.input} value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Ex : Beurre doux" onKeyDown={e => { if (e.key === 'Enter' && nom.trim()) onAdd({ nom, categorie, unite }); }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Catégorie</label>
              <select style={s.input} value={categorie} onChange={e => setCategorie(e.target.value)}>
                {CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <label style={s.label}>Unité</label>
              <select style={s.input} value={unite} onChange={e => setUnite(e.target.value)}>
                {UNITES.map(u => <option key={u} value={u}>{u || '—'}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={s.modalFooter}>
          <button style={s.ghostBtn} onClick={onClose}>Annuler</button>
          <button style={{ ...s.primaryBtn, opacity: nom.trim() ? 1 : 0.5 }} disabled={!nom.trim()} onClick={() => onAdd({ nom, categorie, unite })}>Ajouter</button>
        </div>
      </div>
    </div>
  );
};

// Ordre des catégories : alphabétique, « Autres » en dernier.
function catSort(a, b) {
  if (a === 'Autres') return 1;
  if (b === 'Autres') return -1;
  return a.localeCompare(b, 'fr');
}
function groupByCategorie(list) {
  const map = new Map();
  list.forEach(i => {
    const c = i.categorie || 'Autres';
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(i);
  });
  return [...map.keys()].sort(catSort).map(categorie => ({
    categorie,
    items: map.get(categorie).slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')),
  }));
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  left: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  search: { padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none', fontFamily: 'var(--font)', width: 200 },
  cats: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  catBtn: { padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 20, background: 'var(--surface)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)' },
  catActive: { background: 'var(--nav)', color: '#fff', borderColor: 'var(--nav)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  ghostBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  aiBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--ai-bg-soft)', color: 'var(--ai-text)', border: '1px solid var(--ai-bd)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  progress: { display: 'flex', alignItems: 'center', gap: 10 },
  progressBar: { flex: 1, height: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', transition: 'width 0.2s' },
  printHeader: { marginBottom: 4 },
  section: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  sectionTitle: { flex: 1, fontSize: 12, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 8px' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' },
  rowChecked: { background: 'var(--success-bg)' },
  rowName: { fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' },
  nameInput: { width: '100%', padding: '5px 8px', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' },
  besoin: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  manualTag: { marginLeft: 8, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, padding: '1px 6px' },
  qtyWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  qtyInput: { width: 70, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, textAlign: 'right', fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)' },
  qtyUnit: { fontSize: 12, color: 'var(--text2)', width: 26 },
  delBtn: { background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 },
  empty: { padding: 40, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 420, maxWidth: '94vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' },
  modalFooter: { display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--border)' },
  primaryBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  // Modale de generation
  genBody: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  genHint: { fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 },
  selectAllBtn: { alignSelf: 'flex-start', padding: '5px 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  carteList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '46vh', overflowY: 'auto' },
  carteRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', cursor: 'pointer' },
  carteRowOn: { borderColor: 'var(--accent)', background: 'var(--success-bg)' },
  carteName: { fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  carteMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
};

export default Commande;
