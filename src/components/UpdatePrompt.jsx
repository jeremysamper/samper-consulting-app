import { useEffect, useState } from 'react';
import { applyPwaUpdate } from '../pwa/registerPwa.js';

/**
 * UpdatePrompt
 *
 * Fenêtre plein écran « Nouvelle version disponible ». Elle remplace le
 * bandeau fin, que personne en cuisine ne remarquait : les tablettes restaient
 * des jours sur une ancienne version.
 *
 * Toujours sur action de l'utilisateur (registerType 'prompt', pas de
 * rechargement imposé en pleine saisie) : « Plus tard » la referme 10 minutes,
 * puis elle revient, aussi longtemps qu'il le faut. Pendant ce temps le bandeau
 * (OfflineBanner) garde son bouton « Mettre à jour ».
 *
 * Montée par OfflineBanner seulement quand la mise à jour est prête, l'app en
 * ligne et aucune saisie hors-ligne en attente.
 */
const REPORT_MS = 10 * 60 * 1000;
let reporteJusqua = 0; // partagé entre les montages (barre mobile / bureau)

export default function UpdatePrompt() {
  const [visible, setVisible] = useState(() => Date.now() >= reporteJusqua);
  const [enCours, setEnCours] = useState(false);

  // Reportée : réapparaît d'elle-même à l'échéance.
  useEffect(() => {
    if (visible) return undefined;
    const t = setTimeout(() => setVisible(true), Math.max(0, reporteJusqua - Date.now()));
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  function mettreAJour() {
    setEnCours(true);
    applyPwaUpdate();
  }

  function plusTard() {
    reporteJusqua = Date.now() + REPORT_MS;
    setVisible(false);
  }

  return (
    <div style={s.voile} role="alertdialog" aria-modal="true" aria-labelledby="maj-titre" aria-describedby="maj-texte">
      <div style={s.carte}>
        <div style={s.pastille} aria-hidden="true">↻</div>
        <h2 id="maj-titre" style={s.titre}>Nouvelle version disponible</h2>
        <p id="maj-texte" style={s.texte}>
          Mettez l'app à jour pour profiter des dernières corrections. Cela prend quelques secondes ;
          ce qui est déjà enregistré ne se perd pas.
        </p>
        <button type="button" onClick={mettreAJour} disabled={enCours} style={s.principal} autoFocus>
          {enCours ? 'Mise à jour…' : 'Mettre à jour maintenant'}
        </button>
        <button type="button" onClick={plusTard} disabled={enCours} style={s.discret}>
          Plus tard (10 min)
        </button>
      </div>
    </div>
  );
}

const s = {
  voile: {
    position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  carte: {
    width: 'min(440px, 100%)', background: 'var(--surface)', borderRadius: 18,
    border: '1px solid var(--border)', boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
    padding: '30px 26px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', gap: 12, fontFamily: 'var(--font)',
  },
  pastille: {
    width: 64, height: 64, borderRadius: 32, background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 700,
  },
  titre: { margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  texte: { margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--text2)' },
  principal: {
    width: '100%', marginTop: 8, padding: '16px 18px', borderRadius: 12, border: 'none',
    background: 'var(--accent)', color: '#fff', fontSize: 17, fontWeight: 700,
    fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 56,
  },
  discret: {
    padding: '10px 14px', border: 'none', background: 'transparent', color: 'var(--text2)',
    fontSize: 14, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 44,
  },
};
