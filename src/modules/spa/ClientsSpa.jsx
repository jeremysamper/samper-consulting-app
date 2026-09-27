import { useMemo, useState } from 'react';
import { Cake, HeartPulse, History, MailCheck, Search, UserRound, Users } from 'lucide-react';
import { makeSearchMatcher } from '../../utils/searchText.js';
import {
  Avatar, EtatVide, Puce, jourMois, nomClient, prochainAnniversaire, st,
} from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Fichier clients, en cartes. Recherche par mots (nom, prénom, téléphone,
// e-mail, dans n'importe quel ordre) et quatre filtres : tous, anniversaires
// des 30 prochains jours, clients qui acceptent les e-mails, fiches archivées.
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientsSpa({
  clients, status, statsClients, aujourdhui, filtre, setFiltre, onOuvrir, onNouveau,
}) {
  const [recherche, setRecherche] = useState('');

  const enrichis = useMemo(
    () => clients.map((c) => ({ c, anniv: prochainAnniversaire(c.dateNaissance, aujourdhui) })),
    [clients, aujourdhui]
  );

  const compte = useMemo(() => ({
    tous: clients.filter((c) => !c.archive).length,
    anniversaires: enrichis.filter(({ c, anniv }) => !c.archive && anniv && anniv.jours <= 30).length,
    emails: clients.filter((c) => !c.archive && c.consentementMarketing && c.email).length,
    archives: clients.filter((c) => c.archive).length,
  }), [clients, enrichis]);

  const visibles = useMemo(() => {
    const match = makeSearchMatcher(recherche);
    let liste = enrichis.filter(({ c }) => match(c.prenom, c.nom, c.telephone, c.email));
    liste = filtre === 'archives' ? liste.filter(({ c }) => c.archive) : liste.filter(({ c }) => !c.archive);
    if (filtre === 'anniversaires') {
      return liste.filter(({ anniv }) => anniv && anniv.jours <= 30).sort((a, b) => a.anniv.jours - b.anniv.jours);
    }
    if (filtre === 'emails') liste = liste.filter(({ c }) => c.consentementMarketing && c.email);
    return liste.sort((a, b) => nomTri(a.c).localeCompare(nomTri(b.c), 'fr'));
  }, [enrichis, recherche, filtre]);

  const filtres = [
    { id: 'tous', label: 'Tous' },
    { id: 'anniversaires', label: 'Anniversaires à venir', icone: Cake },
    { id: 'emails', label: 'Acceptent les e-mails', icone: MailCheck },
    { id: 'archives', label: 'Archivés' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
          <Search size={18} strokeWidth={1.8} aria-hidden="true" style={s.loupe} />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client"
            aria-label="Rechercher un client"
            style={{ ...st.champ, paddingLeft: 44, borderRadius: 999, background: 'var(--spa-surface)' }}
            autoComplete="off"
          />
        </div>
        {onNouveau && (
          <button type="button" onClick={onNouveau} style={st.secondaire}>
            <UserRound size={17} strokeWidth={1.8} aria-hidden="true" /> Nouveau client
          </button>
        )}
      </div>

      <div className="spa-defile" style={{ display: 'flex', gap: 8, paddingBottom: 4, marginBottom: 16 }}>
        {filtres.map(({ id, label, icone: Icone }) => (
          <button key={id} type="button" aria-pressed={filtre === id} onClick={() => setFiltre(id)} style={{ ...st.choix, flexShrink: 0, ...(filtre === id ? st.choixActif : null) }}>
            {Icone && <Icone size={15} strokeWidth={1.8} aria-hidden="true" />}
            {label}
            <span style={{ opacity: 0.7, fontWeight: 500 }}>{compte[id]}</span>
          </button>
        ))}
      </div>

      {status === 'error' && <div style={{ ...st.encartDanger, marginBottom: 12 }}>Lecture des clients impossible (connexion ?). Nouvel essai automatique.</div>}

      {status === 'ready' && !clients.length && (
        <EtatVide
          icone={Users}
          titre="Premier client"
          texte="Les fiches se créent ici, ou directement en prenant un rendez-vous."
          action={onNouveau && (
            <button type="button" onClick={onNouveau} style={{ ...st.principal, marginTop: 6 }}>Accueillir un client</button>
          )}
        />
      )}
      {status === 'ready' && clients.length > 0 && !visibles.length && (
        <EtatVide icone={Search} texte="Aucun client ne correspond." />
      )}

      <div style={s.grille}>
        {visibles.map(({ c, anniv }) => {
          const stat = statsClients.get(c.id);
          return (
            <button key={c.id} type="button" onClick={() => onOuvrir(c)} className="spa-carte-action" style={{ ...s.carte, opacity: c.archive ? 0.65 : 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, width: '100%' }}>
                <Avatar client={c} taille={48} />
                <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <span style={s.nom} data-no-translate>{nomClient(c)}</span>
                  <span style={s.contact} data-no-translate>{c.telephone || c.email || 'Pas de coordonnées'}</span>
                </span>
                {c.notesSante && <HeartPulse size={17} strokeWidth={1.8} color="var(--spa-sakura)" aria-label="Note santé" style={{ flexShrink: 0 }} />}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Puce icone={History}>
                  {stat ? `${stat.nb} séance${stat.nb > 1 ? 's' : ''}, ${jourMois(stat.derniere)}` : 'Nouveau'}
                </Puce>
                {anniv && anniv.jours <= 30 && (
                  <Puce icone={Cake} ton="kin">{anniv.jours === 0 ? 'Aujourd\'hui' : jourMois(anniv.date)}</Puce>
                )}
                {c.consentementMarketing && c.email && <Puce icone={MailCheck} ton="matcha">E-mails</Puce>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const nomTri = (c) => `${c.nom || ''} ${c.prenom || ''}`.trim().toLowerCase();

const s = {
  loupe: { position: 'absolute', left: 16, top: '50%', marginTop: -9, color: 'var(--spa-ink3)', pointerEvents: 'none' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 },
  carte: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, minWidth: 0,
    padding: 16, borderRadius: 'var(--spa-r)', cursor: 'pointer', textAlign: 'left',
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
    fontFamily: 'var(--font)', color: 'var(--spa-ink)',
  },
  nom: {
    display: 'block', fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.25,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  contact: { display: 'block', fontSize: 13, color: 'var(--spa-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};
