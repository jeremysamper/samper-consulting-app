// ═══════════════════════════════════════════════════════════════
// MESSAGERIE PRIVÉE - conversations à deux, pour tous les rôles.
// Chacun écrit aux comptes qu'il voit (collègues de ses établissements et
// consultant) ; une conversation n'est lisible que par ses deux participants
// (RLS, migration 20260926_messagerie_bidirectionnelle).
//
// Deux vues : Discussions (l'écran d'arrivée, conversations d'abord puis les
// autres comptes actifs) et Contacts (l'annuaire, puis la fiche d'une
// personne). Liste à gauche, fil ou fiche à droite ; au téléphone, la liste
// seule, et le fil ou la fiche en calque refermé par le geste retour.
//
// La page tient dans la hauteur de l'écran : la liste et le fil défilent
// chacun dans leur zone, la zone de saisie ne quitte pas l'écran.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { SectionHeader, SegmentedTabs } from '../../components/ui/index.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { roles as roleConfig } from '../moduleConfig.js';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useShellMode, estTactile } from '../../hooks/useShellMode.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { useTeamPhones } from '../../hooks/useTeamPhones.js';
import { useHauteurRestante } from '../caisse/mesures.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { MAX_LENGTH, buildAnnuaire, buildContacts, formatListDate, groupConversations } from './conversations.js';
import LignePersonne from './LignePersonne.jsx';
import FilConversation from './FilConversation.jsx';
import FicheContact from './FicheContact.jsx';
import { cibleDe, sm } from './messagerie.styles.js';

const VUES = [
  { id: 'discussions', label: 'Discussions' },
  { id: 'contacts', label: 'Contacts' },
];

const libelleRole = (profile) => (roleConfig[profile?.role] || { label: profile?.role || '' }).label;

// La loupe dépliée prend toute la ligne de titre : SearchToggle garde seul
// son état ouvert, on le lit donc dans le DOM de la ligne.
function useRechercheOuverte(ref) {
  const [ouverte, setOuverte] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof MutationObserver === 'undefined') return undefined;
    const lire = () => setOuverte(Boolean(el.querySelector('.search-toggle')));
    lire();
    const mo = new MutationObserver(lire);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  });
  return ouverte;
}

const Messages = ({ user, isActive = true }) => {
  const isMobile = useIsMobile();
  const tactile = estTactile(useShellMode());
  const cible = cibleDe(tactile);
  const legacySB = dbService.getBridge();
  const [profiles, setProfiles] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [vue, setVue] = React.useState('discussions');
  const [selectedId, setSelectedId] = React.useState(null);
  const [ficheId, setFicheId] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const threadRef = React.useRef(null);
  const composerRef = React.useRef(null);
  const cadreRef = React.useRef(null);
  const titreRef = React.useRef(null);
  const rechercheOuverte = useRechercheOuverte(titreRef);

  const filOuvert = vue === 'discussions' && Boolean(selectedId);
  const ficheOuverte = vue === 'contacts' && Boolean(ficheId);

  // Téléphone : le fil et la fiche sont des calques, « retour » ramène à la
  // liste. Une seule entrée à la fois : « Écrire » depuis la fiche referme la
  // sienne et pose celle du fil dans le même geste (historyNav l'ordonne).
  const closeThread = React.useCallback(() => setSelectedId(null), []);
  const closeFiche = React.useCallback(() => setFicheId(null), []);
  useBackLayer(isMobile && filOuvert, closeThread, 'message-thread');
  useBackLayer(isMobile && ficheOuverte, closeFiche, 'contact-fiche');

  // Hauteur du cadre : le reste de la zone de contenu sous lui, mesuré contre
  // le conteneur qui défile (jamais innerHeight, faux sur iPad).
  const hauteur = useHauteurRestante(cadreRef, isActive && !loading);

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

  const conversations = React.useMemo(() => groupConversations(messages, user.id), [messages, user.id]);
  const contacts = React.useMemo(
    () => buildContacts({ conversations, profiles, profileById, userId: user.id, search }),
    [conversations, profiles, profileById, search, user.id],
  );
  const annuaire = React.useMemo(
    () => buildAnnuaire({ profiles, userId: user.id, search }),
    [profiles, search, user.id],
  );
  // Numéros : lus seulement quand la vue Contacts est ouverte, et seulement
  // par qui la base les laisse lire (consultant, patron).
  const telephones = useTeamPhones(vue === 'contacts' ? user.role : null);

  const selected = selectedId ? (profileById.get(selectedId) || null) : null;
  const fiche = ficheId ? (profileById.get(ficheId) || null) : null;
  const thread = React.useMemo(
    () => (selectedId ? [...(conversations.get(selectedId) || [])].reverse() : []),
    [conversations, selectedId],
  );

  // Marquage lu : seulement la conversation affichée, et seulement quand le
  // module est réellement affiché (il peut rester monté masqué).
  React.useEffect(() => {
    if (!isActive || !filOuvert || !legacySB) return;
    const hasUnread = thread.some((m) => m.recipientId === user.id && !m.readAt);
    if (!hasUnread) return;
    Promise.resolve(legacySB.db.markPrivateMessagesRead(user.id, selectedId))
      .then(() => window.dispatchEvent(new Event('sc:messages-read')));
    const now = new Date().toISOString();
    setMessages((prev) => prev.map((m) => (
      m.senderId === selectedId && m.recipientId === user.id && !m.readAt ? { ...m, readAt: now } : m
    )));
  }, [isActive, filOuvert, selectedId, thread, user.id]);

  // Fil : toujours calé sur le dernier message.
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, selectedId, filOuvert]);

  const openConversation = (id) => {
    setSelectedId(id);
    setDraft('');
    if (!isMobile) requestAnimationFrame(() => composerRef.current?.focus());
  };

  const ecrire = (id) => {
    setVue('discussions');
    setFicheId(null);
    openConversation(id);
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
      notifyLegacy('Message non envoyé. ' + messageErreur(err, 'messages'), 'error');
    } finally { setSending(false); }
  };

  const remove = async (msg) => {
    if (!confirmLegacy('Supprimer ce message ? Il disparaîtra aussi chez votre interlocuteur.')) return;
    try {
      await legacySB.db.deletePrivateMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err) { notifyLegacy('Suppression impossible. ' + messageErreur(err, 'messages'), 'error'); }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;
  }

  const videListe = <div style={sm.vide}>{search ? 'Aucun compte trouvé.' : 'Aucun contact disponible.'}</div>;
  const listeDiscussions = contacts.length === 0 ? videListe : contacts.map(({ id, profile, last, unread }) => (
    <LignePersonne
      key={id}
      profile={profile}
      date={last ? formatListDate(last.createdAt) : null}
      apercu={last ? `${last.senderId === user.id ? 'Vous : ' : ''}${last.message}` : libelleRole(profile)}
      apercuDonnee={Boolean(last)}
      nonLus={unread}
      actif={selectedId === id}
      onClick={() => openConversation(id)}
    />
  ));
  const listeContacts = annuaire.length === 0 ? videListe : annuaire.map((p) => (
    <LignePersonne key={p.id} profile={p} apercu={libelleRole(p)} actif={ficheId === p.id} onClick={() => setFicheId(p.id)} />
  ));

  // Ligne de titre de la liste : le choix de la vue et la loupe. Dépliée, la
  // recherche prend la ligne entière ; refermée, elle s'efface et les vues
  // reviennent.
  const listPanel = (
    <div style={{ ...ms.colonne, gap: 8, ...(isMobile ? null : ms.colonneListeBureau) }}>
      <div ref={titreRef} style={ms.titreListe}>
        {!rechercheOuverte && (
          <SegmentedTabs tabs={VUES} active={vue} onChange={setVue} style={ms.vues(cible)} />
        )}
        <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher une personne…" style={{ minWidth: cible, minHeight: cible }} />
      </div>
      <div style={sm.liste}>{vue === 'contacts' ? listeContacts : listeDiscussions}</div>
    </div>
  );

  const threadPanel = (
    <div style={ms.colonne}>
      <FilConversation
        userId={user.id}
        selected={selected}
        thread={thread}
        filRef={threadRef}
        composerRef={composerRef}
        draft={draft}
        onDraft={setDraft}
        onSend={send}
        sending={sending}
        onRemove={remove}
        onRetour={isMobile ? closeThread : undefined}
        rows={isMobile ? 2 : 3}
        aide={!isMobile}
        cible={cible}
      />
    </div>
  );

  const fichePanel = fiche && (
    <div style={ms.colonne}>
      <FicheContact
        profile={fiche}
        tel={telephones[fiche.id]}
        onEcrire={() => ecrire(fiche.id)}
        onRetour={isMobile ? closeFiche : undefined}
        empile={isMobile}
        cible={cible}
      />
    </div>
  );

  const videDroite = (
    <div style={ms.droiteVide}>
      <MessageSquare size={34} strokeWidth={1.5} aria-hidden="true" style={{ opacity: 0.35, color: 'var(--text2)' }} />
      <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginTop: 8 }}>Choisissez une personne</div>
      {vue === 'discussions' && (
        <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 4, maxWidth: 320 }}>
          Chaque conversation est privée : seuls vous et votre interlocuteur la voyez.
        </div>
      )}
    </div>
  );

  let contenu;
  if (isMobile) {
    contenu = filOuvert ? threadPanel : (ficheOuverte && fichePanel) || listPanel;
  } else {
    const droite = vue === 'contacts' ? (fichePanel || videDroite) : (selectedId ? threadPanel : videDroite);
    contenu = <>{listPanel}{droite}</>;
  }

  return (
    <div style={ms.root}>
      {/* Téléphone : la phrase d'explication cède sa place au fil et à la fiche. */}
      {!(isMobile && (filOuvert || ficheOuverte)) && (
        <SectionHeader
          sub="Écrivez à vos collègues et à votre consultant. Chaque conversation n'est visible que par ses deux participants."
        />
      )}
      <div ref={cadreRef} style={{ ...(isMobile ? ms.cadreTelephone : ms.cadreBureau), height: hauteur ?? undefined }}>
        {contenu}
      </div>
    </div>
  );
};

const ms = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },

  // Cadre à hauteur de l'écran. Au-delà du téléphone : la liste (250 à
  // 330 px), puis le fil ou la fiche, bornés à 760 px de large.
  cadreTelephone: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 },
  cadreBureau: { display: 'grid', gridTemplateColumns: 'minmax(250px, 330px) minmax(0, 760px)', gridTemplateRows: 'minmax(0, 1fr)', gap: 14, minHeight: 0 },
  colonne: { display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minWidth: 0, minHeight: 0 },
  // Deux colonnes posées sur la page, séparées par un filet vertical.
  colonneListeBureau: { borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: 'var(--rule-soft)', paddingRight: 14 },
  titreListe: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 0', flexShrink: 0, minWidth: 0 },
  // Onglets de vue à la hauteur d'une cible (40 px à l'ordinateur, où la
  // feuille ne les relève pas), 8 px entre eux : la barre ne garde ni sa
  // marge intérieure ni son contour transparent, et ses onglets s'étirent.
  // Deux onglets tiennent dans la colonne la plus étroite (187 px sur 301) :
  // la barre ne défile pas en largeur.
  vues: (cible) => ({ padding: 0, borderWidth: 0, gap: 8, alignItems: 'stretch', minHeight: cible, overflowX: 'visible' }),
  droiteVide: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '44px 20px', minWidth: 0 },
};

export default Messages;
