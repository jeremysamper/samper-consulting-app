import React from 'react';
import { useRegulariteEquipe } from '../planning/contratsService.js';
import { formatSolde } from '../planning/soldesHeures.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { Chiffre, Section } from './tableauBriques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Les chiffres de la semaine et du mois : réservés à la direction (consultant,
// patron). La brigade n'en a pas l'usage pendant le service. Un chiffre en
// grand par bloc, d'un geste vers son module ; les couverts du jour sont dans
// l'en-tête, pour tout le monde. Rien à compter : une phrase à la place du
// chiffre (« Aucune perte ce mois-ci »), jamais « CHF 0 » ni « 0 h ». Lecture
// en échec jamais aboutie : « Indisponible pour l'instant ».
// Nombres et mots dans des nœuds séparés : la phrase reste une entrée du
// glossaire au lieu de partir au traducteur à chaque valeur.
// ─────────────────────────────────────────────────────────────────────────────

const nombre = (v) => Math.round(v || 0).toLocaleString('fr-CH');
const Chf = ({ v }) => <><span data-no-translate>CHF</span>{' '}<span data-no-translate>{nombre(v)}</span></>;
const INDISPONIBLE = "Indisponible pour l'instant";

export default function ChiffresGestion({
  chiffres, stock, avecPertes, avecStock, avecCouverts, avecPlanning, nonLu = () => false, peutOuvrir, ouvrir,
}) {
  // Régularité de l'équipe : une ligne sous les chiffres, seulement si
  // l'établissement a au moins un contrat (aucun bloc de plus).
  const regularite = useRegulariteEquipe(avecPlanning);
  const heures = chiffres.heures;
  const blocs = [
    avecCouverts && {
      id: 'couverts', page: 'previsions', label: 'Couverts réservés',
      ...(nonLu('couverts') ? { texte: INDISPONIBLE }
        : !chiffres.couvertsSemaine ? { texte: 'Aucune réservation' }
          : { valeur: <span data-no-translate>{nombre(chiffres.couvertsSemaine)}</span>, detail: 'Sur les sept prochains jours' }),
    },
    avecPlanning && {
      id: 'heures', page: 'planning', label: 'Heures planifiées',
      ...(nonLu('shifts') ? { texte: INDISPONIBLE }
        : !heures ? { texte: 'Aucune heure planifiée' }
          : { valeur: <><span data-no-translate>{heures.toLocaleString('fr-CH')}</span>{' '}<span data-no-translate>h</span></>, detail: 'Sur les sept prochains jours' }),
    },
    avecPertes && {
      id: 'pertes', page: 'pertes', label: 'Pertes du mois',
      ...(nonLu('pertes') ? { texte: INDISPONIBLE }
        : !chiffres.valeurPertes && !chiffres.aValider ? { texte: 'Aucune perte ce mois-ci' }
          : {
            valeur: <Chf v={chiffres.valeurPertes} />,
            detail: chiffres.aValider
              ? <><span data-no-translate>{chiffres.aValider}</span>{' '}<span>à valider</span></>
              : <span>Toutes validées</span>,
            couleurDetail: chiffres.aValider ? 'var(--warning-text)' : 'var(--text2)',
          }),
    },
    avecStock && {
      id: 'stock', page: 'inventaire', label: 'Stock valorisé',
      ...(nonLu('inventaires') ? { texte: INDISPONIBLE }
        : stock.recent ? { valeur: <Chf v={stock.valeur} />, detail: stock.detail }
          // Valeur nulle ou ancienne : la phrase remplace le montant, et le
          // bloc mène à l'inventaire pour qui peut l'ouvrir.
          : {
            texte: "Pas d'inventaire récent",
            detail: peutOuvrir('inventaire') ? "Ouvrir l'inventaire" : stock.detail,
            couleurDetail: peutOuvrir('inventaire') ? 'var(--accent)' : 'var(--text2)',
          }),
    },
  ].filter(Boolean);

  if (!blocs.length) return null;

  return (
    <Section id="tdb-chiffres" titre="Les chiffres de la semaine et du mois" sousTitre="Visible par la direction seulement">
      <div className="tdb-chiffres">
        {blocs.map((c) => (
          <Chiffre
            key={c.id}
            id={c.id}
            label={c.label}
            valeur={c.valeur}
            texte={c.texte}
            detail={c.detail}
            couleurDetail={c.couleurDetail}
            onClick={peutOuvrir(c.page) ? () => ouvrir(c.page) : null}
          />
        ))}
      </div>
      {avecPlanning && regularite.avecContrats && <Regularite r={regularite} />}
    </Section>
  );
}

// « Retards aujourd'hui 2  Léa 7 min, Hugo 12 min » et « Soldes négatifs du
// mois -12 h 30  3 personnes ». Chaque nom et chaque nombre dans son nœud.
function Regularite({ r }) {
  const prenom = (id) => userDisplay(id).prenom || userDisplay(id).name;
  return (
    <div style={s.regularite} data-chiffre="regularite">
      <div style={s.regLigne}>
        <span style={s.label}>Retards aujourd&apos;hui</span>
        <span style={s.regValeur}>{r.retardsJour.length}</span>
        {r.retardsJour.length > 0 ? (
          <span style={s.services}>
            {r.retardsJour.map(x => (
              <span key={x.userId} style={s.service}>
                <span data-no-translate>{prenom(x.userId)}</span>
                <span style={s.nombre}>{x.minutes}</span>
                <span>min</span>
              </span>
            ))}
          </span>
        ) : (
          <span style={s.regDetail}>Aucun retard</span>
        )}
      </div>
      <div style={s.regLigne}>
        <span style={s.label}>{r.periode.complet ? 'Soldes négatifs du mois dernier' : 'Soldes négatifs du mois, à hier'}</span>
        {r.personnesNegatives > 0 ? (
          <>
            <span style={{ ...s.regValeur, color: 'var(--warning-text)' }}>{formatSolde(r.totalNegatif)}</span>
            <span style={s.regDetail}>
              <span>{r.personnesNegatives}</span> <span>{r.personnesNegatives > 1 ? 'personnes' : 'personne'}</span>
            </span>
          </>
        ) : (
          <span style={s.regDetail}>Aucun solde négatif</span>
        )}
      </div>
    </div>
  );
}

const s = {
  label: { fontSize: 14, fontWeight: 600, color: 'var(--text2)' },
  services: { display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 14, color: 'var(--text2)' },
  service: { display: 'inline-flex', alignItems: 'baseline', gap: 5 },
  nombre: { fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  regularite: {
    display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)',
  },
  regLigne: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 12px', minWidth: 0 },
  regValeur: { fontFamily: 'var(--font-num)', fontSize: 22, lineHeight: 1.1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  regDetail: { fontSize: 14, color: 'var(--text2)' },
};
