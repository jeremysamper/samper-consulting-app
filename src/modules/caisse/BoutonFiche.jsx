import React from 'react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { nomCourtDefaut } from './boutons.js';
import { ChoixCouleur, ChoixPicto } from './ChoixHabillage.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Habillage d'un bouton produit (consultant, patron, resp_cuisine) : nom
// court, couleur de la palette caisse, picto. Feuille refermable par le geste
// retour et Échap ; un seul Enregistrer (l'habillage n'est pas un geste de
// service, pas besoin d'écritures immédiates). Tout vide = bouton redevenu
// neutre (la ligne d'habillage est retirée).
// ─────────────────────────────────────────────────────────────────────────────

export default function BoutonFiche({ plat, bouton, onEnregistrer, onClose }) {
  const [nomCourt, setNomCourt] = React.useState(bouton?.nom_court || '');
  const [couleur, setCouleur] = React.useState(bouton?.couleur || null);
  const [picto, setPicto] = React.useState(bouton?.picto || null);
  const [enCours, setEnCours] = React.useState(false);

  useBackLayer(true, onClose, 'caisse-bouton-fiche');

  React.useEffect(() => {
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [onClose]);

  if (!plat) return null;

  async function enregistrer() {
    if (enCours) return;
    setEnCours(true);
    try {
      await onEnregistrer({ nomCourt: nomCourt.trim().slice(0, 24), couleur, picto });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div className="modal-sheet" role="region" aria-label="Habillage du bouton" style={st.feuille} onClick={(e) => e.stopPropagation()}>
        <div style={st.enTete}>
          <div style={st.titre} data-no-translate>{plat.nom}</div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>

        <div style={st.rangTitre}>Nom court</div>
        <Input
          value={nomCourt}
          onChange={(e) => setNomCourt(e.target.value.slice(0, 24))}
          placeholder={nomCourtDefaut(plat.nom)}
          style={{ minHeight: 44, width: '100%' }}
        />

        <div style={st.rangTitre}>Couleur</div>
        <ChoixCouleur valeur={couleur} onChange={setCouleur} />

        <div style={st.rangTitre}>Pictogramme</div>
        <ChoixPicto valeur={picto} onChange={setPicto} />

        <div style={st.pied}>
          <Btn variant="primary" onClick={enregistrer} disabled={enCours} style={st.btn44}>Enregistrer</Btn>
        </div>
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200, padding: 16,
  },
  feuille: {
    background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 640, maxWidth: '100%',
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
  },
  enTete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  titre: { fontSize: 18, fontWeight: 500, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2, minWidth: 0 },
  rangTitre: { fontSize: 12, fontWeight: 600, color: 'var(--text3)', margin: '14px 0 6px' },
  pied: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  btn44: { minHeight: 44, flexShrink: 0 },
};
