import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// En-tête d'un écran du module Inventaire : « Retour » (le geste retour, Échap
// et ce bouton ramènent à l'accueil du module, cf. useBackLayer dans
// Inventaire.jsx), titre, sous-titre, puis les actions de l'écran dans une
// barre .module-actions posée dans le flux, jamais flottante.
// ─────────────────────────────────────────────────────────────────────────────

export default function EnTeteEcran({ titre, sousTitre, onRetour, children }) {
  return (
    <div style={st.enTete} className="no-print">
      <div style={st.gauche}>
        <Btn variant="ghost" onClick={onRetour} style={st.retour}>
          <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Retour</span>
        </Btn>
        <div style={{ minWidth: 0 }}>
          <div style={st.titre}>{titre}</div>
          {sousTitre && <div style={st.sousTitre}>{sousTitre}</div>}
        </div>
      </div>
      {children && <div className="module-actions">{children}</div>}
    </div>
  );
}

const st = {
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  gauche: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 260px' },
  // 44 px au toucher comme à la souris : c'est le bouton le plus pressé du module.
  retour: { minHeight: 44, flexShrink: 0 },
  titre: { fontSize: 20, fontWeight: 400, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
};
