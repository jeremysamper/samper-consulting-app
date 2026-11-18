import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Pièces des sections qui écrivent dans reglages_maison (SectionsMaison.jsx,
// planning/SectionsReglesPlanning.jsx) : l'état de lecture, une rangée de
// pilules à plusieurs choix, un champ nombre enregistré à la sortie.
// ─────────────────────────────────────────────────────────────────────────────

export function EtatMaison({ status }) {
  const texte = status === 'absent'
    ? "Ce réglage n'est pas encore activé sur la base de données."
    : status === 'error' ? 'Les réglages de la maison ne se lisent pas pour le moment. Réessayez dans un instant.' : 'Chargement…';
  return <p style={st.note}>{texte}</p>;
}

// Pilules à plusieurs choix : la classe des pilules de l'app, l'aplat sombre
// pour ce qui est choisi, aria-pressed pour le lecteur d'écran.
export function ChoixMultiple({ label, options, valeurs, onChange, desactive = false }) {
  const bascule = (id) => onChange(valeurs.includes(id) ? valeurs.filter((v) => v !== id) : [...valeurs, id].sort());
  return (
    <div className="segmented-tabs segmented-tabs--retour" role="group" aria-label={label} style={{ maxWidth: '100%' }}>
      {options.map((o) => {
        const choisie = valeurs.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={choisie}
            disabled={desactive}
            className={`segmented-tab${choisie ? ' is-active' : ''}`}
            onClick={() => bascule(o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Champ nombre : enregistré quand on le quitte (ou à Entrée), vide = aucun.
export function ChampNombre({ label, valeur, unite, min, max, onValider }) {
  const [texte, setTexte] = React.useState(valeur == null ? '' : String(valeur));
  React.useEffect(() => { setTexte(valeur == null ? '' : String(valeur)); }, [valeur]);
  const valider = () => {
    const brut = texte.trim().replace(',', '.');
    if (!brut) { if (valeur != null) onValider(null); return; }
    const n = Number(brut);
    if (!Number.isFinite(n) || n < min || n > max) {
      setTexte(valeur == null ? '' : String(valeur));
      return;
    }
    if (n !== valeur) onValider(n);
  };
  return (
    <span style={st.nombre}>
      <input
        type="text"
        inputMode="decimal"
        value={texte}
        aria-label={label}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={st.champ}
      />
      <span style={st.unite}>{unite}</span>
    </span>
  );
}

const st = {
  note: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  nombre: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  champ: {
    width: 120, minHeight: 'var(--controle)', boxSizing: 'border-box', padding: '0 12px', textAlign: 'right',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)',
  },
  unite: { fontSize: 'var(--t2)', color: 'var(--text2)', minWidth: 28 },
};
