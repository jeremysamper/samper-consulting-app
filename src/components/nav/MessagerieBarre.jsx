import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Btn } from '../ui/index.jsx';
import { roles as roleConfig } from '../../modules/moduleConfig.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { surChangementMessages } from '../../hooks/useUnreadPrivateMessages.js';
import { messageErreur } from '../../utils/messageErreur.js';
import {
  MAX_LENGTH, buildContacts, formatDay, formatListDate, formatTime, fullName, groupConversations, initialsOf,
} from '../../modules/messages/conversations.js';

// ─────────────────────────────────────────────────────────────────────────────
// Messagerie de la barre du haut : l'icône (badge des non-lus, le même chiffre
// que la barre latérale et la tuile) et le panneau qu'elle ouvre. Menu
// déroulant sur ordinateur et tablette, feuille plein écran sur téléphone.
//
// Mêmes appels que la page Messages : liste et profils lus à l'ouverture,
// marquage lu de la conversation ouverte seulement, champ vidé seulement quand
// l'envoi a réussi. Aucun canal realtime de plus : le panneau relit sur les
// changements signalés par le canal du badge (useUnreadPrivateMessages).
//
// Une seule entrée d'historique à la fois (liste ou conversation) : « retour »
// dans une conversation ramène à la liste, puis referme ; « Fermer » depuis une
// conversation ne laisse aucune entrée orpheline.
// ─────────────────────────────────────────────────────────────────────────────

export default function MessagerieBarre({ user, open, onOpenChange, unread = 0, shellMode, onToutVoir, btnStyle, dotStyle, iconSize = 18 }) {
  const telephone = shellMode === 'telephone';
  const legacySB = dbService.getBridge();
  const [profiles, setProfiles] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [charge, setCharge] = React.useState(false);
  const [filId, setFilId] = React.useState(null);
  // Brouillons par interlocuteur : gardés quand on change de conversation ou
  // qu'on referme le panneau.
  const [brouillons, setBrouillons] = React.useState({});
  const [sending, setSending] = React.useState(false);
  const filRef = React.useRef(null);
  const composerRef = React.useRef(null);

  const filIdRef = React.useRef(filId);
  filIdRef.current = filId;
  const surRetour = React.useCallback(() => {
    if (filIdRef.current) setFilId(null);
    else onOpenChange(false);
  }, [onOpenChange]);
  useBackLayer(open, surRetour, filId ? 'messagerie-fil' : 'messagerie');

  React.useEffect(() => { if (!open) setFilId(null); }, [open]);

  React.useEffect(() => {
    if (!open || !legacySB) return undefined;
    let actif = true;
    (async () => {
      try {
        const [profileRows, msgRows] = await Promise.all([
          legacySB.db.listProfiles(),
          legacySB.db.listAllPrivateMessages(),
        ]);
        if (!actif) return;
        setProfiles(profileRows || []);
        setMessages(msgRows || []);
      } catch (err) { console.error('[MessagerieBarre]', err); }
      finally { if (actif) setCharge(true); }
    })();
    const off = surChangementMessages(async () => {
      try {
        const rows = await legacySB.db.listAllPrivateMessages();
        if (actif) setMessages(rows || []);
      } catch { /* la prochaine notification relira */ }
    });
    return () => { actif = false; off(); };
  }, [open, user.id, legacySB]);

  const profileById = React.useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const conversations = React.useMemo(() => groupConversations(messages, user.id), [messages, user.id]);
  const contacts = React.useMemo(
    () => buildContacts({ conversations, profiles, profileById, userId: user.id, search: '' }),
    [conversations, profiles, profileById, user.id],
  );
  const selected = filId ? (profileById.get(filId) || null) : null;
  const thread = React.useMemo(
    () => (filId ? [...(conversations.get(filId) || [])].reverse() : []),
    [conversations, filId],
  );

  // Marquage lu : la conversation ouverte, panneau ouvert, comme la page.
  React.useEffect(() => {
    if (!open || !filId || !legacySB) return;
    const hasUnread = thread.some((m) => m.recipientId === user.id && !m.readAt);
    if (!hasUnread) return;
    Promise.resolve(legacySB.db.markPrivateMessagesRead(user.id, filId))
      .then(() => window.dispatchEvent(new Event('sc:messages-read')));
    const now = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (
      m.senderId === filId && m.recipientId === user.id && !m.readAt ? { ...m, readAt: now } : m
    )));
  }, [open, filId, thread, user.id, legacySB]);

  React.useEffect(() => {
    const el = filRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, filId, open]);

  const draft = (filId && brouillons[filId]) || '';
  const setDraft = (value) => setBrouillons((b) => ({ ...b, [filId]: value }));

  const ouvrirFil = (id) => {
    setFilId(id);
    if (shellMode === 'ordinateur') requestAnimationFrame(() => composerRef.current?.focus());
  };

  const send = async () => {
    const id = filId;
    const brut = brouillons[id] || '';
    const text = brut.trim();
    if (!text || !id || sending) return;
    if (text.length > MAX_LENGTH) {
      notifyLegacy(`Message trop long (${MAX_LENGTH} caractères au maximum)`, 'warning');
      return;
    }
    setSending(true);
    try {
      const sent = await legacySB.db.sendPrivateMessage(id, text, user.id);
      setMessages((prev) => [sent, ...prev.filter((m) => m.id !== sent.id)]);
      // Vidé seulement s'il n'a pas changé pendant l'envoi.
      setBrouillons((b) => {
        if (b[id] !== brut) return b;
        const next = { ...b };
        delete next[id];
        return next;
      });
      composerRef.current?.focus();
    } catch (err) {
      notifyLegacy('Message non envoyé. ' + messageErreur(err, 'messages'), 'error');
    } finally { setSending(false); }
  };

  const liste = (
    <div style={st.defile}>
      {!charge && <div style={st.vide}>Chargement…</div>}
      {charge && contacts.length === 0 && <div style={st.vide}>Aucun contact disponible.</div>}
      {contacts.map(({ id, profile, last, unread: nonLus }) => {
        const role = roleConfig[profile?.role] || { label: profile?.role || '' };
        const preview = last ? `${last.senderId === user.id ? 'Vous : ' : ''}${last.message}` : role.label;
        return (
          <button key={id} type="button" style={st.contact} onClick={() => ouvrirFil(id)}>
            <span style={st.avatar}>{initialsOf(profile)}</span>
            <span style={st.contactCorps}>
              <span style={st.contactHaut}>
                <span style={st.contactNom}>{fullName(profile)}</span>
                {last && <span style={st.contactDate}>{formatListDate(last.createdAt)}</span>}
              </span>
              <span style={st.contactBas}>
                <span style={{ ...st.apercu, color: nonLus ? 'var(--text)' : 'var(--text2)' }}>{preview}</span>
                {nonLus > 0 && (
                  <span style={st.nonLus} aria-label={`${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}`}>{nonLus}</span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );

  let lastDay = null;
  const fil = filId && (
    <>
      <div style={st.filTete}>
        <Btn variant="ghost" onClick={() => setFilId(null)} style={st.retour}>
          <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Retour</span>
        </Btn>
        <span style={st.avatar}>{initialsOf(selected)}</span>
        <span style={{ minWidth: 0 }}>
          <span style={st.filNom}>{fullName(selected)}</span>
          <span style={st.filRole}>{(roleConfig[selected?.role] || { label: selected?.role || '' }).label}</span>
        </span>
      </div>
      <div style={{ ...st.defile, ...st.fil }} ref={filRef} role="log" aria-live="polite" aria-label={`Conversation avec ${fullName(selected)}`}>
        {thread.length === 0 && <div style={st.vide}>Aucun message pour l'instant. Écrivez le premier.</div>}
        {thread.map((m) => {
          const mine = m.senderId === user.id;
          const day = formatDay(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div style={st.jour}>{day}</div>}
              <div style={mine ? st.bulleMoi : st.bulleAutre}>
                <div style={st.bulleTexte}>{m.message}</div>
                <div style={{ ...st.bulleMeta, textAlign: mine ? 'right' : 'left' }}>
                  {formatTime(m.createdAt)}
                  {mine && (
                    <span style={{ color: m.readAt ? 'var(--success-text)' : 'var(--text3)', fontWeight: 700 }}>
                      {m.readAt ? ', lu' : ', envoyé'}
                    </span>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={st.composer}>
        <textarea
          ref={composerRef}
          style={st.champ}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/⌘ + Entrée envoie ; Entrée seule garde le retour à la ligne.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
          }}
          placeholder={`Écrire à ${selected?.prenom || fullName(selected)}…`}
          aria-label={`Message pour ${fullName(selected)}`}
          maxLength={MAX_LENGTH}
          rows={2}
        />
        <Btn variant="primary" onClick={send} disabled={!draft.trim() || sending} style={st.envoyer}>
          {sending ? 'Envoi…' : 'Envoyer'}
        </Btn>
      </div>
    </>
  );

  // Les clics restent dans le panneau : la coque referme sur un clic dehors.
  // Téléphone : role="region" et non role="dialog", que la règle mobile
  // d'app.css décolle des bords (margin 8px) ; la feuille couvre l'écran.
  const panneau = open && (
    <div
      style={telephone ? st.feuille : { ...st.deroulant, top: shellMode === 'ordinateur' ? 46 : 44 }}
      role={telephone ? 'region' : 'dialog'}
      aria-label="Messages"
      onClick={(e) => e.stopPropagation()}
    >
      <div style={st.tete}>
        <span style={st.titre}>Messages</span>
        <button type="button" style={st.lien} onClick={onToutVoir}>Tout voir</button>
        {telephone && (
          <Btn variant="ghost" onClick={() => onOpenChange(false)} ariaLabel="Fermer la messagerie" style={st.fermer}>Fermer</Btn>
        )}
      </div>
      {fil || liste}
    </div>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="app-bar-btn"
        style={btnStyle}
        onClick={(e) => { e.stopPropagation(); onOpenChange(!open); }}
        aria-label={unread > 0 ? `Messages (${unread} non lu${unread > 1 ? 's' : ''})` : 'Messages'}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Messages"
      >
        <MessageSquare size={iconSize} strokeWidth={2} aria-hidden="true" />
        {unread > 0 && <div style={dotStyle}>{unread}</div>}
      </button>
      {/* Téléphone : rendue dans <body>, le flou de la barre du haut
          (backdrop-filter) ferait de la barre le cadre d'un élément fixe. */}
      {telephone ? (panneau && createPortal(panneau, document.body)) : panneau}
    </div>
  );
}

const st = {
  deroulant: {
    position: 'absolute', right: 0, width: 380, maxWidth: 'calc(100vw - 24px)',
    height: 'min(560px, calc(100vh - 90px))', display: 'flex', flexDirection: 'column',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-lg)', zIndex: 200, overflow: 'hidden', fontFamily: 'var(--font)',
  },
  // Au-dessus de la barre du haut (50), au niveau des fenêtres des modules.
  feuille: {
    position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
    background: 'var(--surface)', fontFamily: 'var(--font)',
    paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
  },
  tete: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, minHeight: 52, boxSizing: 'border-box' },
  titre: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  lien: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: '8px 6px', minHeight: 44, flexShrink: 0 },
  fermer: { minHeight: 44, flexShrink: 0 },
  // flex 1 + minHeight 0 : seule la liste (ou le fil) défile, l'en-tête et le
  // champ restent en place.
  defile: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, padding: 6 },
  vide: { padding: 14, textAlign: 'center', color: 'var(--text2)', fontSize: 12, fontStyle: 'italic' },
  // flexShrink 0 : la règle tactile globale (min-height 44px) superposerait
  // sinon les lignes dans une colonne flex qui défile.
  contact: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px', background: 'transparent', border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 56, flexShrink: 0 },
  avatar: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface2)', color: 'var(--text2)', fontWeight: 700, fontSize: 12, flexShrink: 0 },
  contactCorps: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  contactHaut: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 },
  contactNom: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  contactDate: { fontSize: 11, color: 'var(--text3)', flexShrink: 0 },
  contactBas: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  apercu: { flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nonLus: { minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  filTete: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 6px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  retour: { minHeight: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 },
  filNom: { display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  filRole: { display: 'block', fontSize: 11, color: 'var(--text2)' },
  fil: { gap: 8, padding: 12, background: 'var(--bg)' },
  jour: { alignSelf: 'center', fontSize: 11, fontWeight: 500, color: 'var(--text3)', padding: '4px 0', margin: '4px 0', flexShrink: 0 },
  bulleMoi: { alignSelf: 'flex-end', background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', borderRadius: '14px 14px 4px 14px', padding: '8px 12px', maxWidth: '82%', minWidth: 0, flexShrink: 0 },
  bulleAutre: { alignSelf: 'flex-start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '8px 12px', maxWidth: '82%', minWidth: 0, flexShrink: 0 },
  bulleTexte: { fontSize: 14, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' },
  bulleMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 4 },
  composer: { display: 'flex', alignItems: 'flex-end', gap: 8, padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0 },
  champ: { flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'none', lineHeight: 1.5 },
  envoyer: { flexShrink: 0 },
};
