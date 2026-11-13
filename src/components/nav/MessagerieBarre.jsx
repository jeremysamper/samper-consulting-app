import React from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare } from 'lucide-react';
import { Btn } from '../ui/index.jsx';
import { roles as roleConfig } from '../../modules/moduleConfig.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { surChangementMessages } from '../../hooks/useUnreadPrivateMessages.js';
import { messageErreur } from '../../utils/messageErreur.js';
import {
  MAX_LENGTH, buildContacts, formatListDate, groupConversations,
} from '../../modules/messages/conversations.js';
import LignePersonne from '../../modules/messages/LignePersonne.jsx';
import FilConversation from '../../modules/messages/FilConversation.jsx';
import { useEnregistreur } from '../../modules/messages/useEnregistreur.js';
import { cibleDe, sm } from '../../modules/messages/messagerie.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// Messagerie de la barre du haut : l'icône (badge des non-lus, le même chiffre
// que la barre latérale et la tuile) et le panneau qu'elle ouvre. Menu
// déroulant sur ordinateur et tablette, feuille plein écran sur téléphone.
//
// Mêmes appels que la page Messages : liste et profils lus à l'ouverture,
// marquage lu de la conversation ouverte seulement, champ vidé seulement quand
// l'envoi a réussi. Aucun canal realtime de plus : le panneau relit sur les
// changements signalés par le canal du badge (useUnreadPrivateMessages). La
// ligne d'une personne et le fil sont ceux de la page (src/modules/messages).
//
// Une seule entrée d'historique à la fois (liste ou conversation) : « retour »
// dans une conversation ramène à la liste, puis referme ; « Fermer » depuis une
// conversation ne laisse aucune entrée orpheline.
// ─────────────────────────────────────────────────────────────────────────────

export default function MessagerieBarre({ user, open, onOpenChange, unread = 0, shellMode, onToutVoir, btnStyle, dotStyle, iconSize = 18 }) {
  const telephone = shellMode === 'telephone';
  const cible = cibleDe(shellMode !== 'ordinateur');
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

  // Vocal : abandonné, sans rien laisser, quand son fil n'est plus affiché
  // (autre conversation, retour à la liste, panneau refermé).
  const enregistreur = useEnregistreur({
    filAffiche: open ? filId : null,
    expediteur: user.id,
    onEnvoye: (sent) => setMessages((prev) => [sent, ...prev.filter((m) => m.id !== sent.id)]),
  });

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
    <div style={{ ...sm.liste, padding: 6 }}>
      {!charge && <div style={sm.vide}>Chargement…</div>}
      {charge && contacts.length === 0 && <div style={sm.vide}>Aucun contact disponible.</div>}
      {contacts.map(({ id, profile, last, unread: nonLus }) => (
        <LignePersonne
          key={id}
          profile={profile}
          date={last ? formatListDate(last.createdAt) : null}
          apercu={last ? `${last.senderId === user.id ? 'Vous : ' : ''}${last.message}` : (roleConfig[profile?.role] || { label: profile?.role || '' }).label}
          apercuDonnee={Boolean(last)}
          nonLus={nonLus}
          onClick={() => ouvrirFil(id)}
        />
      ))}
    </div>
  );

  const fil = filId && (
    <FilConversation
      userId={user.id}
      selected={selected}
      thread={thread}
      filRef={filRef}
      composerRef={composerRef}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      sending={sending}
      onRetour={() => setFilId(null)}
      rows={2}
      cible={cible}
      variante="panneau"
      enregistreur={enregistreur}
      onVocal={() => enregistreur.demarrer(filId)}
    />
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
    background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-lg)', zIndex: 200, overflow: 'hidden', fontFamily: 'var(--font)',
  },
  // Au-dessus de la barre du haut (50), au niveau des fenêtres des modules.
  feuille: {
    position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
    background: 'var(--surface)', fontFamily: 'var(--font)',
    paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
  },
  tete: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 8px 16px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', flexShrink: 0, minHeight: 52, boxSizing: 'border-box' },
  titre: { flex: 1, minWidth: 0, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  lien: { background: 'none', borderWidth: 0, color: 'var(--lien)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '8px 6px', minHeight: 44, flexShrink: 0 },
  fermer: { minHeight: 44, flexShrink: 0 },
};
