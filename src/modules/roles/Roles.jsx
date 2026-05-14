import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────
// RÔLES & ACCÈS + GESTION DES UTILISATEURS (CRUD)
// ─────────────────────────────────────────────────────

const Roles = ({ user }) => {
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [activeTab, setActiveTab] = React.useState('permissions');
  const DEFAULT_PERMS = React.useMemo(() => JSON.parse(JSON.stringify({
    consultant:   { dashboard:true, planning:true, recettes:true, cartes:true, inventaire:true, pertes:true, haccp:true, fiches_salle:true, documents:true, roles:true, parametres:true, consultant_tools:true, factures:true, catalogue:true, sop:true, faq:true },
    patron:       { dashboard:true, planning:true, recettes:true, cartes:true, inventaire:true, pertes:true, haccp:true, fiches_salle:true, documents:true, roles:false, parametres:true, consultant_tools:false, factures:false, catalogue:true, sop:true, faq:true },
    resp_cuisine: { dashboard:true, planning:true, recettes:true, cartes:false, inventaire:true, pertes:true, haccp:true, fiches_salle:true, documents:true, roles:false, parametres:false, consultant_tools:false, factures:false, catalogue:true, sop:true, faq:true },
    cuisinier:    { dashboard:true, planning:true, recettes:true, cartes:false, inventaire:false, pertes:true, haccp:true, fiches_salle:false, documents:true, roles:false, parametres:false, consultant_tools:false, factures:false, catalogue:true, sop:true, faq:true },
    serveur:      { dashboard:true, planning:true, recettes:false, cartes:true, inventaire:false, pertes:false, haccp:false, fiches_salle:true, documents:true, roles:false, parametres:false, consultant_tools:false, factures:false, catalogue:false, sop:true, faq:true }
  })), []);
  const [selected, setSelected] = React.useState('consultant');
  const [permissions, setPermissions] = React.useState(() => mergePermissionDefaults(readLegacyStorage('sc_permissions', DEFAULT_PERMS), DEFAULT_PERMS));
  const [utilisateurs, setUtilisateurs] = React.useState(() => readLegacyStorage('sc_utilisateurs', demoData.utilisateurs));
  const [editingUser, setEditingUser] = React.useState(null);
  const [showUserForm, setShowUserForm] = React.useState(false);
  const canEdit = user.role === 'consultant';

  // ═══ Charger depuis Supabase + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) return;
    let unsub1 = null, unsub2 = null;

    const reload = async () => {
      try {
        const [profiles, perms] = await Promise.all([
          legacySB.db.listProfiles(),
          legacySB.db.listPermissions(),
        ]);
        const mapped = profiles.map(p => ({
          id: p.id, email: p.email, prenom: p.prenom, nom: p.nom,
          avatar: p.avatar || ((p.prenom?.[0] || '') + (p.nom?.[0] || '')).toUpperCase(),
          role: p.role, poste: p.poste,
          etablissementIds: p.etablissement_ids || [],
          actif: p.actif,
        }));
        setUtilisateurs(mapped);
        demoData.utilisateurs = mapped;
        if (perms && Object.keys(perms).length) {
          setPermissions(p => mergePermissionDefaults({ ...p, ...perms }, DEFAULT_PERMS));
          demoData.permissions = { ...demoData.permissions, ...perms };
        }
      } catch (err) { console.error('[Roles reload]', err); }
    };

    reload();
    unsub1 = legacySB.realtime.subscribe('profiles', reload);
    unsub2 = legacySB.realtime.subscribe('permissions', reload);
    return () => { unsub1 && unsub1(); unsub2 && unsub2(); };
  }, []);

  const MODULES = [
    { id:'dashboard',       label:'Tableau de bord' },
    { id:'planning',        label:'Planning & Pointage' },
    { id:'recettes',        label:'Cartes & Recettes' },
    { id:'inventaire',      label:'Inventaire' },
    { id:'pertes',          label:'Pertes' },
    { id:'haccp',           label:'HACCP' },
    { id:'fiches_salle',    label:'Fiches salle' },
    { id:'documents',       label:'Documents' },
    { id:'factures',        label:'Factures' },
    { id:'catalogue',       label:'Catalogue produits' },
    { id:'sop',             label:'SOPs & Checklists' },
    { id:'roles',           label:'Rôles & Accès' },
    { id:'parametres',      label:'Établissements' },
    { id:'consultant_tools',label:'Outils consultant' },
    { id:'faq',             label:'FAQ & Assistant IA' },
  ];
  const roles = Object.entries(demoData.roles);

  React.useEffect(() => {
    demoData.permissions = permissions;
    writeLegacyStorage('sc_permissions', permissions);
  }, [permissions]);

  React.useEffect(() => {
    demoData.utilisateurs = utilisateurs;
    writeLegacyStorage('sc_utilisateurs', utilisateurs);
  }, [utilisateurs]);

  const togglePerm = async (roleKey, moduleId) => {
    if (!canEdit) return;
    const newPerms = { ...permissions[roleKey], [moduleId]: !permissions[roleKey][moduleId] };
    setPermissions(prev => ({ ...prev, [roleKey]: newPerms }));
    if (legacySB) {
      try { await legacySB.db.upsertPermissions(roleKey, newPerms); }
      catch (err) { notifyLegacy('Erreur sauvegarde permissions : ' + err.message, 'error'); }
    }
  };

  const resetDefaults = async () => {
    if (!confirmLegacy('Réinitialiser toutes les permissions par défaut ?')) return;
    const fresh = JSON.parse(JSON.stringify(DEFAULT_PERMS));
    setPermissions(fresh);
    if (legacySB) {
      try {
        for (const [roleKey, perms] of Object.entries(fresh)) {
          await legacySB.db.upsertPermissions(roleKey, perms);
        }
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
    }
  };

  const allowAll = async (roleKey, value) => {
    if (!canEdit) return;
    const next = { ...permissions[roleKey] };
    MODULES.forEach(m => { next[m.id] = value; });
    if (roleKey !== 'consultant') { next.consultant_tools = false; next.roles = false; }
    setPermissions(prev => ({ ...prev, [roleKey]: next }));
    if (legacySB) {
      try { await legacySB.db.upsertPermissions(roleKey, next); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
    }
  };

  // ═══════════════ USER CRUD ═══════════════
  const openNewUser = () => {
    setEditingUser({
      id: null, prenom: '', nom: '', email: '', password: '',
      role: 'cuisinier', poste: '', avatar: '',
      etablissementIds: [demoData.etablissements[0]?.id].filter(Boolean),
      actif: true,
    });
    setShowUserForm(true);
  };

  const openEditUser = (u) => { setEditingUser({ ...u, password: '' }); setShowUserForm(true); };

  const saveUser = async () => {
    const u = editingUser;
    if (!u.prenom || !u.nom || !u.email) { alertLegacy('Prénom, nom et e-mail sont requis.'); return; }
    if (!u.etablissementIds || u.etablissementIds.length === 0) { alertLegacy('Attribuez au moins un établissement.'); return; }
    const avatar = u.avatar || (u.prenom[0] + u.nom[0]).toUpperCase();

    if (legacySB) {
      if (u.id) {
        // Mise à jour d'un profil existant
        try {
          await legacySB.db.updateProfile(u.id, {
            prenom: u.prenom, nom: u.nom, email: u.email,
            role: u.role, poste: u.poste, avatar,
            etablissement_ids: u.etablissementIds, actif: u.actif !== false,
          });
        } catch (err) { notifyLegacy('Erreur mise à jour : ' + err.message, 'error'); return; }
      } else {
        // Nouveau compte : créer via Edge Function
        if (!u.password || u.password.length < 6) {
          alertLegacy('Mot de passe requis (6 caractères minimum).');
          return;
        }
        try {
          await legacySB.db.createUserViaEdge({
            email: u.email.trim().toLowerCase(),
            password: u.password,
            prenom: u.prenom, nom: u.nom,
            role: u.role, poste: u.poste || null,
            etablissement_ids: u.etablissementIds,
          });
          alertLegacy(`✓ Utilisateur ${u.prenom} ${u.nom} créé avec succès.\n\nTransmettez-lui :\n• Email : ${u.email}\n• Mot de passe : ${u.password}\n\nIl pourra se connecter immédiatement.`);
        } catch (err) {
          notifyLegacy('Erreur lors de la création : ' + err.message + '\n\nVérifiez que les Edge Functions "create-user" et "delete-user" sont bien déployées sur Supabase.', 'error');
          return;
        }
      }
    } else {
      // fallback local
      if (u.id) {
        setUtilisateurs(prev => prev.map(x => x.id === u.id ? { ...u, avatar } : x));
      } else {
        setUtilisateurs(prev => [...prev, { ...u, id: 'u' + Date.now(), avatar }]);
      }
    }

    setShowUserForm(false);
    setEditingUser(null);
  };

  const deleteUser = async (u) => {
    if (u.id === user.id) { alertLegacy('Vous ne pouvez pas supprimer votre propre compte.'); return; }
    if (u.role === 'consultant') { notifyLegacy('Impossible de supprimer un compte consultant.', 'error'); return; }
    if (!confirmLegacy(
      `Supprimer le compte de ${u.prenom} ${u.nom} ?\n\n` +
      'Le compte d\'authentification et toutes ses données seront supprimés définitivement.'
    )) return;

    if (legacySB) {
      try {
        await legacySB.db.deleteUserViaEdge(u.id);
        setUtilisateurs(prev => prev.filter(x => x.id !== u.id));
      } catch (err) {
        notifyLegacy('Erreur suppression : ' + err.message + '\n\nVérifiez que l\'Edge Function "delete-user" est déployée.', 'error');
      }
    } else {
      setUtilisateurs(prev => prev.filter(x => x.id !== u.id));
    }
  };

  const toggleUserActif = async (u) => {
    const newActif = u.actif === false;
    if (legacySB) {
      try {
        await legacySB.db.updateProfile(u.id, { actif: newActif });
        setUtilisateurs(prev => prev.map(x => x.id === u.id ? { ...x, actif: newActif } : x));
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
    } else {
      setUtilisateurs(prev => prev.map(x => x.id === u.id ? { ...x, actif: newActif } : x));
    }
  };

  const toggleEtabForUser = (etabId) => {
    const current = editingUser.etablissementIds || [];
    const next = current.includes(etabId) ? current.filter(id => id !== etabId) : [...current, etabId];
    setEditingUser({ ...editingUser, etablissementIds: next });
  };

  return (
    <div style={ros.root}>
      <div style={ros.tabs} className="no-print">
        <button style={{ ...ros.tab, ...(activeTab === 'permissions' ? ros.tabActive : {}) }} onClick={() => setActiveTab('permissions')}>Permissions par rôle</button>
        <button style={{ ...ros.tab, ...(activeTab === 'users' ? ros.tabActive : {}) }} onClick={() => setActiveTab('users')}>Utilisateurs ({utilisateurs.length})</button>
        <div style={{ flex: 1 }} />
        {canEdit && activeTab === 'permissions' && <button style={ros.ghostBtn} onClick={resetDefaults}>↻ Réinitialiser</button>}
        {canEdit && activeTab === 'users' && <button style={ros.addBtn} onClick={openNewUser}>+ Nouvel utilisateur</button>}
      </div>

      {activeTab === 'permissions' ? (
        <div style={ros.permLayout}>
          <div style={ros.rolesCol}>
            {roles.map(([key, info]) => (
              <div key={key} style={{ ...ros.roleItem, ...(selected === key ? ros.roleActive : {}) }} onClick={() => setSelected(key)}>
                <div style={{ width: 10, height: 10, borderRadius: 4, background: info.couleur, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{info.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{utilisateurs.filter(u => u.role === key).length} utilisateur{utilisateurs.filter(u => u.role === key).length > 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={ros.modulesCol}>
            <div style={ros.modulesHeader}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>{demoData.roles[selected]?.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Modules accessibles</div>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={ros.smallGhost} onClick={() => allowAll(selected, true)}>Tout cocher</button>
                  <button style={ros.smallGhost} onClick={() => allowAll(selected, false)}>Tout décocher</button>
                </div>
              )}
            </div>
            <div style={ros.moduleList}>
              {MODULES.map(m => {
                const val = !!permissions[selected]?.[m.id];
                return (
                  <label key={m.id} style={{ ...ros.moduleRow, cursor: canEdit ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.7 }}>
                    <input type="checkbox" checked={val} onChange={() => togglePerm(selected, m.id)} disabled={!canEdit} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{m.label}</span>
                    <span style={{ ...ros.permBadge, background: val ? '#dcfce7' : '#fee2e2', color: val ? '#15803d' : '#dc2626' }}>
                      {val ? '✓ Autorisé' : '✕ Interdit'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={ros.usersWrap}>
          {(utilisateurs || []).map(u => {
            const role = demoData.roles[u.role];
            const etabs = demoData.etablissements.filter(e => u.etablissementIds?.includes(e.id));
            return (
              <div key={u.id} style={ros.userRow}>
                <div style={{ ...ros.userAvatar, background: role?.couleur || '#888' }}>{u.avatar}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{u.prenom} {u.nom}
                    {u.actif === false && <span style={{ ...ros.permBadge, background: '#f3f4f6', color: '#6b7280', marginLeft: 8 }}>Inactif</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{u.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {role?.label} · {u.poste || '—'} · {etabs.map(e => e.nom).join(', ') || 'Aucun établissement'}
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={ros.smallGhost} onClick={() => toggleUserActif(u)}>{u.actif === false ? 'Activer' : 'Désactiver'}</button>
                    <button style={ros.smallGhost} onClick={() => openEditUser(u)}>Modifier</button>
                    <button style={{ ...ros.smallGhost, color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => deleteUser(u)}>Supprimer</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showUserForm && editingUser && (
        <div style={ros.overlay} onClick={() => setShowUserForm(false)}>
          <div style={ros.modal} onClick={e => e.stopPropagation()}>
            <div style={ros.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>{editingUser.id ? 'Modifier utilisateur' : 'Nouvel utilisateur'}</div>
              <button style={ros.closeBtn} onClick={() => setShowUserForm(false)}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={ros.fieldLabel}>Prénom</label><input type="text" style={ros.fieldInput} value={editingUser.prenom} onChange={e => setEditingUser({ ...editingUser, prenom: e.target.value })} /></div>
                <div><label style={ros.fieldLabel}>Nom</label><input type="text" style={ros.fieldInput} value={editingUser.nom} onChange={e => setEditingUser({ ...editingUser, nom: e.target.value })} /></div>
              </div>
              <div><label style={ros.fieldLabel}>E-mail</label><input type="email" style={ros.fieldInput} value={editingUser.email} onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} disabled={!!editingUser.id}/></div>
              {!editingUser.id && (
                <div>
                  <label style={ros.fieldLabel}>Mot de passe temporaire *</label>
                  <div style={{display:'flex', gap:8}}>
                    <input type="text" style={{...ros.fieldInput, flex:1, fontFamily:'monospace'}} value={editingUser.password || ''} placeholder="Min. 6 caractères"
                      onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}/>
                    <button type="button" style={{...ros.smallGhost, whiteSpace:'nowrap'}} onClick={() => {
                      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
                      const pwd = Array.from({length:10}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                      setEditingUser({ ...editingUser, password: pwd });
                    }}>🎲 Générer</button>
                  </div>
                  <div style={{fontSize:11, color:'var(--text2)', marginTop:4}}>Vous devrez transmettre ce mot de passe à l'utilisateur. Il pourra le changer après sa première connexion.</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={ros.fieldLabel}>Rôle</label>
                  <select style={ros.fieldInput} value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}>
                    {Object.entries(demoData.roles).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><label style={ros.fieldLabel}>Poste / Fonction</label><input type="text" style={ros.fieldInput} value={editingUser.poste} placeholder="Ex: Cheffe de partie" onChange={e => setEditingUser({ ...editingUser, poste: e.target.value })} /></div>
              </div>
              <div>
                <label style={ros.fieldLabel}>Établissements attribués</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {(demoData.etablissements || []).map(e => (
                    <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={editingUser.etablissementIds?.includes(e.id)} onChange={() => toggleEtabForUser(e.id)} style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: 13 }}>{e.nom}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>— {e.type}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={editingUser.actif !== false} onChange={e => setEditingUser({ ...editingUser, actif: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
                  Compte actif
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button style={ros.ghostBtn} onClick={() => setShowUserForm(false)}>Annuler</button>
                <button style={ros.addBtn} onClick={saveUser}>{editingUser.id ? 'Enregistrer' : 'Créer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function mergePermissionDefaults(value, defaults) {
  const saved = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([role, roleDefaults]) => [
      role,
      { ...roleDefaults, ...(saved[role] || {}) },
    ])
  );
}

const ros = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  tabs: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' },
  tab: { padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)' },
  tabActive: { background: 'var(--nav)', color: '#fff', borderColor: 'var(--nav)' },
  addBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  ghostBtn: { padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' },
  smallGhost: { padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' },
  permLayout: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14 },
  rolesCol: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  roleItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s' },
  roleActive: { background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)' },
  modulesCol: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' },
  modulesHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexWrap: 'wrap', gap: 10 },
  moduleList: { display: 'flex', flexDirection: 'column' },
  moduleRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' },
  permBadge: { fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, whiteSpace: 'nowrap' },
  usersWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  userRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' },
  userAvatar: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 14, width: 500, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
};

if (getBrowserWindow()?.innerWidth < 768) {
  ros.permLayout = { ...ros.permLayout, gridTemplateColumns: '1fr' };
}

export default Roles;
