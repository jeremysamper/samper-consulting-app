import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { notify } from '../../../components/toast/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pièces des sections qui écrivent dans reglages_modules (plan 15, lot 2) :
// l'état de lecture, une liste de textes de la maison (motifs, postes,
// catégories), une case à cocher dans sa cible de 44 px.
// ─────────────────────────────────────────────────────────────────────────────

export function EtatModule({ status }) {
  const texte = status === 'error'
    ? 'Ces réglages ne se lisent pas pour le moment. Réessayez dans un instant.'
    : 'Chargement…';
  return <p style={st.note}>{texte}</p>;
}

// Une liste de textes de la maison : chaque ligne se retire, un champ ajoute.
// `onChange(liste)` rend une promesse vraie quand l'écriture a réussi.
export function ListeTextes({ label, valeurs, max = 30, maxLen = 60, placeholder, onChange, desactive = false, vide }) {
  const [saisie, setSaisie] = React.useState('');
  const ajouter = async () => {
    const t = saisie.trim();
    if (!t) return;
    if (t.length > maxLen) { notify(`${maxLen} caractères au plus.`, 'warning'); return; }
    if (valeurs.some((v) => v.toLowerCase() === t.toLowerCase())) { notify('Cette valeur est déjà dans la liste.', 'warning'); return; }
    if (valeurs.length >= max) { notify(`${max} valeurs au plus.`, 'warning'); return; }
    if (await onChange([...valeurs, t])) setSaisie('');
  };
  return (
    <div style={st.liste}>
      {valeurs.length === 0 && vide && <p style={st.vide}>{vide}</p>}
      {valeurs.map((v) => (
        <div key={v} style={st.ligne} data-valeur-liste="">
          <span style={st.texte} data-no-translate="">{v}</span>
          <Btn variant="ghost" disabled={desactive} style={st.btn44} onClick={() => onChange(valeurs.filter((x) => x !== v))}>Retirer</Btn>
        </div>
      ))}
      <div style={st.ajout}>
        <input
          type="text"
          value={saisie}
          maxLength={maxLen}
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ajouter(); }}
          style={st.champ}
        />
        <Btn variant="primary" disabled={desactive || !saisie.trim()} style={st.btn44} onClick={ajouter}>Ajouter</Btn>
      </div>
    </div>
  );
}

// Case à cocher dans un label de 44 px de haut (cible tactile), le texte à
// côté.
export function CaseReglage({ libelle, aide, coche, onChange, desactive = false }) {
  return (
    <label style={st.case}>
      <input type="checkbox" checked={coche} disabled={desactive} onChange={(e) => onChange(e.target.checked)} style={st.caseInput} />
      <span style={st.caseTexte}>
        <span style={st.caseLibelle}>{libelle}</span>
        {aide && <span style={st.caseAide}>{aide}</span>}
      </span>
    </label>
  );
}

// Champ de saisie d'un nombre entier, enregistré à la sortie (ou à Entrée).
export function ChampEntier({ label, valeur, min, max, unite, onValider, desactive = false, largeur = 96 }) {
  const [texte, setTexte] = React.useState(valeur == null ? '' : String(valeur));
  React.useEffect(() => { setTexte(valeur == null ? '' : String(valeur)); }, [valeur]);
  const valider = () => {
    const n = Number(texte.trim());
    if (!Number.isInteger(n) || n < min || n > max) {
      if (texte.trim()) notify(`Un nombre entier entre ${min} et ${max}.`, 'warning');
      setTexte(valeur == null ? '' : String(valeur));
      return;
    }
    if (n !== valeur) onValider(n);
  };
  return (
    <span style={st.nombre}>
      <input
        type="text" inputMode="numeric" value={texte} aria-label={label} disabled={desactive}
        onChange={(e) => setTexte(e.target.value)} onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ ...st.champ, width: largeur, flex: '0 0 auto', textAlign: 'right', fontFamily: 'var(--font-num)' }}
      />
      {unite && <span style={st.unite}>{unite}</span>}
    </span>
  );
}

export const st = {
  note: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  liste: { display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 },
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 'var(--ligne)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', minWidth: 0,
  },
  texte: { fontSize: 'var(--t2)', color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' },
  vide: { margin: '0 0 8px', fontSize: 'var(--t2)', color: 'var(--text2)' },
  ajout: { display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 12, alignItems: 'center' },
  champ: {
    flex: '1 1 200px', minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 12px',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
  },
  btn44: { minHeight: 44, flexShrink: 0 },
  case: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer', minWidth: 0 },
  caseInput: { width: 24, height: 24, margin: 0, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'pointer' },
  caseTexte: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  caseLibelle: { fontSize: 'var(--t2)', color: 'var(--text)' },
  caseAide: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 },
  nombre: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  unite: { fontSize: 'var(--t2)', color: 'var(--text2)' },
};
