import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { CarteAvant, SegmentedTabs } from '../../components/ui/index.jsx';
import { BoutonActions } from '../../components/ui/Fenetres.jsx';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useResaClients, nomClient } from '../../hooks/useResaClients.js';
import { confirmationEffacement, effacerPersonne, exporterPersonne, telechargerExport } from '../../services/personneService.js';
import { listTicketsClient } from '../../services/caisseService.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { ficheClient, jourRelatif } from './ficheClient.js';
import { SERVICE_META, serviceAffiche } from './statutsReservation.js';
import './reservations.css';

// ═══════════════════════════════════════════════════════════════════════════
// Fiche client d'un restaurant (lot L8, composition d'un CRM).
//
// Au centre, le fil d'activité daté, du plus récent au plus ancien :
// réservations, visites avec le montant de leurs tickets (articles repliés),
// notes, allergies ajoutées. À droite, les propriétés (visites, dépense
// moyenne, table préférée, allergies, étiquettes, prochaine venue) et, dessous,
// une suggestion calculée sur les données, sans IA ; sans données
// suffisantes, elle n'est pas rendue. Les coordonnées et l'accord pour les
// actualités restent modifiables dans l'onglet Coordonnées. Au téléphone et
// dans une fenêtre étroite, les propriétés passent en premier.
// Les calculs sont dans ficheClient.js (testés).
//
// Ouverte depuis l'onglet Clients ou depuis une réservation. Même contrat que
// les autres modales du module : pendant un enregistrement, « Enregistrer »
// est bloqué, jamais la fermeture ; une écriture finie après fermeture se
// signale en toast sans toucher à l'écran.
// ═══════════════════════════════════════════════════════════════════════════

const pad = (n) => String(n).padStart(2, '0');
const dateCh = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};
const dateHeureCh = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

// Le fil se déplie au-delà de ce nombre d'événements.
const FIL_VISIBLE = 15;

const FORM_VIDE = {
  prenom: '', nom: '', email: '', telephone: '', dateNaissance: '',
  allergies: '', preferences: '', notes: '',
};

const ONGLETS = [
  { id: 'activite', label: 'Activité' },
  { id: 'coordonnees', label: 'Coordonnées' },
];

const MOT_JOUR = { aujourdhui: 'Aujourd\'hui', hier: 'Hier', demain: 'Demain' };
const TEXTE_ETAT = {
  a_venir: 'À venir', a_confirmer: 'À confirmer', annulee: 'Annulée', no_show: 'No-show', non_confirmee: 'Non confirmée',
};
const ENCRE_ETAT = {
  a_venir: 'var(--lien)', a_confirmer: 'var(--warning-text)', annulee: 'var(--text3)', no_show: 'var(--danger-text)', non_confirmee: 'var(--text3)',
};
// Point du fil : la visite en aplat d'accent, la note neutre, l'allergie en
// rouge d'alerte (la réservation prend l'encre de son état, en anneau).
const POINT = {
  visite: 'var(--accent)', note: 'var(--text3)', allergie: 'var(--danger-text)',
};

function Champ({ label, children, aide }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' }}>{label}</span>
      {children}
      {aide && <span style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>{aide}</span>}
    </label>
  );
}

const champ = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', minHeight: 44,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--t3)', fontFamily: 'var(--font)',
};

const boutonSecondaire = {
  minHeight: 44, padding: '8px 14px', borderRadius: 'var(--r-full)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
  background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', cursor: 'pointer',
};

const Num = ({ children }) => <span style={{ fontFamily: 'var(--font-num)' }}>{children}</span>;

const puce = (fond, encre) => ({
  display: 'inline-block', padding: '2px 10px', margin: '0 4px 4px 0', borderRadius: 'var(--r-full)',
  background: fond, color: encre, fontSize: 'var(--t1)', fontWeight: 'var(--g2)', lineHeight: 1.5,
});
const PUCE_ETIQUETTE = {
  habitue: puce('var(--success-bg-soft)', 'var(--success-text)'),
  regime: puce('var(--success-bg-soft)', 'var(--success-text)'),
  autre: puce('var(--surface)', 'var(--text2)'),
};

function Propriete({ label, children, detail }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 40%) minmax(0, 1fr)', gap: 10, padding: '8px 0', alignItems: 'baseline' }}>
      <span style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>{label}</span>
      <div style={{ minWidth: 0, fontSize: 'var(--t2)', color: 'var(--text)', overflowWrap: 'anywhere' }}>
        <div>{children}</div>
        {detail && <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)', marginTop: 2 }}>{detail}</div>}
      </div>
    </div>
  );
}

function Jour({ jour, aujourdhui }) {
  const j = jourRelatif(jour, aujourdhui);
  return j.mot ? <span>{MOT_JOUR[j.mot]}</span> : <Num>{j.date}</Num>;
}

function Proprietes({ p, aujourdhui }) {
  return (
    <div data-fiche-proprietes="" style={{ background: 'var(--piste)', borderRadius: 'var(--r-lg)', padding: '12px 16px' }}>
      <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginBottom: 2 }}>Propriétés</div>
      <Propriete
        label="Visites"
        detail={p.derniere ? <><span>dernière le</span> <Num>{dateCh(p.derniere)}</Num></> : null}
      >
        <Num>{p.visites}</Num>
      </Propriete>
      {p.depenseMoyenne != null && (
        <Propriete label="Dépense moyenne">
          <Num>{Math.round(p.depenseMoyenne)}</Num> <span>CHF</span>
        </Propriete>
      )}
      {p.tablePreferee && (
        <Propriete
          label="Table préférée"
          detail={<><Num>{p.tablePreferee.fois}</Num> <span>visites sur</span> <Num>{p.tablePreferee.sur}</Num></>}
        >
          <span data-no-translate>{p.tablePreferee.nom}</span>
        </Propriete>
      )}
      {p.allergies.length > 0 && (
        <Propriete label="Allergies">
          {p.allergies.map((a) => <span key={a} style={puce('var(--danger-bg-soft)', 'var(--danger-text)')}>{a}</span>)}
        </Propriete>
      )}
      {p.etiquettes.length > 0 && (
        <Propriete label="Étiquettes">
          {p.etiquettes.map((e) => <span key={e.libelle} style={PUCE_ETIQUETTE[e.type] || PUCE_ETIQUETTE.autre}>{e.libelle}</span>)}
        </Propriete>
      )}
      {p.prochaine && (
        <Propriete
          label="Prochaine venue"
          detail={(
            <>
              {p.prochaine.couverts ? <><Num>{p.prochaine.couverts}</Num> <span>{p.prochaine.couverts > 1 ? 'couverts' : 'couvert'}</span></> : null}
              {p.prochaine.etat === 'a_confirmer' && <span style={{ color: 'var(--warning-text)', marginLeft: 8 }}>{TEXTE_ETAT.a_confirmer}</span>}
            </>
          )}
        >
          <Jour jour={p.prochaine.jour} aujourdhui={aujourdhui} />{p.prochaine.heure ? <>, <Num>{p.prochaine.heure}</Num></> : null}
        </Propriete>
      )}
      {p.noShows > 0 && (
        <Propriete label="No-show"><Num>{p.noShows}</Num></Propriete>
      )}
    </div>
  );
}

function Rythme({ r }) {
  if (r.n === 1) return <span>{r.unite === 'semaine' ? 'chaque semaine' : 'chaque mois'}</span>;
  return r.unite === 'semaine'
    ? <><span>toutes les</span> <Num>{r.n}</Num> <span>semaines</span></>
    : <><span>tous les</span> <Num>{r.n}</Num> <span>mois</span></>;
}

function Suggestion({ s }) {
  return (
    <CarteAvant ton="ciel" titre="À savoir" data-fiche-suggestion="" style={{ gap: 8, padding: '14px 16px' }}>
      {s.article && (
        <div style={{ fontSize: 'var(--t2)', lineHeight: 1.45 }}>
          <span>Souvent commandé</span> : <span data-no-translate style={{ fontWeight: 'var(--g3)' }}>{s.article.libelle}</span>
          {', '}<Num>{s.article.visites}</Num> <span>visites sur</span> <Num>{s.article.sur}</Num>.{' '}
          <span>À proposer avant la carte.</span>
        </div>
      )}
      {s.rythme && (
        <div style={{ fontSize: 'var(--t2)', lineHeight: 1.45 }}>
          <span>Revient environ</span> <Rythme r={s.rythme} />.
        </div>
      )}
    </CarteAvant>
  );
}

function LigneFil({ e, aujourdhui, derniere, deplie, onBasculer }) {
  const svc = e.service ? SERVICE_META[serviceAffiche(e.service)] : null;
  // Une réservation non venue est un anneau à l'encre de son état ; ce qui a
  // eu lieu est un point plein.
  const anneau = e.type === 'reservation';
  const point = anneau ? ENCRE_ETAT[e.etat] : POINT[e.type];
  const lignes = e.type === 'visite' ? (e.tickets || []).flatMap((t) => t.caisse_lignes || []) : [];
  const couverts = e.couverts
    ? <>, <Num>{e.couverts}</Num> <span>{e.couverts > 1 ? 'couverts' : 'couvert'}</span></>
    : null;

  let titre;
  if (e.type === 'visite') {
    titre = (
      <>
        <span>Visite</span>{couverts}
        {e.montant != null && <>, <Num>{chf(e.montant)}</Num> <span>CHF</span></>}
      </>
    );
  } else if (e.type === 'reservation') {
    titre = <><span>Réservation pour</span> <Num>{e.couverts}</Num></>;
  } else if (e.type === 'note') {
    titre = <><span>Note</span> : <span data-no-translate style={{ fontWeight: 'var(--g1)' }}>{e.texte}</span></>;
  } else {
    titre = <><span>Allergie ajoutée</span> : <span style={{ color: 'var(--danger-text)' }}>{e.libelle}</span></>;
  }

  const details = [];
  if (svc) details.push(<span key="svc" style={{ color: svc.couleur || 'var(--text2)', fontWeight: 'var(--g2)' }}>{svc.label}</span>);
  if (e.tables?.length) details.push(<span key="tab"><span>Table</span> <span data-no-translate>{e.tables.join(' + ')}</span></span>);
  if (e.occasions?.length) details.push(<span key="occ">{e.occasions.join(', ')}</span>);
  if (e.type === 'reservation') details.push(<span key="etat" style={{ color: ENCRE_ETAT[e.etat], fontWeight: 'var(--g3)' }}>{TEXTE_ETAT[e.etat]}</span>);
  if (e.enCours) details.push(<span key="cours" style={{ color: 'var(--success-text)', fontWeight: 'var(--g3)' }}>en cours</span>);
  if (e.origine === 'en_ligne') details.push(<span key="lig">en ligne</span>);

  return (
    <div
      data-fil-type={e.type}
      style={{
        display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) auto', columnGap: 12,
        padding: '12px 0', opacity: e.etat === 'annulee' ? 0.7 : 1,
        borderBottomWidth: derniere ? 0 : 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
      }}
    >
      <span aria-hidden="true" style={{
        width: 10, height: 10, borderRadius: '50%', boxSizing: 'border-box', marginTop: 5, justifySelf: 'center',
        background: anneau ? 'transparent' : point,
        borderWidth: anneau ? 2 : 0, borderStyle: 'solid', borderColor: point,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere' }}>{titre}</div>
        {details.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 }}>
            {details}
          </div>
        )}
        {lignes.length > 0 && (
          <button
            type="button"
            aria-expanded={deplie}
            onClick={onBasculer}
            style={{
              marginTop: 6, minHeight: 36, padding: '4px 12px', borderRadius: 'var(--r-full)',
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
              background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t1)', fontFamily: 'var(--font)', cursor: 'pointer',
            }}
          >
            <Num>{lignes.length}</Num> <span>articles</span>
          </button>
        )}
        {deplie && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lignes.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 'var(--t1)', color: 'var(--text2)' }}>
                <span style={{ fontFamily: 'var(--font-num)', minWidth: 22, textAlign: 'right' }}>{Number(l.quantite)}</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }} data-no-translate>{l.libelle}</span>
                <span style={{ fontFamily: 'var(--font-num)' }}>{chf(Number(l.quantite) * Number(l.prix_unitaire))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', fontSize: 'var(--t1)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
        <div><Jour jour={e.jour} aujourdhui={aujourdhui} /></div>
        {(e.type === 'visite' || e.type === 'reservation') && e.heure && (
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-num)' }}>{e.heure}</div>
        )}
      </div>
    </div>
  );
}

export default function ClientFiche({ etablissementId, clientId = null, canEdit = false, peutEffacer = false, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const clients = useResaClients(etablissementId);
  const [client, setClient] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [historique, setHistorique] = useState(null);
  // Tickets de caisse du client : null tant que non lus, [] s'il n'en a pas.
  const [tickets, setTickets] = useState(null);
  const [onglet, setOnglet] = useState('activite');
  const [filComplet, setFilComplet] = useState(false);
  const [deplie, setDeplie] = useState(null);
  const [chargement, setChargement] = useState(Boolean(clientId));
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const nouveau = !clientId;

  const ouvertRef = useRef(true);
  useEffect(() => {
    ouvertRef.current = true;
    return () => { ouvertRef.current = false; };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let vivant = true;
    (async () => {
      const [fiche, histo] = await Promise.all([clients.get(clientId), clients.historique(clientId)]);
      if (!vivant) return;
      if (fiche.error || !fiche.data) { setErreur(fiche.error || 'Fiche introuvable.'); setChargement(false); return; }
      setClient(fiche.data);
      setForm({ ...FORM_VIDE, ...Object.fromEntries(Object.keys(FORM_VIDE).map((k) => [k, fiche.data[k] || ''])) });
      setHistorique(histo.error ? [] : histo.data);
      setChargement(false);
      // Les tickets arrivent après la fiche : elle ne les attend pas. Une
      // lecture en échec laisse les visites sans montant, sans gêner le reste.
      const lus = await listTicketsClient(clientId, histo.error ? [] : histo.data.map((r) => r.id));
      if (vivant && !lus.error) setTickets(lus.data);
    })();
    return () => { vivant = false; };
  }, [clientId, clients]);

  const aujourdhui = zurichToday();
  const calcul = useMemo(
    () => (historique ? ficheClient({ client, historique, tickets: tickets || [], aujourdhui }) : null),
    [client, historique, tickets, aujourdhui],
  );

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function enregistrer() {
    if (!form.prenom.trim() && !form.nom.trim()) { setOnglet('coordonnees'); notify('Indiquez au moins un nom.', 'error'); return; }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { setOnglet('coordonnees'); notify('L\'e-mail semble incorrect.', 'error'); return; }
    setEnCours(true);
    const res = nouveau ? await clients.create(form) : await clients.update(clientId, form);
    setEnCours(false);
    if (res.error) {
      notify(ouvertRef.current ? res.error : `Fiche ${nomClient(form)} non enregistrée : ${res.error}`, 'error');
      return;
    }
    notify(`Fiche ${nomClient(res.data)} enregistrée`, 'success');
    onSaved?.(res.data);
    if (ouvertRef.current) onClose();
  }

  async function basculerConsentement() {
    if (!client) return;
    const accord = !client.consentementMarketing;
    setEnCours(true);
    const res = await clients.setConsentement(client.id, accord, 'equipe');
    setEnCours(false);
    if (res.error) { notify(res.error, 'error'); return; }
    if (ouvertRef.current) setClient(res.data);
    notify(accord ? `${nomClient(res.data)} accepte les actualités et bons cadeaux` : `${nomClient(res.data)} ne recevra plus d'actualités`, 'success');
    onSaved?.(res.data);
  }

  async function basculerArchive() {
    if (!client) return;
    const archive = !client.archive;
    if (archive && !window.confirm(`Archiver la fiche de ${nomClient(client)} ? Ses réservations restent, la fiche sort de la liste.`)) return;
    setEnCours(true);
    const res = await clients.setArchive(client.id, archive);
    setEnCours(false);
    if (res.error) { notify(res.error, 'error'); return; }
    notify(archive ? 'Fiche archivée' : 'Fiche sortie des archives', 'success');
    onSaved?.(res.data);
    if (ouvertRef.current) onClose();
  }

  // Export des données du client (droit d'accès, lot SI3) : un JSON téléchargé.
  async function exporterDonnees() {
    const { data, error } = await exporterPersonne('resa', clientId);
    if (error) { notify(error, 'error'); return; }
    telechargerExport(data, 'resa');
    notify('Export téléchargé : fiche, réservations, tickets et séjours.', 'success');
  }

  // Effacement anonymisant (droit à l'effacement, lot SI3) : les réservations
  // restent, le nom devient « Client effacé », contact et notes sont vidés.
  async function effacerDonnees() {
    if (!client || !window.confirm(confirmationEffacement(nomClient(client)))) return;
    setEnCours(true);
    let res;
    try { res = await effacerPersonne('resa', clientId); }
    finally { setEnCours(false); }
    if (res.error) { notify(res.error, 'error'); return; }
    notify('Données effacées : la fiche est anonymisée et archivée.', 'success');
    onSaved?.();
    if (ouvertRef.current) onClose();
  }

  const lecture = !canEdit;
  const nom = nomClient(client || form);
  const actionsRares = !nouveau && client ? [
    canEdit ? { titre: client.archive ? 'Sortir des archives' : 'Archiver', onClick: basculerArchive } : null,
    peutEffacer ? { titre: 'Exporter', onClick: exporterDonnees } : null,
    peutEffacer ? { titre: 'Effacer les données', onClick: effacerDonnees, danger: true } : null,
  ].filter(Boolean) : [];
  const fil = calcul?.fil || [];
  const filVisible = filComplet ? fil : fil.slice(0, FIL_VISIBLE);

  const coordonnees = (
    <>
      {/* Accord pour les actualités */}
      {!nouveau && client && (
        <div style={{
          padding: '10px 12px', borderRadius: 'var(--r)',
          borderWidth: 1, borderStyle: 'solid',
          borderColor: client.consentementMarketing ? 'var(--success-bd)' : 'var(--rule-soft)',
          background: client.consentementMarketing ? 'var(--success-bg-soft)' : 'var(--surface)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canEdit && client.email ? 'pointer' : 'default', minHeight: 44 }}>
            <input
              type="checkbox"
              checked={client.consentementMarketing}
              disabled={!canEdit || enCours || (!client.email && !client.consentementMarketing)}
              onChange={basculerConsentement}
              style={{ width: 20, height: 20, accentColor: 'var(--accent)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 'var(--t2)', color: 'var(--text)', fontWeight: 'var(--g2)' }}>
              Accepte de recevoir les actualités et les bons cadeaux par e-mail
            </span>
          </label>
          <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', marginLeft: 30 }}>
            {client.consentementMarketing && client.consentementAt
              ? `Accord donné ${client.consentementSource === 'en_ligne' ? 'en ligne' : 'à l\'équipe'} le ${dateHeureCh(client.consentementAt)}`
              : client.desinscritAt
                ? `Désinscrit le ${dateHeureCh(client.desinscritAt)}`
                : client.email
                  ? 'Pas d\'accord : aucun envoi d\'actualités.'
                  : 'Ajoutez un e-mail pour pouvoir lui écrire.'}
          </div>
        </div>
      )}

      {/* Coordonnées : deux colonnes dès que la place les tient (un champ date
          d'iPad demande environ 200 px). */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Champ label="Prénom"><input style={champ} value={form.prenom} readOnly={lecture} onChange={(e) => set('prenom', e.target.value)} autoComplete="off" /></Champ>
        <Champ label="Nom"><input style={champ} value={form.nom} readOnly={lecture} onChange={(e) => set('nom', e.target.value)} autoComplete="off" /></Champ>
        <Champ label="E-mail"><input style={champ} type="email" inputMode="email" value={form.email} readOnly={lecture} onChange={(e) => set('email', e.target.value)} autoComplete="off" /></Champ>
        <Champ label="Téléphone"><input style={champ} type="tel" inputMode="tel" value={form.telephone} readOnly={lecture} onChange={(e) => set('telephone', e.target.value)} autoComplete="off" /></Champ>
        <Champ label="Date de naissance"><input style={champ} type="date" value={form.dateNaissance} readOnly={lecture} onChange={(e) => set('dateNaissance', e.target.value)} /></Champ>
        <Champ label="Allergies, régime"><input style={champ} value={form.allergies} readOnly={lecture} placeholder="Gluten, végétarien…" onChange={(e) => set('allergies', e.target.value)} /></Champ>
      </div>
      <Champ label="Préférences" aide="Table préférée, vins, habitudes : ce que la salle doit savoir en l'accueillant.">
        <textarea style={{ ...champ, minHeight: 64, resize: 'vertical' }} value={form.preferences} readOnly={lecture} onChange={(e) => set('preferences', e.target.value)} />
      </Champ>
      <Champ label="Notes">
        <textarea style={{ ...champ, minHeight: 64, resize: 'vertical' }} value={form.notes} readOnly={lecture} onChange={(e) => set('notes', e.target.value)} />
      </Champ>
    </>
  );

  return (
    <div
      className="modal-full-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: isMobile ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-full"
        role="dialog"
        aria-modal="true"
        aria-label={nouveau ? 'Nouveau client' : 'Fiche client'}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: isMobile ? 0 : 'var(--r-xl)',
          width: nouveau ? 640 : 1000, maxWidth: '100%',
          maxHeight: isMobile ? '100%' : '90vh', height: isMobile ? '100%' : 'auto',
          minHeight: isMobile || nouveau ? undefined : 'min(560px, 90vh)',
          display: 'flex', flexDirection: 'column', boxShadow: 'var(--sh-lg)', overflow: 'hidden',
        }}
      >
        {/* En-tête */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 18px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {!nouveau && (
              <span aria-hidden="true" data-no-translate style={{
                width: 44, height: 44, borderRadius: '50%', background: 'var(--piste)', color: 'var(--text2)', flexShrink: 0,
                display: 'grid', placeItems: 'center', fontSize: 'var(--t3)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)',
              }}>
                {(nom.trim()[0] || '?').toUpperCase()}
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 'var(--g2)', fontSize: 'var(--t4)', color: 'var(--text)', fontFamily: 'var(--font)', overflowWrap: 'anywhere' }}>
                {nouveau ? 'Nouveau client' : <span data-no-translate>{nom}</span>}
                {client?.archive && <span style={{ marginLeft: 8, fontSize: 'var(--t1)', fontWeight: 'var(--g1)', color: 'var(--text3)' }}>archivée</span>}
              </div>
              {!nouveau && calcul?.proprietes.premiere && (
                <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 }}>
                  <span>Première visite le</span> <Num>{dateCh(calcul.proprietes.premiere)}</Num>
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ui-fermer" style={{
            background: 'none', border: 'none', fontSize: 'var(--t4)', cursor: 'pointer', color: 'var(--text2)',
            minWidth: 44, minHeight: 44, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Corps : conteneur de requêtes de la grille à deux colonnes. */}
        <div className="fiche-client-corps" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {chargement && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 'var(--t2)' }}>Chargement…</div>}
          {erreur && <div style={{ padding: 12, color: 'var(--danger-text)', fontSize: 'var(--t2)' }}>{erreur}</div>}

          {!chargement && !erreur && nouveau && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{coordonnees}</div>
          )}

          {!chargement && !erreur && !nouveau && calcul && (
            <div className="fiche-client-grille">
              <aside className="fiche-client-cote" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                <Proprietes p={calcul.proprietes} aujourdhui={aujourdhui} />
                {calcul.suggestion && <Suggestion s={calcul.suggestion} />}
              </aside>

              <section className="fiche-client-fil" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SegmentedTabs tabs={ONGLETS} active={onglet} onChange={setOnglet} />

                {onglet === 'activite' && (
                  <div data-fiche-fil="">
                    {fil.length === 0 && (
                      <div style={{ padding: '16px 0', fontSize: 'var(--t2)', color: 'var(--text3)' }}>Aucune activité pour l'instant.</div>
                    )}
                    {filVisible.map((e, i) => (
                      <LigneFil
                        key={e.id}
                        e={e}
                        aujourdhui={aujourdhui}
                        derniere={i === filVisible.length - 1}
                        deplie={deplie === e.id}
                        onBasculer={() => setDeplie(deplie === e.id ? null : e.id)}
                      />
                    ))}
                    {fil.length > FIL_VISIBLE && !filComplet && (
                      <button
                        type="button"
                        onClick={() => setFilComplet(true)}
                        style={{
                          marginTop: 8, minHeight: 44, padding: '8px 16px', borderRadius: 'var(--r-full)',
                          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
                          background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', cursor: 'pointer',
                        }}
                      >
                        Voir tout
                      </button>
                    )}
                  </div>
                )}

                {onglet === 'coordonnees' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{coordonnees}</div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Pied */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '12px 18px', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)',
        }}>
          {/* Actions rares : archiver, et pour le consultant et le patron le
              droit d'accès et le droit à l'effacement (SI3). Seule, l'action
              reste un bouton ; à plusieurs, elles passent au menu « Gérer »
              (le pied tient sur une ligne au téléphone). */}
          {actionsRares.length === 1 && (
            <button type="button" onClick={actionsRares[0].onClick} disabled={enCours} style={boutonSecondaire}>
              {actionsRares[0].titre}
            </button>
          )}
          {actionsRares.length > 1 && (
            <BoutonActions
              id="fiche-client-gerer"
              label="Gérer"
              style={boutonSecondaire}
              disabled={enCours}
              titre={nom}
              sections={[{ items: actionsRares }]}
            />
          )}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{
            minHeight: 44, padding: '8px 16px', borderRadius: 'var(--r)',
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
            background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', cursor: 'pointer',
          }}>
            {enCours ? 'Fermer' : canEdit ? 'Annuler' : 'Fermer'}
          </button>
          {canEdit && !chargement && !erreur && (
            <button type="button" onClick={enregistrer} disabled={enCours} style={{
              minHeight: 44, padding: '8px 16px', borderRadius: 'var(--r)', border: 'none',
              background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)',
              fontFamily: 'var(--font)', cursor: enCours ? 'wait' : 'pointer', opacity: enCours ? 0.7 : 1,
            }}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
