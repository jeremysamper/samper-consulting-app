import { useState } from 'react';
import { formatDateCourte, formatJourSemaine } from '../../utils/dateHelpers.js';
import {
  JOURS_ANTICIPATION, joursAvant, libelleEcheance, libelleGroupe, metaStatut,
} from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Alerte d'anticipation : les groupes des 14 prochains jours.
//
// Un groupe entre ici à J-14 et y reste jusqu'au jour J. C'est le moment où il
// faut passer les commandes de volume et lancer la grosse production : deux
// semaines plus tard il ne reste que l'urgence.
//
// Le bandeau est orange tant qu'au moins un groupe n'est pas prêt, vert quand
// tout l'est. Aucun groupe dans la fenêtre : pas de bandeau du tout, un écran
// qui crie tout le temps n'alerte plus personne.
//
// Volontairement bas : une ligne de titre et des pastilles côte à côte. Le
// calendrier du mois doit rester visible sans faire défiler l'iPad.
//
// Sur téléphone (`compact`) les pastilles s'empileraient et repousseraient le
// mois hors de l'écran : le bandeau s'y réduit à sa ligne de titre, avec un
// point de couleur par groupe, et se déplie d'un tap.
// ─────────────────────────────────────────────────────────────────────────────

export default function AlerteAnticipation({ groupes, aujourdhui, compact = false, onOuvrir }) {
  // null = l'utilisateur n'a rien choisi : déplié sur tablette, replié sur téléphone.
  const [choix, setChoix] = useState(null);
  if (!groupes || !groupes.length) return null;
  const ouvert = choix ?? !compact;

  const restants = groupes.filter((g) => g.statut !== 'pret').length;
  const toutPret = restants === 0;
  const ton = toutPret
    ? { fond: 'var(--success-bg-soft)', bordure: 'var(--success-bd)', texte: 'var(--success-text)' }
    : { fond: 'var(--warning-bg-soft)', bordure: 'var(--warning-bd)', texte: 'var(--warning-text)' };
  const n = groupes.length;

  return (
    <div
      role="status"
      style={{
        marginBottom: 12, padding: '10px 12px', borderRadius: 'var(--r)',
        background: ton.fond, border: `1px solid ${ton.bordure}`,
      }}
    >
      <button
        type="button"
        onClick={() => setChoix(!ouvert)}
        aria-expanded={ouvert}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: 0, margin: 0, background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'var(--font)', fontSize: 13, color: ton.texte, lineHeight: 1.4,
        }}
      >
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontFamily: 'var(--font-serif)' }}>
            À anticiper : {n} groupe{n > 1 ? 's' : ''} dans les {JOURS_ANTICIPATION} prochains jours.
          </span>{' '}
          {toutPret
            ? 'Tout est lu et préparé.'
            : `${restants} à préparer : c'est le moment de commander et de prendre de l'avance.`}
        </span>
        {!ouvert && (
          <span aria-hidden="true" style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
            {groupes.slice(0, 6).map((g) => (
              <span key={g.id} style={{ width: 10, height: 10, borderRadius: 5, background: metaStatut(g.statut).barre }} />
            ))}
          </span>
        )}
        <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 16, lineHeight: 1 }}>{ouvert ? '▴' : '▾'}</span>
      </button>

      {ouvert && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {groupes.map((g) => {
          const m = metaStatut(g.statut);
          const jours = joursAvant(g.dateEvenement, aujourdhui);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onOuvrir?.(g)}
              title={`${g.nom} · ${m.detail}`}
              style={{
                flex: '1 1 250px', minWidth: 0, maxWidth: '100%', minHeight: 44, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: 'var(--surface)', border: '1px solid var(--border)',
                fontFamily: 'var(--font)', color: 'var(--text)',
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 10, height: 10, borderRadius: 5, background: m.barre, flexShrink: 0 }}
              />
              <span style={{
                flex: '1 1 auto', minWidth: 0, fontSize: 13, fontWeight: 700,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {libelleGroupe(g.typeGroupe, g.menuNumero)}
                <span style={{ fontWeight: 500, color: 'var(--text2)' }}>
                  {' '}· {formatJourSemaine(g.dateEvenement)} {formatDateCourte(g.dateEvenement)} · {g.nbPax} pax
                </span>
              </span>
              <span style={{
                flexShrink: 0, fontSize: 12, fontWeight: 700,
                color: jours <= 3 && g.statut !== 'pret' ? 'var(--danger-text)' : 'var(--text2)',
              }}>
                {libelleEcheance(jours)}
              </span>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
