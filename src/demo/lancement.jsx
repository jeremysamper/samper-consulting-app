// La vraie application, montée sur le Supabase simulé de la démo. Reprend
// src/main.jsx sans le service worker (aucun enregistrement sur /demo), et
// ajoute le bandeau de la démo dans une racine à part.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App.jsx';
import { borneAuLancement } from '../modules/planning/borne/borneAppareil.js';
import BandeauDemo from './BandeauDemo.jsx';
import { installPreloadErrorRecovery } from '../utils/preloadErrorRecovery.js';
import { installDefilementSouris } from '../utils/defilementSouris.js';
import { installerAppui } from '../utils/mouvement.js';
import { installBrandPrintStyles } from '../design/installPrintStyles.js';
import { appliquerPreferences } from '../services/preferencesAppareil.js';
import { appliquerThemeInitial } from '../hooks/useTheme.js';
import '../styles/fonts.css';
import '../styles/app.css';

appliquerThemeInitial();
appliquerPreferences();
installPreloadErrorRecovery();
installBrandPrintStyles();
installDefilementSouris();
installerAppui();

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

const retirerPreSplash = () => {
  const voile = document.getElementById('pre-splash');
  if (!voile) return;
  voile.classList.add('done');
  setTimeout(() => voile.remove(), 400);
};
requestAnimationFrame(() => requestAnimationFrame(retirerPreSplash));
setTimeout(retirerPreSplash, 1500);
