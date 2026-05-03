import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import { alertLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────
// PARAMÈTRES — Gestion des établissements (Consultant)
// + Maintenance des données
// ─────────────────────────────────────────────────────

const EtabForm = ({ etab, onSave, onCancel }) => {
  const [f, setF] = React.useState(etab || {
    id:'', nom:'', type:'Restaurant', adresse:'', tel:'', email:'',
    couleur:'#92702A', actif:true, notes:''
  });

  const TYPES = ['Restaurant gastronomique','Brasserie','Bistrot','Hôtel-Restaurant','Hôtel','Café-Restaurant','Traiteur','Collectivité','Autre'];
  const COULEURS = ['#92702A','#1a5276','#1e6b40','#6c3483','#2e7ab8','#c0392b','#16a085','#7f8c8d'];

  const handleSave = () => {
    if (!f.nom.trim()) { alertLegacy('Le nom est obligatoire.'); return; }
    onSave({ ...f, id: f.id || 'etab-' + Date.now() });
  };

  return (
    <div style={ps.overlay} onClick={onCancel}>
      <div style={ps.modal} onClick={e => e.stopPropagation()}>
        <div style={ps.modalHeader}>
          <div style={ps.modalTitle}>{etab?.id ? 'Modifier l\'établissement' : 'Ajouter un établissement'}</div>
          <button style={ps.closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div style={ps.modalBody}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={ps.field}>
              <label style={ps.fLabel}>Nom de l'établissement *</label>
              <input type="text" style={ps.fInput} value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="Hôtel Panorama"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={ps.field}>
                <label style={ps.fLabel}>Type</label>
                <select style={ps.fInput} value={f.type} onChange={e=>setF({...f,type:e.target.value})}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={ps.field}>
                <label style={ps.fLabel}>Couleur</label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {COULEURS.map(c => (
                    <button key={c} type="button"
                      onClick={()=>setF({...f,couleur:c})}
                      style={{ width:24, height:24, borderRadius:6, background:c, border: f.couleur===c?'2px solid var(--text)':'1px solid var(--border)', cursor:'pointer' }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Adresse</label>
              <input type="text" style={ps.fInput} value={f.adresse} onChange={e=>setF({...f,adresse:e.target.value})} placeholder="Rue et ville"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={ps.field}>
                <label style={ps.fLabel}>Téléphone</label>
                <input type="tel" style={ps.fInput} value={f.tel} onChange={e=>setF({...f,tel:e.target.value})} placeholder="+41 ..."/>
              </div>
              <div style={ps.field}>
                <label style={ps.fLabel}>E-mail</label>
                <input type="email" style={ps.fInput} value={f.email||''} onChange={e=>setF({...f,email:e.target.value})} placeholder="contact@..."/>
              </div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Notes internes (consultant)</label>
              <textarea style={{...ps.fInput, resize:'vertical', minHeight:64}}
                placeholder="Informations de suivi, contexte de la mission…"
                value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{...ps.toggle, background:f.actif?'var(--accent)':'var(--border)'}} onClick={()=>setF({...f,actif:!f.actif})}>
                <div style={{...ps.toggleThumb, left:f.actif?'calc(100% - 20px)':'2px'}}/>
              </div>
              <span style={{ fontSize:13, color:'var(--text)', fontWeight:500 }}>Établissement actif (visible dans l'application)</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button style={ps.cancelBtn} onClick={onCancel}>Annuler</button>
            <button style={ps.saveBtn} onClick={handleSave}>{etab?.id ? 'Enregistrer' : 'Créer'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Parametres = ({ user }) => {
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [etablissements, setEtablissements] = React.useState(demoData.etablissements || []);
  const [showForm, setShowForm] = React.useState(false);
  const [editEtab, setEditEtab] = React.useState(null);
  const [showConfirm, setShowConfirm] = React.useState(null);

  const canEdit = user.role === 'consultant';

  // Charger depuis Supabase + realtime
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    let unsub = null;

    const reload = async () => {
      try {
        const rows = await legacySB.db.listEtablissements();
        if (!mounted) return;
        const mapped = (rows || []).map(r => ({
          id: r.id,
          nom: r.nom,
          type: r.type,
          adresse: r.adresse,
          tel: r.tel,
          email: r.email,
          couleur: r.couleur,
          actif: r.actif,
          notes: r.notes,
          ccntHeuresSemaine: r.ccnt_heures_semaine,
        }));
        setEtablissements(mapped);
        demoData.etablissements = mapped;
      } catch (err) { console.error('[Parametres load]', err); }
    };

    reload();
    unsub = legacySB.realtime.subscribe('etablissements', reload);
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  const openAdd = () => { if (!canEdit) return; setEditEtab(null); setShowForm(true); };
  const openEdit = (e) => { if (!canEdit) return; setEditEtab(e); setShowForm(true); };

  const save = async (etab) => {
    if (!canEdit) {
      alertLegacy("Vous n'avez pas les droits pour modifier les établissements (rôle consultant requis).");
      return;
    }
    // Si nouvel établissement, générer un ID propre
    if (!etab.id) {
      etab.id = 'etab-' + Date.now();
    }
    const payload = {
      id: etab.id,
      nom: etab.nom,
      type: etab.type || 'Restaurant',
      adresse: etab.adresse || null,
      tel: etab.tel || null,
      email: etab.email || null,
      couleur: etab.couleur || '#92702A',
      actif: etab.actif !== false,
      notes: etab.notes || null,
      ccnt_heures_semaine: etab.ccntHeuresSemaine || 42,
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertEtablissement(payload);
        if (!saved || !saved.id) {
          notifyLegacy("Échec silencieux de la sauvegarde (vérifiez les permissions RLS sur Supabase).", 'error');
          return;
        }
        // Force un reload local pour ne pas attendre le realtime
        try {
          const rows = await legacySB.db.listEtablissements();
          const mapped = (rows || []).map(r => ({
            id: r.id, nom: r.nom, type: r.type, adresse: r.adresse, tel: r.tel,
            email: r.email, couleur: r.couleur, actif: r.actif, notes: r.notes,
            ccntHeuresSemaine: r.ccnt_heures_semaine,
          }));
          setEtablissements(mapped);
          demoData.etablissements = mapped;
        } catch (e) { console.warn('[Parametres] reload fail', e); }
      } catch (err) {
        console.error('[Parametres save]', err);
        notifyLegacy("Erreur enregistrement : " + err.message + (err.code === '42501' ? "\n\n(Erreur de permissions RLS — vérifiez votre rôle)" : ''), 'error');
        return;
      }
    } else {
      setEtablissements(prev => prev.find(x=>x.id===etab.id) ? prev.map(x=>x.id===etab.id?etab:x) : [...prev, etab]);
    }
    setShowForm(false);
  };

  const confirmDelete = async (id) => {
    if (!canEdit) return;
    if (legacySB) {
      try {
        await legacySB.db.deleteEtablissement(id);
        // Cascade automatique : toutes les données liées (shifts, recettes, pertes, HACCP, etc.) sont supprimées via ON DELETE CASCADE
      } catch (err) { notifyLegacy('Erreur suppression : ' + err.message, 'error'); return; }
    } else {
      setEtablissements(prev => prev.filter(e=>e.id!==id));
    }
    setShowConfirm(null);
  };

  const handleReset = () => {
    if (typeof scResetAllData === 'function') scResetAllData();
  };

  return (
    <div style={ps.root}>
      <div style={ps.banner}>
        <div>
          <div style={ps.bannerTitle}>Gestion des établissements</div>
          <div style={ps.bannerSub}>Ajoutez, modifiez ou archivez les établissements de votre portefeuille clients.</div>
        </div>
        <button style={ps.addBtn} onClick={openAdd}>+ Ajouter un établissement</button>
      </div>

      <div style={ps.statsRow}>
        <div style={ps.statCard}><div style={ps.statLabel}>Établissements total</div><div style={ps.statVal}>{etablissements.length}</div></div>
        <div style={ps.statCard}><div style={ps.statLabel}>Actifs</div><div style={{...ps.statVal,color:'#15803d'}}>{etablissements.filter(e=>e.actif!==false).length}</div></div>
        <div style={ps.statCard}><div style={ps.statLabel}>En suivi consultant</div><div style={ps.statVal}>{etablissements.length}</div></div>
      </div>

      <div style={ps.listCard}>
        <div style={ps.listHeader}>
          <div style={ps.listTitle}>Tous les établissements</div>
        </div>
        {etablissements.length === 0 && (
          <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize:13}}>Aucun établissement. Cliquez sur "Ajouter un établissement" pour commencer.</div>
        )}
        {(etablissements || []).map(etab => (
          <div key={etab.id} style={{...ps.etabRow, opacity: etab.actif===false?0.5:1}}>
            <div style={{...ps.etabColor, background:etab.couleur||'var(--accent)'}}/>
            <div style={ps.etabInfo}>
              <div style={ps.etabNom}>
                {etab.nom}
                {etab.actif===false && <span style={ps.inactifBadge}>Inactif</span>}
              </div>
              <div style={ps.etabMeta}>{etab.type} · {etab.adresse || 'Adresse non renseignée'}</div>
              {etab.tel && <div style={ps.etabMeta}>{etab.tel}{etab.email && ` · ${etab.email}`}</div>}
            </div>
            <div style={{display:'flex',gap:8,flexShrink:0}}>
              <button style={ps.ghostBtn} onClick={()=>openEdit(etab)}>Modifier</button>
              <button style={{...ps.ghostBtn,color:'#dc2626',borderColor:'#fca5a5'}} onClick={()=>setShowConfirm(etab.id)}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>

      {/* Compte consultant */}
      <div style={ps.listCard}>
        <div style={ps.listHeader}>
          <div style={ps.listTitle}>Mon compte consultant</div>
        </div>
        <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={ps.field}>
              <label style={ps.fLabel}>Nom</label>
              <div style={ps.readField}>{user.prenom} {user.nom}</div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Rôle</label>
              <div style={ps.readField}>{demoData.roles[user.role]?.label}</div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>E-mail principal</label>
              <div style={ps.readField}>{user.email}</div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Poste</label>
              <div style={ps.readField}>{user.poste}</div>
            </div>
          </div>
          <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#92400e' }}>
            🔐 Mot de passe et identifiants gérés par l'administrateur Samper Consulting.
          </div>
        </div>
      </div>

      {/* Maintenance */}
      <div style={ps.listCard}>
        <div style={ps.listHeader}>
          <div style={ps.listTitle}>Maintenance des données</div>
        </div>
        <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>
            Réinitialiser toutes les données de l'application aux valeurs de démonstration : planning, recettes, inventaires, pertes, utilisateurs, établissements, permissions, HACCP, fiches salle. Le logo personnalisé sera également supprimé.
          </div>
          <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#991b1b' }}>
            ⚠ <strong>Action irréversible.</strong> Toutes les données saisies seront effacées. Exportez vos documents importants avant de continuer.
          </div>
          <div>
            <button style={{...ps.saveBtn, background:'#dc2626', width:'auto', padding:'10px 20px'}} onClick={handleReset}>
              🔄 Réinitialiser toutes les données
            </button>
          </div>
        </div>
      </div>

      {showForm && <EtabForm etab={editEtab} onSave={save} onCancel={()=>setShowForm(false)}/>}

      {showConfirm && (
        <div style={ps.overlay} onClick={()=>setShowConfirm(null)}>
          <div style={{...ps.modal, width:420}} onClick={e=>e.stopPropagation()}>
            <div style={ps.modalHeader}>
              <div style={ps.modalTitle}>Confirmer la suppression</div>
              <button style={ps.closeBtn} onClick={()=>setShowConfirm(null)}>✕</button>
            </div>
            <div style={ps.modalBody}>
              <div style={{fontSize:14,color:'var(--text)',lineHeight:1.6,marginBottom:20}}>
                Voulez-vous vraiment supprimer <strong>{etablissements.find(e=>e.id===showConfirm)?.nom}</strong> ?<br/>
                <span style={{color:'#dc2626',fontSize:13}}>Cette action est irréversible. Les données associées (planning, recettes, inventaires) seront dissociées.</span>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button style={ps.cancelBtn} onClick={()=>setShowConfirm(null)}>Annuler</button>
                <button style={{...ps.saveBtn,background:'#dc2626'}} onClick={()=>confirmDelete(showConfirm)}>Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ps = {
  root: { display:'flex', flexDirection:'column', gap:16 },
  banner: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, background:'linear-gradient(135deg, var(--nav) 0%, #333 100%)', color:'#fff', padding:'22px 26px', borderRadius:12, flexWrap:'wrap' },
  bannerTitle: { fontSize:18, fontWeight:700, fontFamily:'var(--font-serif)', color:'#fff' },
  bannerSub: { fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:4 },
  addBtn: { padding:'10px 18px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' },
  statsRow: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 },
  statCard: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 18px' },
  statLabel: { fontSize:11, fontWeight:600, color:'var(--text2)', textTransform:'uppercase', letterSpacing:0.4, marginBottom:6 },
  statVal: { fontSize:22, fontWeight:700, fontFamily:'var(--font-serif)', color:'var(--text)' },
  listCard: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' },
  listHeader: { padding:'14px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg)' },
  listTitle: { fontSize:13, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:0.4 },
  etabRow: { display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' },
  etabColor: { width:6, height:38, borderRadius:3, flexShrink:0 },
  etabInfo: { flex:1, minWidth:200 },
  etabNom: { fontSize:14, fontWeight:600, color:'var(--text)', display:'flex', alignItems:'center', gap:8 },
  etabMeta: { fontSize:12, color:'var(--text2)', marginTop:2 },
  inactifBadge: { fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#f3f4f6', color:'#6b7280' },
  ghostBtn: { padding:'7px 14px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'var(--font)' },
  field: { display:'flex', flexDirection:'column', gap:4 },
  fLabel: { fontSize:11, fontWeight:600, color:'var(--text2)', textTransform:'uppercase', letterSpacing:0.4 },
  fInput: { padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', boxSizing:'border-box', outline:'none', width:'100%' },
  readField: { padding:'9px 12px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text)' },
  toggle: { width:40, height:22, borderRadius:11, position:'relative', cursor:'pointer', transition:'background .15s' },
  toggleThumb: { position:'absolute', top:2, width:18, height:18, background:'#fff', borderRadius:'50%', transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:12 },
  modal: { background:'var(--surface)', borderRadius:14, width:560, maxWidth:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 22px', borderBottom:'1px solid var(--border)' },
  modalTitle: { fontWeight:700, fontSize:16, fontFamily:'var(--font-serif)' },
  closeBtn: { background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text2)' },
  modalBody: { padding:'22px' },
  cancelBtn: { padding:'9px 16px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'var(--font)' },
  saveBtn: { padding:'9px 18px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' },
};

export default Parametres;
