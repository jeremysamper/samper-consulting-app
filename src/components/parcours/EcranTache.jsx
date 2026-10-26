import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Btn } from '../ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Écran de tâche d'un module : l'en-tête puis l'écran lui-même (enfants).
// En-tête : « Retour » (le geste retour, Échap et ce bouton ramènent à
// l'accueil du module, cf. useEcranModule), titre, ligne d'état, puis les
// actions de l'écran dans une barre .module-actions posée dans le flux,
// jamais flottante. Le retour à l'accueil de l'app reste celui de la coque.
//
//   <EcranTache titre="Je compte" etat={...} onRetour={retourAccueil} actions={<>...</>}>
//     {l'écran : grille, formulaire, liste, tel quel}
//   </EcranTache>
// ─────────────────────────────────────────────────────────────────────────────

export default function EcranTache({ titre, etat, onRetour, actions, children }) {
  return (
    <>
      <div style={st.enTete} className="no-print">
        <div style={st.gauche}>
          <Btn variant="ghost" onClick={onRetour} style={st.retour}>
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Retour</span>
          </Btn>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre}>{titre}</div>
            {etat && <div style={st.etat}>{etat}</div>}
          </div>
        </div>
        {actions && <div className="module-actions">{actions}</div>}
      </div>
      {children}
    </>
  );
}

const st = {
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  gauche: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 260px' },
  // 44 px au toucher comme à la souris : c'est le bouton le plus pressé du module.
  retour: { minHeight: 44, flexShrink: 0 },
  titre: { fontSize: 20, fontWeight: 400, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  etat: { fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
};
