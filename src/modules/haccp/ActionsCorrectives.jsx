import React from 'react';
import { ACTION_AUTRE } from './HACCP.constants.js';
import { actionsProposees, plageEnClair, verdictReleve } from './haccpJour.js';

// ─────────────────────────────────────────────────────────────────────────────
// Un chiffre hors plage, dit en mots, et ce qu'on fait ensuite.
//
// Partagé par le relevé guidé (ReleveGuide.jsx) et le relevé d'une seule zone
// (ZoneTile.jsx). Dès que le chiffre tapé sort de la plage, avant d'enregistrer :
// le verdict (« Trop chaud »...), la consigne, et des puces d'actions à
// toucher, au choix, plusieurs possibles. Rien n'est obligatoire : « ✓ » ou
// « Enregistrer » enregistre avec ou sans. Les actions choisies partent dans le
// commentaire du relevé, au même INSERT (commentaireActions, haccpJour.js).
//
//   choix = { choisies: ['Chef prévenu'], autre: 'texte libre' }
//
// Nombres et unités dans leurs propres nœuds data-no-translate (Mesure) : la
// phrase autour reste une entrée du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

const NBSP = ' ';

// 3.5 devient « 3,5 » ; -18 reste « -18 ».
export function nombre(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

// Un nombre et son unité, jamais traduits.
export function Mesure({ valeur, unite, style }) {
  return <span data-no-translate="" style={style}>{nombre(valeur)}{unite ? NBSP + unite : ''}</span>;
}

// « Doit être entre 0 et 4 °C », « Doit être à 63 °C ou plus »...
export function PlageTexte({ zone }) {
  const p = plageEnClair(zone);
  if (p.cle === 'entre') return <>Doit être entre <Mesure valeur={p.min} /> et <Mesure valeur={p.max} unite={p.unite} /></>;
  if (p.cle === 'au_moins') return <>Doit être à <Mesure valeur={p.min} unite={p.unite} /> ou plus</>;
  if (p.cle === 'au_plus') return <>Doit être à <Mesure valeur={p.max} unite={p.unite} /> ou moins</>;
  return <>Pas de limite réglée</>;
}

export default function ActionsCorrectives({ zone, valeur, choix, onChoix, rappelPlage = false, desactive = false }) {
  const verdict = verdictReleve(zone, valeur);
  if (!verdict || verdict.ton !== 'danger') return null;
  const actions = actionsProposees(zone, verdict.sens);
  const choisies = choix?.choisies || [];
  const basculer = (a) => onChoix({
    ...choix,
    choisies: choisies.includes(a) ? choisies.filter(x => x !== a) : [...choisies, a],
  });
  return (
    <div data-cadre="" data-haccp-hors-plage="" style={st.bloc}>
      <div style={st.verdict}>
        {verdict.mot}
        {rappelPlage && <span style={st.rappel}>. <PlageTexte zone={zone} />.</span>}
      </div>
      <div style={st.consigne}>Que faire : prévenez le chef, puis touchez ce que vous avez fait.</div>
      <div style={st.puces}>
        {actions.map(a => {
          const on = choisies.includes(a);
          return (
            <button
              key={a} type="button" data-cadre="" aria-pressed={on} disabled={desactive}
              style={{ ...st.puce, ...(on ? st.puceOn : {}) }}
              onClick={() => basculer(a)}
            >{on ? '✓ ' : ''}{a}</button>
          );
        })}
      </div>
      {choisies.includes(ACTION_AUTRE) && (
        <input
          type="text" value={choix?.autre || ''} disabled={desactive}
          placeholder="Ce que j'ai fait"
          onChange={e => onChoix({ ...choix, autre: e.target.value })}
          style={st.champ}
        />
      )}
    </div>
  );
}

const st = {
  bloc: { marginTop: 10, padding: '12px 12px 10px', borderRadius: 'var(--r)', background: 'var(--danger-bg-soft)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  verdict: { fontSize: 15, fontWeight: 700, color: 'var(--danger-text)', lineHeight: 1.3 },
  rappel: { fontWeight: 400, color: 'var(--text)' },
  consigne: { fontSize: 13, color: 'var(--text)', lineHeight: 1.4 },
  puces: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  // Puce à bascule : 44 px au doigt, texte long replié sur deux lignes plutôt
  // qu'un débordement à 375 px.
  puce: {
    minHeight: 44, maxWidth: '100%', padding: '8px 14px', borderRadius: 22,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 500,
    lineHeight: 1.25, textAlign: 'left', whiteSpace: 'normal', cursor: 'pointer',
  },
  puceOn: { borderColor: 'var(--danger-strong)', background: 'var(--danger-bg)', color: 'var(--danger-text)', fontWeight: 600 },
  // 16 px : iOS ne zoome pas sur un champ à 16 px.
  champ: {
    width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', borderRadius: 'var(--r-sm)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 16,
  },
};
