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
import { useEnregistreur } from './useEnregistreur.js';
import { cibleDe, sm } from './messagerie.styles.js';
import FilEquipe, { LigneFil } from './FilEquipe.jsx';
import {
  CLE_CANAUX_LUS, MAX_MESSAGE_EQUIPE, cleLu, equipeDuSoir, libelleFil, lireCanauxLus, participe, resumeFils,
} from './filsEquipe.js';
import { useMessagesCanaux } from '../hebergement/hotelData.js';
import { supabase } from '../../services/supabase.js';
import { useUserSettings } from '../../hooks/useUserSettings.js';
import { useDemandeOuverture } from '../../hooks/useDemandeOuverture.js';
import { UI_STORAGE_KEYS } from '../../utils/storage.js';
import { zurichMinuitIso, zurichToday } from '../../utils/zurichTime.js';

const VUES = [
  { id: 'discussions', label: 'Discussions' },
  { id: 'contacts', label: 'Contacts' },
];

const libelleRole = (profile) => (roleConfig[profile?.role] || { label: profile?.role || '' }).label;
const DETAIL_FIL = {
  cuisine: 'La brigade de cuisine et la direction',
  restaurant: "L'équipe de salle et la direction",
  tous: "Toute l'équipe de la maison",
};

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

// Fils d'équipe (plan 15, D5) : les fils de la personne en tête des
// discussions, chacun avec son dernier message et ses non-lus (user_settings,
// canaux_lus), puis « Écrire à l'équipe du soir » quand le planning en
// nomme. La RLS de canaux_messages ne rend que les canaux où l'on participe.
function useFilsEquipe({ etabId, user, actif }) {
  const canaux = useMessagesCanaux(etabId, { actif: Boolean(etabId) });
  const messages = React.useMemo(
    () => canaux.rows.filter((m) => ['cuisine', 'restaurant', 'tous'].includes(m.canal)),
    [canaux.rows],
  );
  const reglages = useUserSettings([CLE_CANAUX_LUS]);
  const [lus, setLus] = React.useState({});
  React.useEffect(() => {
    if (!reglages.loading) setLus(lireCanauxLus(reglages.settings[CLE_CANAUX_LUS]));
  }, [reglages.loading, reglages.settings]);
  const marquerLu = React.useCallback((canal) => {
    const cle = cleLu(etabId, canal);
    setLus((avant) => {
      const suivant = { ...avant, [cle]: new Date().toISOString() };
      Promise.resolve(reglages.setSetting(CLE_CANAUX_LUS, suivant)).catch((e) => console.warn('[messages] lecture du fil non gardée', e));
      return suivant;
    });
  }, [etabId, reglages.setSetting]);

  // Horaires du jour : seulement l'équipe du soir, lue quand le module est
  // affiché. Une lecture en échec retire simplement la ligne du soir.
  const aujourdhui = zurichToday();
  const [soir, setSoir] = React.useState([]);
  React.useEffect(() => {
    if (!etabId || !actif) return undefined;
    let vivant = true;
    supabase.from('shifts').select('id, user_id, date, debut, fin').eq('etablissement_id', etabId).eq('date', aujourdhui)
      .then(({ data, error }) => {
        if (!vivant || error) return;
        const shifts = (data || []).map((r) => ({ userId: r.user_id, date: r.date, debut: String(r.debut || '').slice(0, 5), fin: String(r.fin || '').slice(0, 5) }));
        setSoir(equipeDuSoir(shifts, aujourdhui, { sauf: user.id }));
      });
    return () => { vivant = false; };
  }, [etabId, actif, aujourdhui, user.id]);

  const fils = React.useMemo(() => resumeFils({
    role: user.role, messages, lus, etabId, moi: user.id, debutJour: zurichMinuitIso(aujourdhui),
  }), [user.role, user.id, messages, lus, etabId, aujourdhui]);

  return { fils, messages, soir, marquerLu, inserer: canaux.inserer, status: canaux.status };
}

const Messages = ({ user, etablissement, isActive = true }) => {
  const etabId = etablissement?.id || null;
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

  // Fil d'équipe ouvert (canal), son brouillon, et « pour l'équipe du soir ».
  const equipe = useFilsEquipe({ etabId, user, actif: isActive });
  const [filCanal, setFilCanal] = React.useState(null);
  const [filDraft, setFilDraft] = React.useState('');
  const [filSoir, setFilSoir] = React.useState(false);
  const [filEnvoi, setFilEnvoi] = React.useState(false);
  const filEquipeRef = React.useRef(null);
  const composerEquipeRef = React.useRef(null);

  const filOuvert = vue === 'discussions' && Boolean(selectedId);
  const filEquipeOuvert = vue === 'discussions' && Boolean(filCanal);
  const ficheOuverte = vue === 'contacts' && Boolean(ficheId);

  // Un vocal en cours appartient au fil où il a commencé : il est abandonné,
  // sans rien laisser, dès que ce fil n'est plus affiché (autre personne,
  // autre vue, page masquée).
  const enregistreur = useEnregistreur({
    filAffiche: isActive && filOuvert ? selectedId : null,
    expediteur: user.id,
    onEnvoye: (sent) => setMessages((prev) => [sent, ...prev.filter((m) => m.id !== sent.id)]),
  });

  // Téléphone : le fil et la fiche sont des calques, « retour » ramène à la
  // liste. Une seule entrée à la fois : « Écrire » depuis la fiche referme la
  // sienne et pose celle du fil dans le même geste (historyNav l'ordonne).
  const closeThread = React.useCallback(() => setSelectedId(null), []);
  const closeFiche = React.useCallback(() => setFicheId(null), []);
  const closeFilEquipe = React.useCallback(() => { setFilCanal(null); setFilSoir(false); }, []);
  useBackLayer(isMobile && filOuvert, closeThread, 'message-thread');
  useBackLayer(isMobile && ficheOuverte, closeFiche, 'contact-fiche');
  useBackLayer(isMobile && filEquipeOuvert, closeFilEquipe, 'message-fil-equipe');

  // Un fil d'équipe : la conversation à deux se referme, le brouillon de
  // l'alerte ou les noms du soir se posent.
  const ouvrirFil = React.useCallback((canal, { texte = '', soir = false } = {}) => {
    const c = participe(canal, user.role) ? canal : 'tous';
    setVue('discussions');
    setFicheId(null);
    setSelectedId(null);
    setFilCanal(c);
    setFilSoir(soir);
    setFilDraft(texte || '');
    if (!isMobile) requestAnimationFrame(() => composerEquipeRef.current?.focus());
  }, [user.role, isMobile]);

  // Raccourci d'une alerte (« Prévenir l'équipe ») ou de l'accueil.
  useDemandeOuverture(UI_STORAGE_KEYS.messagesOuvrir, 'sc:messages-ouvrir', (d) => {
    ouvrirFil(d.canal || 'tous', { texte: d.texte || '', soir: Boolean(d.soir) });
  });

  // Fil d'équipe affiché : il est lu.
  const messagesFil = React.useMemo(
    () => (filCanal ? equipe.messages.filter((m) => m.canal === filCanal)
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))) : []),
    [equipe.messages, filCanal],
  );
  const { marquerLu } = equipe;
  const nonLusFil = equipe.fils.find((f) => f.canal === filCanal)?.nonLus || 0;
  React.useEffect(() => {
    if (isActive && filEquipeOuvert && nonLusFil > 0) marquerLu(filCanal);
  }, [isActive, filEquipeOuvert, filCanal, nonLusFil, marquerLu]);
  React.useEffect(() => {
    const el = filEquipeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messagesFil.length, filCanal]);

  const envoyerEquipe = async () => {
    const texte = filDraft.trim();
    if (!texte || !filCanal || filEnvoi) return;
    if (texte.length > MAX_MESSAGE_EQUIPE) {
      notifyLegacy(`Message trop long (${MAX_MESSAGE_EQUIPE} caractères au maximum)`, 'warning');
      return;
    }
    setFilEnvoi(true);
    const mentions = filSoir && filCanal === 'tous' ? equipe.soir : [];
    const r = await equipe.inserer({ canal: filCanal, contenu: texte, mentions, created_by: user.id });
    setFilEnvoi(false);
    if (r.error) { notifyLegacy('Message non envoyé. ' + r.error, 'error'); return; }
    setFilDraft('');
    setFilSoir(false);
    marquerLu(filCanal);
    composerEquipeRef.current?.focus();
  };

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
    setFilCanal(null);
    setFilSoir(false);
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

  // Vocal : depuis le micro du fil, ou depuis « Vocal » de la fiche (le fil
  // s'ouvre et l'enregistrement part dans le même geste).
  const vocal = (id) => {
    if (vue !== 'discussions' || selectedId !== id) ecrire(id);
    enregistreur.demarrer(id);
  };

  const remove = async (msg) => {
    if (!confirmLegacy('Supprimer ce message ? Il disparaîtra aussi chez votre interlocuteur.')) return;
    try {
      // Vocal : le message d'abord, puis son fichier (legacySupabase).
      await legacySB.db.deletePrivateMessage(msg.id, msg.audioPath);
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
  // Fils d'équipe en tête des discussions (sans recherche en cours) : un
  // toucher ouvre le fil ; « Écrire à l'équipe du soir » ouvre Toute
  // l'équipe avec les noms de ceux qui travaillent ce soir.
  const nomCourt = (id) => profileById.get(id)?.prenom || profileById.get(id)?.nom || '';
  const lignesEquipe = !search && equipe.fils.length > 0 ? (
    <>
      <div style={ms.rubrique}>Équipe</div>
      {equipe.fils.map((f) => (
        <LigneFil
          key={f.canal}
          libelle={f.libelle}
          date={f.dernier ? formatListDate(f.dernier.createdAt) : null}
          apercu={f.dernier ? `${f.dernier.createdBy === user.id ? 'Vous : ' : ''}${f.dernier.contenu}` : 'Aucun message pour le moment'}
          apercuDonnee={Boolean(f.dernier)}
          nonLus={f.nonLus}
          actif={filCanal === f.canal && !filSoir}
          onClick={() => ouvrirFil(f.canal)}
        />
      ))}
      {equipe.soir.length > 0 && participe('tous', user.role) && (
        <LigneFil
          icone="soir"
          libelle="Écrire à l'équipe du soir"
          apercu={equipe.soir.map(nomCourt).filter(Boolean).join(', ')}
          apercuDonnee
          actif={filCanal === 'tous' && filSoir}
          onClick={() => ouvrirFil('tous', { soir: true })}
        />
      )}
      <div style={ms.rubrique}>Personnes</div>
    </>
  ) : null;

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
      <div style={sm.liste}>{vue === 'contacts' ? listeContacts : <>{lignesEquipe}{listeDiscussions}</>}</div>
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
        enregistreur={enregistreur}
        onVocal={() => vocal(selectedId)}
      />
    </div>
  );

  const filEquipePanel = filCanal && (
    <div style={ms.colonne}>
      <FilEquipe
        libelle={libelleFil(filCanal)}
        detail={DETAIL_FIL[filCanal] || null}
        messages={messagesFil}
        profileById={profileById}
        userId={user.id}
        filRef={filEquipeRef}
        composerRef={composerEquipeRef}
        draft={filDraft}
        onDraft={setFilDraft}
        onSend={envoyerEquipe}
        sending={filEnvoi}
        mentions={filSoir && filCanal === 'tous' ? equipe.soir : []}
        onRetirerMentions={() => setFilSoir(false)}
        onRetour={isMobile ? closeFilEquipe : undefined}
        cible={cible}
        aide={!isMobile}
      />
    </div>
  );

  const fichePanel = fiche && (
    <div style={ms.colonne}>
      <FicheContact
        profile={fiche}
        tel={telephones[fiche.id]}
        onEcrire={() => ecrire(fiche.id)}
        onVocal={enregistreur.disponible ? () => vocal(fiche.id) : undefined}
        onRetour={isMobile ? closeFiche : undefined}
        empile={isMobile}
        cible={cible}
      />
    </div>
  );

  const videDroite = (
    <div style={ms.droiteVide}>
      <MessageSquare size={34} strokeWidth={1.5} aria-hidden="true" style={{ opacity: 0.35, color: 'var(--text2)' }} />
      <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginTop: 8 }}>
        {vue === 'discussions' && equipe.fils.length ? 'Choisissez un fil ou une personne' : 'Choisissez une personne'}
      </div>
    </div>
  );

  let contenu;
  if (isMobile) {
    contenu = filOuvert ? threadPanel : (filEquipeOuvert && filEquipePanel) || (ficheOuverte && fichePanel) || listPanel;
  } else {
    const droite = vue === 'contacts' ? (fichePanel || videDroite)
      : (selectedId ? threadPanel : (filCanal ? filEquipePanel : videDroite));
    contenu = <>{listPanel}{droite}</>;
  }

  return (
    <div style={ms.root}>
      {/* Téléphone : la phrase d'explication cède sa place au fil et à la fiche. */}
      {!(isMobile && (filOuvert || ficheOuverte || filEquipeOuvert)) && (
        <SectionHeader
          sub={equipe.fils.length
            ? "Écrivez à votre équipe dans son fil, ou à une personne. Une conversation à deux n'est visible que par ses deux participants."
            : "Écrivez à vos collègues et à votre consultant. Chaque conversation n'est visible que par ses deux participants."}
        />
      )}
      <div ref={cadreRef} style={{ ...(isMobile ? ms.cadreTelephone : ms.cadreBureau), height: hauteur ?? undefined }}>
        {contenu}
      </div>
    </div>
  );
};

// Direction Galet (lot 6) : la liste, le fil et la fiche sont des cartes
// blanches (fond --zone, filet --rule-soft, rayon --r-lg, ombre --sh), posées
// côte à côte sur la page à l'ordinateur, une à la fois au téléphone.
const carte = { background: 'var(--zone)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)' };

const ms = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },

  // Cadre à hauteur de l'écran. Au-delà du téléphone : la liste (250 à
  // 330 px), puis le fil ou la fiche, bornés à 760 px de large.
  cadreTelephone: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 },
  cadreBureau: { display: 'grid', gridTemplateColumns: 'minmax(250px, 330px) minmax(0, 760px)', gridTemplateRows: 'minmax(0, 1fr)', gap: 24, minHeight: 0 },
  colonne: { ...carte, display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  // La liste, à l'ordinateur : un retrait dans sa carte.
  colonneListeBureau: { padding: 6 },
  titreListe: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 8px 4px', flexShrink: 0, minWidth: 0 },
  // Onglets de vue à la hauteur d'une cible (40 px à l'ordinateur, où la
  // feuille ne les relève pas), 8 px entre eux : la barre ne garde ni sa
  // marge intérieure ni son contour transparent, et ses onglets s'étirent.
  // Deux onglets tiennent dans la colonne la plus étroite (187 px sur 301) :
  // la barre ne défile pas en largeur.
  vues: (cible) => ({ padding: 0, borderWidth: 0, gap: 8, alignItems: 'stretch', minHeight: cible, overflowX: 'visible' }),
  // Titre d'un groupe de la liste (Équipe, Personnes).
  rubrique: { padding: '10px 8px 4px', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text3)', flexShrink: 0 },
  // Vide : une carte à la hauteur de son contenu, pas étirée sur la rangée.
  droiteVide: { ...carte, alignSelf: 'start', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '44px 20px', minWidth: 0 },
};

export default Messages;
