// La vraie application, montée sur le Supabase simulé de la démo. Reprend
// src/main.jsx sans le service worker (aucun enregistrement sur /demo), et
// ajoute le bandeau de la démo dans une racine à part.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App.jsx';
import { borneAuLancement } from '../modules/planning/borne/borneAppareil.js';
import BandeauDemo from './BandeauDemo.jsx';
import { TOUR_ACTIF } from './nouveautes/actif.js';
import { RACINE_TOUR, rendreLaCoque } from './nouveautes/voir.js';
import { installPreloadErrorRecovery } from '../utils/preloadErrorRecovery.js';
import { installBrandPrintStyles } from '../design/installPrintStyles.js';
import { appliquerPreferences } from '../services/preferencesAppareil.js';
import { appliquerThemeInitial } from '../hooks/useTheme.js';
import '../styles/fonts.css';
import '../styles/app.css';

if (!TOUR_ACTIF) rendreLaCoque();
appliquerThemeInitial();
appliquerPreferences();
installPreloadErrorRecovery();
installBrandPrintStyles();

class Garde extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    console.error('[Démo]', erreur, info?.componentStack);
  }

  render() {
    if (this.state.erreur) {
      return (
        <main className="migration-page">
          <section className="migration-panel">
            <h1>La démo a rencontré une erreur.</h1>
            <p className="intro">Rechargez la page. Les données de démonstration repartent de zéro avec « Réinitialiser ».</p>
            <button type="button" className="ui-btn ui-btn--primary migration-bouton" onClick={() => window.location.reload()}>Recharger la page</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

// Borne de pointage déclarée dans la démo : son écran, comme dans l'app.
const Borne = React.lazy(() => import('../modules/planning/borne/Borne.jsx'));

createRoot(document.getElementById('root')).render(
  <Garde>
    {borneAuLancement() ? <React.Suspense fallback={null}><Borne /></React.Suspense> : <App />}
  </Garde>
);

const racineBandeau = document.createElement('div');
racineBandeau.id = 'demo-bandeau';
document.body.appendChild(racineBandeau);
createRoot(racineBandeau).render(<BandeauDemo />);

// Tour des nouveautés (?nouveautes=1) : son panneau, dans une racine à part,
// jamais traduit (outil de décision, pas écran de l'app).
if (TOUR_ACTIF) {
  const racineTour = document.createElement('div');
  racineTour.id = RACINE_TOUR;
  racineTour.setAttribute('data-no-translate', '');
  document.body.appendChild(racineTour);
  const Panneau = React.lazy(() => import('./nouveautes/PanneauNouveautes.jsx'));
  createRoot(racineTour).render(<React.Suspense fallback={null}><Panneau /></React.Suspense>);
}

const retirerPreSplash = () => {
  const voile = document.getElementById('pre-splash');
  if (!voile) return;
  voile.classList.add('done');
  setTimeout(() => voile.remove(), 400);
};
requestAnimationFrame(() => requestAnimationFrame(retirerPreSplash));
setTimeout(retirerPreSplash, 1500);
