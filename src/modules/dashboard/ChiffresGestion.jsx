import React from 'react';
import { Carte } from './tableauUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Chiffres de gestion : réservés à la direction (consultant, patron). La
// brigade n'en a pas l'usage pendant le service. Une grande carte par chiffre,
// lisible d'un coup d'œil, et d'un geste vers son module. En tête, le chiffre
// du jour : les couverts réservés aujourd'hui, tant qu'aucune caisse n'est
// branchée (les ventes de la caisse sont vides en prod).
// Nombres et mots dans des nœuds séparés : la phrase reste une entrée du
// glossaire au lieu de partir au traducteur à chaque valeur.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (v) => `CHF ${Math.round(v || 0).toLocaleString('fr-CH')}`;

export default function ChiffresGestion({ chiffres, stock, couvertsJour, avecPertes, avecStock, avecCouverts, avecPlanning, peutOuvrir, ouvrir }) {
  const cartes = [
    avecCouverts && {
      id: 'jour', page: 'previsions', label: 'Le chiffre du jour', valeur: couvertsJour.total.toLocaleString('fr-CH'),
      unite: 'couverts réservés aujourd\'hui',
      detail: couvertsJour.total ? <ServicesDuJour c={couvertsJour} /> : 'Pas encore de réservation.',
      ton: 'var(--text2)',
    },
    avecPertes && {
      id: 'pertes', page: 'pertes', label: 'Pertes du mois', valeur: chf(chiffres.valeurPertes),
      detail: chiffres.aValider ? `${chiffres.aValider} à valider` : 'Toutes validées',
      ton: chiffres.aValider ? 'var(--warning-text)' : 'var(--text2)',
    },
    avecStock && (stock.recent ? {
      id: 'stock', page: 'inventaire', label: 'Stock valorisé', valeur: chf(stock.valeur),
      detail: stock.detail, ton: 'var(--text2)',
    } : {
      // Valeur nulle ou ancienne : la phrase remplace le montant, et la carte
      // mène à l'inventaire pour qui peut l'ouvrir.
      id: 'stock', page: 'inventaire', label: 'Stock valorisé', texte: "Pas d'inventaire récent",
      detail: peutOuvrir('inventaire') ? "Ouvrir l'inventaire" : stock.detail,
      ton: peutOuvrir('inventaire') ? 'var(--accent)' : 'var(--text2)',
    }),
    avecPlanning && {
      id: 'heures', page: 'planning', label: 'Heures planifiées', valeur: `${chiffres.heures.toLocaleString('fr-CH')} h`,
      detail: 'Sur les sept prochains jours', ton: 'var(--text2)',
    },
    avecCouverts && {
      id: 'couverts', page: 'previsions', label: 'Couverts réservés', valeur: chiffres.couvertsSemaine.toLocaleString('fr-CH'),
      detail: 'Sur les sept prochains jours', ton: 'var(--text2)',
    },
  ].filter(Boolean);

  if (!cartes.length) return null;

  return (
    <Carte titre="Chiffres de gestion" sousTitre="Visible par la direction seulement">
      <div style={s.grille}>
        {cartes.map((c) => {
          const contenu = (
            <>
              <span style={s.label}>{c.label}</span>
              {c.texte ? <span style={s.valeurTexte}>{c.texte}</span> : <span style={s.valeur}>{c.valeur}</span>}
              {c.unite && <span style={s.unite}>{c.unite}</span>}
              <span style={{ ...s.detail, color: c.ton }}>{c.detail}</span>
            </>
          );
          return peutOuvrir(c.page) ? (
            <button key={c.id} type="button" className="tdb-lien" data-chiffre={c.id} onClick={() => ouvrir(c.page)} style={{ ...s.carte, ...s.carteBouton }}>
              {contenu}
            </button>
          ) : (
            <div key={c.id} data-chiffre={c.id} style={s.carte}>{contenu}</div>
          );
        })}
      </div>
    </Carte>
  );
}

// « Midi 12   Soir 17 » (et le brunch s'il y en a) : chaque libellé et chaque
// nombre dans son propre nœud.
function ServicesDuJour({ c }) {
  const services = [
    c.brunch ? ['Brunch', c.brunch] : null,
    c.midi ? ['Midi', c.midi] : null,
    c.soir ? ['Soir', c.soir] : null,
  ].filter(Boolean);
  return (
    <span style={s.services}>
      {services.map(([label, n]) => (
        <span key={label} style={s.service}>
          <span>{label}</span>
          <span style={s.nombre}>{n}</span>
        </span>
      ))}
    </span>
  );
}

const s = {
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 },
  // Grande carte à un chiffre : le nombre d'abord, le reste en petit dessous.
  carte: {
    display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, minHeight: 128, boxSizing: 'border-box', textAlign: 'left',
    padding: '16px 18px', borderRadius: 'var(--r)', background: 'var(--bg)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    fontFamily: 'var(--font)', color: 'var(--text)',
  },
  carteBouton: { cursor: 'pointer' },
  label: { fontSize: 14, fontWeight: 500, color: 'var(--text2)' },
  valeur: { fontFamily: 'var(--font-num)', fontSize: 38, lineHeight: 1.05, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' },
  // Phrase à la place d'un montant : même place, taille de texte.
  valeurTexte: { fontSize: 18, lineHeight: 1.4, fontWeight: 500, color: 'var(--text2)' },
  unite: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.3 },
  detail: { fontSize: 12, lineHeight: 1.45, marginTop: 'auto' },
  services: { display: 'flex', flexWrap: 'wrap', gap: '4px 14px' },
  service: { display: 'inline-flex', alignItems: 'baseline', gap: 5 },
  nombre: { fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
};
