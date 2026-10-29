import React from 'react';
import { TAUX_AUTRE, TAUX_TVA, choixPourTaux } from './tvaAchats.js';

// ─────────────────────────────────────────────────────────────────────────────
// Choix du taux de TVA d'une pièce d'achat, partagé par « Vérifier la lecture »
// et la fiche dépliée de l'onglet Factures : les quatre taux suisses, « Autre
// taux » avec sa saisie en pour cent, « Non lu » pour effacer. `onChange`
// reçoit un nombre ou null, à chaque valeur définitive seulement (un « Autre
// taux » laissé vide ne change rien).
//
// Libellés d'options courts et sans mélange nombre et mots : le traducteur du
// DOM ne sait pas découper un <option>, et « 2,6 % » n'a rien à traduire. Le
// détail du taux choisi s'affiche à côté, dans son propre nœud.
// ─────────────────────────────────────────────────────────────────────────────

const lireTaux = (texte) => {
  const t = String(texte ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!t) return null;
  // Arrondi d'abord : 99.996 deviendrait 100, que la base refuse.
  const n = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : undefined;
};

export default function ChampTauxTva({ valeur, onChange, disabled = false, style, ariaLabel = 'Taux de TVA' }) {
  const [choix, setChoix] = React.useState(() => choixPourTaux(valeur));
  const [autre, setAutre] = React.useState(() => (choixPourTaux(valeur) === TAUX_AUTRE ? String(valeur) : ''));
  React.useEffect(() => {
    const c = choixPourTaux(valeur);
    setChoix(c);
    setAutre(c === TAUX_AUTRE ? String(valeur) : '');
  }, [valeur]);

  const changerChoix = (c) => {
    setChoix(c);
    if (c === TAUX_AUTRE) return;
    onChange(c === '' ? null : Number(c));
  };
  const validerAutre = () => {
    const n = lireTaux(autre);
    if (n == null) {
      // Vide ou illisible : on revient à la valeur connue, sans rien écrire.
      setAutre(choixPourTaux(valeur) === TAUX_AUTRE ? String(valeur) : '');
      if (choixPourTaux(valeur) !== TAUX_AUTRE) setChoix(choixPourTaux(valeur));
      return;
    }
    if (n !== (valeur != null && valeur !== '' ? Number(valeur) : null)) onChange(n);
  };
  const detail = TAUX_TVA.find(t => t.id === choix)?.detail || '';

  return (
    <span style={st.ligne}>
      <select value={choix} onChange={e => changerChoix(e.target.value)} disabled={disabled} style={{ ...style, ...st.select }} aria-label={ariaLabel}>
        <option value="">Non lu</option>
        {TAUX_TVA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        <option value={TAUX_AUTRE}>Autre taux</option>
      </select>
      {choix === TAUX_AUTRE && (
        <input
          type="text"
          inputMode="decimal"
          value={autre}
          onChange={e => setAutre(e.target.value)}
          onBlur={validerAutre}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="7.7"
          aria-label="Autre taux, en pour cent"
          disabled={disabled}
          style={{ ...style, ...st.autre }}
        />
      )}
      {detail && <span style={st.detail}>{detail}</span>}
    </span>
  );
}

const st = {
  ligne: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 },
  select: { flex: '1 1 120px', width: 'auto', minWidth: 0 },
  autre: { flex: '0 0 92px', width: 92 },
  detail: { flex: '1 1 100%', fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 },
};
