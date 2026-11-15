import React from 'react';
import { fusionnerPopup } from './indicateurs.js';

// ─────────────────────────────────────────────────────────────────────────────
// Popup « +N points obtenus » (lot P3), à la place du toast de P1 : une petite
// carte flottante en bas au centre, au-dessus des barres du bas, calée sur
// --largeur-menu et les zones sûres. Visible 3 s, se ferme au toucher,
// aria-live polite. Les crédits reçus à moins de 1,5 s d'écart se fondent en
// un seul popup (somme, « N gestes »). Rien pour une annulation, une commande
// ou un remboursement (usePointsRetour ne lui passe que les crédits). Ni son,
// ni vibration.
// ─────────────────────────────────────────────────────────────────────────────

const DUREE_MS = 3000;
const abonnes = new Set();
let courant = null;
let minuteur = null;

function publier(valeur) {
  courant = valeur;
  abonnes.forEach((fn) => { try { fn(valeur); } catch { /* écouteur fautif ignoré */ } });
}

export function fermerPopupPoints() {
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
  publier(null);
}

export function afficherPopupPoints(credit) {
  publier(fusionnerPopup(courant, credit, Date.now()));
  if (minuteur) clearTimeout(minuteur);
  minuteur = setTimeout(fermerPopupPoints, DUREE_MS);
}

// actif : système allumé et personne qui participe ; sinon aucun nœud.
export default function PopupPoints({ actif = false }) {
  const [popup, setPopup] = React.useState(courant);
  React.useEffect(() => {
    abonnes.add(setPopup);
    return () => { abonnes.delete(setPopup); };
  }, []);
  if (!actif) return null;
  return (
    <div aria-live="polite" style={st.zone}>
      {popup && (
        <button type="button" className="points-popup" data-points-popup={popup.points} onClick={fermerPopupPoints} style={st.carte}>
          <span style={st.ligne}>
            <span style={st.rond} data-no-translate>+{popup.points}</span>
            <span style={st.titre}>points obtenus</span>
          </span>
          <span style={st.detail}>
            {popup.gestes > 1
              ? <><span data-no-translate>{popup.gestes}</span> <span>gestes</span></>
              : <span>{popup.libelle}</span>}
          </span>
        </button>
      )}
    </div>
  );
}

const st = {
  // Hors du flux : au-dessus des barres du bas, centré sur la place laissée
  // par le menu de l'ordinateur (--largeur-menu, 0 sur la coque tactile).
  zone: {
    position: 'fixed', zIndex: 1100, pointerEvents: 'none',
    left: 'var(--largeur-menu, 0px)', right: 0,
    bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
    display: 'flex', justifyContent: 'center', padding: '0 16px',
  },
  carte: {
    pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    minHeight: 44, padding: '12px 18px', cursor: 'pointer', fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-lg)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', maxWidth: 'min(360px, 100%)',
  },
  ligne: { display: 'inline-flex', alignItems: 'center', gap: 10 },
  rond: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, height: 32, padding: '0 10px',
    borderRadius: 'var(--r-full)', background: 'var(--success-bg)', color: 'var(--success-text)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--success-bd)',
    fontFamily: 'var(--font-num)', fontSize: 'var(--t3)', fontWeight: 'var(--g2)',
  },
  titre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)' },
  detail: { fontSize: 'var(--t2)', color: 'var(--text2)', overflowWrap: 'anywhere', textAlign: 'center' },
};
