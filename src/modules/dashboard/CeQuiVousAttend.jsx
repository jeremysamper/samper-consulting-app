import React from 'react';
import { metaMotif, periodeAbsence } from '../../utils/absences.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { libelleGroupe } from '../groupes/typesGroupe.js';
import {
  couvertsDu, dateLongue, decaler, equipeDu, heureParlee, jourRelatif, nbAllergies,
} from './tableauLogique.js';
import {
  EtatEquipier, LienModule, Mots, Personne, Section, SousSection, StatutGroupe, Vide, b,
} from './tableauBriques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui vous attend : aujourd'hui, demain et les sept prochains jours.
//   Jour     réservations (couverts par service), groupes ; demain, l'équipe
//            et ses absences (celle d'aujourd'hui est dans « Qui travaille »)
//   Semaine  couverts des sept jours en barres, groupes et absences à venir
// Téléphone : un onglet par colonne pour tous les rôles, l'équipe du jour en
// tête de l'onglet Aujourd'hui (enTeteAujourdhui) ; les couverts du jour n'y
// sont pas répétés, le repère de l'en-tête les donne par service, juste au
// dessus. Tablette : Aujourd'hui et Demain côte à côte, la semaine dessous.
// Ordinateur : trois colonnes.
// Une lecture en échec qui n'a jamais abouti le dit, au lieu d'un « aucun ».
// ─────────────────────────────────────────────────────────────────────────────

const ONGLETS = [
  { id: 'aujourdhui', label: "Aujourd'hui" },
  { id: 'demain', label: 'Demain' },
  { id: 'semaine', label: 'Cette semaine' },
];

export default function CeQuiVousAttend(props) {
  const { mobile, enTeteAujourdhui } = props;
  const [onglet, setOnglet] = React.useState('aujourdhui');
  const refs = React.useRef({});

  // Flèches gauche et droite d'un onglet à l'autre (motif ARIA des onglets).
  const auClavier = (e) => {
    const i = ONGLETS.findIndex((o) => o.id === onglet);
    const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = ONGLETS[(i + pas + ONGLETS.length) % ONGLETS.length].id;
    setOnglet(suivant);
    refs.current[suivant]?.focus();
  };

  const panneau = (id) => {
    if (id === 'aujourdhui') return <Jour {...props} date={props.aujourdhui} titre="Aujourd'hui" sansCouverts={mobile} />;
    if (id === 'demain') return <Jour {...props} date={decaler(props.aujourdhui, 1)} titre="Demain" estDemain />;
    return <Semaine {...props} />;
  };

  if (mobile) {
    return (
      <Section id="tdb-attend" titre="Ce qui vous attend">
        <div role="tablist" aria-label="Ce qui vous attend" className="tdb-onglets" onKeyDown={auClavier}>
          {ONGLETS.map((o) => {
            const actif = onglet === o.id;
            return (
              <button
                key={o.id}
                ref={(el) => { refs.current[o.id] = el; }}
                type="button"
                role="tab"
                id={`tdb-onglet-${o.id}`}
                aria-selected={actif}
                aria-controls="tdb-onglet-panneau"
                tabIndex={actif ? 0 : -1}
                className={`tdb-onglet${actif ? ' is-actif' : ''}`}
                onClick={() => setOnglet(o.id)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <div role="tabpanel" id="tdb-onglet-panneau" aria-labelledby={`tdb-onglet-${onglet}`} style={s.panneau}>
          {onglet === 'aujourdhui' && enTeteAujourdhui}
          {panneau(onglet)}
        </div>
      </Section>
    );
  }

  return (
    <Section id="tdb-attend" titre="Ce qui vous attend">
      <div className="tdb-jours">
        <Colonne titre="Aujourd'hui" date={props.aujourdhui}>{panneau('aujourdhui')}</Colonne>
        <Colonne titre="Demain" date={decaler(props.aujourdhui, 1)}>{panneau('demain')}</Colonne>
        <Colonne titre="Cette semaine" sousTitre="Les sept prochains jours" semaine>{panneau('semaine')}</Colonne>
      </div>
    </Section>
  );
}

// Colonne titrée (tablette et ordinateur) : « Demain », samedi 31 octobre.
function Colonne({ titre, date, sousTitre, semaine = false, children }) {
  return (
    <div className={semaine ? 'tdb-jour tdb-jour-semaine' : 'tdb-jour'} style={{ minWidth: 0 }}>
      <h3 style={s.colTitre}>{titre}</h3>
      <p style={s.colDate}>{date ? <Mots texte={dateLongue(date)} /> : sousTitre}</p>
      {children}
    </div>
  );
}

// ── Un jour ───────────────────────────────────────────────────────────────
function Jour({
  date, estDemain = false, sansCouverts = false, couverts, groupes, shifts, absences, avecCouverts, avecGroupes, avecPlanning, avecAbsences,
  nonLu, peutOuvrir, ouvrir,
}) {
  const vers = (page) => (peutOuvrir(page) ? () => ouvrir(page) : null);
  const c = couvertsDu(couverts, date);
  const gJour = (groupes || []).filter((g) => g.dateEvenement === date);
  return (
    <div style={s.pile}>
      {avecCouverts && !sansCouverts && (
        <SousSection titre="Réservations" niveau={4} action={<LienModule onClick={vers('previsions')}>Voir les réservations</LienModule>}>
          {nonLu('couverts') ? <Vide>Réservations indisponibles pour l&apos;instant</Vide>
            : !c.total ? <Vide>Aucune réservation pour l&apos;instant.</Vide>
              : <CouvertsParService c={c} />}
        </SousSection>
      )}
      {avecGroupes && (
        <SousSection titre="Groupes" niveau={4} action={<LienModule onClick={vers('groupes')}>Voir les groupes</LienModule>}>
          {nonLu('groupes') ? <Vide>Groupes indisponibles pour l&apos;instant</Vide>
            : !gJour.length ? <Vide>{estDemain ? 'Aucun groupe demain.' : "Aucun groupe aujourd'hui."}</Vide>
              : gJour.map((g) => <LigneGroupe key={g.id} g={g} onClick={vers('groupes')} />)}
        </SousSection>
      )}
      {estDemain && avecPlanning && (
        <EquipeDemain date={date} shifts={shifts} absences={avecAbsences ? absences : []} echec={nonLu('shifts')} lien={vers('planning')} />
      )}
    </div>
  );
}

// « 42 à midi   68 le soir », puis « 110 couverts au total ».
function CouvertsParService({ c }) {
  const services = [
    ...(c.brunch ? [['brunch', c.brunch, 'au brunch']] : []),
    ['midi', c.midi, 'à midi'],
    ['soir', c.soir, 'le soir'],
  ];
  return (
    <div style={{ padding: '4px 0 2px' }}>
      <div style={s.services}>
        {services.map(([id, n, mot]) => (
          <div key={id} style={s.service}>
            <span className="tdb-couverts-valeur" style={{ ...s.serviceValeur, color: n ? 'var(--text)' : 'var(--text2)' }} data-no-translate>{n}</span>
            <span style={s.serviceMot}>{mot}</span>
          </div>
        ))}
      </div>
      <p style={s.total}><span data-no-translate>{c.total}</span>{' '}<span>couverts au total</span></p>
    </div>
  );
}

// « Anniversaire, 14 personnes à 19 h 30 » : même texte que phraseGroupe(),
// en nœuds (type au glossaire, nombre et heure sans traduction).
function PhraseGroupe({ g }) {
  const pax = Number(g.nbPax) || 0;
  return (
    <>
      <span>{libelleGroupe(g.typeGroupe, g.menuNumero)}</span>,{' '}
      <span data-no-translate>{pax}</span>{' '}
      {g.heure
        ? <><span>{pax > 1 ? 'personnes à' : 'personne à'}</span>{' '}<span data-no-translate>{heureParlee(g.heure)}</span></>
        : <span>{pax > 1 ? 'personnes' : 'personne'}</span>}
    </>
  );
}

// Un groupe : son nom et son statut sur la première ligne, la phrase sur
// toute la largeur de la seconde.
function LigneGroupe({ g, onClick, quand }) {
  const allergies = nbAllergies(g);
  const contenu = (
    <span style={{ flex: '1 1 auto', minWidth: 0 }}>
      <span style={s.groupeTete}>
        <span style={{ ...b.ligneTitre, minWidth: 0 }}>
          {quand ? <><span style={{ color: 'var(--text2)', fontWeight: 500 }}>{quand.charAt(0).toUpperCase() + quand.slice(1)}</span>{' : '}</> : null}
          <span data-no-translate>{g.nom}</span>
        </span>
        <StatutGroupe statut={g.statut} />
      </span>
      <span style={b.ligneDetail}>
        <PhraseGroupe g={g} />
        {allergies ? <>, <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}><span data-no-translate>{allergies}</span>{' '}<span>{allergies > 1 ? 'allergies' : 'allergie'}</span></span></> : null}
      </span>
    </span>
  );
  if (!onClick) return <div className="tdb-filet" style={b.ligne}>{contenu}</div>;
  return (
    <button type="button" className="tdb-filet tdb-ligne tdb-lien" onClick={onClick} style={{ ...b.ligne, ...b.bouton }}>
      {contenu}
    </button>
  );
}

// L'équipe de demain : une ligne par personne et ses heures, puis les
// absences de demain en une phrase (« Absences : Nadia Rochat, congé »).
function EquipeDemain({ date, shifts, absences, echec, lien }) {
  const equipe = equipeDu(shifts, date);
  const absents = (absences || []).filter((a) => a.dateDebut <= date && a.dateFin >= date);
  const absenceDe = (userId) => absents.find((a) => a.userId === userId);
  return (
    <SousSection titre="L'équipe de demain" niveau={4} action={<LienModule onClick={lien}>Ouvrir le planning</LienModule>}>
      {echec && <Vide>Le planning n&apos;a pas pu être lu pour l&apos;instant.</Vide>}
      {!echec && !equipe.length && <Vide>Personne au planning demain.</Vide>}
      {!echec && equipe.map(({ userId, shifts: liste }) => (
        <Personne
          key={userId}
          compact
          userId={userId}
          detail={<span data-no-translate>{liste.map((sh) => `${sh.debut} à ${sh.fin}`).join(', ')}</span>}
          droite={absenceDe(userId) ? <EtatEquipier motif={absenceDe(userId).motif} /> : null}
        />
      ))}
      {absents.length > 0 && (
        <p style={s.absencesDemain}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>Absences :</span>{' '}
          {absents.map((a, i) => (
            <React.Fragment key={a.id}>
              {i ? ', ' : ''}
              <span data-no-translate>{userDisplay(a.userId).name}</span>{' '}
              <span style={{ color: metaMotif(a.motif).id === 'vacances' ? 'var(--text2)' : metaMotif(a.motif).texte, fontWeight: 600 }}>({metaMotif(a.motif).label})</span>
            </React.Fragment>
          ))}
        </p>
      )}
    </SousSection>
  );
}

// ── La semaine ────────────────────────────────────────────────────────────
function Semaine({
  aujourdhui, couverts, groupes, absences, avecCouverts, avecGroupes, avecAbsences, nonLu, peutOuvrir, ouvrir,
}) {
  const vers = (page) => (peutOuvrir(page) ? () => ouvrir(page) : null);
  const jours = Array.from({ length: 7 }, (_, i) => decaler(aujourdhui, i));
  const totaux = jours.map((d) => couvertsDu(couverts, d).total);
  const max = Math.max(1, ...totaux);
  const total = totaux.reduce((a, n) => a + n, 0);
  const apresDemain = decaler(aujourdhui, 2);
  const groupesAVenir = (groupes || []).filter((g) => g.dateEvenement >= apresDemain);
  const absencesAVenir = (absences || [])
    .filter((a) => a.dateDebut >= apresDemain && a.dateDebut <= decaler(aujourdhui, 7))
    .sort((a, b2) => a.dateDebut.localeCompare(b2.dateDebut));
  const echecCouverts = avecCouverts && nonLu('couverts');
  const rien = !groupesAVenir.length && !absencesAVenir.length && (!avecCouverts || (!echecCouverts && !total));

  const graphique = (
    <div style={s.barres} aria-hidden="true">
      {jours.map((d, i) => {
        const rel = jourRelatif(d, aujourdhui);
        const initiale = rel === "aujourd'hui" ? 'Auj.' : rel === 'demain' ? 'Dem.' : `${rel.charAt(0).toUpperCase()}${rel.slice(1, 3)}.`;
        return (
          <div key={d} style={s.barreCol}>
            <span style={{ ...s.barreValeur, color: totaux[i] ? 'var(--text)' : 'var(--text2)' }} data-no-translate>{totaux[i] || ''}</span>
            <span style={{ ...s.barre, height: `${Math.max(4, (totaux[i] / max) * 64)}px`, background: i === 0 ? 'var(--accent)' : 'var(--accent-bd)', opacity: totaux[i] ? 1 : 0.35 }} />
            <span style={{ ...s.barreJour, color: i === 0 ? 'var(--accent)' : 'var(--text2)', fontWeight: i === 0 ? 700 : 500 }}>{initiale}</span>
          </div>
        );
      })}
    </div>
  );

  // Disposition (pile, ou deux colonnes sur toute la largeur) : tableau.css.
  return (
    <div className="tdb-semaine">
      {avecCouverts && (echecCouverts || total > 0) && (
        <SousSection
          className="tdb-semaine-couverts"
          titre="Couverts réservés"
          niveau={4}
          action={!echecCouverts && total > 0 ? <span style={s.auTotal}><span data-no-translate>{total}</span>{' '}<span>au total</span></span> : null}
        >
          {echecCouverts ? <Vide>Réservations indisponibles pour l&apos;instant</Vide>
            : vers('previsions')
              ? <button type="button" className="tdb-lien" onClick={vers('previsions')} style={s.graphiqueBouton} aria-label="Ouvrir les réservations">{graphique}</button>
              : graphique}
        </SousSection>
      )}
      {avecGroupes && groupesAVenir.length > 0 && (
        <SousSection className="tdb-semaine-groupes" titre="Groupes à venir" niveau={4}>
          {groupesAVenir.slice(0, 5).map((g) => (
            <LigneGroupe key={g.id} g={g} onClick={vers('groupes')} quand={jourRelatif(g.dateEvenement, aujourdhui)} />
          ))}
        </SousSection>
      )}
      {avecAbsences && absencesAVenir.length > 0 && (
        <SousSection className="tdb-semaine-absences" titre="Absences à venir" niveau={4}>
          {absencesAVenir.map((a) => {
            const m = metaMotif(a.motif);
            return (
              <Personne
                key={a.id}
                userId={a.userId}
                detail={<><span>{m.etat}</span>{' '}<span>{periodeAbsence(a)}</span></>}
                droite={<EtatEquipier motif={a.motif} />}
              />
            );
          })}
        </SousSection>
      )}
      {rien && <Vide>Rien de particulier cette semaine.</Vide>}
    </div>
  );
}

const s = {
  panneau: { display: 'flex', flexDirection: 'column', gap: 18, marginTop: 12, minWidth: 0 },
  pile: { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 },
  groupeTete: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, minWidth: 0 },
  absencesDemain: { margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--text2)' },
  colTitre: { margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 18, lineHeight: 1.25, color: 'var(--text)' },
  colDate: { margin: '2px 0 12px', fontSize: 13, lineHeight: 1.4, color: 'var(--text2)' },
  services: { display: 'flex', flexWrap: 'wrap', gap: '8px 28px' },
  service: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 },
  serviceValeur: { fontFamily: 'var(--font-num)', fontSize: 28, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  serviceMot: { fontSize: 15, color: 'var(--text2)' },
  total: { margin: '6px 0 0', fontSize: 13, lineHeight: 1.4, color: 'var(--text2)' },
  auTotal: { fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' },
  graphiqueBouton: {
    display: 'block', width: '100%', padding: 0, margin: 0, background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  barres: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, alignItems: 'end', padding: '6px 2px 2px' },
  barreCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 },
  barreValeur: { fontSize: 13, fontWeight: 500, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', minHeight: 16 },
  // Bout arrondi côté valeur, pied carré posé sur la ligne de base.
  barre: { width: '100%', maxWidth: 28, borderRadius: '4px 4px 0 0' },
  barreJour: { fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap' },
};
