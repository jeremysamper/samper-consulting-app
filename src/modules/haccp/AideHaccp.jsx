import React from 'react';
import { X } from 'lucide-react';
import { readText, writeText } from '../../utils/storage.js';
import { Btn, Encadre, Panneau } from '../../components/ui/index.jsx';
import { AIDE_HACCP_CLE } from './HACCP.constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Aide « Première fois ici ? » : trois phrases pour qui ouvre HACCP sans
// formation. Sous la carte « Maintenant », jamais au-dessus : le gros bouton
// reste visible sans défiler, même à la première visite.
//
// Refermée par « J'ai compris » ou « x », mémorisée par personne et par
// appareil (clé sc_haccp_aide_vue_<id>, valeur '1') ; « Revoir l'aide » en bas
// de l'accueil la rouvre. Crochet du banc : data-haccp-aide.
// Direction Galet : une carte blanche ; le ton info passe du fond au filet et
// au titre de l'encadré (Encadre).
// ─────────────────────────────────────────────────────────────────────────────

export function useAideHaccp(userId) {
  const cle = AIDE_HACCP_CLE + (userId || 'anonyme');
  const [visible, setVisible] = React.useState(() => readText(cle, '') !== '1');
  const fermer = React.useCallback(() => { writeText(cle, '1'); setVisible(false); }, [cle]);
  const revoir = React.useCallback(() => setVisible(true), []);
  return { visible, fermer, revoir };
}

export default function AideHaccp({ onFermer }) {
  return (
    <aside data-haccp-aide="" style={{ minWidth: 0 }}>
      <Panneau style={st.aide}>
        <div style={st.tete}>
          <Encadre ton="info" titre="Première fois ici ?" style={st.encadre}>
            <p style={st.texte}>HACCP, c'est la preuve que la cuisine garde les aliments au bon froid et au bon chaud, et qu'elle est propre.</p>
            <ol style={st.liste}>
              <li>Plusieurs fois par jour, relevez la température des frigos : la carte du haut dit quand et lequel.</li>
              <li>Quand vous mettez une préparation en boîte, imprimez son étiquette avec la date limite.</li>
              <li>Si un chiffre est trop chaud ou trop froid, l'app dit quoi faire. Prévenez toujours le chef.</li>
            </ol>
          </Encadre>
          <button type="button" data-cadre="" aria-label="Fermer l'aide" style={st.fermer} onClick={onFermer}>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div style={st.pied}>
          <Btn variant="ghost" onClick={onFermer} style={st.compris}>J'ai compris</Btn>
        </div>
      </Panneau>
    </aside>
  );
}

const st = {
  aide: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, padding: '12px 12px 12px 18px', color: 'var(--text)' },
  tete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  encadre: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t2)', marginTop: 8 },
  fermer: {
    width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: 22, background: 'transparent', color: 'var(--text2)', cursor: 'pointer',
  },
  texte: { margin: 0, fontSize: 'var(--t2)', lineHeight: 1.4 },
  liste: { margin: 0, paddingLeft: 20, fontSize: 'var(--t2)', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 3 },
  pied: { display: 'flex', justifyContent: 'flex-end' },
  compris: { minHeight: 44, padding: '8px 18px', fontSize: 'var(--t2)' },
};
