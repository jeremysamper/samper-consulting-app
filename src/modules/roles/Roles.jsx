import React from 'react';
import { getDemoData, getRoleInfo } from '../../data/demoData.js';
import {
  manageableModules, getDefaultManageRoles, navItems, defaultPermissions, rolesEcritureBase,
} from '../moduleConfig.js';
import { alertLegacy, confirmLegacy, notifyLegacy, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { profileService } from '../../services/supabase.js';
import { useModuleLabels } from '../../hooks/useModuleLabels.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import PhoneLink from '../../components/PhoneLink.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// RÔLES & ACCÈS : les comptes et leurs droits, personne par personne.
//
// Un seul écran (demande de Jérémy, 30.09.2026) : à gauche l'équipe, à droite
// la personne choisie avec, pour chaque module, « Accès » (le voir dans le
// menu) et « Modifier » (créer, modifier, supprimer). Il y avait trois onglets
// (permissions par rôle, droits d'action, utilisateurs) et tout se réglait par
// rôle.
//
// Le rôle reste le point de départ : ses droits (table `permissions`, complétés
// par les défauts du code) s'appliquent tant qu'on n'a rien changé. Une case
// changée n'enregistre que l'ÉCART de cette personne à son rôle (table
// `permissions_utilisateurs`) ; « Revenir aux droits du rôle » efface ses
// écarts. Le consultant voit et gère tout, il n'a rien à régler.
// ═══════════════════════════════════════════════════════════════════════════

// Modules réglables : ceux du menu. Les outils du consultant (et ses pages
// Factures, Établissements, Rôles & accès) sont réservés à son rôle par
// LegacyModuleHost : aucune case ne pourrait les ouvrir à quelqu'un d'autre.
const MODULES = navItems.filter((n) => n.permKey !== 'consultant_tools');
const GERABLES = new Set(manageableModules.map((m) => m.id));

// Gardes dures par rôle dans LegacyModuleHost : ces modules ne s'ouvrent qu'à
// ces rôles, quelle que soit la case.
const ACCES_RESERVE = {
  kds: ['consultant', 'resp_cuisine', 'cuisinier'],
};

const aCle = (obj, cle) => Object.prototype.hasOwnProperty.call(obj || {}, cle);
const cleGerer = (moduleId) => 'manage:' + moduleId;

const listeRoles = (liste) => liste.map((r) => getRoleInfo(r).label).join(', ');

// Droits de départ d'un rôle (base + défauts du code), pour un module.
function droitsDuRole(rolePerms, role, moduleId) {
  const base = { ...(defaultPermissions[role] || {}), ...(rolePerms[role] || {}) };
  const acces = base[moduleId] !== false;
  const gerer = aCle(base, cleGerer(moduleId))
    ? !!base[cleGerer(moduleId)]
    : getDefaultManageRoles(moduleId).includes(role);
  return { acces, gerer };
}

// État d'un module pour une personne : droits du rôle, écarts appliqués,
// verrous (rôle hors de la garde du module, base qui refuse l'écriture).
function etatModule(rolePerms, personne, ecarts, moduleId) {
  const role = personne.role;
  const duRole = droitsDuRole(rolePerms, role, moduleId);
  const reserveA = ACCES_RESERVE[moduleId];
  const accesVerrouille = !!reserveA && !reserveA.includes(role);
  const ecriture = rolesEcritureBase[moduleId];
  const gererVerrouille = !GERABLES.has(moduleId) || (!!ecriture && !ecriture.includes(role));
  const acces = accesVerrouille ? false : (aCle(ecarts, moduleId) ? !!ecarts[moduleId] : duRole.acces);
  const gererBrut = aCle(ecarts, cleGerer(moduleId)) ? !!ecarts[cleGerer(moduleId)] : duRole.gerer;
  return {
    duRole,
    acces,
    gerer: !gererVerrouille && acces && gererBrut,
    accesVerrouille,
    gererVerrouille,
    reserveA,
    ecriture,
    ajuste: aCle(ecarts, moduleId) || aCle(ecarts, cleGerer(moduleId)),
  };
}

// Case à cocher avec une cible de 44 px : une case nue de 16 px se rate au
// doigt sur l'iPad, et le tap raté passe pour un bug.
function Case({ checked, disabled, onChange, label }) {
  return (
    <label style={{
      width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
    }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: disabled ? 'default' : 'pointer' }}
      />
    </label>
  );
}

const Roles = ({ user }) => {
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const isMobile = useIsMobile();
  const { getLabelForModule } = useModuleLabels();
  const [rolePerms, setRolePerms] = React.useState(() => demoData.permissions || {});
  const [utilisateurs, setUtilisateurs] = React.useState(() => demoData.utilisateurs || []);
  // Écarts de chaque personne. null tant qu'ils ne sont pas lus : sans eux,
  // l'écran montrerait les droits du rôle et un clic écraserait des écarts
  // existants.
  const [ecartsParId, setEcartsParId] = React.useState(null);
  const [erreurEcarts, setErreurEcarts] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const [recherche, setRecherche] = React.useState('');
  const [editingUser, setEditingUser] = React.useState(null);
  const [showUserForm, setShowUserForm] = React.useState(false);
  // Téléphones saisis par chacun dans « Mon compte » (table profile_contacts) :
  // lecture seule ici, seul le titulaire modifie son numéro.
  const [phones, setPhones] = React.useState({});
  const canEdit = user.role === 'consultant';

  // Les écritures d'une même personne partent l'une après l'autre, et chacune
  // envoie l'état le plus récent : deux cases cochées vite ne peuvent pas
  // arriver dans le désordre et laisser en base l'avant-dernier état.
  const ecartsRef = React.useRef({});
  ecartsRef.current = ecartsParId || {};
  const fileRef = React.useRef({});
  const ecritureEnCoursRef = React.useRef({});
  const reloadRef = React.useRef(null);

  // ═══ Charger depuis Supabase + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) return undefined;
    let vivant = true;

    const reload = async () => {
      try {
        const [profiles, perms, contacts] = await Promise.all([
          legacySB.db.listProfiles(),
          legacySB.db.listPermissions(),
          // Un échec de lecture des numéros ne doit pas vider la liste des comptes.
          profileService.listContacts().catch((err) => { console.warn('[Roles] téléphones', err); return null; }),
        ]);
        if (!vivant) return;
        if (contacts) setPhones(contacts);
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
          setRolePerms((prev) => ({ ...prev, ...perms }));
          demoData.permissions = { ...demoData.permissions, ...perms };
        }
      } catch (err) { console.error('[Roles reload]', err); }

      try {
        const ecarts = await legacySB.db.listPermissionsUtilisateurs();
        if (!vivant) return;
        // Une écriture en cours garde la main : la relecture ne doit pas
        // remettre à l'écran l'état d'avant le dernier clic.
        setEcartsParId((prev) => {
          if (!prev) return ecarts;
          const suite = { ...ecarts };
          for (const id of Object.keys(ecritureEnCoursRef.current)) {
            if (prev[id]) suite[id] = prev[id]; else delete suite[id];
          }
          return suite;
        });
        setErreurEcarts(false);
      } catch (err) {
        console.error('[Roles] droits personnels', err);
        if (vivant) setErreurEcarts(true);
      }
    };

    reloadRef.current = reload;
    reload();
    const unsub = legacySB.realtime.subscribeReload(['profiles', 'permissions', 'permissions_utilisateurs'], reload);
    return () => { vivant = false; unsub && unsub(); };
  }, []);

  React.useEffect(() => {
    demoData.utilisateurs = utilisateurs;
    writeLegacyStorage('sc_utilisateurs', utilisateurs);
  }, [utilisateurs]);

  // ═══════════════ DROITS D'UNE PERSONNE ═══════════════
  function enregistrerEcarts(personne, suivant) {
    const id = personne.id;
    const avant = ecartsRef.current[id];
    const next = { ...ecartsRef.current };
    if (Object.keys(suivant).length) next[id] = suivant; else delete next[id];
    ecartsRef.current = next;
    setEcartsParId(next);
    ecritureEnCoursRef.current[id] = (ecritureEnCoursRef.current[id] || 0) + 1;
    fileRef.current[id] = (fileRef.current[id] || Promise.resolve()).then(async () => {
      try {
        await legacySB.db.setPermissionsUtilisateur(id, ecartsRef.current[id] || {});
      } catch (err) {
        notifyLegacy(`Droits de ${personne.prenom} ${personne.nom} non enregistrés : ${err.message}`, 'error');
        const retour = { ...ecartsRef.current };
        if (avant && Object.keys(avant).length) retour[id] = avant; else delete retour[id];
        ecartsRef.current = retour;
        setEcartsParId(retour);
      } finally {
        ecritureEnCoursRef.current[id] -= 1;
        if (!ecritureEnCoursRef.current[id]) delete ecritureEnCoursRef.current[id];
      }
    });
  }

  // Une case qui revient à la valeur du rôle n'est plus un écart : la clé est
  // retirée, et la personne retombe sur son rôle pour ce module.
  function basculer(personne, cle, valeurDuRole, valeurActuelle) {
    if (!canEdit || !legacySB || ecartsParId === null) return;
    const suivant = { ...(ecartsRef.current[personne.id] || {}) };
    const nouvelle = !valeurActuelle;
    if (nouvelle === valeurDuRole) delete suivant[cle]; else suivant[cle] = nouvelle;
    enregistrerEcarts(personne, suivant);
  }

  function revenirAuRole(personne) {
    if (!canEdit || ecartsParId === null) return;
    if (!confirmLegacy(`Rendre à ${personne.prenom} ${personne.nom} les droits de son rôle (${getRoleInfo(personne.role).label}) ?`)) return;
    enregistrerEcarts(personne, {});
  }

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

  const openEditUser = (u) => { setEditingUser({ ...u, password: '', _originalEmail: u.email || '' }); setShowUserForm(true); };

  const saveUser = async () => {
    const u = editingUser;
    if (!u.prenom || !u.nom || !u.email) { alertLegacy('Prénom, nom et e-mail sont requis.'); return; }
    if (!u.etablissementIds || u.etablissementIds.length === 0) { alertLegacy('Attribuez au moins un établissement.'); return; }
    const avatar = u.avatar || (u.prenom[0] + u.nom[0]).toUpperCase();

    if (legacySB) {
      if (u.id) {
        // Mise à jour d'un profil existant
        const newEmail = u.email.trim().toLowerCase();
        const emailChanged = newEmail !== (u._originalEmail || '').trim().toLowerCase();
        const wantsPassword = !!(u.password && u.password.length);

        if (wantsPassword && u.password.length < 6) {
          alertLegacy('Le mot de passe doit contenir au moins 6 caractères.');
          return;
        }

        // 1. Changement d'identifiants auth (e-mail / mot de passe) via Edge Function.
        //    Fait en premier : si ça échoue, on n'altère pas le profil.
        if (emailChanged || wantsPassword) {
          try {
            await legacySB.db.updateUserAuthViaEdge({
              user_id: u.id,
              email: emailChanged ? newEmail : undefined,
              password: wantsPassword ? u.password : undefined,
            });
          } catch (err) {
            notifyLegacy('Erreur mise à jour des identifiants : ' + err.message + '\n\nVérifiez que l\'Edge Function "update-user" est déployée.', 'error');
            return;
          }
        }

        // 2. Mise à jour des champs de profil.
        try {
          await legacySB.db.updateProfile(u.id, {
            prenom: u.prenom, nom: u.nom, email: newEmail,
            role: u.role, poste: u.poste, avatar,
            etablissement_ids: u.etablissementIds, actif: u.actif !== false,
          });
        } catch (err) { notifyLegacy('Erreur mise à jour : ' + err.message, 'error'); return; }

        if (emailChanged || wantsPassword) {
          const parts = [];
          if (emailChanged) parts.push('Email : ' + newEmail);
          if (wantsPassword) parts.push('Mot de passe : ' + u.password);
          alertLegacy(`✓ Identifiants de ${u.prenom} ${u.nom} mis à jour.\n\nTransmettez-lui :\n• ${parts.join('\n• ')}`);
        }
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


  // ═══════════════ RENDU ═══════════════
  const correspond = makeSearchMatcher(recherche);
  const personnes = [...(utilisateurs || [])]
    .filter((u) => correspond(`${u.prenom || ''} ${u.nom || ''} ${u.email || ''} ${u.poste || ''} ${getRoleInfo(u.role).label}`))
    .sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr'));
  const choisie = (utilisateurs || []).find((u) => u.id === selectedId) || null;
  // Sur grand écran, la première personne est ouverte d'office : un panneau
  // vide à droite ne dit pas quoi faire.
  const affichee = choisie || (!isMobile ? personnes[0] || null : null);

  const listePersonnes = (
    <div style={ros.peopleCol}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher une personne…"
          aria-label="Chercher une personne"
          style={ros.fieldInput}
        />
      </div>
      {personnes.length === 0 && (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>Aucune personne trouvée.</div>
      )}
      {personnes.map((u) => {
        const role = getRoleInfo(u.role);
        const ajustee = !!(ecartsParId && ecartsParId[u.id] && Object.keys(ecartsParId[u.id]).length);
        const active = affichee?.id === u.id;
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => setSelectedId(u.id)}
            style={{ ...ros.personRow, ...(active ? ros.personActive : {}) }}
          >
            <div style={{ ...ros.userAvatar, width: 34, height: 34, fontSize: 12, background: role.couleur || '#888' }}>{u.avatar}</div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.prenom} {u.nom}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {role.label}{u.poste ? ` · ${u.poste}` : ''}
              </div>
            </div>
            {u.actif === false && <span style={{ ...ros.permBadge, background: 'var(--surface2)', color: 'var(--text2)' }}>Inactif</span>}
            {ajustee && <span style={{ ...ros.permBadge, background: 'var(--accent-light)', color: 'var(--accent)' }}>Ajusté</span>}
          </button>
        );
      })}
    </div>
  );

  let panneau = null;
  if (affichee) {
    const u = affichee;
    const role = getRoleInfo(u.role);
    const etabs = (demoData.etablissements || []).filter(e => u.etablissementIds?.includes(e.id));
    const ecarts = (ecartsParId && ecartsParId[u.id]) || {};
    const ajustee = Object.keys(ecarts).length > 0;
    const estConsultant = u.role === 'consultant';
    const casesActives = canEdit && ecartsParId !== null && !estConsultant;

    panneau = (
      <div style={ros.modulesCol}>
        {/* ── La personne ── */}
        <div style={{ ...ros.modulesHeader, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12, minWidth: 0, flex: 1 }}>
            <div style={{ ...ros.userAvatar, background: role.couleur || '#888' }}>{u.avatar}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
                {u.prenom} {u.nom}
                {u.actif === false && <span style={{ ...ros.permBadge, background: 'var(--surface2)', color: 'var(--text2)', marginLeft: 8 }}>Inactif</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, overflowWrap: 'anywhere' }}>
                {u.email}
                {phones[u.id] && (<>{' · '}<PhoneLink tel={phones[u.id]} /></>)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {role.label}{u.poste ? ` · ${u.poste}` : ''} · {etabs.map(e => e.nom).join(', ') || 'Aucun établissement'}
              </div>
            </div>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={ros.smallGhost} onClick={() => openEditUser(u)}>Modifier le compte</button>
              <button style={ros.smallGhost} onClick={() => toggleUserActif(u)}>{u.actif === false ? 'Activer' : 'Désactiver'}</button>
              {u.id !== user.id && !estConsultant && (
                <button style={{ ...ros.smallGhost, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }} onClick={() => deleteUser(u)}>Supprimer</button>
              )}
            </div>
          )}
        </div>

        {/* ── Ses droits ── */}
        {estConsultant ? (
          <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
            Accès complet : le rôle Consultant voit et gère tous les modules, il n'y a rien à régler.
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--text2)', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200, lineHeight: 1.5 }}>
                Les cases partent des droits du rôle <strong>{role.label}</strong>. Ce que tu changes ne concerne que {u.prenom}.
                {' '}« Accès » : le module apparaît dans son menu. « Modifier » : il peut y créer, modifier et supprimer.
              </span>
              {canEdit && ajustee && (
                <button style={ros.smallGhost} onClick={() => revenirAuRole(u)} disabled={ecartsParId === null}>
                  Revenir aux droits du rôle
                </button>
              )}
            </div>
            {erreurEcarts && (
              <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--danger-text)', background: 'var(--danger-bg-soft)', borderBottom: '1px solid var(--danger-bd)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>
                  Les droits personnels n'ont pas pu être lus. Les cases sont bloquées pour ne pas écraser des réglages existants.
                </span>
                <button style={ros.smallGhost} onClick={() => reloadRef.current?.()}>Réessayer</button>
              </div>
            )}
            <div style={{ ...ros.moduleRow, padding: '8px 18px', background: 'var(--bg)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <span style={{ flex: 1 }}>Module</span>
              <span style={{ width: 44, textAlign: 'center' }}>Accès</span>
              <span style={{ width: 44, textAlign: 'center' }}>Modifier</span>
            </div>
            <div style={ros.moduleList}>
              {MODULES.map((m) => {
                const e = etatModule(rolePerms, u, ecarts, m.permKey);
                const label = getLabelForModule(m.id, m.label);
                const notes = [];
                if (e.accesVerrouille) notes.push(`Réservé aux rôles ${listeRoles(e.reserveA)}`);
                else {
                  if (e.ajuste) {
                    const roleGere = GERABLES.has(m.permKey) && e.duRole.acces ? (e.duRole.gerer ? ', modifie' : ', consulte') : '';
                    notes.push(`Ajusté pour ${u.prenom} (rôle : ${e.duRole.acces ? 'accès' : 'pas d’accès'}${roleGere})`);
                  }
                  // Case « Modifier » grisée : dire pourquoi, sinon elle passe
                  // pour un bug.
                  if (e.acces && GERABLES.has(m.permKey) && e.ecriture && !e.ecriture.includes(u.role)) {
                    notes.push(`Consultation seule : la base réserve l’écriture aux rôles ${listeRoles(e.ecriture)}`);
                  }
                }
                const note = notes.length ? notes.join('. ') : null;
                return (
                  <div key={m.permKey} style={{ ...ros.moduleRow, padding: '2px 18px', opacity: e.accesVerrouille ? 0.6 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0, padding: '8px 0' }}>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
                      {note && (
                        <div style={{ fontSize: 11, marginTop: 2, color: e.ajuste ? 'var(--accent)' : 'var(--text3)' }}>{note}</div>
                      )}
                    </div>
                    <Case
                      checked={e.acces}
                      disabled={!casesActives || e.accesVerrouille}
                      label={`Accès à ${label} pour ${u.prenom}`}
                      onChange={() => basculer(u, m.permKey, e.duRole.acces, e.acces)}
                    />
                    {GERABLES.has(m.permKey) ? (
                      <Case
                        checked={e.gerer}
                        disabled={!casesActives || e.gererVerrouille || !e.acces}
                        label={`Modifier dans ${label} pour ${u.prenom}`}
                        onChange={() => basculer(u, cleGerer(m.permKey), e.duRole.gerer, e.gerer)}
                      />
                    ) : (
                      <span title="Rien à régler : ce module n'a pas d'actions réservées" style={{ width: 44, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>-</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={ros.root}>
      <div style={ros.tabs} className="no-print">
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {utilisateurs.length} compte{utilisateurs.length > 1 ? 's' : ''} · les droits se règlent personne par personne
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && <button style={ros.addBtn} onClick={openNewUser}>+ Nouvel utilisateur</button>}
      </div>

      {isMobile ? (
        affichee ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button style={{ ...ros.ghostBtn, alignSelf: 'flex-start', minHeight: 44 }} onClick={() => setSelectedId(null)}>← Toute l'équipe</button>
            {panneau}
          </div>
        ) : listePersonnes
      ) : (
        <div style={ros.permLayout}>
          {listePersonnes}
          {panneau || (
            <div style={{ ...ros.modulesCol, padding: 24, fontSize: 13, color: 'var(--text3)' }}>Choisis une personne.</div>
          )}
        </div>
      )}

      {showUserForm && editingUser && (
        <div className="modal-full-overlay" style={ros.overlay} onClick={() => setShowUserForm(false)}>
          <div className="modal-full" style={ros.modal} onClick={e => e.stopPropagation()}>
            <div style={ros.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>{editingUser.id ? 'Modifier utilisateur' : 'Nouvel utilisateur'}</div>
              <button style={ros.closeBtn} onClick={() => setShowUserForm(false)}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={ros.fieldLabel}>Prénom</label><input type="text" style={ros.fieldInput} value={editingUser.prenom} onChange={e => setEditingUser({ ...editingUser, prenom: e.target.value })} /></div>
                <div><label style={ros.fieldLabel}>Nom</label><input type="text" style={ros.fieldInput} value={editingUser.nom} onChange={e => setEditingUser({ ...editingUser, nom: e.target.value })} /></div>
              </div>
              <div>
                <label style={ros.fieldLabel}>E-mail</label>
                <input type="email" style={ros.fieldInput} value={editingUser.email} onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} />
                {editingUser.id && (
                  <div style={{fontSize:11, color:'var(--text2)', marginTop:4}}>Modifier l'e-mail change aussi l'identifiant de connexion de l'utilisateur.</div>
                )}
              </div>
              <div>
                <label style={ros.fieldLabel}>{editingUser.id ? 'Nouveau mot de passe' : 'Mot de passe temporaire *'}</label>
                <div style={{display:'flex', gap:8}}>
                  <input type="text" style={{...ros.fieldInput, flex:1, fontFamily:'var(--font)'}} value={editingUser.password || ''} placeholder={editingUser.id ? 'Laisser vide pour ne pas changer' : 'Min. 6 caractères'}
                    onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}/>
                  <button type="button" style={{...ros.smallGhost, whiteSpace:'nowrap'}} onClick={() => {
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
                    const pwd = Array.from({length:10}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                    setEditingUser({ ...editingUser, password: pwd });
                  }}>🎲 Générer</button>
                </div>
                <div style={{fontSize:11, color:'var(--text2)', marginTop:4}}>
                  {editingUser.id
                    ? 'Renseignez un mot de passe uniquement pour le réinitialiser, puis transmettez-le à l\'utilisateur.'
                    : 'Vous devrez transmettre ce mot de passe à l\'utilisateur. Il pourra le changer après sa première connexion.'}
                </div>
              </div>
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
                      <span style={{ fontSize: 11, color: 'var(--text2)' }}>- {e.type}</span>
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

const ros = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  tabs: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  addBtn: { padding: '8px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40 },
  ghostBtn: { padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' },
  smallGhost: { padding: '6px 10px', minHeight: 36, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' },
  permLayout: { display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14, alignItems: 'start' },
  peopleCol: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  personRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', minHeight: 52, background: 'transparent', borderWidth: 0, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'transparent', cursor: 'pointer', fontFamily: 'var(--font)' },
  personActive: { background: 'var(--accent-light)', borderLeftColor: 'var(--accent)' },
  modulesCol: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', overflow: 'hidden', minWidth: 0 },
  modulesHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap', gap: 10 },
  moduleList: { display: 'flex', flexDirection: 'column' },
  moduleRow: { display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' },
  permBadge: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap', flexShrink: 0 },
  userAvatar: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 14, width: 500, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
};

export default Roles;
