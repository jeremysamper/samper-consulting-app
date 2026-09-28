import React from 'react';
import { CalendarDays, Moon, Sun, Sunrise } from 'lucide-react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import PhoneLink from '../../components/PhoneLink.jsx';
import { Avatar, Carte, Ligne, Puce, SousTitre, t } from './tableauUi.jsx';
import { userDisplay } from '../../utils/userDisplay.js';
import { metaMotif, periodeAbsence, resteAbsence } from '../../utils/absences.js';
import { metaStatut } from '../groupes/typesGroupe.js';
import {
  couvertsDu, dateLongue, decaler, etatShift, jourRelatif, nbAllergies, phraseGroupe,
} from './tableauLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// À savoir : aujourd'hui, demain et la semaine, d'un coup d'œil.
//   Jour    couverts réservés (midi, soir, brunch), groupes, équipe au planning
//           (en direct pour aujourd'hui : en poste, attendu, en retard) et
//           absents.
//   Semaine couverts des sept jours en barres, groupes et absences à venir.
// Sur téléphone, un onglet par colonne pour ne pas empiler trois cartes.
// ─────────────────────────────────────────────────────────────────────────────

const EQUIPE_MAX = 8;

export default function ASavoir(props) {
  const { mobile } = props;
  const [onglet, setOnglet] = React.useState('aujourdhui');
  const colonnes = [
    { id: 'aujourdhui', label: "Aujourd'hui" },
    { id: 'demain', label: 'Demain' },
    { id: 'semaine', label: 'Cette semaine' },
  ];

  const rendre = (id) => {
    if (id === 'aujourdhui') return <CarteJour key={id} {...props} date={props.aujourdhui} titre="Aujourd'hui" estAujourdhui />;
    if (id === 'demain') return <CarteJour key={id} {...props} date={decaler(props.aujourdhui, 1)} titre="Demain" />;
    return <CarteSemaine key={id} {...props} />;
  };

  return (
    <section aria-labelledby="tdb-a-savoir">
      <div style={s.entete}>
        <h2 id="tdb-a-savoir" style={s.titre}>À savoir</h2>
        {mobile && (
          <SegmentedTabs tabs={colonnes} active={onglet} onChange={setOnglet} size="sm" style={{ minWidth: 0, maxWidth: '100%' }} />
        )}
      </div>
      {mobile ? rendre(onglet) : <div className="tdb-jours">{colonnes.map((c) => rendre(c.id))}</div>}
    </section>
  );
}

// ── Un jour ───────────────────────────────────────────────────────────────
function CarteJour({
  titre, date, estAujourdhui, maintenant, shifts, couverts, groupes, absences, equipeDe, telephones = {},
  avecCouverts, avecGroupes, avecPlanning, avecAbsences, peutOuvrir, ouvrir,
}) {
  const [toute, setToute] = React.useState(false);
  const c = couvertsDu(couverts, date);
  const gJour = (groupes || []).filter((g) => g.dateEvenement === date);
  const equipe = equipeDe(date);
  const absents = (absences || []).filter((a) => a.dateDebut <= date && a.dateFin >= date);
  const vers = (page) => (peutOuvrir(page) ? () => ouvrir(page) : null);
  const equipeVisible = toute ? equipe : equipe.slice(0, EQUIPE_MAX);

  return (
    <Carte titre={titre} sousTitre={dateLongue(date)} style={{ display: 'flex', flexDirection: 'column' }}>
      {avecCouverts && (
        <BlocCouverts c={c} onClick={vers('previsions')} />
      )}

      {avecGroupes && gJour.length > 0 && (
        <>
          <SousTitre droite={`${gJour.reduce((n, g) => n + g.nbPax, 0)} pers.`}>{gJour.length > 1 ? `${gJour.length} groupes` : 'Groupe'}</SousTitre>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gJour.map((g) => <LigneGroupe key={g.id} g={g} onClick={vers('groupes')} />)}
          </div>
        </>
      )}

      {avecPlanning && (
        <>
          <SousTitre droite={equipe.length ? `${equipe.length} personne${equipe.length > 1 ? 's' : ''}` : null}>L'équipe</SousTitre>
          {!equipe.length && <div style={t.vide}>Personne au planning.</div>}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {equipeVisible.map(({ userId, shifts: liste }) => (
              <LigneEquipier key={userId} userId={userId} shifts={liste} estAujourdhui={estAujourdhui} maintenant={maintenant} absence={absents.find((a) => a.userId === userId)} tel={telephones[userId]} />
            ))}
          </div>
          {equipe.length > EQUIPE_MAX && (
            <button type="button" onClick={() => setToute((v) => !v)} style={s.plus}>
              {toute ? 'Réduire' : `et ${equipe.length - EQUIPE_MAX} autre${equipe.length - EQUIPE_MAX > 1 ? 's' : ''}`}
            </button>
          )}
        </>
      )}

      {avecAbsences && absents.length > 0 && (
        <>
          <SousTitre>Absents</SousTitre>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {absents.map((a) => {
              const m = metaMotif(a.motif);
              return (
                <div key={a.id} style={s.absent}>
                  <Avatar userId={a.userId} taille={26} />
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={t.nom} data-no-translate>{userDisplay(a.userId).name}</span>
                    <span style={{ ...t.texte2, display: 'block' }}>{m.etat} {resteAbsence(a, date)}</span>
                  </span>
                  <span style={{ ...s.motif, background: m.fond, color: m.texte }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Carte>
  );
}

function BlocCouverts({ c, onClick }) {
  const cases = [
    ...(c.brunch ? [{ id: 'brunch', label: 'Brunch', valeur: c.brunch, icone: Sunrise }] : []),
    { id: 'midi', label: 'Midi', valeur: c.midi, icone: Sun },
    { id: 'soir', label: 'Soir', valeur: c.soir, icone: Moon },
  ];
  const contenu = (
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      {cases.map(({ id, label, valeur, icone: Icone }) => (
        <div key={id} style={s.couvert}>
          <span style={s.couvertLabel}><Icone size={13} strokeWidth={2} aria-hidden="true" /> {label}</span>
          <span style={{ ...s.couvertValeur, color: valeur ? 'var(--text)' : 'var(--text3)' }}>{valeur}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <SousTitre droite={c.total ? `${c.total} au total` : null}>Couverts réservés</SousTitre>
      {onClick ? (
        <button type="button" className="tdb-lien" onClick={onClick} style={s.couvertsBouton} aria-label={`Couverts réservés : ${c.midi} à midi, ${c.soir} le soir${c.brunch ? `, ${c.brunch} au brunch` : ''}. Ouvrir les prévisions`}>
          {contenu}
        </button>
      ) : contenu}
      {!c.total && <div style={{ ...t.texte2, marginTop: 6 }}>Pas encore de réservation.</div>}
    </>
  );
}

function LigneGroupe({ g, onClick, quand }) {
  const statut = metaStatut(g.statut);
  const allergies = nbAllergies(g);
  return (
    <Ligne onClick={onClick} label={`${g.nom}, ${phraseGroupe(g)}. ${statut.label}`} style={{ background: 'var(--surface2)', boxShadow: `inset 3px 0 0 ${statut.barre}`, alignItems: 'flex-start' }}>
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <span style={{ ...t.nom, whiteSpace: 'normal' }}>
          {quand ? <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{quand.charAt(0).toUpperCase() + quand.slice(1)} : </span> : null}
          <span data-no-translate>{g.nom}</span>
        </span>
        <span style={{ ...t.texte2, display: 'block' }}>
          {phraseGroupe(g)}{allergies ? `, ${allergies} allergie${allergies > 1 ? 's' : ''}` : ''}
        </span>
        <span style={{ ...s.motif, display: 'inline-block', marginTop: 6, background: statut.fond, color: statut.texte }}>{statut.label}</span>
      </span>
    </Ligne>
  );
}

function LigneEquipier({ userId, shifts, estAujourdhui, maintenant, absence, tel }) {
  const u = userDisplay(userId);
  const heures = shifts.map((sh) => `${sh.debut} à ${sh.fin}`).join(', ');
  let etat = null;
  // Horaire posé pendant une absence : le motif prime sur l'état du pointage.
  const motif = absence ? metaMotif(absence.motif) : null;
  if (estAujourdhui && !motif) {
    // Le service en cours, sinon le prochain de la journée, sinon le dernier.
    const actif = shifts.find((sh) => sh.pointageDebut && !sh.pointageFin)
      || shifts.find((sh) => !sh.pointageDebut)
      || shifts[shifts.length - 1];
    etat = etatShift(actif, maintenant);
  }
  return (
    <div style={s.equipier}>
      <Avatar userId={userId} taille={28} />
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <span style={t.nom} data-no-translate>{u.name}</span>
        <span style={{ ...t.texte2, display: 'block', fontVariantNumeric: 'tabular-nums' }}>{heures}</span>
        <PhoneLink tel={tel} style={s.tel} />
      </span>
      {motif && <span style={{ ...s.motif, background: motif.fond, color: motif.texte }}>{motif.label}</span>}
      {etat === 'en_poste' && (
        <span style={s.etatEnPoste}><span className="tdb-live" aria-hidden="true" /> En poste</span>
      )}
      {etat === 'en_retard' && <Puce ton="warning">Pas pointé</Puce>}
      {etat === 'attendu' && <Puce ton="info">Attendu</Puce>}
      {etat === 'termine' && <Puce>Terminé</Puce>}
    </div>
  );
}

// ── La semaine ────────────────────────────────────────────────────────────
function CarteSemaine({
  aujourdhui, couverts, groupes, absences, avecCouverts, avecGroupes, avecAbsences, peutOuvrir, ouvrir,
}) {
  const vers = (page) => (peutOuvrir(page) ? () => ouvrir(page) : null);
  const jours = Array.from({ length: 7 }, (_, i) => decaler(aujourdhui, i));
  const totaux = jours.map((d) => couvertsDu(couverts, d).total);
  const max = Math.max(1, ...totaux);
  const apresDemain = decaler(aujourdhui, 2);
  const groupesAVenir = (groupes || []).filter((g) => g.dateEvenement >= apresDemain);
  const absencesAVenir = (absences || [])
    .filter((a) => a.dateDebut >= apresDemain && a.dateDebut <= decaler(aujourdhui, 7))
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
  const rien = !groupesAVenir.length && !absencesAVenir.length && (!avecCouverts || !totaux.some(Boolean));

  const graphique = (
    <div style={s.barres} aria-hidden="true">
      {jours.map((d, i) => {
        const initiale = jourRelatif(d, aujourdhui) === "aujourd'hui" ? 'Auj.' : jourRelatif(d, aujourdhui) === 'demain' ? 'Dem.' : `${jourRelatif(d, aujourdhui).slice(0, 3)}.`;
        return (
          <div key={d} style={s.barreCol}>
            <span style={{ fontSize: 11, fontWeight: 600, color: totaux[i] ? 'var(--text)' : 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{totaux[i] || ''}</span>
            <span style={{ ...s.barre, height: `${Math.max(4, (totaux[i] / max) * 64)}px`, background: i === 0 ? 'var(--accent)' : 'var(--accent-bd)', opacity: totaux[i] ? 1 : 0.35 }} />
            <span style={{ fontSize: 10.5, color: i === 0 ? 'var(--accent)' : 'var(--text2)', fontWeight: i === 0 ? 700 : 500, textTransform: 'capitalize' }}>{initiale}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Carte titre="Cette semaine" sousTitre="Les sept prochains jours" icone={CalendarDays}>
      {avecCouverts && (
        <>
          <SousTitre droite={`${totaux.reduce((a, b) => a + b, 0)} au total`}>Couverts réservés</SousTitre>
          {vers('previsions') ? (
            <button type="button" className="tdb-lien" onClick={vers('previsions')} style={s.couvertsBouton} aria-label={`Couverts réservés sur sept jours : ${totaux.join(', ')}. Ouvrir les prévisions`}>
              {graphique}
            </button>
          ) : graphique}
        </>
      )}

      {avecGroupes && groupesAVenir.length > 0 && (
        <>
          <SousTitre>Groupes à venir</SousTitre>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groupesAVenir.slice(0, 5).map((g) => (
              <LigneGroupe key={g.id} g={g} onClick={vers('groupes')} quand={jourRelatif(g.dateEvenement, aujourdhui)} />
            ))}
          </div>
          {groupesAVenir.length > 5 && <div style={{ ...t.texte2, marginTop: 6 }}>et {groupesAVenir.length - 5} autres dans les deux semaines.</div>}
        </>
      )}

      {avecAbsences && absencesAVenir.length > 0 && (
        <>
          <SousTitre>Absences à venir</SousTitre>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {absencesAVenir.map((a) => {
              const m = metaMotif(a.motif);
              return (
                <div key={a.id} style={s.absent}>
                  <Avatar userId={a.userId} taille={26} />
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={t.nom} data-no-translate>{userDisplay(a.userId).name}</span>
                    <span style={{ ...t.texte2, display: 'block' }}>{m.etat} {periodeAbsence(a)}</span>
                  </span>
                  <span style={{ ...s.motif, background: m.fond, color: m.texte }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {rien && <div style={{ ...t.vide, marginTop: avecCouverts ? 10 : 0 }}>Rien de particulier cette semaine.</div>}
    </Carte>
  );
}

const s = {
  entete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, minWidth: 0 },
  titre: { margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, color: 'var(--text)' },
  couvertsBouton: {
    display: 'block', width: '100%', padding: 0, background: 'transparent', border: 'none', borderRadius: 12,
    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  couvert: {
    flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4,
    padding: '10px 12px', borderRadius: 12, background: 'var(--surface2)',
  },
  couvertLabel: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', fontWeight: 600 },
  couvertValeur: { fontFamily: 'var(--font-num)', fontSize: 28, lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  equipier: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', minHeight: 44, minWidth: 0 },
  // Cible de tap confortable sans alourdir la ligne.
  tel: { display: 'inline-flex', alignItems: 'center', minHeight: 28, fontSize: 12.5 },
  etatEnPoste: {
    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
    fontSize: 11.5, fontWeight: 700, color: 'var(--success-text)', padding: '3px 9px', borderRadius: 999, background: 'var(--success-bg-soft)',
  },
  absent: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', minHeight: 44, minWidth: 0 },
  motif: { flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999 },
  plus: {
    alignSelf: 'flex-start', marginTop: 2, minHeight: 36, padding: '6px 10px', borderRadius: 999, cursor: 'pointer',
    background: 'transparent', color: 'var(--accent)', border: 'none', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
  },
  barres: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, alignItems: 'end', padding: '6px 4px 2px' },
  barreCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 },
  barre: { width: '100%', maxWidth: 34, borderRadius: 8 },
};
