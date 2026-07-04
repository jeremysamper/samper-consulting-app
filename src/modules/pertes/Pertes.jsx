import React from 'react';
import { getDemoData, canManageModule } from '../../data/demoData.js';
import { pdfUtils } from '../../services/pdf.js';
import { alertLegacy, confirmLegacy, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';

// PERTES
const Pertes = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const todayStr = new Date().toISOString().slice(0, 10);
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [pertes, setPertes] = React.useState(() => legacySB ? [] : readLegacyStorage('sc_pertes', demoData.pertes));
  const [showForm, setShowForm] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [motifFilter, setMotifFilter] = React.useState('Tous');
  const [form, setForm] = React.useState({ date: todayStr, produit:'', quantite:'', unite:'kg', valeurUnit:'', motif:'DLC dépassée', categorie:'Légumes', commentaire:'' });
  const perms = demoData.permissions[user.role] || {};
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // ─── Catalogue produits (pour autocomplétion à la déclaration de perte) ───
  const [catalogue, setCatalogue] = React.useState([]);
  const [autocompleteFocus, setAutocompleteFocus] = React.useState(-1);
  const [autocompleteOpen, setAutocompleteOpen] = React.useState(false);
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    legacySB.db.listProduits(etabId)
      .then(ps => { if (mounted) setCatalogue(ps || []); })
      .catch(err => console.warn('[Pertes] catalogue load failed', err));
    const unsub = legacySB.realtime.subscribeReload('produits', async () => {
      try {
        const ps = await legacySB.db.listProduits(etabId);
        if (mounted) setCatalogue(ps || []);
      } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // ═══ Load Supabase + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) return;
    let unsub = null, mounted = true;
    (async () => {
      try {
        const ps = await legacySB.db.listPertes(etabId);
        if (mounted) setPertes(ps);
      } catch (err) { console.error('[Pertes load]', err); }
    })();
    unsub = legacySB.realtime.subscribeReload('pertes', async () => {
      try { const ps = await legacySB.db.listPertes(etabId); if (mounted) setPertes(ps); } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  React.useEffect(() => { demoData.pertes = pertes; if (!legacySB) writeLegacyStorage('sc_pertes', pertes); }, [pertes]);

  const canManage = canManageModule(user.role, 'pertes');

  const supprimer = async (id) => {
    if (!canManage || !confirmLegacy('Supprimer cette perte ?')) return;
    if (legacySB) {
      try { await legacySB.db.deletePerte(id); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setPertes(prev => prev.filter(p => p.id !== id));
  };

  // ─── Mode sélection : suppression et export en lot ───
  const supprimerSelection = async () => {
    if (!canManage || sel.count === 0) return;
    if (!confirmLegacy(`Supprimer ${sel.count} perte(s) sélectionnée(s) ?`)) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of Array.from(sel.ids)) {
      if (legacySB) {
        try { await legacySB.db.deletePerte(id); ok += 1; }
        catch (err) { console.error('[deletePerte]', err); }
      } else { ok += 1; }
    }
    setPertes(prev => prev.filter(p => !sel.ids.has(p.id)));
    setBulkBusy(false);
    sel.exit();
    notifyLegacy(`${ok} perte(s) supprimée(s).`, 'success');
  };

  const exporterSelection = async () => {
    const rows = pertesEtab.filter(p => sel.ids.has(p.id));
    if (!rows.length) return;
    setBulkBusy(true);
    const headers = ['Date', 'Produit', 'Motif', 'Catégorie', 'Quantité', 'Unité', 'Valeur unitaire (CHF)', 'Valeur totale (CHF)', 'Statut', 'Commentaire'];
    const data = rows.map(p => [
      p.date, p.produit, p.motif, p.categorie, p.quantite, p.unite,
      p.valeurUnit, Number((p.quantite * p.valeurUnit).toFixed(2)),
      p.valide ? 'Validé' : 'À valider', p.commentaire || '',
    ]);
    try {
      await exportRowsToXlsx(`pertes-${todayStr}.xlsx`, 'Pertes', headers, data, [12, 28, 18, 16, 10, 10, 18, 18, 12, 30]);
      notifyLegacy(`${rows.length} perte(s) exportée(s) en Excel.`, 'success');
    } catch (err) {
      notifyLegacy('Erreur export : ' + err.message, 'error');
    }
    setBulkBusy(false);
  };

  const MOTIFS = ['Tous','DLC dépassée','Surproduction','Erreur de préparation','Erreur de commande','Retour client','Casse','Autre'];
  const CATS = ['Viandes','Poissons','Légumes','Fruits','Épicerie sèche','Produits laitiers','Préparations','Fonds & sauces','Vins & alcools','Autres'];
  const UNITES = ['kg','g','L','ml','portions','pièces','bottes','unités'];

  // Mapping des catégories du catalogue (CATEGORIES_PRODUITS) vers celles de Pertes (CATS).
  // Les libellés diffèrent légèrement : on ramène toujours sur une catégorie existante de Pertes
  // pour éviter qu'une valeur "Viandes & Volailles" ne casse le select.
  const mapCatalogueToPertesCat = (catalogueCat) => {
    if (!catalogueCat) return 'Autres';
    const map = {
      'Viandes & Volailles': 'Viandes',
      'Poissons & Fruits de mer': 'Poissons',
      'Légumes & Fruits': 'Légumes',
      'Produits laitiers': 'Produits laitiers',
      'Épicerie sèche': 'Épicerie sèche',
      'Épices & Condiments': 'Épicerie sèche',
      'Vins & Spiritueux': 'Vins & alcools',
      'Boissons': 'Vins & alcools',
      'Pâtisserie & Boulangerie': 'Épicerie sèche',
      'Autres': 'Autres',
    };
    return map[catalogueCat] || 'Autres';
  };

  // Filtrer par établissement courant
  const pertesEtab = pertes.filter(p => (p.etablissementId || 'etab-1') === etabId);

  const filtered = pertesEtab.filter(p =>
    (motifFilter === 'Tous' || p.motif === motifFilter) &&
    (search === '' || p.produit.toLowerCase().includes(search.toLowerCase()))
  );

  const totalValeur = filtered.reduce((s,p) => s + p.quantite * p.valeurUnit, 0);
  const parCategorie = pertesEtab.reduce((acc,p) => {
    const k = p.categorie; const v = p.quantite * p.valeurUnit;
    acc[k] = (acc[k]||0) + v; return acc;
  }, {});

  const handleSubmit = async () => {
    if (!form.produit || !form.quantite || !form.valeurUnit) { alertLegacy('Veuillez remplir tous les champs obligatoires.'); return; }
    const newPerte = { id:`pt${Date.now()}`, ...form, etablissementId: etabId, quantite:parseFloat(form.quantite), valeurUnit:parseFloat(form.valeurUnit), declarePar:user.id, valide:false };
    if (legacySB) {
      try { await legacySB.db.upsertPerte(newPerte); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setPertes([newPerte, ...pertes]);
    setShowForm(false);
    setForm({ date: todayStr, produit:'', quantite:'', unite:'kg', valeurUnit:'', motif:'DLC dépassée', categorie:'Légumes', commentaire:'' });
  };

  const valider = async (id) => {
    const p = pertes.find(x => x.id === id);
    if (!p) return;
    const updated = { ...p, valide: true, validePar: user.id };
    if (legacySB) {
      try { await legacySB.db.upsertPerte(updated); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setPertes(pertes.map(x => x.id===id ? updated : x));
  };

  const printPertes = () => {
    if (!pdfUtils?.printElement) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    pdfUtils.printElement('pertes-print', 'Registre des pertes', { etablissement });
  };

  const exportPertes = () => {
    if (!pdfUtils?.exportElementToPdf) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    pdfUtils.exportElementToPdf('pertes-print', 'pertes.pdf', { etablissement, title: 'Registre des pertes' });
  };

  return (
    <div style={pts.root}>
      {/* Header */}
      <div style={pts.header}>
        <div style={pts.headerLeft}>
          <input style={pts.search} placeholder="Rechercher un produit…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <SegmentedTabs
            size="sm"
            active={motifFilter}
            onChange={setMotifFilter}
            tabs={MOTIFS.map(m => ({ id: m, label: m }))}
          />
        </div>
        <div className="module-actions">
          {perms.pertes && <button style={pts.addBtn} onClick={() => setShowForm(true)}>+ Déclarer une perte</button>}
          {canManage && !sel.active && (
            <button style={pts.exportBtn} onClick={sel.enter}>☑ Sélectionner</button>
          )}
          <button style={pts.exportBtn} onClick={printPertes}>🖨 Imprimer</button>
          <button style={pts.exportBtn} onClick={exportPertes}>⬇ Export</button>
        </div>
      </div>

      {/* KPI bar */}
      <div style={pts.kpiBar}>
        <div style={pts.kpiCard}>
          <div style={pts.kpiLabel}>Valeur totale pertes (période)</div>
          <div style={{...pts.kpiVal, color:'var(--danger-strong)'}}>−CHF {totalValeur.toFixed(2)}</div>
        </div>
        <div style={pts.kpiCard}>
          <div style={pts.kpiLabel}>Déclarations</div>
          <div style={pts.kpiVal}>{filtered.length}</div>
        </div>
        <div style={pts.kpiCard}>
          <div style={pts.kpiLabel}>Non validées</div>
          <div style={{...pts.kpiVal, color:'var(--warning-strong)'}}>{pertesEtab.filter(p=>!p.valide).length}</div>
        </div>
        {/* Top catégorie */}
        {Object.entries(parCategorie).sort((a,b)=>b[1]-a[1]).slice(0,1).map(([k,v]) => (
          <div key={k} style={pts.kpiCard}>
            <div style={pts.kpiLabel}>1ère catégorie de perte</div>
            <div style={pts.kpiVal}>{k}</div>
            <div style={{fontSize:12,color:'var(--danger-strong)',fontWeight:600,marginTop:2}}>CHF {v.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Barre d'outils du mode sélection */}
      {sel.active && (
        <SelectionToolbar
          count={sel.count}
          total={filtered.length}
          allSelected={sel.count > 0 && sel.count === filtered.length}
          onToggleAll={() => (sel.count === filtered.length ? sel.clear() : sel.selectAll(filtered.map(p => p.id)))}
          onDelete={supprimerSelection}
          onExport={exporterSelection}
          exportLabel="⬇ Exporter Excel"
          onCancel={sel.exit}
          busy={bulkBusy}
        />
      )}

      {/* Liste */}
      <div style={pts.tableWrap} id="pertes-print" className="grid-table-scroll">
        {/* Colonnes dynamiques : les 2 colonnes d'action n'existent que pour les
            rôles gestionnaires, sinon les cellules débordent sur une ligne implicite. */}
        <div className="grid-table-row" style={{ ...pts.tableHead, gridTemplateColumns: (sel.active ? '34px ' : '') + '90px 2fr 1.2fr 1fr 90px 100px 100px 90px' + (canManage ? ' 80px 80px' : '') }}>
          {sel.active && <span className="no-print" />}
          <span>Date</span>
          <span>Produit</span>
          <span>Motif</span>
          <span>Catégorie</span>
          <span style={{textAlign:'right'}}>Quantité</span>
          <span style={{textAlign:'right'}}>Valeur</span>
          <span>Déclaré par</span>
          <span>Statut</span>
          {canManage && <span/>}
          {canManage && <span/>}
        </div>
        {filtered.length === 0 && <div style={{padding:'20px 18px', color:'var(--text2)', fontSize:13}}>Aucune perte pour ces critères.</div>}
        {(filtered || []).map(p => {
          const emp = demoData.utilisateurs.find(u=>u.id===p.declarePar);
          const role = emp ? demoData.roles[emp.role] : null;
          const valeur = (p.quantite * p.valeurUnit).toFixed(2);
          const canVal = canManage && !p.valide;
          return (
            <div key={p.id} className="grid-table-row" style={{
              ...pts.tableRow,
              gridTemplateColumns: (sel.active ? '34px ' : '') + '90px 2fr 1.2fr 1fr 90px 100px 100px 90px' + (canManage ? ' 80px 80px' : ''),
              ...(sel.active && sel.isSelected(p.id) ? { background: 'var(--bg)' } : {}),
            }}>
              {sel.active && (
                <span className="no-print" style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={sel.isSelected(p.id)}
                    onChange={() => sel.toggle(p.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                </span>
              )}
              <span style={pts.cell}>{p.date}</span>
              <span style={{...pts.cellBold, flex:2}}>
                {p.produit}
                {p.commentaire && <div style={{fontSize:11,color:'var(--text2)',fontWeight:400,marginTop:1}}>{p.commentaire}</div>}
              </span>
              <span style={pts.cell}><span style={pts.motifTag}>{p.motif}</span></span>
              <span style={pts.cell}>{p.categorie}</span>
              <span style={{...pts.cell,textAlign:'right'}}>{p.quantite} {p.unite}</span>
              <span style={{...pts.cell,textAlign:'right',color:'var(--danger-strong)',fontWeight:600}}>−CHF {valeur}</span>
              <span style={pts.cell}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{...pts.empDot, background:role?.couleur}}>{emp?.avatar}</div>
                  <span style={{fontSize:12}}>{emp?.prenom}</span>
                </div>
              </span>
              <span style={pts.cell}>
                <span style={{...pts.badge, background:p.valide?'var(--success-bg)':'var(--warning-bg)', color:p.valide?'var(--success-text)':'var(--warning-text)'}}>
                  {p.valide ? '✓ Validé' : '⏳ À valider'}
                </span>
              </span>
              {canManage && (
                <span>
                  {canVal && <button style={pts.valBtn} onClick={()=>valider(p.id)}>Valider</button>}
                </span>
              )}
              {canManage && (
                <span>
                  <button style={pts.deleteBtn} onClick={()=>supprimer(p.id)}>Supprimer</button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Répartition par catégorie */}
      <div style={pts.chartCard}>
        <div style={pts.chartTitle}>Répartition par catégorie</div>
        <div style={pts.chartBars}>
          {Object.entries(parCategorie).sort((a,b)=>b[1]-a[1]).map(([cat,val]) => {
            const pct = Math.round(val / totalValeur * 100);
            return (
              <div key={cat} style={pts.barRow}>
                <span style={pts.barLabel}>{cat}</span>
                <div style={pts.barTrack}>
                  <div style={{...pts.barFill, width:`${pct}%`}}/>
                </div>
                <span style={pts.barVal}>CHF {val.toFixed(2)}</span>
                <span style={pts.barPct}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal saisie perte */}
      {showForm && (
        <div className="modal-full-overlay" style={pts.overlay} onClick={() => setShowForm(false)}>
          <div className="modal-full" style={pts.modal} onClick={e=>e.stopPropagation()}>
            <div style={pts.modalHeader}>
              <div style={{fontWeight:700,fontSize:16,fontFamily:'var(--font-serif)'}}>Déclarer une perte</div>
              <button style={pts.closeBtn} onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div style={pts.modalBody}>
              <div style={pts.formGrid}>
                <div style={pts.field}>
                  <label style={pts.fieldLabel}>Date *</label>
                  <input type="date" style={pts.fieldInput} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>
                </div>
                <div style={pts.field}>
                  <label style={pts.fieldLabel}>Motif *</label>
                  <select style={pts.fieldInput} value={form.motif} onChange={e=>setForm({...form,motif:e.target.value})}>
                    {MOTIFS.slice(1).map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{...pts.field, gridColumn:'1/-1', position: 'relative'}}>
                  <label style={pts.fieldLabel}>
                    Produit *
                    {catalogue.length > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text2)', fontWeight: 400, fontStyle: 'italic' }}>
                        ({catalogue.length} produits dans le catalogue — tapez pour rechercher)
                      </span>
                    )}
                  </label>
                  <input
                    style={pts.fieldInput}
                    placeholder={catalogue.length > 0 ? "Tapez pour piocher dans le catalogue ou saisir un nom libre" : "Nom du produit"}
                    value={form.produit}
                    autoComplete="off"
                    onChange={e => {
                      setForm({...form, produit: e.target.value});
                      setAutocompleteOpen(true);
                      setAutocompleteFocus(-1);
                    }}
                    onFocus={() => setAutocompleteOpen(true)}
                    onBlur={() => setTimeout(() => setAutocompleteOpen(false), 150)}
                    onKeyDown={e => {
                      const q = (form.produit || '').toLowerCase().trim();
                      const matches = catalogue
                        .filter(p => p.nom && p.nom.toLowerCase().includes(q))
                        .slice(0, 8);
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setAutocompleteFocus(i => Math.min(i + 1, matches.length - 1));
                        setAutocompleteOpen(true);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setAutocompleteFocus(i => Math.max(i - 1, -1));
                      } else if (e.key === 'Enter' && autocompleteFocus >= 0 && matches[autocompleteFocus]) {
                        e.preventDefault();
                        const p = matches[autocompleteFocus];
                        setForm({
                          ...form,
                          produit: p.nom,
                          categorie: mapCatalogueToPertesCat(p.categorie),
                          unite: p.uniteRef || form.unite,
                          valeurUnit: p.prixUnitaire || form.valeurUnit,
                        });
                        setAutocompleteOpen(false);
                        setAutocompleteFocus(-1);
                      } else if (e.key === 'Escape') {
                        setAutocompleteOpen(false);
                      }
                    }}
                  />
                  {/* Dropdown suggestions */}
                  {autocompleteOpen && form.produit.trim() && catalogue.length > 0 && (() => {
                    const q = form.produit.toLowerCase().trim();
                    const matches = catalogue
                      .filter(p => p.nom && p.nom.toLowerCase().includes(q))
                      .slice(0, 8);
                    if (matches.length === 0) return null;
                    return (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 6, maxHeight: 280, overflowY: 'auto',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 10,
                        marginTop: 2,
                      }}>
                        {matches.map((p, i) => (
                          <div
                            key={p.id}
                            onMouseDown={e => {
                              e.preventDefault();
                              setForm({
                                ...form,
                                produit: p.nom,
                                categorie: mapCatalogueToPertesCat(p.categorie),
                                unite: p.uniteRef || form.unite,
                                valeurUnit: p.prixUnitaire || form.valeurUnit,
                              });
                              setAutocompleteOpen(false);
                              setAutocompleteFocus(-1);
                            }}
                            onMouseEnter={() => setAutocompleteFocus(i)}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: i < matches.length - 1 ? '1px solid var(--border)' : 'none',
                              background: i === autocompleteFocus ? 'var(--bg)' : 'transparent',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.nom}</div>
                              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                                {p.categorie || 'Autres'}
                                {p.uniteRef && ` · ${p.uniteRef}`}
                                {p.fournisseurNom && ` · ${p.fournisseurNom}`}
                              </div>
                            </div>
                            {p.prixUnitaire != null && p.prixUnitaire > 0 && (
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                                {p.prixUnitaire.toFixed(p.prixUnitaire < 1 ? 4 : 2)} CHF/{p.uniteRef}
                              </div>
                            )}
                          </div>
                        ))}
                        <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text2)', borderTop: '1px solid var(--border)', background: 'var(--bg)', fontStyle: 'italic' }}>
                          ↑↓ pour naviguer · Entrée pour valider · Échap pour fermer
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={pts.field}>
                  <label style={pts.fieldLabel}>Quantité *</label>
                  <input type="number" style={pts.fieldInput} placeholder="0" value={form.quantite} onChange={e=>setForm({...form,quantite:e.target.value})}/>
                </div>
                <div style={pts.field}>
                  <label style={pts.fieldLabel}>Unité</label>
                  <select style={pts.fieldInput} value={form.unite} onChange={e=>setForm({...form,unite:e.target.value})}>
                    {UNITES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div style={pts.field}>
                  <label style={pts.fieldLabel}>Valeur unitaire (CHF) *</label>
                  <input type="number" step="0.01" style={pts.fieldInput} placeholder="0.00" value={form.valeurUnit} onChange={e=>setForm({...form,valeurUnit:e.target.value})}/>
                </div>
                <div style={pts.field}>
                  <label style={pts.fieldLabel}>Catégorie</label>
                  <select style={pts.fieldInput} value={form.categorie} onChange={e=>setForm({...form,categorie:e.target.value})}>
                    {CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{...pts.field, gridColumn:'1/-1'}}>
                  <label style={pts.fieldLabel}>Commentaire</label>
                  <textarea style={{...pts.fieldInput, resize:'vertical', minHeight:70}} value={form.commentaire} onChange={e=>setForm({...form,commentaire:e.target.value})} placeholder="Précisions éventuelles…"/>
                </div>
              </div>
              {form.quantite && form.valeurUnit && (
                <div style={pts.previewVal}>
                  Valeur estimée : <strong style={{color:'var(--danger-strong)'}}>−CHF {(parseFloat(form.quantite||0)*parseFloat(form.valeurUnit||0)).toFixed(2)}</strong>
                </div>
              )}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
                <button style={pts.exportBtn} onClick={()=>setShowForm(false)}>Annuler</button>
                <button style={pts.addBtn} onClick={handleSubmit}>Enregistrer la perte</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const pts = {
  root:{display:'flex',flexDirection:'column',gap:16},
  header:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'},
  headerLeft:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',minWidth:0},
  headerRight:{display:'flex',gap:8},
  search:{padding:'7px 14px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',outline:'none',fontFamily:'var(--font)',width:180},
  motifTabs:{display:'flex',gap:4,flexWrap:'wrap'},
  motifBtn:{padding:'5px 12px',border:'1px solid var(--border)',borderRadius:20,background:'var(--surface)',color:'var(--text2)',fontSize:11,cursor:'pointer',fontFamily:'var(--font)'},
  motifActive:{background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  addBtn:{padding:'8px 16px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  exportBtn:{padding:'8px 16px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'},
  kpiBar:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12},
  kpiCard:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'},
  kpiLabel:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:6},
  kpiVal:{fontSize:22,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  tableWrap:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'},
  tableHead:{display:'grid',gridTemplateColumns:'90px 2fr 1.2fr 1fr 90px 100px 100px 90px 80px',padding:'9px 18px',background:'var(--bg)',fontSize:10,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:10},
  tableRow:{display:'grid',gridTemplateColumns:'90px 2fr 1.2fr 1fr 90px 100px 100px 90px 80px',padding:'12px 18px',borderBottom:'1px solid var(--border)',gap:10,alignItems:'center'},
  cell:{fontSize:13,color:'var(--text)'},
  cellBold:{fontSize:13,fontWeight:600,color:'var(--text)'},
  badge:{display:'inline-block',padding:'3px 9px',borderRadius:12,fontSize:11,fontWeight:600},
  motifTag:{fontSize:11,background:'#f1f5f9',color:'var(--text2)',padding:'2px 8px',borderRadius:8,fontWeight:500},
  empDot:{width:22,height:22,borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:9,flexShrink:0},
  valBtn:{background:'none',border:'1px solid var(--success-text)',color:'var(--success-text)',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  deleteBtn:{background:'none',border:'1px solid var(--danger-bd)',color:'var(--danger-strong)',borderRadius:6,padding:'4px 10px',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  chartCard:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'18px 20px'},
  chartTitle:{fontSize:12,fontWeight:700,color:'var(--text)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:14},
  chartBars:{display:'flex',flexDirection:'column',gap:10},
  barRow:{display:'grid',gridTemplateColumns:'130px 1fr 90px 40px',gap:12,alignItems:'center'},
  barLabel:{fontSize:12,color:'var(--text)',fontWeight:500},
  barTrack:{height:8,background:'var(--bg)',borderRadius:4,overflow:'hidden',border:'1px solid var(--border)'},
  barFill:{height:'100%',background:'var(--accent)',borderRadius:4,transition:'width .4s'},
  barVal:{fontSize:12,color:'var(--danger-strong)',fontWeight:600,textAlign:'right'},
  barPct:{fontSize:11,color:'var(--text2)',textAlign:'right'},
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000},
  modal:{background:'var(--surface)',borderRadius:14,width:520,maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'},
  modalHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--border)'},
  closeBtn:{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'},
  modalBody:{padding:'22px'},
  formGrid:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14},
  field:{display:'flex',flexDirection:'column',gap:6},
  fieldLabel:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4},
  fieldInput:{padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',outline:'none'},
  previewVal:{background:'var(--danger-bg-soft)',border:'1px solid var(--danger-bd)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'var(--text)',marginTop:8},
};

export default Pertes;
