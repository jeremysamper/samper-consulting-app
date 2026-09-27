import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cake, History, Mail, MailCheck, Send, Users } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { appelerMailer, useSpaParametres, useSpaTable } from './spaData.js';
import BoiteEnvoi from './BoiteEnvoi.jsx';
import {
  Avatar, Champ, EtatVide, Puce, TitreSection, dateLongue, decalerJour, jourMois, nomClient,
  prochainAnniversaire, st,
} from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// E-mails du spa (direction : consultant et patron).
//
//   Boîte d'envoi : le spa connecte sa boîte Gmail ou Outlook (BoiteEnvoi) ;
//                   tous ses e-mails partent alors de sa propre adresse.
//
//   Anniversaires : un bon cadeau part tout seul le jour de l'anniversaire de
//                   chaque client qui a accepté les e-mails (cron quotidien,
//                   Edge Function spa-mailer). Un seul par client et par an.
//   Actualités    : un message rédigé ici, envoyé à tous les clients
//                   consentants, chacun avec son lien de désinscription.
//   Historique    : ce qui est parti, ce qui a échoué.
//
// À droite, l'aperçu de l'e-mail tel que le client le recevra, mis à jour à
// chaque frappe. {prenom} et {nom} se remplacent par ceux de chaque client.
// ─────────────────────────────────────────────────────────────────────────────

const SOUS_ONGLETS = [
  { id: 'anniversaires', label: 'Anniversaires', icone: Cake },
  { id: 'actualites', label: 'Actualités', icone: Send },
  { id: 'historique', label: 'Historique', icone: History },
];

// Textes par défaut : les mêmes que ceux du serveur (spa-mailer).
const SUJET_DEFAUT = 'Joyeux anniversaire {prenom} : un cadeau vous attend';
const MESSAGE_DEFAUT = "Bonjour {prenom},\n\nToute l'équipe vous souhaite un très joyeux anniversaire.\n\nPour l'occasion, nous avons le plaisir de vous offrir le bon ci-dessous. Il suffit de le présenter (ou de nous donner son code) lors de votre réservation.\n\nAu plaisir de vous accueillir très bientôt.";

const mapCampagne = (r) => ({
  id: r.id, sujet: r.sujet, nbDestinataires: r.nb_destinataires, nbEnvoyes: r.nb_envoyes,
  nbEchecs: r.nb_echecs, createdAt: r.created_at,
});
const mapEnvoi = (r) => ({
  id: r.id, clientId: r.client_id, type: r.type, email: r.email, statut: r.statut,
  erreur: r.erreur, createdAt: r.created_at,
});

const TYPES_ENVOI = { anniversaire: 'Anniversaire', news: 'Actualité', bon: 'Bon cadeau', test: 'Essai' };

function dateHeure(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}

// Même préfixe que les codes générés par le serveur (trois lettres du nom).
const prefixeCode = (nom) => (nom || 'SPA').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'SPA';

const personnaliser = (t) => String(t || '').replace(/\{prenom\}/gi, 'Camille').replace(/\{nom\}/gi, 'Exemple');

export default function MailingSpa({ etablissement, clients, aujourdhui, consultant = false }) {
  const etablissementId = etablissement?.id;
  const [onglet, setOnglet] = useState('anniversaires');
  const [etat, setEtat] = useState(null); // réponse de spa-mailer « etat », null = inconnu
  const [erreurService, setErreurService] = useState(null);
  const { parametres, status, enregistrer } = useSpaParametres(etablissementId);
  const demande = useRef(0);

  // Relue aussi après une connexion ou une déconnexion de la boîte d'envoi.
  const chargerEtat = useCallback(() => {
    const n = ++demande.current;
    appelerMailer('etat', { etablissementId }).then(({ data, error }) => {
      if (n !== demande.current) return;
      setErreurService(error || null);
      if (!error) setEtat(data);
    });
  }, [etablissementId]);

  useEffect(() => {
    setEtat(null);
    chargerEtat();
    return () => { demande.current += 1; };
  }, [chargerEtat]);

  const configure = etat ? Boolean(etat.configure) : (erreurService ? false : null);
  const adresseEnvoi = etat?.boite?.statut === 'actif' ? etat.boite.adresse : null;
  const actifs = clients.filter((c) => !c.archive);
  const destinataires = actifs.filter((c) => c.consentementMarketing && c.email);
  const part = actifs.length ? Math.round((destinataires.length / actifs.length) * 100) : 0;

  return (
    <div>
      <BoiteEnvoi
        etablissementId={etablissementId}
        etat={etat}
        erreurService={erreurService}
        onRecharger={chargerEtat}
        consultant={consultant}
      />

      {/* ── Audience ── */}
      <div style={s.audience}>
        <span aria-hidden="true" style={s.audienceIcone}><Users size={20} strokeWidth={1.8} /></span>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontSize: 15 }}>
            <strong style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400 }}>{destinataires.length}</strong>
            {' '}client{destinataires.length > 1 ? 's' : ''} sur {actifs.length} {destinataires.length > 1 ? 'acceptent' : 'accepte'} les e-mails
          </div>
          <div style={s.jauge} aria-hidden="true"><span style={{ ...s.jaugePlein, width: `${part}%` }} /></div>
          <div style={{ fontSize: 12, color: 'var(--spa-ink2)', marginTop: 6 }}>L'accord se coche sur la fiche de chaque client, avec son accord.</div>
        </div>
      </div>

      <div className="spa-defile" style={{ display: 'flex', gap: 8, paddingBottom: 4, margin: '16px 0' }}>
        {SOUS_ONGLETS.map(({ id, label, icone: Icone }) => (
          <button key={id} type="button" aria-pressed={onglet === id} onClick={() => setOnglet(id)} style={{ ...st.choix, flexShrink: 0, ...(onglet === id ? st.choixActif : null) }}>
            <Icone size={15} strokeWidth={1.8} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {status === 'absent' && <div style={st.encartAttention}>Base de données du module non installée.</div>}
      {status !== 'absent' && onglet === 'anniversaires' && (
        <Anniversaires
          etablissement={etablissement}
          parametres={parametres}
          enregistrer={enregistrer}
          clients={actifs}
          aujourdhui={aujourdhui}
          envoiPossible={configure === true}
          adresseEnvoi={adresseEnvoi}
        />
      )}
      {status !== 'absent' && onglet === 'actualites' && (
        <Actualites
          etablissement={etablissement}
          parametres={parametres}
          nbDestinataires={destinataires.length}
          envoiPossible={configure === true}
          adresseEnvoi={adresseEnvoi}
        />
      )}
      {onglet === 'historique' && <Historique etablissementId={etablissementId} clients={clients} />}
    </div>
  );
}

// ── Anniversaires ─────────────────────────────────────────────────────────
function Anniversaires({ etablissement, parametres, enregistrer, clients, aujourdhui, envoiPossible, adresseEnvoi }) {
  const [form, setForm] = useState(parametres);
  const [enCours, setEnCours] = useState(false);
  const [essai, setEssai] = useState(false);
  useEffect(() => { setForm(parametres); }, [parametres]);
  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));
  const modifie = JSON.stringify(form) !== JSON.stringify(parametres);

  const prochains = useMemo(
    () => clients
      .filter((c) => c.dateNaissance)
      .map((c) => ({ c, anniv: prochainAnniversaire(c.dateNaissance, aujourdhui) }))
      .filter(({ anniv }) => anniv && anniv.jours <= 30)
      .sort((a, b) => a.anniv.jours - b.anniv.jours),
    [clients, aujourdhui]
  );
  const sansDate = clients.filter((c) => !c.dateNaissance).length;

  async function sauver() {
    if (form.emailReponse && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.emailReponse.trim())) {
      notify("L'adresse de réponse n'est pas valide.", 'error'); return;
    }
    setEnCours(true);
    try {
      const { error } = await enregistrer(form);
      if (error) { notify(error, 'error'); return; }
      notify(form.anniversaireActif ? 'Réglages enregistrés : les bons d\'anniversaire partiront automatiquement.' : 'Réglages enregistrés.', 'success');
    } finally {
      setEnCours(false);
    }
  }

  async function envoyerEssai() {
    setEssai(true);
    try {
      const { data, error } = await appelerMailer('test', {
        etablissementId: etablissement?.id, type: 'anniversaire',
        params: {
          bon_valeur: form.bonValeur, bon_validite_jours: Number(form.bonValiditeJours) || 60,
          anniversaire_sujet: form.anniversaireSujet || null, anniversaire_message: form.anniversaireMessage || null,
          nom_expediteur: form.nomExpediteur || null, email_reponse: form.emailReponse || null, signature: form.signature || null,
        },
      });
      if (error) { notify(error, 'error'); return; }
      notify(`Essai envoyé à ${data?.email}.`, 'success');
    } finally {
      setEssai(false);
    }
  }

  return (
    <div style={s.deuxColonnes}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <label
          style={{
            ...st.caseLabel, padding: 18, borderRadius: 'var(--spa-r)',
            borderWidth: 1, borderStyle: 'solid',
            borderColor: form.anniversaireActif ? 'var(--spa-matcha)' : 'var(--spa-line)',
            background: form.anniversaireActif ? 'var(--spa-matcha-soft)' : 'var(--spa-surface)',
          }}
        >
          <input type="checkbox" checked={form.anniversaireActif} onChange={(e) => set('anniversaireActif', e.target.checked)} style={st.case} />
          <span>
            <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 18 }}>Bon cadeau automatique le jour de l'anniversaire</span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--spa-ink2)', marginTop: 4 }}>
              Le matin, aux clients qui ont accepté les e-mails. Un seul par client et par an.
            </span>
          </span>
        </label>

        <div style={{ ...st.carte, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={st.grille2}>
            <Champ label="Le bon offre" htmlFor="anniv-valeur">
              <input id="anniv-valeur" style={st.champ} value={form.bonValeur} onChange={(e) => set('bonValeur', e.target.value)} />
            </Champ>
            <Champ label="Valable (jours)" htmlFor="anniv-validite">
              <input id="anniv-validite" type="number" min={1} max={730} inputMode="numeric" style={st.champ} value={form.bonValiditeJours} onChange={(e) => set('bonValiditeJours', e.target.value)} />
            </Champ>
          </div>
          <Champ label="Objet" htmlFor="anniv-sujet">
            <input id="anniv-sujet" style={st.champ} value={form.anniversaireSujet} placeholder={SUJET_DEFAUT} onChange={(e) => set('anniversaireSujet', e.target.value)} />
          </Champ>
          <Champ label="Message" htmlFor="anniv-message" aide="{prenom} devient le prénom du client. Vide : message par défaut.">
            <textarea id="anniv-message" style={{ ...st.zone, minHeight: 150 }} value={form.anniversaireMessage} placeholder={MESSAGE_DEFAUT} onChange={(e) => set('anniversaireMessage', e.target.value)} />
          </Champ>
          <div style={st.grille2}>
            <Champ label="Nom de l'expéditeur" htmlFor="anniv-exp">
              <input id="anniv-exp" style={st.champ} value={form.nomExpediteur} placeholder={etablissement?.nom || ''} onChange={(e) => set('nomExpediteur', e.target.value)} />
            </Champ>
            <Champ label="Adresse de réponse" htmlFor="anniv-reply">
              <input id="anniv-reply" type="email" style={st.champ} value={form.emailReponse} onChange={(e) => set('emailReponse', e.target.value)} />
            </Champ>
          </div>
          <Champ label="Signature" htmlFor="anniv-signature" aide="Commune à tous les e-mails du spa.">
            <textarea id="anniv-signature" style={{ ...st.zone, minHeight: 60 }} value={form.signature} placeholder={`L'équipe ${etablissement?.nom || ''}`} onChange={(e) => set('signature', e.target.value)} />
          </Champ>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={envoyerEssai} disabled={!envoiPossible || essai} style={{ ...st.secondaire, opacity: envoiPossible && !essai ? 1 : 0.55 }}>
              <Mail size={16} strokeWidth={1.8} aria-hidden="true" /> {essai ? 'Envoi…' : "M'envoyer un essai"}
            </button>
            <button type="button" onClick={sauver} disabled={enCours || !modifie} style={{ ...st.principal, opacity: enCours || !modifie ? 0.55 : 1 }}>
              Enregistrer
            </button>
          </div>
        </div>

        <div style={st.carte}>
          <TitreSection>Dans les 30 prochains jours</TitreSection>
          {!prochains.length && <div style={{ fontSize: 14, color: 'var(--spa-ink2)' }}>Aucun anniversaire.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {prochains.map(({ c, anniv }) => {
              const recevra = c.consentementMarketing && c.email;
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Avatar client={c} taille={36} />
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-no-translate>{nomClient(c)}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--spa-ink2)' }}>{anniv.jours === 0 ? "Aujourd'hui" : `${jourMois(anniv.date)}, dans ${anniv.jours} jour${anniv.jours > 1 ? 's' : ''}`}</span>
                  </span>
                  {recevra
                    ? <Puce icone={MailCheck} ton="matcha">Recevra le bon</Puce>
                    : <Puce>{c.email ? "Pas d'accord" : "Pas d'e-mail"}</Puce>}
                </div>
              );
            })}
          </div>
          {sansDate > 0 && (
            <div style={{ ...st.aide, marginTop: 14 }}>
              {sansDate} client{sansDate > 1 ? 's' : ''} sans date de naissance : à compléter sur leur fiche.
            </div>
          )}
        </div>
      </div>

      <ApercuEmail
        etablissement={etablissement}
        parametres={form}
        sujet={form.anniversaireSujet || SUJET_DEFAUT}
        message={form.anniversaireMessage || MESSAGE_DEFAUT}
        bon={{ valeur: form.bonValeur, validite: Number(form.bonValiditeJours) || 60 }}
        adresseEnvoi={adresseEnvoi}
      />
    </div>
  );
}

// ── Actualités ────────────────────────────────────────────────────────────
function Actualites({ etablissement, parametres, nbDestinataires, envoiPossible, adresseEnvoi }) {
  const [sujet, setSujet] = useState('');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(null); // 'essai' | 'envoi'

  async function essai() {
    if (!sujet.trim() || !message.trim()) { notify('Écris l\'objet et le message.', 'error'); return; }
    setEnCours('essai');
    try {
      const { data, error } = await appelerMailer('test', { etablissementId: etablissement?.id, type: 'news', sujet, message });
      if (error) { notify(error, 'error'); return; }
      notify(`Essai envoyé à ${data?.email}. Vérifie-le avant l'envoi à tous.`, 'success');
    } finally {
      setEnCours(null);
    }
  }

  async function envoyer() {
    if (!sujet.trim() || !message.trim()) { notify('Écris l\'objet et le message.', 'error'); return; }
    if (!window.confirm(`Envoyer « ${sujet.trim()} » à ${nbDestinataires} client${nbDestinataires > 1 ? 's' : ''} ?\n\nUn e-mail envoyé ne peut pas être rappelé.`)) return;
    setEnCours('envoi');
    try {
      const { data, error } = await appelerMailer('campagne', { etablissementId: etablissement?.id, sujet: sujet.trim(), message: message.trim() });
      if (error) { notify(error, 'error'); return; }
      notify(
        data?.echecs
          ? `${data.envoyes} e-mail${data.envoyes > 1 ? 's' : ''} envoyé${data.envoyes > 1 ? 's' : ''}, ${data.echecs} en échec (voir l'historique).`
          : `${data?.envoyes || 0} e-mail${data?.envoyes > 1 ? 's' : ''} envoyé${data?.envoyes > 1 ? 's' : ''}.`,
        data?.echecs ? 'warning' : 'success'
      );
      setSujet('');
      setMessage('');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div style={s.deuxColonnes}>
      <div style={{ ...st.carte, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Champ label="Objet" htmlFor="news-sujet">
          <input id="news-sujet" style={st.champ} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. Nouveau rituel d'automne, {prenom}" />
        </Champ>
        <Champ label="Message" htmlFor="news-message" aide="Un paragraphe par ligne vide. {prenom} devient le prénom de chaque client. Le lien de désinscription est ajouté automatiquement.">
          <textarea id="news-message" style={{ ...st.zone, minHeight: 240 }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={'Bonjour {prenom},\n\n…'} />
        </Champ>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" onClick={essai} disabled={!envoiPossible || Boolean(enCours)} style={{ ...st.secondaire, opacity: envoiPossible && !enCours ? 1 : 0.55 }}>
            <Mail size={16} strokeWidth={1.8} aria-hidden="true" /> {enCours === 'essai' ? 'Envoi…' : "M'envoyer un essai"}
          </button>
          <button type="button" onClick={envoyer} disabled={!envoiPossible || Boolean(enCours) || !nbDestinataires} style={{ ...st.principal, opacity: envoiPossible && !enCours && nbDestinataires ? 1 : 0.55 }}>
            <Send size={16} strokeWidth={1.8} aria-hidden="true" />
            {enCours === 'envoi' ? 'Envoi en cours…' : `Envoyer à ${nbDestinataires} client${nbDestinataires > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
      <ApercuEmail
        etablissement={etablissement}
        parametres={parametres}
        sujet={sujet || 'Objet de votre message'}
        message={message || 'Bonjour {prenom},\n\nVotre message apparaît ici, paragraphe par paragraphe.'}
        adresseEnvoi={adresseEnvoi}
      />
    </div>
  );
}

// ── Aperçu de l'e-mail ────────────────────────────────────────────────────
// Reproduit le gabarit du serveur (spa-mailer) : ses couleurs sont celles de
// l'e-mail reçu, pas celles du thème de l'app, et restent donc fixes (comme un
// document imprimé).
function ApercuEmail({ etablissement, parametres, sujet, message, bon = null, adresseEnvoi = null }) {
  const nom = etablissement?.nom || 'Spa';
  const expediteur = (parametres?.nomExpediteur || '').trim() || nom;
  const signature = (parametres?.signature || '').trim() || `L'équipe ${nom}`;
  const paragraphes = personnaliser(message).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const validite = bon ? dateLongue(decalerJour(zurichToday(), bon.validite)) : null;

  return (
    <aside aria-label="Aperçu de l'e-mail" style={{ minWidth: 0 }}>
      <TitreSection>Aperçu</TitreSection>
      <div style={e.cadre}>
        <div style={e.enveloppe}>
          <div style={{ fontSize: 12, color: '#6f6a62', overflowWrap: 'anywhere' }}>
            De <strong style={{ color: '#2b2b2b' }} data-no-translate>{expediteur}</strong>
            {adresseEnvoi && <span data-no-translate>{` <${adresseEnvoi}>`}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2b2b2b', marginTop: 2 }} data-no-translate>{personnaliser(sujet)}</div>
        </div>
        <div style={e.fond}>
          <div style={e.carte}>
            <div style={e.marque} data-no-translate>{nom}</div>
            <div style={e.trait} />
            <div style={{ padding: '18px 24px 6px' }} data-no-translate>
              {paragraphes.map((p, i) => <p key={i} style={e.p}>{p}</p>)}
              {bon && (
                <div style={e.bon}>
                  <div style={e.bonSur}>Bon cadeau</div>
                  <div style={e.bonValeur}>{bon.valeur || 'Ce que le bon offre'}</div>
                  <div style={e.bonCode}>{prefixeCode(nom)}-XXXX-XXXX</div>
                  <div style={{ fontSize: 11, color: '#8a8a8a', marginTop: 10 }}>Valable jusqu'au {validite}</div>
                </div>
              )}
              <p style={{ ...e.p, whiteSpace: 'pre-line' }}>{signature}</p>
            </div>
            <div style={e.pied}>
              Vous recevez cet e-mail car vous avez accepté de recevoir nos nouvelles. <u>Se désinscrire</u>
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...st.aide, marginTop: 8 }}>Exemple avec le prénom « Camille ».</div>
    </aside>
  );
}

// ── Historique ────────────────────────────────────────────────────────────
function Historique({ etablissementId, clients }) {
  const campagnes = useSpaTable('spa_campagnes', etablissementId, { map: mapCampagne, order: [['created_at', false]], limit: 100 });
  const envois = useSpaTable('spa_envois', etablissementId, { map: mapEnvoi, order: [['created_at', false]], limit: 200 });
  const parId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  if (campagnes.status === 'ready' && envois.status === 'ready' && !campagnes.rows.length && !envois.rows.length) {
    return <EtatVide icone={History} titre="Rien d'envoyé pour l'instant" texte="Les e-mails partis (anniversaires, actualités, bons, essais) s'afficheront ici." />;
  }

  return (
    <div style={s.deuxColonnes}>
      <div style={st.carte}>
        <TitreSection>Actualités envoyées</TitreSection>
        {campagnes.status === 'ready' && !campagnes.rows.length && <div style={{ fontSize: 14, color: 'var(--spa-ink2)' }}>Aucune pour l'instant.</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {campagnes.rows.map((c) => (
            <div key={c.id} style={s.ligneHisto}>
              <div style={{ fontWeight: 600 }}>{c.sujet}</div>
              <div style={{ color: 'var(--spa-ink2)', fontSize: 13 }}>
                {dateHeure(c.createdAt)}, {c.nbEnvoyes}/{c.nbDestinataires} envoyés{c.nbEchecs ? `, ${c.nbEchecs} en échec` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={st.carte}>
        <TitreSection>Derniers e-mails</TitreSection>
        {envois.status === 'ready' && !envois.rows.length && <div style={{ fontSize: 14, color: 'var(--spa-ink2)' }}>Aucun e-mail envoyé.</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {envois.rows.map((en) => {
            const c = en.clientId ? parId.get(en.clientId) : null;
            const echec = en.statut === 'echec';
            return (
              <div key={en.id} style={s.ligneHisto}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{TYPES_ENVOI[en.type] || en.type}</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--spa-ink2)' }} data-no-translate>
                    {c ? nomClient(c) : en.email}
                  </span>
                  <Puce ton={echec ? 'sakura' : 'matcha'}>{echec ? 'Échec' : en.statut === 'en_cours' ? 'En cours' : 'Envoyé'}</Puce>
                </div>
                <div style={{ color: 'var(--spa-ink3)', fontSize: 12 }}>{dateHeure(en.createdAt)}{echec && en.erreur ? ` : ${en.erreur}` : ''}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const s = {
  audience: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    padding: '16px 18px', borderRadius: 'var(--spa-r)', background: 'var(--spa-surface)',
    border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  audienceIcone: {
    width: 46, height: 46, borderRadius: 23, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-matcha-soft)', color: 'var(--spa-matcha)',
  },
  jauge: { height: 6, borderRadius: 3, background: 'var(--spa-sunken)', marginTop: 8, overflow: 'hidden', maxWidth: 420 },
  jaugePlein: { display: 'block', height: '100%', borderRadius: 3, background: 'var(--spa-matcha)' },
  deuxColonnes: {
    display: 'grid', gap: 20, alignItems: 'start',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
  },
  ligneHisto: { padding: '10px 0', borderBottom: '1px solid var(--spa-line)', fontSize: 14, lineHeight: 1.45 },
};

// Couleurs de l'e-mail réel (gabarit spa-mailer), volontairement fixes.
const e = {
  cadre: { borderRadius: 'var(--spa-r)', overflow: 'hidden', border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)' },
  enveloppe: { padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid #ece6dc' },
  fond: { background: '#f3efe9', padding: '20px 14px' },
  carte: { background: '#ffffff', borderRadius: 14, overflow: 'hidden', maxWidth: 480, margin: '0 auto' },
  marque: { padding: '24px 24px 0', textAlign: 'center', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 21, letterSpacing: 1, color: '#2b2b2b' },
  trait: { width: 40, height: 1, background: '#d9cbb6', margin: '14px auto 0' },
  p: { margin: '0 0 14px', fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 14, lineHeight: 1.6, color: '#2b2b2b' },
  bon: {
    margin: '4px 0 20px', padding: '20px 16px', textAlign: 'center', borderRadius: 12,
    border: '1px solid #d9cbb6', background: '#fbf7f1',
  },
  bonSur: { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: '#9a8466', marginBottom: 8 },
  bonValeur: { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 19, lineHeight: 1.35, color: '#2b2b2b', marginBottom: 12 },
  bonCode: {
    display: 'inline-block', padding: '8px 14px', border: '1px dashed #9a8466', borderRadius: 8,
    fontFamily: '"Courier New", monospace', fontSize: 15, letterSpacing: 2, color: '#2b2b2b',
  },
  pied: {
    padding: '16px 24px 22px', textAlign: 'center', borderTop: '1px solid #f0ebe3',
    fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, lineHeight: 1.6, color: '#8a8a8a',
  },
};
