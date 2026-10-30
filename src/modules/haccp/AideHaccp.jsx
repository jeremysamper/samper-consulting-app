import React from 'react';
import { X } from 'lucide-react';
import { readText, writeText } from '../../utils/storage.js';
import { AIDE_HACCP_CLE } from './HACCP.constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Aide « Première fois ici ? » : trois phrases pour qui ouvre HACCP sans
// formation. Sous la carte « Maintenant », jamais au-dessus : le gros bouton
// reste visible sans défiler, même à la première visite.
//
// Refermée par « J'ai compris » ou « x », mémorisée par personne et par
// appareil (clé sc_haccp_aide_vue_<id>, valeur '1') ; « Revoir l'aide » en bas
// de l'accueil la rouvre. Crochet du banc : data-haccp-aide.
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
    <aside data-haccp-aide="" data-cadre="" style={st.aide}>
      <div style={st.tete}>
        <div style={st.titre}>Première fois ici ?</div>
        <button type="button" data-cadre="" aria-label="Fermer l'aide" style={st.fermer} onClick={onFermer}>
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p style={st.texte}>HACCP, c'est la preuve que la cuisine garde les aliments au bon froid et au bon chaud, et qu'elle est propre.</p>
      <ol style={st.liste}>
        <li>Plusieurs fois par jour, relevez la température des frigos : la carte du haut dit quand et lequel.</li>
        <li>Quand vous mettez une préparation en boîte, imprimez son étiquette avec la date limite.</li>
        <li>Si un chiffre est trop chaud ou trop froid, l'app dit quoi faire. Prévenez toujours le chef.</li>
      </ol>
      <div style={st.pied}>
        <button type="button" data-cadre="" style={st.compris} onClick={onFermer}>J'ai compris</button>
      </div>
    </aside>
  );
}

const st = {
  aide: {
    display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
    padding: '10px 12px 12px 16px', borderRadius: 'var(--r-lg)', background: 'var(--info-bg-soft)', color: 'var(--text)',
  },
  tete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titre: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  fermer: {
    width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: 22, background: 'transparent', color: 'var(--text2)', cursor: 'pointer',
  },
  texte: { margin: 0, fontSize: 13, lineHeight: 1.4 },
  liste: { margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 3 },
  pied: { display: 'flex', justifyContent: 'flex-end' },
  compris: {
    minHeight: 44, padding: '8px 18px', borderRadius: 'var(--r)', border: 'none',
    background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
};
