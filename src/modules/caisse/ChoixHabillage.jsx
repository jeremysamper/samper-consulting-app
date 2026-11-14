import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { GROUPES_COULEURS, GROUPES_PICTOS, LIBELLES_COULEURS } from './boutons.js';

// ─────────────────────────────────────────────────────────────────────────────
// Choix d'une couleur et d'un picto pour un bouton produit (BoutonFiche) ou
// une categorie (EditeurCategorie des reglages). Palette et pictos ranges par
// famille, un petit titre par famille ; « Aucune » / « Aucun » en tete rend
// le bouton neutre. Cibles de 44 px, la choisie en anneau ou en aplat sombre.
// ─────────────────────────────────────────────────────────────────────────────

export function ChoixCouleur({ valeur, onChange }) {
  return (
    <div style={st.colonne}>
      <div style={st.rang}>
        <Btn variant={valeur == null ? 'primary' : 'ghost'} onClick={() => onChange(null)} style={st.btn44}>Aucune</Btn>
      </div>
      {GROUPES_COULEURS.map((g) => (
        <div key={g.titre} role="group" aria-label={g.titre} style={st.groupe}>
          <div style={st.titreGroupe} aria-hidden="true">{g.titre}</div>
          <div style={st.rang}>
            {g.cles.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={LIBELLES_COULEURS[c]}
                aria-pressed={valeur === c}
                onClick={() => onChange(c)}
                style={{
                  ...st.pastille,
                  background: `var(--caisse-${c})`,
                  borderColor: valeur === c ? 'var(--accent)' : 'var(--border)',
                  borderWidth: valeur === c ? 3 : 1,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChoixPicto({ valeur, onChange }) {
  return (
    <div style={st.colonne}>
      <div style={st.rang}>
        <Btn variant={valeur == null ? 'primary' : 'ghost'} onClick={() => onChange(null)} style={st.btn44}>Aucun</Btn>
      </div>
      {GROUPES_PICTOS.map((g) => (
        <div key={g.titre} role="group" aria-label={g.titre} style={st.groupe}>
          <div style={st.titreGroupe} aria-hidden="true">{g.titre}</div>
          <div style={st.rang}>
            {g.pictos.map((p) => (
              <Btn
                key={p.id}
                variant={valeur === p.id ? 'primary' : 'ghost'}
                onClick={() => onChange(p.id)}
                style={st.picto}
                ariaLabel={p.libelle}
                title={p.libelle}
              >
                <p.Icone size={20} strokeWidth={1.75} aria-hidden="true" />
              </Btn>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const st = {
  colonne: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  groupe: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  titreGroupe: { fontSize: 12, fontWeight: 500, color: 'var(--text3)' },
  rang: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  btn44: { minHeight: 44, flexShrink: 0 },
  // Pastille de couleur : cible 44 px, anneau accent quand elle est choisie.
  pastille: {
    width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', padding: 0, flexShrink: 0,
    borderStyle: 'solid',
  },
  // Bouton a picto seul : un cercle de 44 px.
  picto: { width: 44, minWidth: 44, height: 44, minHeight: 44, padding: 0, flexShrink: 0, justifyContent: 'center' },
};
