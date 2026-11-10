import React from 'react';
import { FlaskConical } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Bandeau du mode test (caisse v6) : en tête de tous les écrans de la caisse
// tant que le poste est en mode test, collé en haut pendant le défilement.
// Il se lit sans la couleur : un picto, le mot en capitales, un cadre en
// tirets. La sortie est à un tap.
// Chaque morceau de texte vit dans son propre noeud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

export default function BandeauTest({ onQuitter, enCours = false }) {
  return (
    <div style={st.rail} data-caisse-test="">
      <div style={st.bandeau} role="status">
        <FlaskConical size={22} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={st.texte}>
          <span style={st.titre}>MODE TEST :</span>
          <span style={st.detail}>rien n'est enregistré dans les chiffres</span>
        </span>
        <Btn variant="ghost" onClick={onQuitter} disabled={enCours} style={st.btn}>Quitter le mode test</Btn>
      </div>
    </div>
  );
}

const st = {
  // Le rail porte le fond de la page : le bandeau reste lisible quand le
  // contenu défile dessous.
  rail: { position: 'sticky', top: 0, zIndex: 6, background: 'var(--bg)', paddingBottom: 8, minWidth: 0 },
  bandeau: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', padding: '8px 10px 8px 14px', minWidth: 0,
    background: 'var(--warning-bg-soft)', color: 'var(--warning-text)', borderRadius: 'var(--r-lg)',
    borderWidth: 2, borderStyle: 'dashed', borderColor: 'var(--warning-strong)',
  },
  texte: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 8px', flex: '1 1 220px', minWidth: 0 },
  titre: { fontSize: 16, fontWeight: 700, letterSpacing: '0.04em' },
  detail: { fontSize: 15, fontWeight: 500 },
  btn: { minHeight: 44, flexShrink: 0 },
};
