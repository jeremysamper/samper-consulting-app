import React from 'react';
import { ChevronDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ChoixFiltre : une dimension de filtre trop longue pour une rangée de pilules
// (huit motifs de perte, dix-huit catégories de produits) se choisit dans une
// liste déroulante. Une seule pilule à l'écran au lieu de la rangée ; au doigt,
// la liste du système s'ouvre en grand (roue ou feuille sur iPad).
//
// Direction Galet : pilule au contour et au fond du bouton secondaire ; un
// filtre posé (valeur différente de `defaut`) est un choix en cours, donc un
// aplat sombre (--accent, --on-accent). La hauteur vient des règles des champs
// d'app.css (--controle, 44 px au doigt) : rien n'est écrit en pixels ici.
//
// Props :
//   libelle  : nom accessible de la liste (« Motif », « Catégorie »)
//   valeur   : id de l'option choisie
//   options  : [{ id, label }]
//   onChange : (id) => void
//   defaut   : id de l'option « tout » (le filtre n'est pas posé)
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  enveloppe: { position: 'relative', display: 'inline-flex', alignItems: 'center', flex: '0 1 auto', minWidth: 0, maxWidth: '100%' },
  select: {
    appearance: 'none',
    WebkitAppearance: 'none',
    minWidth: 0,
    maxWidth: '100%',
    padding: '0 40px 0 16px',
    borderRadius: 'var(--r-full)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--btn-bord)',
    background: 'var(--btn-fond)',
    color: 'var(--btn-texte)',
    fontFamily: 'var(--font)',
    fontSize: 'var(--t2)',
    fontWeight: 'var(--g2)',
    textOverflow: 'ellipsis',
    cursor: 'pointer',
  },
  actif: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  chevron: { position: 'absolute', right: 14, pointerEvents: 'none' },
};

export default function ChoixFiltre({ libelle, valeur, options, onChange, defaut, style = {} }) {
  const pose = defaut !== undefined && valeur !== defaut;
  return (
    <span style={{ ...styles.enveloppe, ...style }}>
      <select
        aria-label={libelle}
        title={libelle}
        value={valeur}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ ...styles.select, ...(pose ? styles.actif : null) }}
      >
        {(options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" style={{ ...styles.chevron, color: pose ? 'var(--on-accent)' : 'var(--btn-texte)' }} />
    </span>
  );
}
