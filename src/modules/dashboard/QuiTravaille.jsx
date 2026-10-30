import React from 'react';
import { metaMotif, resteAbsence } from '../../utils/absences.js';
import { equipeParService, etatShift } from './tableauLogique.js';
import { EtatEquipier, LienModule, Personne, Section, SousSection, Vide } from './tableauBriques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Qui travaille aujourd'hui, rangé par service : « qui est là ce soir » est la
// question de la brigade. Deux groupes Midi et Soir quand le jour a les deux
// (une personne en service coupé apparaît dans chacun, avec ses heures de ce
// service) ; un seul groupe : une liste simple. État de chaque horaire en
// direct (en poste, pas pointé, attendu, terminé) ou motif d'absence. Les
// absences du jour en fin de section (sauf qui est déjà dans la liste : sa
// ligne porte le motif).
//
// Section à part sur tablette et ordinateur ; sur téléphone, sous-section de
// l'onglet « Aujourd'hui » de « Ce qui vous attend » (dansOnglet), sans le
// lien vers le planning, déjà porté par le repère de l'en-tête.
//
// Au-delà de huit lignes, la suite attend « Voir toute l'équipe ». Les lignes
// en trop sont rendues mais masquées par tableau.css : en liste (téléphone,
// tablette), à partir de la neuvième ; en deux colonnes Midi | Soir (dès
// 1080 px), à partir de la neuvième de chaque colonne.
// ─────────────────────────────────────────────────────────────────────────────

const LIGNES_MAX = 8;
const NOMS_SERVICES = { midi: 'Midi', soir: 'Soir' };

export default function QuiTravaille({
  dansOnglet = false, aujourdhui, maintenant, shifts, absences, telephones = {},
  avecAbsences, echec, peutOuvrir, ouvrir,
}) {
  const [tout, setTout] = React.useState(false);
  const groupes = equipeParService(shifts, aujourdhui);
  const auPlanning = new Set(groupes.flatMap((g) => g.personnes.map((p) => p.userId)));
  const absentsJour = (absences || []).filter((a) => a.dateDebut <= aujourdhui && a.dateFin >= aujourdhui);
  const absentsHorsListe = absentsJour.filter((a) => !auPlanning.has(a.userId));
  const nbLignes = groupes.reduce((n, g) => n + g.personnes.length, 0);
  const plusLongGroupe = Math.max(0, ...groupes.map((g) => g.personnes.length));
  const deuxColonnes = !dansOnglet && groupes.length > 1;
  const lien = dansOnglet ? null : <LienModule onClick={peutOuvrir('planning') ? () => ouvrir('planning') : null}>Ouvrir le planning</LienModule>;

  const ligne = (userId, liste, rangListe, rangGroupe) => {
    const absence = absentsJour.find((a) => a.userId === userId);
    // Le service en cours, sinon le prochain, sinon le dernier.
    const actif = liste.find((sh) => sh.pointageDebut && !sh.pointageFin)
      || liste.find((sh) => !sh.pointageDebut)
      || liste[liste.length - 1];
    const poste = liste.find((sh) => sh.poste)?.poste;
    const classes = tout ? '' : [
      rangListe >= LIGNES_MAX ? 'tdb-hors-liste' : '',
      rangGroupe >= LIGNES_MAX ? 'tdb-hors-colonne' : '',
    ].join(' ').trim();
    return (
      <Personne
        key={userId}
        className={classes}
        userId={userId}
        tel={telephones[userId]}
        detail={(
          <>
            <span data-no-translate>{liste.map((sh) => `${sh.debut} à ${sh.fin}`).join(', ')}</span>
            {poste ? <>, <span data-no-translate>{poste}</span></> : null}
          </>
        )}
        droite={absence ? <EtatEquipier motif={absence.motif} /> : <EtatEquipier etat={etatShift(actif, maintenant)} />}
      />
    );
  };

  let rang = 0;
  const blocs = groupes.map((g) => {
    const lignes = g.personnes.map((p, i) => ligne(p.userId, p.shifts, rang++, i));
    if (groupes.length === 1) return <div key={g.id} className="tdb-equipe-groupe" style={{ minWidth: 0 }}>{lignes}</div>;
    return (
      <SousSection key={g.id} className="tdb-equipe-groupe" titre={NOMS_SERVICES[g.id]} compte={g.personnes.length} niveau={dansOnglet ? 4 : 3}>
        {lignes}
      </SousSection>
    );
  });

  // Le bouton ne sert qu'en liste quand aucune colonne ne dépasse huit lignes :
  // tableau.css le masque alors en deux colonnes.
  const voirTout = !echec && (nbLignes > LIGNES_MAX || plusLongGroupe > LIGNES_MAX) && (
    <button
      type="button"
      className={plusLongGroupe > LIGNES_MAX ? 'tdb-lien' : 'tdb-lien tdb-voir-liste'}
      onClick={() => setTout((v) => !v)}
      style={s.plus}
    >
      {tout ? <span>Réduire</span> : <><span>Voir toute l&apos;équipe</span>{' '}<span data-no-translate>({auPlanning.size})</span></>}
    </button>
  );

  const absencesBloc = avecAbsences && absentsHorsListe.length > 0 && (
    <SousSection key="absences" className="tdb-equipe-absences" titre="Absences" niveau={dansOnglet ? 4 : 3}>
      {absentsHorsListe.map((a) => {
        const m = metaMotif(a.motif);
        return (
          <Personne
            key={a.id}
            userId={a.userId}
            detail={<><span>{m.etat}</span>{' '}<span>{resteAbsence(a, aujourdhui)}</span></>}
            droite={<EtatEquipier motif={a.motif} />}
          />
        );
      })}
    </SousSection>
  );

  // Une grille : en liste, les services, le bouton puis les absences ; en
  // deux colonnes (tableau.css), Midi à gauche, Soir et les absences à droite.
  const corps = (
    <>
      {echec && <Vide>Le planning n&apos;a pas pu être lu pour l&apos;instant.</Vide>}
      {!echec && !groupes.length && <Vide>Personne au planning aujourd&apos;hui.</Vide>}
      <div className={`tdb-equipe-services${deuxColonnes ? ' tdb-equipe-services--deux' : ''}`}>
        {!echec && blocs}
        {voirTout}
        {absencesBloc}
      </div>
    </>
  );

  if (dansOnglet) {
    return <SousSection titre="Qui travaille aujourd'hui">{corps}</SousSection>;
  }
  return (
    <Section id="tdb-equipe" titre="Qui travaille aujourd'hui" action={lien}>
      {corps}
    </Section>
  );
}

const s = {
  plus: {
    justifySelf: 'start', alignSelf: 'start', minHeight: 44, padding: '0 6px', marginTop: -6, cursor: 'pointer',
    background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, color: 'var(--accent)',
  },
};
