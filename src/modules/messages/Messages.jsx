// ═══════════════════════════════════════════════════════════════
// MESSAGES PRIVÉS — Messagerie à sens unique : consultant → comptes
// Consultant : choisit un destinataire (tout compte, présent et futur),
// écrit, voit l'historique et l'accusé de lecture.
// Destinataire : boîte de réception en lecture seule + marquage lu.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { Btn, SectionHeader } from '../../components/ui/index.jsx';
import { roles as roleConfig } from '../moduleConfig.js';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

function formatMessageDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

function initialsOf(profile) {
  if (profile?.avatar) return profile.avatar;
  const p = (profile?.prenom || '')[0] || '';
  const n = (profile?.nom || '')[0] || '';
  return (p + n).toUpperCase() || '?';
}

const Messages = ({ user, isActive = true }) => {
  const isMobile = useIsMobile();
  const legacySB = dbService.getBridge();
  const isConsultant = user.role === 'consultant';

  return isConsultant
    ? <ConsultantView user={user} legacySB={legacySB} isMobile={isMobile} />
    : <InboxView user={user} legacySB={legacySB} isActive={isActive} />;
};

// ─────────────────────────────────────────────────────────────────
// VUE CONSULTANT — liste des comptes + fil d'envoi par destinataire
// ─────────────────────────────────────────────────────────────────
function ConsultantView({ user, legacySB, isMobile }) {
  const [profiles, setProfiles] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return; }
    let mounted = true;
    const load = async () => {
      try {
        const [profileRows, msgRows] = await Promise.all([
          legacySB.db.listProfiles(),
          legacySB.db.listAllPrivateMessages(),
        ]);
        if (!mounted) return;
        setProfiles(profileRows || []);
        setMessages(msgRows || []);
      } catch (err) { console.error('[Messages consultant]', err); }
      finally { if (mounted) setLoading(false); }
    };
    load();
    const unsub = legacySB.realtime.subscribeReload('private_messages', async () => {
      try { const rows = await legacySB.db.listAllPrivateMessages(); if (mounted) setMessages(rows || []); } catch (e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  // Tous les comptes sauf le consultant lui-même — les nouveaux comptes
  // apparaissent automatiquement (la liste vient de profiles).
  const recipients = profiles
    .filter(p => p.id !== user.id)
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return `${p.prenom || ''} ${p.nom || ''} ${p.email || ''}`.toLowerCase().includes(q);
    });

  const byRecipient = React.useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      if (!map.has(m.recipientId)) map.set(m.recipientId, []);
      map.get(m.recipientId).push(m);
    }
    return map; // messages déjà triés du plus récent au plus ancien
  }, [messages]);

  const selected = profiles.find(p => p.id === selectedId) || null;
  // Fil affiché du plus ancien au plus récent (composer en bas, comme un chat)
  const thread = selected ? [...(byRecipient.get(selected.id) || [])].reverse() : [];

  const send = async () => {
    const text = draft.trim();
    if (!text || !selected || sending) return;
    setSending(true);
    try {
      const sent = await legacySB.db.sendPrivateMessage(selected.id, text, user.id);
      setMessages(prev => [sent, ...prev]);
      setDraft('');
      notifyLegacy(`✓ Message envoyé à ${selected.prenom}`, 'success');
    } catch (err) {
      notifyLegacy('Erreur envoi : ' + err.message, 'error');
    } finally { setSending(false); }
  };

  const remove = async (msg) => {
    if (!confirmLegacy('Supprimer ce message ? Le destinataire ne le verra plus.')) return;
    try {
      await legacySB.db.deletePrivateMessage(msg.id);
      setMessages(prev => prev.filter(m => m.id !== msg.id));
    } catch (err) { notifyLegacy('Erreur suppression : ' + err.message, 'error'); }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;
  }

  const listPanel = (
    <div style={ms.listPanel}>
      <input
        style={ms.searchInput}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un compte…"
      />
      <div style={ms.recipientList}>
        {recipients.length === 0 && (
          <div style={ms.emptyHint}>Aucun compte trouvé.</div>
        )}
        {recipients.map(p => {
          const msgs = byRecipient.get(p.id) || [];
          const last = msgs[0];
          const unreadByThem = msgs.filter(m => !m.readAt).length;
          const role = roleConfig[p.role] || { label: p.role, color: 'var(--accent)' };
          const active = selectedId === p.id;
          return (
            <button
              key={p.id}
              style={{ ...ms.recipientRow, ...(active ? ms.recipientRowActive : {}) }}
              onClick={() => setSelectedId(p.id)}
            >
              <span style={{ ...ms.avatar, background: role.color }}>{initialsOf(p)}</span>
              <span style={ms.recipientBody}>
                <span style={ms.recipientName}>{p.prenom} {p.nom}</span>
                <span style={ms.recipientSub}>
                  {role.label}
                  {last ? ` · ${new Date(last.createdAt).toLocaleDateString('fr-CH')}` : ' · Aucun message'}
                </span>
              </span>
              {unreadByThem > 0 && <span style={ms.unreadPill}>{unreadByThem} non lu{unreadByThem > 1 ? 's' : ''}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const threadPanel = !selected ? (
    <div style={ms.threadEmpty}>
      <div style={{ fontSize: 34, opacity: 0.35, marginBottom: 8 }}>✉</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Choisissez un compte</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
        Vos messages sont privés : seul le destinataire choisi les voit.
      </div>
    </div>
  ) : (
    <div style={ms.threadPanel}>
      <div style={ms.threadHead}>
        {isMobile && (
          <button style={ms.backBtn} onClick={() => setSelectedId(null)} aria-label="Retour">←</button>
        )}
        <span style={{ ...ms.avatar, background: (roleConfig[selected.role] || {}).color || 'var(--accent)' }}>
          {initialsOf(selected)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={ms.threadName}>{selected.prenom} {selected.nom}</div>
          <div style={ms.threadSub}>{(roleConfig[selected.role] || { label: selected.role }).label}</div>
        </div>
      </div>

      <div style={ms.threadMessages}>
        {thread.length === 0 && (
          <div style={ms.emptyHint}>Aucun message envoyé à {selected.prenom} pour l'instant.</div>
        )}
        {thread.map(m => (
          <div key={m.id} style={ms.bubbleWrap}>
            <div style={ms.bubble}>
              <div style={ms.bubbleText}>{m.message}</div>
              <div style={ms.bubbleMeta}>
                {formatMessageDate(m.createdAt)}
                <span style={{ color: m.readAt ? 'var(--success-text)' : 'var(--text3)', fontWeight: 700 }}>
                  {m.readAt ? ' · ✓ Lu' : ' · Envoyé'}
                </span>
              </div>
            </div>
            <button style={ms.deleteBtn} onClick={() => remove(m)} title="Supprimer" aria-label="Supprimer le message">×</button>
          </div>
        ))}
      </div>

      <div style={ms.composer}>
        <textarea
          style={ms.composerInput}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={`Message privé pour ${selected.prenom}…`}
          rows={3}
        />
        <Btn variant="primary" onClick={send} disabled={!draft.trim() || sending} style={{ alignSelf: 'flex-end' }}>
          {sending ? 'Envoi…' : 'Envoyer'}
        </Btn>
      </div>
    </div>
  );

  return (
    <div style={ms.root}>
      <SectionHeader
        title="Messagerie privée"
        sub="Messages à sens unique : chaque compte reçoit uniquement ce que vous lui adressez"
      />
      {isMobile ? (
        selected ? threadPanel : listPanel
      ) : (
        <div style={ms.desktopGrid}>
          {listPanel}
          {threadPanel}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// VUE DESTINATAIRE — boîte de réception en lecture seule
// ─────────────────────────────────────────────────────────────────
function InboxView({ user, legacySB, isActive }) {
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  // Ids non lus capturés au chargement : le surlignage « Nouveau »
  // reste visible pendant la session même après le marquage lu en base.
  const [newIds, setNewIds] = React.useState(() => new Set());

  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return; }
    let mounted = true;
    const load = async () => {
      try {
        const rows = await legacySB.db.listPrivateMessages(user.id);
        if (!mounted) return;
        setMessages(rows || []);
        const unread = (rows || []).filter(m => !m.readAt).map(m => m.id);
        if (unread.length) setNewIds(prev => new Set([...prev, ...unread]));
      } catch (err) { console.error('[Messages inbox]', err); }
      finally { if (mounted) setLoading(false); }
    };
    load();
    const unsub = legacySB.realtime.subscribeReload('private_messages', load);
    return () => { mounted = false; unsub && unsub(); };
  }, [user.id]);

  // Marquage lu UNIQUEMENT quand la page est réellement affichée (le module
  // peut rester monté masqué via le keep-alive) : le badge nav repasse à zéro
  // via realtime, sans « lire » à la place de l'utilisateur.
  React.useEffect(() => {
    if (!isActive || !legacySB) return;
    if (!messages.some(m => !m.readAt)) return;
    legacySB.db.markPrivateMessagesRead(user.id);
    setMessages(prev => prev.map(m => m.readAt ? m : { ...m, readAt: new Date().toISOString() }));
  }, [isActive, messages, user.id]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;
  }

  return (
    <div style={ms.root}>
      <SectionHeader
        title="Messages du consultant"
        sub="Messagerie à sens unique : votre consultant vous écrit ici en privé"
      />
      {messages.length === 0 ? (
        <div style={ms.inboxEmpty}>
          <div style={{ fontSize: 34, opacity: 0.35, marginBottom: 8 }}>✉</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Aucun message pour l'instant</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            Les messages que Jérémy Samper vous adresse personnellement apparaîtront ici.
          </div>
        </div>
      ) : (
        <div style={ms.inboxList}>
          {messages.map(m => {
            const isNew = newIds.has(m.id);
            return (
              <div key={m.id} style={{ ...ms.inboxCard, ...(isNew ? ms.inboxCardNew : {}) }}>
                <div style={ms.inboxCardHead}>
                  <span style={ms.inboxSender}>Jérémy Samper</span>
                  {isNew && <span style={ms.newPill}>Nouveau</span>}
                </div>
                <div style={ms.inboxBody}>{m.message}</div>
                <div style={ms.inboxDate}>{formatMessageDate(m.createdAt)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ms = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },

  desktopGrid: { display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', gap: 14, alignItems: 'start' },

  // Liste destinataires
  listPanel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  searchInput: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  recipientList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '62vh', overflowY: 'auto' },
  recipientRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 56 },
  recipientRowActive: { border: '1px solid var(--accent)', background: 'var(--accent-light)' },
  avatar: { width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 },
  recipientBody: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  recipientName: { fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recipientSub: { fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  unreadPill: { fontSize: 10, fontWeight: 700, color: 'var(--warning-text)', background: 'var(--warning-bg)', border: '1px solid var(--warning-strong)', padding: '3px 8px', borderRadius: 99, whiteSpace: 'nowrap', flexShrink: 0 },

  // Fil de discussion
  threadPanel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', minWidth: 0 },
  threadEmpty: { background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' },
  threadHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' },
  backBtn: { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 18, color: 'var(--text)', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font)' },
  threadName: { fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  threadSub: { fontSize: 11, color: 'var(--text2)' },
  threadMessages: { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, minHeight: 120, maxHeight: '48vh', overflowY: 'auto' },
  bubbleWrap: { display: 'flex', alignItems: 'flex-start', gap: 6, justifyContent: 'flex-end' },
  bubble: { background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', borderRadius: '12px 12px 4px 12px', padding: '10px 12px', maxWidth: '85%', minWidth: 0 },
  bubbleText: { fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' },
  bubbleMeta: { fontSize: 10, color: 'var(--text2)', marginTop: 6 },
  deleteBtn: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0, fontFamily: 'var(--font)' },
  composer: { display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderTop: '1px solid var(--border)' },
  composerInput: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },

  // Boîte de réception
  inboxList: { display: 'flex', flexDirection: 'column', gap: 10 },
  inboxCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' },
  inboxCardNew: { border: '1px solid var(--accent)', background: 'var(--accent-light)' },
  inboxCardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  inboxSender: { fontSize: 12, fontWeight: 700, color: 'var(--accent)' },
  newPill: { fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '3px 9px', borderRadius: 99 },
  inboxBody: { fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' },
  inboxDate: { fontSize: 11, color: 'var(--text2)', marginTop: 8, fontWeight: 600 },
  inboxEmpty: { background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' },

  emptyHint: { padding: 14, textAlign: 'center', color: 'var(--text2)', fontSize: 12, fontStyle: 'italic' },
};

export default Messages;
