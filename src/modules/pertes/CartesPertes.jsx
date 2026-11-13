import React from 'react';
import { ClipboardList, Hourglass, Layers, TrendingDown } from 'lucide-react';
import { Arc, Barres, CarteAvant, CarteRepere, carteAvantStyles } from '../../components/ui/index.jsx';
import { septJoursPertes } from './calculPertes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Repères et cartes de mise en avant de l'écran Pertes (direction Galet). Ils
// ne lisent rien de plus que l'écran : les pertes déjà chargées et filtrées
// par Pertes.jsx, comptées par calculPertes.js. Les montants en CHF existaient
// déjà sur cet écran, sous le même droit.
//
//   ReperesPertes     les quatre chiffres d'avant, en petites cartes blanches
//   CarteSeptJours    (soleil) la valeur des pertes des sept derniers jours
//   CarteRepartition  (ciel) la répartition par catégorie, en arc et légende
//
// Une carte sans donnée n'est pas rendue. Les graphiques sont muets : chaque
// nombre est dit par un texte posé à côté.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (v) => Number(v || 0).toFixed(2);

// Couleurs de série (app.css, miroir PDF présent) : une par catégorie, la
// sixième pour toutes les suivantes.
const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)'];

export function ReperesPertes({ totalValeur, declarations, nonValidees, parCategorie }) {
  const premiere = Object.entries(parCategorie || {}).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="pertes-reperes" data-pertes-reperes="">
      <CarteRepere
        Icone={TrendingDown}
        valeur={<span style={st.montant}>{`−CHF ${chf(totalValeur)}`}</span>}
        libelle="Valeur totale pertes (période)"
      />
      <CarteRepere Icone={ClipboardList} valeur={declarations} libelle="Déclarations" />
      <CarteRepere
        Icone={Hourglass}
        valeur={<span style={{ color: 'var(--warning-strong)' }}>{nonValidees}</span>}
        libelle="Non validées"
      />
      {premiere && (
        <CarteRepere
          Icone={Layers}
          valeur={<span style={st.montant}>{`CHF ${chf(premiere[1])}`}</span>}
          libelle={premiere[0]}
          detail="Première catégorie de perte"
        />
      )}
    </div>
  );
}

// Les sept derniers jours, aujourd'hui compris. Sous chaque barre, la valeur
// arrondie au franc et le jour (« Auj. » pour le dernier).
export function CarteSeptJours({ pertes, aujourdhui }) {
  const c = carteAvantStyles('soleil');
  const jours = septJoursPertes(pertes, aujourdhui);
  const total = jours.reduce((a, j) => a + j.valeur, 0);
  if (!(total > 0)) return null;
  const libelles = jours.map((j, i) => (i === jours.length - 1 ? 'Auj.' : `${j.date.slice(8, 10)}.${j.date.slice(5, 7)}`));
  return (
    <CarteAvant ton="soleil" className="pertes-soleil" data-carte="sept-jours">
      <div style={{ minWidth: 0 }}>
        <h2 style={{ ...c.titre, ...st.titre }}>Sept derniers jours</h2>
        <p style={{ ...c.libelle, ...st.sous }}>Valeur des pertes, en CHF</p>
      </div>
      <p style={st.ligneChiffre}>
        <span style={c.chiffre} data-no-translate="">{`CHF ${chf(total)}`}</span>
        <span style={c.libelle}>au total</span>
      </p>
      <Barres valeurs={jours.map(j => Math.round(j.valeur))} libelles={libelles} fort={jours.length - 1} encre="var(--carte-soleil-texte)" />
    </CarteAvant>
  );
}

// La répartition par catégorie : les cinq premières sur l'arc, les suivantes
// en une part ; la légende les nomme toutes, avec leur montant et leur part.
export function CarteRepartition({ parCategorie, totalValeur }) {
  if (!(totalValeur > 0)) return null;
  const c = carteAvantStyles('ciel');
  const lignes = Object.entries(parCategorie || {}).sort((a, b) => b[1] - a[1]);
  const couleur = (i) => SERIES[Math.min(i, SERIES.length - 1)];
  const reste = lignes.slice(5).reduce((a, [, v]) => a + v, 0);
  const parts = [
    ...lignes.slice(0, 5).map(([, v], i) => ({ valeur: v, couleur: SERIES[i] })),
    ...(reste > 0 ? [{ valeur: reste, couleur: SERIES[5] }] : []),
  ];
  return (
    <CarteAvant ton="ciel" className="pertes-ciel" data-carte="repartition">
      <h2 style={{ ...c.titre, ...st.titre }}>Répartition par catégorie</h2>
      <div className="pertes-repartition">
        <Arc parts={parts} total={totalValeur} piste="var(--surface)">
          <span style={{ ...c.chiffre, fontSize: 'var(--t5)' }} data-no-translate="">{`CHF ${chf(totalValeur)}`}</span>
        </Arc>
        <div style={st.legende}>
          {lignes.map(([cat, val], i) => {
            const pct = Math.round(val / totalValeur * 100);
            return (
              <div key={cat} style={st.ligne}>
                <span aria-hidden="true" style={{ ...st.point, background: couleur(i) }} />
                <span style={st.categorie}>{cat}</span>
                <span style={st.valeur}>CHF {val.toFixed(2)}</span>
                <span style={st.part}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </CarteAvant>
  );
}

const st = {
  // Un montant dans un repère : la couleur des pertes, une taille qui tient
  // dans une demi-largeur de téléphone.
  montant: { display: 'inline-block', color: 'var(--danger-strong)', fontSize: 'var(--t5)', lineHeight: 1.15, overflowWrap: 'anywhere' },
  titre: { margin: 0, fontSize: 'var(--t3)', lineHeight: 1.25 },
  sous: { margin: '2px 0 0' },
  ligneChiffre: { display: 'flex', alignItems: 'baseline', gap: 8, margin: 0, flexWrap: 'wrap' },
  legende: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  ligne: { display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto 44px', alignItems: 'center', gap: 10, fontSize: 'var(--t2)', color: 'var(--carte-ciel-texte)' },
  point: { width: 10, height: 10, borderRadius: '50%' },
  categorie: { fontWeight: 'var(--g2)', minWidth: 0, overflowWrap: 'anywhere' },
  valeur: { fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  part: { textAlign: 'right', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
};
