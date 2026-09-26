// ═══════════════════════════════════════════════════════════════
// MESSAGERIE PRIVÉE - conversations à deux, pour tous les rôles.
// Chacun écrit aux comptes qu'il voit (collègues de ses établissements et
// consultant) ; une conversation n'est lisible que par ses deux participants
// (RLS, migration 20260926_messagerie_bidirectionnelle).
// Liste des conversations à gauche (ou seule sur mobile), fil à droite.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { ArrowLeft, MessageSquare, Send, X } from 'lucide-react';
import { Btn, SectionHeader } from '../../components/ui/index.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { roles as roleConfig } from '../moduleConfig.js';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { normalizeSearch } from '../../utils/searchText.js';

const MAX_LENGTH = 4000;

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Date courte pour la liste : heure si aujourd'hui, sinon jour.
function formatListDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return formatTime(iso);
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
}

function initialsOf(profile) {
  if (profile?.avatar) return profile.avatar;
  const p = (profile?.prenom || '')[0] || '';
  const n = (profile?.nom || '')[0] || '';
  return (p + n).toUpperCase() || '?';
}

function fullName(profile) {
  if (!profile) return 'Compte inconnu';
  return `${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.email || 'Compte inconnu';
}

const Messages = ({ user, isActive = true }) => {
  const isMobile = useIsMobile();
  const legacySB = dbService.getBridge();
  const [profiles, setProfiles] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const threadRef = React.useRef(null);
  const composerRef = React.useRef(null);

  // Mobile : le fil ouvert est un calque, « retour » ramène à la liste.
  const closeThread = React.useCallback(() => setSelectedId(null), []);
  useBackLayer(isMobile && Boolean(selectedId), closeThread, 'message-thread');

  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return undefined; }
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
      } catch (err) { console.error('[Messages]', err); }
      finally { if (mounted) setLoading(false); }
    };
    load();
    const unsub = legacySB.realtime.subscribeReload('private_messages', async () => {
      try {
        const rows = await legacySB.db.listAllPrivateMessages();
        if (mounted) setMessages(rows || []);
      } catch { /* la prochaine notification relira */ }
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [user.id]);

  const profileById = React.useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  // Conversations : messages regroupés par interlocuteur, du plus récent au plus ancien.
  const conversations = React.useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const otherId = m.senderId === user.id ? m.recipientId : m.senderId;
      if (!map.has(otherId)) map.set(otherId, []);
      map.get(otherId).push(m);
    }
    return map;
  }, [messages, user.id]);

  // Contacts : conversations existantes d'abord (dernier message en tête),
  // puis les autres comptes actifs par ordre alphabétique.
  const contacts = React.useMemo(() => {
    const ids = new Set(conversations.keys());
    profiles.forEach((p) => { if (p.id !== user.id && p.actif !== false) ids.add(p.id); });
    ids.delete(user.id);
    const rows = [...ids].map((id) => {
      const msgs = conversations.get(id) || [];
      const last = msgs[0] || null;
      const unread = msgs.filter((m) => m.recipientId === user.id && !m.readAt).length;
      return { id, profile: profileById.get(id) || null, last, unread };
    });
    rows.sort((a, b) => {
      if (a.last && b.last) return new Date(b.last.createdAt) - new Date(a.last.createdAt);
      if (a.last) return -1;
      if (b.last) return 1;
      return fullName(a.profile).localeCompare(fullName(b.profile), 'fr');
    });
    if (!search.trim()) return rows;
    const q = normalizeSearch(search.trim());
    return rows.filter((r) => normalizeSearch(`${fullName(r.profile)} ${r.profile?.email || ''}`).includes(q));
  }, [conversations, profiles, profileById, search, user.id]);

  const selected = selectedId ? (profileById.get(selectedId) || null) : null;
  const thread = React.useMemo(
    () => (selectedId ? [...(conversations.get(selectedId) || [])].reverse() : []),
    [conversations, selectedId],
  );

  // Marquage lu : seulement la conversation ouverte, et seulement quand le
  // module est réellement affiché (il peut rester monté masqué).
  React.useEffect(() => {
    if (!isActive || !selectedId || !legacySB) return;
    const hasUnread = thread.some((m) => m.recipientId === user.id && !m.readAt);
    if (!hasUnread) return;
    Promise.resolve(legacySB.db.markPrivateMessagesRead(user.id, selectedId))
      .then(() => window.dispatchEvent(new Event('sc:messages-read')));
    const now = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (
      m.senderId === selectedId && m.recipientId === user.id && !m.readAt ? { ...m, readAt: now } : m
    )));
  }, [isActive, selectedId, thread, user.id]);

  // Fil : toujours calé sur le dernier message.
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, selectedId]);

  const openConversation = (id) => {
    setSelectedId(id);
    setDraft('');
    if (!isMobile) requestAnimationFrame(() => composerRef.current?.focus());
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !selectedId || sending) return;
    if (text.length > MAX_LENGTH) {
      notifyLegacy(`Message trop long (${MAX_LENGTH} caractères au maximum)`, 'warning');
      return;
    }
    setSending(true);
    try {
      const sent = await legacySB.db.sendPrivateMessage(selectedId, text, user.id);
      setMessages((prev) => [sent, ...prev.filter((m) => m.id !== sent.id)]);
      setDraft('');
      composerRef.current?.focus();
    } catch (err) {
      notifyLegacy("Message non envoyé : " + (err?.message || 'erreur inconnue'), 'error');
    } finally { setSending(false); }
  };

  const remove = async (msg) => {
    if (!confirmLegacy('Supprimer ce message ? Il disparaîtra aussi chez votre interlocuteur.')) return;
    try {
      await legacySB.db.deletePrivateMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err) { notifyLegacy('Suppression impossible : ' + err.message, 'error'); }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;
  }

  const listPanel = (
    <div style={ms.listPanel}>
      <div style={ms.listHead}>
        <span style={ms.listTitle}>Conversations</span>
        <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher une personne…" />
      </div>
      <div style={ms.contactList}>
        {contacts.length === 0 && (
          <div style={ms.emptyHint}>{search ? 'Aucun compte trouvé.' : 'Aucun contact disponible.'}</div>
        )}
        {contacts.map(({ id, profile, last, unread }) => {
          const role = roleConfig[profile?.role] || { label: profile?.role || '', color: 'var(--accent)' };
          const active = selectedId === id;
          const preview = last
            ? `${last.senderId === user.id ? 'Vous : ' : ''}${last.message}`
            : role.label;
          return (
            <button
              key={id}
              type="button"
              style={{ ...ms.contactRow, ...(active ? ms.contactRowActive : {}) }}
              onClick={() => openConversation(id)}
              aria-current={active ? 'true' : undefined}
            >
              <span style={{ ...ms.avatar, background: role.color }}>{initialsOf(profile)}</span>
              <span style={ms.contactBody}>
                <span style={ms.contactTop}>
                  <span style={{ ...ms.contactName, fontWeight: unread ? 800 : 700 }}>{fullName(profile)}</span>
                  {last && <span style={ms.contactDate}>{formatListDate(last.createdAt)}</span>}
                </span>
                <span style={ms.contactBottom}>
                  <span style={{ ...ms.contactPreview, color: unread ? 'var(--text)' : 'var(--text2)' }}>{preview}</span>
                  {unread > 0 && (
                    <span style={ms.unreadBadge} aria-label={`${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}`}>{unread}</span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  let lastDay = null;
  const threadPanel = !selectedId ? (
    <div style={ms.threadEmpty}>
      <MessageSquare size={34} strokeWidth={1.5} aria-hidden="true" style={{ opacity: 0.35, color: 'var(--text2)' }} />
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>Choisissez une personne</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, maxWidth: 320 }}>
        Chaque conversation est privée : seuls vous et votre interlocuteur la voyez.
      </div>
    </div>
  ) : (
    <div style={ms.threadPanel}>
      <div style={ms.threadHead}>
        {isMobile && (
          <button type="button" style={ms.backBtn} onClick={closeThread} aria-label="Retour aux conversations">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        )}
        <span style={{ ...ms.avatar, background: (roleConfig[selected?.role] || {}).color || 'var(--accent)' }}>
          {initialsOf(selected)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={ms.threadName}>{fullName(selected)}</div>
          <div style={ms.threadSub}>{(roleConfig[selected?.role] || { label: selected?.role || '' }).label}</div>
        </div>
      </div>

      <div style={ms.threadMessages} ref={threadRef} role="log" aria-live="polite" aria-label={`Conversation avec ${fullName(selected)}`}>
        {thread.length === 0 && (
          <div style={ms.emptyHint}>Aucun message pour l'instant. Écrivez le premier.</div>
        )}
        {thread.map((m) => {
          const mine = m.senderId === user.id;
          const day = formatDay(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div style={ms.dayDivider}><span>{day}</span></div>}
              <div style={{ ...ms.bubbleWrap, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                {mine && (
                  <button type="button" className="mini" style={ms.deleteBtn} onClick={() => remove(m)} title="Supprimer" aria-label="Supprimer le message">
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
                <div style={mine ? ms.bubbleMine : ms.bubbleTheirs}>
                  <div style={ms.bubbleText}>{m.message}</div>
                  <div style={{ ...ms.bubbleMeta, textAlign: mine ? 'right' : 'left' }}>
                    {formatTime(m.createdAt)}
                    {mine && (
                      <span style={{ color: m.readAt ? 'var(--success-text)' : 'var(--text3)', fontWeight: 700 }}>
                        {m.readAt ? ' · Lu' : ' · Envoyé'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div style={ms.composer}>
        <textarea
          ref={composerRef}
          style={ms.composerInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/⌘ + Entrée envoie ; Entrée seule garde le retour à la ligne.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
          }}
          placeholder={`Écrire à ${selected?.prenom || fullName(selected)}…`}
          aria-label={`Message pour ${fullName(selected)}`}
          maxLength={MAX_LENGTH}
          rows={isMobile ? 2 : 3}
        />
        <div style={ms.composerFoot}>
          {!isMobile && <span style={ms.composerHint}>Ctrl/⌘ + Entrée pour envoyer</span>}
          <Btn variant="primary" onClick={send} disabled={!draft.trim() || sending} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Send size={14} aria-hidden="true" />
            {sending ? 'Envoi…' : 'Envoyer'}
          </Btn>
        </div>
      </div>
    </div>
  );

  return (
    <div style={ms.root}>
      <SectionHeader
        title="Messagerie privée"
        sub="Écrivez à vos collègues et à votre consultant. Chaque conversation n'est visible que par ses deux participants."
      />
      {isMobile ? (
        selectedId ? threadPanel : listPanel
      ) : (
        <div style={ms.desktopGrid}>
          {listPanel}
          {threadPanel}
        </div>
      )}
    </div>
  );
};

const ms = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },

  desktopGrid: { display: 'grid', gridTemplateColumns: 'minmax(250px, 330px) minmax(0, 1fr)', gap: 14, alignItems: 'start' },

  // Liste des conversations
  listPanel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  listHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 4px' },
  listTitle: { fontSize: 12, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 },
  contactList: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '64vh', overflowY: 'auto' },
  // flexShrink 0 : dans une colonne flex scrollable, la règle tactile globale
  // (min-height 44px) superposerait sinon les lignes sur iPad.
  contactRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 8px', background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 56, flexShrink: 0 },
  contactRowActive: { borderColor: 'var(--accent-bd)', background: 'var(--accent-light)' },
  avatar: { width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 },
  contactBody: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  contactTop: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 },
  contactName: { flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  contactDate: { fontSize: 10.5, color: 'var(--text3)', flexShrink: 0 },
  contactBottom: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  contactPreview: { flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  unreadBadge: { minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, background: 'var(--accent)', color: 'var(--surface)', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // Fil de discussion
  threadPanel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', display: 'flex', flexDirection: 'column', minWidth: 0 },
  threadEmpty: { background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 12, padding: '44px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  threadHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' },
  backBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font)' },
  threadName: { fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  threadSub: { fontSize: 11, color: 'var(--text2)' },
  threadMessages: { display: 'flex', flexDirection: 'column', gap: 8, padding: 14, minHeight: 160, maxHeight: '52vh', overflowY: 'auto', background: 'var(--bg)' },
  dayDivider: { alignSelf: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text3)', padding: '4px 10px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', margin: '6px 0', textTransform: 'capitalize' },
  bubbleWrap: { display: 'flex', alignItems: 'flex-end', gap: 4 },
  bubbleMine: { background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', borderRadius: '14px 14px 4px 14px', padding: '8px 12px', maxWidth: '78%', minWidth: 0 },
  bubbleTheirs: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '8px 12px', maxWidth: '78%', minWidth: 0 },
  bubbleText: { fontSize: 14, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' },
  bubbleMeta: { fontSize: 10.5, color: 'var(--text2)', marginTop: 4 },
  deleteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, background: 'none', border: 'none', borderRadius: 6, color: 'var(--text3)', cursor: 'pointer', padding: 0, flexShrink: 0, marginBottom: 4 },
  composer: { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderTop: '1px solid var(--border)' },
  composerInput: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },
  composerFoot: { display: 'flex', alignItems: 'center', gap: 8 },
  composerHint: { fontSize: 11, color: 'var(--text3)' },

  emptyHint: { padding: 14, textAlign: 'center', color: 'var(--text2)', fontSize: 12, fontStyle: 'italic' },
};

export default Messages;
